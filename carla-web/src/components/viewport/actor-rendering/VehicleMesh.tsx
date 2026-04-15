import { memo, useMemo, useState, useEffect, Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { CarlaActor } from "@/types/carla";
import { resolveVehicleModel } from "../CarlaAssetLoader";
import { ErrorBoundaryFallback, carlaToThree } from "./shared";
import { vehiclePlaceholderFootprint } from "./vehicle-class";
import { VEHICLE_DEFAULT, VEHICLE_BRAKE, VEHICLE_REVERSE } from "../scene-palette";

/** Inner component that loads and renders a glTF vehicle model.
 *
 *  iter-03-revisit-attribute-color: the CARLA-extracted GLBs ship with
 *  the UE5 editor default `WorldGridMaterial` in their paint slot
 *  (verified via pygltflib for Car_AudiTT.glb and others). This means
 *  every vehicle was rendering with the engine's grid-checker default
 *  before this fix. We detect that material name and replace it with a
 *  state-driven MeshStandardMaterial whose color comes from
 *  `actor.vehicle_color` (broadcast from CARLA via the bridge's
 *  WeatherState/ActorInfo schema). Falls back to VEHICLE_DEFAULT if
 *  the actor has no color attribute. Other material slots (glass,
 *  metal trim, etc.) are preserved as-is. */
function GltfVehicleModel({ path, paintColor }: { path: string; paintColor: string }) {
  const { scene } = useGLTF(path);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.Material;
        if (mat.name === "WorldGridMaterial") {
          // Replace the UE5-leftover default with a real PBR paint.
          const paintMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(paintColor),
            roughness: 0.45,
            metalness: 0.5,
            envMapIntensity: 0.5,
          });
          child.material = paintMat;
          child.userData.paintMatRef = paintMat;
        } else {
          // Preserve the GLB's authored material; just tone down env map.
          const cloned_mat = (mat as THREE.MeshStandardMaterial).clone();
          cloned_mat.envMapIntensity = Math.min(cloned_mat.envMapIntensity ?? 1, 0.35);
          child.material = cloned_mat;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [scene, paintColor]);
  // When paintColor changes (e.g. actor.vehicle_color update), update
  // the cached paint material's color in place — avoids re-cloning the
  // whole scene tree per re-paint.
  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.paintMatRef) {
        const m = child.userData.paintMatRef as THREE.MeshStandardMaterial;
        m.color.set(paintColor);
      }
    });
  }, [paintColor, cloned]);
  return <primitive object={cloned} />;
}

// Parse CARLA's vehicle_color string ("R,G,B" 0-255 ints) into a hex
// string consumable by THREE.Color. Returns null if not a valid value.
function parseVehicleColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  const hex = parts.map((n) => n.toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

export const VehicleMesh = memo(function VehicleMesh({
  actor,
  isEgo,
  isSelected,
  onSelect,
  onFocus,
}: {
  actor: CarlaActor;
  isEgo: boolean;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onFocus: (id: number) => void;
}) {
  const pos = carlaToThree(actor.transform.location);
  const yaw = (-actor.transform.rotation.yaw * Math.PI) / 180;
  const modelResolution = useMemo(
    () => resolveVehicleModel(actor.type_id),
    [actor.type_id],
  );
  const modelPath = modelResolution.path;
  // Track failures by path so switching to another actor/model automatically
  // clears the unavailable state without a setState-in-effect reset.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const useGltf = modelPath !== null && failedPath !== modelPath;
  const placeholderFp = useMemo(
    () => vehiclePlaceholderFootprint(actor),
    [actor],
  );

  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(actor.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onFocus(actor.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* Invisible hitbox keeps selection/focus interaction available even
          when a source-faithful mesh is unavailable in approximation mode. */}
      <mesh visible={false} position={[0, 1.0, 0]}>
        <boxGeometry args={[5, 2.2, 2.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {useGltf ? (
        <Suspense fallback={null}>
          <ErrorBoundaryFallback onError={() => setFailedPath(modelPath)}>
            <GltfVehicleModel
              path={modelPath}
              paintColor={parseVehicleColor(actor.vehicle_color) ?? VEHICLE_DEFAULT}
            />
          </ErrorBoundaryFallback>
        </Suspense>
      ) : (
        /* Unmapped vehicle marker — the actor exists but we don't ship a
           glTF for its blueprint. Shape picked per class so two-wheelers
           don't render the same way as cars: cars/trucks/buses get a
           wireframe box sized to the class chassis, bikes and motorcycles
           get a horizontal capsule along the forward axis (reads as
           two-wheeler silhouette, not a tall thin rectangle). Wireframe
           + neutral grey + low alpha keep either shape clearly in
           "approximate placeholder" territory — it can't be mistaken for
           a faithful asset. The class mapping uses `vehicle_wheel_count`
           with a make-substring fallback. */
        <group>
          {placeholderFp.shape === "capsule-x" ? (
            <mesh
              position={[0, placeholderFp.box.height / 2, 0]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow={false}
            >
              <capsuleGeometry
                args={[
                  placeholderFp.box.width / 2,
                  Math.max(0, placeholderFp.box.length - placeholderFp.box.width),
                  4,
                  10,
                ]}
              />
              <meshBasicMaterial
                color={VEHICLE_DEFAULT}
                wireframe
                transparent
                opacity={0.45}
              />
            </mesh>
          ) : (
            <mesh
              position={[0, placeholderFp.box.height / 2, 0]}
              castShadow={false}
            >
              <boxGeometry
                args={[
                  placeholderFp.box.length,
                  placeholderFp.box.height,
                  placeholderFp.box.width,
                ]}
              />
              <meshBasicMaterial
                color={VEHICLE_DEFAULT}
                wireframe
                transparent
                opacity={0.45}
              />
            </mesh>
          )}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry
              args={[placeholderFp.ringRadius, placeholderFp.ringRadius + 0.15, 24]}
            />
            <meshBasicMaterial color={VEHICLE_DEFAULT} transparent opacity={0.3} />
          </mesh>
        </group>
      )}
      {/* Selection ring — documented amber-500 accent */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[3.2, 3.5, 32]} />
          <meshBasicMaterial color={VEHICLE_BRAKE} transparent opacity={0.6} />
        </mesh>
      )}
      {isEgo && !isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[3.2, 3.4, 32]} />
          <meshBasicMaterial color={VEHICLE_REVERSE} transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  );
});
