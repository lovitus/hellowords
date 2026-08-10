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

function expectLayeredTransition(
  snapshots: TransitionSnapshot[],
  parent: string,
  target: string,
) {
  expect(
    snapshots.some((snapshot) => snapshot.state === "loading"),
    "entry should commit its target before the replacement scene is ready",
  ).toBe(true);
  expect(
    snapshots.some((snapshot) => snapshot.state === "incoming"),
    "the loaded scene should have an explicit incoming phase",
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

  const paired = snapshots.find((snapshot) => (
    snapshot.layers.some((layer) => layer.phase === "outgoing" && layer.sceneId === parent)
    && snapshot.layers.some((layer) => layer.phase === "incoming" && layer.sceneId === target)
  ));
  expect(
    paired,
    "one rendered frame must contain both the outgoing and incoming scene layers",
  ).toBeTruthy();

  const outgoing = paired!.layers.find((layer) => layer.phase === "outgoing");
  expect(outgoing?.ariaHidden, "the outgoing visual is not active screen-reader content").toBe("true");
  expect(outgoing?.inert, "the outgoing visual cannot retain pointer or keyboard interaction").toBe(true);
  const incoming = paired!.layers.find((layer) => layer.phase === "incoming");
  expect(incoming?.ariaHidden, "the incoming visual stays silent until it becomes active").toBe("true");
  expect(incoming?.inert, "the incoming visual cannot expose dead controls during its animation").toBe(true);
}

async function enterByWheel(page: Page, app: Locator, hotspot: Locator, target: string) {
  const box = await hotspot.boundingBox();
  expect(box, "the portal must have a rendered wheel target").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect.poll(async () => {
    if ((await app.getAttribute("data-scene-id")) !== target) {
      await page.mouse.wheel(0, -180);
    }
    return app.getAttribute("data-scene-id");
  }, { intervals: [220], timeout: 8_000 }).toBe(target);
}

test("a focused portal names the exact object before entering", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await openWorld(page);
  await focusedPortalPreview(page);
});

test("portal entry progress stays in 0..1 and reaches armed while zooming in", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await openWorld(page);
  const { hotspot, preview } = await focusedPortalPreview(page);
  const box = await hotspot.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  const progress: number[] = [Number(await preview.getAttribute("data-progress"))];
  for (let index = 0; index < 32; index += 1) {
    if (await preview.getAttribute("data-phase") === "armed") break;
    await page.mouse.wheel(0, -42);
    await nextPaint(page);
    progress.push(Number(await preview.getAttribute("data-progress")));
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
  await expect(preview).toHaveAttribute("data-phase", "armed");
});

test("click entry briefly layers outgoing and incoming scenes, then cleans both up", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const app = await openWorld(page);
  const parent = (await app.getAttribute("data-scene-id")) as string;
  const { hotspot, target } = await focusedPortalPreview(page);

  await beginTransitionTrace(page);
  await hotspot.click();
  await waitForSettledScene(page, app, target);
  const snapshots = await finishTransitionTrace(page);
  expectLayeredTransition(snapshots, parent, target);
});

test("wheel entry uses the same outgoing and incoming scene transition", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const app = await openWorld(page);
  const parent = (await app.getAttribute("data-scene-id")) as string;
  const { hotspot, target } = await focusedPortalPreview(page);

  await beginTransitionTrace(page);
  await enterByWheel(page, app, hotspot, target);
  await waitForSettledScene(page, app, target);
  const snapshots = await finishTransitionTrace(page);
  expectLayeredTransition(snapshots, parent, target);
});

test("reduced motion keeps the target cue and state sequence without a long animation", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = await openWorld(page);
  const parent = (await app.getAttribute("data-scene-id")) as string;
  const { hotspot, preview, target } = await focusedPortalPreview(page);
  await expect(preview).toBeVisible();
  const initialSurface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  await expect(initialSurface).toHaveAttribute("data-scene-scale", /\d/);
  const initialCameraScale = Number(await initialSurface.getAttribute("data-scene-scale"));

  await beginTransitionTrace(page);
  await hotspot.click();
  await waitForSettledScene(page, app, target);
  const snapshots = await finishTransitionTrace(page);
  expectLayeredTransition(snapshots, parent, target);

  const animatedLayers = snapshots.flatMap((snapshot) => snapshot.layers);
  expect(animatedLayers.length, "reduced motion still preserves explicit transition states").toBeGreaterThan(0);
  expect(
    Math.max(...animatedLayers.map((layer) => layer.maximumMotionDurationMs)),
    "reduced-motion scene layers must finish in at most 100ms",
  ).toBeLessThanOrEqual(100);
  expect(
    animatedLayers.every((layer) => layer.transform === "none"),
    "reduced-motion layers must not scale while fading",
  ).toBe(true);
  expect(
    animatedLayers.every((layer) => layer.animationName.includes("reduced")),
    "reduced-motion layers must use opacity-only keyframes",
  ).toBe(true);

  const outgoingCameraScales = animatedLayers
    .filter((layer) => layer.phase === "outgoing" && layer.sceneId === parent)
    .map((layer) => layer.cameraScale)
    .filter((scale): scale is number => scale !== null);
  expect(outgoingCameraScales.length, "the outgoing camera must be observable during the fade").toBeGreaterThan(0);
  for (const scale of outgoingCameraScales) {
    expect(scale, "reduced motion must skip the portal camera push").toBeCloseTo(initialCameraScale, 3);
  }

  const veils = snapshots.filter((snapshot) => snapshot.veilAnimationName !== null);
  expect(veils.length, "the target veil should retain a short opacity cue").toBeGreaterThan(0);
  expect(veils.every((snapshot) => snapshot.veilTransform === "none")).toBe(true);
  expect(veils.every((snapshot) => snapshot.veilAnimationName?.includes("reduced"))).toBe(true);
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
