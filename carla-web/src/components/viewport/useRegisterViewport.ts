import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";
import { useViewportStore, type ViewportKind } from "@/stores/viewportStore";

// Register a DOM rect as a viewport into the shared world scene. The camera
// is created once per mount; the `kind` can change (e.g. preset swap) and
// will be propagated to the entry without rebuilding the camera so the
// compositor sees continuous frames during the transition.
export function useRegisterViewport(
  id: string,
  divRef: RefObject<HTMLDivElement | null>,
  kind: ViewportKind,
  initialFov: number = 60,
) {
  const camera = useMemo(
    () => new THREE.PerspectiveCamera(initialFov, 1, 0.1, 5000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const register = useViewportStore((s) => s.register);
  const unregister = useViewportStore((s) => s.unregister);
  const updateKind = useViewportStore((s) => s.updateKind);

  useEffect(() => {
    register({ id, divRef, camera, kind });
    return () => unregister(id);
    // Intentionally only on id/camera: subsequent kind changes go through
    // updateKind below so we don't thrash the entry identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, camera, register, unregister]);

  useEffect(() => {
    updateKind(id, kind);
  }, [id, kind, updateKind]);
}
