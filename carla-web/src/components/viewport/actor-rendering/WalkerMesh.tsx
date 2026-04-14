import { memo } from "react";
import type { CarlaActor } from "@/types/carla";
import { carlaToThree } from "./shared";

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
      {/* Abstract stand-in for a pedestrian — no glTF model is available at
          this tier for walkers, so this has to be clearly a placeholder.
          Safety-visibility orange + low emissive floor so the figure is
          readable at night without the scene being dominated by a glowing
          orange capsule. receiveShadow + castShadow so the walker settles
          correctly into lit scenes rather than reading as a cut-out. */}
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.22, 0.9, 6, 12]} />
        <meshStandardMaterial
          color="#f97316"
          emissive="#9a3412"
          emissiveIntensity={0.12}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#fb923c" roughness={0.75} />
      </mesh>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.0, 1.2, 24]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
});
