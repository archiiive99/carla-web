/**
 * LiDAR point cloud processor worker.
 * Receives raw float data, applies point budget,
 * computes height-based colors, and transfers arrays back.
 */

const MAX_POINTS = 200_000;

// LiDAR header: 4B sid, 4B count, 4B frame, 8B ts = 20 bytes
const LIDAR_HEADER_SIZE = 20;

function processLidar(channel: number, payload: ArrayBuffer) {
  if (payload.byteLength < LIDAR_HEADER_SIZE) return;

  const view = new DataView(payload);
  const sensorId = view.getUint32(0, true);
  let pointCount = view.getUint32(4, true);
  const frame = view.getUint32(8, true);

  const pointData = new Float32Array(payload, LIDAR_HEADER_SIZE);

  // Standard LiDAR: 4 floats per point (x, y, z, intensity)
  // Semantic LiDAR: 6 floats per point (x, y, z, cos, idx, tag)
  const isSemanticLidar = channel === 0x05;
  const floatsPerPoint = isSemanticLidar ? 6 : 4;
  pointCount = Math.min(pointCount, Math.floor(pointData.length / floatsPerPoint));

  // Apply point budget — stride-based downsampling
  let stride = 1;
  if (pointCount > MAX_POINTS) {
    stride = Math.ceil(pointCount / MAX_POINTS);
    pointCount = Math.ceil(pointCount / stride);
  }

  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);

  let outIdx = 0;
  for (let i = 0; i < pointData.length / floatsPerPoint && outIdx < pointCount; i += stride) {
    const base = i * floatsPerPoint;
    const x = pointData[base];
    const y = pointData[base + 1];
    const z = pointData[base + 2];

    positions[outIdx * 3] = x;
    positions[outIdx * 3 + 1] = z; // swap Y/Z for WebGL (Y-up)
    positions[outIdx * 3 + 2] = -y;

    // Height-based coloring (blue=low, green=mid, red=high)
    const normalizedHeight = Math.max(0, Math.min(1, (z + 2) / 10));
    if (normalizedHeight < 0.5) {
      const t = normalizedHeight * 2;
      colors[outIdx * 3] = 0;
      colors[outIdx * 3 + 1] = t;
      colors[outIdx * 3 + 2] = 1 - t;
    } else {
      const t = (normalizedHeight - 0.5) * 2;
      colors[outIdx * 3] = t;
      colors[outIdx * 3 + 1] = 1 - t;
      colors[outIdx * 3 + 2] = 0;
    }

    outIdx++;
  }

  const finalPositions = positions.slice(0, outIdx * 3);
  const finalColors = colors.slice(0, outIdx * 3);

  self.postMessage(
    {
      type: "lidar",
      sensorId,
      frame,
      pointCount: outIdx,
      positions: finalPositions,
      colors: finalColors,
    },
    { transfer: [finalPositions.buffer, finalColors.buffer] },
  );
}

self.onmessage = (event: MessageEvent) => {
  if (event.data?.channel !== undefined && event.data?.payload) {
    processLidar(event.data.channel, event.data.payload);
  }
};
