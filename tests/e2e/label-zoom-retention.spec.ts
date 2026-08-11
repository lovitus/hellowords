import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const SURFACE = ".scene-surface";
const LABEL_LAYER = '[data-testid="scene-label-layer"]';
const INTERACTION_LAYER = '[data-testid="scene-interaction-layer"]';
const TARGET_SCENE = "community-garden";
const MAX_SCALE = 4.15;

interface TraceRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface TraceLabel {
  readonly id: string;
  readonly word: string;
  readonly lod: number;
  readonly interactive: boolean;
  readonly logicalOpacity: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly bounds: TraceRect;
  readonly ariaHidden: string | null;
  readonly tabIndex: number;
}

interface LabelZoomFrame {
  readonly timestamp: number;
  readonly sceneId: string;
  readonly scale: number;
  readonly lodLevel: number;
  readonly cameraTransform: string;
  readonly motionFrozen: boolean;
  readonly viewport: TraceRect;
  readonly protectedRegions: readonly TraceRect[];
  readonly labels: readonly TraceLabel[];
}

interface SceneContract {
  readonly labels: ReadonlyArray<{
    readonly id: string;
    readonly minLevel?: number;
    readonly maxScale?: number;
  }>;
}

async function openLeafScene(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");

  const portal = page.locator(
    `[data-testid="scene-hotspot"][data-target-scene="${TARGET_SCENE}"]`,
  );
  await expect(portal).toBeVisible();
  await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", TARGET_SCENE);
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
    if (!app || !viewport || !surface || !labelLayer) {
      throw new Error("label zoom trace requires the active scene viewport");
    }

    const frames: LabelZoomFrame[] = [];
    let active = true;
    let animationFrame = 0;
    let lastSignature = "";

    const toGlobalRect = (
      viewportRect: DOMRect,
      left: number,
      right: number,
      top: number,
      bottom: number,
    ): TraceRect => ({
      left: viewportRect.left + left,
      right: viewportRect.left + right,
      top: viewportRect.top + top,
      bottom: viewportRect.top + bottom,
    });

    const viewerChromeRegions = (viewportRect: DOMRect): TraceRect[] => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const compact = width <= 900;
      const phone = width <= 560;
      const minimapRight = Math.min(width, phone ? 312 : compact ? 348 : 412);
      const minimapBottom = phone ? 112 : compact ? 116 : 126;
      const regions = [toGlobalRect(
        viewportRect,
        0,
        minimapRight,
        0,
        minimapBottom,
      )];
      if (!phone) {
        regions.push(toGlobalRect(
          viewportRect,
          Math.max(0, width / 2 - 205),
          Math.min(width, width / 2 + 205),
          0,
          82,
        ));
      }
      regions.push(toGlobalRect(
        viewportRect,
        Math.max(0, width - (phone ? 116 : 260)),
        width,
        0,
        phone ? 82 : 86,
      ));
      regions.push(toGlobalRect(
        viewportRect,
        Math.max(0, width - 184),
        width,
        Math.max(0, height - 88),
        height,
      ));
      regions.push(toGlobalRect(
        viewportRect,
        0,
        phone ? 150 : 190,
        Math.max(0, height - 88),
        height,
      ));
      if (phone) {
        regions.push(toGlobalRect(
          viewportRect,
          12,
          Math.max(12, width - 12),
          Math.max(0, height - 144),
          Math.max(0, height - 64),
        ));
      }
      return regions;
    };

    const portalCueRegions = (viewportRect: DOMRect): TraceRect[] => {
      const compact = viewport.clientWidth <= 900;
      const cueWidth = compact ? 154 : 204;
      const cueTop = compact ? 30 : 32;
      const cueBottom = compact ? 56 : 62;
      return [...document.querySelectorAll<HTMLElement>(".scene-hotspot-region")].flatMap((region) => {
        const bounds = region.getBoundingClientRect();
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        if (
          centerX < viewportRect.left - cueWidth / 2
          || centerX > viewportRect.right + cueWidth / 2
          || centerY < viewportRect.top - cueBottom
          || centerY > viewportRect.bottom + cueTop
        ) return [];
        return [{
          left: centerX - cueWidth / 2,
          right: centerX + cueWidth / 2,
          top: centerY - cueTop,
          bottom: centerY + cueBottom,
        }];
      });
    };

    const capture = () => {
      const scale = Number(surface.dataset.sceneScale);
      const cameraTransform = surface.style.transform;
      const signature = `${app.dataset.sceneId}:${scale.toFixed(3)}:${cameraTransform}`;
      if (Number.isFinite(scale) && signature !== lastSignature) {
        lastSignature = signature;
        const viewportRect = viewport.getBoundingClientRect();
        const camera = new DOMMatrixReadOnly(cameraTransform);
        const labels = [...labelLayer.querySelectorAll<HTMLElement>('[data-testid="word-label"]')]
          .map((label): TraceLabel => {
            const anchor = camera.transformPoint({
              x: Number(label.dataset.anchorX),
              y: Number(label.dataset.anchorY),
            });
            const bounds = label.getBoundingClientRect();
            return {
              id: label.dataset.labelId ?? "",
              word: label.querySelector<HTMLElement>(":scope > span:not(.word-anchor-marker)")
                ?.textContent?.trim() ?? label.getAttribute("aria-label") ?? "",
              lod: Number(label.dataset.lod),
              interactive: label.dataset.interactive === "true",
              logicalOpacity: Number(label.style.getPropertyValue("--label-opacity")),
              anchorX: viewportRect.left + anchor.x,
              anchorY: viewportRect.top + anchor.y,
              offsetX: -Number.parseFloat(label.style.getPropertyValue("--label-anchor-x")),
              offsetY: -Number.parseFloat(label.style.getPropertyValue("--label-anchor-y")),
              width: bounds.width,
              height: bounds.height,
              bounds: {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
              },
              ariaHidden: label.getAttribute("aria-hidden"),
              tabIndex: label.tabIndex,
            };
          });
        frames.push({
          timestamp: performance.now(),
          sceneId: app.dataset.sceneId ?? "",
          scale,
          lodLevel: Number(surface.dataset.lodLevel),
          cameraTransform,
          motionFrozen: labelLayer.dataset.motionFrozen === "true",
          viewport: {
            left: viewportRect.left,
            right: viewportRect.right,
            top: viewportRect.top,
            bottom: viewportRect.bottom,
          },
          protectedRegions: [
            ...viewerChromeRegions(viewportRect),
            ...portalCueRegions(viewportRect),
          ],
          labels,
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

  for (const target of targets) {
    await expect.poll(async () => {
      const scale = Number(await surface.getAttribute("data-scene-scale"));
      if (Number.isFinite(scale) && scale < target * 0.998) {
        const factor = Math.min(1.12, target / Math.max(0.01, scale));
        await page.mouse.wheel(0, -Math.log(factor) / 0.0017);
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
    { message: "scene zoom reaches the authored maximum-mode threshold" },
  ).toBeGreaterThanOrEqual(MAX_SCALE - 0.02);
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

function projectedPreferredSlot(
  previous: TraceLabel,
  current: TraceLabel,
  frame: LabelZoomFrame,
): TraceRect | null {
  const detailed = current.lod >= 3;
  const wordWidth = Math.max(
    24,
    Array.from(current.word).length * (detailed ? 6.55 : 7.15),
  );
  // Keep this reservation footprint identical to estimatedLabelSize with
  // meanings hidden. DOM text width can be several pixels narrower while the
  // production collision pass deliberately reserves the conservative size.
  const width = Math.min(250, (detailed ? 27 : 31) + wordWidth);
  const height = detailed ? 28 : 30;
  const slot = {
    left: current.anchorX + previous.offsetX - width / 2,
    right: current.anchorX + previous.offsetX + width / 2,
    top: current.anchorY + previous.offsetY - height / 2,
    bottom: current.anchorY + previous.offsetY + height / 2,
  };
  const margin = 6;
  return slot.left >= frame.viewport.left + margin
    && slot.right <= frame.viewport.right - margin
    && slot.top >= frame.viewport.top + margin
    && slot.bottom <= frame.viewport.bottom - margin
    && !frame.protectedRegions.some((region) => overlaps(slot, region, 0))
    ? slot
    : null;
}

function previousSlotHasNoActiveContention(
  previous: TraceLabel,
  current: TraceLabel,
  previousFrame: LabelZoomFrame,
  currentFrame: LabelZoomFrame,
): boolean {
  const slot = projectedPreferredSlot(previous, current, currentFrame);
  if (!slot) return false;
  const currentById = new Map(currentFrame.labels.map((label) => [label.id, label]));
  const conflictsWithActiveReservation = previousFrame.labels.some((otherPrevious) => {
    if (!otherPrevious.interactive || otherPrevious.id === previous.id) return false;
    const otherCurrent = currentById.get(otherPrevious.id);
    if (!otherCurrent) return false;
    const otherSlot = projectedPreferredSlot(otherPrevious, otherCurrent, currentFrame);
    return otherSlot !== null && overlaps(slot, otherSlot, 0);
  });
  if (conflictsWithActiveReservation) return false;

  // Reproduce the normal placement pass after reservation: an earlier label
  // may legitimately occupy this old slot even when it was not active in the
  // preceding frame. Desktop collision padding is 2px in labelLayout.
  return !currentFrame.labels.some((otherCurrent) => (
    otherCurrent.id !== previous.id
    && otherCurrent.interactive
    && overlaps(slot, otherCurrent.bounds, 2)
  ));
}

test("continuous zoom retains grounded labels and their object-relative slots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  const app = await openLeafScene(page);
  const sceneContract = await page.evaluate(async (sceneId): Promise<SceneContract> => {
    const response = await fetch(`/data/scenes/${encodeURIComponent(sceneId)}.json`);
    if (!response.ok) throw new Error(`Unable to load scene contract for ${sceneId}`);
    return response.json() as Promise<SceneContract>;
  }, TARGET_SCENE);

  await startLabelZoomTrace(page);
  await zoomThroughScales(page, [1.2, 1.65, 2.3, 3.12, MAX_SCALE]);
  await waitForCameraSettled(page);
  const frames = (await stopLabelZoomTrace(page)).filter((frame) => (
    frame.sceneId === TARGET_SCENE && !frame.motionFrozen
  ));

  await expect(app).toHaveAttribute("data-scene-id", TARGET_SCENE);
  expect(frames.length, "rAF trace must cover multiple continuous camera frames").toBeGreaterThan(12);
  expect(frames.at(-1)?.scale).toBeCloseTo(MAX_SCALE, 3);
  expect(frames.some((frame) => frame.lodLevel === 4), "trace must reach the deepest LOD").toBe(true);

  const legalViewportDepartures = new Set<string>();
  const legalSlotChanges = new Set<string>();
  let retainedFrameChecks = 0;
  let stableSlotChecks = 0;
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const byId = new Map(frame.labels.map((label) => [label.id, label]));
    if (frameIndex === 0) continue;

    const previous = frames[frameIndex - 1];
    expect(
      frame.scale,
      `zoom scale reversed between rAF samples ${frameIndex - 1} and ${frameIndex}`,
    ).toBeGreaterThanOrEqual(previous.scale - 0.001);
    for (const previousLabel of previous.labels.filter((label) => label.interactive)) {
      const current = byId.get(previousLabel.id);
      expect(current, `label ${previousLabel.id} must remain authored in every frame`).toBeDefined();
      if (!anchorInsideViewport(current!, frame)) {
        legalViewportDepartures.add(previousLabel.id);
        continue;
      }
      if (!previousSlotHasNoActiveContention(previousLabel, current!, previous, frame)) {
        legalSlotChanges.add(previousLabel.id);
        continue;
      }
      retainedFrameChecks += 1;
      expect(
        current!.interactive,
        `${previousLabel.id} became inactive at scale ${frame.scale.toFixed(3)} while its object anchor remained on screen`,
      ).toBe(true);
      stableSlotChecks += 1;
      expect(
        current!.offsetX,
        `${previousLabel.id} changed callout side although its previous horizontal slot still fit`,
      ).toBeCloseTo(previousLabel.offsetX, 2);
      expect(
        current!.offsetY,
        `${previousLabel.id} changed callout side although its previous vertical slot still fit`,
      ).toBeCloseTo(previousLabel.offsetY, 2);
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

  const finalFrame = frames.at(-1)!;
  const finalById = new Map(finalFrame.labels.map((label) => [label.id, label]));
  const defaultOverviewIds = new Set(sceneContract.labels.filter((label) => (
    (label.minLevel ?? 0) <= 2 && label.maxScale === undefined
  )).map((label) => label.id));
  const previousFinalFrame = frames.at(-2)!;
  const retainedOverviewAtMax = previousFinalFrame.labels
    .filter((previousLabel) => previousLabel.interactive && defaultOverviewIds.has(previousLabel.id))
    .filter((previousLabel) => {
      const label = finalById.get(previousLabel.id);
      return Boolean(label
        && anchorInsideViewport(label, finalFrame)
        && previousSlotHasNoActiveContention(
          previousLabel,
          label,
          previousFinalFrame,
          finalFrame,
        ));
    })
    .map((label) => label.id);
  expect(
    retainedOverviewAtMax.length,
    "max zoom must retain an observable sample of default LOD 0–2 vocabulary",
  ).toBeGreaterThan(0);
  for (const id of retainedOverviewAtMax) {
    const label = finalById.get(id)!;
    expect(label.interactive, `${id} must not be retired at max zoom`).toBe(true);
    expect(label.logicalOpacity, `${id} must keep full logical opacity at max zoom`).toBeGreaterThanOrEqual(0.99);
    expect(label.ariaHidden, `${id} must remain exposed to assistive technology`).toBe("false");
    expect(label.tabIndex, `${id} must remain keyboard reachable`).toBe(0);
  }
});

test("viewport progress distinguishes the current crop from the full scene", async ({ page }) => {
  await openLeafScene(page);
  const progress = page.getByTestId("scene-word-progress");
  await expect(progress).toBeVisible();

  const sceneContract = await page.evaluate(async (sceneId): Promise<SceneContract> => {
    const response = await fetch(`/data/scenes/${encodeURIComponent(sceneId)}.json`);
    if (!response.ok) throw new Error(`Unable to load scene contract for ${sceneId}`);
    return response.json() as Promise<SceneContract>;
  }, TARGET_SCENE);
  await expect(progress).toHaveAttribute("data-total", String(sceneContract.labels.length));
  await expect.poll(async () => Number(await progress.getAttribute("data-current"))).toBeGreaterThan(0);

  await zoomThroughScales(page, [1.65, 2.3, 3.12, MAX_SCALE]);
  await waitForCameraSettled(page);
  const snapshot = await progress.evaluate((element) => ({
    current: Number((element as HTMLElement).dataset.current),
    total: Number((element as HTMLElement).dataset.total),
    remaining: Number((element as HTMLElement).dataset.remaining),
    cameraMode: (element as HTMLElement).dataset.cameraMode,
    text: element.textContent ?? "",
  }));
  expect(snapshot.current).toBeGreaterThan(0);
  expect(snapshot.current + snapshot.remaining).toBe(snapshot.total);
  expect(snapshot.cameraMode).toBe("pan");
  expect(snapshot.text).toContain("拖动");
});
