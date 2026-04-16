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

/** Cached `themeColors()` keyed on the current theme class. RadarView,
 *  GnssView, and OpenDriveViewer each invoke this per-frame from their draw
 *  loops — without caching, every frame paid 3 × `getComputedStyle` on
 *  document.documentElement, which forces a layout/style recalc. Theme
 *  toggle invalidates the cache via the classList check (setTheme in
 *  uiStore toggles `.dark`, no other path mutates those CSS vars live).
 *  Keep the dependency implicit so this stays a drop-in replacement for
 *  the old function. */
let _cachedThemeKey: string | null = null;
let _cachedThemeColors: {
  background: string;
  border: string;
  mutedFg: string;
} | null = null;

function currentThemeKey(): string {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Common subset used by sensor canvas viewers (background / border / muted fg).
 *  Callers that need a domain-specific accent (radar green, junction amber,
 *  etc.) can read it alongside via `readCssVar`. Don't hard-code `oklch(...)`
 *  literals — they diverge across light/dark mode (index.css redefines every
 *  --chart-N, --destructive, etc. at `.light`). */
export function themeColors() {
  const key = currentThemeKey();
  if (_cachedThemeColors !== null && _cachedThemeKey === key) {
    return _cachedThemeColors;
  }
  _cachedThemeKey = key;
  _cachedThemeColors = {
    background: readCssVar("--background", FALLBACK_BACKGROUND),
    border: readCssVar("--border", FALLBACK_BORDER),
    mutedFg: readCssVar("--muted-foreground", FALLBACK_MUTED_FG),
  };
  return _cachedThemeColors;
}
