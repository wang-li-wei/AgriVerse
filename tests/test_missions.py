"""Agent-core tests use named test Providers, never claim real remote-model validation."""
import asyncio
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.agent import run_agent
from backend.models import ChatRequest, Session, Mission, World
from backend.providers import Provider
from backend.observations import ObservationManager, SimulationPerceptionAdapter
from backend.missions import MissionPlanner
from backend.skills import SkillRunner, skill_registry, tool_definitions
from backend.memory import MemoryManager
from backend.verification import VerificationManager


class TestProvider(Provider):
    __test__ = False
    def __init__(self, choose):
        self.kind, self.enabled = 'openai', True
        self.choose, self.contexts, self.inputs = choose, [], []
        self.prefix = str(uuid.uuid4())

    async def turn(self, instructions, history, tools):
        context = json.loads(instructions.split('当前任务、最新观察与世界：', 1)[1])
        self.contexts.append(context)
        self.inputs.append(json.loads(json.dumps(history)))
        choice = self.choose(context, history)
        if choice is None:
            return {'calls': [], 'text': '依据工具结果结束。', 'history_items': [{'role': 'assistant', 'content': '结束。'}]}
        name, args = choice
        call = {'type': 'function_call', 'name': name, 'arguments': json.dumps(args), 'call_id': f'{self.prefix}:c{len(self.contexts)}'}
        return {'calls': [call], 'text': '', 'history_items': [call]}


def receipt(session, event):
    i = len(session.world.collected)
    return ({'verified': True, 'fruit_uuid': f"original-{event['target_id']}", 'original_uuid': f"original-{event['target_id']}",
             'position': [1.48+(i%2)*.4, .38, 1.18+(i//2)*.32], 'max_grip_error': .001}
            if event['action_type']=='harvest' else {'verified': True, 'leaf_moved': True, 'region_visible': True})


def emitter(session, events, evidence=True):
    async def emit(event):
        events.append(event)
        if event['type'] == 'action':
            if evidence:
                session.action_receipts[event['id']] = receipt(session, event)
            session.animations[event['id']].set_result(True)
    return emit


async def plan(session, events, targets=('T01',), role='farmer'):
    def choose(c, h):
        if h[-1].get('type') == 'function_call_output':
            return None
        return 'get_harvest_plan', {'target_ids': list(targets)}
    await run_agent(session, ChatRequest(role=role, message='观察并安全采摘'), emitter(session, events), TestProvider(choose))
    return session.pending['id']


def test_immutable_versioned_world_and_complete_simulation_graph():
    session = Session()
    old = session.world.snapshot()
    session.world.fruits[0]['occluded'] = True
    new = session.world.snapshot()
    assert old['fruits'][0]['occluded'] is False
    assert new['world_revision'] == old['world_revision'] + 1
    assert session.world.snapshot()['world_revision'] == new['world_revision']
    obs = ObservationManager(session).current()
    assert obs['source'] == 'simulation' and obs['is_simulated'] is True
    assert obs['world_revision'] == new['world_revision']
    assert len([e for e in obs['entities'] if e['type']=='Leaf']) == 12
    assert len([e for e in obs['entities'] if e['type']=='Leaflet']) == 128
    assert len([e for e in obs['entities'] if e['type']=='FruitTruss']) == 2
    assert len({e['id'] for e in obs['entities']}) == len(obs['entities'])
    obs['entities'][0]['properties']['cultivar'] = 'changed'
    assert session.world.plants[0]['cultivar'] != 'changed'


def test_registry_keeps_19_skills_and_hides_internal_commit():
    registry = skill_registry()
    assert len(registry) == 19
    required = {'parameters_schema', 'required_role', 'side_effect', 'risk_level', 'requires_approval',
                'timeout', 'idempotency', 'preconditions', 'postconditions', 'execution_adapter'}
    assert all(required <= set(spec) for spec in registry.values())
    for role in ('farmer', 'student', 'expert'):
        names = {t['name'] for t in tool_definitions(role)}
        assert 'update_fruit_status' not in names
    async def run():
        s = Session()
        async def emit(e): pass
        r = SkillRunner(s, 'student', emit)
        assert 'error' in await r.run('generate_expert_summary')
        assert 'error' in await r.run('update_fruit_status', {'target_id':'T01'})
        with pytest.raises(ValueError):
            await r.update_fruit_status(type('Args', (), {'target_id':'T01'})())
        assert not s.world.collected
    asyncio.run(run())


def test_multiturn_observation_results_are_actual_next_model_input():
    async def run():
        s, events = Session(), []
        def choose(c, h):
            if len(provider.contexts) == 1:
                return 'identify_tomatoes', {}
            result = json.loads(h[-1]['output'])
            if len(provider.contexts) == 2:
                assert result['fruits'][0]['ripeness_score'] == .96
                return 'query_crop_status', {}
            assert result['available'] == 3
            return 'inspect_greenhouse', {} if len(provider.contexts) == 3 else {}
        # Third tool result is consumed before terminating.
        def policy(c, h):
            if len(provider.contexts) == 4:
                assert json.loads(h[-1]['output'])['observation']['source'] == 'simulation'
                return None
            return choose(c, h)
        provider = TestProvider(policy)
        await run_agent(s, ChatRequest(role='farmer', message='观察后再检查'), emitter(s,events), provider)
        assert len(provider.contexts) == 4
        assert s.mission.status == 'success'
        assert events[-1]['type']=='run_completed'
    asyncio.run(run())


def test_confirmed_mission_uses_model_and_replans_from_changed_observation(monkeypatch):
    observe = SimulationPerceptionAdapter.observe
    changed = False
    def update(self, world):
        nonlocal changed
        if 'T01' in world.collected and not changed:
            next(f for f in world.fruits if f['fruit_id']=='T03')['occluded'] = False
            next(f for f in world.fruits if f['fruit_id']=='T05')['occluded'] = True
            changed = True
        return observe(self, world)
    monkeypatch.setattr(SimulationPerceptionAdapter, 'observe', update)
    async def run():
        s, events = Session(), []
        next(f for f in s.world.fruits if f['fruit_id']=='T03')['occluded'] = True
        s.world.fruits[0]['ripeness_score'] = .995
        def choose(c, h):
            eligible = c['observation']['summary']['eligible_ids']
            authorization = c['authorization']
            if not authorization:
                return ('get_harvest_plan', {'target_ids': eligible}) if eligible else None
            remaining = [t for t in eligible if t not in s.world.collected]
            outside = [t for t in remaining if t not in authorization['targets']]
            if outside:
                return 'get_harvest_plan', {'target_ids': outside}
            if remaining:
                # Select by latest score rather than target IDs or fixed list order.
                candidates = [f for f in c['world']['fruits'] if f['fruit_id'] in remaining]
                target = max(candidates, key=lambda f:f['ripeness_score'])['fruit_id']
                return 'play_robot_action', {'action_type':'harvest', 'target_id':target}
            return None
        provider = TestProvider(choose)
        emit = emitter(s, events)
        await run_agent(s, ChatRequest(role='farmer',message='采摘所有安全成熟果'), emit, provider)
        mid, v1 = s.mission.id, s.mission.plan.plan_version
        before = len(provider.contexts)
        await run_agent(s, ChatRequest(role='farmer',message='确认',confirmation_id=s.pending['id']), emit, provider)
        assert len(provider.contexts)>before  # Confirmation did not bypass the model.
        assert s.world.collected == ['T01']
        assert s.pending['targets'] == ['T03']  # New observation changed the plan and requested new scope approval.
        assert s.mission.id == mid and s.mission.plan.plan_version == v1+1
        await run_agent(s, ChatRequest(role='farmer',message='确认新计划',confirmation_id=s.pending['id']), emit, provider)
        assert s.world.collected == ['T01','T03']
        assert 'T05' not in s.world.collected
        assert any(c['world']['collected']==['T01'] and c['observation']['summary']['eligible_ids']==['T03'] for c in provider.contexts)
        assert any('task_verified' in item.get('output','') for h in provider.inputs for item in h)
        choice = next(e for e in events if e['type']=='decision' and e.get('source')=='model_tool_call' and e.get('target_id')=='T01')
        assert choice['evidence']['target']['properties']['ripeness_score'] == .995
        assert choice['evidence']['target']['properties']['eligible'] is True
        assert events[-1]['type']=='run_completed'
        assert all(e['mission_id']==mid for e in events)
        for rid in {e['run_id'] for e in events}:
            rows=[e for e in events if e['run_id']==rid]
            assert [e['seq'] for e in rows] == list(range(1,len(rows)+1))
            assert all(e['timestamp'] for e in rows)
        actions = [e for e in events if e['type']=='action']
        assert len({e['action_uuid'] for e in actions})==2
        assert all(e['step_id'] and e['action_uuid']==e['id'] for e in actions)
    asyncio.run(run())


def test_tool_failure_is_returned_and_alternative_observation_can_recover(monkeypatch):
    async def broken(self, args): raise ValueError('模拟观察源暂不可用')
    monkeypatch.setattr(SkillRunner, 'identify_tomatoes', broken)
    async def run():
        s,events=Session(),[]
        def choose(c,h):
            if len(p.contexts)==1:
                return 'identify_tomatoes', {}
            result=json.loads(h[-1]['output'])
            if result.get('error'):
                return 'inspect_greenhouse', {}
            assert result['observation']['summary']['basket_count']==0
            return None
        p=TestProvider(choose)
        await run_agent(s,ChatRequest(role='farmer',message='观察温室'),emitter(s,events),p)
        assert s.mission.status=='success'
        assert any(e['type']=='tool_call' and e['status']=='failed' for e in events)
        assert not any(e['type']=='run_failed' for e in events)
    asyncio.run(run())


def test_identical_failure_retries_are_bounded(monkeypatch):
    monkeypatch.setattr('backend.agent.MAX_TURNS', 5)
    count=0
    async def broken(self,args):
        nonlocal count
        count+=1
        raise ValueError('模拟失败')
    monkeypatch.setattr(SkillRunner,'identify_tomatoes',broken)
    async def run():
        s,events=Session(),[]
        p=TestProvider(lambda c,h: ('identify_tomatoes',{}))
        await run_agent(s,ChatRequest(role='farmer',message='观察'),emitter(s,events),p)
        assert count==2
        assert s.mission.status=='failed' and events[-1]['type']=='run_failed'
        assert not any(e['type']=='run_completed' for e in events)
    asyncio.run(run())


@pytest.mark.parametrize('evidence,outcome', [
    (None, 'UNCERTAIN'),
    ({'verified':False,'fruit_uuid':'a','original_uuid':'a','position':[-.64,1.39,.57],'max_grip_error':0},'FAILED'),
    ({'verified':True,'fruit_uuid':'a','original_uuid':'different','position':[1.48,.38,1.18],'max_grip_error':0},'FAILED'),
    ({'verified':True,'fruit_uuid':'a','original_uuid':'a','position':[1.48,.38,1.18],'max_grip_error':float('nan')},'FAILED'),
])
def test_verifier_rejects_missing_or_false_separation_evidence(evidence, outcome):
    assert VerificationManager.verify('harvest',True,evidence,0).outcome==outcome
    async def run():
        s,events=Session(),[]
        cid=await plan(s,events)
        async def emit(e):
            events.append(e)
            if e['type']=='action':
                if evidence: s.action_receipts[e['id']]=evidence
                s.animations[e['id']].set_result(True)
        p=TestProvider(lambda c,h: ('play_robot_action',{'action_type':'harvest','target_id':'T01'}) if len(p.contexts)==1 else None)
        await run_agent(s,ChatRequest(role='farmer',message='确认',confirmation_id=cid),emit,p)
        assert not s.world.collected and s.world.fruits[0]['status']=='on_plant'
        assert events[-1]['type']=='run_failed'
    asyncio.run(run())


def test_unapproved_model_action_and_internal_commit_cannot_change_world():
    async def run():
        for name,args in [('play_robot_action',{'action_type':'harvest','target_id':'T01'}), ('update_fruit_status',{'target_id':'T01'})]:
            s,events=Session(),[]
            p=TestProvider(lambda c,h: (name,args) if len(p.contexts)==1 else None)
            await run_agent(s,ChatRequest(role='farmer',message='直接采摘'),emitter(s,events),p)
            assert not s.world.collected and not any(e['type']=='action' for e in events)
            assert events[-1]['type']=='run_failed'
    asyncio.run(run())


def test_stale_world_plan_requires_reapproval():
    async def run():
        s,events=Session(),[]
        cid=await plan(s,events)
        s.world.fruits[0]['occluded']=True
        p=TestProvider(lambda c,h: None)
        await run_agent(s,ChatRequest(role='farmer',message='确认',confirmation_id=cid),emitter(s,events),p)
        assert not p.contexts and not s.world.collected
        assert any('版本' in e.get('text','') for e in events)
        assert events[-1]['type']=='run_failed'
    asyncio.run(run())


def test_changes_during_execution_cannot_commit_even_with_good_evidence():
    async def run():
        s,events=Session(),[]
        cid=await plan(s,events)
        async def emit(e):
            events.append(e)
            if e['type']=='action':
                s.world.fruits[0]['reachable']=False
                s.action_receipts[e['id']]=receipt(s,e)
                s.animations[e['id']].set_result(True)
        p=TestProvider(lambda c,h: ('play_robot_action',{'action_type':'harvest','target_id':'T01'}) if len(p.contexts)==1 else None)
        await run_agent(s,ChatRequest(role='farmer',message='确认',confirmation_id=cid),emit,p)
        assert not s.world.collected
        assert events[-1]['type']=='run_failed'
    asyncio.run(run())


def test_expert_harvest_does_not_invoke_farmer_only_report():
    async def run():
        s,events=Session(),[]
        cid=await plan(s,events,role='expert')
        p=Provider();p.enabled=False
        await run_agent(s,ChatRequest(role='expert',message='确认',confirmation_id=cid),emitter(s,events),p)
        assert s.world.collected==['T01']
        assert not any(e.get('name')=='generate_farm_report' for e in events)
        assert events[-1]['type']=='run_completed'
    asyncio.run(run())


def test_model_failure_is_not_silently_replaced_by_demo():
    class Broken(Provider):
        kind, enabled='openai',True
        async def turn(self,*args): raise RuntimeError('SECRET_HTTP_RESPONSE')
    async def run():
        s,events=Session(),[]
        p=Broken();p.enabled=True
        with pytest.raises(RuntimeError):
            await run_agent(s,ChatRequest(role='farmer',message='采摘'),emitter(s,events),p)
        assert s.mission.mode=='model' and s.mission.status=='failed'
        assert not any(e['type']=='tool' for e in events)
        assert 'SECRET_HTTP_RESPONSE' not in json.dumps(events)
        assert events[-1]['type']=='run_failed'
    asyncio.run(run())


def test_checkpoint_event_query_and_restart_never_replays_action(tmp_path,monkeypatch):
    from backend import main
    mem=MemoryManager(tmp_path/'memory.sqlite3')
    monkeypatch.setattr(main,'memory',mem)
    sid='test-restart'
    async def run():
        s=Session(id=sid,memory=mem)
        events=[]
        await plan(s,events)
        mid=s.mission.id
        restored=mem.restore(sid)
        assert restored.pending['mission_id']==mid
        assert restored.mission.status=='waiting_approval'
        rows=mem.events(sid,mid)
        assert rows and rows[-1]['type']=='run_completed'
        assert mem.events(sid,mid,after=rows[-1]['cursor'])==[]
        # Model a process loss after command dispatch. No action is auto-replayed on restoration.
        s.mission.status='running';mem.checkpoint(s)
        restarted=mem.restore(sid)
        assert restarted.mission.status=='uncertain' and restarted.pending is None
        assert not restarted.animations and not restarted.world.collected
        assert restarted.mission.plan.approved is False
        return mid
    mid=asyncio.run(run())
    monkeypatch.setattr(main,'sessions',{})
    with TestClient(main.app) as client:
        status=client.get(f'/api/sessions/{sid}/missions/{mid}')
        assert status.status_code==200 and status.json()['status']=='uncertain'
        rows=client.get(f'/api/sessions/{sid}/events',params={'mission_id':mid}).json()['events']
        assert rows and all(e['mission_id']==mid for e in rows)
        assert client.get(f'/api/sessions/{sid}').json()['collected']==[]


def test_stream_cancel_checkpoint_can_be_queried_and_same_mission_resumed(tmp_path):
    async def run():
        mem=MemoryManager(tmp_path/'memory.sqlite3')
        s,events=Session(id='cancel',memory=mem),[]
        cid=await plan(s,events)
        mid=s.mission.id
        started=asyncio.Event()
        async def emit(e):
            events.append(e)
            if e['type']=='action': started.set()
        p=Provider();p.enabled=False
        task=asyncio.create_task(run_agent(s,ChatRequest(role='farmer',message='确认',confirmation_id=cid),emit,p))
        await started.wait();task.cancel()
        with pytest.raises(asyncio.CancelledError): await task
        restored=mem.restore('cancel')
        assert restored.mission.status=='cancelled' and not restored.world.collected
        assert mem.events('cancel',mid)[-1]['type']=='run_failed'
        await run_agent(restored,ChatRequest(role='farmer',message='重新观察并采摘',mission_id=mid),emitter(restored,events),p)
        assert restored.mission.id==mid and restored.pending
        assert restored.mission.plan.approved is False
    asyncio.run(run())


def test_same_model_call_id_never_repeats_a_robot_action():
    async def run():
        s, events = Session(), []
        cid = await plan(s,events)
        class Duplicate(TestProvider):
            async def turn(self,*args):
                response = await super().turn(*args)
                if response['calls']:
                    response['calls'][0]['call_id']='same-action-id'
                return response
        p=Duplicate(lambda c,h: ('play_robot_action',{'action_type':'harvest','target_id':'T01'}) if len(p.contexts)<3 else None)
        await run_agent(s,ChatRequest(role='farmer',message='确认',confirmation_id=cid),emitter(s,events),p)
        assert len([e for e in events if e['type']=='action']) == 1
        assert s.world.collected == ['T01']
        assert json.loads(p.inputs[-1][-1]['output'])['idempotent_replay'] is True
    asyncio.run(run())


def test_batch_of_model_calls_cannot_execute_two_unobserved_actions():
    async def run():
        s,events=Session(),[]
        cid=await plan(s,events,targets=('T01','T03'))
        class Batched(TestProvider):
            async def turn(self,*args):
                response=await super().turn(*args)
                if len(self.contexts)==1:
                    extra={'type':'function_call','name':'play_robot_action', 'arguments':json.dumps({'action_type':'harvest','target_id':'T03'}),'call_id':'extra'}
                    response['calls'].append(extra)
                    response['history_items'].append(extra)
                return response
        p=Batched(lambda c,h: ('play_robot_action',{'action_type':'harvest','target_id':'T01'}) if len(p.contexts)==1 else None)
        await run_agent(s,ChatRequest(role='farmer',message='确认',confirmation_id=cid),emitter(s,events),p)
        assert s.world.collected==['T01']
        assert json.loads(p.inputs[-1][-1]['output']).get('error')
        assert events[-1]['type']=='run_failed'  # T03 remains eligible; model text cannot claim completion.
    asyncio.run(run())


def test_ripeness_and_reachability_changes_are_used_by_current_observation():
    s=Session()
    s.world.fruits[0]['ripeness_score']=.2
    next(f for f in s.world.fruits if f['fruit_id']=='T05')['reachable']=False
    obs=ObservationManager(s).current()
    assert obs['summary']['eligible_ids']==['T03']
    before=obs['world_revision']
    s.world.fruits[0]['ripeness_score']=.96
    again=ObservationManager(s).current()
    assert again['world_revision']==before+1 and again['summary']['eligible_ids']==['T01','T03']


@pytest.mark.parametrize('kind', ['openai','compatible'])
def test_provider_native_wire_protocol_with_mock_http_transport(kind,monkeypatch):
    """Checks actual Provider serialization/parsing, but performs NO remote API request."""
    import httpx
    monkeypatch.setenv('LLM_PROVIDER',kind)
    monkeypatch.setenv('LLM_MODEL','test-model')
    monkeypatch.setenv('LLM_API_KEY','test-only-not-a-secret')
    monkeypatch.setenv('LLM_BASE_URL','https://provider.invalid/v1')
    bodies=[]
    def handler(request):
        body=json.loads(request.content)
        bodies.append(body)
        if kind=='openai':
            assert request.url.path=='/v1/responses'
            if len(bodies)==1:
                return httpx.Response(200,json={'output':[{'type':'function_call','name':'query_crop_status','arguments':'{}','call_id':'wire1'}]})
            assert body['input'][-1]['type']=='function_call_output'
            return httpx.Response(200,json={'output':[{'type':'message','role':'assistant','content':[{'type':'output_text','text':'已收到工具结果'}]}]})
        assert request.url.path=='/v1/chat/completions'
        if len(bodies)==1:
            return httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':None,'tool_calls':[{'id':'wire1','type':'function','function':{'name':'query_crop_status','arguments':'{}'}}]}}]})
        assert body['messages'][-1]['role']=='tool'
        return httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':'已收到工具结果'}}]})
    original=httpx.AsyncClient
    monkeypatch.setattr('backend.providers.httpx.AsyncClient',lambda **kwargs: original(transport=httpx.MockTransport(handler),**kwargs))
    async def run():
        p=Provider()
        history=[{'role':'user','content':'检查'}]
        response=await p.turn('模拟状态',history,tool_definitions('farmer'))
        history.extend(response['history_items'])
        history.append(p.tool_result('wire1',json.dumps({'available':3})))
        again=await p.turn('更新后的状态',history,tool_definitions('farmer'))
        assert response['calls'][0]['name']=='query_crop_status'
        assert again['text']=='已收到工具结果'
        assert len(bodies)==2 and all(b['parallel_tool_calls'] is False for b in bodies)
    asyncio.run(run())


def test_inflight_observation_reports_stage_derived_holding_not_fake_live_position():
    s=Session()
    s.action_contexts['uuid']={'kind':'harvest','target':'T01','last_index':0,'stages':[{'key':'transport'}]}
    result=ObservationManager(s).current()
    assert {'subject':'T01','predicate':'held_by','object':'ROBOT'} in result['relations']
    fruit=next(e for e in result['entities'] if e['id']=='T01')
    assert fruit['position'] is None and fruit['status']=='in_transit'
    assert result['execution_feedback'][0]['source']=='simulation_stage_feedback'
    assert s.world.fruits[0]['status']=='on_plant' and not s.world.collected
