import { expect, test, type Page } from "@playwright/test";

type Rgba = { r: number; g: number; b: number; a: number };

function parseCssColor(value: string): Rgba | null {
  const input = value.trim();
  let match = input.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(",").map((part) => Number(part.trim()));
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts[3] ?? 1,
    };
  }

  match = input.match(
    /^oklch\(([^/\s]+)\s+([^/\s]+)\s+([^/\s]+)(?:\s*\/\s*([^/\s]+))?\)$/i,
  );
  if (match) {
    return oklchToRgb(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      match[4] ? Number(match[4]) : 1,
    );
  }

  match = input.match(
    /^oklab\(([^/\s]+)\s+([^/\s]+)\s+([^/\s]+)(?:\s*\/\s*([^/\s]+))?\)$/i,
  );
  if (match) {
    return oklabToRgb(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      match[4] ? Number(match[4]) : 1,
    );
  }

  return null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function oklabToRgb(L: number, a: number, b: number, alpha = 1): Rgba {
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return {
    r: Math.round(clamp01(linearToSrgb(rLin)) * 255),
    g: Math.round(clamp01(linearToSrgb(gLin)) * 255),
    b: Math.round(clamp01(linearToSrgb(bLin)) * 255),
    a: alpha,
  };
}

function oklchToRgb(L: number, C: number, h: number, alpha = 1): Rgba {
  const radians = (h * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(radians), C * Math.sin(radians), alpha);
}

function blend(over: Rgba, under: Rgba): Rgba {
  const alpha = over.a + under.a * (1 - over.a);
  return {
    r: Math.round((over.r * over.a + under.r * under.a * (1 - over.a)) / alpha),
    g: Math.round((over.g * over.a + under.g * under.a * (1 - over.a)) / alpha),
    b: Math.round((over.b * over.a + under.b * under.a * (1 - over.a)) / alpha),
    a: alpha,
  };
}

function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function luminance(color: Rgba): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  );
}

function contrastRatio(foreground: Rgba, background: Rgba): number {
  const [lighter, darker] =
    luminance(foreground) > luminance(background)
      ? [luminance(foreground), luminance(background)]
      : [luminance(background), luminance(foreground)];
  return (lighter + 0.05) / (darker + 0.05);
}

async function contrastFor(page: Page, selector: string): Promise<number> {
  const data = await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return null;

    const computed = getComputedStyle(element);
    const stack: string[] = [];
    let current: HTMLElement | null = element as HTMLElement;

    while (current) {
      stack.unshift(getComputedStyle(current).backgroundColor);
      current = current.parentElement;
    }

    return {
      color: computed.color,
      stack,
    };
  }, selector);

  if (!data) {
    throw new Error(`Missing contrast target: ${selector}`);
  }

  const foreground = parseCssColor(data.color);
  if (!foreground) {
    throw new Error(`Unable to parse foreground color: ${data.color}`);
  }

  let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of data.stack) {
    const parsed = parseCssColor(layer);
    if (parsed && parsed.a > 0) {
      background = blend(parsed, background);
    }
  }

  return contrastRatio(foreground, background);
}

test.describe("Light mode contrast", () => {
  test("critical status and overlay surfaces stay above AA thresholds", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/");
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[aria-label="Switch to light theme"]')),
    );
    await page.evaluate(() => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Switch to light theme"]')
        ?.click();
    });

    await expect(page.locator("html")).not.toHaveClass(/dark/);

    const connectionBadge = page.locator(
      'header [data-slot="badge"][aria-label*="CARLA"]',
    );
    await expect(connectionBadge).toBeVisible({ timeout: 15_000 });

    const checks = [
      {
        name: "connection badge",
        selector: 'header [data-slot="badge"][aria-label*="CARLA"]',
        min: 4.5,
      },
      {
        name: "status footer text",
        selector: "footer",
        min: 4.5,
      },
      {
        name: "viewport overlay badge",
        selector: 'main#main-content [data-slot="badge"]',
        min: 4.5,
      },
    ];

    for (const check of checks) {
      // .first() — overlay badges are nested inside flex containers; strict
      // mode would fail on >1 match for the descendant selector.
      await expect(page.locator(check.selector).first()).toBeVisible({ timeout: 15_000 });
      const ratio = await contrastFor(page, check.selector);
      expect(
        ratio,
        `${check.name} contrast ${ratio.toFixed(2)} should be >= ${check.min}`,
      ).toBeGreaterThanOrEqual(check.min);
    }
  });
});
