import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  LEXICAL_WORLD_OVERVIEW_IMAGE,
  lexicalWorldRealmTiles,
} from "../../app/lib/lexical-world-visuals";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const HOTSPOT = '[data-testid="scene-hotspot"]';
const CONTINUOUS_TILE = '[data-testid="scene-continuous-tile"]';
const CONTINUOUS_TILE_ART = '[data-testid="scene-continuous-tile-art"]';
const SEMANTIC_FIELD = '[data-testid="semantic-zoom-field"]';
const SEMANTIC_PLANE = '[data-testid="semantic-zoom-plane"]';
const SEMANTIC_NODE = '[data-testid="semantic-zoom-node"]';
const SEMANTIC_PROGRESS = '[data-testid="semantic-zoom-progress"]';
const CONTINUITY_TRACE_KEY = "__hellowordsContinuousZoomContract";

interface RectSnapshot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ContinuityTrace {
  readonly forwardPreviewProgress: number[];
  readonly forwardActiveProgress: number[];
  readonly backProgress: number[];
  readonly forbiddenUi: string[];
  lastForwardTileRect?: RectSnapshot;
  firstChildRect?: RectSnapshot;
}

async function nextPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function openWorld(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  return app;
}

async function openSemanticWorld(page: Page): Promise<{ dialog: Locator; field: Locator }> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  await expect(page.locator(APP)).toHaveAttribute("data-scene-loading", "false");
  await page.getByRole("button", { name: /打开 .*10,000 个词/ }).click();
  const dialog = page.getByRole("dialog", { name: "一万个词的分层探索世界" });
  const field = dialog.locator(SEMANTIC_FIELD);
  await expect(dialog).toBeVisible();
  await expect(field).toBeVisible();
  return { dialog, field };
}

async function resolvedSceneAsset(page: Page, sceneId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/data/scenes/${id}.json`);
    if (!response.ok) throw new Error(`Unable to read scene ${id}`);
    const scene = await response.json() as { asset: string };
    return new URL(scene.asset, window.location.href).pathname;
  }, sceneId);
}

async function startContinuityTrace(
  page: Page,
  parentScene: string,
  childScene: string,
  portalId: string,
): Promise<void> {
  await page.evaluate(({ traceKey, parentId, childId, expectedPortalId }) => {
    const trace: ContinuityTrace = {
      forwardPreviewProgress: [],
      forwardActiveProgress: [],
      backProgress: [],
      forbiddenUi: [],
    };
    const rect = (element: Element): RectSnapshot => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const objectFitCoverRect = (image: HTMLImageElement): RectSnapshot => {
      const bounds = image.getBoundingClientRect();
      const naturalWidth = image.naturalWidth || 1600;
      const naturalHeight = image.naturalHeight || 900;
      const scale = Math.max(bounds.width / naturalWidth, bounds.height / naturalHeight);
      const width = naturalWidth * scale;
      const height = naturalHeight * scale;
      return {
        x: bounds.x + (bounds.width - width) / 2,
        y: bounds.y + (bounds.height - height) / 2,
        width,
        height,
      };
    };
    const appendDistinct = (values: number[], value: number) => {
      if (Number.isFinite(value) && values.at(-1) !== value) values.push(value);
    };
    const capture = (paintAligned = false) => {
      for (const selector of [
        ".loading-pill",
        ".scene-transition-veil",
        '[data-testid="scene-transition-layer"]',
      ]) {
        if (document.querySelector(selector) && !trace.forbiddenUi.includes(selector)) {
          trace.forbiddenUi.push(selector);
        }
      }

      const app = document.querySelector<HTMLElement>('[data-testid="world-app"]');
      const tile = document.querySelector<HTMLElement>('[data-testid="scene-continuous-tile"]');
      const tileArt = tile?.querySelector('[data-testid="scene-continuous-tile-art"]');
      if (
        tile
        && tile.dataset.portalId === expectedPortalId
        && tile.dataset.childScene === childId
      ) {
        const progress = Number(tile.dataset.progress);
        if (tile.dataset.direction === "forward") {
          const progressValues = tile.dataset.state === "active"
            ? trace.forwardActiveProgress
            : trace.forwardPreviewProgress;
          appendDistinct(progressValues, progress);
          if (
            paintAligned
            && tile.dataset.state === "active"
            && tile.dataset.handoffReady === "true"
            && app?.dataset.sceneId === parentId
            && tileArt instanceof HTMLImageElement
          ) {
            trace.lastForwardTileRect = objectFitCoverRect(tileArt);
          }
        } else if (tile.dataset.direction === "back") {
          appendDistinct(trace.backProgress, progress);
        }
      }

      if (paintAligned && app?.dataset.sceneId === childId && !trace.firstChildRect) {
        const childArt = document.querySelector(
          '.viewer-shell:not([data-phase]) > .world-viewport > .scene-surface > .scene-art',
        );
        if (childArt) trace.firstChildRect = rect(childArt);
      }
    };
    const observer = new MutationObserver(() => capture(false));
    const probe = { trace, observer, capture, running: true };
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "class",
        "data-direction",
        "data-handoff-ready",
        "data-progress",
        "data-scene-id",
        "data-state",
        "style",
      ],
    });
    const sample = () => {
      capture(true);
      if (probe.running) requestAnimationFrame(sample);
    };
    capture(false);
    requestAnimationFrame(sample);
    Reflect.set(window, traceKey, probe);
  }, {
    traceKey: CONTINUITY_TRACE_KEY,
    parentId: parentScene,
    childId: childScene,
    expectedPortalId: portalId,
  });
}

async function readContinuityTrace(page: Page): Promise<ContinuityTrace> {
  return page.evaluate((traceKey) => (
    Reflect.get(window, traceKey) as { trace: ContinuityTrace }
  ).trace, CONTINUITY_TRACE_KEY);
}

async function finishContinuityTrace(page: Page): Promise<ContinuityTrace> {
  return page.evaluate((traceKey) => {
    const probe = Reflect.get(window, traceKey) as {
      trace: ContinuityTrace;
      observer: MutationObserver;
      capture: (paintAligned?: boolean) => void;
      running: boolean;
    };
    probe.capture(false);
    probe.running = false;
    probe.observer.disconnect();
    return probe.trace;
  }, CONTINUITY_TRACE_KEY);
}

function assertMonotonic(values: readonly number[], direction: "up" | "down"): void {
  expect(values.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < values.length; index += 1) {
    if (direction === "up") expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
    else expect(values[index]).toBeLessThanOrEqual(values[index - 1]);
  }
}

async function assertSemanticBudget(field: Locator, expectedBudget: number): Promise<void> {
  const liveCount = Number(await field.getAttribute("data-live-count"));
  expect(Number.isFinite(liveCount)).toBe(true);
  expect(liveCount).toBeLessThanOrEqual(expectedBudget);
  await expect(field.locator(SEMANTIC_NODE)).toHaveCount(liveCount);
}

async function wheelUntilLevel(
  page: Page,
  field: Locator,
  targetLevel: "subcluster" | "word",
  focusTarget: Locator = field,
): Promise<void> {
  const bounds = await focusTarget.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  for (let index = 0; index < 24; index += 1) {
    if (await field.getAttribute("data-level") === targetLevel) return;
    await page.mouse.wheel(0, -120);
    await nextPaint(page);
  }
  await expect(field).toHaveAttribute("data-level", targetLevel);
}

async function enterLargestSemanticLeaf(field: Locator): Promise<void> {
  await field.locator(`${SEMANTIC_NODE}[data-id="qualities-states"]`).click();
  await expect(field).toHaveAttribute("data-level", "topic");
  await field.locator(`${SEMANTIC_NODE}[data-id="qualities"]`).click();
  await expect(field).toHaveAttribute("data-level", "subcluster");
  const largestLeaf = field.locator(`${SEMANTIC_NODE}[data-id="qualities--general-all"]`);
  await expect(largestLeaf).toBeVisible();
  await expect(largestLeaf).toHaveAttribute("data-count", "1013");
  await largestLeaf.click();
  await expect(field).toHaveAttribute("data-level", "word");
  await expect(field).toHaveAttribute("data-level-total", "1013");
}

async function semanticWordIds(field: Locator): Promise<Set<string>> {
  return new Set(await field.locator(`${SEMANTIC_NODE}[data-level="word"]`).evaluateAll((nodes) => (
    nodes.map((node) => (node as HTMLElement).dataset.id ?? "").filter(Boolean)
  )));
}

async function semanticBackgroundDrag(field: Locator): Promise<{
  start: { x: number; y: number };
  end: { x: number; y: number };
}> {
  return field.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const xFractions = [0.08, 0.16, 0.24, 0.32, 0.4, 0.6, 0.68, 0.76, 0.84, 0.92];
    const yFractions = [0.3, 0.4, 0.5, 0.6, 0.7];
    for (const yFraction of yFractions) {
      for (const xFraction of xFractions) {
        const x = bounds.left + bounds.width * xFraction;
        const y = bounds.top + bounds.height * yFraction;
        const target = document.elementFromPoint(x, y);
        if (!target || !element.contains(target) || target.closest("button")) continue;
        const direction = xFraction <= 0.5 ? 1 : -1;
        return {
          start: { x, y },
          end: {
            x: x + direction * bounds.width * 0.58,
            y,
          },
        };
      }
    }
    throw new Error("semantic field needs an unobstructed background point for panning");
  });
}

async function assertSemanticProgressIsTruthful(field: Locator): Promise<void> {
  const snapshot = await field.evaluate((element) => {
    const root = element as HTMLElement;
    return {
      live: Number(root.dataset.liveCount),
      total: Number(root.dataset.levelTotal),
      remaining: Number(root.dataset.remainingCount),
      text: root.querySelector('[data-testid="semantic-zoom-progress"]')?.textContent ?? "",
    };
  });
  expect(snapshot.total).toBe(1_013);
  expect(snapshot.live).toBeGreaterThan(0);
  expect(snapshot.remaining).toBe(snapshot.total - snapshot.live);
  expect(snapshot.text).toContain(`${snapshot.live.toLocaleString("en-US")} / 1,013`);
  expect(snapshot.text).toContain(`拖动探索其余 ${snapshot.remaining.toLocaleString("en-US")} 词`);
}

test("a warmed portal remains one continuous visual tile through forward and reverse zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "geometry continuity runs in the desktop viewport");
  const app = await openWorld(page);
  const parentScene = await app.getAttribute("data-scene-id");
  expect(parentScene).toBeTruthy();

  const portal = page.locator(HOTSPOT).first();
  const portalRegion = portal.locator("..");
  await expect(portal).toBeVisible();
  const childScene = await portal.getAttribute("data-target-scene");
  const portalId = await portal.getAttribute("data-portal-id");
  expect(childScene).toBeTruthy();
  expect(portalId).toBeTruthy();
  const childAsset = await resolvedSceneAsset(page, childScene!);

  await portal.hover();
  await expect(portalRegion).toHaveAttribute("data-candidate", "true");
  const tile = page.locator(CONTINUOUS_TILE);
  await expect(tile).toHaveCount(1);
  await expect(tile).toHaveAttribute("data-child-scene", childScene!);
  await expect(tile).toHaveAttribute("data-portal-id", portalId!);
  await expect(tile).toHaveAttribute("data-state", "preview");
  await expect(tile).toHaveAttribute("data-direction", "forward");
  await expect(tile).toHaveAttribute("data-progress", /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/);
  const tileArt = tile.locator(CONTINUOUS_TILE_ART);
  await expect(tileArt).toHaveAttribute("src", childAsset);
  await expect.poll(() => tileArt.evaluate((image: HTMLImageElement) => (
    image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  ))).toBe(true);

  await startContinuityTrace(page, parentScene!, childScene!, portalId!);
  const portalBounds = await portal.boundingBox();
  expect(portalBounds).not.toBeNull();
  await page.mouse.move(
    portalBounds!.x + portalBounds!.width / 2,
    portalBounds!.y + portalBounds!.height / 2,
  );
  for (let index = 0; index < 12; index += 1) {
    if (await app.getAttribute("data-scene-id") !== parentScene) break;
    const progress = Number(await tile.getAttribute("data-progress"));
    if (progress > 0.12) break;
    await page.mouse.wheel(0, -80);
    await nextPaint(page);
  }
  await expect.poll(async () => {
    const trace = await readContinuityTrace(page);
    return Math.max(...trace.forwardPreviewProgress, ...trace.forwardActiveProgress, 0);
  }).toBeGreaterThan(0);

  if (await app.getAttribute("data-scene-id") === parentScene) await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", childScene!);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");

  const back = page.getByRole("button", { name: "← 返回上一层" });
  await expect(back).toBeVisible();
  await back.click();
  await expect(app).toHaveAttribute("data-scene-id", parentScene!);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect.poll(async () => (await readContinuityTrace(page)).backProgress.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator(CONTINUOUS_TILE)).toHaveCount(0);

  const trace = await finishContinuityTrace(page);
  expect(trace.forbiddenUi, "warm continuity cannot mount a loader, veil, or duplicate scene layer").toEqual([]);
  assertMonotonic(trace.forwardPreviewProgress, "up");
  assertMonotonic(trace.forwardActiveProgress, "up");
  expect(trace.forwardActiveProgress[0]).toBeGreaterThanOrEqual(trace.forwardPreviewProgress.at(-1)!);
  expect(trace.forwardActiveProgress.at(-1)).toBe(1);
  assertMonotonic(trace.backProgress, "down");
  expect(Math.min(...trace.backProgress)).toBeLessThan(Math.max(...trace.backProgress));
  expect(trace.lastForwardTileRect).toBeDefined();
  expect(trace.firstChildRect).toBeDefined();

  const viewport = await page.locator(VIEWPORT).boundingBox();
  expect(viewport).not.toBeNull();
  const tileCenter = {
    x: trace.lastForwardTileRect!.x + trace.lastForwardTileRect!.width / 2,
    y: trace.lastForwardTileRect!.y + trace.lastForwardTileRect!.height / 2,
  };
  const childCenter = {
    x: trace.firstChildRect!.x + trace.firstChildRect!.width / 2,
    y: trace.firstChildRect!.y + trace.firstChildRect!.height / 2,
  };
  expect(Math.abs(tileCenter.x - childCenter.x)).toBeLessThanOrEqual(viewport!.width * 0.03);
  expect(Math.abs(tileCenter.y - childCenter.y)).toBeLessThanOrEqual(viewport!.height * 0.03);
});

test("wheel interruption finishes reverse continuity and the next portal starts forward cleanly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "precise wheel interruption runs on desktop");
  const app = await openWorld(page);
  const parentScene = await app.getAttribute("data-scene-id");
  const portal = page.locator(HOTSPOT).first();
  const childScene = await portal.getAttribute("data-target-scene");
  expect(parentScene).toBeTruthy();
  expect(childScene).toBeTruthy();
  await portal.hover();
  await expect(page.locator(CONTINUOUS_TILE)).toHaveAttribute("data-state", "preview");
  await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", childScene!);

  await page.getByRole("button", { name: "← 返回上一层" }).click();
  await expect(app).toHaveAttribute("data-scene-id", parentScene!);
  const reverseTile = page.locator(CONTINUOUS_TILE);
  await expect(reverseTile).toHaveAttribute("data-direction", "back");
  await expect(reverseTile).toHaveAttribute("data-state", "active");

  const viewport = page.locator(`.viewer-shell:not([data-phase]) ${VIEWPORT}`);
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, 96);
  await expect(reverseTile).toHaveCount(0);

  await page.getByRole("button", { name: "Fit scene" }).click();
  await expect(page.locator(".viewer-shell:not([data-phase]) .scene-surface")).toHaveAttribute(
    "data-scene-scale",
    "1.000",
  );
  await portal.hover();
  const nextTile = page.locator(CONTINUOUS_TILE);
  await expect(nextTile).toHaveAttribute("data-direction", "forward");
  await expect(nextTile).toHaveAttribute("data-state", "preview");
});

test("a warm commit ignores competing portal intent until its handoff finishes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "the competing focus sequence is deterministic on desktop");
  const app = await openWorld(page);
  const portals = page.locator(HOTSPOT);
  expect(await portals.count()).toBeGreaterThanOrEqual(2);
  const committedPortal = portals.nth(0);
  const competingPortal = portals.nth(1);
  const committedPortalId = await committedPortal.getAttribute("data-portal-id");
  const committedChild = await committedPortal.getAttribute("data-target-scene");
  const competingPortalId = await competingPortal.getAttribute("data-portal-id");
  expect(committedPortalId).toBeTruthy();
  expect(committedChild).toBeTruthy();
  expect(competingPortalId).toBeTruthy();

  await committedPortal.hover();
  const tile = page.locator(CONTINUOUS_TILE);
  await expect(tile).toHaveAttribute("data-child-scene", committedChild!);
  await expect(tile).toHaveAttribute("data-portal-id", committedPortalId!);
  await expect(tile).toHaveAttribute("data-state", "preview");

  const firstHandoffFrame = await page.evaluate(async ({ currentId, competingId }) => {
    const current = document.querySelector<HTMLElement>(
      `[data-testid="scene-hotspot"][data-portal-id="${CSS.escape(currentId)}"]`,
    );
    const competing = document.querySelector<HTMLElement>(
      `[data-testid="scene-hotspot"][data-portal-id="${CSS.escape(competingId)}"]`,
    );
    if (!current || !competing) throw new Error("Both portal controls must remain mounted");
    current.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    competing.focus();
    competing.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const preview = document.querySelector<HTMLElement>('[data-testid="scene-portal-preview"]');
    const activeTile = document.querySelector<HTMLElement>('[data-testid="scene-continuous-tile"]');
    return {
      previewPortal: preview?.dataset.portalId ?? null,
      tilePortal: activeTile?.dataset.portalId ?? null,
      tileChild: activeTile?.dataset.childScene ?? null,
      tileState: activeTile?.dataset.state ?? null,
      competingCandidate: competing.dataset.candidate ?? null,
      competingCueState: competing.dataset.cueState ?? null,
    };
  }, { currentId: committedPortalId!, competingId: competingPortalId! });

  expect(firstHandoffFrame).toEqual({
    // The transient copy may already be removed once the active tile owns the
    // handoff; the tile is the authoritative continuity state from this frame.
    previewPortal: null,
    tilePortal: committedPortalId,
    tileChild: committedChild,
    tileState: "active",
    competingCandidate: "false",
    competingCueState: "idle",
  });
  expect(firstHandoffFrame.previewPortal).not.toBe(competingPortalId);
  expect(firstHandoffFrame.tilePortal).not.toBe(competingPortalId);
  await expect(app).toHaveAttribute("data-scene-id", committedChild!);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
});

test("reduced motion commits the child on its stable fit frame without a portal-position flash", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "first-frame geometry is asserted on desktop");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = await openWorld(page);
  const portal = page.locator(HOTSPOT).first();
  const childScene = await portal.getAttribute("data-target-scene");
  expect(childScene).toBeTruthy();
  await portal.hover();
  await expect(page.locator(CONTINUOUS_TILE)).toHaveCount(1);
  await page.evaluate((targetScene) => {
    const probe: { firstScale: string | null; firstTileCount: number | null } = {
      firstScale: null,
      firstTileCount: null,
    };
    const observer = new MutationObserver(() => {
      const appElement = document.querySelector<HTMLElement>('[data-testid="world-app"]');
      if (probe.firstScale !== null || appElement?.dataset.sceneId !== targetScene) return;
      probe.firstScale = document.querySelector<HTMLElement>(
        ".viewer-shell:not([data-phase]) .scene-surface",
      )?.dataset.sceneScale ?? null;
      probe.firstTileCount = document.querySelectorAll('[data-testid="scene-continuous-tile"]').length;
      observer.disconnect();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-scene-id"],
    });
    Reflect.set(window, "__reducedContinuityFirstFrame", { probe, observer });
  }, childScene!);
  await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", childScene!);
  const firstFrame = await page.evaluate(() => {
    const value = Reflect.get(window, "__reducedContinuityFirstFrame") as {
      probe: { firstScale: string | null; firstTileCount: number | null };
      observer: MutationObserver;
    };
    value.observer.disconnect();
    return value.probe;
  });
  expect(firstFrame).toEqual({ firstScale: "1.000", firstTileCount: 0 });
  await expect(page.locator(".loading-pill, .scene-transition-veil, [data-testid='scene-transition-layer']")).toHaveCount(0);
});

test("the semantic field reveals approved realm tiles and native-size words on one plane", async ({ page }, testInfo) => {
  const { field } = await openSemanticWorld(page);
  const expectedBudget = testInfo.project.name === "mobile-chromium" ? 40 : 80;
  const approvedTiles = lexicalWorldRealmTiles();
  expect(approvedTiles).toHaveLength(10);
  expect(new Set(approvedTiles.map((tile) => tile.asset)).size).toBe(10);

  await expect(field).toHaveAttribute("data-level", "realm");
  const overview = field.locator('[data-testid="semantic-zoom-overview"]');
  await expect(overview).toHaveAttribute("src", LEXICAL_WORLD_OVERVIEW_IMAGE);
  await expect.poll(() => overview.evaluate((image: HTMLImageElement) => (
    image.complete && image.naturalWidth === 1600 && image.naturalHeight === 900
  ))).toBe(true);

  const realmNodes = field.locator(`${SEMANTIC_NODE}[data-level="realm"]`);
  await expect(realmNodes).toHaveCount(10);
  const realmData = await realmNodes.evaluateAll((nodes) => nodes.map((node) => ({
    id: (node as HTMLElement).dataset.id,
    realm: (node as HTMLElement).dataset.realm,
    palette: (node as HTMLElement).dataset.paletteIndex,
    background: getComputedStyle(node).backgroundColor,
    color: getComputedStyle(node).color,
  })));
  expect(realmData.map(({ id }) => id).sort()).toEqual(approvedTiles.map(({ realmId }) => realmId).sort());
  expect(realmData.every(({ id, realm }) => id === realm)).toBe(true);
  expect(new Set(realmData.map(({ palette }) => palette)).size).toBe(10);
  expect(new Set(realmData.map(({ background }) => background)).size).toBeGreaterThanOrEqual(4);

  const contrasts = await realmNodes.evaluateAll((nodes) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas color normalization is required");
    const rgb = (color: string): [number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue];
    };
    const luminance = (color: string) => rgb(color).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    return nodes.map((node) => {
      const style = getComputedStyle(node);
      const light = Math.max(luminance(style.color), luminance(style.backgroundColor));
      const dark = Math.min(luminance(style.color), luminance(style.backgroundColor));
      return (light + 0.05) / (dark + 0.05);
    });
  });
  expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
  await assertSemanticBudget(field, expectedBudget);

  const plane = field.locator(SEMANTIC_PLANE);
  await plane.evaluate((element) => Reflect.set(element, "__semanticPlaneContract", true));
  const selectedTile = approvedTiles[0];
  await field.locator(`${SEMANTIC_NODE}[data-id="${selectedTile.realmId}"]`).click();
  await expect(field).toHaveAttribute("data-level", "topic");
  await expect(field).toHaveAttribute("data-active-realm", selectedTile.realmId);
  await expect(field).toHaveAttribute("data-active-asset", selectedTile.asset);
  expect(await plane.evaluate((element) => Reflect.get(element, "__semanticPlaneContract"))).toBe(true);

  const realmTile = field.locator(
    `[data-testid="semantic-realm-tile"][data-realm="${selectedTile.realmId}"]`,
  );
  await expect(realmTile).toHaveCount(1);
  const realmTileArt = realmTile.locator("img");
  await expect(realmTileArt).toHaveAttribute("src", selectedTile.asset);
  await expect.poll(() => realmTileArt.evaluate((image: HTMLImageElement) => (
    image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  ))).toBe(true);

  const topicNode = field.locator(`${SEMANTIC_NODE}[data-level="topic"]`).first();
  await expect(topicNode).toBeVisible();
  if (testInfo.project.name === "mobile-chromium") {
    await topicNode.click();
  } else {
    await wheelUntilLevel(page, field, "subcluster", topicNode);
  }
  await expect(field).toHaveAttribute("data-level", "subcluster");
  expect(await plane.evaluate((element) => Reflect.get(element, "__semanticPlaneContract"))).toBe(true);
  await field.locator(`${SEMANTIC_NODE}[data-level="subcluster"]`).first().click();
  await expect(field).toHaveAttribute("data-level", "word");

  const labelLayer = field.locator('[data-testid="semantic-zoom-label-layer"]');
  const wordNode = labelLayer.locator(`${SEMANTIC_NODE}[data-level="word"]`).first();
  await expect(wordNode).toBeVisible();
  await assertSemanticBudget(field, expectedBudget);
  await expect(wordNode).toContainText(/\S+/);
  const coordinateContract = await field.evaluate((element) => {
    const planeElement = element.querySelector<HTMLElement>('[data-testid="semantic-zoom-plane"]');
    const labels = element.querySelector<HTMLElement>('[data-testid="semantic-zoom-label-layer"]');
    const word = labels?.querySelector<HTMLElement>('[data-testid="semantic-zoom-node"][data-level="word"]');
    const transform = word ? new DOMMatrixReadOnly(getComputedStyle(word).transform) : null;
    return {
      siblings: planeElement?.parentElement === labels?.parentElement,
      planeContainsLabels: Boolean(planeElement?.contains(labels ?? null)),
      layerTransform: labels ? getComputedStyle(labels).transform : "missing",
      scaleX: transform?.a ?? null,
      skewY: transform?.b ?? null,
      skewX: transform?.c ?? null,
      scaleY: transform?.d ?? null,
    };
  });
  expect(coordinateContract).toEqual({
    siblings: true,
    planeContainsLabels: false,
    layerTransform: "none",
    scaleX: 1,
    skewY: 0,
    skewX: 0,
    scaleY: 1,
  });
});

test("the largest 1,013-word leaf exposes truthful progress while panning reveals new words", async ({ page }, testInfo) => {
  const { field } = await openSemanticWorld(page);
  const expectedBudget = testInfo.project.name === "mobile-chromium" ? 40 : 80;
  await enterLargestSemanticLeaf(field);
  await assertSemanticBudget(field, expectedBudget);
  await assertSemanticProgressIsTruthful(field);

  const progress = field.locator(SEMANTIC_PROGRESS);
  await expect(field).toHaveAttribute("aria-describedby", "semantic-zoom-progress");
  await expect(progress).not.toHaveAttribute("aria-live", /.+/);
  await expect(field.locator("[aria-live='polite']")).toHaveCount(1);
  await field.evaluate((element) => {
    const liveRegion = element.querySelector("[aria-live='polite']");
    if (!liveRegion) throw new Error("The discrete semantic navigation live region is required");
    const probe = { mutations: 0 };
    const observer = new MutationObserver((records) => { probe.mutations += records.length; });
    observer.observe(liveRegion, { childList: true, characterData: true, subtree: true });
    Reflect.set(window, "__semanticProgressLiveProbe", { observer, probe });
  });

  const first = await semanticWordIds(field);
  expect(first.size).toBeGreaterThan(0);
  const drag = await semanticBackgroundDrag(field);
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 8 });
  await page.mouse.up();

  let panned = new Set<string>();
  await expect.poll(async () => {
    panned = await semanticWordIds(field);
    return new Set([...first, ...panned]).size;
  }).toBeGreaterThan(first.size);
  await assertSemanticBudget(field, expectedBudget);
  await assertSemanticProgressIsTruthful(field);
  const liveMutations = await field.evaluate(() => {
    const value = Reflect.get(window, "__semanticProgressLiveProbe") as {
      observer: MutationObserver;
      probe: { mutations: number };
    };
    value.observer.disconnect();
    return value.probe.mutations;
  });
  expect(liveMutations, "continuous camera frames must not flood the polite live region").toBe(0);
});

test("keyboard semantic zoom remains complete when motion is reduced", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "keyboard coverage runs in the desktop project");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { field } = await openSemanticWorld(page);

  for (const [level, nextLevel] of [
    ["realm", "topic"],
    ["topic", "subcluster"],
    ["subcluster", "word"],
  ] as const) {
    const node = field.locator(`${SEMANTIC_NODE}[data-level="${level}"]`).first();
    await expect(node).toBeVisible();
    await node.focus();
    await expect(node).toBeFocused();
    await node.press("Enter");
    await expect(field).toHaveAttribute("data-level", nextLevel);
  }

  await expect(field.locator(`${SEMANTIC_NODE}[data-level="word"]`).first()).toBeVisible();
  const maximumMotionDuration = await field.locator([
    SEMANTIC_PLANE,
    '[data-testid="semantic-zoom-label-layer"]',
    SEMANTIC_NODE,
  ].join(",")).evaluateAll((elements) => {
    const milliseconds = (value: string) => value.split(",").map((part) => {
      const duration = part.trim();
      return duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000;
    });
    return Math.max(0, ...elements.flatMap((element) => {
      const style = getComputedStyle(element);
      return [...milliseconds(style.animationDuration), ...milliseconds(style.transitionDuration)];
    }));
  });
  expect(maximumMotionDuration).toBe(0);
});
