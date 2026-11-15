"""SQLite checkpoints and event replay. No model secrets or provider HTTP payloads are stored."""
import json
import sqlite3
from pathlib import Path
from .models import Mission, Session, World
from .execution import now


class MemoryManager:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, checkpoint TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
                    mission_id TEXT, run_id TEXT, seq INTEGER, payload TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS event_session ON events(session_id, cursor);
                CREATE UNIQUE INDEX IF NOT EXISTS event_sequence ON events(session_id, run_id, seq);
            ''')

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def checkpoint(self, session):
        if not session.id:
            return
        data = {'world': session.world.snapshot(), 'history': session.history, 'pending': session.pending,
                'mission_id': session.mission.id if session.mission else None,
                'missions': {k: v.model_dump() for k, v in session.missions.items()},
                'verified_actions': session.verified_actions}
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)',
                       (session.id, json.dumps(data, ensure_ascii=False), now()))

    def append(self, session, event):
        if not session.id:
            return
        with self.connect() as db:
            db.execute('INSERT INTO events(session_id, mission_id, run_id, seq, payload) VALUES (?, ?, ?, ?, ?)',
                       (session.id, event.get('mission_id'), event.get('run_id'), event.get('seq'), json.dumps(event, ensure_ascii=False)))
        self.checkpoint(session)

    def events(self, sid, mission_id=None, after=0, limit=500):
        with self.connect() as db:
            rows = db.execute('SELECT cursor, payload FROM events WHERE session_id=? AND cursor>? '
                              'AND (? IS NULL OR mission_id=?) ORDER BY cursor LIMIT ?',
                              (sid, after, mission_id, mission_id, limit)).fetchall()
        return [{'cursor': cursor, **json.loads(payload)} for cursor, payload in rows]

    def restore(self, sid):
        with self.connect() as db:
            row = db.execute('SELECT checkpoint FROM sessions WHERE id=?', (sid,)).fetchone()
        if not row:
            return None
        data = json.loads(row[0])
        session = Session(id=sid, memory=self, world=World.restore(data['world']))
        session.history, session.pending = data['history'], data['pending']
        session.missions = {k: Mission.model_validate(v) for k, v in data['missions'].items()}
        session.mission = session.missions.get(data['mission_id'])
        session.verified_actions = data.get('verified_actions', {})
        if session.mission and session.mission.status in ('running', 'queued', 'verifying', 'retrying'):
            # A restarted process cannot know how far a client/robot moved. Never replay the action.
            session.mission.status = 'uncertain'
            session.mission.last_error = '服务重启中断任务；动作未自动重放，需重新观察并确认。'
            if session.mission.plan:
                session.mission.plan.approved = False
            session.pending = None
            self.checkpoint(session)
        return session
