import { useMemo } from "react";
import type { ComponentProps } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";

/** Keep Drei's DOM portal anchored while R3F connects its pointer event target. */
export function SceneLabel(props: ComponentProps<typeof Html>) {
  const { gl } = useThree();
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  return <Html {...props} portal={portal} />;
}
