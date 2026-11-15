import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SceneLabel as Html } from "./SceneLabel";
import { useStore } from "../store";
import type { Fruit, Vec3 } from "../types";
import {
  leafGeometries,
  simpleLeafGeometries,
  veinGeometries,
  diseaseGeometries,
  diseaseMat,
  leafMaterials,
  leafHighlightMat,
  veinMat,
  tomatoGeo,
  stemMat,
  matureMat,
  turningMat,
  greenMat,
  sepalGeo,
  calyxMat,
  leafSurface,
  surfaceNormal,
} from "./geometry";
import { HARVEST } from "./actionStages";
import { plantModel, basketPosition } from "./plantModel";
import type { LeafDefinition, TrussDefinition } from "./plantModel";
import {
  useSceneActor,
  useSceneObject,
  moveHeldFruit,
  ease,
} from "./SceneMotion";

// Numeric keys avoid reallocating tubes when a React parent produces a new points array.
const stemCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function colorMaterial(color: string) {
  if (!materialCache.has(color))
    materialCache.set(
      color,
      new THREE.MeshStandardMaterial({ color, roughness: 0.92 }),
    );
  return materialCache.get(color)!;
}
export function Stem({
  points,
  radius = 0.025,
  color,
  taper = 1,
}: {
  points: Vec3[];
  radius?: number;
  color?: string;
  taper?: number;
}) {
  const key = JSON.stringify([points, radius, taper]);
  if (!stemCache.has(key)) {
    const curve = new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(...p)),
      ),
      segments = 20;
    const geometry = new THREE.TubeGeometry(curve, segments, radius, 6, false),
      p = geometry.attributes.position;
    if (taper !== 1)
      for (let i = 0; i <= segments; i++) {
        const center = curve.getPointAt(i / segments),
          factor = THREE.MathUtils.lerp(1, taper, i / segments);
        for (let j = 0; j <= 6; j++) {
          const n = i * 7 + j;
          p.setXYZ(
            n,
            center.x + (p.getX(n) - center.x) * factor,
            center.y + (p.getY(n) - center.y) * factor,
            center.z + (p.getZ(n) - center.z) * factor,
          );
        }
      }
    geometry.computeVertexNormals();
    stemCache.set(key, geometry);
  }
  return (
    <mesh
      geometry={stemCache.get(key)}
      material={color ? colorMaterial(color) : stemMat}
      castShadow
      dispose={null}
    />
  );
}
export function Leaf({
  leafId,
  leafletId,
  variant = 0,
  tone = 1,
  simple = false,
  disease = false,
}: {
  leafId: string;
  leafletId: string;
  variant?: number;
  tone?: number;
  simple?: boolean;
  disease?: boolean;
}) {
  const selected = useStore(
      (s) => s.selected === leafId || (disease && s.selected === "LEAF_01"),
    ),
    highlight = useStore((s) => s.highlight === "叶片");
  const marker = useRef<THREE.Group>(null);
  useSceneObject(disease ? "LEAF_01" : `${leafletId}_SURFACE`, marker);
  const surface = leafSurface(0.5, 0, variant).addScaledVector(
    surfaceNormal(0.5, 0, variant),
    0.003,
  );
  return (
    <group
      name={`${leafletId}_BLADE`}
      userData={{ leaf_id: leafId, leaflet_id: leafletId }}
      onClick={
        simple
          ? undefined
          : (e) => {
              e.stopPropagation();
              useStore.getState().select(disease ? "LEAF_01" : leafId);
            }
      }
      dispose={null}
    >
      <mesh
        geometry={(simple ? simpleLeafGeometries : leafGeometries)[variant]}
        material={
          !simple && !disease && (selected || highlight)
            ? leafHighlightMat
            : leafMaterials[tone]
        }
        castShadow={!simple}
      />
      {!simple && (
        <mesh geometry={veinGeometries[variant]} material={veinMat} />
      )}
      {disease && (
        <mesh
          name="SIMULATED_LESIONS"
          geometry={diseaseGeometries[variant]}
          material={diseaseMat}
        />
      )}
      <group ref={marker} position={surface} />
    </group>
  );
}
interface LeafletDefinition {
  id: string;
  position: Vec3;
  side: number;
  scale: number;
  variant: number;
  terminal?: boolean;
  intercalary?: boolean;
}
function Leaflet({
  definition,
  leaf,
  simple,
}: {
  definition: LeafletDefinition;
  leaf: LeafDefinition;
  simple: boolean;
}) {
  const pivot = useRef<THREE.Group>(null),
    d = definition;
  const disease = d.id === plantModel.reveal.leaflet_id;
  useSceneActor(d.id, 30, (frame, delta) => {
    if (!pivot.current || simple) return;
    const affected =
      frame.action?.leaf_id === leaf.leaf_id ||
      frame.action?.affected_leaf_ids?.includes(leaf.leaf_id);
    const lag = affected
      ? Math.sin((frame.progress - 0.07 * (d.variant + 1)) * Math.PI * 2) *
          frame.touch *
          0.045 +
        frame.recoil * 0.02
      : 0;
    const target = (d.intercalary ? -0.12 : -0.04) + lag;
    pivot.current.rotation.x = frame.reset
      ? target
      : THREE.MathUtils.damp(pivot.current.rotation.x, target, 8, delta);
    pivot.current.rotation.z = frame.reset
      ? 0
      : THREE.MathUtils.damp(pivot.current.rotation.z, lag * 0.6, 7, delta);
  });
  const end: Vec3 = d.terminal
    ? [0.07, 0.015, 0]
    : [0.065, -0.02, d.side * 0.095];
  return (
    <group ref={pivot} name={d.id} position={d.position}>
      <Stem
        points={[[0, 0, 0], [0.035, 0.014, end[2] * 0.45], end]}
        radius={d.intercalary ? 0.004 : 0.006}
      />
      <group
        position={end}
        rotation={[
          d.terminal ? 0.13 : d.side * (0.12 + d.variant * 0.09),
          d.terminal ? 0 : -d.side * (0.91 + d.variant * 0.1),
          d.terminal ? 0.07 : -0.11 - d.variant * 0.045,
        ]}
        scale={[
          d.scale *
            (d.intercalary ? 0.83 : d.terminal ? 1 : 0.94 + d.variant * 0.045),
          d.scale,
          d.scale * (d.terminal ? 1.18 : d.intercalary ? 0.88 : 1.06),
        ]}
      >
        <Leaf
          leafId={leaf.leaf_id}
          leafletId={d.id}
          variant={d.variant}
          tone={
            leaf.leaf_id === plantModel.reveal.carrier_leaf_id
              ? 1
              : leaf.position[1] > 2.9
                ? 2
                : leaf.variant % 2
          }
          simple={simple}
          disease={disease}
        />
      </group>
    </group>
  );
}
export function CompoundLeaf({
  definition: leaf,
  simple = false,
}: {
  definition: LeafDefinition;
  simple?: boolean;
}) {
  const root = useRef<THREE.Group>(null),
    distal = useRef<THREE.Group>(null),
    contact = useRef<THREE.Group>(null);
  useSceneObject(leaf.leaf_id, root);
  useSceneObject(`${leaf.leaf_id}_CONTACT`, contact);
  const leaflets = useMemo(() => {
    const result: LeafletDefinition[] = [];
    for (let pair = 0; pair < leaf.pairs; pair++)
      for (const side of [-1, 1])
        result.push({
          id: `${leaf.leaf_id}_P${pair + 1}_${side < 0 ? "L" : "R"}`,
          position: [
            0.09 + pair * (0.64 / (leaf.pairs - 1)) + (side > 0 ? 0.028 : 0),
            0.02 + Math.sin(pair) * 0.012,
            0,
          ],
          side,
          scale: (0.73 - pair * 0.048) * (side < 0 ? 1 : 0.9),
          variant: (leaf.variant + pair + (side > 0 ? 1 : 0)) % 3,
        });
    if (!simple)
      for (let i = 0; i < 2; i++)
        result.push({
          id: `${leaf.leaf_id}_I${i + 1}`,
          position: [0.22 + i * 0.31, 0.025, 0],
          side: i % 2 ? 1 : -1,
          scale: 0.22 + i * 0.025,
          variant: (leaf.variant + i) % 3,
          intercalary: true,
        });
    result.push({
      id: `${leaf.leaf_id}_TERMINAL`,
      position: [0.86, 0.03, 0],
      side: 0,
      scale: leaf.terminal_scale ?? 0.78,
      variant: leaf.variant,
      terminal: true,
    });
    return result;
  }, [leaf, simple]);
  useSceneActor(leaf.leaf_id, 20, (frame, delta) => {
    if (!root.current || !distal.current || simple) return;
    const cover = leaf.leaf_id === plantModel.reveal.occluding_leaf_id;
    const active = frame.action?.leaf_id === leaf.leaf_id;
    const nearby =
      frame.action?.affected_leaf_ids?.includes(leaf.leaf_id) ?? false;
    const push = cover ? frame.reveal : 0,
      feedback = (active || nearby ? frame.touch : 0) * (active ? 0.07 : 0.055);
    const targets = leaf.rotation.map(
      (v, i) =>
        v +
        push * plantModel.reveal.open_rotation[i] +
        (i === 0 ? feedback : 0) +
        (i === 2 ? frame.recoil * (active ? 0.035 : nearby ? 0.012 : 0) : 0),
    );
    for (const axis of [0, 1, 2] as const) {
      const key = (["x", "y", "z"] as const)[axis];
      root.current.rotation[key] = frame.reset
        ? targets[axis]
        : THREE.MathUtils.damp(
            root.current.rotation[key],
            targets[axis],
            11,
            delta,
          );
    }
    const bend = push * 0.1 + feedback * 0.7;
    distal.current.rotation.z = frame.reset
      ? bend
      : THREE.MathUtils.damp(distal.current.rotation.z, bend, 10, delta);
  });
  const renderLeaflet = (d: LeafletDefinition, distalPart: boolean) => (
    <Leaflet
      key={d.id}
      definition={
        distalPart
          ? {
              ...d,
              position: [
                d.position[0] - 0.44,
                d.position[1] - 0.028,
                d.position[2],
              ],
            }
          : d
      }
      leaf={leaf}
      simple={simple}
    />
  );
  return (
    <group
      ref={root}
      name={leaf.leaf_id}
      userData={{ leaf_id: leaf.leaf_id, kind: "compound_leaf" }}
      position={leaf.position}
      rotation={leaf.rotation}
      scale={leaf.scale}
    >
      <group name="Petiole">
        <Stem
          points={[
            [0, 0, 0],
            [0.11, 0.045, 0],
            [0.22, 0.025, 0],
          ]}
          radius={0.016}
          taper={0.72}
        />
      </group>
      <group name="Rachis" position={[0.22, 0.025, 0]}>
        <Stem
          points={[
            [0, 0, 0],
            [0.2, 0.035, 0],
            [0.44, 0.028, 0],
          ]}
          radius={0.012}
          taper={0.7}
        />
        <group name="PrimaryLeaflets">
          {leaflets
            .filter((d) => d.position[0] < 0.44 && !d.intercalary)
            .map((d) => renderLeaflet(d, false))}
        </group>
        <group name="IntercalaryLeaflets">
          {leaflets
            .filter((d) => d.position[0] < 0.44 && d.intercalary)
            .map((d) => renderLeaflet(d, false))}
        </group>
        <group ref={distal} name="DistalRachis" position={[0.44, 0.028, 0]}>
          <Stem
            points={[
              [0, 0, 0],
              [0.22, 0.008, 0],
              [0.45, 0.002, 0],
            ]}
            radius={0.008}
            taper={0.4}
          />
          {leaflets
            .filter((d) => d.position[0] >= 0.44)
            .map((d) => renderLeaflet(d, true))}
        </group>
        <group ref={contact} position={[0.53, 0.035, 0]} />
      </group>
    </group>
  );
}
export function Tomato({
  fruit,
  decorative = false,
  position = [0, 0, 0],
  scale = 1,
}: {
  fruit?: Fruit;
  decorative?: boolean;
  position?: Vec3;
  scale?: number;
}) {
  const root = useRef<THREE.Group>(null),
    ring = useRef<THREE.Mesh>(null),
    [hovered, setHovered] = useState(false);
  const selected = useStore((s) => s.selected === fruit?.fruit_id),
    highlight = useStore((s) => s.highlight === "果实");
  const lit = !decorative && (hovered || selected || highlight),
    id = fruit?.fruit_id ?? `DECOR_${position.join("_")}_${scale}`;
  useSceneObject(id, root);
  useSceneActor(id, 40, (frame) => {
    if (!root.current) return;
    if (ring.current) ring.current.rotation.z = frame.progress * Math.PI * 0.7;
    if (!fruit) return;
    const state = useStore.getState().world,
      f =
        state?.fruits.find((item) => item.fruit_id === fruit.fruit_id) ?? fruit;
    const active =
      frame.action?.action_type === "harvest" &&
      frame.action.target_id === f.fruit_id;
    if (f.status === "harvested") {
      const world = new THREE.Vector3(
        ...basketPosition(
          Math.max(0, state?.collected.indexOf(f.fruit_id) ?? 0),
        ),
      );
      root.current.parent?.updateWorldMatrix(true, false);
      root.current.position.copy(
        root.current.parent?.worldToLocal(world) ?? world,
      );
    } else if (active && frame.progress >= HARVEST.detach) {
      if (!frame.detached) {
        root.current.updateWorldMatrix(true, false);
        root.current.getWorldPosition(frame.origin);
        frame.detached = true;
      }
      moveHeldFruit(frame, frame.fruitWorld);
      root.current.parent?.updateWorldMatrix(true, false);
      root.current.position.copy(
        root.current.parent?.worldToLocal(frame.fruitWorld.clone()) ??
          frame.fruitWorld,
      );
    } else {
      root.current.position.set(...position);
      if (active) {
        root.current.updateWorldMatrix(true, false);
        root.current.getWorldPosition(frame.fruitWorld);
      }
    }
    root.current.visible = true;
  });
  const material =
    fruit?.ripeness_stage === "green"
      ? greenMat
      : fruit?.ripeness_stage === "turning"
        ? turningMat
        : matureMat;
  return (
    <group
      ref={root}
      name={fruit?.fruit_id ?? "DECORATIVE_FRUIT"}
      userData={{ fruit_id: fruit?.fruit_id }}
      position={position}
      scale={scale}
      onClick={
        decorative
          ? undefined
          : (e) => {
              e.stopPropagation();
              if (fruit) useStore.getState().select(fruit.fruit_id);
            }
      }
      onPointerOver={
        decorative
          ? undefined
          : (e) => {
              e.stopPropagation();
              setHovered(true);
              document.body.style.cursor = "pointer";
            }
      }
      onPointerOut={
        decorative
          ? undefined
          : () => {
              setHovered(false);
              document.body.style.cursor = "";
            }
      }
      dispose={null}
    >
      <mesh geometry={tomatoGeo} material={material} castShadow receiveShadow />
      <group name="Calyx" position={[0, 0.151, 0]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            rotation={[
              0.04 * Math.sin(i * 2),
              (i * Math.PI * 2) / 5,
              -0.08 + i * 0.025,
            ]}
            scale={0.87 + (i % 3) * 0.07}
            geometry={sepalGeo}
            material={calyxMat}
          />
        ))}
      </group>
      <mesh position={[0, 0.19, 0]} material={stemMat}>
        <cylinderGeometry args={[0.014, 0.021, 0.08, 6]} />
      </mesh>
      {lit && (
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.23, 0.007, 8, 40]} />
          <meshBasicMaterial color="#f6e3ae" transparent opacity={0.85} />
        </mesh>
      )}
      {fruit && (
        <Html
          style={{ display: hovered || selected ? "block" : "none" }}
          position={[0.2, 0.04, 0.09]}
          center
          zIndexRange={[12, 0]}
        >
          <button
            className={`fruit-label ${selected ? "active" : ""}`}
            onClick={() => useStore.getState().select(fruit.fruit_id)}
            aria-label={`选择果实 ${fruit.fruit_id}`}
          >
            {fruit.fruit_id}
          </button>
        </Html>
      )}
    </group>
  );
}
function Pedicel({
  fruit,
  truss,
  attachment,
}: {
  fruit: Fruit;
  truss: TrussDefinition;
  attachment: Vec3;
}) {
  const pivot = useRef<THREE.Group>(null);
  const relative = fruit.position.map(
    (v, i) => v - truss.position[i] - attachment[i],
  ) as Vec3;
  useSceneActor(`${fruit.fruit_id}_PEDICEL`, 25, (frame, delta) => {
    if (!pivot.current) return;
    const active =
      frame.action?.target_id === fruit.fruit_id &&
      frame.action.action_type === "harvest";
    const bend = active
      ? (1 - ease(HARVEST.detach, 0.67, frame.progress)) *
        ease(0.26, 0.46, frame.progress) *
        0.09
      : 0;
    pivot.current.rotation.z = frame.reset
      ? 0
      : THREE.MathUtils.damp(
          pivot.current.rotation.z,
          bend + frame.recoil * (active ? 0.025 : 0),
          12,
          delta,
        );
  });
  return (
    <group ref={pivot} name={`${fruit.fruit_id}_PEDICEL`} position={attachment}>
      <Stem
        points={[
          [0, 0, 0],
          [relative[0] * 0.43, relative[1] * 0.36 + 0.1, relative[2] * 0.45],
          [relative[0] * 0.94, relative[1] + 0.29, relative[2] * 0.95],
          [relative[0], relative[1] + 0.23, relative[2]],
        ]}
        radius={0.017}
        taper={0.75}
      />
      <Tomato fruit={fruit} position={relative} />
    </group>
  );
}
export function FruitTruss({ definition }: { definition: TrussDefinition }) {
  const root = useRef<THREE.Group>(null),
    fruits = useStore((s) => s.world?.fruits ?? []);
  // Anchor each branch on the rendered rachis, rather than near a control point.
  const attachments = useMemo(() => {
    const axis = new THREE.CatmullRomCurve3(
      definition.axis.slice(1).map((p) => new THREE.Vector3(...p)),
    ).getPoints(160);
    return definition.attachments.map((p) => {
      const target = new THREE.Vector3(...p);
      return axis
        .reduce(
          (best, sample) =>
            sample.distanceToSquared(target) < best.distanceToSquared(target)
              ? sample
              : best,
          axis[0],
        )
        .toArray() as Vec3;
    });
  }, [definition]);
  useSceneObject(definition.truss_id, root);
  useSceneActor(definition.truss_id, 15, (frame, delta) => {
    if (!root.current) return;
    const active = frame.action?.truss_id === definition.truss_id;
    const sway = active ? frame.touch * 0.025 + frame.recoil * 0.035 : 0;
    root.current.rotation.z = frame.reset
      ? 0
      : THREE.MathUtils.damp(root.current.rotation.z, sway, 10, delta);
  });
  return (
    <group ref={root} name={definition.truss_id} position={definition.position}>
      <group name="Peduncle">
        <Stem points={definition.axis.slice(0, 2)} radius={0.03} taper={0.82} />
      </group>
      <group name="Rachis">
        <Stem points={definition.axis.slice(1)} radius={0.024} taper={0.66} />
      </group>
      {definition.fruit_ids.map((id, i) => {
        const fruit = fruits.find((f) => f.fruit_id === id);
        return fruit ? (
          <Pedicel
            key={id}
            fruit={fruit}
            truss={definition}
            attachment={attachments[i]}
          />
        ) : null;
      })}
    </group>
  );
}
function Flower({ position }: { position: Vec3 }) {
  const highlight = useStore((s) => s.highlight === "花序");
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().select("FLOWER");
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.sin(i * 1.26) * 0.055, Math.cos(i * 1.26) * 0.055, 0]}
          scale={[0.035, 0.075, 0.015]}
          rotation={[0, 0, -i * 1.26]}
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial
            color={highlight ? "#fff8a6" : "#d6b64c"}
            roughness={0.9}
          />
        </mesh>
      ))}
      <mesh>
        <sphereGeometry args={[0.028, 8, 6]} />
        <meshStandardMaterial color="#ac8c31" />
      </mesh>
    </group>
  );
}
export function MainPlant() {
  const root = useRef<THREE.Group>(null),
    highlight = useStore((s) => s.highlight === "茎秆");
  useSceneObject("P01", root);
  useSceneActor("P01", 10, (frame, delta) => {
    if (!root.current) return;
    const sway = frame.touch * 0.008 + frame.recoil * 0.004;
    root.current.rotation.z = frame.reset
      ? 0
      : THREE.MathUtils.damp(root.current.rotation.z, sway, 7, delta);
  });
  return (
    <group>
      <Stem
        points={[
          [0, 4.25, -0.2],
          [0, 4.25, 1.3],
        ]}
        radius={0.009}
        color="#9ca88d"
      />
      <Stem
        points={[
          [0.01, 0.45, -0.075],
          [0.025, 2, -0.075],
          [0.015, 4.25, -0.075],
        ]}
        radius={0.005}
        color="#b8b18d"
      />
      <group ref={root} name="P01">
        <group
          onClick={(e) => {
            e.stopPropagation();
            useStore.getState().select("P01");
          }}
        >
          <Stem
            points={plantModel.stem_points}
            radius={0.046}
            taper={0.36}
            color={highlight ? "#a1b86d" : undefined}
          />
        </group>
        {[0.82, 1.55, 2.35, 3.05].map((y) => (
          <mesh
            key={y}
            position={[0.015, y, -0.035]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.057, 0.008, 5, 16, Math.PI * 1.7]} />
            <meshStandardMaterial color="#bdc7a1" roughness={0.9} />
          </mesh>
        ))}
        {plantModel.leaves.map((leaf) => (
          <CompoundLeaf key={leaf.leaf_id} definition={leaf} />
        ))}
        {plantModel.trusses.map((truss) => (
          <FruitTruss key={truss.truss_id} definition={truss} />
        ))}
        <Stem
          points={[
            [0, 3.27, 0],
            [0.18, 3.39, 0.06],
            [0.37, 3.36, 0.1],
          ]}
          radius={0.012}
          taper={0.6}
        />
        <Flower position={[0.37, 3.36, 0.1]} />
        <Flower position={[0.26, 3.34, 0.09]} />
      </group>
    </group>
  );
}
export function BackgroundPlant({
  position,
  scale = 1,
  seed = 0,
}: {
  position: Vec3;
  scale?: number;
  seed?: number;
}) {
  const leaves = useMemo<LeafDefinition[]>(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        leaf_id: `BG_${position.join("_")}_${i}`,
        position: [0, 0.4 + i * 0.45, 0],
        rotation: [0.1 * Math.sin(i), i * 2.4 + seed, 0.1],
        scale: 0.48,
        pairs: 3,
        variant: i % 3,
      })),
    [position.join("_"), seed],
  );
  return (
    <group position={position} scale={scale}>
      <Stem
        points={[
          [0, 0, 0],
          [0.03, 0.9, 0],
          [-0.03, 1.7, 0],
          [0.01, 2.4, 0],
        ]}
        radius={0.025}
        taper={0.45}
      />
      {leaves.map((leaf) => (
        <CompoundLeaf key={leaf.leaf_id} definition={leaf} simple />
      ))}
      {[0, 1, 2].map((i) => (
        <Tomato
          key={i}
          position={[
            Math.sin(i * 2 + seed) * 0.28,
            0.6 + i * 0.42,
            Math.cos(i * 2 + seed) * 0.18,
          ]}
          scale={0.68}
          decorative
        />
      ))}
    </group>
  );
}
