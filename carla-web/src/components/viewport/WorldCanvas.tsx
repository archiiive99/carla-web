import React, { Suspense, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useViewportStore, type ViewportEntry } from "@/stores/viewportStore";
import { ActorRenderer } from "./ActorRenderer";
import { RoadNetwork } from "./RoadNetwork";
import { CityEnvironment } from "./CityEnvironment";
import { EgoHeadlights } from "./EgoHeadlights";
import {
  GroundPlane,
  WeatherFog,
  WeatherLighting,
} from "./scene-environment";
import { MainCameraController } from "./controllers/MainCameraController";
import { SensorPresetController } from "./controllers/SensorPresetController";
import { SensorExtrinsicController } from "./controllers/SensorExtrinsicController";

// Scene error boundary — glTF / mesh failures shouldn't take down the whole
// scene. Kept identical to the pre-migration behavior.
class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[SceneErrorBoundary]", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// Per-registered-viewport controller. Reads the entry's `kind` and mounts
// the appropriate camera driver so the entry's camera tracks its data
// source (user input for the main viewport, ego-relative preset for 3D
// camera cells, CARLA sensor transform for user-spawned RGB sensors).
function ViewportControllers() {
  const viewports = useViewportStore((s) => s.viewports);
  const entries = useMemo(
    () => Array.from(viewports.values()),
    [viewports],
  );
  return (
    <>
      {entries.map((entry) => {
        if (entry.kind.type === "main") {
          return <MainCameraController key={entry.id} camera={entry.camera} />;
        }
        if (entry.kind.type === "sensor-preset") {
          return (
            <SensorPresetController
              key={entry.id}
              camera={entry.camera}
              preset={entry.kind.preset}
            />
          );
        }
        if (entry.kind.type === "sensor-extrinsic") {
          return (
            <SensorExtrinsicController
              key={entry.id}
              camera={entry.camera}
              sensorId={entry.kind.sensorId}
            />
          );
        }
        return null;
      })}
    </>
  );
}

// Compositor: renders the shared scene into every registered viewport's
// DOM rect using gl.setViewport + gl.setScissor. priority=1 disables R3F's
// default render loop — we own the render per frame so rect/scissor state
// stays consistent. Rects are queried per frame via getBoundingClientRect
// so panel resize / layout shifts don't require re-registration.
function SceneCompositor() {
  const viewports = useViewportStore((s) => s.viewports);
  const { gl, scene, size } = useThree();
  const setEvents = useThree((s) => s.setEvents);

  useEffect(() => {
    // Route R3F pointer events to the main viewport div so actor clicks in
    // the main 3D area work. Sensor cells and panels live above the canvas
    // via DOM z-order and handle their own events.
    const mainEntry = viewports.get("main");
    const target = mainEntry?.divRef.current;
    if (target) {
      setEvents({ connected: target });
    }
    return () => setEvents({ connected: gl.domElement });
  }, [gl, viewports, setEvents]);

  useFrame(() => {
    const canvasEl = gl.domElement;
    const canvasRect = canvasEl.getBoundingClientRect();
    const dpr = gl.getPixelRatio();

    gl.autoClear = false;
    gl.setScissorTest(true);
    gl.setViewport(0, 0, size.width * dpr, size.height * dpr);
    gl.setScissor(0, 0, size.width * dpr, size.height * dpr);
    gl.clear(true, true, true);

    for (const entry of viewports.values()) {
      const el = entry.divRef.current;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w < 4 || h < 4) continue;

      const x = Math.floor(rect.left - canvasRect.left);
      // WebGL origin is bottom-left; DOM origin is top-left.
      const y = Math.floor(canvasRect.height - (rect.top - canvasRect.top) - rect.height);

      const vpX = x * dpr;
      const vpY = y * dpr;
      const vpW = w * dpr;
      const vpH = h * dpr;

      entry.camera.aspect = w / h;
      entry.camera.updateProjectionMatrix();

      gl.setViewport(vpX, vpY, vpW, vpH);
      gl.setScissor(vpX, vpY, vpW, vpH);
      gl.render(scene, entry.camera);
    }

    gl.setScissorTest(false);
  }, 1);

  return null;
}

interface WorldCanvasProps {
  showApproxEnvironment: boolean;
}

/** Single root Canvas. Mounted once at the app layout level; covers the
 *  whole viewport as a fixed-position layer. The DOM-level layout (panels,
 *  toolbars, sensor cells) sits above it via z-order. Events in the main
 *  viewport rect are routed to actor meshes via R3F; everywhere else DOM
 *  elements capture their own events.
 *
 *  Shadow camera tracks the ego vehicle (WeatherLighting useFrame) with
 *  ±350m bounds so sensor-cell cameras viewing the ego from long baselines
 *  still receive correct shadows. */
export function WorldCanvas({ showApproxEnvironment }: WorldCanvasProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    >
      <Canvas
        data-screenshot-target=""
        // Default camera is a placeholder — the compositor overrides it
        // per-viewport. A valid default still matters for R3F's internal
        // state / any stray <OrbitControls makeDefault>.
        camera={{ position: [0, 30, -30], fov: 60, near: 0.1, far: 5000 }}
        shadows="soft"
        style={{ pointerEvents: "auto" }}
        gl={{
          antialias: true,
          alpha: false,
          // Let the render-parity harness read pixels out of the WebGL
          // buffer via canvas.toDataURL. Tiny cost in normal runtime
          // (no blit elision) but removes the need for a separate
          // capture path. Harmless for users.
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.82,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <WeatherLighting />
        <WeatherFog />
        <GroundPlane />
        {showApproxEnvironment && (
          <SceneErrorBoundary>
            <Suspense fallback={null}>
              <CityEnvironment />
            </Suspense>
          </SceneErrorBoundary>
        )}
        <SceneErrorBoundary>
          <Suspense fallback={null}>
            <RoadNetwork />
          </Suspense>
        </SceneErrorBoundary>
        <SceneErrorBoundary>
          <Suspense fallback={null}>
            <ActorRenderer />
          </Suspense>
        </SceneErrorBoundary>
        <SceneErrorBoundary>
          <EgoHeadlights />
        </SceneErrorBoundary>

        <ViewportControllers />
        <SceneCompositor />
      </Canvas>
    </div>
  );
}

// Re-export the entry type so consumers can type props that take a raw
// viewport entry (e.g. debug tooling). Unused at runtime.
export type { ViewportEntry };
