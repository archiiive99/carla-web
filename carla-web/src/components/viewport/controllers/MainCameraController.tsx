import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useActorStore } from "@/stores/actorStore";
import { useUIStore } from "@/stores/uiStore";
import { carlaApi } from "@/lib/carla-api";
import { BRIDGE_EGO_ROLE } from "@/constants";
import {
  carlaToThreeVec as carlaToThree,
  followPose,
  fpvPose,
  cameraMatchPose,
  birdseyePose,
} from "../camera-poses";
import {
  readQueryCameraOverrides,
  type QueryPose,
} from "../camera-query-overrides";
import { useMainViewportMouseControls } from "./useMainViewportMouseControls";

// Drives the main viewport's camera. Previously this was `CameraController`
// operating on R3F's implicit default camera; now it mutates an explicit
// PerspectiveCamera created by `useRegisterViewport("main", ...)` and
// handed in by the compositor. The shared world scene is rendered from
// this camera whenever the main viewport rect is visible.

interface MainCameraControllerProps {
  camera: THREE.PerspectiveCamera;
}

export function MainCameraController({ camera }: MainCameraControllerProps) {
  const mode = useUIStore((s) => s.cameraMode);
  const actors = useActorStore((s) => s.actors);
  const egoVehicleId = useActorStore((s) => s.egoVehicleId);
  const { size } = useThree();
  const managedCameraFovRef = useRef(100);
  const managedCameraAspectRef = useRef(16 / 9);
  const managedCameraPoseRef = useRef<QueryPose | null>(null);

  useEffect(() => {
    const expectedFov = mode === "camera-match" ? managedCameraFovRef.current : 60;
    const expectedAspect =
      mode === "camera-match"
        ? managedCameraAspectRef.current
        : size.width / Math.max(size.height, 1);
    let dirty = false;
    if (camera.fov !== expectedFov) {
      camera.fov = expectedFov;
      dirty = true;
    }
    if (Math.abs(camera.aspect - expectedAspect) > 1e-3) {
      camera.aspect = expectedAspect;
      dirty = true;
    }
    if (dirty) camera.updateProjectionMatrix();
  }, [camera, mode, size.height, size.width]);

  useEffect(() => {
    if (mode !== "camera-match") return;
    let cancelled = false;

    async function resolveManagedCameraFov() {
      try {
        const session = await carlaApi.getRealtimeSession();
        if (cancelled || !session.default_camera_id) return;
        const config = await carlaApi.getSensorConfig(session.default_camera_id);
        const actor = await carlaApi.getActor(session.default_camera_id);
        if (cancelled) return;
        const parsed = Number.parseFloat(String(config.attributes.fov ?? ""));
        const width = Number.parseFloat(String(config.attributes.image_size_x ?? ""));
        const height = Number.parseFloat(String(config.attributes.image_size_y ?? ""));
        if (Number.isFinite(parsed) && parsed > 0) {
          managedCameraFovRef.current = parsed;
        }
        if (
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0
        ) {
          managedCameraAspectRef.current = width / height;
        }
        managedCameraPoseRef.current = actor.transform;
        if (mode === "camera-match") {
          camera.fov = managedCameraFovRef.current;
          camera.aspect = managedCameraAspectRef.current;
          camera.updateProjectionMatrix();
        }
      } catch {
        // Keep the fallback FOV silently — this path is optional.
      }
    }

    resolveManagedCameraFov();
    return () => {
      cancelled = true;
    };
  }, [camera, mode]);

  const azimuth = useRef(Math.PI);
  const elevation = useRef(0.6);
  const distance = useRef(40);
  const isDragging = useRef(false);
  const panX = useRef(0);
  const panY = useRef(0);
  const smoothPos = useRef(new THREE.Vector3());
  const smoothLook = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  const getTargetActor = useCallback(() => {
    if (egoVehicleId !== null) {
      const a = actors.get(egoVehicleId);
      if (a) return a;
    }
    const list = Array.from(actors.values());
    return (
      list.find((a) => a.type === "vehicle" && a.role_name === BRIDGE_EGO_ROLE) ??
      list.find((a) => a.type === "vehicle") ??
      null
    );
  }, [actors, egoVehicleId]);

  useMainViewportMouseControls({
    mode,
    azimuth,
    elevation,
    distance,
    panX,
    panY,
    isDragging,
  });

  useEffect(() => {
    panX.current = 0;
    panY.current = 0;
    if (mode === "follow") {
      elevation.current = 0.35;
      distance.current = 40;
    } else if (mode === "fpv") {
      elevation.current = 0.0;
      distance.current = 0;
    } else if (mode === "camera-match") {
      elevation.current = -0.174533;
      distance.current = 0;
    } else if (mode === "birdseye") {
      distance.current = 80;
    }
    initialized.current = false;
  }, [mode]);

  useFrame(() => {
    // URL overrides win regardless of cameraMode. The render-parity
    // harness relies on `?camPose=...` pinning the camera deterministically,
    // and a persisted "orbit" mode must not silently ignore it.
    const { camMatchId, camPose } = readQueryCameraOverrides();

    if (mode === "orbit" && camMatchId === null && camPose === null) return;

    if (camMatchId !== null) {
      const a = actors.get(camMatchId);
      (window as unknown as { __camMatchDebug?: unknown }).__camMatchDebug = {
        wanted: camMatchId,
        found: !!a,
        actorsSize: actors.size,
        transform: a?.transform,
      };
      if (a) {
        const loc = a.transform.location;
        const pitchR = (a.transform.rotation.pitch * Math.PI) / 180;
        const yawR = (a.transform.rotation.yaw * Math.PI) / 180;
        const aheadCarla = {
          x: loc.x + Math.cos(pitchR) * Math.cos(yawR),
          y: loc.y + Math.cos(pitchR) * Math.sin(yawR),
          z: loc.z + Math.sin(pitchR),
        };
        camera.position.copy(carlaToThree(loc));
        camera.lookAt(carlaToThree(aheadCarla));
      }
      return;
    }

    if (camPose !== null) {
      const loc = camPose.location;
      const pitchR = (camPose.rotation.pitch * Math.PI) / 180;
      const yawR = (camPose.rotation.yaw * Math.PI) / 180;
      const aheadCarla = {
        x: loc.x + Math.cos(pitchR) * Math.cos(yawR),
        y: loc.y + Math.cos(pitchR) * Math.sin(yawR),
        z: loc.z + Math.sin(pitchR),
      };
      (window as unknown as { __camPoseDebug?: unknown }).__camPoseDebug = {
        applied: true,
        pose: camPose,
      };
      camera.position.copy(carlaToThree(loc));
      camera.lookAt(carlaToThree(aheadCarla));
      return;
    }

    const targetActor = getTargetActor();
    if (!targetActor) return;

    const egoPos = carlaToThree(targetActor.transform.location);
    const yaw = (-targetActor.transform.rotation.yaw * Math.PI) / 180;

    let pose;
    if (mode === "follow") {
      pose = followPose({
        egoPos,
        vehicleYaw: yaw,
        distance: distance.current,
        elevation: elevation.current,
        azimuth: azimuth.current,
        panX: panX.current,
        panY: panY.current,
      });
    } else if (mode === "fpv") {
      pose = fpvPose({
        egoPos,
        vehicleYaw: yaw,
        azimuth: azimuth.current,
        elevation: elevation.current,
      });
    } else if (mode === "camera-match") {
      pose = cameraMatchPose({
        targetActor,
        managedCameraPose: managedCameraPoseRef.current,
      });
    } else if (mode === "birdseye") {
      pose = birdseyePose({
        egoPos,
        distance: distance.current,
        panX: panX.current,
        panY: panY.current,
      });
    } else {
      return;
    }
    const targetPos = pose.position;
    const targetLook = pose.look;

    if (!initialized.current) {
      camera.position.copy(targetPos);
      camera.lookAt(targetLook);
      smoothPos.current.copy(targetPos);
      smoothLook.current.copy(targetLook);
      initialized.current = true;
    } else {
      camera.position.lerp(targetPos, 0.5);
      camera.lookAt(targetLook);
    }
  });

  // Note: `orbit` mode previously bound to <OrbitControls makeDefault />.
  // OrbitControls needs to know *which* camera to drive; with the compositor
  // owning a per-viewport camera, hook it up via a ref rather than makeDefault
  // (which would clobber the compositor's default camera). Orbit is a free-
  // inspector mode and pointer-input-driven; keep it behind a short hook.
  return null;
}
