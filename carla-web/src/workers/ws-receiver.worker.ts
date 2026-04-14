/**
 * WebSocket receiver worker.
 * Opens/manages the WS connection, parses binary frames,
 * and routes data to processing workers via MessagePorts.
 */

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const STATS_INTERVAL_MS = 1000;
const FRAME_INACTIVITY_TIMEOUT_MS = 3000;
const WATCHDOG_INTERVAL_MS = 1000;

// Channel IDs (duplicated to avoid import issues in worker)
// CH_CAMERA (0x01) is the legacy RGB JPEG stream. The bridge still sends
// nothing on it after the single-source migration — the constant is kept
// as a sentinel so stray packets get dropped explicitly rather than
// routed to a decoder.
const CH_CAMERA = 0x01;
const CH_DEPTH = 0x02;
const CH_SEGMENTATION = 0x03;
const CH_LIDAR = 0x04;
const CH_SEMANTIC_LIDAR = 0x05;
const CH_RADAR = 0x06;
const CH_IMU = 0x07;
const CH_GNSS = 0x08;
const CH_COLLISION = 0x09;
const CH_LANE_INVASION = 0x0a;
const CH_WORLD_TICK = 0x10;

let ws: WebSocket | null = null;
let wsUrl = "";
let shouldReconnect = true;
let reconnectDelay = RECONNECT_INITIAL_MS;
let reconnectTimer: number | null = null;

let imagePort: MessagePort | null = null;
let lidarPort: MessagePort | null = null;
let telemetryPort: MessagePort | null = null;
const desiredSubscriptions = new Set<number>();

let bytesReceived = 0;
let framesReceived = 0;
let lastStatsTime = performance.now();
let lastTickFrame = -1;
let droppedFrames = 0;
let lastFrameTime = 0;

function postStatus(status: string) {
  self.postMessage({ type: "status", status });
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!shouldReconnect || reconnectTimer !== null) return;

  const delay = reconnectDelay;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    connect();
  }, delay);
}

function connect() {
  if (!wsUrl) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  clearReconnectTimer();
  postStatus("connecting");

  try {
    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      postStatus("connected");
      reconnectDelay = RECONNECT_INITIAL_MS;
      lastFrameTime = performance.now();
      clearReconnectTimer();
      for (const sensorId of desiredSubscriptions) {
        ws?.send(JSON.stringify({ action: "subscribe", sensor_id: sensorId }));
      }
    };

    ws.onclose = () => {
      ws = null;
      postStatus("disconnected");
      scheduleReconnect();
    };

    ws.onerror = () => {
      postStatus("error");
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        lastFrameTime = performance.now();
        handleBinaryFrame(event.data);
      }
    };
  } catch {
    postStatus("error");
    scheduleReconnect();
  }
}

function handleBinaryFrame(buffer: ArrayBuffer) {
  if (buffer.byteLength < 5) return;

  bytesReceived += buffer.byteLength;
  framesReceived++;

  const view = new DataView(buffer);
  const channel = view.getUint8(0);
  const length = view.getUint32(1, true);
  if (5 + length > buffer.byteLength) return;
  const payload = buffer.slice(5, 5 + length);

  switch (channel) {
    case CH_CAMERA:
      // RGB sensors no longer emit frames (bridge-side skip post single-
      // source migration); CH_CAMERA is still used by surface-normals which
      // remains a streamed engine-derived visual buffer. Route as before;
      // RGB subscribers just never observe payloads for their sensorId.
    case CH_DEPTH:
    case CH_SEGMENTATION:
      if (imagePort) {
        imagePort.postMessage({ channel, payload }, [payload]);
      }
      break;

    case CH_LIDAR:
    case CH_SEMANTIC_LIDAR:
      if (lidarPort) {
        lidarPort.postMessage({ channel, payload }, [payload]);
      }
      break;

    case CH_WORLD_TICK: {
      // Detect dropped world-tick frames by tracking sequential frame IDs
      if (payload.byteLength >= 4) {
        const frame = new DataView(payload).getUint32(0, true);
        if (lastTickFrame >= 0 && frame > lastTickFrame + 1) {
          droppedFrames += frame - lastTickFrame - 1;
        }
        lastTickFrame = frame;
      }
      if (telemetryPort) {
        telemetryPort.postMessage({ channel, payload }, [payload]);
      }
      break;
    }

    case CH_RADAR:
    case CH_IMU:
    case CH_GNSS:
    case CH_COLLISION:
    case CH_LANE_INVASION:
      // Forward directly to main thread for these lightweight events
      self.postMessage({ type: "sensor_event", channel, payload }, { transfer: [payload] });
      break;
  }
}

function sendStats() {
  const now = performance.now();
  const elapsed = (now - lastStatsTime) / 1000;
  if (elapsed <= 0) return;

  const bandwidth = bytesReceived / elapsed;
  self.postMessage({
    type: "stats",
    fps: framesReceived / elapsed,
    bandwidth,
    frames: framesReceived,
    droppedFrames,
  });

  bytesReceived = 0;
  framesReceived = 0;
  lastStatsTime = now;
}

// Stats reporting interval
setInterval(sendStats, STATS_INTERVAL_MS);

setInterval(() => {
  if (!shouldReconnect) return;

  if (!ws || ws.readyState === WebSocket.CLOSED) {
    scheduleReconnect();
    return;
  }

  if (ws.readyState !== WebSocket.OPEN || !lastFrameTime) return;

  const idleFor = performance.now() - lastFrameTime;
  if (idleFor > FRAME_INACTIVITY_TIMEOUT_MS) {
    postStatus("error");
    ws.close();
  }
}, WATCHDOG_INTERVAL_MS);

// Handle messages from main thread
self.onmessage = (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case "connect":
      wsUrl = data.url;
      shouldReconnect = true;
      // Store MessagePorts
      if (data.imagePort) imagePort = data.imagePort;
      if (data.lidarPort) lidarPort = data.lidarPort;
      if (data.telemetryPort) telemetryPort = data.telemetryPort;
      connect();
      break;

    case "disconnect":
      shouldReconnect = false;
      clearReconnectTimer();
      ws?.close();
      ws = null;
      break;

    case "subscribe":
    case "unsubscribe": {
      if (type === "subscribe") {
        desiredSubscriptions.add(data.sensorId);
      } else {
        desiredSubscriptions.delete(data.sensorId);
      }
      if (ws?.readyState === WebSocket.OPEN) {
        const json = JSON.stringify({
          action: type,
          sensor_id: data.sensorId,
        });
        ws.send(json);
      }
      break;
    }

    case "send":
      if (ws?.readyState === WebSocket.OPEN && data.buffer) {
        ws.send(data.buffer);
      }
      break;
  }
};
