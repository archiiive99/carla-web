import { memo, useMemo, Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { CarlaActor } from "@/types/carla";
import { TRAFFIC_LIGHT_MODEL } from "../CarlaAssetLoader";
import { ErrorBoundaryFallback, carlaToThree } from "./shared";
import {
  TRAFFIC_RED,
  TRAFFIC_YELLOW,
  TRAFFIC_GREEN,
  TRAFFIC_OFF,
  TRAFFIC_HOUSING,
} from "../scene-palette";

/** Inner component that loads the glTF traffic-light model. */
function GltfTrafficLight() {
  const { scene } = useGLTF(TRAFFIC_LIGHT_MODEL);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={cloned} />;
}

function trafficLightBulbColor(state: string | null | undefined): string {
  switch (state) {
    case "Red":
      return TRAFFIC_RED;
    case "Yellow":
      return TRAFFIC_YELLOW;
    case "Green":
      return TRAFFIC_GREEN;
    default:
      return TRAFFIC_OFF;
  }
}

/** Fallback box traffic light — color reflects current state. */
function BoxTrafficLightFallback({ color }: { color: string }) {
  return (
    <>
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[0.2, 1, 0.2]} />
        <meshStandardMaterial color={TRAFFIC_HOUSING} />
      </mesh>
      <mesh position={[0, 3.15, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} />
      </mesh>
    </>
  );
}

export const TrafficLightMesh = memo(function TrafficLightMesh({ actor }: { actor: CarlaActor }) {
  const pos = carlaToThree(actor.transform.location);
  const yaw = (-actor.transform.rotation.yaw * Math.PI) / 180;
  const bulbColor = trafficLightBulbColor(actor.traffic_light_state);
  return (
    <group position={[pos.x, pos.y, pos.z]} rotation={[0, yaw, 0]}>
      <Suspense fallback={<BoxTrafficLightFallback color={bulbColor} />}>
        <ErrorBoundaryFallback onError={() => {}}>
          <GltfTrafficLight />
        </ErrorBoundaryFallback>
      </Suspense>
      {/* Tiny state indicator bulb above the light — always visible regardless
          of whether the glTF model loaded. Carries the actual TL state color. */}
      <mesh position={[0, 4.0, 0]}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial
          color={bulbColor}
          emissive={bulbColor}
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  );
});
