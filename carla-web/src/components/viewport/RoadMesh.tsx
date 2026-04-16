/**
 * RoadMesh — renders CARLA road surfaces as solid 3D mesh geometry.
 *
 * Fetches dense road waypoints from the bridge's /api/map/road-geometry
 * endpoint, then generates quad-strip meshes for each lane using
 * road-mesh-generator. Roads and junctions are rendered with separate
 * materials for visual distinction. All the GLSL/material construction
 * (asphalt albedo, wet-road Fresnel, lane-marking painting, curb
 * streaks, sidewalk aggregate) lives in ./road-materials.ts so this file
 * only handles fetch/generation orchestration.
 */
import { useEffect, useMemo, useState } from "react"
import {
  generateRoadMesh,
  type RoadWaypoint,
  type RoadMeshResult,
} from "@/lib/road-mesh-generator"
import { carlaApi } from "@/lib/carla-api"
import { useSimulationStore } from "@/stores/simulationStore"
import {
  ROAD_UNIFORMS,
  ROAD_MATERIAL,
  JUNCTION_MATERIAL,
  SIDEWALK_MATERIAL,
  CURB_MATERIAL,
} from "./road-materials"

export function RoadMesh() {
  const [waypoints, setWaypoints] = useState<RoadWaypoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Wet-road coupling: combine CARLA's wetness, precipitation_deposits,
  // and live precipitation (0-100 each) into a normalized 0-1 wetness
  // factor for the road shader. Static deposits matter after rain stops;
  // live precipitation (iter-12-revisit-wetness-active-rain) adds a 50%
  // weighted term so a fresh-rain state reads wet even before deposits
  // accumulate.
  const wetness = useSimulationStore(
    (s) =>
      Math.min(
        1,
        ((s.weather?.wetness ?? 0) +
          (s.weather?.precipitation_deposits ?? 0) +
          (s.weather?.precipitation ?? 0) * 0.5) /
          200,
      ),
  )
  useEffect(() => {
    ROAD_UNIFORMS.uWetness.value = wetness
  }, [wetness])

  // Re-fetch when the active map changes — Town01's road geometry must be
  // dropped before Town02 loads, otherwise the wrong roads stay rendered.
  const currentMap = useSimulationStore((s) => s.currentMap)

  useEffect(() => {
    let cancelled = false
    setWaypoints(null)
    setError(null)

    async function fetchRoadGeometry() {
      try {
        const data = await carlaApi.getRoadGeometry(2)
        if (!cancelled) {
          setWaypoints(data)
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn("[RoadMesh] Failed to fetch road geometry:", msg)
          setError(msg)
          setTimeout(() => {
            if (!cancelled) {
              fetchRoadGeometry()
            }
          }, 5000)
        }
      }
    }

    fetchRoadGeometry()
    return () => {
      cancelled = true
    }
  }, [currentMap])

  const meshResult: RoadMeshResult | null = useMemo(() => {
    if (!waypoints || waypoints.length === 0) return null
    try {
      return generateRoadMesh(waypoints)
    } catch (err) {
      console.error("[RoadMesh] Mesh generation failed:", err)
      return null
    }
  }, [waypoints])

  if (error && !waypoints) return null
  if (!meshResult) return null

  return (
    <group name="road-mesh">
      {meshResult.roadGeometry.index && meshResult.roadGeometry.index.count > 0 && (
        <mesh geometry={meshResult.roadGeometry} material={ROAD_MATERIAL} receiveShadow />
      )}
      {meshResult.junctionGeometry.index && meshResult.junctionGeometry.index.count > 0 && (
        <mesh geometry={meshResult.junctionGeometry} material={JUNCTION_MATERIAL} receiveShadow />
      )}
      {meshResult.curbGeometry.index && meshResult.curbGeometry.index.count > 0 && (
        <mesh geometry={meshResult.curbGeometry} material={CURB_MATERIAL} receiveShadow castShadow />
      )}
      {meshResult.sidewalkGeometry.index && meshResult.sidewalkGeometry.index.count > 0 && (
        <mesh geometry={meshResult.sidewalkGeometry} material={SIDEWALK_MATERIAL} receiveShadow />
      )}
    </group>
  )
}
