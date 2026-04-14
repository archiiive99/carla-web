import { useEffect, type RefObject } from "react";
import { useViewportStore } from "@/stores/viewportStore";
import type { CameraMode } from "@/stores/uiStore";

interface Inputs {
  mode: CameraMode;
  azimuth: RefObject<number>;
  elevation: RefObject<number>;
  distance: RefObject<number>;
  panX: RefObject<number>;
  panY: RefObject<number>;
  isDragging: RefObject<boolean>;
}

/** Pointer / wheel input for the main viewport's camera. Attaches listeners
 *  to the main viewport's registered DOM div rather than the canvas — the
 *  canvas is a fullscreen overlay and sensor cells live above it; limiting
 *  input to the main rect prevents sensor-cell clicks from rotating the
 *  main camera.
 *
 *  Orbit mode is treated as a free-look follow variant for now — same
 *  controls, no OrbitControls-style pan of the look target. A dedicated
 *  free-cam orbit implementation is a separate iteration. */
export function useMainViewportMouseControls({
  mode,
  azimuth,
  elevation,
  distance,
  panX,
  panY,
  isDragging,
}: Inputs) {
  useEffect(() => {
    const entry = useViewportStore.getState().viewports.get("main");
    const target = entry?.divRef.current;
    if (!target) return;

    let rightDown = false;

    function onMouseDown(e: MouseEvent) {
      if (e.button === 0) isDragging.current = true;
      if (e.button === 2) rightDown = true;
    }

    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) isDragging.current = false;
      if (e.button === 2) rightDown = false;
    }

    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (rightDown) {
        panX.current -= e.movementX * 0.15;
        panY.current += e.movementY * 0.15;
        return;
      }

      if (mode === "follow" && !isDragging.current) return;
      if (mode !== "follow" && mode !== "fpv" && mode !== "orbit") return;
      azimuth.current -= e.movementX * 0.004;
      elevation.current = Math.max(
        0.05,
        Math.min(1.4, elevation.current + e.movementY * 0.004),
      );
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const zoomFactor = Math.pow(1.003, e.deltaY);
      if (mode === "follow" || mode === "fpv" || mode === "orbit") {
        distance.current = Math.max(3, Math.min(120, distance.current * zoomFactor));
      } else if (mode === "birdseye") {
        distance.current = Math.max(15, Math.min(400, distance.current * zoomFactor));
      }
    }

    target.addEventListener("mousedown", onMouseDown);
    target.addEventListener("mouseup", onMouseUp);
    target.addEventListener("mousemove", onMouseMove);
    target.addEventListener("contextmenu", onContextMenu);
    target.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      target.removeEventListener("mousedown", onMouseDown);
      target.removeEventListener("mouseup", onMouseUp);
      target.removeEventListener("mousemove", onMouseMove);
      target.removeEventListener("contextmenu", onContextMenu);
      target.removeEventListener("wheel", onWheel);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [mode, azimuth, elevation, distance, panX, panY, isDragging]);
}
