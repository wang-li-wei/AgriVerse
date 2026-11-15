"""Behavior tests cover confirmations, real executable skills, state and provider contracts."""
import asyncio
import json
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.models import Session, ChatRequest, load
from backend.providers import Provider
from backend.agent import run_agent
from backend.skills import SkillRunner, DESCRIPTIONS, tool_definitions

def demo_provider():
    p = Provider()
    p.enabled = False
    return p

def verified_ack(session, event):
    # Simulator test evidence, distinct from browser integration evidence.
    i = len(session.world.collected)
    session.action_receipts[event['id']] = ({'verified': True, 'fruit_uuid': 'test-fruit', 'original_uuid': 'test-fruit',
        'position': [1.48+(i%2)*.4, .38, 1.18+(i//2)*.32], 'max_grip_error': 0}
        if event['action_type']=='harvest' else {'verified': True, 'region_visible': True, 'leaf_moved': True})
    session.animations[event['id']].set_result(True)


def scenario(run):
    return asyncio.run(run())

def test_farmer_full_chain_and_repeated_confirmation():
    async def run():
        session, events = Session(), []
        async def emit(event):
            events.append(event)
            if event['type'] == 'action':
                verified_ack(session, event)
        await run_agent(session, ChatRequest(role='farmer', message='帮我检查哪些番茄成熟了，模拟采摘。'), emit, demo_provider())
        assert session.world.collected == []
        assert session.pending['targets'] == ['T01', 'T03', 'T05']
        cid = session.pending['id']
        await run_agent(session, ChatRequest(role='farmer', message='确认', confirmation_id=cid), emit, demo_provider())
        assert session.world.collected == ['T01', 'T03', 'T05']
        assert session.world.reports[-1]['type'] == 'farm'
        assert [f['fruit_id'] for f in session.world.fruits if f['status'] == 'on_plant'] == ['T02','T04','T06']
        assert len([e for e in events if e['type']=='action']) == 3
        await run_agent(session, ChatRequest(role='farmer', message='重复确认', confirmation_id=cid), emit, demo_provider())
        assert len(session.world.collected) == 3
        assert '过期' in next(e for e in reversed(events) if e['type']=='message')['text']
        assert events[-1]['type']=='run_failed'
    scenario(run)

def test_student_wrong_then_correct_choice():
    async def run():
        session, events = Session(), []
        async def emit(event):
            events.append(event)
            if event['type']=='action': verified_ack(session, event)
        await run_agent(session, ChatRequest(role='student', message='认识番茄，体验机器人采摘'), emit, demo_provider())
        assert session.world.learned_parts == ['茎秆','叶片','花序','果实']
        assert session.world.learning == 'select'
        await run_agent(session, ChatRequest(role='student', message='选择', selected_id='T02'), emit, demo_provider())
        assert session.pending is None and session.world.learning == 'select'
        await run_agent(session, ChatRequest(role='student', message='选择', selected_id='T01'), emit, demo_provider())
        assert session.pending['targets'] == ['T01']
        await run_agent(session, ChatRequest(role='student', message='确认', confirmation_id=session.pending['id']), emit, demo_provider())
        assert session.world.collected == ['T01']
        assert session.world.learning == 'complete'
    scenario(run)

def test_expert_reveal_history_and_evidence_summary():
    async def run():
        session, events = Session(), []
        async def emit(event):
            events.append(event)
            if event['type']=='action': verified_ack(session, event)
        await run_agent(session, ChatRequest(role='expert', message='帮我查看P01的疑似病害区域，并调取最近几天的环境信息。'), emit, demo_provider())
        assert not session.world.revealed and session.pending['kind']=='reveal'
        await run_agent(session, ChatRequest(role='expert', message='确认拨叶', confirmation_id=session.pending['id']), emit, demo_provider())
        assert session.world.revealed
        t06 = next(f for f in session.world.fruits if f['fruit_id'] == 'T06')
        assert t06['occluded'] is False
        assert t06['harvestable'] is False
        assert t06['ripeness_stage'] == 'red' and t06['ripeness_score'] == 0.89
        assert session.world.plants[0]['suspicious_regions'][0]['occluded'] is False
        reveal = next(e for e in events if e['type'] == 'action')
        assert reveal['leaf_id'] == 'P01_LEAF_06'
        assert reveal['position'] == load('plant_structure')['reveal']['contact_position']
        report = session.world.reports[-1]
        assert all(k in report for k in ['facts','history','inference','questions'])
        assert report['demo_data'] is True
        names=[e['name'] for e in events if e['type']=='tool' and e['status']=='success']
        assert all(n in names for n in ['query_growth_stage','query_environment_history','query_inspection_records','generate_expert_summary'])
    scenario(run)

def test_failed_animation_no_harvest_and_no_unauthorized_update():
    async def run():
        session = Session()
        async def emit(event):
            if event['type']=='action': session.animations[event['id']].set_result(False)
        runner = SkillRunner(session,'farmer',emit)
        assert 'error' in await runner.run('play_robot_action',{'action_type':'harvest','target_id':'T01'})
        assert 'error' in await runner.run('update_fruit_status',{'target_id':'T01'})
        assert 'error' in await runner.run('get_harvest_plan',{'target_ids':['T01','T01']})
        assert 'error' in await runner.run('get_harvest_plan',{'target_ids':['T06']})
        await run_agent(session,ChatRequest(role='farmer',message='模拟采摘'),emit,demo_provider())
        await run_agent(session,ChatRequest(role='farmer',message='确认',confirmation_id=session.pending['id']),emit,demo_provider())
        assert session.world.collected == []
        assert all(f['status']=='on_plant' for f in session.world.fruits)
    scenario(run)

def test_role_gating_and_session_isolation():
    async def run():
        one,two=Session(),Session()
        async def emit(event): pass
        runner=SkillRunner(one,'student',emit)
        assert 'error' in await runner.run('generate_expert_summary')
        one.world.fruits[0]['status']='harvested'
        assert two.world.fruits[0]['status']=='on_plant'
        for role in ['farmer','student','expert']:
            for tool in tool_definitions(role):
                assert tool['name'] in DESCRIPTIONS
                assert tool['parameters']['additionalProperties'] is False
                assert set(tool['parameters']['required']) == set(tool['parameters']['properties'])
    scenario(run)

def test_real_provider_function_loop():
    class FakeProvider(Provider):
        def __init__(self):
            self.enabled,self.kind,self.calls=True,'openai',0
        async def turn(self,instructions,history,tools):
            self.calls+=1
            if self.calls==1:
                assert '预置演示数据' in instructions
                return {'calls':[{'name':'query_crop_status','arguments':'{}','call_id':'call_1'}], 'text':'','history_items':[{'type':'function_call','name':'query_crop_status','arguments':'{}','call_id':'call_1'}]}
            assert history[-1]['type']=='function_call_output'
            assert json.loads(history[-1]['output'])['available']==3
            return {'calls':[],'text':'当前有 3 颗符合条件的番茄。','history_items':[{'role':'assistant','content':'当前有3颗'}]}
    async def run():
        session,events=Session(),[]
        async def emit(event):events.append(event)
        provider=FakeProvider()
        await run_agent(session,ChatRequest(role='farmer',message='查询作物'),emit,provider)
        assert provider.calls==2
        assert any(e['type']=='tool' and e['name']=='query_crop_status' and e['status']=='success' for e in events)
    scenario(run)

def test_api_validation_and_reset():
    with TestClient(app) as client:
        assert client.get('/api/health').status_code==200
        sid=client.post('/api/sessions').json()['session_id']
        assert len(client.get(f'/api/sessions/{sid}').json()['fruits'])==6
        assert client.post(f'/api/sessions/{sid}/chat',json={'role':'unknown','message':'hi'}).status_code==422
        assert client.post(f'/api/sessions/{sid}/chat',json={'role':'farmer','message':''}).status_code==422
        assert client.get('/api/sessions/no-such-session').status_code==404
        assert client.post(f'/api/sessions/{sid}/reset').status_code==200
        assert client.get('/api/docs').status_code==200

def test_plant_structure_relationships_and_unchanged_harvest_rules():
    structure = load('plant_structure')
    leaves = {leaf['leaf_id']: leaf for leaf in structure['leaves']}
    assert len(leaves) == 12
    assert all(3 <= leaf['pairs'] <= 5 for leaf in leaves.values())
    trusses = structure['trusses']
    assert len(trusses) == 2 and all(len(t['fruit_ids']) == 3 for t in trusses)
    assert sorted(fid for t in trusses for fid in t['fruit_ids']) == [f'T{i:02}' for i in range(1,7)]
    relation = structure['reveal']
    assert relation['carrier_leaf_id'] != relation['occluding_leaf_id']
    assert relation['carrier_leaf_id'] in leaves and relation['occluding_leaf_id'] in leaves
    world = Session().world
    assert [f['fruit_id'] for f in world.fruits if f['harvestable']] == ['T01','T03','T05']
    assert next(f for f in world.fruits if f['fruit_id']=='T06')['occluding_leaf_id'] == relation['occluding_leaf_id']

def test_failed_reveal_does_not_commit_occlusion():
    async def run():
        session = Session()
        async def emit(event):
            if event['type']=='action': session.animations[event['id']].set_result(False)
        await run_agent(session,ChatRequest(role='expert',message='查看 P01 疑似病斑'),emit,demo_provider())
        await run_agent(session,ChatRequest(role='expert',message='确认',confirmation_id=session.pending['id']),emit,demo_provider())
        assert session.world.revealed is False
        assert next(f for f in session.world.fruits if f['fruit_id']=='T06')['occluded'] is True
        assert session.world.plants[0]['suspicious_regions'][0]['occluded'] is True
        assert not session.animations and not session.world.reports
    scenario(run)

def test_animation_timeout_cleans_waiter_without_committing(monkeypatch):
    async def timeout(future, timeout):
        future.cancel()
        raise TimeoutError()
    monkeypatch.setattr(asyncio,'wait_for',timeout)
    async def run():
        session = Session()
        async def emit(event): pass
        from backend.models import Mission
        from backend.missions import MissionPlanner
        session.mission = Mission(role='farmer', goal='timeout', mode='simulation_policy')
        runner = SkillRunner(session,'farmer',emit)
        await runner.request_confirmation('harvest', ['T01'])
        runner.authorized = MissionPlanner.approve(session, session.pending, 'farmer')
        session.pending = None
        result = await runner.run('play_robot_action',{'action_type':'harvest','target_id':'T01'})
        assert '超时' in result['error']
        assert not session.animations and not session.completed_actions
        assert session.world.fruits[0]['status']=='on_plant' and not session.world.collected
    scenario(run)


def test_live_execution_events_order_and_no_commit_before_ack():
    async def run():
        session, events = Session(), []
        started = asyncio.Event()
        async def emit(e):
            events.append(e)
            if e['type'] == 'action': started.set()
        await run_agent(session, ChatRequest(role='farmer',message='采摘'),emit,demo_provider())
        confirm = session.pending['id']
        task = asyncio.create_task(run_agent(session,ChatRequest(role='farmer',message='确认',confirmation_id=confirm),emit,demo_provider()))
        await started.wait()
        assert session.world.collected == []
        action = next(e for e in reversed(events) if e['type']=='action')
        run_id = action['run_id']
        before = [e for e in events if e.get('run_id')==run_id]
        assert any(e['type']=='observation' and e.get('target_id')=='T01' for e in before)
        assert not any(e['type']=='run_completed' for e in before)
        # Fail the actual waiting action. No subsequent fruit, commit, or success event.
        session.animations[action['id']].set_result(False)
        await task
        emitted=[e for e in events if e.get('run_id')==run_id]
        assert [e['seq'] for e in emitted] == list(range(1,len(emitted)+1))
        assert all(e['timestamp'] for e in emitted)
        assert emitted[-1]['type']=='run_failed'
        assert not session.world.collected
        assert not session.action_contexts
    scenario(run)


def test_selection_uses_current_state_instead_of_fixed_targets():
    async def run():
        session=Session()
        session.world.fruits.reverse()
        next(f for f in session.world.fruits if f['fruit_id']=='T03')['occluded']=True
        events=[]
        async def emit(e): events.append(e)
        await run_agent(session,ChatRequest(role='farmer',message='采摘'),emit,demo_provider())
        assert session.pending['targets']==['T05','T01']
        decision=next(e for e in events if e['type']=='decision' and e.get('tool_name')=='select_harvest_targets' and 'result' in e)
        assert decision['result']['target_ids']==['T05','T01']
    scenario(run)


def test_reject_bad_scene_evidence_without_committing():
    from backend.main import sessions
    with TestClient(app) as client:
        sid=client.post('/api/sessions').json()['session_id']
        session=sessions[sid][0]
        async def prepare():
            future=asyncio.get_running_loop().create_future()
            session.animations['a']=future
        client.portal.call(prepare)
        session.action_contexts['a']={'kind':'harvest'}
        response=client.post(f'/api/sessions/{sid}/actions/a/ack',json={'success':True,'evidence':{'verified':True,'fruit_uuid':'x','original_uuid':'y','position':[1.48,.38,1.18],'max_grip_error':0}})
        assert response.status_code==409
        assert session.animations['a'].result() is False
        assert not session.world.collected


def test_cancelled_run_cleans_waiter_and_never_succeeds():
    async def run():
        session,events=Session(),[]
        started=asyncio.Event()
        async def emit(e):
            events.append(e)
            if e['type']=='action': started.set()
        await run_agent(session,ChatRequest(role='farmer',message='采摘'),emit,demo_provider())
        task=asyncio.create_task(run_agent(session,ChatRequest(role='farmer',message='确认',confirmation_id=session.pending['id']),emit,demo_provider()))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError): await task
        assert not session.animations and not session.action_contexts
        assert not session.world.collected
        assert events[-1]['type']=='run_failed'
    scenario(run)


def test_skill_exception_fails_run_without_false_completion(monkeypatch):
    async def broken(self,args): raise RuntimeError('internal failure')
    async def run():
        session,events=Session(),[]
        async def emit(e): events.append(e)
        await run_agent(session,ChatRequest(role='farmer',message='采摘'),emit,demo_provider())
        monkeypatch.setattr(SkillRunner,'play_robot_action',broken)
        await run_agent(session,ChatRequest(role='farmer',message='确认',confirmation_id=session.pending['id']),emit,demo_provider())
        assert events[-1]['type']=='run_failed'
        assert not session.world.collected
        assert any(e['type']=='tool_call' and e['status']=='failed' for e in events)
    scenario(run)
