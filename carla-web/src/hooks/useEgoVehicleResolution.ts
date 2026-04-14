import { useEffect } from "react";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { carlaApi } from "@/lib/carla-api";

/**
 * Polls the bridge's realtime session until a default_vehicle_id is
 * available, then pins it as the ego vehicle in the actor store. Used by
 * the viewport so the 3D camera / HUD / WASD control can all target a
 * single canonical ego regardless of which vehicle the user has clicked.
 */
export function useEgoVehicleResolution() {
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const egoVehicleId = useActorStore((s) => s.egoVehicleId);

  useEffect(() => {
    if (egoVehicleId !== null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function resolve() {
      if (cancelled) return;
      try {
        const session = await carlaApi.getRealtimeSession();
        if (cancelled) return;
        if (session.default_vehicle_id) {
          useActorStore.getState().setEgoVehicleId(session.default_vehicle_id);
        } else {
          timer = setTimeout(resolve, 1000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(resolve, 2000);
      }
    }

    resolve();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [connectionStatus, egoVehicleId]);
}
