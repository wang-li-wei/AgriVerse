"""Public execution facts only; no model chain-of-thought or synthetic timers."""
from datetime import datetime, timezone
import uuid


def now():
    return datetime.now(timezone.utc).isoformat()


class ExecutionRun:
    def __init__(self, emit, session=None):
        self.output = emit
        self.id = str(uuid.uuid4())
        self.seq = 0
        self.failed = False
        self.session = session
        self.action_steps = {}

    async def emit(self, event):
        self.seq += 1
        event = {**event, 'run_id': self.id, 'seq': self.seq, 'timestamp': now()}
        if self.session:
            mission = self.session.mission
            event.update(mission_id=mission.id if mission else None,
                         world_revision=self.session.world.refresh_revision(),
                         event_type=event['type'])
            if event['type'] == 'action':
                event['action_uuid'] = event['id']
                self.action_steps[event['id']] = event.get('step_id')
            elif event.get('action_id'):
                event['action_uuid'] = event['action_id']
                event['step_id'] = self.action_steps.get(event['action_id'])
            if self.session.memory:
                self.session.memory.append(self.session, event)
        if event['type'] == 'tool' and event.get('status') == 'failed':
            self.failed = True
        if event['type'] == 'run_failed':
            self.failed = True
        if event['type'] == 'run_completed':
            self.failed = False
        await self.output(event)
        if event['type'] == 'tool' and event['status'] != 'queued':
            await self.emit({'type': 'tool_call', 'phase': 'tool', 'tool_name': event['name'],
                             'call_id': event['id'], 'target_id': event['args'].get('target_id'),
                             'status': {'running': 'started', 'success': 'completed', 'failed': 'failed'}[event['status']],
                             'message': event['label'], 'args': event['args'], 'result': event.get('result')})
