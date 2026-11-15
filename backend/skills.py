"""Executable skill registry. Both deterministic and model providers use this runner."""
import asyncio
import uuid
from copy import deepcopy
from typing import Awaitable, Callable
from pydantic import BaseModel, ConfigDict, Field
from .models import Session, load
from .roles import ROLES
from .execution import now
from .observations import ObservationManager, harvestable
from .missions import MissionPlanner, SafetyManager
from .verification import SimulationRobotAdapter, VerificationFailure

class SkillArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    plant_id: str | None = None
    target_id: str | None = None
    target_ids: list[str] | None = None
    action_type: str | None = None
    query: str | None = None
    part: str | None = None
    days: int | None = Field(default=None, ge=1, le=7)

DESCRIPTIONS = {
    'inspect_greenhouse': '巡检演示温室，获取植株、果实及当前状态',
    'identify_tomatoes': '读取六颗番茄的成熟度、遮挡与采摘状态',
    'select_harvest_targets': '筛选可采摘且未采摘果实，排除遮挡与暂缓对象',
    'get_harvest_plan': '为 target_ids 生成采摘清单并请求用户确认；返回后必须等待',
    'play_robot_action': '播放 harvest 或 reveal 动作；必须已有用户确认授权',
    'update_fruit_status': '内部验证提交接口，不向模型开放',
    'search_agri_knowledge': '用 query 检索本地农业知识',
    'generate_farm_report': '基于已采摘结果生成生产管理报告',
    'query_crop_status': '查询作物与采摘统计',
    'query_environment_history': '查询 days 天预置环境历史（1-7 天），不是实时数据',
    'explain_plant_part': '解释并高亮 part：叶片、茎秆、花序、果实',
    'explain_ripeness_stage': '解释绿熟、转色、红熟阶段',
    'generate_learning_task': '发起果实选择挑战，等待学生点击选择',
    'evaluate_student_answer': '评价学生选中的 target_id，正确则生成确认卡',
    'inspect_plant_health': '定位 plant_id 的预置模拟异常，检查遮挡',
    'reveal_occluded_area': '请求拨开 LEAF_01 遮挡的确认；返回后必须等待',
    'query_growth_stage': '查询 P01 生长阶段及品种',
    'query_inspection_records': '读取预置历史巡检与管理记录',
    'generate_expert_summary': '分别整理模拟观察事实、历史、辅助判断与待核实问题',
}

PARAMETERS = {
    'get_harvest_plan': ['target_ids'], 'play_robot_action': ['action_type', 'target_id'],
    'update_fruit_status': ['target_id'], 'search_agri_knowledge': ['query'],
    'query_environment_history': ['days'], 'explain_plant_part': ['part'],
    'evaluate_student_answer': ['target_id'], 'inspect_plant_health': ['plant_id'],
    'query_growth_stage': ['plant_id'], 'query_inspection_records': ['plant_id'],
}

LABELS = dict(zip(DESCRIPTIONS, [
    '巡检温室场景', '读取果实成熟度与状态', '筛选可采摘目标', '生成待确认的采摘计划',
    '执行机械臂动画', '更新果实与收集箱', '检索农业知识库', '生成生产管理报告',
    '查询作物生长状态', '读取预置环境历史', '认识植物部位', '讲解成熟阶段',
    '发起果实选择挑战', '评价你的果实选择', '定位预置模拟异常', '生成拨叶观察计划',
    '查询当前生长阶段', '读取历史巡检记录', '生成专家辅助会诊摘要',
]))

def skill_registry() -> dict:
    props = SkillArgs.model_json_schema()['properties']
    observation = {'inspect_greenhouse', 'identify_tomatoes', 'inspect_plant_health', 'query_crop_status',
                   'query_environment_history', 'query_growth_stage', 'query_inspection_records'}
    planning = {'select_harvest_targets', 'get_harvest_plan', 'reveal_occluded_area'}
    education = {'explain_plant_part', 'explain_ripeness_stage', 'generate_learning_task', 'evaluate_student_answer'}
    registry = {}
    for name, desc in DESCRIPTIONS.items():
        effect = name in {'play_robot_action', 'update_fruit_status'}
        category = ('Observation' if name in observation else 'Planning' if name in planning else
                    'Education' if name in education else 'Verification' if name == 'update_fruit_status' else
                    'Manipulation' if effect else 'Reporting' if name.startswith('generate_') else 'Agronomy')
        registry[name] = {'name': name, 'description': desc,
                         'parameters_schema': {'type': 'object', 'properties': {k: props[k] for k in PARAMETERS.get(name, [])},
                                               'required': PARAMETERS.get(name, []), 'additionalProperties': False},
                         'required_role': [r for r, spec in ROLES.items() if name in spec['tools']],
                         'category': category, 'side_effect': effect or name in planning or name in education or name.startswith('generate_'),
                         'risk_level': 'simulated_manipulation' if effect else 'low', 'requires_approval': effect,
                         'timeout': 35 if effect else 5, 'idempotency': 'verified_action_uuid' if effect else 'read_or_mission',
                         'preconditions': ['role', 'authorized_plan', 'world_revision', 'target_valid'] if effect else ['role', 'schema'],
                         'postconditions': ['scene_verified', 'business_committed'] if effect else ['structured_result'],
                         'execution_adapter': 'simulation' if effect or name in observation else 'local',
                         'internal_only': name == 'update_fruit_status'}
    return registry


def tool_definitions(role: str) -> list[dict]:
    props = SkillArgs.model_json_schema()['properties']
    return [{'type': 'function', 'name': name, 'description': desc, 'strict': True,
             'parameters': {'type': 'object', 'properties': {k: props[k] for k in PARAMETERS.get(name, [])},
                            'required': PARAMETERS.get(name, []), 'additionalProperties': False}}
            for name, desc in DESCRIPTIONS.items() if name in ROLES[role]['tools'] and name != 'update_fruit_status']

class SkillRunner:
    def __init__(self, session: Session, role: str, emit: Callable[[dict], Awaitable[None]], authorized: dict | None = None):
        self.session, self.world, self.role, self.emit = session, session.world, role, emit
        self.authorized = authorized
        self.observations = ObservationManager(session)
        self.robot = SimulationRobotAdapter()
        self._committing = False
        self.handlers = {name: getattr(self, name) for name in DESCRIPTIONS}

    def fruit(self, target: str | None) -> dict:
        found = next((f for f in self.world.fruits if f['fruit_id'] == target), None)
        if found is None:
            raise ValueError('没有找到该果实，请选择 T01–T06。')
        return found

    def eligible(self) -> list[dict]:
        return [f for f in self.world.fruits if harvestable(f)]

    async def request_confirmation(self, kind: str, targets: list[str]) -> dict:
        plan = MissionPlanner.propose(self.session, self.role, kind, targets)
        pending = {'id': str(uuid.uuid4()), 'kind': kind, 'targets': targets, 'role': self.role,
                   'plan_id': plan.id, 'plan_version': plan.plan_version, 'world_revision': plan.world_revision,
                   'mission_id': self.session.mission.id if self.session.mission else None}
        self.session.pending = pending
        await self.emit({'type': 'confirmation', **pending})
        return {'awaiting_confirmation': True, **pending}

    async def run(self, name: str, raw: dict | None = None) -> dict:
        call_id = str(uuid.uuid4())
        args = raw or {}
        event = {'type': 'tool', 'id': call_id, 'name': name, 'label': LABELS.get(name, name), 'args': args, 'started_at': now()}
        await self.emit({**event, 'status': 'queued'})
        await self.emit({**event, 'status': 'running'})
        try:
            if name == 'update_fruit_status':
                raise ValueError('内部提交接口不能通过 Tool Calling 调用，必须由验证器提交。')
            if name not in ROLES[self.role]['tools']:
                raise ValueError('当前角色没有此技能，请切换角色后重试。')
            parsed = SkillArgs.model_validate(args)
            allowed = set(PARAMETERS.get(name, []))
            if set(args) - allowed:
                raise ValueError('技能参数不适用于该工具。')
            if parsed.plant_id not in (None, 'P01'):
                raise ValueError('当前演示仅有植株 P01。')
            async with asyncio.timeout(skill_registry()[name]['timeout']):
                result = await self.handlers[name](parsed)
            self.world.refresh_revision()
            result = deepcopy({**result, 'world_revision': self.world.revision,
                               'source': 'simulation', 'is_simulated': True})
            MissionPlanner.record(self.session, name, args, result)
            if name in ('identify_tomatoes', 'inspect_greenhouse', 'inspect_plant_health', 'query_crop_status'):
                await self.emit({'type': 'observation', 'phase': 'observation', 'tool_name': name,
                                 'target_id': args.get('plant_id'), 'status': 'completed',
                                 'message': result['observation'] if isinstance(result.get('observation'), str) else '已读取当前模拟场景状态，非传感器识别。', 'result': result})
            if name in ('select_harvest_targets', 'get_harvest_plan', 'reveal_occluded_area'):
                await self.emit({'type': 'decision', 'phase': 'decision', 'tool_name': name, 'status': 'completed',
                                 'message': '依据当前可采摘、遮挡和已采状态筛选；操作须经确认。', 'result': result})
            await self.emit({'type': 'state', 'state': self.world.snapshot()})
            if name == 'update_fruit_status':
                f = self.fruit(parsed.target_id)
                verified = f['status'] == 'harvested' and f['fruit_id'] in self.world.collected
                if not verified:
                    raise ValueError('后端采摘结果验证失败。')
                await self.emit({'type': 'verification', 'phase': 'verification', 'target_id': f['fruit_id'],
                                 'status': 'completed', 'message': f"{f['fruit_id']} 原果实入箱已回执，后端已提交；收集箱 {len(self.world.collected)} 颗。",
                                 'result': result})
            await self.emit({**event, 'status': 'success', 'result': result, 'finished_at': now()})
            return result
        except Exception as error:
            result = {'error': (str(error) or '技能执行超时，结果未提交。') if isinstance(error, (ValueError, TimeoutError)) else '技能执行失败，请重试。',
                      'code': 'verification_rejected' if isinstance(error, VerificationFailure) else 'skill_execution_error',
                      'error_type': type(error).__name__}
            if isinstance(error, VerificationFailure):
                result['verification'] = error.verdict
            MissionPlanner.record(self.session, name, args, result)
            await self.emit({**event, 'status': 'failed', 'result': result, 'finished_at': now()})
            return result

    async def inspect_greenhouse(self, a: SkillArgs) -> dict:
        w = self.world
        return {'greenhouse': '01 · 番茄生长舱', 'plants': len(w.plants), 'fruit_count': len(w.fruits), 'demo_data': True, 'observation': self.observations.current()}

    async def identify_tomatoes(self, a: SkillArgs) -> dict:
        w = self.world
        return {'fruits': self.world.snapshot()['fruits'], 'observation': self.observations.current()}

    async def select_harvest_targets(self, a: SkillArgs) -> dict:
        w = self.world
        return {'target_ids': [f['fruit_id'] for f in self.eligible()], 'deferred': [f['fruit_id'] for f in w.fruits if f['status'] == 'on_plant' and f not in self.eligible()]}

    async def get_harvest_plan(self, a: SkillArgs) -> dict:
        w = self.world
        targets = a.target_ids if a.target_ids is not None else [f['fruit_id'] for f in self.eligible()]
        valid = {f['fruit_id'] for f in self.eligible()}
        if not targets:
            return {'targets': [], 'message': '当前没有可采摘果实。'}
        if len(targets) != len(set(targets)) or any(t not in valid for t in targets):
            raise ValueError('计划包含重复、未成熟、遮挡或已经采摘的果实。')
        return await self.request_confirmation('harvest', targets)

    async def play_robot_action(self, a: SkillArgs) -> dict:
        w = self.world
        kind, target = a.action_type, a.target_id
        if kind not in ('harvest', 'reveal'):
            raise ValueError('不支持的机械臂动作。')
        SafetyManager.validate_action(self.session, self.role, self.authorized, kind, target)
        structure = load('plant_structure')
        mapping = structure['reveal']
        approach = [0.12, 0.13, 0.35]
        leaf_id, truss_id = None, None
        affected_leaf_ids = mapping['affected_leaf_ids']
        if kind == 'harvest':
            fruit = self.fruit(target)
            if fruit not in self.eligible():
                raise ValueError('该果实当前不可采摘。')
            position = fruit['position']
            motion = next(item for item in load('harvest_actions') if item['action_id'] == fruit['action_id'])
            approach = motion['approach_offset']
            truss = next(item for item in structure['trusses'] if target in item['fruit_ids'])
            truss_id = truss['truss_id']
            affected_leaf_ids = truss['nearby_leaf_ids']
        else:
            if w.revealed:
                return {'action_type': kind, 'target_id': target, 'already_revealed': True}
            leaf_id = mapping['occluding_leaf_id']
            position = mapping['contact_position']
        if kind == 'harvest':
            await self.emit({'type': 'observation', 'phase': 'observation', 'status': 'completed', 'target_id': target,
                             'message': f"正在检查 {target}，成熟度 {round(fruit['ripeness_score'] * 100)}%，满足采摘条件。",
                             'result': {'position': position, 'ripeness_score': fruit['ripeness_score'], 'occluded': fruit['occluded'], 'harvestable': fruit['harvestable']}})
        else:
            await self.emit({'type': 'observation', 'phase': 'observation', 'status': 'completed', 'target_id': target,
                             'message': f'区域仍被 {leaf_id} 遮挡，需要拨叶补充观察；不是病害识别。'})
        await self.emit({'type': 'decision', 'phase': 'decision', 'status': 'completed', 'target_id': target,
                         'message': f'执行已确认计划的目标 {target}；动作后再验证结果。'})
        settings = load('robot_actions')
        action_id = str(uuid.uuid4())
        mission = self.session.mission
        step_id = f'{mission.id}:{mission.plan.plan_version}:{target}'
        mission.status = 'running'
        action = {'type': 'action', 'id': action_id, 'action_type': kind, 'target_id': target,
                  'position': position, 'approach_offset': approach, 'duration_ms': settings[kind]['duration_ms'],
                  'leaf_id': leaf_id, 'truss_id': truss_id, 'affected_leaf_ids': affected_leaf_ids,
                  'mission_id': mission.id, 'step_id': step_id, 'world_revision': w.revision}
        verdict = await self.robot.execute(self.session, action,
                                          {'kind': kind, 'target': target, 'stages': settings[kind]['stages'],
                                           'step_id': step_id, 'world_revision': w.revision}, self.emit)
        mission.status = 'verifying'
        await self.emit({'type': 'verification', 'phase': 'verification', 'status': 'progress',
                         'target_id': target, 'action_id': action_id, 'message': verdict.reason, 'result': verdict.model_dump()})
        if not verdict.task_verified:
            mission.status = 'uncertain' if verdict.outcome == 'UNCERTAIN' else 'failed'
            raise VerificationFailure(verdict)
        # Recheck the version after the asynchronous robot operation, before committing.
        SafetyManager.validate_action(self.session, self.role, self.authorized, kind, target)
        receipt = verdict.evidence
        self.session.verified_actions[action_id] = {'kind': kind, 'target': target, 'verdict': verdict.model_dump()}
        if kind == 'reveal':
            w.revealed = True
            w.plants[0]['observation_status'] = 'revealed'
            w.plants[0]['suspicious_regions'][0]['occluded'] = False
            for fruit in w.fruits:
                if fruit.get('occluding_leaf_id') == leaf_id:
                    fruit['occluded'] = False
                    # Revealing an object does not change the original harvest eligibility rule.
                    fruit['note'] = '已拨叶补充观察；原采摘规则仍为暂缓，需专家进一步核实'
            await self.emit({'type': 'verification', 'phase': 'verification', 'status': 'completed', 'target_id': target,
                             'message': '遮挡叶已偏转并提交观察状态；模拟病斑仍待专家核实，不代表识别或确诊。', 'result': receipt})
            await self.emit({'type': 'camera', 'preset': 'detail', 'target_id': 'LEAF_01'})
        self.session.completed_actions.add((kind, target))
        commit = None
        if kind == 'harvest':
            self._committing = action_id
            try:
                commit = await self.update_fruit_status(SkillArgs(target_id=target))
            finally:
                self._committing = False
        self.world.refresh_revision()
        self.authorized['world_revision'] = self.world.revision
        mission.status = 'running'
        await self.emit({'type': 'verification', 'phase': 'verification', 'status': 'completed', 'target_id': target,
                         'action_id': action_id, 'message': f'{target} 场景结果已验证，后端已提交。',
                         'result': {**verdict.model_dump(), 'commit': commit}})
        return {'action_type': kind, 'target_id': target, 'animation_completed': True, 'task_verified': True,
                'action_uuid': action_id, 'scene_verification': receipt, 'commit': commit}

    async def update_fruit_status(self, a: SkillArgs) -> dict:
        w = self.world
        f = self.fruit(a.target_id)
        receipt = self.session.verified_actions.get(self._committing, {})
        if receipt.get('kind') != 'harvest' or receipt.get('target') != a.target_id or not receipt.get('verdict', {}).get('task_verified'):
            raise ValueError('只能由验证器内部提交已核验动作。')
        if ('harvest', a.target_id) not in self.session.completed_actions:
            raise ValueError('必须先完成该果实的采摘动画。')
        if f['status'] == 'harvested':
            raise ValueError('该果实已经采摘，不能重复提交。')
        f['status'] = 'harvested'
        w.collected.append(f['fruit_id'])
        self.session.completed_actions.discard(('harvest', a.target_id))
        return {'fruit_id': f['fruit_id'], 'status': f['status'], 'basket_count': len(w.collected)}

    async def search_agri_knowledge(self, a: SkillArgs) -> dict:
        w = self.world
        query = a.query or ''
        return {'entries': [k for k in load('agriculture_knowledge') if k['topic'] in query or query in k['text']] or load('agriculture_knowledge')[:2], 'source': '本地演示知识库'}

    async def query_crop_status(self, a: SkillArgs) -> dict:
        w = self.world
        return {'plants': w.plants, 'available': len(self.eligible()), 'collected': len(w.collected), 'on_plant': sum(f['status'] == 'on_plant' for f in w.fruits)}

    async def query_environment_history(self, a: SkillArgs) -> dict:
        w = self.world
        return {'records': load('environment_history')[-(a.days or 7):], 'demo_data': True, 'source': '预置环境历史 · 非实时传感器'}

    async def generate_farm_report(self, a: SkillArgs) -> dict:
        w = self.world
        report = {'type': 'farm', 'title': '模拟采摘 · 管理报告', 'collected': list(w.collected), 'remaining': len(self.eligible()),
                  'text': f'累计采摘 {len(w.collected)} 颗：{", ".join(w.collected) or "暂无"}。转色果与绿熟果继续生长；T06 按原采摘规则暂缓，需进一步核实。全部为预置场景的模拟操作。'}
        w.reports.append(report)
        return report

    async def explain_plant_part(self, a: SkillArgs) -> dict:
        w = self.world
        part = a.part or '叶片'
        if part not in ('叶片', '茎秆', '花序', '果实'):
            raise ValueError('可观察的部位：叶片、茎秆、花序、果实。')
        if part not in w.learned_parts:
            w.learned_parts.append(part)
        await self.emit({'type': 'highlight', 'part': part})
        await asyncio.sleep(0.65)
        return {'part': part, 'explanation': next((k['text'] for k in load('agriculture_knowledge') if k['topic'] == part), '果实由花发育而来。先观察颜色、遮挡和成熟度，再决定是否适合采摘。')}

    async def explain_ripeness_stage(self, a: SkillArgs) -> dict:
        w = self.world
        return {'stages': ['绿熟：绿色，继续生长', '转色：橙黄，等待成熟', '红熟：红色，结合遮挡与状态判断'], 'tip': '红色不一定就能采摘，还要看状态。'}

    async def generate_learning_task(self, a: SkillArgs) -> dict:
        w = self.world
        w.learning = 'select'
        return {'awaiting_selection': True, 'task': '从场景或果实列表选一颗适合采摘的番茄，再提交答案。'}

    async def evaluate_student_answer(self, a: SkillArgs) -> dict:
        w = self.world
        if w.learning != 'select':
            raise ValueError('请先开始研学挑战。')
        f = self.fruit(a.target_id)
        correct = f in self.eligible()
        if not correct:
            return {'correct': False, 'feedback': '再观察一下：已经采摘、还未红熟或有遮挡的果实，都不适合本次挑战。请选择另一颗。'}
        w.learning = 'ready'
        self.world.refresh_revision()
        await self.request_confirmation('harvest', [f['fruit_id']])
        return {'correct': True, 'feedback': f'{f["fruit_id"]} 已红熟且无遮挡，选择正确！确认后可体验采摘。'}

    async def inspect_plant_health(self, a: SkillArgs) -> dict:
        w = self.world
        region = w.plants[0]['suspicious_regions'][0]
        return {'plant_id': 'P01', 'observation': region['description'], 'occluded': not w.revealed, 'region_id': 'LEAF_01',
                'carrier_leaf_id': region['carrier_leaf_id'], 'occluding_leaf_id': region['occluding_leaf_id'],
                'diagnosis': None, 'requires_expert': True}

    async def reveal_occluded_area(self, a: SkillArgs) -> dict:
        w = self.world
        if w.revealed:
            return {'revealed': True, 'message': '异常区域已暴露，可直接查看。'}
        return await self.request_confirmation('reveal', ['LEAF_01'])

    async def query_growth_stage(self, a: SkillArgs) -> dict:
        w = self.world
        return {'plant_id': 'P01', 'cultivar': w.plants[0]['cultivar'], 'growth_stage': w.plants[0]['growth_stage']}

    async def query_inspection_records(self, a: SkillArgs) -> dict:
        w = self.world
        return {'records': load('inspection_records'), 'demo_data': True}

    async def generate_expert_summary(self, a: SkillArgs) -> dict:
        w = self.world
        if not w.revealed:
            raise ValueError('当前仍有遮挡，请先补充观察，再生成完整会诊摘要。')
        report = {'type': 'expert', 'title': 'P01 · 专家辅助会诊摘要',
                  'facts': '模拟观察事实：结果期第 9 周；拨叶后可见真实复叶上的预置模拟病斑，具有黄晕、褐色边缘与浅色中心。斑枯病外观仅为模拟，非检测或确诊；T06 遮挡已解除但采摘规则仍为暂缓。',
                  'history': '预置历史：11/11–11/12 湿度升至 77%–79%；11/12 记录叶片模拟异常，11/13 常规滴灌。',
                  'inference': '辅助判断：历史湿度变化值得关注；当前信息不足以判定原因或病害种类。',
                  'questions': '待专家核实：真实叶片正反面、斑点边缘与扩展趋势，必要时实地检测；本演示不提供确诊。',
                  'demo_data': True}
        w.reports.append(report)
        return report
