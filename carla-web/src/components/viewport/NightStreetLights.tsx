import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useSimulationStore } from "@/stores/simulationStore";
import { HEADLIGHT_BEAM } from "./scene-palette";

// CARLA-coords positions of street-lamp anchors near the iter-01 test
// pose intersection (approx x=118.9, y=55.8). Hardcoded for this
// iteration since CARLA's Python API doesn't expose static prop
// streetlamp instances; iter-09-revisit-extracted-positions could
// replace these with positions parsed from Town01's static-prop dump.
//
// CARLA → Three.js coord mapping per the rest of the codebase:
//   carla(x,y,z) → three(x, z, -y)
// So a lamp at carla (110, 50, 6m-up) becomes three (110, 6, -50).
const LAMP_POSITIONS_CARLA: Array<[number, number, number]> = [
  [110, 50, 6.0],
  [110, 60, 6.0],
  [130, 50, 6.0],
  [130, 60, 6.0],
];

const LAMP_HEIGHT = 6.0; // meters
const SPOTLIGHT_INTENSITY = 30;
const SPOTLIGHT_DISTANCE = 18;
const SPOTLIGHT_ANGLE = Math.PI / 4; // 45°
const SPOTLIGHT_PENUMBRA = 0.5;
const SPOTLIGHT_DECAY = 1.5;

/** Hardcoded street-lamp SpotLight cluster around the iter-01 test pose
 *  intersection, active only when the CARLA weather sun_altitude_angle
 *  is below horizon. Produces visible cones of warm light on the road
 *  surface — closes part of the night-state parity gap that the UE5
 *  reference shows but pre-iter-09 web rendered without. */
export function NightStreetLights() {
  const sunAltitude = useSimulationStore((s) => s.weather.sun_altitude_angle ?? 75);
  const isNight = sunAltitude < 0;

  const lampSpecs = useMemo(
    () =>
      LAMP_POSITIONS_CARLA.map(([cx, cy, cz]) => ({
        // Three.js position: x→x, z→y (up), -y→z. The lamp body sits at
        // LAMP_HEIGHT m above ground, target at ground below.
        position: [cx, cz, -cy] as [number, number, number],
        target: [cx, 0, -cy] as [number, number, number],
      })),
    [],
  );

  // Targets must live in the scene graph; Three.js uses them as references
  // for spotLight direction calculation. Without an attached target each
  // SpotLight points at world-origin which would break the on-road cone.
  const targetRefs = useRef<THREE.Object3D[]>(lampSpecs.map(() => new THREE.Object3D()));
  useEffect(() => {
    targetRefs.current.forEach((tgt, i) => {
      const [tx, ty, tz] = lampSpecs[i].target;
      tgt.position.set(tx, ty, tz);
    });
  }, [lampSpecs]);

  if (!isNight) return null;

  return (
    <>
      {lampSpecs.map((spec, i) => (
        <group key={i}>
          {/* Anchor the target object in the scene so the spotLight has
             something to point at. */}
          <primitive object={targetRefs.current[i]} />
          <spotLight
            position={spec.position}
            target={targetRefs.current[i]}
            color={HEADLIGHT_BEAM}
            intensity={SPOTLIGHT_INTENSITY}
            distance={SPOTLIGHT_DISTANCE}
            angle={SPOTLIGHT_ANGLE}
            penumbra={SPOTLIGHT_PENUMBRA}
            decay={SPOTLIGHT_DECAY}
            castShadow={false}
          />
          {/* iter-09-revisit-emissive: small emissive sphere at the lamp
             head position so the source of the light is visible in the
             scene — without it the SpotLights just appear as bright
             cones with nothing emitting them. The CARLA static-prop
             streetlamp GLBs are dormant in the scene (exported but
             unused), so this plays the role of the lamp head visual. */}
          <mesh position={spec.position}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial
              color={HEADLIGHT_BEAM}
              emissive={HEADLIGHT_BEAM}
              emissiveIntensity={2.5}
              roughness={0.5}
              metalness={0}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
