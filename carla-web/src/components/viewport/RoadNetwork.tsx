import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { carlaApi } from "@/lib/carla-api";
import type { CarlaTransform } from "@/types/carla";
import { RoadMesh } from "./RoadMesh";
import { useSimulationStore } from "@/stores/simulationStore";

function carlaToThree(loc: { x: number; y: number; z: number }): [number, number, number] {
  return [loc.x, loc.z + 0.1, -loc.y];
}

function SpawnPointMarkers({ points }: { points: CarlaTransform[] }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const p = carlaToThree(points[i].location);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1] + 0.3;
      positions[i * 3 + 2] = p[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [points]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#eab308" size={3} sizeAttenuation transparent opacity={0.5} />
    </points>
  );
}

/** Road surface meshes + optional spawn-point markers. Lane markings are
 *  baked into the RoadMesh shader via the `edgeStyle` vertex attribute — no
 *  floating line geometry here (would z-fight and break at grazing camera
 *  angles).
 *
 *  Spawn-point markers (yellow dots scattered across the map) are a dev
 *  overlay. They appear as a constant visual noise that doesn't reflect
 *  any live simulation state, so they're opt-in via `?spawnPoints=1`
 *  rather than default-on. The information is still available in the
 *  SpawnPanel dialog's "Random Spawn Point" button. */
export function RoadNetwork() {
  const [spawnPoints, setSpawnPoints] = useState<CarlaTransform[]>([]);
  const showSpawnPoints = useMemo(() => {
    if (typeof window === "undefined") return false;
    return /spawnPoints=1/.test(window.location.search);
  }, []);
  const currentMap = useSimulationStore((s) => s.currentMap);

  useEffect(() => {
    if (!showSpawnPoints) return;
    let cancelled = false;
    setSpawnPoints([]);
    carlaApi
      .getSpawnPoints()
      .then((data) => {
        if (!cancelled) setSpawnPoints(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentMap, showSpawnPoints]);

  return (
    <>
      <RoadMesh />
      {showSpawnPoints && spawnPoints.length > 0 && (
        <SpawnPointMarkers points={spawnPoints} />
      )}
    </>
  );
}
