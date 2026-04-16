import { useEffect, useRef } from "react";
import { useWorkers } from "@/contexts/workers";
import {
  EVENT_LOG_MAX_ITEMS,
  GNSS_TRAIL_MAX_POINTS,
  IMU_BUFFER_MAX_SAMPLES,
} from "@/constants";

/**
 * Subscribe to binary `sensor_event` messages from the ws-receiver worker,
 * filtered by channel byte and payload sensor id. Callbacks are ref-wrapped
 * so callers can pass inline arrow functions without re-subscribing on every
 * render.
 *
 * Payload layout assumption: every sensor_event frame starts with a 4-byte
 * little-endian sensor id at offset 0. Callers are responsible for reading
 * their own fields off the provided DataView.
 */
function useSensorEventStream(
  sensorId: number,
  channel: number,
  minPayloadBytes: number,
  onPayload: (v: DataView, payload: ArrayBuffer) => void,
  onReset?: () => void,
) {
  const { wsReceiverWorker } = useWorkers();
  const onPayloadRef = useRef(onPayload);
  const onResetRef = useRef(onReset);
  useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);
  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  useEffect(() => {
    if (!wsReceiverWorker) return;
    onResetRef.current?.();

    const handler = (e: MessageEvent) => {
      if (e.data.type !== "sensor_event" || e.data.channel !== channel) return;
      const payload = e.data.payload as ArrayBuffer;
      if (payload.byteLength < minPayloadBytes) return;
      const v = new DataView(payload);
      if (v.getUint32(0, true) !== sensorId) return;
      onPayloadRef.current(v, payload);
    };

    wsReceiverWorker.addEventListener("message", handler);
    return () => wsReceiverWorker.removeEventListener("message", handler);
  }, [wsReceiverWorker, sensorId, channel, minPayloadBytes]);
}

// --- Camera ---

export function useCameraSensorData(sensorId: number) {
  const { imageDecoderWorker } = useWorkers();
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const fpsRef = useRef(0);
  const latencyRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);

  useEffect(() => {
    if (!imageDecoderWorker) return;
    lastFpsTimeRef.current = performance.now();

    const handler = (e: MessageEvent) => {
      if (e.data.type !== "camera" || e.data.sensorId !== sensorId) return;
      if (bitmapRef.current) bitmapRef.current.close();
      bitmapRef.current = e.data.bitmap;

      // Measure decode + transfer latency (receive-in-worker to delivery-on-main-thread)
      if (e.data.receiveTime) {
        latencyRef.current = Math.round(performance.now() - e.data.receiveTime);
      }

      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current / elapsed) * 1000);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
    };

    imageDecoderWorker.addEventListener("message", handler);
    return () => {
      imageDecoderWorker.removeEventListener("message", handler);
      if (bitmapRef.current) {
        bitmapRef.current.close();
        bitmapRef.current = null;
      }
    };
  }, [imageDecoderWorker, sensorId]);

  return { bitmapRef, fpsRef, latencyRef };
}

// --- LiDAR ---

export function useLidarSensorData(sensorId: number) {
  const { lidarProcessorWorker } = useWorkers();
  const positionsRef = useRef<Float32Array | null>(null);
  const colorsRef = useRef<Float32Array | null>(null);
  const pointCountRef = useRef(0);

  useEffect(() => {
    if (!lidarProcessorWorker) return;
    // Switching sensors: drop the previous cloud so consumers don't render
    // the old sensor's points until the new one delivers data.
    positionsRef.current = null;
    colorsRef.current = null;
    pointCountRef.current = 0;

    const handler = (e: MessageEvent) => {
      if (e.data.type !== "lidar" || e.data.sensorId !== sensorId) return;
      positionsRef.current = e.data.positions;
      colorsRef.current = e.data.colors;
      pointCountRef.current = e.data.pointCount;
    };

    lidarProcessorWorker.addEventListener("message", handler);
    return () => lidarProcessorWorker.removeEventListener("message", handler);
  }, [lidarProcessorWorker, sensorId]);

  return { positionsRef, colorsRef, pointCountRef };
}

// --- IMU ---

interface ImuSample {
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  t: number;
}

export function useImuSensorData(sensorId: number) {
  const accelRef = useRef({ x: 0, y: 0, z: 0 });
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const compassRef = useRef(0);
  const bufferRef = useRef<ImuSample[]>([]);

  useSensorEventStream(
    sensorId,
    0x07,
    44,
    (v) => {
      const ts = v.getFloat64(8, true);
      const accel = {
        x: v.getFloat32(16, true),
        y: v.getFloat32(20, true),
        z: v.getFloat32(24, true),
      };
      const gyro = {
        x: v.getFloat32(28, true),
        y: v.getFloat32(32, true),
        z: v.getFloat32(36, true),
      };
      accelRef.current = accel;
      gyroRef.current = gyro;
      compassRef.current = v.getFloat32(40, true);
      bufferRef.current.push({ accel, gyro, t: ts });
      if (bufferRef.current.length > IMU_BUFFER_MAX_SAMPLES) bufferRef.current.shift();
    },
    () => {
      accelRef.current = { x: 0, y: 0, z: 0 };
      gyroRef.current = { x: 0, y: 0, z: 0 };
      compassRef.current = 0;
      bufferRef.current = [];
    },
  );

  return { accelRef, gyroRef, compassRef, bufferRef };
}

// --- GNSS ---

export function useGnssSensorData(sensorId: number) {
  const latRef = useRef(0);
  const lonRef = useRef(0);
  const altRef = useRef(0);
  const trailRef = useRef<{ lat: number; lon: number }[]>([]);

  useSensorEventStream(
    sensorId,
    0x08,
    40,
    (v) => {
      const lat = v.getFloat64(16, true);
      const lon = v.getFloat64(24, true);
      latRef.current = lat;
      lonRef.current = lon;
      altRef.current = v.getFloat64(32, true);
      trailRef.current.push({ lat, lon });
      if (trailRef.current.length > GNSS_TRAIL_MAX_POINTS) trailRef.current.shift();
    },
    () => {
      latRef.current = 0;
      lonRef.current = 0;
      altRef.current = 0;
      trailRef.current = [];
    },
  );

  return { latRef, lonRef, altRef, trailRef };
}

// --- Radar ---

export interface RadarDetection {
  velocity: number;
  azimuth: number;
  altitude: number;
  depth: number;
}

export function useRadarSensorData(sensorId: number) {
  const detectionsRef = useRef<RadarDetection[]>([]);

  useSensorEventStream(
    sensorId,
    0x06,
    20,
    (v, payload) => {
      const count = v.getUint32(4, true);
      const detections: RadarDetection[] = [];
      let offset = 20; // after header: sid(4)+count(4)+frame(4)+ts(8)
      for (let i = 0; i < count && offset + 16 <= payload.byteLength; i++) {
        detections.push({
          velocity: v.getFloat32(offset, true),
          azimuth: v.getFloat32(offset + 4, true),
          altitude: v.getFloat32(offset + 8, true),
          depth: v.getFloat32(offset + 12, true),
        });
        offset += 16;
      }
      detectionsRef.current = detections;
    },
    () => {
      detectionsRef.current = [];
    },
  );

  return { detectionsRef };
}

// --- Lane Invasion ---

export interface LaneInvasionEventData {
  timestamp: number;
  markingTypes: number[];
}

export function useLaneInvasionData(sensorId: number) {
  const eventsRef = useRef<LaneInvasionEventData[]>([]);

  useSensorEventStream(
    sensorId,
    0x0a,
    20,
    (v, payload) => {
      const ts = v.getFloat64(8, true);
      const count = v.getUint32(16, true);
      const types: number[] = [];
      // Each marking type is a 4-byte uint32 starting at offset 20; the
      // guard must check that ALL FOUR bytes are readable (start + 4 ≤
      // byteLength), not just the start offset. getUint32 throws
      // RangeError on a partial read, which would crash the whole
      // ws-receiver message handler on any truncated lane-invasion frame.
      for (let i = 0; i < count && 20 + (i + 1) * 4 <= payload.byteLength; i++) {
        types.push(v.getUint32(20 + i * 4, true));
      }
      eventsRef.current.push({ timestamp: ts, markingTypes: types });
      if (eventsRef.current.length > EVENT_LOG_MAX_ITEMS) eventsRef.current.shift();
    },
    () => {
      eventsRef.current = [];
    },
  );

  return { eventsRef };
}

// --- Collision ---

export interface CollisionEventData {
  timestamp: number;
  otherActorId: number;
  impulse: { x: number; y: number; z: number };
  magnitude: number;
}

export function useCollisionData(sensorId: number) {
  const eventsRef = useRef<CollisionEventData[]>([]);

  useSensorEventStream(
    sensorId,
    0x09,
    32,
    (v) => {
      const ts = v.getFloat64(8, true);
      const otherId = v.getUint32(16, true);
      const ix = v.getFloat32(20, true);
      const iy = v.getFloat32(24, true);
      const iz = v.getFloat32(28, true);
      const mag = Math.sqrt(ix * ix + iy * iy + iz * iz);
      eventsRef.current.push({
        timestamp: ts,
        otherActorId: otherId,
        impulse: { x: ix, y: iy, z: iz },
        magnitude: mag,
      });
      if (eventsRef.current.length > EVENT_LOG_MAX_ITEMS) eventsRef.current.shift();
    },
    () => {
      eventsRef.current = [];
    },
  );

  return { eventsRef };
}
