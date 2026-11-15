"""Provider configuration and wire tests: local MockTransport, no real credentials or paid calls."""
import asyncio
from copy import deepcopy
import json
import httpx
import pytest
from backend.providers import Provider, chat_history
from backend.skills import tool_definitions


def configure(monkeypatch, kind='deepseek'):
    monkeypatch.setenv('LLM_PROVIDER', kind)
    monkeypatch.setenv('LLM_API_KEY', 'test-only-placeholder')
    monkeypatch.delenv('LLM_MODEL', raising=False)
    monkeypatch.delenv('LLM_BASE_URL', raising=False)


def test_deepseek_defaults_and_empty_key_stay_disabled(monkeypatch):
    configure(monkeypatch)
    p=Provider()
    assert p.enabled and p.model=='deepseek-flash' and p.base=='https://api.deepseek.com'
    monkeypatch.setenv('LLM_API_KEY','')
    assert Provider().enabled is False
    monkeypatch.setenv('LLM_PROVIDER','demo')
    assert Provider().enabled is False


def test_responses_demo_history_becomes_valid_chat_without_mutating_memory():
    history=[
        {'role':'user','content':'观察'},
        {'type':'reasoning','summary':[{'text':'private reasoning'}]},
        {'type':'function_call','name':'inspect_greenhouse','arguments':'{}','call_id':'one'},
        {'type':'function_call','name':'query_crop_status','arguments':'{}','call_id':'two'},
        {'type':'function_call_output','call_id':'one','output':'{"fruit_count":6}'},
        {'type':'function_call_output','call_id':'two','output':'{"available":3}'},
        {'type':'message','id':'old-response-id','status':'completed','role':'assistant',
         'content':[{'type':'output_text','text':'共有三颗。'}]},
    ]
    old=deepcopy(history)
    converted=chat_history(history)
    assert history==old
    assert len(converted)==5
    assert [c['id'] for c in converted[1]['tool_calls']]==['one','two']
    assert converted[2]['tool_call_id']=='one' and converted[3]['tool_call_id']=='two'
    assert converted[-1]=={'role':'assistant','content':'共有三颗。'}
    assert 'private reasoning' not in json.dumps(converted)
    assert all('type' not in m and '_responses_calls' not in m for m in converted)


def test_deepseek_tool_roundtrip_uses_stable_schema_and_hides_reasoning(monkeypatch):
    configure(monkeypatch)
    bodies=[]
    def handler(request):
        body=json.loads(request.content);bodies.append(body)
        assert request.url=='https://api.deepseek.com/chat/completions'
        assert body['thinking']=={'type':'disabled'} and body['max_tokens']==2048
        assert body['parallel_tool_calls'] is False
        assert all('strict' not in t['function'] for t in body['tools'])
        if len(bodies)==1:
            return httpx.Response(200,json={'choices':[{'finish_reason':'tool_calls','message':{
                'role':'assistant','content':None,'reasoning_content':'not-public',
                'tool_calls':[{'id':'deepseek1','type':'function','function':{'name':'query_crop_status','arguments':'{}'}}]}}]})
        assert body['messages'][-1]=={'role':'tool','tool_call_id':'deepseek1','content':'{"available":3}'}
        assert 'not-public' not in json.dumps(body)
        return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{
            'role':'assistant','content':'三颗可采摘。','tool_calls':None,'reasoning_content':'not-public-either'}}]})
    client=httpx.AsyncClient
    monkeypatch.setattr('backend.providers.httpx.AsyncClient',lambda **kw: client(transport=httpx.MockTransport(handler),**kw))
    async def run():
        p=Provider();history=[{'role':'user','content':'查询'}]
        first=await p.turn('模拟场景',history,tool_definitions('farmer'))
        history.extend(first['history_items'])
        assert 'reasoning_content' not in history[-1]
        history.append(p.tool_result(first['calls'][0]['call_id'],'{"available":3}'))
        second=await p.turn('当前可采三颗',history,tool_definitions('farmer'))
        assert not second['calls'] and second['text']=='三颗可采摘。'
        assert 'reasoning_content' not in second['history_items'][0]
    asyncio.run(run())


@pytest.mark.parametrize('status',[401,402,429,500])
def test_remote_errors_are_not_replaced_by_demo(monkeypatch,status):
    configure(monkeypatch)
    client=httpx.AsyncClient
    def handler(request): return httpx.Response(status,json={'error':{'message':'upstream error'}})
    monkeypatch.setattr('backend.providers.httpx.AsyncClient',lambda **kw: client(transport=httpx.MockTransport(handler),**kw))
    async def run():
        p=Provider()
        with pytest.raises(httpx.HTTPStatusError):
            await p.turn('状态',[{'role':'user','content':'查询'}],tool_definitions('farmer'))
        assert p.enabled and p.kind=='deepseek'
    asyncio.run(run())


def test_truncated_completion_is_not_a_successful_final_answer(monkeypatch):
    configure(monkeypatch)
    client=httpx.AsyncClient
    def handler(request):
        return httpx.Response(200,json={'choices':[{'finish_reason':'length','message':{'role':'assistant','content':'已完成...'}}]})
    monkeypatch.setattr('backend.providers.httpx.AsyncClient',lambda **kw: client(transport=httpx.MockTransport(handler),**kw))
    async def run():
        with pytest.raises(ValueError,match='长度上限'):
            await Provider().turn('状态',[{'role':'user','content':'查询'}],tool_definitions('farmer'))
    asyncio.run(run())
