import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const HOTSPOT = '[data-testid="scene-hotspot"]';

async function openWorld(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).not.toHaveAttribute("data-scene-id", /^(?:|loading)$/);
  return app;
}

async function currentScene(app: Locator) {
  const id = await app.getAttribute("data-scene-id");
  expect(id).toBeTruthy();
  return id as string;
}

async function activateFirstPortal(page: Page, app: Locator) {
  const portal = page.locator(HOTSPOT).first();
  await expect(portal).toBeVisible();
  const target = await portal.getAttribute("data-target-scene");
  expect(target).toBeTruthy();
  await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", target as string);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  return target as string;
}

async function wheelAtViewportCenter(page: Page, deltaY: number) {
  const bounds = await page.locator(VIEWPORT).boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, deltaY);
}

async function startLoaderTrace(page: Page) {
  await page.evaluate(() => {
    const trace = { appeared: Boolean(document.querySelector(".loading-pill")) };
    const observer = new MutationObserver(() => {
      if (document.querySelector(".loading-pill")) trace.appeared = true;
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    Reflect.set(window, "__hellowordsLoaderTrace", { trace, observer });
  });
}

async function finishLoaderTrace(page: Page) {
  return page.evaluate(() => {
    const probe = Reflect.get(window, "__hellowordsLoaderTrace") as {
      trace: { appeared: boolean };
      observer: MutationObserver;
    };
    probe.observer.disconnect();
    return probe.trace.appeared;
  });
}

test("a decoded parent stays hot when entering a child and zooming back out", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode;
    const decodeCalls: string[] = [];
    Reflect.set(window, "__hellowordsDecodeCalls", decodeCalls);
    HTMLImageElement.prototype.decode = function decode() {
      decodeCalls.push(this.currentSrc || this.src);
      return nativeDecode.call(this);
    };
  });

  const sceneRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/(?:data\/scenes\/[^/]+\.json|scenes\/[^/]+\.(?:svg|jpe?g|webp|avif))(?:\?|$)/.test(request.url())) {
      sceneRequests.push(request.url());
    }
  });

  const app = await openWorld(page);
  const parent = await currentScene(app);
  const parentAsset = new URL(await page.locator(".scene-art").getAttribute("src") as string, page.url()).pathname;
  await activateFirstPortal(page, app);
  const childScaleBeforeExit = Number(await page.locator(".scene-surface").getAttribute("data-scene-scale"));
  expect(childScaleBeforeExit, "the parent must already be hot before the child reaches its exit scale").toBeGreaterThan(0.82);
  const requestsBeforeReturn = sceneRequests.length;
  const decodesBeforeReturn = await page.evaluate(() => (
    (Reflect.get(window, "__hellowordsDecodeCalls") as string[]).length
  ));
  expect(
    await page.evaluate((assetPath) => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
        .some((url) => new URL(url, window.location.href).pathname === assetPath)
    ), parentAsset),
    "the decoded parent image remains resident before zoom-out crosses the exit threshold",
  ).toBe(true);

  await expect.poll(async () => {
    if (await currentScene(app) !== parent) await wheelAtViewportCenter(page, 120);
    return currentScene(app);
  }, { intervals: [80], timeout: 5_000 }).toBe(parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");

  expect(
    sceneRequests.slice(requestsBeforeReturn),
    "returning to the retained parent must not fetch scene JSON or its image again",
  ).toEqual([]);
  expect(
    await page.evaluate(() => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[]).length
    )),
    "returning to the retained parent must not decode its image again",
  ).toBe(decodesBeforeReturn);
});

test("continuous wheel input advances in monotonic animation frames without a scale jump", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await openWorld(page);
  const surface = page.locator(".scene-surface");
  const initialScale = Number(await surface.getAttribute("data-scene-scale"));
  const samples = await page.evaluate(async ({ viewportSelector, surfaceSelector }) => {
    const viewport = document.querySelector<HTMLElement>(viewportSelector);
    const sceneSurface = document.querySelector<HTMLElement>(surfaceSelector);
    if (!viewport || !sceneSurface) throw new Error("scene camera is required");
    const rect = viewport.getBoundingClientRect();
    const values: number[] = [];
    let sampling = true;
    const sample = () => {
      values.push(Number(sceneSurface.dataset.sceneScale));
      if (sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    for (let index = 0; index < 10; index += 1) {
      viewport.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: -36,
      }));
    }
    await new Promise((resolve) => setTimeout(resolve, 420));
    sampling = false;
    return values.filter(Number.isFinite);
  }, { viewportSelector: VIEWPORT, surfaceSelector: ".scene-surface" });

  expect(samples.length, "wheel momentum should render across several animation frames").toBeGreaterThanOrEqual(6);
  expect(samples.at(-1)).toBeGreaterThan(initialScale);
  for (let index = 1; index < samples.length; index += 1) {
    expect(samples[index], "zoom-in frames cannot reverse direction").toBeGreaterThanOrEqual(samples[index - 1] - 0.001);
    expect(
      Math.abs(Math.log(samples[index] / samples[index - 1])),
      "one animation frame cannot consume the entire accumulated wheel gesture",
    ).toBeLessThanOrEqual(0.18);
  }
});

test("continuous input prepares one preferred child only once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  const sceneDataRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/data\/scenes\/[^/]+\.json(?:\?|$)/.test(request.url())) {
      sceneDataRequests.push(request.url());
    }
  });
  const app = await openWorld(page);
  const portal = page.locator(HOTSPOT).first();
  const target = await portal.getAttribute("data-target-scene");
  expect(target).toBeTruthy();

  const box = await portal.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let index = 0; index < 36 && await currentScene(app) !== target; index += 1) {
    await page.mouse.wheel(0, -18);
  }
  const targetRequests = sceneDataRequests.filter((url) => (
    new URL(url).pathname === `/data/scenes/${target}.json`
  ));
  expect(
    targetRequests,
    "wheel, preview and navigation may share one in-flight prepare but cannot start duplicates",
  ).toHaveLength(1);
});

test("a warm adjacent transition avoids the loader, while outrunning the neighbor cache reveals it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  const uniqueScenes = new Set<string>();
  await page.route("**/data/scenes/*.json", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/manifest.json")) return route.continue();
    uniqueScenes.add(path);
    if (uniqueScenes.size >= 3) await new Promise((resolve) => setTimeout(resolve, 650));
    return route.continue();
  });
  const app = await openWorld(page);
  await expect(page.locator(".loading-pill")).toBeHidden();

  await page.waitForTimeout(800);
  await startLoaderTrace(page);
  const child = await activateFirstPortal(page, app);
  expect(await finishLoaderTrace(page), "an adjacent decoded child switches without a loader flash").toBe(false);
  await expect(page.locator(".loading-pill")).toBeHidden();
  const grandchildPortal = page.locator(HOTSPOT).first();
  const grandchild = await grandchildPortal.getAttribute("data-target-scene");
  expect(grandchild).toBeTruthy();

  await grandchildPortal.click();
  await expect(app).toHaveAttribute("data-scene-id", child);
  await expect(page.locator(".loading-pill")).toBeVisible({ timeout: 300 });
  await expect(app).toHaveAttribute("data-scene-id", grandchild as string);
  await expect(page.locator(".loading-pill")).toBeHidden();
});

test("reduced motion and keyboard navigation preserve the warm parent path", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = await openWorld(page);
  const parent = await currentScene(app);
  const portal = page.locator(HOTSPOT).first();
  const child = await portal.getAttribute("data-target-scene");
  expect(child).toBeTruthy();

  await portal.focus();
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene-id", child as string);
  await page.getByRole("button", { name: parent === "world-map" ? "World atlas" : parent }).click();
  await expect(app).toHaveAttribute("data-scene-id", parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(".loading-pill")).toBeHidden();
});
