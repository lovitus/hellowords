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
  // A previous wheel impulse may finish the scene return between the
  // visibility assertion and this geometry read. In that case the active
  // viewport has legitimately unmounted; the surrounding poll will observe
  // the returned parent on its next iteration.
  if (!bounds) return;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, deltaY);
}

async function dispatchWheelSegmentAtViewportCenter(
  page: Page,
  deltaY: number,
  impulses: number,
) {
  const viewport = page.locator(`.viewer-shell:not([data-phase]) ${VIEWPORT}`);
  await expect(viewport).toBeVisible();
  await viewport.evaluate((element, input) => {
    const bounds = element.getBoundingClientRect();
    for (let impulse = 0; impulse < input.impulses; impulse += 1) {
      element.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
        deltaY: input.deltaY,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      }));
    }
  }, { deltaY, impulses });
}

async function returnToParentWithIndependentWheelGestures(
  page: Page,
  app: Locator,
  child: string,
  parent: string,
) {
  const surface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  const interactionLayer = page.locator(
    ".viewer-shell:not([data-phase]) [data-testid='scene-interaction-layer']",
  );

  await expect(page.locator(".viewer-shell[data-phase]")).toHaveCount(0);
  await expect(interactionLayer).toHaveAttribute("data-motion-frozen", "false");
  await expect.poll(async () => Number(await surface.getAttribute("data-scene-scale")), {
    message: "the child must finish its fitted handoff before exit gestures begin",
  }).toBeCloseTo(1, 2);

  // The handoff guard and the parent-exit latch both distinguish one physical
  // wheel stream from a later, deliberate gesture. Let the handoff tail go
  // quiet, use one continuous segment to arm the child overview, then start a
  // second stream. Several bounded impulses make the physical gesture
  // equivalent across desktop and emulated high-DPR mobile wheel delivery.
  await page.waitForTimeout(220);
  await dispatchWheelSegmentAtViewportCenter(page, 120, 6);
  await expect.poll(async () => Number(await surface.getAttribute("data-scene-scale")), {
    message: "the first outward gesture must settle in the armed child overview band",
  }).toBeLessThanOrEqual(0.7);
  await expect(app).toHaveAttribute("data-scene-id", child);

  await page.waitForTimeout(220);
  await dispatchWheelSegmentAtViewportCenter(page, 120, 1);
  await expect.poll(() => currentScene(app), {
    message: "a fresh second outward gesture must return to the retained parent",
  }).toBe(parent);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
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
  const parentAssetContract = await page.evaluate(async (sceneId) => {
    const response = await fetch(`/data/scenes/${sceneId}.json`);
    if (!response.ok) throw new Error(`Unable to read scene ${sceneId}`);
    const scene = await response.json() as {
      asset: string;
      assets?: { base: { src: string }; high?: { src: string } };
    };
    return {
      manifest: `/data/scenes/${sceneId}.json`,
      base: new URL(scene.assets?.base.src ?? scene.asset, window.location.href).pathname,
      high: scene.assets?.high
        ? new URL(scene.assets.high.src, window.location.href).pathname
        : null,
    };
  }, parent);
  expect(parentAsset).toBe(parentAssetContract.base);
  const child = await activateFirstPortal(page, app);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(".viewer-shell[data-phase]")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(({ appSelector, childScene }) => {
    const world = document.querySelector<HTMLElement>(appSelector);
    const surface = document.querySelector<HTMLElement>(
      ".viewer-shell:not([data-phase]) .scene-surface",
    );
    const scale = Number(surface?.dataset.sceneScale);
    return world?.dataset.sceneId === childScene && Number.isFinite(scale) ? scale : 0;
  }, { appSelector: APP, childScene: child }), {
    message: "the final active child must already be hot before it reaches its exit scale",
  }).toBeGreaterThan(0.82);
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

  await returnToParentWithIndependentWheelGestures(page, app, child, parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");

  const firstReturnRequests = sceneRequests.slice(requestsBeforeReturn).map((url) => new URL(url).pathname);
  expect(
    firstReturnRequests.filter((path) => (
      path === parentAssetContract.manifest || path === parentAssetContract.base
    )),
    "returning to the retained parent must not refetch its manifest or already-hot base image",
  ).toEqual([]);
  const firstHighRequests = parentAssetContract.high
    ? firstReturnRequests.filter((path) => path === parentAssetContract.high)
    : [];
  expect(
    firstReturnRequests.filter((path) => path !== parentAssetContract.high),
    "the first return may only add the high-density parent tier required by the restored camera",
  ).toEqual([]);
  expect(firstHighRequests.length, "a high-density parent tier is fetched at most once on demand")
    .toBeLessThanOrEqual(1);
  expect(
    await page.evaluate((assetPath) => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
        .filter((url) => new URL(url, window.location.href).pathname === assetPath)
        .length
    ), parentAsset),
    "returning to the retained parent must not decode its image again",
  ).toBe(parentDecodesBeforeReturn);

  if (firstHighRequests.length > 0) {
    await expect.poll(() => page.evaluate((assetPath) => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
        .filter((url) => new URL(url, window.location.href).pathname === assetPath)
        .length
    ), parentAssetContract.high as string), {
      message: "an on-demand high-density request must enter the decode pipeline",
    }).toBeGreaterThan(0);
  }
  const parentHighDecodesAfterFirstReturn = parentAssetContract.high
    ? await page.evaluate((assetPath) => (
        (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
          .filter((url) => new URL(url, window.location.href).pathname === assetPath)
          .length
      ), parentAssetContract.high)
    : 0;

  const requestsBeforeSecondRoundTrip = sceneRequests.length;
  const secondChild = await activateFirstPortal(page, app);
  expect(secondChild).toBe(child);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await returnToParentWithIndependentWheelGestures(page, app, child, parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");

  expect(
    sceneRequests.slice(requestsBeforeSecondRoundTrip)
      .map((url) => new URL(url).pathname)
      .filter((path) => (
        path === parentAssetContract.manifest
        || path === parentAssetContract.base
        || path === parentAssetContract.high
      )),
    "a second round trip must reuse the parent manifest, hot base image, and on-demand high tier",
  ).toEqual([]);
  expect(
    await page.evaluate((assetPath) => (
      (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
        .filter((url) => new URL(url, window.location.href).pathname === assetPath)
        .length
    ), parentAsset),
    "repeated round trips must keep the parent base decode hot",
  ).toBe(parentDecodesBeforeReturn);
  if (parentAssetContract.high) {
    expect(
      await page.evaluate((assetPath) => (
        (Reflect.get(window, "__hellowordsDecodeCalls") as string[])
          .filter((url) => new URL(url, window.location.href).pathname === assetPath)
          .length
      ), parentAssetContract.high),
      "a keyed parent SceneViewport remount must reuse the shared decoded high tier",
    ).toBe(parentHighDecodesAfterFirstReturn);
  }
});

test("world-map wheel continuity settles apartment before a deliberate second-step exit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop fit geometry has a distinct mobile scale");
  const app = await openWorld(page);
  await expect(app).toHaveAttribute("data-scene-id", "world-map");

  const apartmentPortal = page.locator(`${HOTSPOT}[data-target-scene="apartment"]`);
  await expect(apartmentPortal).toBeVisible();
  const portalBounds = await apartmentPortal.boundingBox();
  expect(portalBounds).not.toBeNull();

  // A real trackpad keeps emitting impulses after the keyed child mounts.
  // Send those on consecutive child frames: scene idle is too early to prove
  // that the 110ms continuity camera has reached its fitted overview.
  await page.evaluate(() => {
    const appElement = document.querySelector<HTMLElement>('[data-testid="world-app"]');
    if (!appElement) throw new Error("world app is required");
    const trace = { fired: 0 };
    const observer = new MutationObserver(() => {
      if (appElement.dataset.sceneId !== "apartment" || trace.fired > 0) return;
      observer.disconnect();
      const emitImpulse = () => {
        const viewport = document.querySelector<HTMLElement>(
          '.viewer-shell:not([data-phase]) [data-testid="world-viewport"]',
        );
        if (!viewport) {
          requestAnimationFrame(emitImpulse);
          return;
        }
        const bounds = viewport.getBoundingClientRect();
        viewport.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
          deltaY: -96,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        }));
        trace.fired += 1;
        if (trace.fired < 5) requestAnimationFrame(emitImpulse);
      };
      requestAnimationFrame(emitImpulse);
    });
    observer.observe(appElement, { attributes: true, attributeFilter: ["data-scene-id"] });
    Reflect.set(window, "__hellowordsApartmentInertia", { trace, observer });
  });

  await page.mouse.move(
    portalBounds!.x + portalBounds!.width / 2,
    portalBounds!.y + portalBounds!.height / 2,
  );
  for (let impulse = 0; impulse < 16; impulse += 1) {
    if (await app.getAttribute("data-scene-id") !== "world-map") break;
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(12);
  }
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect.poll(() => page.evaluate(() => (
    (Reflect.get(window, "__hellowordsApartmentInertia") as { trace: { fired: number } }).trace.fired
  ))).toBe(5);

  const activeViewer = page.locator(".viewer-shell:not([data-phase])");
  const labelLayer = activeViewer.getByTestId("scene-label-layer");
  const interactionLayer = activeViewer.getByTestId("scene-interaction-layer");
  await expect(labelLayer).toHaveAttribute("data-motion-frozen", "false");
  await expect(interactionLayer).toHaveAttribute("data-motion-frozen", "false");

  const surface = activeViewer.locator(".scene-surface");
  await expect.poll(async () => Number(await surface.getAttribute("data-scene-scale")), {
    message: "the child must finish at its fitted overview after inertial input is rejected",
  }).toBeCloseTo(1, 2);
  const fitted = await activeViewer.evaluate((viewer) => {
    const viewport = viewer.querySelector<HTMLElement>('[data-testid="world-viewport"]');
    const art = viewer.querySelector<HTMLElement>(".scene-art");
    if (!viewport || !art) throw new Error("active apartment geometry is required");
    const viewportBounds = viewport.getBoundingClientRect();
    const artBounds = art.getBoundingClientRect();
    return {
      viewport: {
        left: viewportBounds.left,
        right: viewportBounds.right,
        top: viewportBounds.top,
        bottom: viewportBounds.bottom,
        width: viewportBounds.width,
        height: viewportBounds.height,
      },
      art: {
        left: artBounds.left,
        right: artBounds.right,
        top: artBounds.top,
        bottom: artBounds.bottom,
        width: artBounds.width,
        height: artBounds.height,
      },
    };
  });
  expect(fitted.art.left).toBeGreaterThanOrEqual(fitted.viewport.left - 2);
  expect(fitted.art.right).toBeLessThanOrEqual(fitted.viewport.right + 2);
  expect(fitted.art.top).toBeGreaterThanOrEqual(fitted.viewport.top - 2);
  expect(fitted.art.bottom).toBeLessThanOrEqual(fitted.viewport.bottom + 2);
  expect(
    Math.abs(fitted.art.width - fitted.viewport.width) <= 2
      || Math.abs(fitted.art.height - fitted.viewport.height) <= 2,
    "the complete apartment fits inside the viewport with one contain axis filled",
  ).toBe(true);

  // The five synthetic inertial samples above extend the handoff wheel guard.
  // Start the deliberate outward notch only after a genuine quiet interval;
  // assertion/runtime speed must not decide whether that notch is swallowed.
  await page.waitForTimeout(220);
  await wheelAtViewportCenter(page, 120);
  await expect.poll(async () => {
    if (await app.getAttribute("data-scene-id") !== "apartment") return false;
    const scale = Number(await surface.getAttribute("data-scene-scale"));
    return scale >= 0.805 && scale <= 0.825;
  }, { message: "one ordinary wheel notch keeps the fitted apartment open" }).toBe(true);

  await startLoaderTrace(page);
  await wheelAtViewportCenter(page, 120);
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  expect(await finishLoaderTrace(page), "the retained world map returns warm without a loader").toBe(false);
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
  const parentBreadcrumb = page.locator(
    `[data-testid="scene-minimap-breadcrumb"][data-scene-id="${parent}"][data-current="false"]`,
  );
  await expect(parentBreadcrumb).toHaveRole("button");
  await expect(parentBreadcrumb).toHaveAccessibleName(
    parent === "world-map" ? "World atlas" : parent,
  );
  await parentBreadcrumb.click();
  await expect(app).toHaveAttribute("data-scene-id", parent);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(".loading-pill")).toBeHidden();
});
