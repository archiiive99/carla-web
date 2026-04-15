import { reportError } from "@/lib/utils";
import { create } from "zustand";
import { toast } from "sonner";
import type { CarlaActor, VehicleControl } from "@/types/carla";
import type { ActorTransform } from "@/types/ws";
import type { SpawnVehicleRequest, SpawnWalkerRequest } from "@/types/api";
import { carlaApi } from "@/lib/carla-api";
import { useEventStore } from "@/stores/eventStore";
import { SPAWN_NO_POINTS_MSG, BRIDGE_EGO_ROLE } from "@/constants";

interface ActorsByType {
  vehicles: number[];
  walkers: number[];
  sensors: number[];
  trafficLights: number[];
  other: number[];
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
  applyControl: (id: number, control: VehicleControl) => Promise<void>;
  setAutopilot: (id: number, enabled: boolean) => Promise<void>;
  spawnMultipleVehicles: (count: number, blueprint?: string) => Promise<CarlaActor[]>;
  refreshActors: () => Promise<void>;
  destroyAll: () => Promise<void>;
}

function classifyActors(actors: Map<number, CarlaActor>): ActorsByType {
  const result: ActorsByType = {
    vehicles: [],
    walkers: [],
    sensors: [],
    trafficLights: [],
    other: [],
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
      case "traffic_light":
        result.trafficLights.push(id);
        break;
      default:
        result.other.push(id);
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
    trafficLights: [],
    other: [],
  },

  setEgoVehicleId: (id) => {
    const state = get();
    // Reset autopilot assumption to true when ego swaps (bridge spawns new ego with autopilot)
    const egoAutopilot = id !== state.egoVehicleId && id !== null ? true : state.egoAutopilot;
    set({ egoVehicleId: id, egoAutopilot });
  },
  selectActor: (id) => set({ selectedActorId: id }),

  updateActorTransforms: (batch) => {
    set((state) => {
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
        }
      }
      return { actors };
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
  },

  applyControl: async (id, control) => {
    await carlaApi.applyControl(id, control);
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
    if (state.egoVehicleId === id) {
      set({ egoAutopilot: enabled });
    }
  },

  spawnMultipleVehicles: async (count: number, blueprint = "vehicle.tesla.model3") => {
    const spawned: CarlaActor[] = [];
    const spawnPoints = await carlaApi.getSpawnPoints();
    if (!spawnPoints.length) {
      toast.error(SPAWN_NO_POINTS_MSG);
      return spawned;
    }
    for (let i = 0; i < Math.min(count, spawnPoints.length); i++) {
      try {
        const actor = await carlaApi.spawnVehicle({
          blueprint,
          transform: spawnPoints[i],
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
        .addEvent("spawn", `Bulk-spawned ${spawned.length} ${blueprint.split(".").pop() ?? "vehicles"}`);
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
      toast.success(`Destroyed ${result.count} actor${result.count === 1 ? "" : "s"}`);
      useEventStore
        .getState()
        .addEvent("destroy", `Destroy all — removed ${result.count} actor${result.count === 1 ? "" : "s"}`);
    } catch (e) {
      reportError("Destroy all", e);
    }
  },
}));
