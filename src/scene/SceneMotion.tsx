import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";
import type { RobotAction, ExecutionEvent, World } from "../types";
import { HARVEST, actionStage } from "./actionStages";
import { basketPosition, plantModel } from "./plantModel";

export const ease = (from: number, to: number, t: number) =>
  THREE.MathUtils.smoothstep(t, from, to);
export interface MotionFrame {
  action: RobotAction | null;
  progress: number;
  reset: boolean;
  reveal: number;
  touch: number;
  recoil: number;
  fruitWorld: THREE.Vector3;
  origin: THREE.Vector3;
  detached: boolean;
  slot: number;
  originalUuid: string;
  maxGripError: number;
}
type Actor = (frame: MotionFrame, delta: number) => void;
interface MotionRegistry {
  objects: Map<string, THREE.Object3D>;
  actors: Map<string, { priority: number; run: Actor }>;
  ordered: { priority: number; run: Actor }[];
  dirty: boolean;
  frame: MotionFrame;
}
const Context = createContext<MotionRegistry | null>(null);
export function useSceneRegistry() {
  const registry = useContext(Context);
  if (!registry) throw new Error("SceneMotionProvider is required");
  return registry;
}
export function useSceneActor(id: string, priority: number, run: Actor) {
  const registry = useSceneRegistry(),
    callback = useRef(run);
  callback.current = run;
  useEffect(() => {
    registry.actors.set(id, {
      priority,
      run: (frame, delta) => callback.current(frame, delta),
    });
    registry.dirty = true;
    return () => {
      registry.actors.delete(id);
      registry.dirty = true;
    };
  }, [registry, id, priority]);
}
export function useSceneObject(
  id: string,
  object: React.RefObject<THREE.Group | null>,
) {
  const registry = useSceneRegistry();
  useEffect(() => {
    if (object.current) registry.objects.set(id, object.current);
    return () => {
      registry.objects.delete(id);
    };
  }, [registry, id, object]);
}
export function moveHeldFruit(frame: MotionFrame, out: THREE.Vector3) {
  const p = frame.progress,
    origin = frame.origin,
    landing = new THREE.Vector3(...basketPosition(frame.slot));
  const lift = origin.clone().add(new THREE.Vector3(0.08, 0.32, 0.18));
  const over = landing.clone().add(new THREE.Vector3(0, 0.38, 0));
  if (p < HARVEST.lift)
    out.lerpVectors(origin, lift, ease(HARVEST.detach, HARVEST.lift, p));
  else if (p < HARVEST.release) {
    const t = ease(HARVEST.lift, HARVEST.release, p);
    const c1 = lift.clone().add(new THREE.Vector3(0.25, 0.4, 0.42));
    const c2 = over.clone().add(new THREE.Vector3(-0.2, 0.65, 0.3));
    out.copy(new THREE.CubicBezierCurve3(lift, c1, c2, over).getPoint(t));
  } else {
    const t = ease(HARVEST.release, 0.85, p);
    out.lerpVectors(over, landing, t);
    if (p > 0.85 && p < 0.92)
      out.y += Math.sin(ease(0.85, 0.92, p) * Math.PI) * 0.012;
  }
  return out;
}
export interface SceneInspection {
  fruits: Record<string, { uuid: string; position: number[]; parent: string }>;
  leaves: Record<string, { rotation: number[]; position: number[] }>;
  diseasePosition: number[];
  cameraPosition: number[];
  occlusion: { fruit: boolean; disease: boolean };
  diseaseVisible: boolean;
  progress: number;
  action: string | null;
  gripPosition: number[];
  stage: string | null;
  execution: ExecutionEvent[];
  actionData: RobotAction | null;
  world: World | null;
  busy: boolean;
}
declare global {
  interface Window {
    __agriverseScene?: { inspect: () => SceneInspection };
  }
}
export function SceneMotionProvider({ children }: { children: ReactNode }) {
  const { camera, gl, scene } = useThree(),
    previous = useRef<string | null>(null),
    revision = useRef(0);
  const registry = useMemo<MotionRegistry>(
    () => ({
      objects: new Map(),
      actors: new Map(),
      ordered: [],
      dirty: true,
      frame: {
        action: null,
        progress: 0,
        reset: false,
        reveal: 0,
        touch: 0,
        recoil: 0,
        fruitWorld: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        detached: false,
        slot: 0,
        originalUuid: "",
        maxGripError: 0,
      },
    }),
    [],
  );
  // One plant/robot clock. Actors only consume this frame, and never create timers.
  useFrame((_, delta) => {
    const store = useStore.getState(),
      action = store.action,
      f = registry.frame;
    f.reset = revision.current !== store.worldRevision;
    revision.current = store.worldRevision;
    f.action = action;
    f.progress = action
      ? THREE.MathUtils.clamp(
          (performance.now() - action.startedAt) / action.duration_ms,
          0,
          1,
        )
      : 0;
    if (previous.current !== (action?.id ?? null)) {
      previous.current = action?.id ?? null;
      f.detached = false;
      f.maxGripError = 0;
      f.slot = store.world?.collected.length ?? 0;
      const target =
        action?.action_type === "harvest"
          ? action.target_id
          : `${action?.leaf_id ?? plantModel.reveal.occluding_leaf_id}_CONTACT`;
      const object = registry.objects.get(target);
      f.originalUuid = object?.uuid ?? "";
      if (object) {
        object.updateWorldMatrix(true, false);
        object.getWorldPosition(f.origin);
      } else if (action) f.origin.set(...action.position);
    }
    const reveal = action?.action_type === "reveal";
    f.reveal = store.world?.revealed
      ? 1
      : reveal
        ? ease(0.34, 0.6, f.progress)
        : 0;
    f.touch = action
      ? reveal
        ? Math.sin(ease(0.28, 0.95, f.progress) * Math.PI)
        : Math.sin(ease(0.16, 0.98, f.progress) * Math.PI)
      : 0;
    f.recoil =
      action && f.progress > 0.66
        ? Math.sin((f.progress - 0.66) * Math.PI * 12) *
          Math.exp(-(f.progress - 0.66) * 12)
        : 0;
    if (registry.dirty) {
      registry.ordered = [...registry.actors.values()].sort(
        (a, b) => a.priority - b.priority,
      );
      registry.dirty = false;
    }
    try {
      for (const actor of registry.ordered) actor.run(f, Math.min(delta, 0.07));
      if (action && !action.ackSent) {
        const stage = actionStage(action.action_type, f.progress);
        store.reportStage(action.id, stage.index, stage.label, f.progress);
        const fruit = registry.objects.get(action.target_id);
        const grip = registry.objects.get("ROBOT_GRIP");
        if (
          action.action_type === "harvest" &&
          f.progress >= 0.47 &&
          f.progress < 0.75 &&
          fruit &&
          grip
        ) {
          f.maxGripError = Math.max(
            f.maxGripError,
            fruit
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(grip.getWorldPosition(new THREE.Vector3())),
          );
        }
        if (f.progress >= 1) {
          scene.updateMatrixWorld(true);
          if (action.action_type === "harvest") {
            const position = fruit?.getWorldPosition(new THREE.Vector3());
            const verified =
              !!fruit &&
              fruit.uuid === f.originalUuid &&
              f.detached &&
              f.maxGripError < 0.08 &&
              !!position &&
              position.distanceTo(
                new THREE.Vector3(...basketPosition(f.slot)),
              ) < 0.025;
            void store.finishAction(action.id, verified, {
              verified,
              fruit_uuid: fruit?.uuid,
              original_uuid: f.originalUuid,
              position: position?.toArray(),
              max_grip_error: f.maxGripError,
            });
          } else {
            const leaf = registry.objects.get(
              plantModel.reveal.occluding_leaf_id,
            );
            const base = plantModel.leaves.find(
              (l) => l.leaf_id === plantModel.reveal.occluding_leaf_id,
            )!;
            const moved =
              !!leaf && Math.abs(leaf.rotation.y - base.rotation[1]) > 0.5;
            const visible = regionVisible(
              camera,
              scene,
              registry.objects.get("LEAF_01"),
            );
            void store.finishAction(action.id, moved && visible, {
              verified: moved && visible,
              leaf_moved: moved,
              region_visible: visible,
            });
          }
        }
      }
    } catch {
      if (action && !action.ackSent) void store.finishAction(action.id, false);
    }
  });
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      const s = useStore.getState();
      s.setSceneReady(false);
      if (s.action) void s.finishAction(s.action.id, false);
    };
    const restored = () => useStore.getState().setSceneReady(true);
    gl.domElement.addEventListener("webglcontextlost", lost);
    gl.domElement.addEventListener("webglcontextrestored", restored);
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.domElement.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const inspect = (): SceneInspection => {
      scene.updateMatrixWorld(true);
      const fruits: SceneInspection["fruits"] = {},
        leaves: SceneInspection["leaves"] = {},
        point = new THREE.Vector3();
      for (const [id, obj] of registry.objects) {
        if (/^T\d\d$/.test(id))
          fruits[id] = {
            uuid: obj.uuid,
            position: obj.getWorldPosition(new THREE.Vector3()).toArray(),
            parent: obj.parent?.name ?? "",
          };
        if (/^P01_LEAF_\d\d$/.test(id))
          leaves[id] = {
            rotation: obj.rotation.toArray().slice(0, 3) as number[],
            position: obj.getWorldPosition(new THREE.Vector3()).toArray(),
          };
      }
      const cover = registry.objects.get(plantModel.reveal.occluding_leaf_id);
      const blocked = (id: string) => {
        const target = registry.objects.get(id);
        if (!target || !cover) return false;
        target.getWorldPosition(point);
        const direction = point.clone().sub(camera.position),
          distance = direction.length();
        const ray = new THREE.Raycaster(
          camera.position,
          direction.normalize(),
          0.01,
          distance - 0.015,
        );
        return ray.intersectObject(cover, true).length > 0;
      };
      const disease = registry.objects
        .get("LEAF_01")
        ?.getWorldPosition(new THREE.Vector3());
      const diseaseVisible = () => {
        if (!disease) return false;
        const direction = disease.clone().sub(camera.position),
          ray = new THREE.Raycaster(
            camera.position,
            direction.clone().normalize(),
            0.01,
            direction.length() - 0.004,
          );
        return !ray.intersectObjects(scene.children, true).some((hit) => {
          let node: THREE.Object3D | null = hit.object;
          while (node) {
            if (node.name === `${plantModel.reveal.leaflet_id}_BLADE`)
              return false;
            node = node.parent;
          }
          if (hit.object instanceof THREE.Mesh) {
            const mats = Array.isArray(hit.object.material)
              ? hit.object.material
              : [hit.object.material];
            if (mats.every((mat) => mat.transparent && mat.opacity < 0.3))
              return false;
          }
          return hit.object.visible;
        });
      };
      const state = useStore.getState();
      return {
        execution: state.execution[state.role],
        actionData: state.action,
        world: state.world,
        busy: state.busy,
        fruits,
        leaves,
        cameraPosition: camera.position.toArray(),
        diseasePosition: disease?.toArray() ?? [],
        occlusion: { fruit: blocked("T06"), disease: blocked("LEAF_01") },
        diseaseVisible: diseaseVisible(),
        progress: registry.frame.progress,
        action: registry.frame.action?.id ?? null,
        gripPosition:
          registry.objects
            .get("ROBOT_GRIP")
            ?.getWorldPosition(new THREE.Vector3())
            .toArray() ?? [],
        stage: registry.frame.action
          ? actionStage(
              registry.frame.action.action_type,
              registry.frame.progress,
            ).key
          : null,
      };
    };
    window.__agriverseScene = { inspect };
    return () => {
      delete window.__agriverseScene;
    };
  }, [registry, scene, camera]);
  return <Context.Provider value={registry}>{children}</Context.Provider>;
}

function regionVisible(
  camera: THREE.Camera,
  scene: THREE.Scene,
  marker?: THREE.Object3D,
) {
  if (!marker) return false;
  const target = marker.getWorldPosition(new THREE.Vector3());
  const direction = target.clone().sub(camera.position);
  const hits = new THREE.Raycaster(
    camera.position,
    direction.clone().normalize(),
    0.01,
    direction.length() - 0.004,
  ).intersectObjects(scene.children, true);
  return !hits.some((hit) => {
    let node: THREE.Object3D | null = hit.object;
    while (node) {
      if (node.name === `${plantModel.reveal.leaflet_id}_BLADE`) return false;
      node = node.parent;
    }
    if (hit.object instanceof THREE.Mesh) {
      const materials = Array.isArray(hit.object.material)
        ? hit.object.material
        : [hit.object.material];
      if (materials.every((m) => m.transparent && m.opacity < 0.3))
        return false;
    }
    return hit.object.visible;
  });
}
