import asyncio
import json
import time
import uuid
import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from .models import Session, ChatRequest, ActionAck, ActionStage
from .agent import run_agent
from .providers import Provider
from .skills import DESCRIPTIONS, skill_registry
from .memory import MemoryManager
from .verification import VerificationManager
from .observations import ObservationManager

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
sessions: dict[str, tuple[Session, float]] = {}
provider = Provider()
memory = MemoryManager(os.getenv('AGRIVERSE_MEMORY_PATH', str(ROOT / '.runtime/agent.sqlite3')))

@asynccontextmanager
async def lifespan(app):
    yield
    for session, _ in sessions.values():
        for future in session.animations.values():
            if not future.done():
                future.cancel()

app = FastAPI(title='AgriVerse · 茄境智农', lifespan=lifespan, docs_url='/api/docs', openapi_url='/api/openapi.json')

def get_session(sid: str) -> Session:
    item = sessions.get(sid)
    if item is None:
        restored = memory.restore(sid)
        if restored:
            item = (restored, time.monotonic())
    if item is None:
        raise HTTPException(404, '演示会话已失效，请刷新页面。')
    sessions[sid] = (item[0], time.monotonic())
    return item[0]

@app.get('/api/health')
async def health():
    return {'status': 'ok', 'mode': 'REAL_AGENT' if provider.enabled else 'DEMO', 'provider': provider.kind,
            'model': provider.model if provider.enabled else None, 'demo_data': True, 'skills': len(DESCRIPTIONS),
            'decision_source': 'model' if provider.enabled else 'simulation_policy', 'native_tool_calling': provider.enabled}

@app.post('/api/sessions')
async def new_session():
    now = time.monotonic()
    expired = [sid for sid, (s, touched) in sessions.items() if now-touched > 7200 and not s.lock.locked()]
    for sid in expired:
        sessions.pop(sid)
    if len(sessions) >= 100:
        raise HTTPException(503, '演示会话已满，请稍后重试。')
    sid, session = str(uuid.uuid4()), Session()
    session.id, session.memory = sid, memory
    memory.checkpoint(session)
    sessions[sid] = (session, now)
    return {'session_id': sid, 'state': session.world.snapshot(), 'mode': 'REAL_AGENT' if provider.enabled else 'DEMO'}

@app.get('/api/sessions/{sid}')
async def snapshot(sid: str):
    return get_session(sid).world.snapshot()

@app.post('/api/sessions/{sid}/reset')
async def reset(sid: str):
    session = get_session(sid)
    if session.lock.locked():
        raise HTTPException(409, '任务执行中，请等待完成后重置。')
    replacement = Session(id=sid, memory=memory)
    replacement.missions = session.missions
    if session.mission and session.mission.status in ('waiting_approval', 'waiting_selection'):
        session.mission.status = 'cancelled'
    memory.checkpoint(replacement)
    sessions[sid] = (replacement, time.monotonic())
    return replacement.world.snapshot()

@app.post('/api/sessions/{sid}/actions/{action_id}/stage')
async def action_stage(sid: str, action_id: str, stage: ActionStage):
    session = get_session(sid)
    context = session.action_contexts.get(action_id)
    future = session.animations.get(action_id)
    if not context or not future or future.done():
        raise HTTPException(409, '动作已结束或不存在。')
    stages = context['stages']
    if stage.index >= len(stages) or stage.progress < stages[stage.index]['start']:
        raise HTTPException(422, '动作阶段与动画进度不符。')
    if stage.index <= context['last_index']:
        return {'accepted': True, 'duplicate': True}
    previous = context['last_index']
    if previous >= 0:
        await context['emit']({'type': 'action_stage', 'action_id': action_id, 'phase': 'execution',
                              'target_id': context['target'], 'stage': stages[previous]['key'], 'status': 'completed',
                              'message': stages[previous]['label'], 'progress': stage.progress, 'source': 'scene'})
    context['last_index'] = stage.index
    await context['emit']({'type': 'action_stage', 'action_id': action_id, 'phase': 'execution',
                          'target_id': context['target'], 'stage': stages[stage.index]['key'], 'status': 'started',
                          'message': stages[stage.index]['label'], 'progress': stage.progress, 'source': 'scene'})
    return {'accepted': True}


@app.post('/api/sessions/{sid}/actions/{action_id}/ack')
async def acknowledge(sid: str, action_id: str, ack: ActionAck):
    session = get_session(sid)
    future = session.animations.get(action_id)
    if future is None or future.done():
        raise HTTPException(409, '动作已结束或不存在。')
    context = session.action_contexts.get(action_id)
    verdict = VerificationManager.verify(context['kind'] if context else 'harvest', ack.success, ack.evidence, len(session.world.collected))
    if ack.success and verdict.outcome == 'FAILED':
        future.set_result(False)
        raise HTTPException(409, '场景结果验证失败，拒绝提交。')
    if ack.success and verdict.task_verified:
        session.action_receipts[action_id] = ack.evidence
    if context and context['last_index'] >= 0:
        current = context['stages'][context['last_index']]
        await context['emit']({'type': 'action_stage', 'phase': 'execution', 'action_id': action_id,
                              'target_id': context['target'], 'stage': current['key'],
                              'status': 'completed' if ack.success else 'failed', 'progress': 1 if ack.success else None,
                              'message': current['label'], 'source': 'scene'})
    future.set_result(ack.success)
    return {'accepted': True, 'verification': verdict.model_dump()}


@app.get('/api/skills')
async def skills():
    return skill_registry()


@app.get('/api/sessions/{sid}/missions')
async def missions(sid: str):
    session = get_session(sid)
    return {'current_mission_id': session.mission.id if session.mission else None,
            'missions': [m.model_dump(exclude={'observation', 'results'}) for m in session.missions.values()],
            'pending': session.pending}


@app.get('/api/sessions/{sid}/observations/latest')
async def latest_observation(sid: str):
    return ObservationManager(get_session(sid)).current()


@app.get('/api/sessions/{sid}/missions/{mission_id}')
async def mission(sid: str, mission_id: str):
    session = get_session(sid)
    if mission_id not in session.missions:
        raise HTTPException(404, '任务不存在。')
    return session.missions[mission_id].model_dump()


@app.get('/api/sessions/{sid}/events')
async def events(sid: str, after: int = 0, mission_id: str | None = None):
    get_session(sid)
    return {'events': memory.events(sid, mission_id, max(0, after))}

@app.post('/api/sessions/{sid}/chat')
async def chat(sid: str, body: ChatRequest):
    session = get_session(sid)
    if body.mission_id and body.mission_id not in session.missions:
        raise HTTPException(404, '要恢复的任务不存在。')
    if body.mission_id and session.missions[body.mission_id].role != body.role:
        raise HTTPException(403, '不能恢复其他角色的任务。')
    if session.lock.locked():
        raise HTTPException(409, '已有任务执行中，请等待完成。')
    await session.lock.acquire()
    queue: asyncio.Queue = asyncio.Queue()
    async def work():
        try:
            await run_agent(session, body, queue.put, provider)
        except asyncio.CancelledError:
            raise
        except Exception:
            # Never send provider response bodies (which may include sensitive context) to the browser.
            await queue.put({'type': 'error', 'text': '任务执行失败。若使用模型连接模式，请检查后端的服务地址、模型与密钥配置；演示状态已保留。'})
        finally:
            # The worker owns the lock. ASGI cancellation can interrupt the stream's
            # await(gather) cleanup; releasing there leaks the session lock on disconnect.
            queue.put_nowait({'type': 'done'})
            session.lock.release()
    async def stream():
        task = asyncio.create_task(work())
        try:
            while True:
                event = await queue.get()
                yield json.dumps(event, ensure_ascii=False) + '\n'
                if event['type'] == 'done':
                    break
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    return StreamingResponse(stream(), media_type='application/x-ndjson', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

# A production build can also be served from FastAPI on a single local port.
if (ROOT / 'dist').exists():
    app.mount('/assets', StaticFiles(directory=ROOT / 'dist/assets'), name='assets')
    @app.get('/favicon.svg')
    async def favicon():
        return FileResponse(ROOT / 'dist/favicon.svg')
    @app.get('/')
    async def frontend():
        return FileResponse(ROOT / 'dist/index.html')
