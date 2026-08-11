import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const HOTSPOT = '[data-testid="scene-hotspot"]';

type TransitionCacheTrace = {
  states: Array<{ cache: string | null; loading: string | null }>;
  settled: Array<{
    cache: "warm" | "cold";
    commitMs: number;
    durationMs: number;
    observedCache: string | null;
    observedLoading: string | null;
  }>;
};

async function openWorld(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).not.toHaveAttribute("data-scene-id", /^(?:|loading)$/);
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
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
  const viewport = page.locator(`.viewer-shell:not([data-phase]) ${VIEWPORT}`);
  await expect(viewport).toBeVisible();
  const bounds = await viewport.boundingBox();
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

async function startTransitionCacheTrace(page: Page) {
  await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('[data-testid="world-app"]');
    if (!app) throw new Error("world app is required for a transition cache trace");
    const trace: TransitionCacheTrace = {
      states: [{ cache: app.dataset.transitionCache ?? null, loading: app.dataset.sceneLoading ?? null }],
      settled: [],
    };
    const observer = new MutationObserver(() => {
      trace.states.push({
        cache: app.dataset.transitionCache ?? null,
        loading: app.dataset.sceneLoading ?? null,
      });
    });
    observer.observe(app, {
      attributes: true,
      attributeFilter: ["data-transition-cache", "data-scene-loading"],
    });
    const onSettled = (event: WindowEventMap["world:scene-settled"]) => {
      trace.settled.push({
        cache: event.detail.cache,
        commitMs: event.detail.commitMs,
        durationMs: event.detail.durationMs,
        observedCache: app.dataset.transitionCache ?? null,
        observedLoading: app.dataset.sceneLoading ?? null,
      });
    };
    window.addEventListener("world:scene-settled", onSettled);
    Reflect.set(window, "__hellowordsTransitionCacheTrace", { trace, observer, onSettled });
  });
}

async function finishTransitionCacheTrace(page: Page): Promise<TransitionCacheTrace> {
  await expect.poll(() => page.evaluate(() => (
    (Reflect.get(window, "__hellowordsTransitionCacheTrace") as { trace: TransitionCacheTrace })
      .trace.settled.length
  ))).toBeGreaterThan(0);
  return page.evaluate(() => {
    const probe = Reflect.get(window, "__hellowordsTransitionCacheTrace") as {
      trace: TransitionCacheTrace;
      observer: MutationObserver;
      onSettled: (event: WindowEventMap["world:scene-settled"]) => void;
    };
    probe.observer.disconnect();
    window.removeEventListener("world:scene-settled", probe.onSettled);
    return probe.trace;
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
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const activeChildSurface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  await expect(activeChildSurface).toHaveAttribute("data-scene-scale", /^\d+(?:\.\d+)?$/);
  const childScaleBeforeExit = Number(await activeChildSurface.getAttribute("data-scene-scale"));
  expect(childScaleBeforeExit, "the parent must already be hot before the child reaches its exit scale").toBeGreaterThan(0.82);
  const requestsBeforeReturn = sceneRequests.length;
  const parentDecodesBeforeReturn = await page.evaluate((assetPath) => (
    (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
      .filter((url) => new URL(url, window.location.href).pathname === assetPath)
      .length
  ), parentAsset);
  expect(parentDecodesBeforeReturn, "the parent image must be decoded before entering its child").toBeGreaterThan(0);
  expect(
    await page.evaluate((assetPath) => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
        .some((url) => new URL(url, window.location.href).pathname === assetPath)
    ), parentAsset),
    "the decoded parent image remains resident before zoom-out crosses the exit threshold",
  ).toBe(true);

  await expect.poll(async () => {
    const sceneId = await currentScene(app);
    const transitionState = await app.getAttribute("data-transition-state");
    if (sceneId !== parent && transitionState === "idle") {
      await wheelAtViewportCenter(page, 120);
    }
    return sceneId;
  }, { intervals: [80], timeout: 5_000 }).toBe(parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");

  expect(
    sceneRequests.slice(requestsBeforeReturn),
    "returning to the retained parent must not fetch scene JSON or its image again",
  ).toEqual([]);
  expect(
    await page.evaluate((assetPath) => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
        .filter((url) => new URL(url, window.location.href).pathname === assetPath)
        .length
    ), parentAsset),
    "returning to the retained parent must not decode its image again",
  ).toBe(parentDecodesBeforeReturn);
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
    const values: Array<{ scale: number; time: number }> = [{
      scale: Number(sceneSurface.dataset.sceneScale),
      time: performance.now(),
    }];
    let sampling = true;
    const sample = (time: number) => {
      values.push({ scale: Number(sceneSurface.dataset.sceneScale), time });
      if (sampling) requestAnimationFrame(sample);
    };
    for (let index = 0; index < 10; index += 1) {
      viewport.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: -36,
      }));
    }
    // The first wheel event schedules the production camera writer. Register
    // the probe afterwards so each sample observes that frame's completed
    // camera update; otherwise a dropped writer frame can be attributed to the
    // following short sampler interval and inflate its 60 Hz-equivalent step.
    requestAnimationFrame(sample);
    await new Promise((resolve) => setTimeout(resolve, 420));
    sampling = false;
    return values.filter(({ scale, time }) => Number.isFinite(scale) && Number.isFinite(time));
  }, { viewportSelector: VIEWPORT, surfaceSelector: ".scene-surface" });

  expect(samples.length, "wheel momentum should render across several animation frames").toBeGreaterThanOrEqual(6);
  expect(samples.at(-1)?.scale).toBeGreaterThan(initialScale);
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    expect(current.scale, "zoom-in frames cannot reverse direction").toBeGreaterThanOrEqual(previous.scale - 0.001);
    const logarithmicStep = Math.abs(Math.log(current.scale / previous.scale));
    const elapsedFrameEquivalents = Math.max(1, (current.time - previous.time) / (1_000 / 60));
    expect(
      logarithmicStep / elapsedFrameEquivalents,
      "wheel momentum stays within the 60 Hz-equivalent smoothing budget",
    ).toBeLessThanOrEqual(0.18);
    expect(
      logarithmicStep,
      "even a delayed animation frame cannot consume the entire accumulated wheel gesture",
    ).toBeLessThanOrEqual(0.32);
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
  await startTransitionCacheTrace(page);
  const child = await activateFirstPortal(page, app);
  expect(await finishLoaderTrace(page), "an adjacent decoded child switches without a loader flash").toBe(false);
  const warmTrace = await finishTransitionCacheTrace(page);
  expect(warmTrace.states.some(({ cache }) => cache === "warm")).toBe(true);
  expect(warmTrace.states.some(({ loading }) => loading === "true")).toBe(false);
  expect(warmTrace.settled).toHaveLength(1);
  expect(warmTrace.settled[0]).toMatchObject({
    cache: "warm",
    observedCache: "warm",
    observedLoading: "false",
  });
  expect(
    warmTrace.settled[0].commitMs,
    "a warm child commits after the short continuous portal-cover zoom",
  ).toBeGreaterThanOrEqual(150);
  expect(warmTrace.settled[0].commitMs).toBeLessThan(550);
  await expect(app).toHaveAttribute("data-transition-cache", "idle");
  await expect(page.locator(".loading-pill")).toBeHidden();
  const grandchildPortal = page.locator(HOTSPOT).first();
  const grandchild = await grandchildPortal.getAttribute("data-target-scene");
  expect(grandchild).toBeTruthy();

  await startTransitionCacheTrace(page);
  await grandchildPortal.click();
  await expect(app).toHaveAttribute("data-scene-id", child);
  await expect(page.locator(".loading-pill")).toBeVisible({ timeout: 300 });
  await expect(app).toHaveAttribute("data-scene-id", grandchild as string);
  await expect(page.locator(".loading-pill")).toBeHidden();
  const coldTrace = await finishTransitionCacheTrace(page);
  expect(coldTrace.states.some(({ cache }) => cache === "cold")).toBe(true);
  expect(coldTrace.states.some(({ loading }) => loading === "true")).toBe(true);
  expect(coldTrace.settled).toHaveLength(1);
  expect(coldTrace.settled[0]).toMatchObject({
    cache: "cold",
    observedCache: "cold",
    observedLoading: "false",
  });
  await expect(app).toHaveAttribute("data-transition-cache", "idle");
});

test("mobile keeps its warmed child and parent transitions free of a loader flash", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  const app = await openWorld(page);
  const parent = await currentScene(app);
  await expect(page.locator(".loading-pill")).toBeHidden();

  await page.waitForTimeout(800);
  await startLoaderTrace(page);
  await startTransitionCacheTrace(page);
  const child = await activateFirstPortal(page, app);
  expect(child).not.toBe(parent);
  expect(await finishLoaderTrace(page), "the warmed mobile child must not flash a loader").toBe(false);
  const childTrace = await finishTransitionCacheTrace(page);
  expect(childTrace.settled).toHaveLength(1);
  expect(childTrace.settled[0]).toMatchObject({
    cache: "warm",
    observedCache: "warm",
    observedLoading: "false",
  });
  expect(childTrace.settled[0].commitMs).toBeGreaterThanOrEqual(150);
  expect(childTrace.settled[0].commitMs).toBeLessThan(550);
  await expect(app).toHaveAttribute("data-transition-cache", "idle");

  await startLoaderTrace(page);
  await startTransitionCacheTrace(page);
  await page.getByRole("button", { name: "← 返回上一层" }).click();
  await expect(app).toHaveAttribute("data-scene-id", parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  expect(await finishLoaderTrace(page), "the retained mobile parent must not flash a loader").toBe(false);
  const parentTrace = await finishTransitionCacheTrace(page);
  expect(parentTrace.settled).toHaveLength(1);
  expect(parentTrace.settled[0]).toMatchObject({
    cache: "warm",
    observedCache: "warm",
    observedLoading: "false",
  });
  expect(parentTrace.settled[0].commitMs).toBeLessThan(50);
  await expect(app).toHaveAttribute("data-transition-cache", "idle");
});

test("reduced motion and keyboard navigation preserve the warm parent path", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = await openWorld(page);
  const parent = await currentScene(app);
  const portal = page.locator(HOTSPOT).first();
  await expect(portal).toBeVisible();
  const child = await portal.getAttribute("data-target-scene");
  expect(child).toBeTruthy();

  await portal.focus();
  await expect(portal).toBeFocused();
  await portal.press("Enter");
  await expect(app).toHaveAttribute("data-scene-id", child as string);
  await page.getByRole("button", { name: parent === "world-map" ? "World atlas" : parent }).click();
  await expect(app).toHaveAttribute("data-scene-id", parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(".loading-pill")).toBeHidden();
});
