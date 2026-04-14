import * as THREE from "three";
import type { CarlaActor } from "@/types/carla";

export interface CameraPose {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

export interface FollowPoseInputs {
  egoPos: THREE.Vector3;
  vehicleYaw: number;
  distance: number;
  elevation: number;
  azimuth: number;
  panX: number;
  panY: number;
}

export interface FpvPoseInputs {
  egoPos: THREE.Vector3;
  vehicleYaw: number;
  azimuth: number;
  elevation: number;
}

export interface CameraMatchPoseInputs {
  targetActor: CarlaActor;
  managedCameraPose:
    | {
        location: { x: number; y: number; z: number };
        rotation: { pitch: number; yaw: number; roll: number };
      }
    | null;
}

export interface BirdseyePoseInputs {
  egoPos: THREE.Vector3;
  distance: number;
  panX: number;
  panY: number;
}

export function carlaToThreeVec(loc: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(loc.x, loc.z, -loc.y);
}

/** GTA-style third person: camera orbits around the vehicle. azimuth is
 *  RELATIVE to vehicle heading (0 = behind vehicle). Supports right-click
 *  screen-space pan via panX/panY. */
export function followPose({
  egoPos,
  vehicleYaw,
  distance,
  elevation,
  azimuth,
  panX,
  panY,
}: FollowPoseInputs): CameraPose {
  const totalAz = vehicleYaw + azimuth + Math.PI; // +PI = behind vehicle
  const offsetX = distance * Math.cos(elevation) * Math.sin(totalAz);
  const offsetY = distance * Math.sin(elevation);
  const offsetZ = distance * Math.cos(elevation) * Math.cos(totalAz);

  const position = egoPos.clone().add(new THREE.Vector3(offsetX, offsetY + 2, offsetZ));
  const look = egoPos.clone().add(new THREE.Vector3(0, 1.5, 0));

  // Shift both camera and look target along screen-space axes so ego moves
  // off-center (true panning rather than just tilting the look target).
  const viewDir = new THREE.Vector3().subVectors(look, position).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const rightVec = new THREE.Vector3().crossVectors(viewDir, worldUp).normalize();
  const upVec = new THREE.Vector3().crossVectors(rightVec, viewDir).normalize();
  const panOffset = new THREE.Vector3()
    .addScaledVector(rightVec, panX)
    .addScaledVector(upVec, panY);
  position.add(panOffset);
  look.add(panOffset);

  return { position, look };
}

/** First-person view: at driver eye position, looks in the mouse direction. */
export function fpvPose({ egoPos, vehicleYaw, azimuth, elevation }: FpvPoseInputs): CameraPose {
  const eyeOffset = new THREE.Vector3(0.3, 1.7, 0).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    vehicleYaw,
  );
  const position = egoPos.clone().add(eyeOffset);

  const lookDist = 20;
  const lookX = lookDist * Math.cos(elevation) * Math.sin(azimuth);
  const lookY = lookDist * Math.sin(elevation) + 1.7;
  const lookZ = lookDist * Math.cos(elevation) * Math.cos(azimuth);
  const look = egoPos.clone().add(new THREE.Vector3(lookX, lookY, lookZ));

  return { position, look };
}

/** Matches the managed bridge RGB camera pose as closely as the browser
 *  approximation can. Prefers the live managed sensor transform; falls
 *  back to a known bridge default if the bridge actor lookup fails. */
export function cameraMatchPose({ targetActor, managedCameraPose }: CameraMatchPoseInputs): CameraPose {
  const fallbackEgoLoc = targetActor.transform.location;
  const fallbackYaw = (targetActor.transform.rotation.yaw * Math.PI) / 180;
  const camLocCarla = managedCameraPose?.location ?? {
    x: fallbackEgoLoc.x + -6 * Math.cos(fallbackYaw),
    y: fallbackEgoLoc.y + -6 * Math.sin(fallbackYaw),
    z: fallbackEgoLoc.z + 2.8,
  };
  const yawCarla =
    ((managedCameraPose?.rotation.yaw ?? targetActor.transform.rotation.yaw) *
      Math.PI) /
    180;
  const pitchCarla =
    ((managedCameraPose?.rotation.pitch ?? -10) * Math.PI) / 180;
  const aheadCarla = {
    x: camLocCarla.x + Math.cos(pitchCarla) * Math.cos(yawCarla) * 20,
    y: camLocCarla.y + Math.cos(pitchCarla) * Math.sin(yawCarla) * 20,
    z: camLocCarla.z + Math.sin(pitchCarla) * 20,
  };
  return {
    position: carlaToThreeVec(camLocCarla),
    look: carlaToThreeVec(aheadCarla),
  };
}

/** Top-down view centered on ego, with scroll-adjustable height. */
export function birdseyePose({ egoPos, distance, panX, panY }: BirdseyePoseInputs): CameraPose {
  const position = new THREE.Vector3(
    egoPos.x + panX,
    egoPos.y + distance,
    egoPos.z + panY,
  );
  const look = new THREE.Vector3(egoPos.x + panX, egoPos.y, egoPos.z + panY);
  return { position, look };
}
