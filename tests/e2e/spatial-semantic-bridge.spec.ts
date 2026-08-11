import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const FIELD = '[data-testid="semantic-zoom-field"]';
const DIALOG_NAME = "一万个词的分层探索世界";
const GLOBAL_ENTRY_NAME = "打开 10 个视觉领域、758 个分层入口和 10,000 个词";

async function openWorld(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  return app;
}

async function sceneProgress(progress: Locator): Promise<{
  current: number;
  total: number;
  remaining: number;
  cameraMode: string | undefined;
  text: string;
}> {
  return progress.evaluate((element) => ({
    current: Number((element as HTMLElement).dataset.current),
    total: Number((element as HTMLElement).dataset.total),
    remaining: Number((element as HTMLElement).dataset.remaining),
    cameraMode: (element as HTMLElement).dataset.cameraMode,
    text: element.textContent ?? "",
  }));
}

async function safeZoomPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.locator(VIEWPORT).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const portalBounds = [...element.querySelectorAll<HTMLElement>(".scene-hotspot-region")]
      .map((portal) => portal.getBoundingClientRect());
    for (const yFraction of [0.35, 0.5, 0.65, 0.8]) {
      for (const xFraction of [0.08, 0.2, 0.38, 0.62, 0.8, 0.92]) {
        const x = bounds.left + bounds.width * xFraction;
        const y = bounds.top + bounds.height * yFraction;
        if (portalBounds.every((portal) => (
          x < portal.left || x > portal.right || y < portal.top || y > portal.bottom
        ))) return { x, y };
      }
    }
    throw new Error("scene needs a non-portal point for the maximum-zoom progress contract");
  });
}

test("a reviewed spatial word enters its exact semantic realm without search fanout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "the bridge is covered once; progress remains cross-viewport");
  const topicShardRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/data\/semantic\/topics\/.+\.json$/.test(pathname)) topicShardRequests.push(pathname);
  });
  await openWorld(page);

  const apartment = page.locator('[data-testid="word-label"][data-label-id="apartment"]');
  await expect(apartment).toHaveAttribute("data-interactive", "true");
  await apartment.click();
  const card = page.getByRole("complementary", { name: "apartment word details" });
  await expect(card).toBeVisible();
  const bridge = card.getByRole("button", {
    name: "从实景词 apartment 进入万词世界的相关语义领域",
  });
  await expect(bridge).toContainText("从这个实景词进入相关词域");
  await bridge.click();

  const dialog = page.getByRole("dialog", { name: DIALOG_NAME });
  const field = dialog.locator(FIELD);
  await expect(dialog).toBeVisible();
  await expect(field).toHaveAttribute("data-active-realm", "objects-technology");
  await expect(field).toHaveAttribute("data-spatial-entry-word", "apartment");
  await expect(field).toHaveAttribute("data-level", "topic");
  await expect(field).toHaveAttribute("aria-busy", "false");
  await expect(field.locator('[data-testid="semantic-zoom-node"][data-level="topic"]').first()).toBeVisible();
  await expect(field.locator(".semantic-zoom-field__context span")).toContainText(
    "apartment · 实景词 → 相关词域（其余词按语义组织）",
  );
  expect(topicShardRequests, "a reviewed realm bridge must not invoke the 44-shard global search").toEqual([]);

  await dialog.getByRole("button", { name: "关闭万词世界" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: GLOBAL_ENTRY_NAME }).click();

  const reopenedDialog = page.getByRole("dialog", { name: DIALOG_NAME });
  const reopenedField = reopenedDialog.locator(FIELD);
  await expect(reopenedField).toHaveAttribute("data-level", "realm");
  await expect(reopenedField).toHaveAttribute("aria-busy", "false");
  await expect(reopenedField).not.toHaveAttribute("data-active-realm", /.+/);
  await expect(reopenedField).not.toHaveAttribute("data-spatial-entry-word", /.+/);
  await expect(reopenedField.locator(".semantic-zoom-field__context span")).toHaveText(
    "10 个词汇领域",
  );
});

test("the global header entry remains a provenance-free realm overview", async ({ page }) => {
  await openWorld(page);
  await page.getByRole("button", { name: GLOBAL_ENTRY_NAME }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_NAME });
  const field = dialog.locator(FIELD);
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("aria-busy", "false");
  await expect(field).not.toHaveAttribute("data-active-realm", /.+/);
  await expect(field).not.toHaveAttribute("data-spatial-entry-word", /.+/);
  const provenance = field.locator(".semantic-zoom-field__context span");
  await expect(provenance).toHaveText("10 个词汇领域");
  await expect(provenance).not.toContainText("实景词");
});

test("scene progress conserves its total and switches to pan guidance at maximum zoom", async ({ page }) => {
  const app = await openWorld(page);
  await page.locator('[data-testid="scene-minimap-child"][data-target-scene="community-garden"]').click();
  await expect(app).toHaveAttribute("data-scene-id", "community-garden");
  await expect(page.getByTestId("scene-label-layer")).toHaveAttribute("data-motion-frozen", "false");
  const progress = page.getByTestId("scene-word-progress");
  await expect(progress).toBeVisible();
  await expect.poll(async () => (await sceneProgress(progress)).current).toBeGreaterThan(0);
  const initial = await sceneProgress(progress);
  expect(initial.current + initial.remaining).toBe(initial.total);

  const point = await safeZoomPoint(page);
  await page.mouse.move(point.x, point.y);
  const surface = page.locator(".scene-surface");
  await expect.poll(async () => {
    const scale = Number(await surface.getAttribute("data-scene-scale"));
    if (Number.isFinite(scale) && scale < 4.13) await page.mouse.wheel(0, -480);
    return Number(await surface.getAttribute("data-scene-scale"));
  }, {
    intervals: [45],
    timeout: 8_000,
    message: "scene camera must reach its authored maximum scale",
  }).toBeGreaterThanOrEqual(4.13);
  await expect(progress).toHaveAttribute("data-camera-mode", "pan");

  const maximum = await sceneProgress(progress);
  expect(maximum.current).toBeGreaterThan(0);
  expect(maximum.current + maximum.remaining).toBe(maximum.total);
  expect(maximum.cameraMode).toBe("pan");
  expect(maximum.text).toContain("拖动");
  await expect(progress).toHaveAttribute("aria-label", /拖动探索/);
});
