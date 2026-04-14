
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
      const now = performance.now();
      const elapsed = (now - lastTimeRef.current) / 1000;
      if (elapsed > 0) {
        const fps = frameCountRef.current / elapsed;
        updatePerf({ fps: Math.round(fps) });
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
    }, PERF_MONITOR_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [updatePerf]);
}
