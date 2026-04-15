import { useEffect, useRef } from "react";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { carlaApi } from "@/lib/carla-api";
import { toast } from "sonner";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useEventStore } from "@/stores/eventStore";
import { subscribeVisible } from "@/lib/utils";

const POLL_INTERVAL_MS = 2_000;

export function useConnectionHealth() {
  const lastStatusRef = useRef<string>("disconnected");

  useEffect(() => {
    const check = async () => {
      const startedAt = performance.now();
      try {
        const health = await carlaApi.getHealth();
        const store = useSimulationStore.getState();
        usePerformanceStore.getState().update({ latency: performance.now() - startedAt });

        if (health.carla_connected) {
          useSimulationStore.setState({ connectionStatus: "connected" });
          if (lastStatusRef.current !== "connected") {
            toast.success("Reconnected to CARLA bridge");
            useEventStore.getState().addEvent(
              "connection",
              lastStatusRef.current === "disconnected"
                ? "Connected to CARLA bridge"
                : "Reconnected to CARLA bridge",
            );
          }
          try {
            const status = await carlaApi.getStatus();
            useSimulationStore.setState({
              isRunning: status.running,
              isPaused: status.paused,
              syncMode: status.sync_mode,
              currentTick: status.tick,
              elapsedTime: status.elapsed_time,
              currentMap: status.map,
              serverVersion: status.server_version,
            });
            const weather = await carlaApi.getWeather();
            useSimulationStore.setState({ weather });
            // Resolve ego vehicle from bridge realtime session if not yet set
            if (useActorStore.getState().egoVehicleId === null) {
              const session = await carlaApi.getRealtimeSession();
              if (session.default_vehicle_id) {
                useActorStore.getState().setEgoVehicleId(session.default_vehicle_id);
              }
            }
          } catch { /* optional */ }
          if (store.connectionStatus !== "connected") {
            usePerformanceStore.getState().markConnected();
          }
          lastStatusRef.current = "connected";
        } else {
          // Bridge up but CARLA not connected
          useSimulationStore.setState({ connectionStatus: "connecting" });
          if (lastStatusRef.current === "connected") {
            toast.warning("Connection lost. Reconnecting...");
            useEventStore.getState().addEvent(
              "connection",
              "Bridge up — CARLA disconnected, reconnecting",
            );
          }
          lastStatusRef.current = "connecting";
        }
      } catch {
        // Bridge unreachable
        useSimulationStore.setState({ connectionStatus: "error" });
        // Only toast if we were previously connected (don't spam on initial load)
        if (lastStatusRef.current === "connected") {
          toast.error("CARLA bridge unreachable");
          useEventStore.getState().addEvent(
            "connection",
            "Bridge unreachable",
          );
        }
        lastStatusRef.current = "error";
      }
    };

    check();
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      check();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const unsubscribeVisibility = subscribeVisible(check);
    return () => {
      clearInterval(interval);
      unsubscribeVisibility();
    };
  }, []);
}
