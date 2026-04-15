import { create } from "zustand";
import { UI_STATE_KEY } from "@/constants";

export type CameraMode = "follow" | "birdseye" | "orbit" | "fpv" | "camera-match";

// 34. Add "map" and "roads" tabs to BottomTab type
type BottomTab = "sensors" | "map" | "roads" | "telemetry" | "events";

interface UIState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomTab;
  theme: "dark" | "light";
  cameraMode: CameraMode;
  showPerformanceOverlay: boolean;
  showShortcutsDialog: boolean;
  maximizedSensorId: number | null;
  // Full CityEnvironment geometry (buildings, vegetation, signage). On by
  // default so the main viewport and every sensor-cell camera render the
  // same scene contents. Kept toggle-able for performance debugging.
  showCityEnvironment: boolean;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setBottomPanelOpen: (open: boolean) => void;
  setBottomTab: (tab: BottomTab) => void;
  setTheme: (theme: "dark" | "light") => void;
  setCameraMode: (mode: CameraMode) => void;
  togglePerformanceOverlay: () => void;
  setShowShortcutsDialog: (open: boolean) => void;
  setMaximizedSensor: (id: number | null) => void;
  toggleCityEnvironment: () => void;
}

// 37. Persist UI state to localStorage
function loadUiState(): Partial<UIState> {
  let hasCameraOverride = false;
  try {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    hasCameraOverride = Boolean(params?.get("camPose") || params?.get("camMatch"));
    const saved = localStorage.getItem(UI_STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<UIState>;
      if (hasCameraOverride) {
        parsed.cameraMode = "camera-match";
      }
      return parsed;
    }
  } catch { /* ignore */ }
  const fallback: Partial<UIState> = {};
  if (hasCameraOverride) {
    fallback.cameraMode = "camera-match";
  }
  return fallback;
}

function saveUiState(state: Partial<UIState>) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      leftPanelOpen: state.leftPanelOpen,
      rightPanelOpen: state.rightPanelOpen,
      bottomPanelOpen: state.bottomPanelOpen,
      bottomPanelTab: state.bottomPanelTab,
      theme: state.theme,
      cameraMode: state.cameraMode,
      showPerformanceOverlay: state.showPerformanceOverlay,
      showCityEnvironment: state.showCityEnvironment,
    }));
  } catch { /* ignore */ }
}

const persisted = loadUiState();

// Apply the persisted theme to the document on load so the saved preference
// is respected on refresh (not just when the user clicks the toggle).
if (typeof document !== "undefined") {
  const initialTheme = (persisted.theme as "dark" | "light") ?? "dark";
  document.documentElement.classList.toggle("dark", initialTheme === "dark");
}

export const useUIStore = create<UIState>((set, get) => ({
  leftPanelOpen: persisted.leftPanelOpen ?? true,
  rightPanelOpen: persisted.rightPanelOpen ?? true,
  bottomPanelOpen: persisted.bottomPanelOpen ?? true,
  bottomPanelTab: (persisted.bottomPanelTab as BottomTab) ?? "sensors",
  theme: (persisted.theme as "dark" | "light") ?? "dark",
  cameraMode: (persisted.cameraMode as CameraMode) ?? "follow",
  showPerformanceOverlay: persisted.showPerformanceOverlay ?? false,
  showShortcutsDialog: false,
  maximizedSensorId: null,
  showCityEnvironment: persisted.showCityEnvironment ?? true,

  toggleLeftPanel: () =>
    set((s) => {
      const next = { leftPanelOpen: !s.leftPanelOpen };
      saveUiState({ ...s, ...next });
      return next;
    }),

  setLeftPanelOpen: (leftPanelOpen) => {
    set({ leftPanelOpen });
    const s = get();
    saveUiState({ ...s, leftPanelOpen });
  },

  toggleRightPanel: () =>
    set((s) => {
      const next = { rightPanelOpen: !s.rightPanelOpen };
      saveUiState({ ...s, ...next });
      return next;
    }),

  setRightPanelOpen: (rightPanelOpen) => {
    set({ rightPanelOpen });
    const s = get();
    saveUiState({ ...s, rightPanelOpen });
  },

  toggleBottomPanel: () =>
    set((s) => {
      const next = { bottomPanelOpen: !s.bottomPanelOpen };
      saveUiState({ ...s, ...next });
      return next;
    }),

  setBottomPanelOpen: (bottomPanelOpen) => {
    set({ bottomPanelOpen });
    const s = get();
    saveUiState({ ...s, bottomPanelOpen });
  },

  setBottomTab: (tab) => {
    set({ bottomPanelTab: tab, bottomPanelOpen: true });
    const s = get();
    saveUiState({ ...s, bottomPanelTab: tab, bottomPanelOpen: true });
  },

  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
    const s = get();
    saveUiState({ ...s, theme });
  },

  setCameraMode: (cameraMode) => {
    set({ cameraMode });
    const s = get();
    saveUiState({ ...s, cameraMode });
  },

  togglePerformanceOverlay: () =>
    set((s) => {
      const next = { showPerformanceOverlay: !s.showPerformanceOverlay };
      saveUiState({ ...s, ...next });
      return next;
    }),

  setShowShortcutsDialog: (showShortcutsDialog) => set({ showShortcutsDialog }),

  setMaximizedSensor: (id) => set({ maximizedSensorId: id }),

  toggleCityEnvironment: () =>
    set((s) => {
      const next = { showCityEnvironment: !s.showCityEnvironment };
      saveUiState({ ...s, ...next });
      return next;
    }),
}));

export type { BottomTab };
