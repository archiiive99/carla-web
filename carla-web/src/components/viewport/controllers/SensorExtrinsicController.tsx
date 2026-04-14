import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useActorStore } from "@/stores/actorStore";
import { carlaApi } from "@/lib/carla-api";

// Drives a camera so it tracks a CARLA sensor's world transform and FOV.
// Used for user-spawned RGB sensor cells: the bridge still creates the
// sensor actor (transform/lifecycle stays authoritative in CARLA) but does
// NOT stream JPEG frames — instead the browser renders the shared world
// scene from this camera, parented to the sensor's actual pose.

interface SensorExtrinsicControllerProps {
  camera: THREE.PerspectiveCamera;
  sensorId: number;
}

// CARLA (X forward, Y right, Z up) -> Three.js (X right, Y up, Z back)
// Consistent with carlaToThreeVec used elsewhere in the viewport code.
function carlaLocToThree(loc: { x: number; y: number; z: number }) {
  return new THREE.Vector3(loc.x, loc.z, -loc.y);
}

export function SensorExtrinsicController({
  camera,
  sensorId,
}: SensorExtrinsicControllerProps) {
  const fovRef = useRef(90);
  const fovLoadedRef = useRef(false);

  // Sensor FOV comes from CARLA config, not a preset. Pulled once per
  // sensorId; FOV rarely changes at runtime but can be re-pulled on demand.
  useEffect(() => {
    let cancelled = false;
    fovLoadedRef.current = false;
    carlaApi
      .getSensorConfig(sensorId)
      .then((config) => {
        if (cancelled) return;
        const parsed = Number.parseFloat(String(config.attributes.fov ?? ""));
        if (Number.isFinite(parsed) && parsed > 0) {
          fovRef.current = parsed;
        }
        fovLoadedRef.current = true;
      })
      .catch(() => {
        // Keep the 90° fallback; the compositor can still render the scene.
        fovLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [sensorId]);

  useFrame(() => {
    // The sensor actor's transform is CARLA's authoritative world pose —
    // the bridge's world-tick broadcaster updates it every tick, accounting
    // for the parent vehicle's motion automatically (CARLA composes the
    // parent transform on spawn time, but `transform` on a subsequently
    // moved parent is kept current in the actor store).
    const actors = useActorStore.getState().actors;
    const sensor = actors.get(sensorId);
    if (!sensor) return;

    const loc = sensor.transform.location;
    const rot = sensor.transform.rotation;
    const pitchR = (rot.pitch * Math.PI) / 180;
    const yawR = (rot.yaw * Math.PI) / 180;

    const aheadCarla = {
      x: loc.x + Math.cos(pitchR) * Math.cos(yawR),
      y: loc.y + Math.cos(pitchR) * Math.sin(yawR),
      z: loc.z + Math.sin(pitchR),
    };

    camera.position.copy(carlaLocToThree(loc));
    camera.lookAt(carlaLocToThree(aheadCarla));

    if (Math.abs(camera.fov - fovRef.current) > 1e-3) {
      camera.fov = fovRef.current;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
