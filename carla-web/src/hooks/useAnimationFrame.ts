import { useEffect, useRef } from "react";

export function useAnimationFrame(callback: (deltaTime: number) => void, enabled = true) {
  const callbackRef = useRef(callback);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    // Reset so the first frame after a disable→enable flip emits delta=0,
    // not the multi-second gap since the previous rAF was torn down.
    // Physics/anim consumers would otherwise see a velocity spike on
    // every re-enable.
    lastTimeRef.current = 0;
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
