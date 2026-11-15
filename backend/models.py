"""Session-isolated demo world. All timestamps and measurements are fixture data."""
import asyncio
import json
import hashlib
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from pydantic import BaseModel, Field

DATA = Path(__file__).resolve().parent.parent / 'data'

def load(name: str) -> Any:
    return json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))

Role = Literal['farmer', 'student', 'expert']

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    role: Role
    confirmation_id: str | None = None
    selected_id: str | None = None
    mission_id: str | None = None

class ActionAck(BaseModel):
    success: bool
    evidence: dict | None = None

class ActionStage(BaseModel):
    index: int = Field(ge=0, le=20)
    progress: float = Field(ge=0, le=1)

@dataclass
class World:
    fruits: list[dict] = field(default_factory=lambda: deepcopy(load('fruits')))
    plants: list[dict] = field(default_factory=lambda: deepcopy(load('plants')))
    collected: list[str] = field(default_factory=list)
    reports: list[dict] = field(default_factory=list)
    revealed: bool = False
    learning: str = 'idle'
    learned_parts: list[str] = field(default_factory=list)
    revision: int = 0
    _fingerprint: str = field(default='', repr=False)

    def refresh_revision(self) -> int:
        """Detect adapter and business changes, including simulator/test mutations."""
        state = [self.fruits, self.plants, self.collected, self.reports,
                 self.revealed, self.learning, self.learned_parts]
        fingerprint = hashlib.sha256(json.dumps(state, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        if self._fingerprint and fingerprint != self._fingerprint:
            self.revision += 1
        self._fingerprint = fingerprint
        return self.revision

    def snapshot(self) -> dict:
        self.refresh_revision()
        return deepcopy({'fruits': self.fruits, 'plants': self.plants, 'collected': self.collected,
                'revealed': self.revealed, 'learning': self.learning,
                'learned_parts': self.learned_parts, 'reports': self.reports,
                'environment': load('environment_history'), 'records': load('inspection_records'),
                'demo_data': True, 'world_revision': self.revision, 'source': 'simulation', 'is_simulated': True})

    @classmethod
    def restore(cls, data: dict):
        world = cls(**{k: deepcopy(data[k]) for k in (
            'fruits', 'plants', 'collected', 'reports', 'revealed', 'learning', 'learned_parts') if k in data})
        world.revision = data.get('world_revision', 0)
        world.refresh_revision()
        return world


MissionStatus = Literal['queued', 'running', 'waiting_approval', 'waiting_selection', 'verifying',
                        'success', 'failed', 'uncertain', 'cancelled', 'retrying']

class MissionPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_version: int = 0
    world_revision: int = 0
    kind: Literal['harvest', 'reveal']
    targets: list[str]
    steps: list[dict] = Field(default_factory=list)
    approved: bool = False

class Mission(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: Role
    goal: str
    mode: str
    status: MissionStatus = 'queued'
    plan: MissionPlan | None = None
    observation: dict | None = None
    results: list[dict] = Field(default_factory=list)
    attempts: dict[str, int] = Field(default_factory=dict)
    completed: list[str] = Field(default_factory=list)
    last_error: str | None = None
    turns: int = 0
    tool_calls: int = 0
    tool_receipts: dict[str, dict] = Field(default_factory=dict)

@dataclass
class Session:
    world: World = field(default_factory=World)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    pending: dict | None = None
    animations: dict[str, asyncio.Future] = field(default_factory=dict)
    action_contexts: dict[str, dict] = field(default_factory=dict)
    action_receipts: dict[str, dict] = field(default_factory=dict)
    completed_actions: set[tuple[str, str]] = field(default_factory=set)
    history: dict[str, list[dict]] = field(default_factory=lambda: {'farmer': [], 'student': [], 'expert': []})
    id: str | None = None
    mission: Mission | None = None
    missions: dict[str, Mission] = field(default_factory=dict)
    observation: dict | None = None
    memory: Any = None
    verified_actions: dict[str, dict] = field(default_factory=dict)
