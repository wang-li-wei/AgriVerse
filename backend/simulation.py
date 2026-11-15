"""Explicit rule policy for offline regression/demo use. It is NOT an LLM or autonomous model."""
import json
import uuid


class SimulationPolicy:
    kind = 'openai'  # Local history uses the Responses-compatible representation.

    def decide(self, context):
        mission, world, request = context['mission'], context['world'], context['request']
        results, authorization = context['invocation_results'], context['authorization']
        names = [r['tool_name'] for r in results]
        def call(name, **args):
            cid = str(uuid.uuid4())
            item = {'type': 'function_call', 'name': name, 'arguments': json.dumps(args, ensure_ascii=False), 'call_id': cid}
            return {'calls': [item], 'history_items': [item], 'text': ''}
        def final(text):
            text = '【模拟规则 Agent】' + text
            return {'calls': [], 'history_items': [{'role': 'assistant', 'content': text}], 'text': text}
        # No hidden retries or timers. Failures return control to the user in this offline policy.
        if results and results[-1]['result'].get('error'):
            return final('工具执行未成功：' + results[-1]['result']['error'] + ' 请重新观察或请求人工处理。')
        if authorization:
            if authorization['kind'] == 'harvest':
                eligible = set(context['observation']['summary']['eligible_ids'])
                # Re-select from the latest observation after EVERY action; never iterate the approved list.
                candidates = [f for f in world['fruits'] if f['fruit_id'] in eligible and
                              f['fruit_id'] in authorization['targets'] and f['fruit_id'] not in mission['completed']]
                if candidates:
                    # Offline policy preserves fixture order; the real Provider independently chooses its tool/target.
                    return call('play_robot_action', action_type='harvest', target_id=candidates[0]['fruit_id'])
                if mission['role'] == 'farmer' and 'generate_farm_report' not in names:
                    return call('generate_farm_report')
                return final(('挑战完成！' if mission['role'] == 'student' else '') + '授权范围内本轮可执行目标已验证完成；未满足条件的目标保留观察。')
            if not world['revealed']:
                return call('play_robot_action', action_type='reveal', target_id='LEAF_01')
            if 'inspect_plant_health' not in names:
                return call('inspect_plant_health', plant_id='P01')
            if 'query_growth_stage' not in names:
                return call('query_growth_stage', plant_id='P01')
            if 'query_environment_history' not in names:
                return call('query_environment_history', days=7)
            if 'query_inspection_records' not in names:
                return call('query_inspection_records', plant_id='P01')
            if 'generate_expert_summary' not in names:
                return call('generate_expert_summary')
            return final('拨叶已验证，补充观察与会诊摘要完成。模拟病斑不能作为真实病害诊断。')
        text, role = request['message'], mission['role']
        if request.get('mission_id') and mission.get('plan') and mission['plan']['kind'] == 'harvest':
            candidates = [t for t in context['observation']['summary']['eligible_ids'] if t in mission['plan']['targets']]
            if candidates and 'get_harvest_plan' not in names:
                return call('get_harvest_plan', target_ids=candidates)
        if role == 'student' and request.get('selected_id'):
            if 'evaluate_student_answer' not in names:
                return call('evaluate_student_answer', target_id=request['selected_id'])
            return final(results[-1]['result'].get('feedback', '请重新选择。'))
        if any(k in text for k in ('温度', '湿度', '环境', '趋势')) and not (role == 'expert' and any(k in text for k in ('病', '异常', 'P01', '会诊', '拨叶'))):
            if 'query_environment_history' not in names:
                return call('query_environment_history', days=7)
            return final('已查询预置环境历史，可查看下方趋势；不是实时传感器数据。')
        if role == 'farmer':
            if '报告' in text:
                if 'generate_farm_report' not in names:
                    return call('generate_farm_report')
                return final(results[-1]['result']['text'])
            if any(k in text for k in ('采摘', '巡检', '成熟', '检查', '今日', '状态', '观察')):
                if 'identify_tomatoes' not in names:
                    return call('identify_tomatoes')
                if 'select_harvest_targets' not in names:
                    return call('select_harvest_targets')
                targets = context['observation']['summary']['eligible_ids']
                if targets and 'get_harvest_plan' not in names:
                    return call('get_harvest_plan', target_ids=targets)
                return final('当前没有满足条件的可采摘果实。')
        if role == 'student':
            parts = [p for p in ('茎秆', '叶片', '花序', '果实') if p in text]
            lesson = any(k in text for k in ('认识', '体验', '学习', '挑战', '番茄', '采摘', '开始'))
            for part in (['茎秆', '叶片', '花序', '果实'] if lesson else parts):
                if part not in world['learned_parts']:
                    return call('explain_plant_part', part=part)
            if lesson:
                if 'explain_ripeness_stage' not in names:
                    return call('explain_ripeness_stage')
                if world['learning'] != 'select':
                    return call('generate_learning_task')
            if parts:
                return final('已讲解植物部位，请在场景中观察茎秆、叶片、花序和果实。')
        if role == 'expert':
            if 'inspect_plant_health' not in names:
                return call('inspect_plant_health', plant_id='P01')
            if not world['revealed']:
                return call('reveal_occluded_area')
            if 'query_growth_stage' not in names:
                return call('query_growth_stage', plant_id='P01')
            if 'query_environment_history' not in names:
                return call('query_environment_history', days=7)
            if 'query_inspection_records' not in names:
                return call('query_inspection_records', plant_id='P01')
            if 'generate_expert_summary' not in names:
                return call('generate_expert_summary')
            return final('已整理模拟观察与历史记录，仍需专家核实。')
        if 'search_agri_knowledge' not in names:
            return call('search_agri_knowledge', query=text)
        return final('本地知识库参考：' + results[-1]['result']['entries'][0]['text'])
