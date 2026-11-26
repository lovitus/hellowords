import { expect, test, type Locator, type Page } from "@playwright/test";
import { buildViewerChromeProtectedRegions } from "../../app/components/SceneViewport";
import type { PaintedLabel } from "../../app/lib/label-canvas";
import { clickPaintedWord } from "./canvas-words";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const SURFACE = ".scene-surface";
const LABEL_LAYER = '[data-testid="scene-label-layer"]';
const INTERACTION_LAYER = '[data-testid="scene-interaction-layer"]';
const TARGET_SCENE = "community-garden";
const AUTHORED_MAX_SCALE = 4.15;

interface TraceRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

type TraceLabel = Pick<PaintedLabel,
  "id" | "interactive" | "opacity" | "anchorX" | "anchorY" |
  "centerX" | "centerY" | "width" | "height"
>;

interface LabelZoomFrame {
  readonly sceneId: string;
  readonly scale: number;
  readonly lodLevel: number;
  readonly camera: { readonly x: number; readonly y: number; readonly scale: number };
  readonly motionFrozen: boolean;
  readonly viewport: TraceRect;
  readonly controlBounds: readonly TraceRect[];
  readonly labels: readonly TraceLabel[];
}

interface SceneContract {
  readonly labels: ReadonlyArray<{
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly minLevel?: number;
    readonly maxScale?: number;
  }>;
}

interface FitLabelSnapshot {
  readonly id: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly leaderSide: "anchor" | "up" | "down" | "left" | "right";
  readonly anchorMode: string | undefined;
  readonly leaderSpan: string | undefined;
}

interface FitSceneSnapshot {
  readonly cameraTransform: string;
  readonly scale: number;
  readonly labels: readonly FitLabelSnapshot[];
  readonly progress: {
    readonly current: number;
    readonly total: number;
    readonly remaining: number;
  };
}

async function openScene(page: Page, sceneId = TARGET_SCENE): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");

  const portal = page.locator(
    `[data-testid="scene-hotspot"][data-target-scene="${sceneId}"]`,
  );
  await expect(portal).toBeVisible();
  await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", sceneId);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");
  await expect(page.locator(LABEL_LAYER)).toHaveAttribute("data-motion-frozen", "false");

  await page.getByRole("button", { name: "Fit scene" }).click();
  const viewport = page.viewportSize();
  const fittedScale = viewport && viewport.height > viewport.width * 1.25 ? "1.300" : "1.000";
  await expect(page.locator(SURFACE)).toHaveAttribute("data-scene-scale", fittedScale);
  return app;
}

async function openOakTreeScene(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  const minimap = page.getByTestId("scene-minimap");
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");

  for (const sceneId of ["city-park", "oak-tree"] as const) {
    const child = minimap.locator(
      `[data-testid="scene-minimap-child"][data-target-scene="${sceneId}"]`,
    );
    await expect(child).toBeVisible();
    await child.click();
    await expect(app).toHaveAttribute("data-scene-id", sceneId);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");
    await expect(page.locator(LABEL_LAYER)).toHaveAttribute("data-motion-frozen", "false");
  }

  await page.getByRole("button", { name: "Fit scene" }).click();
  const viewport = page.viewportSize();
  const fittedScale = viewport && viewport.height > viewport.width * 1.25 ? "1.300" : "1.000";
  await expect(page.locator(SURFACE)).toHaveAttribute("data-scene-scale", fittedScale);
  return app;
}

async function captureFitSceneSnapshot(page: Page): Promise<FitSceneSnapshot> {
  return page.evaluate(({ labelLayerSelector, surfaceSelector }) => {
    const labelLayer = document.querySelector<HTMLElement>(labelLayerSelector);
    const surface = document.querySelector<HTMLElement>(surfaceSelector);
    const progress = document.querySelector<HTMLElement>('[data-testid="scene-word-progress"]');
    const canvas = labelLayer?.querySelector<HTMLCanvasElement & {
      paintedLabels?: readonly {
        readonly id: string;
        readonly interactive: boolean;
        readonly anchorX: number;
        readonly anchorY: number;
        readonly centerX: number;
        readonly centerY: number;
      }[];
    }>(".label-canvas");
    if (!labelLayer || !surface || !progress || !canvas) {
      throw new Error("fit-scene snapshot requires painted labels, camera and progress summary");
    }
    // Words are painted on the canvas. Each drawn word carries its anchor and
    // centre, so the leader geometry comes from what is actually on screen.
    const labels = (canvas.paintedLabels ?? [])
      .filter((label) => label.interactive)
      .map((label): FitLabelSnapshot => {
        const offsetX = label.centerX - label.anchorX;
        const offsetY = label.centerY - label.anchorY;
        const displacement = Math.hypot(offsetX, offsetY);
        const leaderSide = displacement < 4
          ? "anchor"
          : Math.abs(offsetX) > Math.abs(offsetY)
            ? offsetX < 0 ? "left" : "right"
            : offsetY < 0 ? "up" : "down";
        return {
          id: label.id,
          offsetX,
          offsetY,
          leaderSide,
          anchorMode: displacement >= 4 ? "leader" : "stem",
          leaderSpan: displacement >= 82 ? "long" : "short",
        };
      })
      .sort((first, second) => first.id.localeCompare(second.id));
    return {
      cameraTransform: surface.style.transform,
      scale: Number(surface.dataset.sceneScale),
      labels,
      progress: {
        current: Number(progress.dataset.current),
        total: Number(progress.dataset.total),
        remaining: Number(progress.dataset.remaining),
      },
    };
  }, { labelLayerSelector: LABEL_LAYER, surfaceSelector: SURFACE });
}

async function zoomSceneAboveFit(page: Page, targetScale: number): Promise<void> {
  const viewport = page.locator(VIEWPORT);
  const surface = page.locator(SURFACE);
  const box = await viewport.boundingBox();
  expect(box, "world viewport must have a rendered hit area").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect.poll(async () => {
    const scale = Number(await surface.getAttribute("data-scene-scale"));
    if (Number.isFinite(scale) && scale < targetScale * 0.998) {
      const factor = Math.min(1.12, targetScale / Math.max(0.01, scale));
      await page.mouse.wheel(0, -Math.log(factor) / 0.00145);
    }
    return Number(await surface.getAttribute("data-scene-scale"));
  }, {
    intervals: [34],
    timeout: 5_000,
    message: `scene zoom must leave fit and reach ${targetScale.toFixed(2)}`,
  }).toBeGreaterThanOrEqual(targetScale * 0.995);
}

async function startLabelZoomTrace(page: Page): Promise<void> {
  await page.evaluate(({ appSelector, viewportSelector, surfaceSelector, labelLayerSelector }) => {
    interface BrowserTrace {
      readonly frames: LabelZoomFrame[];
      stop(): LabelZoomFrame[];
    }

    type TraceWindow = Window & typeof globalThis & {
      __helloWordsLabelZoomTrace?: BrowserTrace;
    };

    const traceWindow = window as TraceWindow;
    traceWindow.__helloWordsLabelZoomTrace?.stop();
    const app = document.querySelector<HTMLElement>(appSelector);
    const viewport = document.querySelector<HTMLElement>(viewportSelector);
    const surface = document.querySelector<HTMLElement>(surfaceSelector);
    const labelLayer = document.querySelector<HTMLElement>(labelLayerSelector);
    const canvas = labelLayer?.querySelector<HTMLCanvasElement & {
      paintedLabels?: readonly PaintedLabel[];
    }>(".label-canvas");
    if (!app || !viewport || !surface || !labelLayer || !canvas?.paintedLabels) {
      throw new Error("label zoom trace requires the active scene camera and painted words");
    }

    const frames: LabelZoomFrame[] = [];
    let active = true;
    let animationFrame = 0;
    let lastSignature = "";
    let lastPaint: readonly PaintedLabel[] | undefined;

    // These controls share the stage with the canvas. A portal's progress
    // halo extends 7 CSS pixels past its desktop button.
    const controls = [...document.querySelectorAll<HTMLElement>(
      ".scene-minimap, .zoom-controls, .back-button, .scene-hotspot",
    )];

    const capture = () => {
      const scale = Number(surface.dataset.sceneScale);
      const cameraTransform = surface.style.transform;
      const signature = `${app.dataset.sceneId}:${scale.toFixed(3)}:${cameraTransform}`;
      if (Number.isFinite(scale) && (signature !== lastSignature || canvas.paintedLabels !== lastPaint)) {
        lastSignature = signature;
        lastPaint = canvas.paintedLabels;
        const viewportRect = canvas.getBoundingClientRect();
        const camera = new DOMMatrixReadOnly(cameraTransform);
        frames.push({
          sceneId: app.dataset.sceneId ?? "",
          scale,
          lodLevel: Number(surface.dataset.lodLevel),
          camera: { x: camera.e, y: camera.f, scale: camera.a },
          motionFrozen: labelLayer.dataset.motionFrozen === "true",
          viewport: { left: 0, top: 0, right: viewportRect.width, bottom: viewportRect.height },
          controlBounds: controls.flatMap((element) => {
            const bounds = element.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return [];
            const halo = element.matches(".scene-hotspot") ? 7 : 0;
            return [{
              left: bounds.left - viewportRect.left - halo,
              right: bounds.right - viewportRect.left + halo,
              top: bounds.top - viewportRect.top - halo,
              bottom: bounds.bottom - viewportRect.top + halo,
            }];
          }),
          labels: (canvas.paintedLabels ?? []).map(({
            id, interactive, opacity, anchorX, anchorY, centerX, centerY, width, height,
          }) => ({ id, interactive, opacity, anchorX, anchorY, centerX, centerY, width, height })),
        });
      }
      if (active) animationFrame = requestAnimationFrame(capture);
    };

    animationFrame = requestAnimationFrame(capture);
    traceWindow.__helloWordsLabelZoomTrace = {
      frames,
      stop: () => {
        active = false;
        cancelAnimationFrame(animationFrame);
        capture();
        return frames;
      },
    };
  }, {
    appSelector: APP,
    viewportSelector: VIEWPORT,
    surfaceSelector: SURFACE,
    labelLayerSelector: LABEL_LAYER,
  });
}

async function stopLabelZoomTrace(page: Page): Promise<LabelZoomFrame[]> {
  return page.evaluate(() => {
    type TraceWindow = Window & typeof globalThis & {
      __helloWordsLabelZoomTrace?: { stop(): LabelZoomFrame[] };
    };
    const traceWindow = window as TraceWindow;
    const frames = traceWindow.__helloWordsLabelZoomTrace?.stop() ?? [];
    delete traceWindow.__helloWordsLabelZoomTrace;
    return frames;
  });
}

async function zoomThroughScales(page: Page, targets: readonly number[]): Promise<void> {
  const viewport = page.locator(VIEWPORT);
  const surface = page.locator(SURFACE);
  const box = await viewport.boundingBox();
  expect(box, "world viewport must have a rendered hit area").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect(surface).toHaveAttribute("data-maximum-scale", /\d/u);
  const maximumScale = Number(await surface.getAttribute("data-maximum-scale"));
  expect(maximumScale).toBeGreaterThanOrEqual(AUTHORED_MAX_SCALE);
  const responsiveTargets = [...new Set([
    ...targets.filter((target) => target < maximumScale - 0.005),
    maximumScale,
  ])];

  for (const target of responsiveTargets) {
    await expect.poll(async () => {
      const scale = Number(await surface.getAttribute("data-scene-scale"));
      if (Number.isFinite(scale) && scale < target * 0.998) {
        const factor = Math.min(1.12, target / Math.max(0.01, scale));
        await page.mouse.wheel(0, -Math.log(factor) / 0.00145);
      }
      return Number(await surface.getAttribute("data-scene-scale"));
    }, {
      intervals: [34],
      timeout: 5_000,
      message: `scene zoom must reach ${target.toFixed(2)}`,
    }).toBeGreaterThanOrEqual(target * 0.995);
  }
  await expect.poll(
    async () => Number(await surface.getAttribute("data-scene-scale")),
    { message: "scene zoom reaches its responsive maximum-mode threshold" },
  ).toBeGreaterThanOrEqual(maximumScale - 0.02);
}

async function waitForCameraSettled(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(async ({ surfaceSelector, layerSelector }) => {
    const surface = document.querySelector<HTMLElement>(surfaceSelector);
    const layer = document.querySelector<HTMLElement>(layerSelector);
    if (!surface || !layer || layer.dataset.motionFrozen === "true") return false;
    const signature = `${surface.dataset.sceneScale}:${surface.style.transform}`;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return signature === `${surface.dataset.sceneScale}:${surface.style.transform}`;
  }, { surfaceSelector: SURFACE, layerSelector: LABEL_LAYER }), {
    intervals: [16, 34],
    timeout: 2_000,
    message: "camera must settle for two painted frames",
  }).toBe(true);
}

function anchorInsideViewport(label: TraceLabel, frame: LabelZoomFrame): boolean {
  return label.anchorX >= frame.viewport.left
    && label.anchorX <= frame.viewport.right
    && label.anchorY >= frame.viewport.top
    && label.anchorY <= frame.viewport.bottom;
}

function overlaps(first: TraceRect, second: TraceRect, padding = 0): boolean {
  return !(
    first.right + padding <= second.left
    || first.left >= second.right + padding
    || first.bottom + padding <= second.top
    || first.top >= second.bottom + padding
  );
}

function pillBounds(label: TraceLabel): TraceRect {
  return {
    left: label.centerX - label.width / 2,
    right: label.centerX + label.width / 2,
    top: label.centerY - label.height / 2,
    bottom: label.centerY + label.height / 2,
  };
}

function anchorTouchesPill(label: TraceLabel, pill: TraceRect): boolean {
  return label.anchorX >= pill.left - 3 && label.anchorX <= pill.right + 3
    && label.anchorY >= pill.top - 3 && label.anchorY <= pill.bottom + 3;
}

// Clip the drawn straight leader to the pill along each axis. The remaining
// parameter interval is nonempty exactly when the segment touches the pill.
function leaderTouchesPill(line: TraceLabel, pill: TraceRect): boolean {
  let near = 0;
  let far = 1;
  for (const [start, end, low, high] of [
    [line.anchorX, line.centerX, pill.left, pill.right],
    [line.anchorY, line.centerY, pill.top, pill.bottom],
  ]) {
    const delta = end - start;
    if (delta === 0) {
      if (start < low || start > high) return false;
      continue;
    }
    const first = (low - start) / delta;
    const second = (high - start) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }
  return near <= far;
}

function leadersCross(first: TraceLabel, second: TraceLabel): boolean {
  const side = (line: TraceLabel, x: number, y: number) => (
    (line.centerX - line.anchorX) * (y - line.anchorY)
    - (line.centerY - line.anchorY) * (x - line.anchorX)
  );
  return side(first, second.anchorX, second.anchorY) * side(first, second.centerX, second.centerY) < 0
    && side(second, first.anchorX, first.anchorY) * side(second, first.centerX, first.centerY) < 0;
}

function slotIsClear(
  projected: TraceLabel,
  frame: LabelZoomFrame,
  controls: readonly TraceRect[],
): boolean {
  const pill = pillBounds(projected);
  if (pill.left < 4 || pill.right > frame.viewport.right - 4
    || pill.top < 4 || pill.bottom > frame.viewport.bottom - 4
    || controls.some((control) => overlaps(pill, control))) return false;
  return !frame.labels.some((neighbor) => {
    if (neighbor.id === projected.id || neighbor.opacity <= 0.025) return false;
    const otherPill = pillBounds(neighbor);
    return overlaps(pill, otherPill, 3)
      || anchorTouchesPill(neighbor, pill) || anchorTouchesPill(projected, otherPill)
      || leaderTouchesPill(projected, otherPill) || leaderTouchesPill(neighbor, pill)
      || leadersCross(projected, neighbor);
  });
}

test("zooming back out in the apartment keeps readable words in their clear slots", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "This regression follows a desktop wheel gesture.");
  const app = await openScene(page, "apartment");
  await waitForCameraSettled(page);
  const initial = await captureFitSceneSnapshot(page);
  const response = await page.request.get("/data/scenes/apartment.json");
  expect(response.ok()).toBe(true);
  const apartment: SceneContract = await response.json();
  const objects = apartment.labels.filter(({ id }) => id === "refrigerator-door" || id === "shelf-board");
  expect(objects).toHaveLength(2);

  const bounds = await page.locator(VIEWPORT).boundingBox();
  if (!bounds) throw new Error("The apartment viewport has no wheel target");
  await page.mouse.move(bounds.x + bounds.width * 0.39, bounds.y + bounds.height * 0.46);
  const surface = page.locator(SURFACE);
  const scale = async () => Number(await surface.getAttribute("data-scene-scale"));
  for (const delta of [-140, 140]) {
    if (delta > 0) await startLabelZoomTrace(page);
    for (let notch = 0; notch < 4; notch += 1) {
      const before = await scale();
      await page.mouse.wheel(0, delta);
      await expect.poll(async () => (await scale() - before) * -Math.sign(delta), { intervals: [16] })
        .toBeGreaterThan(0.005);
    }
    await waitForCameraSettled(page);
    if (delta < 0) expect(await scale(), "the inward wheel must reach the apartment detail").toBeGreaterThan(2.1);
  }
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  expect(await scale()).toBeCloseTo(initial.scale, 2);
  const frames = await stopLabelZoomTrace(page);
  const changes: Array<{ word: string; frameIndex: number; shiftPx: number | null }> = [];
  const clearFrameCounts: Record<string, number> = {};
  for (const object of objects) {
    clearFrameCounts[object.id] = 0;
    for (let i = 1; i < frames.length; i += 1) {
      const frame = frames[i];
      const previous = frames[i - 1];
      if (frame.motionFrozen || previous.motionFrozen || frame.camera.scale >= previous.camera.scale) continue;
      const old = previous.labels.find(({ id }) => id === object.id);
      if (!old?.interactive || old.opacity < 0.52) continue;
      const current = frame.labels.find(({ id }) => id === object.id);
      // CSS rounds the photo transform. At an intersection that rounding can
      // put a leader on the opposite side of its neighbor's actual anchor.
      const anchorX = current?.anchorX ?? frame.camera.x + object.x * frame.camera.scale;
      const anchorY = current?.anchorY ?? frame.camera.y + object.y * frame.camera.scale;
      const projected = {
        ...old, anchorX, anchorY,
        centerX: anchorX + (old.centerX - old.anchorX),
        centerY: anchorY + (old.centerY - old.anchorY),
      };
      const controls = [
        ...frame.controlBounds,
        ...buildViewerChromeProtectedRegions(frame.viewport.right, frame.viewport.bottom),
      ];
      if (!anchorInsideViewport(projected, frame) || !slotIsClear(projected, frame, controls)) continue;
      clearFrameCounts[object.id] += 1;
      const shiftPx = current?.interactive && current.opacity >= 0.52
        ? Math.hypot(current.centerX - projected.centerX, current.centerY - projected.centerY)
        : null;
      if (shiftPx === null || shiftPx > 1) changes.push({ word: object.id, frameIndex: i, shiftPx });
    }
  }
  await testInfo.attach("apartment-outward-slot-changes", {
    body: JSON.stringify({ clearFrameCounts, changes, frames }),
    contentType: "application/json",
  });
  for (const object of objects) {
    expect(clearFrameCounts[object.id], `${object.id} must have usable positions during zoom-out`).toBeGreaterThan(1);
  }
  expect.soft(changes, "readable words must stay in their clear object-relative slots").toEqual([]);

  await page.getByRole("button", { name: "Fit scene", exact: true }).click();
  await waitForCameraSettled(page);
  expect(await captureFitSceneSnapshot(page)).toEqual(initial);
  await clickPaintedWord(page, "refrigerator-door");
  await expect(page.getByRole("complementary", { name: "refrigerator door word details" })).toContainText("冰箱门");
});

test("oak-tree fit fills safe slots and round-trips the exact label layout", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  const app = await openOakTreeScene(page);
  await waitForCameraSettled(page);
  const initial = await captureFitSceneSnapshot(page);

  await expect(app).toHaveAttribute("data-scene-id", "oak-tree");
  expect(initial.cameraTransform).toContain("translate3d(");
  expect(initial.progress.total).toBe(68);
  expect(initial.progress.current).toBe(initial.labels.length);
  expect(initial.progress.remaining).toBe(initial.progress.total - initial.labels.length);
  expect(
    initial.labels.length,
    mobile
      ? "mobile fit must use its smaller physical label capacity"
      : "desktop fit must not stop at the former 35-word quota",
  ).toBeGreaterThanOrEqual(mobile ? 12 : 41);

  await zoomSceneAboveFit(page, mobile ? 1.8 : 1.65);
  await waitForCameraSettled(page);
  const zoomedTransform = await page.locator(SURFACE).evaluate((element) => (
    (element as HTMLElement).style.transform
  ));
  expect(zoomedTransform, "the wheel gesture must exercise a different camera").not.toBe(
    initial.cameraTransform,
  );

  await page.getByRole("button", { name: "Fit scene" }).click();
  await expect(page.locator(SURFACE)).toHaveAttribute(
    "data-scene-scale",
    initial.scale.toFixed(3),
  );
  await waitForCameraSettled(page);
  const returned = await captureFitSceneSnapshot(page);

  expect(returned.cameraTransform, "Fit must restore the precise painted camera").toBe(
    initial.cameraTransform,
  );
  expect(
    returned.labels.map((label) => label.id),
    "the same camera must restore the same interactive IDs",
  ).toEqual(initial.labels.map((label) => label.id));
  expect(
    returned.labels,
    "every interactive label must restore its exact offset, leader side and span",
  ).toEqual(initial.labels);
  expect(returned.progress.current).toBe(returned.labels.length);
  expect(returned.progress.total).toBe(68);
  expect(returned.progress.remaining).toBe(returned.progress.total - returned.labels.length);
});

// In a 1440×900 garden trace, "shovel" jumped 72.4 CSS px at 1.803×→1.822×
// with its old slot clear. Measure every painted word so the gate also covers
// a wheel stream that samples different intermediate camera positions.
test("continuous zoom retains grounded labels and their object-relative slots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  const app = await openScene(page);
  const sceneContract = await page.evaluate(async (sceneId): Promise<SceneContract> => {
    const response = await fetch(`/data/scenes/${encodeURIComponent(sceneId)}.json`);
    if (!response.ok) throw new Error(`Unable to load scene contract for ${sceneId}`);
    return response.json() as Promise<SceneContract>;
  }, TARGET_SCENE);

  await startLabelZoomTrace(page);
  await zoomThroughScales(page, [1.2, 1.65, 2.3, 3.12, AUTHORED_MAX_SCALE]);
  await waitForCameraSettled(page);
  const frames = (await stopLabelZoomTrace(page)).filter((frame) => (
    frame.sceneId === TARGET_SCENE && !frame.motionFrozen
  ));

  await expect(app).toHaveAttribute("data-scene-id", TARGET_SCENE);
  expect(new Set(frames.map((frame) => frame.scale)).size, "rAF trace must cover multiple continuous camera frames").toBeGreaterThan(12);
  const maximumScale = Number(await page.locator(SURFACE).getAttribute("data-maximum-scale"));
  expect(frames.at(-1)?.scale).toBeCloseTo(maximumScale, 3);
  expect(frames.some((frame) => frame.lodLevel === 4), "trace must reach the deepest LOD").toBe(true);

  const legalViewportDepartures = new Set<string>();
  const legalSlotChanges = new Set<string>();
  const authoredLabelsById = new Map(sceneContract.labels.map((label) => [label.id, label]));
  const dropped: string[] = [];
  const moved: string[] = [];
  const retainedOverviewAtMax: TraceLabel[] = [];
  let largestJump = { pixels: 0, context: "" };
  let largestAnchorError = 0;
  let retainedFrameChecks = 0;
  let stableSlotChecks = 0;
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const byId = new Map(frame.labels.map((label) => [label.id, label]));
    const previous = frames[frameIndex - 1];
    const controls = [
      ...frame.controlBounds,
      ...buildViewerChromeProtectedRegions(frame.viewport.right, frame.viewport.bottom),
    ];
    expect(
      frame.scale,
      `zoom scale reversed between rAF samples ${frameIndex - 1} and ${frameIndex}`,
    ).toBeGreaterThanOrEqual(previous.scale - 0.001);
    for (const previousLabel of previous.labels.filter((label) => label.interactive && label.opacity >= 0.52)) {
      const current = byId.get(previousLabel.id);
      const authored = authoredLabelsById.get(previousLabel.id);
      if (!authored) throw new Error(`Unknown painted word ${previousLabel.id}`);
      if (authored.maxScale !== undefined && frame.scale > authored.maxScale) continue;
      // A dropped word has no current canvas record. Project its authored
      // anchor with the live camera, then carry its last painted slot forward.
      const authoredX = frame.camera.x + authored.x * frame.camera.scale;
      const authoredY = frame.camera.y + authored.y * frame.camera.scale;
      if (current) {
        largestAnchorError = Math.max(
          largestAnchorError,
          Math.hypot(current.anchorX - authoredX, current.anchorY - authoredY),
        );
      }
      const anchorX = current?.anchorX ?? authoredX;
      const anchorY = current?.anchorY ?? authoredY;
      const projected = {
        ...previousLabel,
        anchorX,
        anchorY,
        centerX: anchorX + (previousLabel.centerX - previousLabel.anchorX),
        centerY: anchorY + (previousLabel.centerY - previousLabel.anchorY),
      };
      if (!anchorInsideViewport(projected, frame)) {
        if (!anchorInsideViewport(previousLabel, previous)) continue;
        legalViewportDepartures.add(previousLabel.id);
        continue;
      }
      const context = `${previousLabel.id} at ${previous.scale.toFixed(3)}× → ${frame.scale.toFixed(3)}×`;
      const readable = current?.interactive && current.opacity >= 0.52;
      const dx = current ? current.centerX - projected.centerX : 0;
      const dy = current ? current.centerY - projected.centerY : 0;
      const delta = Math.hypot(dx, dy);
      if (readable && delta > largestJump.pixels) largestJump = { pixels: delta, context };
      const changedSlot = Math.abs(dx) >= 0.005 || Math.abs(dy) >= 0.005;
      if (!slotIsClear(projected, frame, controls)) {
        if (!readable || changedSlot) legalSlotChanges.add(previousLabel.id);
        continue;
      }
      retainedFrameChecks += 1;
      if (!readable) {
        if (dropped.length < 5) dropped.push(context);
        continue;
      }
      stableSlotChecks += 1;
      if (changedSlot && moved.length < 5) {
        moved.push(`${context} (${delta.toFixed(1)} CSS px)`);
      }
      if (frameIndex === frames.length - 1 && (authored.minLevel ?? 0) <= 2 && authored.maxScale === undefined) {
        retainedOverviewAtMax.push(current);
      }
    }
  }

  expect(retainedFrameChecks, "the trace must exercise retained on-screen vocabulary").toBeGreaterThan(20);
  expect(stableSlotChecks, "the trace must exercise reusable object-relative slots").toBeGreaterThan(10);
  expect(
    legalViewportDepartures.size,
    "the trace must distinguish labels whose authored object anchor genuinely left the viewport",
  ).toBeGreaterThan(0);

  expect(
    legalSlotChanges.size,
    "the trace must distinguish slots blocked by chrome, portal cues, edges, or another active preferred slot",
  ).toBeGreaterThan(0);
  expect.soft(largestAnchorError, "leaders must remain grounded in their authored object pixels").toBeLessThan(0.1);
  expect.soft(dropped, "words that disappeared despite a clear slot").toEqual([]);
  expect.soft(moved, "words that moved despite a clear slot").toEqual([]);
  expect.soft(largestJump.pixels, `${largestJump.context}: largest jump between painted frames`).toBeLessThanOrEqual(120);
  expect(
    retainedOverviewAtMax.length,
    "max zoom must retain an observable sample of default LOD 0–2 vocabulary",
  ).toBeGreaterThan(0);
  for (const label of retainedOverviewAtMax) {
    expect(label.opacity, `${label.id} must keep full painted opacity at max zoom`).toBeGreaterThanOrEqual(0.99);
    const mirror = page.locator(`[data-testid="word-label"][data-label-id="${label.id}"]`);
    await expect(mirror).toHaveAttribute("aria-hidden", "false");
    await expect(mirror).toHaveJSProperty("tabIndex", 0);
  }
});

test("ordinary scenes hide the progress hint while the canvas counts only the current crop", async ({ page }) => {
  const app = await openScene(page);
  const progress = page.getByTestId("scene-word-progress");
  const sceneContract = await page.evaluate(async (sceneId): Promise<SceneContract> => {
    const response = await fetch(`/data/scenes/${encodeURIComponent(sceneId)}.json`);
    if (!response.ok) throw new Error(`Unable to load scene contract for ${sceneId}`);
    return response.json() as Promise<SceneContract>;
  }, TARGET_SCENE);
  const canvas = page.locator(".label-canvas");
  const captureCrop = async () => {
    await expect(app).toHaveAttribute("data-scene-id", TARGET_SCENE);
    await expect(progress).toBeHidden();
    await expect(canvas).toBeVisible();
    const crop = await canvas.evaluate((element: HTMLCanvasElement & { paintedLabels?: readonly PaintedLabel[] }) => {
      // Sample the bitmap visible on the page, including a transferred canvas.
      const capture = document.createElement("canvas");
      capture.width = element.width;
      capture.height = element.height;
      const context = capture.getContext("2d", { willReadFrequently: true });
      if (!context || !element.paintedLabels) throw new Error("Missing painted word canvas");
      context.drawImage(element, 0, 0);
      const bounds = element.getBoundingClientRect();
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      const words = element.paintedLabels.filter((label) => label.interactive && label.opacity >= 0.52);
      // Count readable pills from the current raster. Geometry outside the
      // crop and an empty backing bitmap cannot contribute a visible word.
      const visibleIds = words.filter((label) => {
        const x = Math.floor(label.centerX / bounds.width * element.width);
        const y = Math.floor(label.centerY / bounds.height * element.height);
        return x >= 0 && x < element.width && y >= 0 && y < element.height
          && pixels[(y * element.width + x) * 4 + 3] > 0;
      }).map((label) => label.id);
      return { ids: visibleIds.sort(), count: Number(element.dataset.readableCount) };
    });
    expect(crop.count).toBe(crop.ids.length);
    expect(crop.count).toBeGreaterThan(0);
    expect(crop.count).toBeLessThan(sceneContract.labels.length);
    await expect(progress).toHaveAttribute("data-current", String(crop.count));
    await expect(progress).toHaveAttribute("data-total", String(sceneContract.labels.length));
    await expect(progress).toHaveAttribute("data-remaining", String(sceneContract.labels.length - crop.count));
    return crop;
  };

  await waitForCameraSettled(page);
  const overview = await captureCrop();
  await page.getByTestId("scene-word-index-toggle").click();
  await expect(page.getByTestId("scene-word-index")).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    if (!element.width || !element.height) return false;
    const capture = document.createElement("canvas");
    capture.width = element.width;
    capture.height = element.height;
    const context = capture.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(element, 0, 0);
    const pixels = context.getImageData(0, 0, capture.width, capture.height).data;
    for (let alpha = 3; alpha < pixels.length; alpha += 4) {
      if (pixels[alpha] > 0) return true;
    }
    return false;
  }), { message: "Opening the word index must clear the last visible word frame" }).toBe(false);
  await page.getByTestId("scene-word-index-close").click();
  await waitForCameraSettled(page);
  await captureCrop();
  await zoomThroughScales(page, [1.65, 2.3, 3.12, AUTHORED_MAX_SCALE]);
  await waitForCameraSettled(page);
  const detail = await captureCrop();
  expect(detail.ids, "zooming to a new crop must change which words are visible").not.toEqual(overview.ids);
  await expect(progress).toHaveAttribute("data-camera-mode", "pan");
});
