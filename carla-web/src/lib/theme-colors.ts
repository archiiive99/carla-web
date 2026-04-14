// Shared CSS custom-property readers for sensor canvases that need raw color
// strings (Canvas 2D, Three.js, etc. don't resolve `var(...)`). Before this
// helper, 4 sensor views each redeclared their own identical / near-identical
// themeColors() function — see the migration comment in each consumer.

const FALLBACK_BACKGROUND = "oklch(0.141 0.005 285.823)";
const FALLBACK_BORDER = "oklch(0.274 0.006 286.033)";
const FALLBACK_MUTED_FG = "oklch(0.705 0.015 286.067)";

export function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

/** Common subset used by sensor canvas viewers (background / border / muted fg).
 *  Callers that need a domain-specific accent (radar green, junction amber,
 *  etc.) can read it alongside via `readCssVar`. Don't hard-code `oklch(...)`
 *  literals — they diverge across light/dark mode (index.css redefines every
 *  --chart-N, --destructive, etc. at `.light`). */
export function themeColors() {
  return {
    background: readCssVar("--background", FALLBACK_BACKGROUND),
    border: readCssVar("--border", FALLBACK_BORDER),
    mutedFg: readCssVar("--muted-foreground", FALLBACK_MUTED_FG),
  };
}
