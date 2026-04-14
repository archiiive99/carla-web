/**
 * Generates Three.js BufferGeometry for road surface meshes from CARLA waypoint data.
 *
 * Each lane is converted to a quad strip: for every waypoint along the lane center,
 * two vertices are emitted at the left and right edges (offset by half lane_width
 * perpendicular to the road direction). Consecutive pairs form quads (2 triangles each).
 *
 * Coordinate conversion: CARLA (x, y, z) -> Three.js (x, z_carla, -y_carla)
 */
import * as THREE from "three"

export interface RoadWaypoint {
  x: number
  y: number
  z: number
  yaw: number
  road_id: number
  lane_id: number
  lane_width: number
  is_junction: boolean
}

/** Result of mesh generation: separate geometries for roads, junctions, sidewalks, and curbs. */
export interface RoadMeshResult {
  roadGeometry: THREE.BufferGeometry
  junctionGeometry: THREE.BufferGeometry
  /** Flat concrete top of the sidewalk running along outermost lane edges. */
  sidewalkGeometry: THREE.BufferGeometry
  /** Vertical curb face between the road surface and the sidewalk top. */
  curbGeometry: THREE.BufferGeometry
}

// Curb + sidewalk dimensions (metres). ROAD_Y is the asphalt elevation above
// the world ground plane — lifted enough that other static meshes near y=0
// (parking actors, terrain decoration) can't z-fight the road. Curb and
// sidewalk top stay 15 cm above the asphalt regardless.
const ROAD_Y = 0.05
const CURB_HEIGHT = 0.15
const SIDEWALK_WIDTH = 2.0
const TOP_Y = ROAD_Y + CURB_HEIGHT

/**
 * Edge-style codes written into each vertex's `edgeStyle` attribute. The road
 * shader reads this to decide what kind of lane marking to bake at the edge
 * that vertex is on.
 *   0 = no marking (junction interior, or fallback)
 *   1 = solid white (outer road edge — shoulder line)
 *   2 = dashed white (between two same-direction lanes)
 *   3 = double yellow (reference-line boundary between opposing directions)
 */
const EDGE_NONE = 0
const EDGE_SOLID = 1
const EDGE_DASHED = 2
const EDGE_DOUBLE_YELLOW = 3

function classifyEdges(
  laneId: number,
  roadLaneIds: Set<number>,
): { u0: number; u1: number } {
  // u=0 (inner side, closer to the reference line):
  //   |lane_id|==1: AT the reference line.  Double yellow if opposing lanes
  //   exist on this road; otherwise this side is the outer edge of a one-way
  //   street → solid white.
  //   |lane_id|>1: adjacent to a same-direction lane → dashed white.
  let u0: number
  if (Math.abs(laneId) === 1) {
    const hasOpposing = Array.from(roadLaneIds).some(
      (l) => l !== 0 && Math.sign(l) !== Math.sign(laneId),
    )
    u0 = hasOpposing ? EDGE_DOUBLE_YELLOW : EDGE_SOLID
  } else {
    u0 = EDGE_DASHED
  }
  // u=1 (outer side, away from the reference line):
  //   No outward neighbour → outer road edge (solid white).
  //   Outward neighbour exists → same-direction dashed boundary.
  const outward = laneId < 0 ? laneId - 1 : laneId + 1
  const u1 = roadLaneIds.has(outward) ? EDGE_DASHED : EDGE_SOLID
  return { u0, u1 }
}

/**
 * Build a single merged BufferGeometry from an array of waypoints that share
 * a filtering predicate (e.g. is_junction or !is_junction).
 *
 * Emits a custom `edgeStyle` float attribute that the road shader uses to
 * render baked lane markings — solid/dashed/double-yellow — at the correct
 * edges without any floating decal geometry (avoids z-fighting at grazing
 * angles).
 *
 * `lanesByRoad` is needed to classify each lane's boundaries: whether u=1
 * faces an outer edge vs. another same-direction lane, and whether u=0 lies
 * on the reference line of a two-way road.
 */
function buildGeometryFromWaypoints(
  lanes: Map<string, RoadWaypoint[]>,
  lanesByRoad: Map<number, Set<number>>,
  bakeMarkings: boolean,
  distToJunctionPerLane: Map<string, number[]>,
  arrowDistPerLane: Map<string, number[]>,
): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const edgeStyles: number[] = []
  const distToJunctions: number[] = []
  const arrowDists: number[] = []
  // Lane forward direction in Three.js XZ (vec2). Same value for both u=0 and
  // u=1 verts of a waypoint. Shader projects world XZ onto this to compute a
  // dash phase that's continuous across same-direction adjacent lanes.
  const forwardsXZ: number[] = []
  const indices: number[] = []
  let vertexOffset = 0

  for (const [laneKey, laneWps] of lanes) {
    if (laneWps.length < 2) continue

    // Classify this lane's edges once per lane.
    let styleL = EDGE_NONE
    let styleR = EDGE_NONE
    if (bakeMarkings) {
      const [roadIdStr, laneIdStr] = laneKey.split("_")
      const roadId = Number(roadIdStr)
      const laneId = Number(laneIdStr)
      const roadLaneIds = lanesByRoad.get(roadId) ?? new Set<number>()
      const { u0, u1 } = classifyEdges(laneId, roadLaneIds)
      styleL = u0
      styleR = u1
    }

    const distArr = distToJunctionPerLane.get(laneKey)
    const arrowArr = arrowDistPerLane.get(laneKey)

    // Accumulated distance along the lane (metres). Used for UV v and for
    // dash phase in the shader, so dashes are scale-stable across lane widths.
    let accDist = 0

    for (let i = 0; i < laneWps.length; i++) {
      const wp = laneWps[i]
      const halfWidth = wp.lane_width / 2
      const yawRad = (wp.yaw * Math.PI) / 180

      // CARLA forward vector is along yaw; the right vector is perpendicular.
      // CARLA uses left-hand coords: forward = (cos(yaw), sin(yaw), 0)
      // Right = (sin(yaw), -cos(yaw), 0)  (90 deg clockwise in top-down)
      const rightX = Math.sin(yawRad)  // CARLA x-component of right vector
      const rightY = -Math.cos(yawRad) // CARLA y-component of right vector

      const cx = wp.x
      const cy = wp.z  // CARLA z -> Three.js y (up)
      const cz = -wp.y // CARLA y -> Three.js -z

      const lx = cx - rightX * halfWidth
      const ly = cy + ROAD_Y
      const lz = cz - (-rightY) * halfWidth

      const rx = cx + rightX * halfWidth
      const ry = cy + ROAD_Y
      const rz = cz + (-rightY) * halfWidth

      positions.push(lx, ly, lz)
      positions.push(rx, ry, rz)

      normals.push(0, 1, 0)
      normals.push(0, 1, 0)

      if (i > 0) {
        const prev = laneWps[i - 1]
        const dx = wp.x - prev.x
        const dy = wp.y - prev.y
        accDist += Math.sqrt(dx * dx + dy * dy)
      }
      // v in metres (not lane widths) so the shader can dash at a fixed
      // real-world rate independent of lane width.
      uvs.push(0, accDist)
      uvs.push(1, accDist)

      edgeStyles.push(styleL, styleR)

      // Both edge vertices of the same waypoint share the same dist-to-junction
      // (the distance is along-lane, not across-lane). Sentinel 1000 means
      // "no junction adjacent" — interpolation stays large so no paint fires.
      const dist = distArr ? distArr[i] : 1000
      distToJunctions.push(dist, dist)
      const aDist = arrowArr ? arrowArr[i] : 1000
      arrowDists.push(aDist, aDist)

      // Lane forward direction in Three space: (cos(yaw), -sin(yaw)) on XZ.
      // CARLA forward = (cos(yaw), sin(yaw)) on its XY; CARLA→Three maps
      // (x, y) → (x, -z), so y → -z makes the Three Z component = -sin(yaw).
      const fwdTx = Math.cos(yawRad)
      const fwdTz = -Math.sin(yawRad)
      forwardsXZ.push(fwdTx, fwdTz, fwdTx, fwdTz)

      if (i > 0) {
        const base = vertexOffset + (i - 1) * 2
        indices.push(base, base + 1, base + 2)
        indices.push(base + 1, base + 3, base + 2)
      }
    }

    vertexOffset += laneWps.length * 2
  }

  const geometry = new THREE.BufferGeometry()

  if (positions.length === 0) {
    return geometry
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute("edgeStyle", new THREE.Float32BufferAttribute(edgeStyles, 1))
  geometry.setAttribute("distToJunction", new THREE.Float32BufferAttribute(distToJunctions, 1))
  geometry.setAttribute("arrowDist", new THREE.Float32BufferAttribute(arrowDists, 1))
  geometry.setAttribute("forwardXZ", new THREE.Float32BufferAttribute(forwardsXZ, 2))
  geometry.setIndex(indices)

  return geometry
}

/**
 * Sort waypoints within each lane so they follow the road direction.
 *
 * Since CARLA's generate_waypoints() does not guarantee ordering along the
 * s-parameter, we sort by greedy nearest-neighbour traversal starting from
 * the waypoint nearest to the lane's bounding-box corner. This avoids
 * the zig-zag artifacts that a naive sort-by-coordinate would produce on
 * curved roads.
 */
function sortLaneWaypoints(wps: RoadWaypoint[]): RoadWaypoint[] {
  if (wps.length <= 2) return wps

  // Start from the waypoint with the smallest x (tie-break by smallest y).
  // This is arbitrary but deterministic.
  let startIdx = 0
  for (let i = 1; i < wps.length; i++) {
    if (
      wps[i].x < wps[startIdx].x ||
      (wps[i].x === wps[startIdx].x && wps[i].y < wps[startIdx].y)
    ) {
      startIdx = i
    }
  }

  const sorted: RoadWaypoint[] = []
  const used = new Uint8Array(wps.length)
  let cur = startIdx

  for (let n = 0; n < wps.length; n++) {
    sorted.push(wps[cur])
    used[cur] = 1

    // Find nearest unused neighbour
    let bestDist = Infinity
    let bestIdx = -1
    for (let j = 0; j < wps.length; j++) {
      if (used[j]) continue
      const dx = wps[j].x - wps[cur].x
      const dy = wps[j].y - wps[cur].y
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        bestIdx = j
      }
    }
    if (bestIdx >= 0) cur = bestIdx
  }

  return sorted
}

/**
 * Compute the set of lane keys whose u=1 edge is an OUTER road boundary
 * (no adjacent lane exists further out on the same side of the reference line).
 * The u=1 edge of a lane always faces "outward" in the lane's travel frame
 * because positive lane_ids have their yaw flipped 180° relative to the
 * reference line — see buildGeometryFromWaypoints for the right-vector math.
 */
/**
 * For each non-junction lane, compute the along-lane distance from each
 * waypoint to the nearest junction-adjacent endpoint (start or end of the
 * sorted lane). Lanes that don't touch a junction get +Infinity (sentinel
 * 1000 in the buffer). The shader uses this to bake stop-lines and crosswalks
 * just before each junction approach.
 *
 * `computeArrowDistPerLane` differs: it returns a SIGNED-direction distance
 * so the shader can place forward arrows that point toward the junction, but
 * only on lanes whose travel direction actually ends at that junction (entry
 * lanes, not exit lanes — drivers don't need arrows leaving an intersection).
 */
const JUNCTION_PROXIMITY_M = 4.0

/** +1 if the sorted waypoint order matches the lane's travel direction, -1 if reversed. */
function detectSortDirection(wps: RoadWaypoint[]): 1 | -1 {
  if (wps.length < 2) return 1
  const dx = wps[1].x - wps[0].x
  const dy = wps[1].y - wps[0].y
  const yaw0 = (wps[0].yaw * Math.PI) / 180
  const fx = Math.cos(yaw0)
  const fy = Math.sin(yaw0)
  return dx * fx + dy * fy >= 0 ? 1 : -1
}

function computeDistToJunctionPerLane(
  roadLanes: Map<string, RoadWaypoint[]>,
  junctionLanes: Map<string, RoadWaypoint[]>,
): Map<string, number[]> {
  const out = new Map<string, number[]>()

  // Flatten junction waypoints into a plain XY array for proximity tests.
  const jpxs: number[] = []
  const jpys: number[] = []
  for (const wps of junctionLanes.values()) {
    for (const wp of wps) {
      jpxs.push(wp.x)
      jpys.push(wp.y)
    }
  }
  const jp_n = jpxs.length

  function nearestJunctionDist(x: number, y: number): number {
    let best = Infinity
    for (let k = 0; k < jp_n; k++) {
      const dx = x - jpxs[k]
      const dy = y - jpys[k]
      const d2 = dx * dx + dy * dy
      if (d2 < best) best = d2
    }
    return Math.sqrt(best)
  }

  for (const [key, wps] of roadLanes) {
    if (wps.length < 2 || jp_n === 0) {
      out.set(key, wps.map(() => Infinity))
      continue
    }
    const startNear = nearestJunctionDist(wps[0].x, wps[0].y) < JUNCTION_PROXIMITY_M
    const endNear = nearestJunctionDist(wps[wps.length - 1].x, wps[wps.length - 1].y) < JUNCTION_PROXIMITY_M

    const cum: number[] = [0]
    for (let i = 1; i < wps.length; i++) {
      const dx = wps[i].x - wps[i - 1].x
      const dy = wps[i].y - wps[i - 1].y
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy))
    }
    const total = cum[cum.length - 1]

    const dists = wps.map((_, i) => {
      const fromStart = cum[i]
      const fromEnd = total - cum[i]
      if (startNear && endNear) return Math.min(fromStart, fromEnd)
      if (startNear) return fromStart
      if (endNear) return fromEnd
      return Infinity
    })
    out.set(key, dists)
  }

  return out
}

/**
 * Distance from each waypoint to the lane's TRAVEL-END, but only when that
 * end is junction-adjacent. Used to paint forward arrows on lanes that are
 * approaching (not exiting) an intersection. Returns +Infinity for vertices
 * on lanes whose travel-end is not at a junction (or for short connectors
 * where both ends touch junctions — direction is ambiguous so we skip).
 */
function computeArrowDistPerLane(
  roadLanes: Map<string, RoadWaypoint[]>,
  junctionLanes: Map<string, RoadWaypoint[]>,
): Map<string, number[]> {
  const out = new Map<string, number[]>()

  const jpxs: number[] = []
  const jpys: number[] = []
  for (const wps of junctionLanes.values()) {
    for (const wp of wps) {
      jpxs.push(wp.x)
      jpys.push(wp.y)
    }
  }
  const jp_n = jpxs.length

  function nearestJunctionDist(x: number, y: number): number {
    let best = Infinity
    for (let k = 0; k < jp_n; k++) {
      const dx = x - jpxs[k]
      const dy = y - jpys[k]
      const d2 = dx * dx + dy * dy
      if (d2 < best) best = d2
    }
    return Math.sqrt(best)
  }

  for (const [key, wps] of roadLanes) {
    if (wps.length < 2 || jp_n === 0) {
      out.set(key, wps.map(() => Infinity))
      continue
    }
    const startNear = nearestJunctionDist(wps[0].x, wps[0].y) < JUNCTION_PROXIMITY_M
    const endNear = nearestJunctionDist(wps[wps.length - 1].x, wps[wps.length - 1].y) < JUNCTION_PROXIMITY_M

    // Both-ends or neither-end: arrows ambiguous or absent, skip.
    if (startNear === endNear) {
      out.set(key, wps.map(() => Infinity))
      continue
    }

    const sortDir = detectSortDirection(wps)
    // travel-end is sorted[n-1] when sortDir=+1, sorted[0] when sortDir=-1.
    const travelEndIsSortedEnd = sortDir === 1
    // Arrow paints only when the travel-end matches the junction-adjacent end.
    const travelEndNearJunction = travelEndIsSortedEnd ? endNear : startNear
    if (!travelEndNearJunction) {
      out.set(key, wps.map(() => Infinity))
      continue
    }

    const cum: number[] = [0]
    for (let i = 1; i < wps.length; i++) {
      const dx = wps[i].x - wps[i - 1].x
      const dy = wps[i].y - wps[i - 1].y
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy))
    }
    const total = cum[cum.length - 1]
    // arrowDist = distance to travel-end; small at travel-end.
    const dists = wps.map((_, i) => (travelEndIsSortedEnd ? total - cum[i] : cum[i]))
    out.set(key, dists)
  }

  return out
}

function computeOutermostLaneKeys(lanesByRoad: Map<number, Set<number>>): Set<string> {
  const outer = new Set<string>()
  for (const [roadId, laneIds] of lanesByRoad) {
    for (const lid of laneIds) {
      if (lid === 0) continue
      // Outward neighbour: more negative for lid<0, more positive for lid>0.
      const neighbour = lid < 0 ? lid - 1 : lid + 1
      if (!laneIds.has(neighbour)) {
        outer.add(`${roadId}_${lid}`)
      }
    }
  }
  return outer
}

/**
 * Build curb (vertical face) and sidewalk (horizontal top) geometries that
 * run along the u=1 side of outermost lanes. Both are emitted as quad strips
 * sharing the same waypoint traversal as the road surface.
 */
/** Distance the curb/sidewalk extends past a junction-adjacent lane endpoint
 * to bridge the corner gap at intersections. The extension runs along the
 * outermost lane's u=1 edge, which is on the OUTER side of the road — i.e.
 * the corner area where pedestrians cross, NOT where cars drive through the
 * intersection. So extending the curb a couple metres into the junction
 * along that outer edge is geometrically where the corner curb actually
 * belongs, and approximate corner coverage emerges where adjacent roads'
 * extensions converge. */
const CORNER_STUB_LEN_M = 2.5

/** Synthesize a phantom waypoint at `signedDist` metres along the lane's
 * forward direction from `wp`. Phantom keeps lane width, yaw, and z so the
 * extruded curb/sidewalk strip continues straight without warping. */
function phantomWaypoint(wp: RoadWaypoint, signedDist: number): RoadWaypoint {
  const yawRad = (wp.yaw * Math.PI) / 180
  return {
    ...wp,
    x: wp.x + Math.cos(yawRad) * signedDist,
    y: wp.y + Math.sin(yawRad) * signedDist,
  }
}

function buildCurbAndSidewalk(
  lanes: Map<string, RoadWaypoint[]>,
  outermostKeys: Set<string>,
  distToJunctionPerLane: Map<string, number[]>,
): { sidewalkGeo: THREE.BufferGeometry; curbGeo: THREE.BufferGeometry } {
  const sw = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] }
  const cb = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] }
  let swOffset = 0
  let cbOffset = 0

  for (const [key, wps] of lanes) {
    if (!outermostKeys.has(key)) continue
    if (wps.length < 2) continue

    // Junction-corner extensions: prepend / append a phantom waypoint where
    // the lane endpoint is junction-adjacent (dist≈0). The strip-build loop
    // below treats `seq` as if it were the real lane, so corner coverage
    // emerges naturally without any new index plumbing.
    const distArr = distToJunctionPerLane.get(key)
    const startNear = distArr ? distArr[0] < 0.5 : false
    const endNear = distArr ? distArr[distArr.length - 1] < 0.5 : false
    const seq: RoadWaypoint[] = []
    if (startNear) seq.push(phantomWaypoint(wps[0], -CORNER_STUB_LEN_M))
    seq.push(...wps)
    if (endNear) seq.push(phantomWaypoint(wps[wps.length - 1], CORNER_STUB_LEN_M))

    let accDist = 0
    for (let i = 0; i < seq.length; i++) {
      const wp = seq[i]
      const halfWidth = wp.lane_width / 2
      const yawRad = (wp.yaw * Math.PI) / 180

      // Right vector in Three.js coords: (sin(yaw), 0, cos(yaw))
      // Derived from CARLA right = (sin, -cos, 0), then CARLA→Three (x, z, -y).
      const rTx = Math.sin(yawRad)
      const rTz = Math.cos(yawRad)

      const cx = wp.x
      const cy = wp.z
      const cz = -wp.y

      // Road outer edge (u=1) position — curb bottom sits exactly here so the
      // vertical face meets the road surface without a visible gap.
      const ox = cx + rTx * halfWidth
      const oz = cz + rTz * halfWidth

      // Sidewalk outer edge is extruded SIDEWALK_WIDTH further out, at TOP_Y.
      const sx = cx + rTx * (halfWidth + SIDEWALK_WIDTH)
      const sz = cz + rTz * (halfWidth + SIDEWALK_WIDTH)

      if (i > 0) {
        const prev = seq[i - 1]
        const dx = wp.x - prev.x
        const dy = wp.y - prev.y
        accDist += Math.sqrt(dx * dx + dy * dy)
      }

      // Sidewalk top: inner vertex (at curb lip) then outer vertex.
      sw.positions.push(ox, cy + TOP_Y, oz)
      sw.positions.push(sx, cy + TOP_Y, sz)
      sw.normals.push(0, 1, 0, 0, 1, 0)
      const sv = accDist / 2.0 // tile every ~2 m for concrete scoring lines
      sw.uvs.push(0, sv, 1, sv)

      // Curb face: bottom (at road level) then top (lifted).
      cb.positions.push(ox, cy + ROAD_Y, oz)
      cb.positions.push(ox, cy + TOP_Y, oz)
      // Normal points outward (away from the road) so directional light catches the face.
      cb.normals.push(rTx, 0, rTz, rTx, 0, rTz)
      cb.uvs.push(0, accDist, 1, accDist)

      if (i > 0) {
        const sBase = swOffset + (i - 1) * 2
        sw.indices.push(sBase, sBase + 1, sBase + 2)
        sw.indices.push(sBase + 1, sBase + 3, sBase + 2)
        const cBase = cbOffset + (i - 1) * 2
        cb.indices.push(cBase, cBase + 1, cBase + 2)
        cb.indices.push(cBase + 1, cBase + 3, cBase + 2)
      }
    }

    swOffset += seq.length * 2
    cbOffset += seq.length * 2
  }

  const sidewalkGeo = new THREE.BufferGeometry()
  if (sw.positions.length > 0) {
    sidewalkGeo.setAttribute("position", new THREE.Float32BufferAttribute(sw.positions, 3))
    sidewalkGeo.setAttribute("normal", new THREE.Float32BufferAttribute(sw.normals, 3))
    sidewalkGeo.setAttribute("uv", new THREE.Float32BufferAttribute(sw.uvs, 2))
    sidewalkGeo.setIndex(sw.indices)
  }

  const curbGeo = new THREE.BufferGeometry()
  if (cb.positions.length > 0) {
    curbGeo.setAttribute("position", new THREE.Float32BufferAttribute(cb.positions, 3))
    curbGeo.setAttribute("normal", new THREE.Float32BufferAttribute(cb.normals, 3))
    curbGeo.setAttribute("uv", new THREE.Float32BufferAttribute(cb.uvs, 2))
    curbGeo.setIndex(cb.indices)
  }

  return { sidewalkGeo, curbGeo }
}

/**
 * Generate road surface mesh geometry from CARLA road waypoints.
 *
 * Returns separate geometries for regular roads, junctions, sidewalks, and
 * curb faces so each can be styled independently (PBR asphalt vs concrete vs
 * flat curb face).
 */
export function generateRoadMesh(waypoints: RoadWaypoint[]): RoadMeshResult {
  // Group waypoints by (road_id, lane_id) into road lanes vs junction lanes.
  const roadLanes = new Map<string, RoadWaypoint[]>()
  const junctionLanes = new Map<string, RoadWaypoint[]>()
  // Per-road set of lane_ids — used to find outermost lanes for curb emission.
  const lanesByRoad = new Map<number, Set<number>>()

  for (const wp of waypoints) {
    // Skip lane_id 0 (reference line, not a drivable lane).
    if (wp.lane_id === 0) continue

    const key = `${wp.road_id}_${wp.lane_id}`
    const target = wp.is_junction ? junctionLanes : roadLanes

    if (!target.has(key)) target.set(key, [])
    target.get(key)!.push(wp)

    if (!lanesByRoad.has(wp.road_id)) lanesByRoad.set(wp.road_id, new Set())
    lanesByRoad.get(wp.road_id)!.add(wp.lane_id)
  }

  // Sort waypoints within each lane for proper strip ordering.
  for (const [key, wps] of roadLanes) {
    roadLanes.set(key, sortLaneWaypoints(wps))
  }
  for (const [key, wps] of junctionLanes) {
    junctionLanes.set(key, sortLaneWaypoints(wps))
  }

  const outermostKeys = computeOutermostLaneKeys(lanesByRoad)
  const distToJunctionPerLane = computeDistToJunctionPerLane(roadLanes, junctionLanes)
  const arrowDistPerLane = computeArrowDistPerLane(roadLanes, junctionLanes)
  // Curbs/sidewalks run along non-junction lanes' outer edges and extend a
  // short distance into adjacent junctions to bridge corner gaps.
  const { sidewalkGeo, curbGeo } = buildCurbAndSidewalk(roadLanes, outermostKeys, distToJunctionPerLane)

  // Junction lanes need an empty per-lane dist map (all keys present, all values infinity)
  // so the buffer attribute count matches even though the shader won't use them.
  const emptyDistMap = new Map<string, number[]>()

  return {
    // Road lanes get baked markings via the edgeStyle attribute, plus
    // stop-line / crosswalk via distToJunction, plus forward arrows via arrowDist.
    roadGeometry: buildGeometryFromWaypoints(roadLanes, lanesByRoad, true, distToJunctionPerLane, arrowDistPerLane),
    // Junction lanes skip marking bakes — lane topology is ambiguous inside
    // intersections and would produce wrong stripes through crossings.
    junctionGeometry: buildGeometryFromWaypoints(junctionLanes, lanesByRoad, false, emptyDistMap, emptyDistMap),
    sidewalkGeometry: sidewalkGeo,
    curbGeometry: curbGeo,
  }
}
