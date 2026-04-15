import { memo, useMemo, useEffect, Suspense } from "react";
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

/** Inner component that loads the glTF traffic-light model.
 *
 *  iter-10-revisit-glb-bulb: the GLB ships its bulb primitive with the
 *  unset UE5 editor default `WorldGridMaterial`. We detect that
 *  primitive on clone and swap its material for a state-driven
 *  MeshStandardMaterial so the bulb itself glows with the current
 *  traffic-light state instead of just the indicator sphere above the
 *  housing. */
function GltfTrafficLight({ bulbColor }: { bulbColor: string }) {
  const { scene } = useGLTF(TRAFFIC_LIGHT_MODEL);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        const mat = child.material as THREE.Material | undefined;
        if (mat && mat.name === "WorldGridMaterial") {
          const bulbMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: new THREE.Color(bulbColor),
            emissiveIntensity: 1.5,
            roughness: 0.4,
            metalness: 0,
          });
          child.material = bulbMat;
          child.userData.bulbMatRef = bulbMat;
        }
      }
    });
    return c;
  }, [scene, bulbColor]);
  // When state changes (bulbColor updates), find the cached material on
  // the cloned mesh tree and update its emissive in place — avoids a
  // full re-clone of the scene each color change.
  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.bulbMatRef) {
        const mat = child.userData.bulbMatRef as THREE.MeshStandardMaterial;
        mat.emissive.set(bulbColor);
        mat.needsUpdate = false;
      }
    });
  }, [bulbColor, cloned]);
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
          <GltfTrafficLight bulbColor={bulbColor} />
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
