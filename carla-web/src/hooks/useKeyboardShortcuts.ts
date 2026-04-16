
import { useEffect } from "react";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { useUIStore } from "@/stores/uiStore";
import { reportError } from "@/lib/utils";

// Keys that VehicleControls uses for driving
const DRIVING_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "Space"]);

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const sim = useSimulationStore.getState();
      const ui = useUIStore.getState();
      const actors = useActorStore.getState();

      // When an ego vehicle exists, driving keys belong to VehicleControls
      const egoExists = actors.egoVehicleId !== null;
      if (egoExists && DRIVING_KEYS.has(event.code)) {
        return; // Let VehicleControls handle these
      }

      // Cmd/Ctrl+K opens the command palette — handled before the
      // "unmodified keys only" guard below so the modifier combo isn't
      // filtered out.
      if (event.code === "KeyK" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("open-command-palette"));
        return;
      }

      // Every shortcut in the switch below is an unmodified single key
      // (Shift is allowed — Shift+/ opens the shortcuts dialog). Ignore
      // Ctrl/Cmd/Alt combos so browser/OS shortcuts (Ctrl+1 switch tab,
      // Cmd+Space Spotlight, Alt+Space window menu, …) don't also flip
      // a camera mode or toggle a panel as a side effect.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.code) {
        case "Space":
          // Only reaches here if no ego vehicle (driving mode takes priority above)
          event.preventDefault();
          if (sim.isRunning && !sim.isPaused) {
            sim.pause();
          } else {
            sim.play();
          }
          break;
        case "KeyN":
          event.preventDefault();
          sim.step();
          break;
        case "KeyB":
          event.preventDefault();
          ui.toggleLeftPanel();
          break;
        case "BracketLeft":
          event.preventDefault();
          ui.toggleLeftPanel();
          break;
        case "BracketRight":
          event.preventDefault();
          ui.toggleRightPanel();
          break;
        case "Backslash":
          event.preventDefault();
          ui.toggleBottomPanel();
          break;
        case "KeyP":
          event.preventDefault();
          ui.togglePerformanceOverlay();
          break;
        case "KeyF":
          event.preventDefault();
          // Matches FullscreenToggle's behavior — surface browser denials
          // (iframe policy, missing user-gesture, etc.) so the "F did
          // nothing" case isn't silent.
          if (document.fullscreenElement) {
            document.exitFullscreen().catch((e) =>
              reportError("Exit fullscreen", e),
            );
          } else {
            document.documentElement
              .requestFullscreen()
              .catch((e) => reportError("Enter fullscreen", e));
          }
          break;
        // W is reserved for driving — weather control via UI only
        case "Slash":
          if (event.shiftKey) {
            event.preventDefault();
            ui.setShowShortcutsDialog(true);
          }
          break;
        case "Escape":
          actors.selectActor(null);
          ui.setShowShortcutsDialog(false);
          // Close a maximized sensor view if any
          if (ui.maximizedSensorId !== null) ui.setMaximizedSensor(null);
          break;
        case "Digit1":
          ui.setCameraMode("follow");
          break;
        case "Digit2":
          ui.setCameraMode("fpv");
          break;
        case "Digit3":
          ui.setCameraMode("orbit");
          break;
        case "Digit4":
          ui.setCameraMode("birdseye");
          break;
        case "Digit5":
          ui.setCameraMode("camera-match");
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
