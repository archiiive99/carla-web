import { Suspense, lazy } from "react";

const WorldScene = lazy(() =>
  import("./WorldScene").then((m) => ({ default: m.WorldScene })),
);

function PaneFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Loading {label}…
    </div>
  );
}

/** Main viewport body. Renders the shared-scene 3D viewport as a DOM rect
 *  tracked by the root <WorldCanvas/>. The old pixel-streaming and
 *  camera-feed modes were removed when the single-source architecture
 *  landed: the browser renders the same world scene that the sensor
 *  camera cells render, from the main viewport's camera. */
export function ViewportBody() {
  return (
    <div className="h-full w-full pt-14">
      <div className="pointer-events-auto h-full overflow-hidden rounded-xl border border-border/60 bg-transparent shadow-sm">
        <Suspense fallback={<PaneFallback label="world scene" />}>
          <WorldScene />
        </Suspense>
      </div>
    </div>
  );
}
