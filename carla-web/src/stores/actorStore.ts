import { reportError } from "@/lib/utils";
import { create } from "zustand";
import { toast } from "sonner";
import type { CarlaActor } from "@/types/carla";
import type { ActorTransform } from "@/types/ws";
import type { SpawnVehicleRequest, SpawnWalkerRequest } from "@/types/api";
import { carlaApi } from "@/lib/carla-api";
import { useEventStore } from "@/stores/eventStore";
import { useSensorStore } from "@/stores/sensorStore";
import { SPAWN_NO_POINTS_MSG, BRIDGE_EGO_ROLE } from "@/constants";

// CARLA renames vehicle blueprints across releases — "vehicle.tesla.model3"
// exists in 0.9.x but was removed in 0.10. The quick-spawn buttons and
// CommandPalette scenarios hardcoded that id and silently failed with
// "Blueprint not found" on 0.10 builds. Resolve against the live blueprint
// list and try common fallbacks so the buttons work regardless of build.
const PREFERRED_VEHICLE_BLUEPRINTS = [
  "vehicle.tesla.model3",
  "vehicle.lincoln.mkz_2020",
  "vehicle.audi.a2",
  "vehicle.lincoln.mkz",
  "vehicle.dodge.charger",
];

export async function resolveVehicleBlueprint(
  hint?: string,
): Promise<string | null> {
  try {
    const blueprints = await carlaApi.getVehicleBlueprints();
    const ids = new Set(blueprints.map((bp) => bp.id));
    if (hint && ids.has(hint)) return hint;
    for (const preferred of PREFERRED_VEHICLE_BLUEPRINTS) {
      if (ids.has(preferred)) return preferred;
    }
    return blueprints[0]?.id ?? null;
  } catch {
    // Getter failed — fall back to the hint so the spawn-vehicle error
    // path still surfaces a meaningful toast rather than a silent noop.
    return hint ?? null;
  }
}

// Same class of bug as PREFERRED_VEHICLE_BLUEPRINTS — "walker.pedestrian.0001"
// exists in 0.9.x but CARLA 0.10 ships a different set starting at 0043.
// Resolve against the live list so the walker quick-spawn buttons don't 400
// with "Blueprint not found" on newer builds.
const PREFERRED_WALKER_BLUEPRINTS = [
  "walker.pedestrian.0001",
  "walker.pedestrian.0014",
  "walker.pedestrian.0020",
  "walker.pedestrian.0043",
];

export async function resolveWalkerBlueprint(
  hint?: string,
): Promise<string | null> {
  try {
    const blueprints = await carlaApi.getWalkerBlueprints();
    const ids = new Set(blueprints.map((bp) => bp.id));
    if (hint && ids.has(hint)) return hint;
    for (const preferred of PREFERRED_WALKER_BLUEPRINTS) {
      if (ids.has(preferred)) return preferred;
    }
    return blueprints[0]?.id ?? null;
  } catch {
    return hint ?? null;
  }
}

interface ActorsByType {
  vehicles: number[];
  walkers: number[];
  sensors: number[];
}

interface ActorState {
  actors: Map<number, CarlaActor>;
  selectedActorId: number | null;
  egoVehicleId: number | null;
  egoAutopilot: boolean;
  actorsByType: ActorsByType;

  setEgoVehicleId: (id: number | null) => void;
  selectActor: (id: number | null) => void;
  updateActorTransforms: (batch: ActorTransform[]) => void;
  spawnVehicle: (config: SpawnVehicleRequest) => Promise<CarlaActor>;
  spawnWalker: (config: SpawnWalkerRequest) => Promise<CarlaActor>;
  destroyActor: (id: number) => Promise<void>;
  setAutopilot: (id: number, enabled: boolean) => Promise<void>;
  spawnMultipleVehicles: (count: number, blueprint?: string) => Promise<CarlaActor[]>;
  refreshActors: () => Promise<void>;
  destroyAll: () => Promise<void>;
}

function classifyActors(actors: Map<number, CarlaActor>): ActorsByType {
  // Only the three groups that UI actually reads are bucketed here.
  // Traffic-light + other-actor groupings used to be built every tick
  // but were write-only; LeftPanel rebuilds its own richer grouping
  // from the full actor map (it needs CarlaActor objects, not IDs).
  const result: ActorsByType = {
    vehicles: [],
    walkers: [],
    sensors: [],
  };
  for (const [id, actor] of actors) {
    switch (actor.type) {
      case "vehicle":
        result.vehicles.push(id);
        break;
      case "walker":
        result.walkers.push(id);
        break;
      case "sensor":
        result.sensors.push(id);
        break;
    }
  }
  return result;
}

export const useActorStore = create<ActorState>((set, get) => ({
  actors: new Map(),
  selectedActorId: null,
  egoVehicleId: null,
  egoAutopilot: true,  // bridge-managed ego starts with autopilot enabled
  actorsByType: {
    vehicles: [],
    walkers: [],
    sensors: [],
  },

  setEgoVehicleId: (id) => {
    const state = get();
    // Reset autopilot assumption to true when ego swaps (bridge spawns new ego with autopilot)
    const egoAutopilot = id !== state.egoVehicleId && id !== null ? true : state.egoAutopilot;
    set({ egoVehicleId: id, egoAutopilot });
  },
  selectActor: (id) => set({ selectedActorId: id }),

  updateActorTransforms: (batch) => {
    // Fires ~20× per second from the WS world_tick broadcaster. Short-
    // circuit empty batches (bridge with no tracked actors) before
    // allocating a new Map — zustand treats any new object reference as
    // a change and re-runs every subscriber's selector, so a silent
    // no-op would still trigger the whole actor-list / minimap / actor
    // renderer tree.
    if (batch.length === 0) return;
    set((state) => {
      let changed = false;
      const actors = new Map(state.actors);
      for (const t of batch) {
        const existing = actors.get(t.id);
        if (existing) {
          actors.set(t.id, {
            ...existing,
            transform: {
              location: t.position,
              rotation: t.rotation,
            },
            velocity: t.velocity,
          });
          changed = true;
        }
      }
      // Same short-circuit for a batch whose actors are all unknown to
      // the store (can happen right after a map reload, before
      // refreshActors has repopulated). No point emitting a phantom
      // Map swap that looks identical to every subscriber.
      return changed ? { actors } : state;
    });
  },

  spawnVehicle: async (config) => {
    const actor = await carlaApi.spawnVehicle(config);
    set((state) => {
      const actors = new Map(state.actors);
      actors.set(actor.id, actor);
      return { actors, actorsByType: classifyActors(actors) };
    });
    const short = config.blueprint.split(".").pop() ?? "vehicle";
    toast.success(`Spawned ${short}`);
    useEventStore.getState().addEvent("spawn", `Vehicle #${actor.id} ${short}`);
    return actor;
  },

  spawnWalker: async (config) => {
    const actor = await carlaApi.spawnWalker(config);
    set((state) => {
      const actors = new Map(state.actors);
      actors.set(actor.id, actor);
      return { actors, actorsByType: classifyActors(actors) };
    });
    toast.success(`Spawned walker`);
    useEventStore.getState().addEvent("spawn", `Walker #${actor.id}`);
    return actor;
  },

  destroyActor: async (id) => {
    const actor = get().actors.get(id);
    const wasSensor = actor?.type === "sensor";
    const label = actor
      ? `${actor.type} #${id}`
      : `actor #${id}`;
    await carlaApi.destroyActor(id);
    toast.success(`Destroyed ${label}`);
    useEventStore.getState().addEvent("destroy", `Destroyed ${label}`);
    set((state) => {
      const actors = new Map(state.actors);
      actors.delete(id);
      const selectedActorId =
        state.selectedActorId === id ? null : state.selectedActorId;
      const egoVehicleId =
        state.egoVehicleId === id ? null : state.egoVehicleId;
      return {
        actors,
        selectedActorId,
        egoVehicleId,
        actorsByType: classifyActors(actors),
      };
    });
    // sensorStore.sensors is derived from actorStore; if the destroyed
    // actor was a sensor, sync sensorStore inline so the sensor grid's
    // ghost-cell window (up to 2s until the next refreshActors poll)
    // collapses to zero. Same pattern as destroyAll's sync call.
    // refreshSensors also prunes stale subscription/pending entries via
    // the invariant it maintains.
    if (wasSensor) {
      useSensorStore.getState().refreshSensors();
    }
  },

  setAutopilot: async (id, enabled) => {
    const state = get();
    const wasEgo = state.egoVehicleId === id;
    const previous = state.egoAutopilot;
    if (wasEgo) {
      set({ egoAutopilot: enabled });
    }
    try {
      await carlaApi.setAutopilot(id, enabled);
    } catch (error) {
      if (wasEgo) {
        set({ egoAutopilot: previous });
      }
      throw error;
    }
    // Previously re-set egoAutopilot here on success, guarded by the
    // pre-await `state.egoVehicleId === id` snapshot. Both parts were
    // wrong: the value matches what was optimistically set above, so the
    // set is a no-op; and the snapshot check meant an ego that swapped
    // during the await would still be "re-confirmed" via a stale
    // comparison. Just let the optimistic set stand on success.
  },

  spawnMultipleVehicles: async (count: number, blueprint?: string) => {
    const spawned: CarlaActor[] = [];
    const resolved = await resolveVehicleBlueprint(blueprint);
    if (!resolved) {
      toast.error("No vehicle blueprint available in this CARLA build");
      return spawned;
    }
    const spawnPoints = await carlaApi.getSpawnPoints();
    if (!spawnPoints.length) {
      toast.error(SPAWN_NO_POINTS_MSG);
      return spawned;
    }
    for (let i = 0; i < Math.min(count, spawnPoints.length); i++) {
      const transform = spawnPoints[i];
      if (!transform) continue;
      try {
        const actor = await carlaApi.spawnVehicle({
          blueprint: resolved,
          transform,
          autopilot: true,
        });
        spawned.push(actor);
      } catch {
        break;
      }
    }
    set((state) => {
      const actors = new Map(state.actors);
      for (const a of spawned) actors.set(a.id, a);
      return { actors, actorsByType: classifyActors(actors) };
    });
    if (spawned.length > 0) {
      toast.success(`Spawned ${spawned.length} vehicle${spawned.length === 1 ? "" : "s"}`);
      useEventStore
        .getState()
        .addEvent("spawn", `Bulk-spawned ${spawned.length} ${resolved.split(".").pop() ?? "vehicles"}`);
    } else {
      toast.error("Could not spawn any vehicles (all spawn points occupied?)");
    }
    return spawned;
  },

  refreshActors: async () => {
    try {
      const actorList = await carlaApi.getActors();
      const actors = new Map<number, CarlaActor>();
      for (const a of actorList) {
        actors.set(a.id, a);
      }
      // Auto-set ego to the bridge-managed vehicle if user hasn't chosen one
      const state = get();
      const currentEgo = state.egoVehicleId;
      let egoVehicleId = currentEgo;
      if (egoVehicleId == null || !actors.has(egoVehicleId)) {
        const managed = actorList.find(
          (a) => a.type === "vehicle" && a.role_name === BRIDGE_EGO_ROLE,
        );
        egoVehicleId = managed ? managed.id : null;
      }
      // When ego swaps (or re-appears after bridge reload), reset autopilot
      // assumption to true — bridge always spawns managed ego with autopilot on
      const egoAutopilot =
        egoVehicleId !== currentEgo && egoVehicleId !== null ? true : state.egoAutopilot;
      set({ actors, actorsByType: classifyActors(actors), egoVehicleId, egoAutopilot });
    } catch {
      // Connection not available
    }
  },

  destroyAll: async () => {
    try {
      const result = await carlaApi.destroyAllActors();
      // Clear only actors the bridge actually destroyed — keep built-in
      // traffic lights that /api/actors/all deliberately leaves alone.
      set((state) => {
        const actors = new Map(state.actors);
        for (const a of Array.from(actors.values())) {
          if (a.type === "traffic_light") continue;
          actors.delete(a.id);
        }
        return {
          actors,
          actorsByType: classifyActors(actors),
          selectedActorId: null,
          egoVehicleId: null,
        };
      });
      // sensorStore.sensors is derived from actorStore; without an explicit
      // sync the sensor grid kept showing ghost cells with frozen last
      // frames until the next 2s refreshActors poll caught up. refreshSensors
      // also prunes stale subscription/pending entries via the invariant
      // check added in its recent refactor, which is important here because
      // /api/actors/all destroyed every spawned sensor on the bridge.
      useSensorStore.getState().refreshSensors();
      toast.success(`Destroyed ${result.count} actor${result.count === 1 ? "" : "s"}`);
      useEventStore
        .getState()
        .addEvent("destroy", `Destroy all — removed ${result.count} actor${result.count === 1 ? "" : "s"}`);
    } catch (e) {
      reportError("Destroy all", e);
    }
  },
}));
