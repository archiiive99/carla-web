import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useActorStore } from "@/stores/actorStore";
import { useSimulationStore } from "@/stores/simulationStore";
import { resolveEgoId, carlaToThree } from "./actor-rendering/shared";
import { vehiclePlaceholderFootprint } from "./actor-rendering/vehicle-class";
import { HEADLIGHT_BEAM } from "./scene-palette";

/** Night-only pair of SpotLights that track the ego vehicle's front,
 *  approximating headlights that CARLA's Native UE stream would render
 *  from the vehicle's light sockets. Only ego gets lights (not NPCs) to
 *  keep the browser scene under one subscribe-to-weather path and avoid
 *  the cost of N light shadow maps; the honesty badge in the status
 *  overlay tells users "Browser 3D does not simulate street lights /
 *  vehicle headlights" — this rig narrows that gap for the ego but
 *  does not claim to be a faithful reproduction of CARLA lighting. */
export function EgoHeadlights() {
  const sunAltitude = useSimulationStore((s) => s.weather.sun_altitude_angle);
  const actors = useActorStore((s) => s.actors);
  const storeEgoId = useActorStore((s) => s.egoVehicleId);
  const isNight = sunAltitude < 0;

  const leftRef = useRef<THREE.SpotLight>(null);
  const rightRef = useRef<THREE.SpotLight>(null);
  const leftTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const rightTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());

  const egoId = useMemo(() => resolveEgoId(storeEgoId, actors), [storeEgoId, actors]);

  useFrame(() => {
    if (!isNight) return;
    if (egoId === null) return;
    const ego = actors.get(egoId);
    if (!ego) return;
    const pos = carlaToThree(ego.transform.location);
    const yaw = (-ego.transform.rotation.yaw * Math.PI) / 180;
    const fp = vehiclePlaceholderFootprint(ego);
    const halfLen = fp.box.length / 2;
    // Lateral offset: slightly inside the placeholder width.
    const halfWidth = fp.box.width * 0.38;
    const headlightHeight = Math.max(0.5, fp.box.height * 0.55);

    // Forward (local +X in CARLA, which maps to rotate-by-yaw from +X world).
    const forward = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const right = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));

    const origin = new THREE.Vector3(pos.x, pos.y + headlightHeight, pos.z);
    const originLeft = origin.clone()
      .add(forward.clone().multiplyScalar(halfLen))
      .add(right.clone().multiplyScalar(-halfWidth));
    const originRight = origin.clone()
      .add(forward.clone().multiplyScalar(halfLen))
      .add(right.clone().multiplyScalar(halfWidth));

    // Aim 12 metres ahead, slightly below horizontal so the cone lights
    // road surface rather than the sky.
    const aimLeft = originLeft.clone().add(forward.clone().multiplyScalar(12)).setY(pos.y + 0.1);
    const aimRight = originRight.clone().add(forward.clone().multiplyScalar(12)).setY(pos.y + 0.1);

    if (leftRef.current) {
      leftRef.current.position.copy(originLeft);
      leftTargetRef.current.position.copy(aimLeft);
      leftTargetRef.current.updateMatrixWorld();
    }
    if (rightRef.current) {
      rightRef.current.position.copy(originRight);
      rightTargetRef.current.position.copy(aimRight);
      rightTargetRef.current.updateMatrixWorld();
    }
  });

  if (!isNight) return null;
  if (egoId === null) return null;

  return (
    <>
      <primitive object={leftTargetRef.current} />
      <primitive object={rightTargetRef.current} />
      <spotLight
        ref={leftRef}
        color={HEADLIGHT_BEAM}
        intensity={5}
        distance={55}
        angle={0.35}
        penumbra={0.35}
        decay={1.6}
        castShadow={false}
        target={leftTargetRef.current}
      />
      <spotLight
        ref={rightRef}
        color={HEADLIGHT_BEAM}
        intensity={5}
        distance={55}
        angle={0.35}
        penumbra={0.35}
        decay={1.6}
        castShadow={false}
        target={rightTargetRef.current}
      />
    </>
  );
}
