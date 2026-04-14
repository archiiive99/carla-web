/**
 * Data export utilities for sensor snapshots.
 */

export function saveCanvasAsPng(
  canvas: HTMLCanvasElement,
  filename = "frame.png",
): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function savePointCloudAsPly(
  positions: Float32Array,
  colors: Float32Array | null,
  pointCount: number,
  filename = "pointcloud.ply",
): void {
  const header = [
    "ply",
    "format ascii 1.0",
    `element vertex ${pointCount}`,
    "property float x",
    "property float y",
    "property float z",
    ...(colors ? ["property uchar red", "property uchar green", "property uchar blue"] : []),
    "end_header",
  ].join("\n");

  const lines: string[] = [header];
  for (let i = 0; i < pointCount; i++) {
    const x = positions[i * 3].toFixed(6);
    const y = positions[i * 3 + 1].toFixed(6);
    const z = positions[i * 3 + 2].toFixed(6);
    if (colors) {
      const r = Math.round(colors[i * 3] * 255);
      const g = Math.round(colors[i * 3 + 1] * 255);
      const b = Math.round(colors[i * 3 + 2] * 255);
      lines.push(`${x} ${y} ${z} ${r} ${g} ${b}`);
    } else {
      lines.push(`${x} ${y} ${z}`);
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveLidarAsPly(
  positions: Float32Array,
  colors: Float32Array,
  pointCount: number,
  filename = "lidar_cloud.ply",
): void {
  savePointCloudAsPly(positions, colors, pointCount, filename);
}

export interface ImuCsvSample {
  timestamp: number;
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  compass: number;
}

export function saveImuAsCsv(
  samples: ImuCsvSample[],
  filename = "imu_data.csv",
): void {
  const header = "timestamp,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,compass";
  const rows = samples.map((sample) =>
    [
      sample.timestamp,
      sample.accel.x,
      sample.accel.y,
      sample.accel.z,
      sample.gyro.x,
      sample.gyro.y,
      sample.gyro.z,
      sample.compass,
    ].join(","),
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 45. Save JSON data
export function saveJson(data: unknown, filename = "data.json"): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 46. Save canvas as JPEG (smaller than PNG)
export function saveCanvasAsJpeg(
  canvas: HTMLCanvasElement,
  filename = "frame.jpg",
  quality = 0.9,
): void {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    "image/jpeg",
    quality,
  );
}

// 47. Copy canvas to clipboard
export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

