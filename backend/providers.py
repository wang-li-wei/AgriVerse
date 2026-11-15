"""Provider adapters: Responses API and optional compatible Chat Completions."""
import os
import httpx

class Provider:
    def __init__(self):
        self.kind = os.getenv('LLM_PROVIDER', 'demo').lower()
        self.key = os.getenv('LLM_API_KEY', '')
        self.model = os.getenv('LLM_MODEL', '')
        self.base = os.getenv('LLM_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
        self.enabled = self.kind in ('openai', 'compatible') and bool(self.key and self.model)

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
            response = await client.post(f'{self.base}/chat/completions', headers=headers, json={
                'model': self.model, 'messages': [{'role': 'system', 'content': instructions}, *history],
                'tools': [{'type': 'function', 'function': {k: v for k, v in tool.items() if k != 'type'}} for tool in tools],
                'parallel_tool_calls': False})
            response.raise_for_status()
            message = response.json()['choices'][0]['message']
            calls = [{'name': t['function']['name'], 'arguments': t['function']['arguments'], 'call_id': t['id']}
                     for t in message.get('tool_calls', [])]
            return {'calls': calls, 'text': message.get('content') or '', 'history_items': [message]}

    def tool_result(self, call_id: str, output: str) -> dict:
        if self.kind == 'openai':
            return {'type': 'function_call_output', 'call_id': call_id, 'output': output}
        return {'role': 'tool', 'tool_call_id': call_id, 'content': output}
