import { expect, test } from "@playwright/test";

test.describe("Accessibility navigation", () => {
  test("skip link is first in keyboard order and moves focus to main content", async ({
    page,
  }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();

    await skipLink.press("Enter");

    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("destroy-all dialog returns focus to its trigger after escape", async ({
    page,
  }) => {
    await page.goto("/");

    const triggerId = await page.evaluate(() => {
      const trigger = document.querySelector<HTMLButtonElement>(
        '[data-slot="alert-dialog-trigger"][aria-label="Destroy all spawned actors"]'
      );
      if (!trigger) return null;
      trigger.focus();
      trigger.click();
      return trigger.id;
    });

    expect(triggerId).toBeTruthy();

    await page.waitForFunction(() => Boolean(document.querySelector('[role="alertdialog"]')));
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-slot") === "alert-dialog-cancel"
    );

    await page.keyboard.press("Escape");

    await page.waitForFunction(() => !document.querySelector('[role="alertdialog"]'));
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          id: document.activeElement?.id ?? null,
          ariaLabel: document.activeElement?.getAttribute("aria-label") ?? null,
        }))
      )
      .toEqual({
        id: triggerId,
        ariaLabel: "Destroy all spawned actors",
      });
  });

  test("bottom panel tabs expose consistent tab/panel ARIA wiring", async ({
    page,
  }) => {
    await page.goto("/");

    const tabs = page.locator('section[aria-label="Sensor and telemetry panels"] [role="tab"]');
    await expect(tabs).toHaveCount(5);

    const tabCount = await tabs.count();
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      const tabId = await tab.getAttribute("id");
      const controls = await tab.getAttribute("aria-controls");

      expect(tabId).toBeTruthy();
      expect(controls).toBeTruthy();

      await tab.click();
      const panel = page.locator(`#${controls}`);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("role", "tabpanel");
      await expect(panel).toHaveAttribute("aria-labelledby", tabId!);
    }
  });
});
