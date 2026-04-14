import { expect, test } from "@playwright/test";

test.describe("Viewport fidelity mode truthfulness", () => {
  test("defaults to native mode and marks browser mode as approximate", async ({
    page,
  }) => {
    await page.goto("/");

    await page.evaluate(() => localStorage.removeItem("carla-ui-state"));
    await page.reload();

    await expect(page.getByRole("button", { name: "Native UE" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Native UE Stream")).toBeVisible();

    await page.getByRole("button", { name: "Approx 3D" }).click();
    await expect(page.getByRole("button", { name: "Approx 3D" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Approximate")).toBeVisible();
    await expect(
      page.getByText("Browser approximation mode. Source-faithful assets render only"),
    ).toBeVisible();
    await expect(
      page.getByText("Managed camera reference is pinned in this mode"),
    ).toBeVisible();
  });
});
