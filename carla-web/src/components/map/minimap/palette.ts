import { readCssVar } from "@/lib/theme-colors";

// Canvas fill/stroke values mirror the --chart-N / --success / --warning /
// --destructive / --foreground tokens so canvas dots stay in lockstep with
// the DOM legend below. MiniMap's draw function runs at 60Hz via
// useAnimationFrame, so caching the 13 getComputedStyle reads keyed on
// the current theme class keeps the draw loop off the layout thrash path.
// Theme toggle (uiStore.setTheme) flips document.documentElement.classList;
// any other live mutation to these CSS vars is out of scope.
export type MapPalette = {
  bg: string;
  grid: string;
  road: string;
  mutedFg: string;
  vehicle: string;
  vehicleNpc: string;
  vehicleAutopilot: string;
  walker: string;
  sensor: string;
  trafficRed: string;
  trafficYellow: string;
  trafficGreen: string;
  selected: string;
  overlayFg: string;
};

let _cachedKey: string | null = null;
let _cached: MapPalette | null = null;

function currentThemeKey(): string {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function readMapColors(): MapPalette {
  const key = currentThemeKey();
  if (_cached !== null && _cachedKey === key) return _cached;
  _cachedKey = key;
  _cached = {
    bg: readCssVar("--background", "oklch(0.141 0.005 285.823)"),
    grid: readCssVar("--border", "oklch(0.205 0.005 286)"),
    road: readCssVar("--muted", "oklch(0.274 0.006 286.033)"),
    mutedFg: readCssVar("--muted-foreground", "oklch(0.552 0.016 285.938)"),
    vehicle: readCssVar("--chart-4", "oklch(0.68 0.2 250)"),
    vehicleNpc: readCssVar("--chart-3", "oklch(0.72 0.17 145)"),
    vehicleAutopilot: readCssVar("--chart-7", "oklch(0.74 0.2 20)"),
    walker: readCssVar("--chart-2", "oklch(0.82 0.17 85)"),
    sensor: readCssVar("--chart-6", "oklch(0.75 0.13 200)"),
    trafficRed: readCssVar("--destructive", "oklch(0.704 0.191 22.216)"),
    trafficYellow: readCssVar("--warning", "oklch(0.82 0.17 85)"),
    trafficGreen: readCssVar("--success", "oklch(0.72 0.18 149)"),
    // Selected ring uses Tailwind's amber-500 so it doesn't collide with any
    // of the --chart-N palette that actors are drawn in.
    selected: "oklch(0.78 0.16 70)",
    overlayFg: readCssVar("--overlay-fg", "oklch(1 0 0)"),
  };
  return _cached;
}
