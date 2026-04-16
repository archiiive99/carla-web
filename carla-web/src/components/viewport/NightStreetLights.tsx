import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useSimulationStore } from "@/stores/simulationStore";
import { STREETLAMP_BEAM } from "./scene-palette";
import { BLOOM_LAYER } from "./bloom-layer";

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
  const fogDensity = useSimulationStore((s) => s.weather.fog_density ?? 0);
  const isNight = sunAltitude < 0;
  // iter-09-revisit-halo-opacity-altitude: halo opacity ramps with
  // how deep into night we are. Twilight (sun_alt ≈ 0) = 0.2;
  // deep night (sun_alt ≤ -15) = 0.5.
  // iter-09-revisit-emissive-depth: emissive sphere intensity ramps
  // on the same curve so the sphere's perceived brightness stays
  // in proportion to its halo.
  const nightDepth = Math.max(0, Math.min(1, -sunAltitude / 15));
  const haloOpacity = 0.2 + nightDepth * 0.3;
  const emissiveIntensity = 1.2 + nightDepth * 2.3;
  // iter-09-revisit-cone-fog: beam-volume cone is most visible
  // through fog. Amplify its base 0.4× halo multiplier with
  // (1 + fogFactor * 1.5) so clear = 0.4×, heavy fog = 1.0×.
  const fogFactor = Math.max(0, Math.min(1, fogDensity / 100));
  const coneOpacity = haloOpacity * 0.4 * (1 + fogFactor * 1.5);

  const lampSpecs = useMemo(
    () =>
      LAMP_POSITIONS_CARLA.map(([cx, cy, cz]) => {
        // iter-09-revisit-lamp-arm: lamp head offsets 0.5 m along +x
        // or -x so the light hangs over the road rather than sitting
        // directly atop its pole. Lamps at carla.x=110 reach toward
        // +x (road center at 120); lamps at 130 reach toward -x.
        const armDir = cx < 120 ? 0.5 : -0.5;
        // Three.js position: x→x, z→y (up), -y→z. The lamp body sits at
        // LAMP_HEIGHT m above ground, target at ground below the head.
        return {
          poleBase: [cx, 0, -cy] as [number, number, number],
          poleTop: [cx, cz, -cy] as [number, number, number],
          armDir,
          headPosition: [cx + armDir, cz, -cy] as [number, number, number],
          target: [cx + armDir, 0, -cy] as [number, number, number],
        };
      }),
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

  return (
    <>
      {lampSpecs.map((spec, i) => {
        const [px, py, pz] = spec.poleTop;
        const armMidX = px + spec.armDir / 2;
        return (
          <group key={i}>
            {/* iter-09-revisit-lamp-pole: always-visible pole cylinder. */}
            <mesh position={[px, py / 2, pz]} castShadow receiveShadow>
              <cylinderGeometry args={[0.06, 0.08, py, 10]} />
              <meshStandardMaterial color="#2a2a30" roughness={0.7} metalness={0.4} />
            </mesh>
            {/* iter-09-revisit-lamp-arm: horizontal arm from pole top to
               head position. Cylinder is default y-up, so rotate by π/2
               around z to lay it along x. Length = |armDir| = 0.5 m. */}
            <mesh
              position={[armMidX, py, pz]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
              receiveShadow
            >
              <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
              <meshStandardMaterial color="#2a2a30" roughness={0.7} metalness={0.4} />
            </mesh>
            {/* iter-09-revisit-shield: reflector hood disc above the lamp
               head. Always visible. Same material family as pole/arm. */}
            <mesh
              position={[spec.headPosition[0], spec.headPosition[1] + 0.18, spec.headPosition[2]]}
              castShadow
              receiveShadow
            >
              <cylinderGeometry args={[0.32, 0.32, 0.06, 16]} />
              <meshStandardMaterial color="#2a2a30" roughness={0.7} metalness={0.4} />
            </mesh>
            {isNight && (
              <>
                {/* Anchor the target object in the scene so the spotLight has
                   something to point at. */}
                <primitive object={targetRefs.current[i]} />
                <spotLight
                  position={spec.headPosition}
                  target={targetRefs.current[i]}
                  color={STREETLAMP_BEAM}
                  intensity={SPOTLIGHT_INTENSITY}
                  distance={SPOTLIGHT_DISTANCE}
                  angle={SPOTLIGHT_ANGLE}
                  penumbra={SPOTLIGHT_PENUMBRA}
                  decay={SPOTLIGHT_DECAY}
                  castShadow={false}
                />
                {/* iter-09-revisit-emissive: small emissive sphere at the lamp
                   head position so the source of the light is visible in the
                   scene. */}
                <mesh
                  position={spec.headPosition}
                  ref={(m) => {
                    if (m) m.layers.enable(BLOOM_LAYER);
                  }}
                >
                  <sphereGeometry args={[0.18, 12, 12]} />
                  <meshStandardMaterial
                    color={STREETLAMP_BEAM}
                    emissive={STREETLAMP_BEAM}
                    emissiveIntensity={emissiveIntensity}
                    roughness={0.5}
                    metalness={0}
                  />
                </mesh>
                {/* iter-09-revisit-lamp-halo: larger transparent additive sphere.
                   iter-09-revisit-halo-opacity-altitude: opacity ramps with
                   night-depth so twilight reads as subtle, deep night as
                   prominent. */}
                <mesh position={spec.headPosition}>
                  <sphereGeometry args={[0.4, 16, 16]} />
                  <meshBasicMaterial
                    color={STREETLAMP_BEAM}
                    transparent
                    opacity={haloOpacity}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                  />
                </mesh>
                {/* iter-09-revisit-light-cone: transparent beam-volume cone
                   from lamp head toward target. Cone default apex is at
                   +y; rotate by π around x so the apex sits at the mesh
                   position (head) and the base extends downward. Height
                   = lamp y (6 m); bottom radius 1.5 m. */}
                <mesh
                  position={[spec.headPosition[0], spec.headPosition[1] / 2, spec.headPosition[2]]}
                  rotation={[Math.PI, 0, 0]}
                >
                  <coneGeometry args={[1.5, spec.headPosition[1], 24, 1, true]} />
                  <meshBasicMaterial
                    color={STREETLAMP_BEAM}
                    transparent
                    opacity={coneOpacity}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </>
  );
}
