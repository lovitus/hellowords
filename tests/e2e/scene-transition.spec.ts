import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const HOTSPOT = '[data-testid="scene-hotspot"]';
const PREVIEW = '[data-testid="scene-portal-preview"]';
const TRANSITION_LAYER = '[data-testid="scene-transition-layer"]';
const TRANSITION_TRACE_KEY = "__hellowordsSceneTransitionTrace";

interface TransitionLayerTrace {
  phase: string | null;
  sceneId: string | null;
  ariaHidden: string | null;
  inert: boolean;
  cameraScale: number | null;
  transform: string;
  animationName: string;
  maximumMotionDurationMs: number;
}

interface TransitionSnapshot {
  state: string | null;
  layers: TransitionLayerTrace[];
  activeShellInert: boolean | null;
  activeShellAriaHidden: string | null;
  veilTransform: string | null;
  veilAnimationName: string | null;
}

interface SceneManifest {
  scenes: Array<{ id: string; title: string }>;
}

function desktopOnly(projectName: string) {
  test.skip(projectName === "mobile-chromium", "layer timing and keyboard coverage run in the desktop project");
}

async function openWorld(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(app).not.toHaveAttribute("data-scene-id", /^(?:|loading)$/);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  return app;
}

async function holdPreferredChildPreparation(
  page: Page,
  allowedSceneIds: readonly string[] = [],
) {
  let releasePreparation!: () => void;
  const preparationHeld = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  const allowedPaths = new Set(allowedSceneIds.map((sceneId) => `/data/scenes/${sceneId}.json`));
  await page.route("**/data/scenes/*.json", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path.endsWith("/manifest.json")
      || path.endsWith("/world-map.json")
      || [...allowedPaths].some((allowedPath) => path.endsWith(allowedPath))
    ) {
      return route.continue();
    }
    await preparationHeld;
    return route.continue();
  });
  return releasePreparation;
}

async function targetScene(hotspot: Locator) {
  const target = await hotspot.getAttribute("data-target-scene");
  expect(target, "a portal must identify the scene it will enter").toBeTruthy();
  return target as string;
}

async function sceneTitle(page: Page, sceneId: string) {
  const title = await page.evaluate(async (targetId) => {
    const response = await fetch("/data/scenes/manifest.json");
    if (!response.ok) throw new Error("scene manifest is required for the portal contract");
    const manifest = (await response.json()) as SceneManifest;
    return manifest.scenes.find((scene) => scene.id === targetId)?.title ?? null;
  }, sceneId);
  expect(title, `the portal target ${sceneId} must exist in the manifest`).toBeTruthy();
  return title as string;
}

async function focusedPortalPreview(page: Page) {
  const hotspot = page.locator(HOTSPOT).first();
  const target = await targetScene(hotspot);
  const title = await sceneTitle(page, target);
  await expect(hotspot).toBeVisible();
  await hotspot.focus();
  await expect(hotspot).toBeFocused();

  const preview = page.locator(PREVIEW);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-target-scene", target);
  await expect(preview).toHaveAttribute("data-portal-id", /\S+/);
  await expect(preview).toHaveAttribute("data-phase", /^(?:preview|armed)$/);
  await expect(preview).toHaveAttribute("data-progress", /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/);
  await expect(preview).toHaveAttribute("aria-live", "polite");
  await expect(preview).toContainText(title, { ignoreCase: true });

  const previewId = await preview.getAttribute("id");
  expect(previewId, "the preview needs an id so the focused portal can describe itself").toBeTruthy();
  const describedBy = (await hotspot.getAttribute("aria-describedby"))?.split(/\s+/) ?? [];
  expect(describedBy, "the focused portal must expose its target hint to assistive technology").toContain(previewId);

  return { hotspot, preview, target, title };
}

async function nextPaint(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function portalPreviewState(page: Page) {
  return page.evaluate((selector) => {
    const preview = document.querySelector<HTMLElement>(selector);
    return preview ? {
      phase: preview.dataset.phase ?? null,
      progress: preview.dataset.progress ?? null,
    } : null;
  }, PREVIEW);
}

async function beginTransitionTrace(page: Page) {
  await page.evaluate(({ appSelector, layerSelector, traceKey }) => {
    const durationMilliseconds = (value: string) => Math.max(
      0,
      ...value.split(",").map((part) => {
        const duration = part.trim();
        if (duration.endsWith("ms")) return Number.parseFloat(duration);
        if (duration.endsWith("s")) return Number.parseFloat(duration) * 1_000;
        return 0;
      }),
    );
    const snapshots: TransitionSnapshot[] = [];
    let previousSignature = "";
    const capture = () => {
      const app = document.querySelector<HTMLElement>(appSelector);
      const layers = [...document.querySelectorAll<HTMLElement>(layerSelector)].map((layer) => {
        const style = window.getComputedStyle(layer);
        const surface = layer.querySelector<HTMLElement>(".scene-surface");
        const cameraScale = Number(surface?.dataset.sceneScale);
        return {
          phase: layer.dataset.phase ?? null,
          sceneId: layer.dataset.sceneId ?? null,
          ariaHidden: layer.getAttribute("aria-hidden"),
          inert: layer.hasAttribute("inert"),
          cameraScale: Number.isFinite(cameraScale) ? cameraScale : null,
          transform: style.transform,
          animationName: style.animationName,
          maximumMotionDurationMs: Math.max(
            durationMilliseconds(style.animationDuration),
            durationMilliseconds(style.transitionDuration),
          ),
        };
      });
      const activeShell = document.querySelector<HTMLElement>(".viewer-shell:not([data-phase])");
      const veil = document.querySelector<HTMLElement>(".scene-transition-veil");
      const veilStyle = veil ? window.getComputedStyle(veil, "::before") : null;
      const snapshot = {
        state: app?.dataset.transitionState ?? null,
        layers,
        activeShellInert: activeShell?.hasAttribute("inert") ?? null,
        activeShellAriaHidden: activeShell?.getAttribute("aria-hidden") ?? null,
        veilTransform: veilStyle?.transform ?? null,
        veilAnimationName: veilStyle?.animationName ?? null,
      };
      const signature = JSON.stringify(snapshot);
      if (signature !== previousSignature) {
        previousSignature = signature;
        snapshots.push(snapshot);
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "aria-hidden",
        "class",
        "data-phase",
        "data-scene-id",
        "data-transition-state",
        "inert",
        "style",
      ],
    });
    capture();
    Reflect.set(window, traceKey, { observer, snapshots });
  }, { appSelector: APP, layerSelector: TRANSITION_LAYER, traceKey: TRANSITION_TRACE_KEY });
}

async function finishTransitionTrace(page: Page): Promise<TransitionSnapshot[]> {
  return page.evaluate((traceKey) => {
    const trace = Reflect.get(window, traceKey) as {
      observer: MutationObserver;
      snapshots: TransitionSnapshot[];
    } | undefined;
    trace?.observer.disconnect();
    return trace?.snapshots ?? [];
  }, TRANSITION_TRACE_KEY);
}

async function waitForSettledScene(page: Page, app: Locator, target: string) {
  await expect(app).toHaveAttribute("data-scene-id", target);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(TRANSITION_LAYER)).toHaveCount(0);
}

function expectContinuousTransition(
  snapshots: TransitionSnapshot[],
) {
  expect(
    snapshots.some((snapshot) => snapshot.state === "loading"),
    "entry locks the current scene while its decoded detail tile finishes preparing",
  ).toBe(true);
  expect(
    snapshots.every((snapshot) => snapshot.state !== "incoming"),
    "continuous ownership handoff does not recreate the old incoming page phase",
  ).toBe(true);

  const committed = snapshots.find((snapshot) => (
    snapshot.state === "loading" && snapshot.activeShellInert !== null
  ));
  expect(committed, "the committed active scene should remain mounted while its target loads").toBeTruthy();
  expect(
    committed?.activeShellInert,
    "the loading scene must leave the Tab order and accessibility tree",
  ).toBe(true);
  expect(
    committed?.activeShellAriaHidden,
    "aria-hidden is reserved for duplicate transition layers, not the active loading scene",
  ).toBeNull();

  expect(
    snapshots.every((snapshot) => snapshot.layers.length === 0),
    "continuous detail entry never mounts duplicate outgoing/incoming page layers",
  ).toBe(true);
  expect(
    snapshots.every((snapshot) => snapshot.veilAnimationName === null),
    "the decoded child tile replaces the full-screen transition veil",
  ).toBe(true);
}

async function beginColdEntryByWheel(page: Page, app: Locator, hotspot: Locator) {
  const box = await hotspot.boundingBox();
  expect(box, "the portal must have a rendered wheel target").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect.poll(async () => {
    if ((await app.getAttribute("data-transition-state")) === "idle") {
      await page.mouse.wheel(0, -180);
    }
    return app.getAttribute("data-transition-state");
  }, { intervals: [220], timeout: 8_000 }).toBe("loading");
}

test("a focused portal names the exact object before entering", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await openWorld(page);
  await focusedPortalPreview(page);
});

test("portal entry progress stays in 0..1 and reaches armed while zooming in", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const app = await openWorld(page);
  const { hotspot, target } = await focusedPortalPreview(page);
  const box = await hotspot.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  const initialPreview = await portalPreviewState(page);
  expect(initialPreview).not.toBeNull();
  const progress: number[] = [Number(initialPreview!.progress)];
  let armedObserved = false;
  for (let index = 0; index < 32; index += 1) {
    const currentPreview = await portalPreviewState(page);
    if (
      currentPreview?.phase === "armed"
      || await app.getAttribute("data-scene-id") === target
    ) {
      armedObserved = true;
      break;
    }
    // Use a fine wheel impulse so the progress contract is sampled across
    // several frames before immediate warm navigation removes the preview.
    await page.mouse.wheel(0, -28);
    await nextPaint(page);
    const nextPreview = await portalPreviewState(page);
    if (nextPreview?.progress !== null && nextPreview?.progress !== undefined) {
      progress.push(Number(nextPreview.progress));
    } else if (await app.getAttribute("data-transition-state") !== "idle") {
      armedObserved = true;
      break;
    }
  }

  expect(progress.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
  for (let index = 1; index < progress.length; index += 1) {
    expect(
      progress[index],
      `progress regressed from ${progress[index - 1]} to ${progress[index]}`,
    ).toBeGreaterThanOrEqual(progress[index - 1]);
  }
  expect(progress[0]).toBeLessThanOrEqual(0.01);
  expect(new Set(progress.map((value) => value.toFixed(3))).size).toBeGreaterThanOrEqual(6);
  expect(
    armedObserved,
    "the preview reaches armed before the user explicitly activates the portal",
  ).toBe(true);
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
});

test("click entry keeps one continuous tiled scene and never mounts page transition layers", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const releasePreparation = await holdPreferredChildPreparation(page);
  const app = await openWorld(page);
  const { hotspot, target } = await focusedPortalPreview(page);

  await beginTransitionTrace(page);
  await hotspot.click();
  await expect(app).toHaveAttribute("data-transition-state", "loading");
  releasePreparation();
  await waitForSettledScene(page, app, target);
  const snapshots = await finishTransitionTrace(page);
  expectContinuousTransition(snapshots);
});

test("wheel entry uses the same continuous tile handoff", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const releasePreparation = await holdPreferredChildPreparation(page, ["city-street"]);
  const app = await openWorld(page);
  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="city-street"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "city-street");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const { hotspot, target } = await focusedPortalPreview(page);

  await beginTransitionTrace(page);
  await beginColdEntryByWheel(page, app, hotspot);
  releasePreparation();
  await waitForSettledScene(page, app, target);
  const snapshots = await finishTransitionTrace(page);
  expectContinuousTransition(snapshots);
});

test("reduced motion keeps the target cue and state sequence without a long animation", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const releasePreparation = await holdPreferredChildPreparation(page);
  const app = await openWorld(page);
  const { hotspot, preview, target } = await focusedPortalPreview(page);
  await expect(preview).toBeVisible();

  await beginTransitionTrace(page);
  await hotspot.click();
  await expect(app).toHaveAttribute("data-transition-state", "loading");
  releasePreparation();
  await waitForSettledScene(page, app, target);
  const snapshots = await finishTransitionTrace(page);
  expectContinuousTransition(snapshots);
  expect(
    snapshots.flatMap((snapshot) => snapshot.layers),
    "reduced motion skips both camera motion and duplicate fading layers",
  ).toHaveLength(0);
});

test("a keyboard user can discover a portal target and enter it with Enter or Space", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  for (const activationKey of ["Enter", "Space"]) {
    const app = await openWorld(page);
    let hotspotReached = false;
    for (let index = 0; index < 100; index += 1) {
      await page.keyboard.press("Tab");
      hotspotReached = await page.evaluate((selector) => document.activeElement?.matches(selector) ?? false, HOTSPOT);
      if (hotspotReached) break;
    }
    expect(hotspotReached, "a portal must be reachable in the natural Tab order").toBe(true);

    const hotspot = page.locator(`${HOTSPOT}:focus`);
    const target = await targetScene(hotspot);
    const title = await sceneTitle(page, target);
    const preview = page.locator(PREVIEW);
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(title, { ignoreCase: true });

    await page.keyboard.press(activationKey);
    await waitForSettledScene(page, app, target);
    await expect(page.locator(".scene-announcement")).toContainText(`Entered ${title}`);
  }
});
