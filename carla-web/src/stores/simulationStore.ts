import { errorMessage , reportError } from "@/lib/utils";
import { create } from "zustand";
import { toast } from "sonner";
import type { CarlaWeatherParams, WeatherPreset } from "@/types/carla";
import { carlaApi } from "@/lib/carla-api";
import { BRIDGE_URL_DEFAULT, BRIDGE_URL_KEY } from "@/constants";
import { normalizeBridgeUrl } from "@/lib/bridge-url";
import { useEventStore } from "@/stores/eventStore";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface SimulationState {
  connectionStatus: ConnectionStatus;
  bridgeUrl: string;
  isRunning: boolean;
  isPaused: boolean;
  syncMode: boolean;
  currentTick: number;
  elapsedTime: number;
  fixedDeltaSeconds: number;
  currentMap: string;
  serverVersion: string;
  weather: CarlaWeatherParams;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setBridgeUrl: (url: string) => void;
  connect: (bridgeUrl: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  step: () => Promise<void>;
  setWeather: (params: Partial<CarlaWeatherParams>) => Promise<void>;
  setWeatherPreset: (preset: WeatherPreset) => Promise<void>;
  loadMap: (name: string) => Promise<void>;
  updateFromTick: (tick: number, time: number) => void;
}

const DEFAULT_WEATHER: CarlaWeatherParams = {
  cloudiness: 0,
  precipitation: 0,
  precipitation_deposits: 0,
  wind_intensity: 0,
  sun_azimuth_angle: 0,
  sun_altitude_angle: 70,
  fog_density: 0,
  fog_distance: 0,
  fog_falloff: 0,
  wetness: 0,
  scattering_intensity: 0,
  mie_scattering_scale: 0,
  rayleigh_scattering_scale: 0,
  dust_storm: 0,
};

export const useSimulationStore = create<SimulationState>((set) => ({
  connectionStatus: "disconnected",
  bridgeUrl: BRIDGE_URL_DEFAULT,
  isRunning: false,
  isPaused: false,
  syncMode: false,
  currentTick: 0,
  elapsedTime: 0,
  fixedDeltaSeconds: 0,
  currentMap: "",
  serverVersion: "",
  weather: DEFAULT_WEATHER,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setBridgeUrl: (url) => {
    const normalized = normalizeBridgeUrl(url);
    if (typeof window !== "undefined") {
      localStorage.setItem(BRIDGE_URL_KEY, normalized);
    }
    set({ bridgeUrl: normalized });
  },

  connect: async (bridgeUrl) => {
    const normalized = normalizeBridgeUrl(bridgeUrl);
    if (typeof window !== "undefined") {
      localStorage.setItem(BRIDGE_URL_KEY, normalized);
    }
    set({ connectionStatus: "connecting", bridgeUrl: normalized });
    // Just set the URL — useConnectionHealth hook handles polling + state transitions
  },

  refreshStatus: async () => {
    try {
      const status = await carlaApi.getStatus();
      set({
        connectionStatus: status.connected ? "connected" : "disconnected",
        isRunning: status.running,
        isPaused: status.paused,
        syncMode: status.sync_mode,
        currentTick: status.tick,
        elapsedTime: status.elapsed_time,
        fixedDeltaSeconds: status.fixed_delta,
        currentMap: status.map,
        serverVersion: status.server_version,
      });
    } catch {
      set({ connectionStatus: "error" });
    }
  },

  play: async () => {
    try {
      await carlaApi.play();
      set({ isRunning: true, isPaused: false });
    } catch (e) {
      reportError("Play", e);
    }
  },

  pause: async () => {
    try {
      await carlaApi.pause();
      set({ isPaused: true });
    } catch (e) {
      reportError("Pause", e);
    }
  },

  step: async () => {
    try {
      const res = await carlaApi.step();
      set({ currentTick: res.frame });
    } catch (e) {
      reportError("Step", e);
    }
  },

  setWeather: async (params) => {
    try {
      await carlaApi.setWeather(params);
      set((s) => ({ weather: { ...s.weather, ...params } }));
    } catch (e) {
      reportError("Weather update", e);
    }
  },

  setWeatherPreset: async (preset) => {
    try {
      await carlaApi.setWeatherPreset(preset);
      const weather = await carlaApi.getWeather();
      set({ weather });
      toast.success(`Weather: ${preset}`);
      useEventStore.getState().addEvent("weather", `Preset → ${preset}`);
    } catch (e) {
      reportError("Weather preset", e);
    }
  },

  loadMap: async (name) => {
    try {
      await carlaApi.loadMap(name);
      set({ currentMap: name });
      const { formatMapName } = await import("@/lib/utils");
      const short = formatMapName(name) || name;
      toast.success(`Map loaded: ${short}`);
      useEventStore.getState().addEvent("map", `Loaded ${short}`);
      // Proactively refresh actor + sensor stores — the backend rebuilds the
      // world so every actor id from the previous map is now stale. Waiting
      // for the 2s poll tick would briefly show ghost vehicles.
      const [{ useActorStore }, { useSensorStore }] = await Promise.all([
        import("@/stores/actorStore"),
        import("@/stores/sensorStore"),
      ]);
      useActorStore.getState().refreshActors();
      useSensorStore.getState().refreshSensors();
    } catch (e) {
      reportError("Map load", e);
    }
  },

  updateFromTick: (tick, time) =>
    set({ currentTick: tick, elapsedTime: time }),
}));

/**
 * Convenience selector — `useSimulationStore((s) => s.connectionStatus === "connected")`
 * was duplicated at 9+ call sites. One helper avoids drift if the "connected"
 * string ever gets renamed or the check widens (e.g. also accept "connecting").
 */
export const useIsConnected = () =>
  useSimulationStore((s) => s.connectionStatus === "connected");
