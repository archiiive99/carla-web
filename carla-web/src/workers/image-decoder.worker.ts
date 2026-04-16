/**
 * Image decoder worker.
 * Receives JPEG/WebP ArrayBuffers, decodes to ImageBitmap,
 * and transfers back to main thread (zero-copy).
 */

// Camera header: 4B sid, 4B w, 4B h, 4B frame, 8B ts = 24 bytes
const CAMERA_HEADER_SIZE = 24;

let port: MessagePort | null = null;

async function decodeImage(_channel: number, payload: ArrayBuffer) {
  if (payload.byteLength < CAMERA_HEADER_SIZE) return;

  const view = new DataView(payload);
  const sensorId = view.getUint32(0, true);
  const width = view.getUint32(4, true);
  const height = view.getUint32(8, true);
  const frame = view.getUint32(12, true);
  // timestamp sits at byte 16, 8 bytes (float64) — capture receive time for latency
  const receiveTime = performance.now();

  // View, not copy: Uint8Array over the incoming buffer avoids the
  // payload.slice() memcpy of ~100KB JPEG data. Blob will then make its
  // own internal copy of the view's bytes, so we still end up at one
  // copy total (down from two) and the JIT can fold the Uint8Array
  // construction to a pointer + length without allocating storage.
  const jpegBytes = new Uint8Array(payload, CAMERA_HEADER_SIZE);

  try {
    const blob = new Blob([jpegBytes], { type: "image/jpeg" });
    const bitmap = await createImageBitmap(blob);

    self.postMessage(
      {
        type: "camera",
        sensorId,
        frame,
        width,
        height,
        bitmap,
        receiveTime,
      },
      { transfer: [bitmap] },
    );
  } catch {
    // Decode failed — skip frame
  }
}

// Receive from ws-receiver via MessagePort
self.onmessage = (event: MessageEvent) => {
  if (event.data?.type === "init" && event.data.port) {
    port = event.data.port as MessagePort;
    port!.onmessage = (e: MessageEvent) => {
      const { channel, payload } = e.data;
      decodeImage(channel, payload);
    };
    return;
  }

  // Also handle direct messages (from ws-receiver MessagePort transfer)
  if (event.data?.channel !== undefined && event.data?.payload) {
    decodeImage(event.data.channel, event.data.payload);
  }
};
