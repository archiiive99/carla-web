import { create } from "zustand";
import { toast } from "sonner";
import type { SensorConfig } from "@/types/carla";
import type { SpawnSensorRequest } from "@/types/api";
import { carlaApi } from "@/lib/carla-api";
import { getGlobalWsWorker } from "@/lib/worker-ref";
import { useActorStore } from "@/stores/actorStore";

interface SensorState {
  sensors: Map<number, SensorConfig>;
  subscriptions: Set<number>;
  pendingSubscriptions: Set<number>;

  subscribe: (sensorId: number) => void;
  unsubscribe: (sensorId: number) => void;
  spawnSensor: (config: SpawnSensorRequest) => Promise<SensorConfig>;
  destroySensor: (sensorId: number) => Promise<void>;
  refreshSensors: () => Promise<void>;
}

export const useSensorStore = create<SensorState>((set, get) => ({
  sensors: new Map(),
  subscriptions: new Set(),
  pendingSubscriptions: new Set(),

  subscribe: (sensorId) => {
    // Retry at 0/500/1500ms to cover the race where the ws-receiver worker
    // hasn't finished connecting when the first subscribe lands. Each retry
    // re-checks `subscriptions` so a quick unsubscribe() immediately after
    // subscribe() isn't undone by the later retries landing on the bridge.
    const worker = getGlobalWsWorker();
    if (worker) {
      const msg = { type: "subscribe", data: { sensorId } };
      worker.postMessage(msg);
      const retryIfStillSubscribed = () => {
        if (get().subscriptions.has(sensorId)) worker.postMessage(msg);
      };
      setTimeout(retryIfStillSubscribed, 500);
      setTimeout(retryIfStillSubscribed, 1500);
    }
    set((state) => {
      const subs = new Set(state.subscriptions);
      subs.add(sensorId);
      const pending = new Set(state.pendingSubscriptions);
      pending.add(sensorId);
      return { subscriptions: subs, pendingSubscriptions: pending };
    });
    // Clear pending after the last retry lands. 2s is past the 1500ms
    // third retry + a small grace for the bridge to start pushing frames.
    setTimeout(() => {
      set((state) => {
        if (!state.pendingSubscriptions.has(sensorId)) return state;
        const pending = new Set(state.pendingSubscriptions);
        pending.delete(sensorId);
        return { pendingSubscriptions: pending };
      });
    }, 2000);
  },

  unsubscribe: (sensorId) => {
    const worker = getGlobalWsWorker();
    worker?.postMessage({ type: "unsubscribe", data: { sensorId } });
    set((state) => {
      const subs = new Set(state.subscriptions);
      subs.delete(sensorId);
      const pending = new Set(state.pendingSubscriptions);
      pending.delete(sensorId);
      return { subscriptions: subs, pendingSubscriptions: pending };
    });
  },

  spawnSensor: async (config) => {
    // The bridge's POST /api/actors/spawn/sensor returns a minimal
    // {id, type, parent_id} payload (see routes/actors.py:215). Fill
    // in the rest from the request we just sent so the store's
    // SensorConfig invariant (transform + attributes always present)
    // holds — readers like SensorExtrinsicController otherwise crash
    // on undefined transform. Attribute values are coerced to strings
    // since that's what the bridge stores and re-emits via GET
    // /api/sensors/:id/config.
    const minimal = await carlaApi.spawnSensor(config);
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.attributes)) {
      attributes[k] = String(v);
    }
    const sensor: SensorConfig = {
      id: minimal.id,
      type: minimal.type,
      parent_id: minimal.parent_id,
      transform: config.transform,
      attributes,
    };
    set((state) => {
      const sensors = new Map(state.sensors);
      sensors.set(sensor.id, sensor);
      return { sensors };
    });
    toast.success(`Sensor spawned: ${config.type.split(".").pop()}`);
    return sensor;
  },

  destroySensor: async (sensorId) => {
    // Unsubscribe first
    const worker = getGlobalWsWorker();
    worker?.postMessage({ type: "unsubscribe", data: { sensorId } });
    await carlaApi.destroyActor(sensorId);
    set((state) => {
      const sensors = new Map(state.sensors);
      sensors.delete(sensorId);
      const subs = new Set(state.subscriptions);
      subs.delete(sensorId);
      // Also prune pendingSubscriptions — if the user spawned with
      // auto-subscribe and destroyed inside the 2s pending window, the
      // pending entry would linger as dead state until its own timer
      // fired. Keep the "sensor gone" invariant tight: neither set has
      // the id once the sensor is destroyed.
      const pending = new Set(state.pendingSubscriptions);
      pending.delete(sensorId);
      return { sensors, subscriptions: subs, pendingSubscriptions: pending };
    });
    toast.success(`Sensor #${sensorId} destroyed`);
  },

  refreshSensors: async () => {
    // Derive the sensor map from actorStore (which already owns the
    // /api/actors payload) instead of issuing a second GET for the
    // same data. Before this, SimulationPage's 2s polling fired two
    // /api/actors RPCs per tick — one from actorStore.refreshActors
    // and one from here — even though the sensor view just filters
    // the same list to type==="sensor".
    //
    // Attributes (fov / image_size_x / image_size_y) are NOT in the
    // actorStore payload, so we preserve them from the previous store
    // snapshot the same way the prior implementation did. A freshly
    // spawned sensor has its attributes set via spawnSensor directly.
    const actorList = Array.from(useActorStore.getState().actors.values());
    const sensors = new Map<number, SensorConfig>();
    const state = get();
    const previous = state.sensors;
    for (const a of actorList) {
      if (a.type === "sensor") {
        sensors.set(a.id, {
          id: a.id,
          type: a.type_id,
          parent_id: a.parent_id ?? 0,
          transform: a.transform,
          attributes: previous.get(a.id)?.attributes ?? {},
        });
      }
    }
    // Drop subscription / pending entries for sensors that no longer exist.
    // Without this the sets accumulated dead IDs forever: map reload or
    // DELETE /api/actors/all tore the sensors out of actorStore, but the
    // subscription set kept the stale ids. On a later WS reconnect (new
    // bridge URL, or the sensor id getting reused across sessions) we'd
    // broadcast unsubscribe/subscribe for ids that the new bridge had
    // never issued, and the 2s pending-clear timer fired in the void.
    let subscriptions = state.subscriptions;
    let pendingSubscriptions = state.pendingSubscriptions;
    const subsStale = [...subscriptions].filter((id) => !sensors.has(id));
    if (subsStale.length > 0) {
      subscriptions = new Set(subscriptions);
      for (const id of subsStale) subscriptions.delete(id);
    }
    const pendingStale = [...pendingSubscriptions].filter((id) => !sensors.has(id));
    if (pendingStale.length > 0) {
      pendingSubscriptions = new Set(pendingSubscriptions);
      for (const id of pendingStale) pendingSubscriptions.delete(id);
    }
    set({ sensors, subscriptions, pendingSubscriptions });
  },
}));
