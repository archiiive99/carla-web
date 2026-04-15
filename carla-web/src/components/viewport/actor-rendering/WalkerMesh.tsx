import { memo, useMemo } from "react";
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
      {/* iter-08: anatomically-articulated procedural walker. Still
          obviously a placeholder (no real GLB), but with separate
          head/torso/arms/legs the silhouette reads as "person" from a
          glance — closing the "what is this orange capsule" gap. Real
          GLB extraction is iter-08-extract-glb (UE editor blocked).
          Safety-visibility orange + low emissive floor preserved so
          the figure remains readable at night. castShadow on each
          piece so the walker settles correctly. */}
      {/* Torso */}
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
      {/* Left arm */}
      <mesh position={[-0.22, 1.05, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      {/* Right arm */}
      <mesh position={[0.22, 1.05, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.09, 0.45, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.08, 0.55, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.09, 0.45, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.08, 0.55, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.8} />
      </mesh>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.0, 1.2, 24]} />
          <meshBasicMaterial color={WALKER_WARNING} transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
});
