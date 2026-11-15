import { useRef } from "react";
import * as THREE from "three";
import { useStore } from "../store";
import { plantModel, basketPosition } from "./plantModel";
import {
  useSceneActor,
  useSceneObject,
  useSceneRegistry,
  ease,
} from "./SceneMotion";

const HOME = new THREE.Vector3(...plantModel.robot.home),
  SHOULDER = new THREE.Vector3(...plantModel.robot.shoulder),
  Y = new THREE.Vector3(0, 1, 0),
  GRIP = new THREE.Vector3(0, 0.15, 0);
export function Robot() {
  const upper = useRef<THREE.Mesh>(null),
    lower = useRef<THREE.Mesh>(null),
    joint = useRef<THREE.Group>(null),
    wrist = useRef<THREE.Group>(null),
    left = useRef<THREE.Mesh>(null),
    right = useRef<THREE.Mesh>(null),
    grip = useRef<THREE.Group>(null);
  useSceneObject("ROBOT_GRIP", grip);
  const endpoint = useRef(HOME.clone()),
    registry = useSceneRegistry(),
    action = useStore((s) => s.action);
  useSceneActor("ROBOT", 50, (frame, delta) => {
    const end = HOME.clone(),
      current = frame.action,
      p = frame.progress;
    if (current) {
      if (current.action_type === "harvest") {
        const contact = frame.fruitWorld.clone().add(GRIP),
          near = contact
            .clone()
            .add(
              new THREE.Vector3(
                ...(current.approach_offset ?? [0.12, 0, 0.35]),
              ),
            );
        if (p < 0.23) end.lerpVectors(HOME, near, ease(0, 0.23, p));
        else if (p < 0.34) end.lerpVectors(near, contact, ease(0.23, 0.34, p));
        else if (p < 0.75) end.copy(contact);
        else {
          const release = new THREE.Vector3(...basketPosition(frame.slot))
            .add(new THREE.Vector3(0, 0.38, 0))
            .add(GRIP);
          if (p < 0.86) end.copy(release);
          else end.lerpVectors(release, HOME, ease(0.86, 1, p));
        }
      } else {
        const leaf = registry.objects.get(
          `${current.leaf_id ?? plantModel.reveal.occluding_leaf_id}_CONTACT`,
        );
        const contact =
            leaf?.getWorldPosition(new THREE.Vector3()).add(GRIP) ??
            frame.origin.clone().add(GRIP),
          near = frame.origin
            .clone()
            .add(GRIP)
            .add(new THREE.Vector3(0.1, 0.12, 0.3));
        if (p < 0.23) end.lerpVectors(HOME, near, ease(0, 0.23, p));
        else if (p < 0.34) end.lerpVectors(near, contact, ease(0.23, 0.34, p));
        else if (p < 0.78) end.copy(contact);
        else end.lerpVectors(contact, HOME, ease(0.78, 1, p));
      }
    }
    if (frame.reset) endpoint.current.copy(HOME);
    else if (current)
      endpoint.current.copy(end); // Same analytic path as the held fruit, without an independent lag.
    else endpoint.current.lerp(end, Math.min(1, delta * 20));
    const elbow = SHOULDER.clone().lerp(endpoint.current, 0.44);
    elbow.y = Math.max(SHOULDER.y, endpoint.current.y) + 0.46;
    elbow.z -= 0.35;
    const segment = (
      mesh: THREE.Mesh | null,
      a: THREE.Vector3,
      b: THREE.Vector3,
    ) => {
      if (!mesh) return;
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
      mesh.scale.y = a.distanceTo(b);
    };
    segment(upper.current, SHOULDER, elbow);
    segment(lower.current, elbow, endpoint.current);
    joint.current?.position.copy(elbow);
    wrist.current?.position.copy(endpoint.current);
    const closing =
      current?.action_type === "harvest"
        ? ease(0.34, 0.46, p) * (1 - ease(0.75, 0.85, p))
        : 0;
    const spread = THREE.MathUtils.lerp(0.24, 0.165, closing);
    if (wrist.current) {
      const yaw =
        current?.action_type === "harvest"
          ? Math.atan2(
              current.approach_offset?.[0] ?? 0,
              current.approach_offset?.[2] ?? 0.4,
            )
          : 0;
      wrist.current.rotation.y =
        yaw * ease(0.23, 0.34, p) * (1 - ease(0.86, 1, p));
    }
    if (left.current && right.current) {
      left.current.position.x = THREE.MathUtils.damp(
        left.current.position.x,
        -spread,
        22,
        delta,
      );
      right.current.position.x = THREE.MathUtils.damp(
        right.current.position.x,
        spread,
        22,
        delta,
      );
    }
  });
  return (
    <group>
      <mesh position={[1.72, 0.3, -0.18]} castShadow>
        <boxGeometry args={[0.88, 0.4, 0.72]} />
        <meshStandardMaterial color="#e7e6dc" roughness={0.5} />
      </mesh>
      <mesh position={[1.72, 0.54, -0.18]} castShadow>
        <cylinderGeometry args={[0.27, 0.32, 0.13, 32]} />
        <meshStandardMaterial color="#3e5145" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={SHOULDER}>
        <sphereGeometry args={[0.19, 24, 16]} />
        <meshStandardMaterial color="#3e5145" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh ref={upper} castShadow>
        <boxGeometry args={[0.19, 1, 0.22]} />
        <meshStandardMaterial
          color="#e4e6dd"
          metalness={0.35}
          roughness={0.35}
        />
      </mesh>
      <group ref={joint}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.28, 24]} />
          <meshStandardMaterial
            color="#546354"
            metalness={0.5}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.02, 24]} />
          <meshStandardMaterial color="#c6a36c" metalness={0.5} />
        </mesh>
      </group>
      <mesh ref={lower} castShadow>
        <boxGeometry args={[0.14, 1, 0.16]} />
        <meshStandardMaterial
          color="#f1efe5"
          metalness={0.35}
          roughness={0.4}
        />
      </mesh>
      <group ref={wrist} name="ROBOT_WRIST">
        <group ref={grip} position={[0, -0.15, 0]} />
        <mesh>
          <boxGeometry args={[0.34, 0.09, 0.13]} />
          <meshStandardMaterial color="#48584c" metalness={0.4} />
        </mesh>
        {[left, right].map((ref, i) => (
          <mesh ref={ref} key={i} position={[(i ? 1 : -1) * 0.22, -0.08, 0]}>
            <boxGeometry args={[0.045, 0.22, 0.09]} />
            <meshStandardMaterial color="#707b6a" metalness={0.6} />
          </mesh>
        ))}
      </group>
      {action && (
        <mesh position={[1.72, 0.36, 0.19]}>
          <boxGeometry args={[0.18, 0.028, 0.008]} />
          <meshBasicMaterial color="#b4d092" />
        </mesh>
      )}
    </group>
  );
}
