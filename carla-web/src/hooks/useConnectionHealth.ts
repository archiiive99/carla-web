import { useEffect, useRef } from "react";
import { useSimulationStore } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";
import { toast } from "sonner";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useEventStore } from "@/stores/eventStore";
import { subscribeVisible } from "@/lib/utils";

const POLL_INTERVAL_MS = 2_000;

export function useConnectionHealth() {
  const lastStatusRef = useRef<string>("disconnected");
  // Track whether we've ever reached "connected" successfully in this
  // session. The previous `lastStatusRef === "disconnected"` check for
  // "Connected" vs "Reconnected" flipped to "Reconnected" as soon as any
  // non-"disconnected" state had been observed — including the "error"
  // path hit when the bridge is down at page load. Result: a user who
  // opened the page before the bridge was up saw the first-ever
  // connection announced as "Reconnected", which is wrong.
  const hasEverConnectedRef = useRef(false);

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
            const message = hasEverConnectedRef.current
              ? "Reconnected to CARLA bridge"
              : "Connected to CARLA bridge";
            toast.success(message);
            useEventStore.getState().addEvent("connection", message);
            hasEverConnectedRef.current = true;
          }
          try {
            const status = await carlaApi.getStatus();
            useSimulationStore.setState((s) => {
              // tick/elapsed_time are authoritatively delivered by the 20 Hz
              // WS world_tick stream via updateFromTick. The 2s HTTP poll's
              // snapshot is ~50-100ms older by the time it lands, so
              // unconditionally setting them here overwrote fresher WS ticks
              // and flickered the StatusBar frame counter backwards. Accept
              // the poll value only if it strictly advances the store —
              // covers the initial-load case (store at 0, WS not yet connected)
              // while letting WS dominate steady-state.
              const advances = status.tick > s.currentTick;
              return {
                isRunning: status.running,
                isPaused: status.paused,
                syncMode: status.sync_mode,
                currentMap: status.map,
                serverVersion: status.server_version,
                ...(advances
                  ? { currentTick: status.tick, elapsedTime: status.elapsed_time }
                  : {}),
              };
            });
            // Weather changes only happen via explicit user actions
            // (setWeather / setWeatherPreset already update the store)
            // or on map load (simulationStore.loadMap calls refreshActors
            // but weather flows through setWeatherPreset separately).
            // Fetch only on transition to connected so the initial store
            // value is real, not the DEFAULT_WEATHER constant.
            if (lastStatusRef.current !== "connected") {
              try {
                const weather = await carlaApi.getWeather();
                useSimulationStore.setState({ weather });
              } catch { /* optional */ }
            }
            // Ego vehicle resolution is handled by the dedicated
            // useEgoVehicleResolution hook (mounted on MainViewport) with
            // its own 1s polling loop. Previously we duplicated the
            // /api/realtime/session call here every 2s until ego was set,
            // meaning two hooks raced for the same resolution.
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
