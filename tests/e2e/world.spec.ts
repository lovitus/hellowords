import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';

async function openWorld(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).not.toHaveAttribute("data-scene-id", "");
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  return app;
}

async function sceneId(app: Locator) {
  const id = await app.getAttribute("data-scene-id");
  expect(id, "world-app must expose a non-empty data-scene-id").toBeTruthy();
  return id as string;
}

async function zoomIntoFirstHotspot(page: Page, app: Locator) {
  const hotspot = page.locator('[data-testid="scene-hotspot"]').first();
  await expect(hotspot).toBeVisible();
  const target = await hotspot.getAttribute("data-target-scene");
  expect(target, "scene hotspots must expose data-target-scene").toBeTruthy();

  const box = await hotspot.boundingBox();
  expect(box, "the first scene hotspot must have a rendered hit area").not.toBeNull();
  await hotspot.click();
  const viewport = page.locator(VIEWPORT);
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(
    viewportBox!.x + viewportBox!.width / 2,
    viewportBox!.y + viewportBox!.height / 2,
  );

  await expect
    .poll(
      async () => {
        if ((await app.getAttribute("data-scene-id")) !== target) {
          await page.mouse.wheel(0, -24);
        }
        return app.getAttribute("data-scene-id");
      },
      { intervals: [220], timeout: 8_000 },
    )
    .toBe(target);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  return target as string;
}

async function zoomOutTo(page: Page, app: Locator, target: string) {
  const viewport = page.locator(VIEWPORT);
  const box = await viewport.boundingBox();
  expect(box, "world viewport must have a rendered hit area").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect
    .poll(
      async () => {
        if ((await app.getAttribute("data-scene-id")) !== target) {
          await page.mouse.wheel(0, 120);
        }
        return app.getAttribute("data-scene-id");
      },
      { intervals: [220], timeout: 8_000 },
    )
    .toBe(target);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
}

test("starts as a calm target-language world and persists the meaning toggle", async ({
  page,
}) => {
  await openWorld(page);

  const toggle = page.getByTestId("meaning-toggle");
  const translations = page.getByTestId("word-translation");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(translations.first()).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(translations.first()).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("word-translation").first()).toBeVisible();
});

test("loads the 10,000-word atlas only when requested and searches it", async ({ page }) => {
  const vocabularyRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/data/vocabulary/rank-")) vocabularyRequests.push(request.url());
  });
  await openWorld(page);
  expect(vocabularyRequests).toHaveLength(0);

  await page.getByRole("button", { name: /10,000\+ 词汇地图/ }).click();
  await expect(page.getByText("10,000 个常用词，按需载入")).toBeVisible();
  const search = page.getByPlaceholder("搜索英文或中文…");
  await search.fill("coffee");
  await expect(page.locator(".atlas-results li").first()).toContainText(/coffee/i);
  expect(vocabularyRequests).toHaveLength(10);
});

test("enters a scene slice on zoom and returns to its parent", async ({ page }) => {
  const requestedSceneAssets: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (/\/scenes\/.*\.(?:svg|webp|avif)(?:\?|$)/.test(url)) {
      requestedSceneAssets.push(url);
    }
  });

  const app = await openWorld(page);
  const parent = await sceneId(app);
  const child = await zoomIntoFirstHotspot(page, app);
  expect(child).not.toBe(parent);
  await expect(page.getByTestId("word-label").first()).toBeVisible();

  await zoomOutTo(page, app, parent);
  expect(await sceneId(app)).toBe(parent);

  const requestCount = requestedSceneAssets.length;
  await zoomIntoFirstHotspot(page, app);
  await zoomOutTo(page, app, parent);
  expect(
    requestedSceneAssets.length,
    "revisiting the same child must reuse its scene asset",
  ).toBe(requestCount);
});

test("hysteresis prevents scene thrashing near a zoom boundary", async ({ page }) => {
  const app = await openWorld(page);
  const parent = await sceneId(app);
  const child = await zoomIntoFirstHotspot(page, app);
  const observed: string[] = [];

  const viewport = page.locator(VIEWPORT);
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  for (let index = 0; index < 50; index += 1) {
    await page.mouse.wheel(0, index % 2 === 0 ? 24 : -24);
    observed.push(await sceneId(app));
  }

  expect(new Set(observed)).toEqual(new Set([child]));
  await zoomOutTo(page, app, parent);
});

test("mobile viewport exposes touch-safe labels and hotspots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await openWorld(page);
  await expect(page.getByTestId("word-label").first()).toBeVisible();
  const hotspot = page.getByTestId("scene-hotspot").first();
  await expect(hotspot).toBeVisible();
  const box = await hotspot.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(32);
});
