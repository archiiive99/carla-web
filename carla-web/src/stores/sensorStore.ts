import { create } from "zustand";
import { toast } from "sonner";
import type { SensorConfig } from "@/types/carla";
import type { SpawnSensorRequest } from "@/types/api";
import { carlaApi } from "@/lib/carla-api";
import { getGlobalWsWorker } from "@/lib/worker-ref";

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
      return { sensors, subscriptions: subs };
    });
    toast.success(`Sensor #${sensorId} destroyed`);
  },

  refreshSensors: async () => {
    try {
      const actors = await carlaApi.getActors();
      const sensors = new Map<number, SensorConfig>();
      for (const a of actors) {
        if (a.type === "sensor") {
          sensors.set(a.id, {
            id: a.id,
            type: a.type_id,
            parent_id: a.parent_id ?? 0,
            transform: a.transform,
            attributes: {},
          });
        }
      }
      set({ sensors });
    } catch {
      // Not connected
    }
  },
}));
