import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useActorStore } from "@/stores/actorStore";
import { BRIDGE_EGO_ROLE } from "@/constants";
import type { CarlaActor } from "@/types/carla";
import {
  CAMERA_PRESETS,
  type CameraPresetKey,
} from "@/components/sensors/sensor-camera-presets";

function carlaToThree(loc: { x: number; y: number; z: number }) {
  return new THREE.Vector3(loc.x, loc.z, -loc.y);
}

function resolveEgo(
  actors: Map<number, CarlaActor>,
  storeEgoId: number | null,
): CarlaActor | null {
  if (storeEgoId !== null) {
    const a = actors.get(storeEgoId);
    if (a) return a;
  }
  for (const a of actors.values()) {
    if (a.type === "vehicle" && a.role_name === BRIDGE_EGO_ROLE) return a;
  }
  for (const a of actors.values()) {
    if (a.type === "vehicle") return a;
  }
  return null;
}

interface SensorPresetControllerProps {
  camera: THREE.PerspectiveCamera;
  preset: CameraPresetKey;
}

// Drives a preset-positioned camera (chase / front / birdseye / …) relative
// to the ego vehicle for a sensor-cell view. The camera renders the shared
// world scene, so the cell shows exactly the same geometry/lighting as the
// main viewport — not a stylised copy.
export function SensorPresetController({
  camera,
  preset,
}: SensorPresetControllerProps) {
  const actors = useActorStore((s) => s.actors);
  const storeEgoId = useActorStore((s) => s.egoVehicleId);
  const initializedRef = useRef(false);

  useFrame(() => {
    const ego = resolveEgo(actors, storeEgoId);
    if (!ego) return;

    const egoPos = carlaToThree(ego.transform.location);
    const egoYaw = (-ego.transform.rotation.yaw * Math.PI) / 180;

    const cfg = CAMERA_PRESETS[preset];
    const localOffset = new THREE.Vector3(cfg.offset.x, cfg.offset.z, -cfg.offset.y);
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), egoYaw);
    const targetPos = egoPos.clone().add(localOffset);

    if (!initializedRef.current) {
      camera.position.copy(targetPos);
      initializedRef.current = true;
    } else {
      camera.position.lerp(targetPos, 0.25);
    }

    if (preset === "birdseye") {
      camera.lookAt(egoPos.x, 0, egoPos.z);
    } else if (preset === "front") {
      const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        egoYaw,
      );
      camera.lookAt(egoPos.clone().add(fwd.multiplyScalar(30)));
    } else {
      camera.lookAt(egoPos.clone().add(new THREE.Vector3(0, 1, 0)));
    }

    if (camera.fov !== 70) {
      camera.fov = 70;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
