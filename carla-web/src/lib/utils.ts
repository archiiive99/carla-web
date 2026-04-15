import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize a CARLA map path/name for display.
 *
 *   "/Game/Carla/Maps/Town01_Opt"  → "Town01"
 *   "Town10HD_Opt"                  → "Town10HD"
 *   ""                              → ""
 */
export function formatMapName(raw: string | null | undefined): string {
  if (!raw) return ""
  const base = raw.split("/").pop() ?? raw
  return base.replace(/_Opt$/, "")
}

/**
 * Extract a user-facing message from a caught value. Internal helper for
 * reportError — callers should use reportError for toast parity instead
 * of rolling their own toast.error template.
 */
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error"
}

/**
 * Show a "<Action> failed: <message>" error toast — the 23× dashboard
 * pattern. Central place to change toast style, hook in logging, or add
 * a "Retry" action without touching every catch handler.
 */
export function reportError(action: string, e: unknown): void {
  toast.error(`${action} failed: ${errorMessage(e)}`)
}

/**
 * Run `callback` whenever the tab transitions to visible. Returns an
 * unsubscribe fn so callers can wire this into their existing useEffect
 * cleanup. Used by polls/retries that want to re-sync on tab focus.
 */
export function subscribeVisible(callback: () => void): () => void {
  const handler = () => {
    if (document.visibilityState === "visible") callback()
  }
  document.addEventListener("visibilitychange", handler)
  return () => document.removeEventListener("visibilitychange", handler)
}
