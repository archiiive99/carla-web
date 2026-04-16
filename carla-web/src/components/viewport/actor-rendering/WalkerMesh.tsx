import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CarlaActor } from "@/types/carla";
import { carlaToThree } from "./shared";
import {
  WALKER_BODY_VARIATIONS,
  WALKER_EMISSIVE,
  WALKER_LIMB,
  WALKER_PANTS_VARIATIONS,
  WALKER_WARNING,
} from "../scene-palette";

// iter-08-skin-tones: deterministic body color per actor.id so a
// crowd of walkers reads as visually distinct individuals rather than
// a uniform orange swarm. All variations live in scene-palette as
// WALKER_BODY_VARIATIONS (high-vis safety hue band).
function walkerBodyColor(actorId: number): string {
  return WALKER_BODY_VARIATIONS[
    Math.abs(actorId) % WALKER_BODY_VARIATIONS.length
  ];
}

// iter-08-clothes-pattern: pants color distinct from shirt. Uses a
// different prime multiplier so pants don't always track with shirt.
function walkerPantsColor(actorId: number): string {
  return WALKER_PANTS_VARIATIONS[
    Math.abs(actorId * 7 + 3) % WALKER_PANTS_VARIATIONS.length
  ];
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
  const pantsColor = useMemo(() => walkerPantsColor(actor.id), [actor.id]);

  // iter-08-walk-cycle: refs to limb pivot groups + a per-walker
  // walk-phase counter. useFrame increments phase by speed * delta
  // and applies opposing left/right swing.
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  // iter-08-knee-bend: knee pivot groups nested inside the hip pivot.
  // Knee bends during forward swing (leg lifts to clear ground).
  const leftKneeRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const walkPhaseRef = useRef(0);
  const currentYawRef = useRef<number | null>(null);
  useFrame((_, delta) => {
    const v = actor.velocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    // iter-08-walk-yaw-from-velocity: walker body faces direction of
    // travel when moving. Compute target yaw from horizontal velocity
    // (vx in CARLA ↔ vx in Three; vy in CARLA ↔ -vz in Three via c2t
    // coord convention). Lerp toward target at 6 rad/s (~1 rev per
    // second) to avoid jittery direction changes from velocity noise.
    if (speed >= 0.1 && bodyGroupRef.current) {
      // Three-space facing: atan2(Three.x_vel, Three.z_vel) where
      // forward convention = +X. Three.z = -CARLA.y so Three.z_vel = -v.y.
      const targetYaw = Math.atan2(v.x, -v.y);
      if (currentYawRef.current === null) {
        currentYawRef.current = targetYaw;
      } else {
        // Shortest-path angle lerp (wrap through ±π)
        let diff = targetYaw - currentYawRef.current;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const maxStep = 6 * delta;
        if (Math.abs(diff) <= maxStep) {
          currentYawRef.current = targetYaw;
        } else {
          currentYawRef.current += Math.sign(diff) * maxStep;
        }
      }
      bodyGroupRef.current.rotation.y = currentYawRef.current;
    }
    if (speed < 0.1) {
      // Reset to neutral pose
      if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftKneeRef.current) leftKneeRef.current.rotation.x = 0;
      if (rightKneeRef.current) rightKneeRef.current.rotation.x = 0;
      return;
    }
    // Phase increment scaled by speed (faster speed = quicker stride).
    // 1.8 rad/s/(m/s) ≈ natural human cadence at walking pace.
    walkPhaseRef.current += delta * speed * 1.8;
    // Natural gait: arms swing narrower than legs. Split amplitudes
    // so arms read as counter-balance rather than matching leg stride.
    // iter-08-revisit-arm-stride-speed: arm amp scales 0.7x-1.2x with
    // walker speed (clamped at 2.5 m/s) so slow stroll vs fast-pace
    // reads as different gait energy.
    const armScale = 0.7 + Math.min(speed, 2.5) / 2.5 * 0.5;
    const phaseSin = Math.sin(walkPhaseRef.current);
    const armSwing = phaseSin * 0.35 * armScale;
    const legSwing = phaseSin * 0.55;
    // iter-08-revisit-bob: body rises + falls twice per stride (plants
    // are upward-only → |sin(2φ)|). 3 cm peak amplitude.
    if (bodyGroupRef.current) {
      const bob = Math.abs(Math.sin(walkPhaseRef.current * 2)) * 0.03;
      bodyGroupRef.current.position.set(pos.x, pos.y + bob, pos.z);
    }
    if (leftArmRef.current) leftArmRef.current.rotation.x = -armSwing;
    if (rightArmRef.current) rightArmRef.current.rotation.x = armSwing;
    if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing;
    if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing;
    // iter-08-knee-bend: knee bends during forward half of swing
    // (leg moving forward through air). Left leg phase = walkPhase;
    // right leg = walkPhase + π. Knee angle clamps to zero during
    // stance (no hyperextension).
    const leftKneeBend = Math.max(0, Math.sin(walkPhaseRef.current)) * 0.8;
    const rightKneeBend = Math.max(0, Math.sin(walkPhaseRef.current + Math.PI)) * 0.8;
    if (leftKneeRef.current) leftKneeRef.current.rotation.x = leftKneeBend;
    if (rightKneeRef.current) rightKneeRef.current.rotation.x = rightKneeBend;
  });

  return (
    <group
      ref={bodyGroupRef}
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
          emissive={WALKER_EMISSIVE}
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
      {/* Left leg — iter-08-knee-bend nests knee pivot inside hip.
          Thigh (top half of leg) rotates with hip swing; shin (bottom
          half) additionally rotates with knee bend. Hip pivot at
          y=0.78; knee pivot at y=-0.28 relative to hip (absolute
          y=0.50) = top of shin. Thigh mesh at y=-0.15 (center of top
          half); shin mesh inside knee-group at y=-0.15 (center of
          shin below knee). */}
      <group ref={leftLegRef} position={[-0.09, 0.78, 0]}>
        {/* Thigh (moves with hip swing only) */}
        <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.08, 0.22, 4, 8]} />
          <meshStandardMaterial color={pantsColor} roughness={0.85} />
        </mesh>
        {/* Knee pivot — rotations applied here bend the shin under
            the thigh. Position at knee joint (bottom of thigh). */}
        <group ref={leftKneeRef} position={[0, -0.28, 0]}>
          {/* Shin */}
          <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
            <capsuleGeometry args={[0.07, 0.22, 4, 8]} />
            <meshStandardMaterial color={pantsColor} roughness={0.85} />
          </mesh>
        </group>
      </group>
      {/* Right leg (mirror of left) */}
      <group ref={rightLegRef} position={[0.09, 0.78, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.08, 0.22, 4, 8]} />
          <meshStandardMaterial color={pantsColor} roughness={0.85} />
        </mesh>
        <group ref={rightKneeRef} position={[0, -0.28, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
            <capsuleGeometry args={[0.07, 0.22, 4, 8]} />
            <meshStandardMaterial color={pantsColor} roughness={0.85} />
          </mesh>
        </group>
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
