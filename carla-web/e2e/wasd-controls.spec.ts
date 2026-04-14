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

function speedKmh(actor: { velocity?: { x: number; y: number; z: number } }): number {
  const v = actor.velocity ?? { x: 0, y: 0, z: 0 };
  return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) * 3.6;
}

test.describe("WASD Vehicle Controls", () => {
  test.beforeAll(async () => {
    const ready = await waitForCarla();
    test.skip(!ready, "CARLA server not available");
  });

  test("egoVehicleId is resolved and VehicleControls HUD is rendered", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(10_000);

    // Get the default vehicle ID from the bridge session
    const sessionRes = await fetch(`${BRIDGE_URL}/api/realtime/session`);
    const session = await sessionRes.json();
    const vehicleId = session.default_vehicle_id;
    expect(vehicleId).toBeTruthy();

    // Verify the VehicleControls HUD is visible (proves egoVehicleId was set)
    const speedDisplay = page.locator("text=km/h").first();
    await expect(speedDisplay).toBeVisible({ timeout: 5_000 });

    // Verify the WASD key badges are rendered
    const wBadge = page.locator("text=W").first();
    await expect(wBadge).toBeVisible();
  });

  test("keyboard events are intercepted by VehicleControls handler", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(10_000);

    // Verify session and HUD
    const sessionRes = await fetch(`${BRIDGE_URL}/api/realtime/session`);
    const session = await sessionRes.json();
    expect(session.default_vehicle_id).toBeTruthy();
    await expect(page.locator("text=km/h").first()).toBeVisible({
      timeout: 5_000,
    });

    // Install a spy on window keydown SYNCHRONOUSLY, then dispatch WASD
    // events synchronously. This avoids async timeouts from VehicleControls'
    // 20Hz control loop stealing the event loop.
    const results = await page.evaluate(() => {
      const collected: Array<{ key: string; defaultPrevented: boolean }> = [];

      // Register spy listener
      window.addEventListener("keydown", (e) => {
        if (["w", "s", "a", "d"].includes(e.key)) {
          collected.push({
            key: e.key,
            defaultPrevented: e.defaultPrevented,
          });
        }
      });

      // Dispatch and immediately release each key synchronously
      for (const key of ["w", "s", "a", "d"]) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            code: `Key${key.toUpperCase()}`,
            bubbles: true,
            cancelable: true,
          })
        );
        window.dispatchEvent(
          new KeyboardEvent("keyup", {
            key,
            code: `Key${key.toUpperCase()}`,
            bubbles: true,
            cancelable: true,
          })
        );
      }

      // Return collected results synchronously -- no setTimeout needed
      return collected;
    });

    console.log("Key event results:", JSON.stringify(results));

    // All 4 WASD keys should have been handled by VehicleControls
    expect(results.length).toBe(4);
    for (const r of results) {
      expect(r.defaultPrevented).toBe(true);
    }
  });

  test("managed-ego control API works end-to-end from browser context", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForTimeout(10_000);

    const sessionRes = await fetch(`${BRIDGE_URL}/api/realtime/session`);
    const session = await sessionRes.json();
    const vehicleId = session.default_vehicle_id;
    expect(vehicleId).toBeTruthy();

    // Verify the browser can call the low-latency managed-ego control API
    // through the Vite proxy (this is the same path VehicleControls uses).
    const result = await page.evaluate(async (vid) => {
      try {
        const res = await fetch(`/api/realtime/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            throttle: 1.0,
            steer: 0.0,
            brake: 0.0,
            hand_brake: false,
            reverse: false,
          }),
        });
        return { ok: res.ok, status: res.status, body: await res.json() };
      } catch (e) {
        return { error: String(e) };
      }
    }, vehicleId);

    console.log("Browser -> bridge control API:", JSON.stringify(result));
    expect(result.ok).toBe(true);
    expect(result.body.status).toBe("control_applied");
    expect(result.body.id).toBe(vehicleId);
    expect(result.body.managed_ego).toBe(true);
  });

  test("WASD stays bound to the managed ego even after selecting another vehicle", async ({
    page,
    request,
  }) => {
    const sessionRes = await request.get(`${BRIDGE_URL}/api/realtime/session`);
    const session = await sessionRes.json();
    const egoId = session.default_vehicle_id;
    expect(egoId).toBeTruthy();

    const [bpRes, spawnRes] = await Promise.all([
      request.get(`${BRIDGE_URL}/api/blueprints/vehicles`),
      request.get(`${BRIDGE_URL}/api/world/spawn-points`),
    ]);
    const blueprint = (await bpRes.json()).blueprints[0].id;
    const spawnPoints = (await spawnRes.json()).spawn_points;
    expect(spawnPoints.length).toBeGreaterThan(1);

    const spawnedRes = await request.post(`${BRIDGE_URL}/api/actors/spawn/vehicle`, {
      data: {
        blueprint,
        transform: spawnPoints[1],
        autopilot: false,
      },
    });
    expect(spawnedRes.ok()).toBeTruthy();
    const spawned = await spawnedRes.json();
    const spawnedId = spawned.id;
    expect(spawnedId).toBeTruthy();

    try {
      await page.goto("/");
      await page.waitForTimeout(10_000);

      await page.evaluate(() => {
        const originalFetch = window.fetch.bind(window);
        (window as typeof window & { __controlTargetLog?: number[] }).__controlTargetLog = [];
        window.fetch = async (...args) => {
          const input = args[0];
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
          if (url.endsWith("/api/realtime/control")) {
            (window as typeof window & { __controlTargetLog?: string[] }).__controlTargetLog?.push(url);
          }
          return originalFetch(...args);
        };
      });

      await page.getByRole("button", { name: new RegExp(String(spawnedId)) }).click();
      await page.keyboard.down("w");
      await page.waitForTimeout(250);
      await page.keyboard.up("w");
      await page.waitForTimeout(250);

      const targetLog = await page.evaluate(
        () => (window as typeof window & { __controlTargetLog?: string[] }).__controlTargetLog ?? [],
      );

      expect(targetLog.length).toBeGreaterThan(0);
      expect(new Set(targetLog)).toEqual(
        new Set([
          "http://localhost:58336/api/realtime/control",
        ]),
      );
    } finally {
      await request.delete(`${BRIDGE_URL}/api/actors/${spawnedId}`);
    }
  });

  test("holding W drives the managed ego vehicle forward", async ({
    page,
    request,
  }) => {
    const spawnPointsRes = await request.get(`${BRIDGE_URL}/api/world/spawn-points`);
    const spawnPoints = (await spawnPointsRes.json()).spawn_points;
    expect(spawnPoints.length).toBeGreaterThan(0);

    await page.goto("/");
    await page.waitForTimeout(10_000);
    await page.locator('main[aria-label="Simulation viewport"]').click({
      position: { x: 120, y: 120 },
    });

    const sessionRes = await request.get(`${BRIDGE_URL}/api/realtime/session`);
    const session = await sessionRes.json();
    const egoId = session.default_vehicle_id;
    expect(egoId).toBeTruthy();

    await request.post(`${BRIDGE_URL}/api/actors/${egoId}/transform`, {
      data: spawnPoints[0],
    });
    await page.waitForTimeout(750);

    await request.post(`${BRIDGE_URL}/api/actors/${egoId}/autopilot`, {
      data: { enabled: false },
    });

    const beforeRes = await request.get(`${BRIDGE_URL}/api/actors/${egoId}`);
    const before = await beforeRes.json();
    await page.keyboard.down("w");
    let during = before;
    let deltaLocation = 0;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      const duringRes = await request.get(`${BRIDGE_URL}/api/actors/${egoId}`);
      during = await duringRes.json();
      deltaLocation = Math.hypot(
        during.transform.location.x - before.transform.location.x,
        during.transform.location.y - before.transform.location.y,
      );
      if (deltaLocation > 0.05) {
        break;
      }
    }
    await page.keyboard.up("w");

    expect(during.control.throttle).toBeGreaterThan(0.6);
    expect(deltaLocation).toBeGreaterThan(0.05);
  });
});
