import { expect, test } from "@playwright/test";

import { computeVegetationPlacement } from "../src/components/viewport/vegetation-placement";

test.describe("Vegetation placement", () => {
  test("anchors vegetation to transform ground location instead of bbox center", () => {
    const placement = computeVegetationPlacement(
      {
        t: { x: 511.34, y: 244.75, z: -31.36, yaw: -65.43 },
        b: { x: 505.77, y: 242.21, z: -11.33, ex: 62.73, ey: 5.72, ez: 20.22, yaw: -65.43 },
      },
      {
        minY: 0,
        height: 1707.27,
        radius: 1183.81,
      },
    );

    expect(placement.position.x).toBeCloseTo(511.34, 2);
    expect(placement.position.y).toBeCloseTo(-31.36, 2);
    expect(placement.position.z).toBeCloseTo(-244.75, 2);
    expect(placement.position.y).not.toBeCloseTo(-11.33, 1);
  });

  test("compensates for vegetation models whose local mesh dips below y=0", () => {
    const placement = computeVegetationPlacement(
      {
        t: { x: 10, y: 20, z: 3, yaw: 15 },
        b: { x: 10, y: 20, z: 8, ex: 2, ey: 2, ez: 5, yaw: 15 },
      },
      {
        minY: -1.5,
        height: 15,
        radius: 6,
      },
    );

    // Ground anchor stays at CARLA transform.z (= 3 in UE / 3 in Three Y),
    // then the negative mesh minimum is lifted by the scaled base offset.
    expect(placement.position.y).toBeCloseTo(4, 5);
    expect(placement.scale.y).toBeCloseTo(10 / 15, 5);
  });
});
