import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import { useLidarSensorData } from "@/hooks/useSensorData";
import { MAX_LIDAR_POINTS } from "@/constants";

interface PointCloudProps {
  sensorId: number;
  pointCountRef: React.RefObject<HTMLSpanElement | null>;
}

function PointCloud({ sensorId, pointCountRef }: PointCloudProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const { positionsRef, colorsRef, pointCountRef: countRef } = useLidarSensorData(sensorId);

  // Pre-allocate once
  const [positionAttr] = useState(
    () => new THREE.Float32BufferAttribute(new Float32Array(MAX_LIDAR_POINTS * 3), 3),
  );
  const [colorAttr] = useState(
    () => new THREE.Float32BufferAttribute(new Float32Array(MAX_LIDAR_POINTS * 3), 3),
  );

  useFrame(() => {
    const geo = geometryRef.current;
    const positions = positionsRef.current;
    const colors = colorsRef.current;
    const count = countRef.current;

    if (!geo) return;

    // Set attributes on first frame
    if (!geo.getAttribute("position")) {
      geo.setAttribute("position", positionAttr);
      geo.setAttribute("color", colorAttr);
    }

    if (!positions || !colors || count === 0) {
      geo.setDrawRange(0, 0);
      return;
    }

    // Copy worker data into geometry attributes
    (positionAttr.array as Float32Array).set(positions.subarray(0, Math.min(count * 3, MAX_LIDAR_POINTS * 3)));
    positionAttr.needsUpdate = true;

    (colorAttr.array as Float32Array).set(colors.subarray(0, Math.min(count * 3, MAX_LIDAR_POINTS * 3)));
    colorAttr.needsUpdate = true;

    geo.setDrawRange(0, Math.min(count, MAX_LIDAR_POINTS));

    // Update overlay
    if (pointCountRef.current) {
      pointCountRef.current.textContent = `${count.toLocaleString()} pts`;
    }
  });

  return (
    <points>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial size={0.05} vertexColors sizeAttenuation transparent opacity={0.8} />
    </points>
  );
}

function GridFloor() {
  return <gridHelper args={[100, 100, 0x333333, 0x222222]} />;
}

export default function LidarScene({ sensorId, pointCountRef }: PointCloudProps) {
  return (
    <Canvas
      camera={{ position: [20, 20, 20], fov: 60, near: 0.1, far: 1000 }}
      className="bg-background"
      gl={{ antialias: false, alpha: false }}
    >
      <ambientLight intensity={0.3} />
      <PointCloud sensorId={sensorId} pointCountRef={pointCountRef} />
      <GridFloor />
      <OrbitControls enableDamping dampingFactor={0.1} rotateSpeed={0.5} zoomSpeed={1.2} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport />
      </GizmoHelper>
    </Canvas>
  );
}
