// 42. Centralize all magic numbers and defaults

import { getDefaultBridgeUrl } from "@/lib/bridge-url";

export const BRIDGE_URL_DEFAULT = getDefaultBridgeUrl();

// Note: the frontend port (58336) lives in vite.config.ts + playwright.config.ts,
// both root-level config files that can't easily `import` from src/. A duplicate
// export here would just be an out-of-sync liability.

/** localStorage key for the SettingsPage AppSettings blob. Exported so the
 *  SettingsPage writer and any future config readers share one source of
 *  truth — renaming the key won't silently break one side. */
export const APP_SETTINGS_KEY = "carla-web-settings";

/** localStorage key where the normalized bridge URL is cached. Shared by the
 *  SimulationStore writer, the CarlaApi initializer (lib/carla-api.ts), and
 *  the SimulationPage unmount cleanup — centralized so a rename touches one
 *  declaration instead of silently desyncing the sites. */
export const BRIDGE_URL_KEY = "bridgeUrl";

/** localStorage key for the UIStore persisted slice (panels / theme / camera
 *  mode / perf-overlay / showCityEnvironment). Centralized alongside the other
 *  keys so a rename hits one line; previously duplicated between the loader
 *  and writer in uiStore.ts. */
export const UI_STATE_KEY = "carla-ui-state";

// Toast copy used from multiple callsites. Centralized so wording edits
// don't leave straggler versions.
export const SPAWN_NO_POINTS_MSG = "No spawn points available on this map";

/** role_name tag the bridge assigns to its managed ego vehicle. Referenced
 *  from actor/sensor/viewport components to identify the bridge-controlled
 *  vehicle amidst NPC traffic. Must match
 *  carla-web-bridge's EGO_ROLE_NAME — see project_managed_actor_tagging. */
export const BRIDGE_EGO_ROLE = "bridge_ego";

// Performance
export const MAX_LIDAR_POINTS = 200_000;
export const PERF_MONITOR_INTERVAL_MS = 1000;

// UI
export const WEATHER_SLIDER_DEBOUNCE_MS = 300;
export const EVENT_LOG_MAX_ITEMS = 500;
export const GNSS_TRAIL_MAX_POINTS = 100;
export const IMU_BUFFER_MAX_SAMPLES = 200;

// Map
export const MINIMAP_DEFAULT_ZOOM = 1;
export const MINIMAP_MIN_ZOOM = 0.05;
export const MINIMAP_MAX_ZOOM = 20;
// WS reconnect/stats + telemetry batch + sensor-FPS intervals live inside
// their respective workers (src/workers/*.ts) which intentionally avoid
// importing from shared modules — see the "duplicated to avoid import issues
// in worker" comment in ws-receiver.worker.ts. A parallel declaration here
// would just be dead weight.
