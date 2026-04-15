
import { useEffect, useRef } from "react";
import { usePerformanceStore } from "@/stores/performanceStore";
import { PERF_MONITOR_INTERVAL_MS } from "@/constants";

export function usePerformanceMonitor() {
  const updatePerf = usePerformanceStore((s) => s.update);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    lastTimeRef.current = performance.now();

    function tick() {
      frameCountRef.current++;
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    const interval = setInterval(() => {
      // Browsers pause rAF while the tab is hidden, so frameCountRef
      // stays at 0 and we'd report fps=0 the whole time the user is
      // away — then flash 0 on return until the next interval reading.
      // Skip the update while hidden; on visibility-restore we reset
      // the counter window so the first post-return reading isn't a
      // fake low value.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const now = performance.now();
      const elapsed = (now - lastTimeRef.current) / 1000;
      if (elapsed > 0) {
        const fps = frameCountRef.current / elapsed;
        updatePerf({ fps: Math.round(fps) });
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
    }, PERF_MONITOR_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Reset the accumulation window so the first reading after
        // return-to-tab is based on post-visible frames only.
        frameCountRef.current = 0;
        lastTimeRef.current = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [updatePerf]);
}
