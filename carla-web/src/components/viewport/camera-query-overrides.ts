export type QueryPose = {
  location: { x: number; y: number; z: number };
  rotation: { yaw: number; pitch: number; roll: number };
};

/** Dev-only camera override via URL query params.
 *
 *  - `?camMatch=<actorId>` pins the 3D camera to an actor's live transform.
 *    Used by the Playwright pixel-diff harness so the browser 3D camera can
 *    be locked onto the same actor the UE render is observing from.
 *  - `?camPose=x,y,z,yaw,pitch,roll` (all floats, CARLA frame) hard-pins
 *    the camera to an explicit world pose for deterministic screenshots.
 *
 *  Both return null when absent/malformed so callers can branch cheaply
 *  inside the animation loop. */
export function readQueryCameraOverrides(): {
  camMatchId: number | null;
  camPose: QueryPose | null;
} {
  if (typeof window === "undefined") {
    return { camMatchId: null, camPose: null };
  }
  const params = new URLSearchParams(window.location.search);
  const camMatchRaw = params.get("camMatch");
  const camMatchId = camMatchRaw !== null ? Number.parseInt(camMatchRaw, 10) : null;
  const camPoseRaw = params.get("camPose");
  if (!camPoseRaw) {
    return { camMatchId, camPose: null };
  }
  const parts = camPoseRaw.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 6 || parts.some((part) => !Number.isFinite(part))) {
    return { camMatchId, camPose: null };
  }
  const [x, y, z, yaw, pitch, roll] = parts;
  return {
    camMatchId,
    camPose: {
      location: { x, y, z },
      rotation: { yaw, pitch, roll },
    },
  };
}
