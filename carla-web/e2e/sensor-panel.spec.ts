import { test, expect } from "@playwright/test";

const BRIDGE_URL = "http://localhost:58337";

async function waitForCarla() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BRIDGE_URL}/health`);
      const data = await res.json();
      if (data.carla_connected) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

test.describe("Sensor panel usability", () => {
  test.beforeAll(async () => {
    const ready = await waitForCarla();
    test.skip(!ready, "CARLA server not available");
  });

  test("empty grid cells can filter and add a newly spawned sensor", async ({
    page,
    request,
  }) => {
    const session = await (await request.get(`${BRIDGE_URL}/api/realtime/session`)).json();
    const egoId = session.default_vehicle_id;
    expect(egoId).toBeTruthy();

    const spawnedRes = await request.post(`${BRIDGE_URL}/api/actors/spawn/sensor`, {
      data: {
        type: "sensor.camera.rgb",
        parent_id: egoId,
        transform: {
          location: { x: 1.5, y: 0.0, z: 1.6 },
          rotation: { pitch: -5, yaw: 20, roll: 0 },
        },
        attributes: {
          image_size_x: "640",
          image_size_y: "360",
          fov: "90",
          sensor_tick: "0.1",
        },
      },
    });
    expect(spawnedRes.ok()).toBeTruthy();
    const spawned = await spawnedRes.json();
    const spawnedId = spawned.id;

    try {
      await page.goto("/");
      await page.waitForTimeout(8_000);

      const addButtons = page.getByRole("button", { name: "Add sensor to cell" });
      await expect(addButtons.first()).toBeVisible();
      await addButtons.first().click();

      const filterInput = page.getByLabel("Filter sensors for this grid cell");
      await expect(filterInput).toBeVisible();
      await filterInput.fill(String(spawnedId));

      const sensorOption = page.getByRole("button", { name: new RegExp(`Rgb\\s+${spawnedId}`) });
      await expect(sensorOption).toBeVisible();
      await sensorOption.click();

      await expect(page.getByText(new RegExp(`#${spawnedId}`)).first()).toBeVisible();
    } finally {
      await request.delete(`${BRIDGE_URL}/api/actors/${spawnedId}`);
    }
  });

  test("quick compare and focus ego RGB actions are available", async ({ page, request }) => {
    const session = await (await request.get(`${BRIDGE_URL}/api/realtime/session`)).json();
    expect(session.default_vehicle_id).toBeTruthy();

    await page.goto("/");
    await page.waitForTimeout(8_000);

    await expect(page.getByRole("button", { name: "Quick compare" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Focus ego RGB" })).toBeVisible();

    await page.getByRole("button", { name: "Quick compare" }).click();
    await expect(page.getByText("Chase")).toBeVisible();

    await page.getByRole("button", { name: "Focus ego RGB" }).click();
    await expect(page.getByText("Managed camera feed").first()).toBeVisible();
  });
});
