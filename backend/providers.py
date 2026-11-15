"""Responses, compatible Chat Completions, and DeepSeek without exposing reasoning."""
import os
from copy import deepcopy
import httpx


def chat_history(history: list[dict]) -> list[dict]:
    """Translate saved Responses/demo facts into chat messages without mutating memory."""
    messages = []
    for item in history:
        kind = item.get('type')
        if kind == 'reasoning':
            continue
        if kind == 'function_call':
            call = {'id': item['call_id'], 'type': 'function',
                    'function': {'name': item['name'], 'arguments': item['arguments']}}
            if messages and messages[-1].get('_responses_calls'):
                messages[-1]['tool_calls'].append(call)
            else:
                messages.append({'role': 'assistant', 'content': None, 'tool_calls': [call], '_responses_calls': True})
        elif kind == 'function_call_output':
            messages.append({'role': 'tool', 'tool_call_id': item['call_id'], 'content': item['output']})
        elif item.get('role') in ('user', 'assistant', 'system', 'tool'):
            message = {k: deepcopy(item[k]) for k in ('role', 'content', 'tool_calls', 'tool_call_id') if k in item}
            if isinstance(message.get('content'), list):
                message['content'] = '\n'.join(c.get('text', '') for c in message['content']
                                                if c.get('type') in ('text', 'input_text', 'output_text'))
            messages.append(message)
    for message in messages:
        message.pop('_responses_calls', None)
    return messages


class Provider:
    def __init__(self):
        self.kind = os.getenv('LLM_PROVIDER', 'demo').strip().lower()
        self.key = os.getenv('LLM_API_KEY', '').strip()
        deepseek = self.kind == 'deepseek'
        self.model = (os.getenv('LLM_MODEL') or ('deepseek-flash' if deepseek else '')).strip()
        self.base = (os.getenv('LLM_BASE_URL') or ('https://api.deepseek.com' if deepseek else 'https://api.openai.com/v1')).rstrip('/')
        self.enabled = self.kind in ('openai', 'compatible', 'deepseek') and bool(self.key and self.model)

    async def turn(self, instructions: str, history: list[dict], tools: list[dict]) -> dict:
        headers = {'Authorization': f'Bearer {self.key}'}
        async with httpx.AsyncClient(timeout=60) as client:
            if self.kind == 'openai':
                response = await client.post(f'{self.base}/responses', headers=headers, json={
                    'model': self.model, 'instructions': instructions, 'input': history, 'tools': tools,
                    'parallel_tool_calls': False, 'store': False})
                response.raise_for_status()
                data = response.json()
                output = data.get('output', [])
                calls = [{'name': item['name'], 'arguments': item['arguments'], 'call_id': item['call_id']}
                         for item in output if item.get('type') == 'function_call']
                text = '\n'.join(c.get('text', '') for item in output if item.get('type') == 'message'
                                 for c in item.get('content', []) if c.get('type') == 'output_text')
                return {'calls': calls, 'text': text, 'history_items': output}
            payload = {
                'model': self.model, 'messages': [{'role': 'system', 'content': instructions}, *chat_history(history)],
                'tools': [{'type': 'function', 'function': {k: v for k, v in tool.items()
                           if k != 'type' and not (self.kind == 'deepseek' and k == 'strict')}} for tool in tools],
                'parallel_tool_calls': False}
            if self.kind == 'deepseek':
                # Stable endpoint: strict is beta-only. Backend Pydantic validation remains mandatory.
                payload.update(thinking={'type': 'disabled'}, max_tokens=2048)
            response = await client.post(f'{self.base}/chat/completions', headers=headers, json=payload)
            response.raise_for_status()
            message = response.json()['choices'][0]['message']
            if response.json()['choices'][0].get('finish_reason') == 'length':
                raise ValueError('模型输出达到长度上限，任务未确认完成。请缩小本次任务。')
            calls = [{'name': t['function']['name'], 'arguments': t['function']['arguments'], 'call_id': t['id']}
                     for t in (message.get('tool_calls') or [])]
            return {'calls': calls, 'text': message.get('content') or '', 'history_items': chat_history([message])}

    def tool_result(self, call_id: str, output: str) -> dict:
        if self.kind == 'openai':
            return {'type': 'function_call_output', 'call_id': call_id, 'output': output}
        return {'role': 'tool', 'tool_call_id': call_id, 'content': output}
