export interface EnvTransformLike {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface EnvBoundsLike {
  x: number;
  y: number;
  z: number;
  ex: number;
  ey: number;
  ez: number;
  yaw: number;
}

export interface VegetationEnvObjectLike {
  t: EnvTransformLike;
  b: EnvBoundsLike;
}

export interface VegetationModelBounds {
  minY: number;
  height: number;
  radius: number;
}

export interface VegetationPlacement {
  position: { x: number; y: number; z: number };
  rotationY: number;
  scale: { x: number; y: number; z: number };
}

export function carlaToThreePoint(x: number, y: number, z: number) {
  return { x, y: z, z: -y };
}

export function carlaYawToThreeRadians(yaw: number) {
  return (-yaw * Math.PI) / 180;
}

export function computeVegetationPlacement(
  object: VegetationEnvObjectLike,
  modelBounds: VegetationModelBounds,
  yawJitter = 0,
): VegetationPlacement {
  const ground = carlaToThreePoint(
    object.t.x,
    object.t.y,
    object.t.z,
  );
  const targetHeight = Math.max(object.b.ez * 2, 2);
  const targetRadius = Math.max(Math.max(object.b.ex, object.b.ey) * 2, 1);
  const scaleY = targetHeight / Math.max(modelBounds.height, 1e-6);
  const scaleXZ = targetRadius / Math.max(modelBounds.radius, 1e-6);

  return {
    position: {
      x: ground.x,
      y: ground.y - modelBounds.minY * scaleY,
      z: ground.z,
    },
    rotationY: carlaYawToThreeRadians(object.t.yaw) + yawJitter,
    scale: {
      x: scaleXZ,
      y: scaleY,
      z: scaleXZ,
    },
  };
}
