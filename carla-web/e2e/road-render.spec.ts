import { test, type Page } from "@playwright/test";

// ─── Captures of the procedural road render for Section-2 baseline diff ───
//
// The road-rendering mandate (prompts/specs/road-render-fidelity.md) requires
// matched-pair screenshots of the dashboard render vs the UE5 source for
// pose-by-pose comparison across:
//   - 3 camera poses: chase-cam, top-down, street-level
//   - 2 weather states: dry (ClearNoon) and wet (WetCloudyNoon)
//
// This spec captures the WEB side. The UE5 side is captured separately
// (manual editor screenshot or a CARLA spectator + sensor.camera.rgb script
// at the same poses + weather presets).
//
// Output layout:
//   e2e/screenshots/road-{dry|wet}-{chase|topdown|street}.png
//
// Skipped when CARLA RPC is disconnected — without waypoints + weather the
// screenshot can't show what's being measured.

const BRIDGE_URL = "http://localhost:58337";

async function waitForCarla(): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${BRIDGE_URL}/health`);
      const data = await res.json();
      if (data.carla_connected) return true;
    } catch {
      // bridge not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function setWeatherPreset(preset: string): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/api/world/weather`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset }),
  });
  if (!res.ok) {
    throw new Error(`Weather preset ${preset} failed: ${res.status}`);
  }
  // Bridge state is fire-and-forget; wait for dashboard to poll the new
  // weather (useConnectionHealth polls every ~3 s by default).
  await new Promise((r) => setTimeout(r, 4000));
}

async function rotateOrbitTopDown(page: Page): Promise<void> {
  const canvas = page.locator('[data-screenshot-target] canvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(cx, cy + 400, { steps: 20 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(800);
}

async function zoomIntoStreetLevel(page: Page): Promise<void> {
  const canvas = page.locator('[data-screenshot-target] canvas');
  const box = await canvas.boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  // Scroll-zoom inward 20× to drop near street height.
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -120);
  }
  await page.waitForTimeout(400);
}

test.describe("Road render capture (Section-2 baseline)", () => {
  test.beforeAll(async () => {
    const ready = await waitForCarla();
    test.skip(!ready, "CARLA RPC disconnected — road geometry unavailable");
  });

  for (const weather of [
    { name: "dry", preset: "ClearNoon" },
    { name: "wet", preset: "WetCloudyNoon" },
  ]) {
    test(`${weather.name}: 3 poses (chase / topdown / street)`, async ({ page }) => {
      await setWeatherPreset(weather.preset);
      await page.goto("/");
      // Wait for: connection-health to detect bridge, road geometry fetch
      // (~1–2 s for ~1.6k waypoints), three.js init, all 4 procedural
      // shaders to compile, weather poll cycle, first paint. Bridge has just
      // been touch-restarted in some scenarios — give the dashboard a long
      // enough beat to recover from any startup error before capturing.
      await page.waitForTimeout(15_000);

      const canvas = page.locator('[data-screenshot-target] canvas');

      // 1. Default chase-cam pose
      await canvas.screenshot({
        path: `e2e/screenshots/road-${weather.name}-chase.png`,
      });

      // 2. Top-down pose (right-mouse rotate)
      await rotateOrbitTopDown(page);
      await canvas.screenshot({
        path: `e2e/screenshots/road-${weather.name}-topdown.png`,
      });

      // 3. Street-level pose (zoom into the surface)
      await zoomIntoStreetLevel(page);
      await canvas.screenshot({
        path: `e2e/screenshots/road-${weather.name}-street.png`,
      });
    });
  }
});
