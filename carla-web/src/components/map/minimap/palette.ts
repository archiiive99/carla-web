import { readCssVar } from "@/lib/theme-colors";

// Canvas fill/stroke values mirror the --chart-N / --success / --warning /
// --destructive / --foreground tokens so canvas dots stay in lockstep with
// the DOM legend below. Resolved per-frame via readCssVar so light/dark
// mode toggles propagate — Canvas2D can't consume `var(...)` directly.
export function readMapColors() {
  return {
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
}

export type MapPalette = ReturnType<typeof readMapColors>;
