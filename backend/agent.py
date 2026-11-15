"""Bounded mission loop. Confirmation resumes the SAME loop, including the real Provider."""
import asyncio
import json
import time
from .models import ChatRequest, Session, Mission
from .providers import Provider
from .execution import ExecutionRun
from .roles import BASE_PROMPT, ROLES
from .skills import SkillRunner, tool_definitions
from .missions import MissionPlanner
from .observations import ObservationManager, harvestable
from .simulation import SimulationPolicy

MAX_TURNS = 48
MAX_TOOL_CALLS = 64
TIME_BUDGET = 180
MAX_IDENTICAL_FAILURES = 2


def completion(session, authorization):
    """A model final answer never grants business success."""
    mission, world = session.mission, session.world
    if session.pending:
        return 'waiting_approval'
    if world.learning == 'select' and mission.role == 'student':
        return 'waiting_selection'
    if mission.status in ('uncertain', 'cancelled'):
        return mission.status
    if authorization:
        if authorization['kind'] == 'reveal' and not world.revealed:
            return 'failed'
        eligible = {f['fruit_id'] for f in world.fruits if harvestable(f)}
        if authorization['kind'] == 'harvest' and eligible.intersection(authorization['targets']):
            return 'uncertain'
        if authorization['kind'] == 'harvest' and not any(t in world.collected for t in authorization['targets']):
            return 'failed'
    # Only an unresolved last failure prevents success; a later verified recovery can succeed.
    if mission.results and mission.results[-1]['result'].get('error'):
        return 'failed'
    return 'success'


async def _run_agent(session, request, emit, provider):
    authorization = None
    if request.confirmation_id:
        pending = session.pending
        if not pending or pending['id'] != request.confirmation_id or pending['role'] != request.role:
            raise ValueError('此确认已过期或属于其他角色，请重新生成操作计划。')
        authorization = MissionPlanner.approve(session, pending, request.role)
        session.pending = None
    runner = SkillRunner(session, request.role, emit, authorization)
    history = session.history[request.role]
    history.append({'role': 'user', 'content': request.message +
                    (f'\n学生选择 {request.selected_id}，请通过评价工具检查。' if request.selected_id else '') +
                    ('\n已恢复原任务授权；请读取最新观察，自主选择下一步，不必按清单顺序执行。' if authorization else '')})
    manager = ObservationManager(session)
    offline = SimulationPolicy()
    invocation_results = []
    deadline = time.monotonic() + TIME_BUDGET
    mission = session.mission
    mission.status = 'running'
    for _ in range(MAX_TURNS):
        if time.monotonic() >= deadline or mission.tool_calls >= MAX_TOOL_CALLS:
            raise TimeoutError('任务达到时间或工具调用预算，停止执行，请人工检查后继续。')
        observation = manager.current()
        await emit({'type': 'observation', 'phase': 'observation', 'status': 'completed',
                    'message': '重新读取模拟世界状态，供本轮决策使用。',
                    'result': {'observation_id': observation['observation_id'], 'summary': observation['summary'],
                               'world_revision': observation['world_revision'], 'source': 'simulation', 'is_simulated': True}})
        context = {'mission': mission.model_dump(exclude={'observation', 'results', 'tool_receipts'}), 'world': session.world.snapshot(),
                   'observation': {**observation, 'entities': [e for e in observation['entities'] if e['type'] != 'Leaflet']}, 'authorization': authorization, 'request': request.model_dump(),
                   'invocation_results': invocation_results}
        # Rebuild on EVERY model turn, including immediately after robot verification and commit.
        instructions = (BASE_PROMPT + '\n' + ROLES[request.role]['prompt'] +
                        '\n每次动作后重新观察并自主决定下一工具；update_fruit_status 是内部接口，不可调用。'
                        '\n授权只限定范围，目标变动或版本不一致时重新请求确认。工具失败可有限恢复；不确定时请求人工处理。'
                        '\n只有后端 task_verified 和业务提交才能视为成功；不能以自然语言声明替代验证。'
                        '\n当前任务、最新观察与世界：' + json.dumps({k: v for k, v in context.items() if k != 'invocation_results'}, ensure_ascii=False))
        mission.turns += 1
        if provider.enabled:
            async with asyncio.timeout(max(.01, deadline-time.monotonic())):
                response = await provider.turn(instructions, history, tool_definitions(request.role))
        else:
            response = offline.decide(context)
        history.extend(response['history_items'])
        calls = response['calls']
        if not calls:
            mission.status = completion(session, authorization)
            if mission.status == 'success' and request.role == 'student' and authorization and session.world.collected:
                session.world.learning = 'complete'
                session.world.refresh_revision()
                await emit({'type': 'state', 'state': session.world.snapshot()})
            # Successful-sounding model text is suppressed if the independent completion check fails.
            await emit({'type': 'message', 'text': response['text'] if mission.status in ('success', 'waiting_selection') else '动作中止：' + (mission.last_error or '任务尚未验证完成，请检查执行结果并重新观察。')})
            return
        pause = False
        for index, call in enumerate(calls):
            mission.tool_calls += 1
            if mission.tool_calls > MAX_TOOL_CALLS:
                raise ValueError('工具调用预算已耗尽。')
            routed, args = False, {}
            try:
                args = json.loads(call['arguments'])
                if not isinstance(args, dict):
                    raise ValueError('工具参数必须是对象。')
                key = call['name'] + ':' + json.dumps(args, sort_keys=True)
                cached = mission.tool_receipts.get(call['call_id'])
                if pause or index > 0:
                    result = {'error': '每轮只执行一个工具；请等待返回结果或人工输入后重新决策。'}
                elif cached:
                    result = ({**cached['result'], 'idempotent_replay': True}
                              if cached['name'] == call['name'] and cached['args'] == args else
                              {'error': '重复调用 ID 的参数发生变化，拒绝执行。'})
                elif mission.attempts.get(key, 0) >= MAX_IDENTICAL_FAILURES:
                    result = {'error': '相同调用已连续失败，需改变观察方式或请求人工处理。'}
                else:
                    target_fact = next((e for e in observation['entities'] if e['id'] == args.get('target_id')), None)
                    await emit({'type': 'decision', 'phase': 'decision', 'status': 'completed',
                                'tool_name': call['name'], 'target_id': args.get('target_id'),
                                'message': response['text'][:500] or (('模型选择工具：' if provider.enabled else '模拟规则选择工具：') + call['name']),
                                'evidence': {'observation_id': observation['observation_id'],
                                             'world_revision': observation['world_revision'], 'target': target_fact},
                                'source': 'model_tool_call' if provider.enabled else 'simulation_policy', 'args': args})
                    async with asyncio.timeout(max(.01, deadline-time.monotonic())):
                        result = await runner.run(call['name'], args)
                    routed = True
                    mission.tool_receipts[call['call_id']] = {'name': call['name'], 'args': args, 'result': result}
                    mission.attempts[key] = mission.attempts.get(key, 0)+1 if result.get('error') else 0
                invocation_results.append({'tool_name': call['name'], 'args': args, 'result': result})
                if result.get('task_verified'):
                    # Mandatory re-observation before another side effect, even when a provider returns multiple calls.
                    observation = manager.current()
                    await emit({'type': 'observation', 'phase': 'observation', 'status': 'completed',
                                'target_id': args.get('target_id'), 'message': '执行结果已提交，重新观察以决定下一步。',
                                'result': observation})
            except (ValueError, TypeError, KeyError):
                args = {}
                result = {'error': '工具参数无法解析，未执行操作。', 'code': 'invalid_tool_arguments'}
            if not routed:
                MissionPlanner.record(session, call['name'], args, result)
                await emit({'type': 'tool_call', 'phase': 'tool', 'tool_name': call['name'],
                            'call_id': call['call_id'], 'target_id': args.get('target_id'),
                            'status': 'failed' if result.get('error') else 'completed',
                            'message': result.get('error', '重复调用，返回已有结果；未重新执行。'),
                            'args': args, 'result': result, 'source': 'tool_router'})
            history.append(provider.tool_result(call['call_id'], json.dumps(result, ensure_ascii=False)) if provider.enabled else
                           {'type': 'function_call_output', 'call_id': call['call_id'], 'output': json.dumps(result, ensure_ascii=False)})
            pause = pause or bool(result.get('awaiting_confirmation') or result.get('awaiting_selection') or session.pending)
        if pause:
            mission.status = 'waiting_approval' if session.pending else 'waiting_selection'
            await emit({'type': 'message', 'text': ('【模拟规则 Agent】' if not provider.enabled else '') +
                        ('请核对操作卡，确认后恢复任务并根据最新状态决策。' if session.pending else '请在场景中选择一颗果实，再提交答案。')})
            return
    raise ValueError('已达到本次模型循环上限，任务未宣布成功。')


async def run_agent(session: Session, request: ChatRequest, emit, provider: Provider) -> None:
    if request.mission_id and request.mission_id in session.missions:
        candidate = session.missions[request.mission_id]
        if candidate.role != request.role:
            raise ValueError('不能恢复其他角色的任务。')
        session.mission = candidate
        session.pending = None
        if candidate.plan:
            candidate.plan.approved = False
        candidate.status = 'queued'
        candidate.last_error = None
        candidate.tool_calls = 0
        candidate.attempts.clear()
    resume = bool(request.mission_id or request.confirmation_id or (request.selected_id and session.mission and session.mission.role == request.role))
    if not resume:
        if session.mission and session.mission.status in ('waiting_approval', 'waiting_selection'):
            session.mission.status = 'cancelled'
        session.pending = None
        session.mission = Mission(role=request.role, goal=request.message, mode='model' if provider.enabled else 'simulation_policy')
        session.missions[session.mission.id] = session.mission
    if not session.mission:
        session.mission = Mission(role=request.role, goal=request.message, mode='model' if provider.enabled else 'simulation_policy')
        session.missions[session.mission.id] = session.mission
    run = ExecutionRun(emit, session)
    before = set(session.world.collected)
    await run.emit({'type': 'run_started', 'phase': 'task', 'status': 'started', 'message': request.message,
                    'source': 'model' if provider.enabled else 'simulation_policy'})
    try:
        await _run_agent(session, request, run.emit, provider)
    except asyncio.CancelledError:
        session.mission.status = 'cancelled'
        session.mission.last_error = '执行连接中断，动作未自动重放；已提交的结果保留。'
        await run.emit({'type': 'run_failed', 'phase': 'task', 'status': 'failed', 'message': session.mission.last_error})
        raise
    except (ValueError, TimeoutError) as error:
        session.mission.status = 'failed'
        session.mission.last_error = str(error)
        await run.emit({'type': 'message', 'text': str(error)})
    except Exception:
        session.mission.status = 'failed'
        session.mission.last_error = '模型或任务执行失败，未切换为模拟决策；请检查服务配置后重试。'
        await run.emit({'type': 'run_failed', 'phase': 'task', 'status': 'failed', 'message': session.mission.last_error})
        raise
    finally:
        if session.memory:
            session.memory.checkpoint(session)
    mission = session.mission
    if mission.status in ('failed', 'uncertain', 'cancelled'):
        await run.emit({'type': 'run_failed', 'phase': 'task', 'status': 'failed', 'message': mission.last_error or '任务未通过完成验证，需要重新观察或人工介入。', 'result': {'mission_status': mission.status}})
    else:
        collected = [f for f in session.world.collected if f not in before]
        remaining = [{'target_id': f['fruit_id'], 'status': f['status'], 'ripeness_stage': f['ripeness_stage'],
                      'occluded': f['occluded'], 'harvestable': f['harvestable']} for f in session.world.fruits if f['status'] != 'harvested']
        waiting = mission.status in ('waiting_approval', 'waiting_selection')
        await run.emit({'type': 'run_completed', 'phase': 'task', 'status': 'completed',
                        'message': '等待用户确认或选择。' if waiting else (f'本次验证采摘 {len(collected)} 颗：' + '、'.join(collected) if collected else '本轮查询与观察已完成。'),
                        'result': {'collected': collected, 'remaining': remaining, 'basket_count': len(session.world.collected),
                                   'awaiting_input': waiting, 'mission_status': mission.status}})
