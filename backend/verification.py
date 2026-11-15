"""Independent simulator evidence verification; a received command is not a verified task."""
import asyncio
import math
from typing import Literal, Protocol
from pydantic import BaseModel


class VerificationResult(BaseModel):
    outcome: Literal['SUCCESS', 'FAILED', 'UNCERTAIN']
    command_received: bool = True
    execution_completed: bool = False
    task_verified: bool = False
    reason: str
    evidence: dict | None = None
    source: str = 'simulation'


class VerificationFailure(ValueError):
    def __init__(self, verdict: VerificationResult):
        super().__init__(verdict.reason)
        self.verdict = verdict.model_dump()


class VerificationManager:
    @staticmethod
    def verify(kind, success, evidence, basket_count):
        if not success:
            return VerificationResult(outcome='FAILED', reason='执行端报告动作失败。')
        if not evidence or evidence.get('legacy_ack'):
            return VerificationResult(outcome='UNCERTAIN', execution_completed=True, reason='动作完成但缺少场景结果证据，禁止提交。')
        valid = evidence.get('verified') is True
        if kind == 'harvest':
            expected = [1.48 + (basket_count % 2)*.4, .38, 1.18 + (basket_count//2)*.32]
            point = evidence.get('position')
            error = evidence.get('max_grip_error')
            valid = valid and isinstance(evidence.get('fruit_uuid'), str) and bool(evidence.get('fruit_uuid')) and evidence.get('fruit_uuid') == evidence.get('original_uuid')
            valid = valid and isinstance(point, list) and len(point) == 3 and all(type(v) in (int, float) and math.isfinite(v) for v in point)
            valid = valid and type(error) in (int, float) and math.isfinite(error) and 0 <= error < .08
            valid = valid and math.dist(point, expected) < .035
        else:
            valid = valid and evidence.get('region_visible') is True and evidence.get('leaf_moved') is True
        return VerificationResult(outcome='SUCCESS' if valid else 'FAILED', execution_completed=True,
                                  task_verified=bool(valid), evidence=evidence,
                                  reason='仿真场景证据符合预期。' if valid else '场景结果与预期不符，拒绝提交。')


class RobotAdapter(Protocol):
    async def execute(self, session, action, context, emit) -> VerificationResult: ...


class SimulationRobotAdapter:
    """Uses the existing action UUID / NDJSON / SceneMotion / ack transport."""
    async def execute(self, session, action, context, emit):
        aid = action['id']
        future = asyncio.get_running_loop().create_future()
        session.animations[aid] = future
        session.action_contexts[aid] = {**context, 'emit': emit, 'last_index': -1}
        try:
            await emit(action)
            success = await asyncio.wait_for(future, timeout=35)
            receipt = session.action_receipts.pop(aid, None)
            return VerificationManager.verify(context['kind'], success, receipt, len(session.world.collected))
        except asyncio.TimeoutError:
            raise TimeoutError('等待三维动画超时，果实状态未改变。')
        finally:
            if not future.done():
                future.cancel()
            session.animations.pop(aid, None)
            session.action_contexts.pop(aid, None)
            session.action_receipts.pop(aid, None)
