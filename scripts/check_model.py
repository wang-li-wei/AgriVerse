#!/usr/bin/env python3
"""Opt-in live model check: two paid requests, one read-only Skill, no robot actions."""
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv
from backend.models import Session
from backend.providers import Provider
from backend.skills import SkillRunner, tool_definitions


async def check():
    load_dotenv(ROOT / '.env')
    provider = Provider()
    if not provider.enabled:
        return {'ok': False, 'reason': '模型未配置；请在本地 .env 配置服务商、模型和密钥。'}
    async def emit(event):
        pass
    runner = SkillRunner(Session(), 'farmer', emit)
    tools = [t for t in tool_definitions('farmer') if t['name'] == 'query_crop_status']
    history = [{'role': 'user', 'content': '请查询当前可采摘番茄和收集箱数量。'}]
    instructions = ('你是 AgriVerse 农业助手，数据均为模拟数据。第一轮必须调用 query_crop_status，'
                    '不得猜测数字。收到工具结果后，依据 available 和 basket_count 简短中文回答，'
                    '不再调用工具。')
    try:
        first = await provider.turn(instructions, history, tools)
        history.extend(first['history_items'])
        if len(first['calls']) != 1 or first['calls'][0]['name'] != 'query_crop_status':
            return {'ok': False, 'reason': '模型没有返回预期的只读工具调用。'}
        call = first['calls'][0]
        args = json.loads(call['arguments'])
        result = await runner.run(call['name'], args)
        if result.get('error'):
            return {'ok': False, 'reason': result['error']}
        history.append(provider.tool_result(call['call_id'], json.dumps(result, ensure_ascii=False)))
        final = await provider.turn(instructions, history, tools)
        return {'ok': not final['calls'] and bool(final['text']), 'provider': provider.kind,
                'model': provider.model, 'live_model': True, 'simulation_data': True,
                'model_rounds': 2, 'tool': call['name'], 'available': result['available'],
                'basket_count': result['basket_count'], 'answer': final['text']}
    except Exception as error:
        # Provider exception strings/response bodies may contain confidential context.
        return {'ok': False, 'error_type': type(error).__name__,
                'http_status': getattr(getattr(error, 'response', None), 'status_code', None),
                'reason': '模型连接或工具调用失败，未回退为模拟规则；请检查本地配置、余额和网络。'}


if __name__ == '__main__':
    result = asyncio.run(check())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['ok'] else 1)
