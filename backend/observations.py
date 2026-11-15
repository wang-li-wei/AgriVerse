"""Simulation observations. No camera inference or live Three.js transform is implied."""
from copy import deepcopy
from typing import Protocol
import uuid
from pydantic import BaseModel, Field
from .models import World, load
from .execution import now


def harvestable(fruit: dict) -> bool:
    return (fruit['status'] == 'on_plant' and fruit['harvestable'] and
            not fruit['occluded'] and fruit.get('reachable', True) and
            fruit['ripeness_stage'] == 'red' and fruit['ripeness_score'] >= .9)


class Observation(BaseModel):
    observation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    world_revision: int
    timestamp: str = Field(default_factory=now)
    source: str = 'simulation'
    is_simulated: bool = True
    confidence: float = 1.0  # Fixture certainty, NOT perception accuracy.
    entities: list[dict]
    relations: list[dict]
    summary: dict


class PerceptionAdapter(Protocol):
    def observe(self, world: World) -> Observation: ...


class SimulationPerceptionAdapter:
    def observe(self, world: World) -> Observation:
        state = world.snapshot()
        structure = load('plant_structure')
        entities, relations = [], []
        stamp = now()
        def entity(id, type, properties, position=None, status='present'):
            entities.append({'id': id, 'type': type, 'status': status, 'properties': deepcopy(properties),
                             'position': position, 'confidence': 1.0, 'source': 'simulation',
                             'observed_at': stamp, 'world_revision': state['world_revision']})
        def link(subject, predicate, object):
            relations.append({'subject': subject, 'predicate': predicate, 'object': object})
        for plant in state['plants']:
            pid = plant['plant_id']
            entity(pid, 'Plant', plant)
            for region in plant['suspicious_regions']:
                entity(region['region_id'], 'SimulatedLesion', {**region, 'diagnosis': None}, region['position'])
                link(region['region_id'], 'part_of', region['leaflet_id'])
                if region['occluded']:
                    link(region['occluding_leaf_id'], 'occludes', region['region_id'])
        entity('P01_STEM', 'Stem', {'points': structure['stem_points']})
        link('P01_STEM', 'part_of', 'P01')
        for leaf in structure['leaves']:
            lid = leaf['leaf_id']
            entity(lid, 'Leaf', {**leaf, 'pose': 'held_open' if world.revealed and lid == structure['reveal']['occluding_leaf_id'] else 'rest',
                                  'position_semantics': 'fixture_attachment'}, leaf['position'])
            link(lid, 'attached_to', 'P01_STEM')
            ids = [f'{lid}_P{p+1}_{side}' for p in range(leaf['pairs']) for side in ('L', 'R')]
            ids += [f'{lid}_I1', f'{lid}_I2', f'{lid}_TERMINAL']
            for bid in ids:
                entity(bid, 'Leaflet', {'position_semantics': 'local_pose_not_measured'})
                link(bid, 'part_of', lid)
        for truss in structure['trusses']:
            tid = truss['truss_id']
            entity(tid, 'FruitTruss', truss, truss['position'])
            link(tid, 'attached_to', 'P01_STEM')
            for lid in truss['nearby_leaf_ids']:
                link(lid, 'adjacent_to', tid)
        for fruit in state['fruits']:
            props = {**fruit, 'reachable': fruit.get('reachable', True), 'eligible': harvestable(fruit),
                     'position_semantics': 'verified_basket_slot' if fruit['status'] == 'harvested' else 'fixture_rest_position'}
            position = fruit['position']
            if fruit['fruit_id'] in world.collected:
                i = world.collected.index(fruit['fruit_id'])
                position = [1.48 + (i % 2)*.4, .38, 1.18 + (i//2)*.32]
            entity(fruit['fruit_id'], 'Tomato', props, position, fruit['status'])
            link(fruit['fruit_id'], 'part_of', fruit['plant_id'])
            link(fruit['fruit_id'], 'attached_to', 'BASKET' if fruit['status']=='harvested' else fruit['truss_id'])
            if fruit['occluded'] and fruit.get('occluding_leaf_id'):
                link(fruit['occluding_leaf_id'], 'occludes', fruit['fruit_id'])
            if props['reachable']:
                link(fruit['fruit_id'], 'reachable_by', 'ROBOT')
        entity('BASKET', 'Basket', {'fruit_ids': state['collected'], 'count': len(state['collected'])}, structure['robot']['basket'])
        entity('ROBOT', 'Robot', {'adapter': 'simulation', 'pose_semantics': 'home_fixture'}, structure['robot']['home'])
        entity('CAMERA', 'Camera', {'pose': None, 'pose_semantics': 'frontend_not_measured'})
        entity('ENVIRONMENT', 'Environment', {'records': state['environment'], 'is_live': False})
        return Observation(world_revision=state['world_revision'], entities=entities, relations=relations,
                           summary={'eligible_ids': [f['fruit_id'] for f in state['fruits'] if harvestable(f)],
                                    'basket_count': len(state['collected']), 'revealed': world.revealed,
                                    'position_source': 'fixtures_and_verified_business_commits'})


class ObservationManager:
    def __init__(self, session, adapter: PerceptionAdapter | None = None):
        self.session = session
        self.adapter = adapter or SimulationPerceptionAdapter()

    def current(self) -> dict:
        result = self.adapter.observe(self.session.world).model_dump()
        for aid, context in self.session.action_contexts.items():
            index = context.get('last_index', -1)
            stage = context['stages'][index]['key'] if index >= 0 else 'command_received'
            result.setdefault('execution_feedback', []).append({
                'action_uuid': aid, 'target_id': context['target'], 'stage': stage,
                'source': 'simulation_stage_feedback', 'is_simulated': True})
            if context['kind'] == 'harvest' and stage in ('detach', 'transport'):
                result['relations'].append({'subject': context['target'], 'predicate': 'held_by', 'object': 'ROBOT'})
                result['relations'] = [r for r in result['relations'] if not
                                       (r['subject'] == context['target'] and r['predicate'] == 'attached_to')]
                for entity in result['entities']:
                    if entity['id'] == context['target']:
                        entity.update(status='in_transit', position=None)
                        entity['properties']['position_semantics'] = 'stage_only_no_live_transform'
                result['summary']['eligible_ids'] = [t for t in result['summary']['eligible_ids'] if t != context['target']]
        self.session.observation = deepcopy(result)
        if self.session.mission:
            self.session.mission.observation = deepcopy(result)
        return result
