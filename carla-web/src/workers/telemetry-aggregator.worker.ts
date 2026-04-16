/**
 * Telemetry aggregator worker.
 * Receives world tick data, batches updates at 10Hz,
 * computes derived values (speed, heading).
 */

// World tick header: 4B frame, 8B ts, 4B count = 16 bytes
const TICK_HEADER_SIZE = 16;
// Per actor: 4B id + 9*4B floats = 40 bytes
const ACTOR_SIZE = 40;

const EMIT_INTERVAL_MS = 100; // 10Hz

interface ActorData {
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  velocity: { x: number; y: number; z: number };
  speed: number;
  heading: number;
}

let latestFrame = 0;
let latestTimestamp = 0;
let actorMap = new Map<number, ActorData>();
let dirty = false;

function processTick(payload: ArrayBuffer) {
  if (payload.byteLength < TICK_HEADER_SIZE) return;

  const view = new DataView(payload);
  latestFrame = view.getUint32(0, true);
  latestTimestamp = view.getFloat64(4, true);
  const actorCount = view.getUint32(12, true);

  const newMap = new Map<number, ActorData>();
  let offset = TICK_HEADER_SIZE;

  for (let i = 0; i < actorCount && offset + ACTOR_SIZE <= payload.byteLength; i++) {
    const id = view.getUint32(offset, true);
    const px = view.getFloat32(offset + 4, true);
    const py = view.getFloat32(offset + 8, true);
    const pz = view.getFloat32(offset + 12, true);
    const pitch = view.getFloat32(offset + 16, true);
    const yaw = view.getFloat32(offset + 20, true);
    const roll = view.getFloat32(offset + 24, true);
    const vx = view.getFloat32(offset + 28, true);
    const vy = view.getFloat32(offset + 32, true);
    const vz = view.getFloat32(offset + 36, true);

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) * 3.6; // m/s -> km/h
    const heading = ((yaw % 360) + 360) % 360;

    newMap.set(id, {
      id,
      position: { x: px, y: py, z: pz },
      rotation: { pitch, yaw, roll },
      velocity: { x: vx, y: vy, z: vz },
      speed,
      heading,
    });

    offset += ACTOR_SIZE;
  }

  actorMap = newMap;
  dirty = true;
}

function emitBatch() {
  if (!dirty) return;
  dirty = false;

  const actors = Array.from(actorMap.values());
  self.postMessage({
    type: "tick",
    frame: latestFrame,
    timestamp: latestTimestamp,
    actors,
  });
}

// Emit at 10Hz
setInterval(emitBatch, EMIT_INTERVAL_MS);

// Accept either an init message that transfers the ws-receiver MessageChannel
// port directly (skips the main-thread forwarding hop) or direct postMessage
// delivery. Matches image-decoder.worker.ts so all three data-plane workers
// share the same port-init pattern.
self.onmessage = (event: MessageEvent) => {
  if (event.data?.type === "init" && event.data.port) {
    const incoming = event.data.port as MessagePort;
    incoming.onmessage = (e: MessageEvent) => {
      if (e.data?.channel === 0x10 && e.data?.payload) {
        processTick(e.data.payload);
      }
    };
    return;
  }
  if (event.data?.channel === 0x10 && event.data?.payload) {
    processTick(event.data.payload);
  }
};
