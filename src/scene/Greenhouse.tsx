import { Suspense, useEffect, useRef, Component } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SceneLabel as Html } from "./SceneLabel";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../store";
import { MainPlant, BackgroundPlant } from "./Plants";
import { Robot } from "./Robot";
import { SceneMotionProvider, useSceneRegistry } from "./SceneMotion";
import type { Vec3 } from "../types";

function Beam({
  a,
  b,
  radius = 0.035,
  color = "#b3bca8",
}: {
  a: Vec3;
  b: Vec3;
  radius?: number;
  color?: string;
}) {
  const va = new THREE.Vector3(...a),
    vb = new THREE.Vector3(...b),
    delta = vb.clone().sub(va);
  return (
    <mesh
      position={va.clone().add(vb).multiplyScalar(0.5)}
      quaternion={new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.clone().normalize(),
      )}
      castShadow
    >
      <cylinderGeometry args={[radius, radius, delta.length(), 8]} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.6} />
    </mesh>
  );
}
function Frame() {
  return (
    <group>
      {[-3.3, -1.5, 0.3, 2.1].map((z) => (
        <group key={z}>
          <Beam a={[-3.6, 0, z]} b={[-3.6, 3.7, z]} />
          <Beam a={[3.6, 0, z]} b={[3.6, 3.7, z]} />
          <Beam a={[-3.6, 3.7, z]} b={[0, 4.9, z]} />
          <Beam a={[0, 4.9, z]} b={[3.6, 3.7, z]} />
        </group>
      ))}
      {[-3.6, 3.6].map((x) => (
        <group key={x}>
          {[0.16, 1.8, 3.7].map((y) => (
            <Beam key={y} a={[x, y, -3.3]} b={[x, y, 2.1]} />
          ))}
        </group>
      ))}
      <Beam a={[0, 4.9, -3.3]} b={[0, 4.9, 2.1]} />
      {[-1.8, 1.8].map((x) => (
        <Beam key={x} a={[x, 4.3, -3.3]} b={[x, 4.3, 2.1]} radius={0.018} />
      ))}
      {[-3.6, -1.8, 0, 1.8, 3.6].map((x) => (
        <Beam key={x} a={[x, 0, -3.3]} b={[x, 3.7, -3.3]} />
      ))}
      {[1.8, 3.7].map((y) => (
        <Beam key={y} a={[-3.6, y, -3.3]} b={[3.6, y, -3.3]} />
      ))}
      <mesh position={[0, 1.9, -3.34]}>
        <planeGeometry args={[7.2, 3.7]} />
        <meshPhysicalMaterial
          color="#f6f8e8"
          transparent
          opacity={0.15}
          roughness={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[-3.64, 1.9, -0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[5.4, 3.7]} />
        <meshPhysicalMaterial
          color="#eff4e4"
          transparent
          opacity={0.13}
          roughness={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[-1.8, 4.3, -0.6]}
        rotation={[Math.PI / 2, 0, -Math.atan(1.2 / 3.6)]}
      >
        <planeGeometry args={[3.8, 5.4]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
function Bed({
  position,
  size = [1.8, 0.42, 1.1],
}: {
  position: Vec3;
  size?: Vec3;
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#c4b091" roughness={0.93} />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.006, 0]} receiveShadow>
        <boxGeometry args={[size[0] - 0.1, 0.035, size[2] - 0.1]} />
        <meshStandardMaterial color="#625c42" roughness={1} />
      </mesh>
      {[-1, 1].map((i) => (
        <mesh key={i} position={[0, 0, i * (size[2] / 2 + 0.008)]}>
          <boxGeometry args={[size[0] + 0.025, 0.032, 0.025]} />
          <meshStandardMaterial color="#b3a182" />
        </mesh>
      ))}
    </group>
  );
}
function Basket() {
  const collected = useStore((s) => s.world?.collected ?? []);
  return (
    <group position={[1.7, 0.18, 1.35]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.9, 0.08, 0.66]} />
        <meshStandardMaterial color="#bd9970" />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[0, 0.08 + i * 0.12, side * 0.33]}
              castShadow
            >
              <boxGeometry args={[0.94, 0.085, 0.055]} />
              <meshStandardMaterial color="#c4aa83" roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.45, 0.17, 0]}>
          <boxGeometry args={[0.06, 0.36, 0.66]} />
          <meshStandardMaterial color="#bfa17a" />
        </mesh>
      ))}
      <Html position={[0, 0.12, 0.4]} center zIndexRange={[10, 0]}>
        <div className="basket-label">
          收集箱 <b>{collected.length}</b>
        </div>
      </Html>
    </group>
  );
}
const cameras = {
  overview: { position: [5.8, 4.7, 8.2], target: [0, 1.85, -0.35] },
  front: { position: [0.25, 2.6, 6.2], target: [0, 1.95, 0] },
  detail: { position: [1.65, 3.0, 4.0], target: [0.25, 2.0, 0.25] },
};
function CameraRig({ observationZoom }: { observationZoom: boolean }) {
  const controls = useRef<OrbitImpl>(null),
    moving = useRef(true);
  const preset = useStore((s) => s.camera),
    revision = useStore((s) => s.cameraRevision),
    selected = useStore((s) => s.selected),
    role = useStore((s) => s.role),
    action = useStore((s) => s.action),
    registry = useSceneRegistry(),
    { camera } = useThree();
  useEffect(() => {
    moving.current = true;
  }, [preset, revision, selected, role, observationZoom, action?.id]);
  useFrame((_, delta) => {
    if (!moving.current || !controls.current) return;
    const desired = cameras[preset],
      position = new THREE.Vector3(...desired.position),
      target = new THREE.Vector3(...desired.target);
    if (preset === "detail") {
      const id =
        selected === "LEAF_01" ||
        (role === "expert" && (!selected || selected === "P01"))
          ? "LEAF_01"
          : selected;
      const object = id ? registry.objects.get(id) : undefined;
      if (object) {
        object.updateWorldMatrix(true, false);
        object.getWorldPosition(target);
        if (id?.startsWith("P01_LEAF_"))
          new THREE.Box3().setFromObject(object).getCenter(target);
        // A high, front-facing view reads the blade surface and avoids the roof rails.
        // Leave healthy tissue and the contact area in frame, even in the shallow panel.
        const offset =
          id === "LEAF_01"
            ? observationZoom
              ? new THREE.Vector3(0.45, 0.55, 0.95)
              : new THREE.Vector3(0.22, 1.28, 1.75)
            : id?.startsWith("P01_LEAF_")
              ? new THREE.Vector3(0.6, 1.4, 2.5)
              : new THREE.Vector3(0.8, 0.75, 2.7);
        position.copy(target).add(offset);
        target.x -= id === "LEAF_01" ? (observationZoom ? 0.04 : 0.13) : 0;
        if (id === "P01") {
          target.set(0, 1.95, 0.1);
          position.copy(target).add(new THREE.Vector3(1.3, 1.1, 4.8));
        }
      }
    }
    if (action?.action_type === "harvest") {
      target.set(0.4, 1.05, 0.65);
      position.set(1.3, 3.05, 4.6);
    }
    camera.position.lerp(position, 1 - Math.exp(-4 * delta));
    controls.current.target.lerp(target, 1 - Math.exp(-4 * delta));
    controls.current.update();
    if (camera.position.distanceTo(position) < 0.008) moving.current = false;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      minDistance={0.85}
      maxDistance={15}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2.05}
      enablePan={false}
      onStart={() => {
        moving.current = false;
      }}
    />
  );
}
function Ready() {
  useEffect(() => {
    useStore.getState().setSceneReady();
  }, []);
  return null;
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    const state = useStore.getState();
    state.setSceneReady(false);
    if (state.action) void state.finishAction(state.action.id, false);
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <strong>三维场景暂时无法启动</strong>
        <p>请使用支持 WebGL 2 的浏览器。你仍可以在下方查看果实信息。</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function Greenhouse({
  observationZoom = false,
}: {
  observationZoom?: boolean;
}) {
  return (
    <SceneBoundary>
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [7.1, 5.5, 8.1], fov: 39, near: 0.1, far: 70 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => useStore.getState().select("P01")}
      >
        <color attach="background" args={["#e8ede2"]} />
        <fog attach="fog" args={["#e8ede2", 18, 40]} />
        <ambientLight intensity={1.4} />
        <hemisphereLight args={["#fffde9", "#9caa89", 1.1]} />
        <directionalLight
          position={[-3, 9, 5]}
          intensity={2.5}
          color="#fff5dc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
          shadow-normalBias={0.035}
        />
        <Suspense fallback={null}>
          <SceneMotionProvider>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.12, 0]}
              receiveShadow
            >
              <planeGeometry args={[200, 200]} />
              <meshStandardMaterial color="#e7ebdd" roughness={1} />
            </mesh>
            <mesh position={[0, -0.02, -0.6]} receiveShadow castShadow>
              <boxGeometry args={[7.55, 0.2, 5.8]} />
              <meshStandardMaterial color="#d6d8c7" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.09, -0.6]} receiveShadow>
              <boxGeometry args={[7.35, 0.03, 5.6]} />
              <meshStandardMaterial color="#e5e4d6" roughness={0.95} />
            </mesh>
            {[-2.8, -1.6, -0.4, 0.8, 2].map((z) => (
              <mesh
                key={z}
                position={[0, 0.11, z]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <planeGeometry args={[7.3, 0.012]} />
                <meshStandardMaterial color="#caccbb" />
              </mesh>
            ))}
            <Frame />
            {[-2.6, 2.6].map((x) => (
              <group key={x}>
                <Bed position={[x, 0.31, -1.1]} size={[1.35, 0.4, 3.5]} />
                {[-2.3, -1.15, 0.1].map((z, i) => (
                  <BackgroundPlant
                    key={z}
                    position={[x, 0.53, z]}
                    scale={0.83}
                    seed={i + x}
                  />
                ))}
              </group>
            ))}
            <Bed position={[-0.2, 0.31, 0]} size={[2.1, 0.42, 1.45]} />
            <MainPlant />
            <Robot />
            <Basket />
            <mesh position={[-1.38, 0.35, 1.07]} rotation={[0, -0.1, 0]}>
              <boxGeometry args={[0.06, 0.48, 0.04]} />
              <meshStandardMaterial color="#8c9a80" />
            </mesh>
            <Html position={[-1.38, 0.69, 1.07]} center zIndexRange={[11, 0]}>
              <button
                className="plant-label"
                onClick={() => useStore.getState().select("P01")}
              >
                <span />
                P01 <small>示范植株</small>
              </button>
            </Html>
            <CameraRig observationZoom={observationZoom} />
            <Ready />
          </SceneMotionProvider>
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
