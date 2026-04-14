// 48. Reusable requestAnimationFrame hook
import { useEffect, useRef } from "react";

export function useAnimationFrame(callback: (deltaTime: number) => void, enabled = true) {
  const callbackRef = useRef(callback);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let rafId: number;

    function loop(time: number) {
      const delta = lastTimeRef.current ? time - lastTimeRef.current : 0;
      lastTimeRef.current = time;
      callbackRef.current(delta);
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
