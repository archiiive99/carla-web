import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CarlaActor } from "@/types/carla";
import { carlaToThree } from "./shared";
import { WALKER_BODY, WALKER_LIMB, WALKER_WARNING } from "../scene-palette";

// iter-08-skin-tones: deterministic body color per actor.id so a
// crowd of walkers reads as visually distinct individuals rather than
// a uniform orange swarm. Returns one of the safety-visibility
// palette variations (orange-red → orange → amber → yellow-orange).
// Distinct enough at distance to differentiate; all within the
// "high-vis safety" hue band so the no-mistaken-for-real-person
// principle still applies.
const WALKER_BODY_VARIATIONS = [
  "#f97316", // orange (default WALKER_BODY)
  "#ea580c", // darker orange-red
  "#fb923c", // light orange
  "#f59e0b", // amber
  "#fbbf24", // yellow-orange
  "#dc2626", // red-orange
];
function walkerBodyColor(actorId: number): string {
  return WALKER_BODY_VARIATIONS[Math.abs(actorId) % WALKER_BODY_VARIATIONS.length];
}

export const WalkerMesh = memo(function WalkerMesh({
  actor,
  isSelected,
  onSelect,
}: {
  actor: CarlaActor;
  isSelected: boolean;
  onSelect: (id: number) => void;
}) {
  const pos = carlaToThree(actor.transform.location);
  const bodyColor = useMemo(() => walkerBodyColor(actor.id), [actor.id]);

  // iter-08-walk-cycle: refs to limb pivot groups + a per-walker
  // walk-phase counter. useFrame increments phase by speed * delta
  // and applies opposing left/right swing.
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const walkPhaseRef = useRef(0);
  useFrame((_, delta) => {
    const v = actor.velocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (speed < 0.1) {
      // Reset to neutral pose
      if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      return;
    }
    // Phase increment scaled by speed (faster speed = quicker stride).
    // 1.8 rad/s/(m/s) ≈ natural human cadence at walking pace.
    walkPhaseRef.current += delta * speed * 1.8;
    const swing = Math.sin(walkPhaseRef.current) * 0.45;
    if (leftArmRef.current) leftArmRef.current.rotation.x = -swing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = swing;
    if (leftLegRef.current) leftLegRef.current.rotation.x = swing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -swing;
  });

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(actor.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* iter-08-walk-cycle: anatomically-articulated walker with
          shoulder/hip pivot groups so legs + arms swing around the
          correct anchor instead of tumbling around their geometric
          centers. useFrame below drives the swing angle from
          actor.velocity magnitude. */}
      {/* Torso (unanimated) */}
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.18, 0.55, 6, 12]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive="#9a3412"
          emissiveIntensity={0.12}
          roughness={0.8}
        />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.65, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color={WALKER_LIMB} roughness={0.75} />
      </mesh>
      {/* Left arm — pivot at shoulder y=1.30, mesh offset down */}
      <group ref={leftArmRef} position={[-0.22, 1.30, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rightArmRef} position={[0.22, 1.30, 0]}>
        <mesh position={[0, -0.25, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
      </group>
      {/* Left leg — pivot at hip y=0.78, mesh offset down */}
      <group ref={leftLegRef} position={[-0.09, 0.78, 0]}>
        <mesh position={[0, -0.33, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.08, 0.55, 4, 8]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rightLegRef} position={[0.09, 0.78, 0]}>
        <mesh position={[0, -0.33, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.08, 0.55, 4, 8]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
      </group>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.0, 1.2, 24]} />
          <meshBasicMaterial color={WALKER_WARNING} transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
});
