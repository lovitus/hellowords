import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const FIELD = '[data-testid="semantic-zoom-field"]';
const DIALOG_NAME = "一万个词的分层探索世界";
const GLOBAL_ENTRY_NAME = "打开 10 个视觉领域、758 个分层入口和 10,000 个词";
const INDEPENDENT_WHEEL_GESTURE_GAP_MS = 240;

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
  nextPlane: string | undefined;
  text: string;
}> {
  return progress.evaluate((element) => ({
    current: Number((element as HTMLElement).dataset.current),
    total: Number((element as HTMLElement).dataset.total),
    remaining: Number((element as HTMLElement).dataset.remaining),
    cameraMode: (element as HTMLElement).dataset.cameraMode,
    nextPlane: (element as HTMLElement).dataset.nextPlane,
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

async function wheelSceneAt(
  page: Page,
  point: { x: number; y: number },
  deltaY: number,
): Promise<void> {
  await page.locator(VIEWPORT).dispatchEvent("wheel", {
    clientX: point.x,
    clientY: point.y,
    deltaY,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
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

  const wetlandCategory = page.locator(
    '[data-testid="atlas-category"][data-category-id="wetland"]',
  );
  await wetlandCategory.hover();
  const pond = page.locator(
    '[data-testid="atlas-category-word"][data-label-id="wetland-pond"]',
  );
  await expect(page.getByTestId("atlas-category-layer")).toHaveAttribute(
    "data-active-category",
    "wetland",
  );
  await expect(pond).toHaveAttribute("data-interactive", "true");
  await pond.click();
  const card = page.getByRole("complementary", { name: "pond word details" });
  await expect(card).toBeVisible();
  const bridge = card.getByRole("button", {
    name: "从实景词 pond 进入万词世界的相关语义领域",
  });
  await expect(bridge).toContainText("从这个实景词进入相关词域");
  await bridge.click();

  const dialog = page.getByRole("dialog", { name: DIALOG_NAME });
  const field = dialog.locator(FIELD);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-entry-mode", "spatial-bridge");
  await expect(dialog).toHaveAttribute("data-zoom-out-boundary", "disabled");
  await expect(field).toHaveAttribute("data-active-realm", "nature-life");
  await expect(field).toHaveAttribute("data-spatial-entry-word", "pond");
  await expect(field).toHaveAttribute("data-level", "topic");
  await expect(field).toHaveAttribute("aria-busy", "false");
  await expect(field.locator('[data-testid="semantic-zoom-node"][data-level="topic"]').first()).toBeVisible();
  await expect(field.locator(".semantic-zoom-field__context span")).toContainText(
    "pond · 实景词 → 相关词域（其余词按语义组织）",
  );
  expect(topicShardRequests, "a reviewed realm bridge must not invoke the 44-shard global search").toEqual([]);

  await dialog.getByRole("button", { name: "关闭万词世界" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(APP)).toHaveAttribute("data-semantic-entry-mode", "closed");
  await expect(page.locator(APP)).toHaveAttribute("data-semantic-transition-state", "idle");
  await page.getByRole("button", { name: GLOBAL_ENTRY_NAME }).click();

  const reopenedDialog = page.getByRole("dialog", { name: DIALOG_NAME });
  const reopenedField = reopenedDialog.locator(FIELD);
  await expect(reopenedDialog).toHaveAttribute("data-entry-mode", "global");
  await expect(reopenedDialog).toHaveAttribute("data-zoom-out-boundary", "disabled");
  await expect(reopenedField).toHaveAttribute("data-level", "realm");
  await expect(reopenedField).toHaveAttribute("aria-busy", "false");
  await expect(reopenedField).not.toHaveAttribute("data-active-realm", /.+/);
  await expect(reopenedField).not.toHaveAttribute("data-spatial-entry-word", /.+/);
  await expect(reopenedField.locator(".semantic-zoom-field__context span")).toHaveText(
    "10 个词汇领域",
  );
});

test("the global header entry remains a provenance-free realm overview", async ({ page }) => {
  const app = await openWorld(page);
  await page.getByRole("button", { name: GLOBAL_ENTRY_NAME }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_NAME });
  const field = dialog.locator(FIELD);
  await expect(app).toHaveAttribute("data-semantic-entry-mode", "global");
  await expect(app).toHaveAttribute("data-semantic-transition-state", "open");
  await expect(dialog).toHaveAttribute("data-entry-mode", "global");
  await expect(dialog).toHaveAttribute("data-zoom-out-boundary", "disabled");
  await expect(field).toHaveAttribute("data-zoom-out-boundary", "disabled");
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("aria-busy", "false");
  await expect(field).not.toHaveAttribute("data-active-realm", /.+/);
  await expect(field).not.toHaveAttribute("data-spatial-entry-word", /.+/);
  const provenance = field.locator(".semantic-zoom-field__context span");
  await expect(provenance).toHaveText("10 个词汇领域");
  await expect(provenance).not.toContainText("实景词");

  const bounds = await field.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, 720);
  await expect(dialog, "global entry must never shrink into an unrelated spatial scene").toBeVisible();
  await expect(app).toHaveAttribute("data-semantic-transition-state", "open");
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
  // A navigation handoff deliberately consumes its trailing wheel stream.
  // Start this zoom as a separate user gesture after the handoff quiet window.
  await page.waitForTimeout(INDEPENDENT_WHEEL_GESTURE_GAP_MS);
  const surface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  await expect(surface).toHaveAttribute("data-maximum-scale", /\d/u);
  const maximumScale = Number(await surface.getAttribute("data-maximum-scale"));
  // The runtime publishes camera values rounded to three decimals. Keep one
  // extra 0.001 tolerance so binary floating-point representation cannot turn
  // an exact boundary into a false failure.
  const requiredScale = maximumScale - 0.021;
  await expect.poll(async () => {
    const scale = Number(await surface.getAttribute("data-scene-scale"));
    if (Number.isFinite(scale) && scale < requiredScale) {
      await wheelSceneAt(page, point, -480);
    }
    return Number(await surface.getAttribute("data-scene-scale"));
  }, {
    intervals: [45],
    timeout: 8_000,
    message: "scene camera must reach its responsive maximum scale",
  }).toBeGreaterThanOrEqual(requiredScale);
  await expect(progress).toHaveAttribute("data-camera-mode", "pan");

  const maximum = await sceneProgress(progress);
  expect(maximum.current).toBeGreaterThan(0);
  expect(maximum.current + maximum.remaining).toBe(maximum.total);
  expect(maximum.cameraMode).toBe("pan");
  expect(maximum.nextPlane).toBe("spatial-terminal");
  expect(maximum.text).toContain("拖动");
  expect(maximum.text).toContain("已到最大倍率");
  await expect(progress).toHaveAttribute("aria-label", /拖动探索/);
});

test("continued zoom at a terminal spatial scene stays in the scene", async ({ page }) => {
  const app = await openWorld(page);
  for (const sceneId of ["community-garden", "potting-workbench"]) {
    await page.locator(
      `[data-testid="scene-minimap-child"][data-target-scene="${sceneId}"]`,
    ).click();
    await expect(app).toHaveAttribute("data-scene-id", sceneId);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }
  await expect(page.getByTestId("scene-label-layer")).toHaveAttribute("data-motion-frozen", "false");
  await expect(page.getByTestId("scene-minimap")).toHaveAttribute("data-terminal", "true");
  const point = await safeZoomPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(INDEPENDENT_WHEEL_GESTURE_GAP_MS);
  const surface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  await expect(surface).toHaveAttribute("data-maximum-scale", /\d/u);
  const maximumScale = Number(await surface.getAttribute("data-maximum-scale"));
  const requiredScale = maximumScale - 0.021;
  await expect.poll(async () => {
    const scale = Number(await surface.getAttribute("data-scene-scale"));
    if (Number.isFinite(scale) && scale < requiredScale) {
      await wheelSceneAt(page, point, -480);
    }
    return Number(await surface.getAttribute("data-scene-scale"));
  }, { intervals: [45], timeout: 8_000 }).toBeGreaterThanOrEqual(requiredScale);

  const progress = page.getByTestId("scene-word-progress");
  await expect(progress).toHaveAttribute("data-next-plane", "spatial-terminal");
  await expect(progress).toContainText("已到最大倍率");
  const dialog = page.getByRole("dialog", { name: DIALOG_NAME });
  await expect(dialog).toHaveCount(0);
  await expect(app).toHaveAttribute("data-scene-id", "potting-workbench");
  await expect(app).toHaveAttribute("data-semantic-transition-state", "idle");

  // Additional inward wheel samples at the hard spatial ceiling must remain
  // inert rather than opening a second plane behind the learner's back.
  for (let index = 0; index < 3; index += 1) await wheelSceneAt(page, point, -240);
  await page.waitForTimeout(300);
  await expect(dialog).toHaveCount(0);
  await expect(app).toHaveAttribute("data-scene-id", "potting-workbench");
  await expect(progress).toHaveAttribute("data-next-plane", "spatial-terminal");
});
