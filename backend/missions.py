"""Versioned plans and mandatory authorization checks shared by every execution path."""
from .models import MissionPlan
from copy import deepcopy
from .observations import harvestable


class MissionPlanner:
    @staticmethod
    def propose(session, role, kind, targets):
        revision = session.world.refresh_revision()
        previous = session.mission.plan if session.mission else None
        plan = MissionPlan(kind=kind, targets=list(targets), world_revision=revision,
                           plan_version=(previous.plan_version + 1 if previous else 1),
                           steps=[{'target_id': t, 'preconditions': ['authorization', 'current_observation', 'target_valid'],
                                   'postconditions': ['scene_evidence', 'business_commit'],
                                   'depends_on': [], 'status': 'queued'} for t in targets])
        if session.mission:
            session.mission.plan = plan
            session.mission.status = 'waiting_approval'
        return plan

    @staticmethod
    def approve(session, pending, role):
        if pending['role'] != role or pending['world_revision'] != session.world.refresh_revision():
            raise ValueError('确认已过期：世界版本发生变化，请重新观察并生成计划。')
        mission = session.mission
        if not mission or pending['mission_id'] != mission.id or not mission.plan:
            raise ValueError('确认已过期，任务不存在。')
        plan = mission.plan
        if pending['plan_id'] != plan.id or pending['plan_version'] != plan.plan_version:
            raise ValueError('确认已过期：计划版本不一致。')
        plan.approved = True
        mission.status = 'running'
        return {**pending, 'world_revision': session.world.revision}

    @staticmethod
    def record(session, name, args, result):
        mission = session.mission
        if not mission:
            return
        mission.results.append(deepcopy({'tool_name': name, 'args': args, 'result': result,
                                        'world_revision': session.world.refresh_revision()}))
        mission.results = mission.results[-100:]
        if result.get('error'):
            mission.last_error = result['error']
            if name == 'play_robot_action' and mission.plan:
                for step in mission.plan.steps:
                    if step['target_id'] == args.get('target_id'):
                        step['status'] = 'uncertain' if mission.status == 'uncertain' else 'failed'
        elif result.get('task_verified'):
            mission.last_error = None
        if name == 'play_robot_action' and result.get('task_verified'):
            target = args['target_id']
            if target not in mission.completed:
                mission.completed.append(target)
            if mission.plan:
                for step in mission.plan.steps:
                    if step['target_id'] == target:
                        step['status'] = 'success'


class SafetyManager:
    @staticmethod
    def validate_action(session, role, authorization, kind, target):
        if not authorization or authorization.get('role') != role or authorization.get('kind') != kind or target not in authorization.get('targets', []):
            raise ValueError('请先在操作卡中确认，再执行机械臂动作。')
        mission = session.mission
        if not mission or not mission.plan or not mission.plan.approved:
            raise ValueError('缺少已确认的任务计划。')
        if mission.status == 'uncertain':
            raise ValueError('上一动作结果不确定，必须重新观察并请求人工确认后再操作。')
        plan = mission.plan
        if (authorization.get('mission_id') != mission.id or authorization.get('plan_id') != plan.id or
                authorization.get('plan_version') != plan.plan_version):
            raise ValueError('计划版本不一致，必须重新确认。')
        if authorization['world_revision'] != session.world.refresh_revision():
            raise ValueError('世界版本变化，必须重新观察并确认授权。')
        if session.animations:
            raise ValueError('尚有未完成动作，不能并发执行。')
        if target in mission.completed:
            raise ValueError('该动作已经验证完成，禁止重复执行。')
        if kind == 'harvest':
            fruit = next((f for f in session.world.fruits if f['fruit_id'] == target), None)
            if not fruit or not harvestable(fruit):
                raise ValueError('目标已变化：当前成熟度、遮挡、可达性或采摘规则不满足要求。')
        elif kind != 'reveal' or target != 'LEAF_01':
            raise ValueError('不支持的动作或目标。')
        if role == 'student' and session.world.learning != 'ready':
            raise ValueError('学生必须先完成选果评价。')
