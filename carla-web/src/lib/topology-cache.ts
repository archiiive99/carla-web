import type { TopologyEdge } from "@/types/carla";
import { carlaApi } from "@/lib/carla-api";

/**
 * Per-map topology cache. MiniMap (Bottom-panel Map tab) and OpenDriveViewer
 * (Bottom-panel Roads tab) both call carlaApi.getTopology() on mount + when
 * currentMap changes. Base-ui Tabs unmounts inactive tabs, so switching tabs
 * re-fetches from zero every time — topology is a per-map immutable so a
 * simple module-level cache keyed on map name eliminates the repeat RPCs.
 *
 * Cache is invalidated implicitly by asking for a new map. `invalidate()`
 * is also exposed for explicit flushes on reload_world (where the map name
 * may stay the same but the topology is theoretically rebuilt).
 */
let cache: { map: string; edges: TopologyEdge[] } | null = null;
let inflight: { map: string; promise: Promise<TopologyEdge[]> } | null = null;

export async function getTopologyCached(mapName: string): Promise<TopologyEdge[]> {
  if (cache && cache.map === mapName) {
    return cache.edges;
  }
  if (inflight && inflight.map === mapName) {
    // Coalesce concurrent requests — two components mounting back-to-back
    // for the same map share a single in-flight promise instead of
    // issuing two RPCs that both populate the cache.
    return inflight.promise;
  }
  const promise = carlaApi
    .getTopology()
    .then((edges) => {
      cache = { map: mapName, edges };
      if (inflight?.map === mapName) inflight = null;
      return edges;
    })
    .catch((e) => {
      if (inflight?.map === mapName) inflight = null;
      throw e;
    });
  inflight = { map: mapName, promise };
  return promise;
}

/** Force a re-fetch on next call. Used by reload flows where the world is
 *  rebuilt but the map name didn't change. */
export function invalidateTopologyCache(): void {
  cache = null;
  inflight = null;
}
