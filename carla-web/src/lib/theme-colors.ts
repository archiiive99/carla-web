// Shared CSS custom-property readers for sensor canvases that need raw color
// strings (Canvas 2D, Three.js, etc. don't resolve `var(...)`). Before this
// helper, 4 sensor views each redeclared their own identical / near-identical
// themeColors() function — see the migration comment in each consumer.

const FALLBACK_BACKGROUND = "oklch(0.141 0.005 285.823)";
const FALLBACK_BORDER = "oklch(0.274 0.006 286.033)";
const FALLBACK_MUTED_FG = "oklch(0.705 0.015 286.067)";

// `readCssVar` used to run `getComputedStyle(document.documentElement)` on
// every call, which forces a style/layout recalc (~50-200µs). Canvas draw
// loops (MiniMap's 60Hz rAF, RadarView/GnssView's per-frame accent read)
// called it up to 13× per frame — a measurable fraction of a frame budget
// spent on colors that only change when the user toggles the theme.
//
// Cache per (theme class, var name). uiStore.setTheme is the only path
// that flips `document.documentElement.classList`, so the classList check
// at call time is a reliable invalidator: a theme toggle clears every
// entry on the next read. Fallback strings must be stable per var name —
// a changing fallback for the same CSS var on different calls isn't
// supported (all current callers pass a literal string, so this isn't a
// practical concern).
const _cssVarCache = new Map<string, string>();
let _cssVarCacheKey: string | null = null;

function currentThemeKey(): string {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const key = currentThemeKey();
  if (_cssVarCacheKey !== key) {
    _cssVarCache.clear();
    _cssVarCacheKey = key;
  }
  const cached = _cssVarCache.get(name);
  if (cached !== undefined) return cached;
  const resolved =
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback;
  _cssVarCache.set(name, resolved);
  return resolved;
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
