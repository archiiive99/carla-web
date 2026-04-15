import { useRef } from "react";
import { useRegisterViewport } from "./useRegisterViewport";

// Main 3D viewport. The rendering itself happens in the single root
// <WorldCanvas/> mounted at the layout root; this component is purely
// a DOM rect that the compositor tracks. Registering with kind "main"
// tells the compositor to drive its camera via MainCameraController
// (follow / fpv / camera-match / birdseye / orbit modes).
export function WorldScene() {
  const divRef = useRef<HTMLDivElement>(null);
  useRegisterViewport("main", divRef, { type: "main" });
  return (
    <div
      ref={divRef}
      className="pointer-events-auto h-full w-full"
      // Explicit pointer-events-auto so R3F receives clicks on actor meshes
      // (WorldCanvas routes events to this div) AND useMainViewportMouseControls
      // receives mouse rotation/panning/wheel regardless of ancestors' pointer-events.
      // The parent <main> uses pointer-events-none on its own background so
      // overlay chrome above this stays interactive without blocking the
      // rendered scene.
      aria-label="3D viewport"
    />
  );
}
