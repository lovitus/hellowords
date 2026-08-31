import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const LABEL_LAYER = '[data-testid="scene-label-layer"]';
const INTERACTION_LAYER = '[data-testid="scene-interaction-layer"]';
const HOTSPOT = '[data-testid="scene-hotspot"]';
const CONTINUOUS_TILE = '[data-testid="scene-continuous-tile"]';
const TRANSITION_PROBE = "__batchSceneTransitionProbe";

interface ManifestEntry {
  id: string;
  parentId: string | null;
}

interface SceneManifest {
  rootSceneId: string;
  scenes: ManifestEntry[];
}

interface RuntimeScene {
  id: string;
  parentId: string | null;
  asset: string;
  labels: Array<{ id: string; lexemeId?: string; sourceVisualRegion?: string }>;
  portals: Array<{ id: string; childSceneId: string }>;
}

interface SceneRuntimeResult {
  id: string;
  asset: string;
  decodedWidth: number;
  decodedHeight: number;
  readableWords: number;
  authoredLabelCount: number;
  mountedLabelCount: number;
  interactiveLabelCount: number;
  distinctVisualRegions: number;
  distinctSemanticGroups: number;
  distinctPaletteIndices: number;
  missingSemanticData: number;
  realmLinkedLabels: number;
  fallbackLinkedLabels: number;
}

interface TransitionProbeResult {
  forbiddenUi: string[];
  maxActiveShells: number;
  sawForwardActiveTile: boolean;
  sawBackActiveTile: boolean;
}

interface PortalRuntimeResult {
  parent: string;
  child: string;
  forwardMs: number;
  backMs: number;
  forwardForbiddenUi: string[];
  backForbiddenUi: string[];
  maxActiveShells: number;
  returnRequests: string[];
  parentRefetches: string[];
}

async function readSceneContracts(): Promise<{
  manifest: SceneManifest;
  sceneById: Map<string, RuntimeScene>;
}> {
  const root = process.cwd();
  const manifest = JSON.parse(
    await readFile(resolve(root, "public/data/scenes/manifest.json"), "utf8"),
  ) as SceneManifest;
  const scenes = await Promise.all(manifest.scenes.map(async ({ id }) => JSON.parse(
    await readFile(resolve(root, `public/data/scenes/${id}.json`), "utf8"),
  ) as RuntimeScene));
  return { manifest, sceneById: new Map(scenes.map((scene) => [scene.id, scene])) };
}

async function waitForScene(page: Page, app: Locator, sceneId: string): Promise<void> {
  await expect(app).toHaveAttribute("data-scene-id", sceneId);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");
  await expect(page.locator(LABEL_LAYER)).toHaveAttribute("data-motion-frozen", "false");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-motion-frozen", "false");
  // Wait for the observable product condition instead of adding 180 ms to
  // every recursive entry and return (including already-settled scenes).
  if (sceneId !== "world-map") {
    await expect.poll(() => page.getByTestId("word-label").evaluateAll((nodes) => nodes.filter((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      return element.dataset.interactive === "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity) >= 0.8;
    }).length)).toBeGreaterThan(0);
  }
}

async function auditCurrentScene(
  page: Page,
  scene: RuntimeScene,
  mode: "desktop" | "mobile",
): Promise<SceneRuntimeResult> {
  const art = page.locator(".viewer-shell:not([data-phase]) .scene-art");
  await expect(art).toHaveCount(1);
  await expect(art).toHaveAttribute("src", scene.asset);
  const image = await art.evaluate((element: HTMLImageElement) => ({
    complete: element.complete,
    width: element.naturalWidth,
    height: element.naturalHeight,
    src: element.currentSrc || element.src,
  }));
  expect(image.complete, `${scene.id} artwork must finish loading`).toBe(true);
  expect(image.width, `${scene.id} artwork must decode`).toBeGreaterThan(0);
  expect(image.height, `${scene.id} artwork must decode`).toBeGreaterThan(0);
  expect(new URL(image.src).pathname, `${scene.id} must not render an SVG`).not.toMatch(/\.svg$/i);
  expect(scene.asset, `${scene.id} scene JSON must not reference an SVG`).not.toMatch(/\.svg(?:\?|$)/i);

  const progress = page.getByTestId("scene-word-progress");
  await expect(progress).toHaveAttribute("data-total", String(scene.labels.length));
  await expect.poll(async () => {
    const interactive = await page.getByTestId("word-label").evaluateAll((nodes) => (
      nodes.filter((node) => (node as HTMLElement).dataset.interactive === "true").length
    ));
    return interactive - Number(await progress.getAttribute("data-current"));
  }, {
    message: `${scene.id} must mount every label in the complete layout's interactive set`,
  }).toBe(0);

  const linkedLabelIds = scene.labels.filter(({ lexemeId }) => lexemeId).map(({ id }) => id);
  const labels = await page.getByTestId("word-label").evaluateAll((nodes, contract) => {
    const linked = new Set(contract.linkedLabelIds);
    const visualRegionById = new Map(contract.visualRegions);
    const readable = nodes.filter((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      return element.dataset.interactive === "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity) >= 0.8;
    });
    const semanticRows = nodes.map((node) => {
      const element = node as HTMLElement;
      const semanticStyle = getComputedStyle(element);
      return {
        labelId: element.dataset.labelId ?? "",
        visualRegion: visualRegionById.get(element.dataset.labelId ?? "") ?? "",
        semanticGroup: element.dataset.semanticGroup ?? "",
        paletteIndex: element.dataset.paletteIndex ?? "",
        surface: semanticStyle.getPropertyValue("--label-semantic-surface"),
        border: semanticStyle.getPropertyValue("--label-semantic-border"),
      };
    });
    return {
      readableWords: readable.length,
      mountedLabelCount: nodes.length,
      interactiveLabelCount: nodes.filter((node) => (
        (node as HTMLElement).dataset.interactive === "true"
      )).length,
      distinctVisualRegions: new Set(semanticRows.map(({ visualRegion }) => visualRegion)).size,
      distinctSemanticGroups: new Set(semanticRows.map(({ semanticGroup }) => semanticGroup)).size,
      distinctPaletteIndices: new Set(semanticRows.map(({ paletteIndex }) => paletteIndex)).size,
      missingSemanticData: semanticRows.filter((row) => (
        !row.visualRegion || !row.semanticGroup || !row.paletteIndex || !row.surface || !row.border
      )).length,
      realmLinkedLabels: semanticRows.filter((row) => (
        linked.has(row.labelId) && Number.parseInt(row.paletteIndex, 10) < 10
      )).length,
      fallbackLinkedLabels: semanticRows.filter((row) => (
        linked.has(row.labelId) && Number.parseInt(row.paletteIndex, 10) >= 10
      )).length,
    };
  }, {
    linkedLabelIds,
    visualRegions: scene.labels.map(
      ({ id, sourceVisualRegion }) => [id, sourceVisualRegion ?? ""] as const,
    ),
  });
  if (scene.id === "world-map") {
    expect(labels.mountedLabelCount, "the root atlas stays visually calm before district hover").toBe(0);
  } else {
    expect(labels.mountedLabelCount, `${scene.id} must mount a bounded authored window`).toBeGreaterThan(0);
  }
  expect(labels.mountedLabelCount, `${scene.id} must respect the ${mode} label DOM ceiling`).toBeLessThanOrEqual(
    mode === "mobile" ? 128 : 256,
  );

  return {
    id: scene.id,
    asset: scene.asset,
    decodedWidth: image.width,
    decodedHeight: image.height,
    authoredLabelCount: scene.labels.length,
    ...labels,
  };
}

async function startTransitionProbe(page: Page): Promise<void> {
  await page.evaluate((probeKey) => {
    const trace: TransitionProbeResult = {
      forbiddenUi: [],
      maxActiveShells: 0,
      sawForwardActiveTile: false,
      sawBackActiveTile: false,
    };
    const sample = () => {
      for (const selector of [
        ".loading-pill",
        ".scene-transition-veil",
        '[data-testid="scene-transition-layer"]',
      ]) {
        if (document.querySelector(selector) && !trace.forbiddenUi.includes(selector)) {
          trace.forbiddenUi.push(selector);
        }
      }
      trace.maxActiveShells = Math.max(
        trace.maxActiveShells,
        document.querySelectorAll(".viewer-shell:not([data-phase])").length,
      );
      const tile = document.querySelector<HTMLElement>('[data-testid="scene-continuous-tile"]');
      if (tile?.dataset.state === "active" && tile.dataset.direction === "forward") {
        trace.sawForwardActiveTile = true;
      }
      if (tile?.dataset.state === "active" && tile.dataset.direction === "back") {
        trace.sawBackActiveTile = true;
      }
    };
    let running = true;
    const animationSample = () => {
      sample();
      if (running) requestAnimationFrame(animationSample);
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class", "data-direction", "data-phase", "data-state"],
    });
    sample();
    requestAnimationFrame(animationSample);
    Reflect.set(window, probeKey, {
      trace,
      observer,
      stop() {
        running = false;
        observer.disconnect();
        sample();
      },
    });
  }, TRANSITION_PROBE);
}

async function finishTransitionProbe(page: Page): Promise<TransitionProbeResult> {
  return page.evaluate((probeKey) => {
    const probe = Reflect.get(window, probeKey) as {
      trace: TransitionProbeResult;
      stop: () => void;
    };
    probe.stop();
    return probe.trace;
  }, TRANSITION_PROBE);
}

async function preparePortal(
  page: Page,
  childId: string,
  mode: "desktop" | "mobile",
): Promise<Locator> {
  const portal = page.locator(`${HOTSPOT}[data-target-scene="${childId}"]`);
  await expect(portal).toHaveCount(1);
  await expect(portal).toBeVisible();
  if (mode === "desktop") {
    await portal.focus();
    const tile = page.locator(`${CONTINUOUS_TILE}[data-child-scene="${childId}"]`);
    await expect(tile).toHaveAttribute("data-state", "preview");
    await expect.poll(() => tile.locator("img").evaluate((image: HTMLImageElement) => (
      image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    ))).toBe(true);
  }
  return portal;
}

async function runTreeAudit(
  page: Page,
  app: Locator,
  sceneById: ReadonlyMap<string, RuntimeScene>,
  sceneId: string,
  mode: "desktop" | "mobile",
  visited: Set<string>,
  sceneResults: SceneRuntimeResult[],
  portalResults: PortalRuntimeResult[],
  sceneRequests: string[],
): Promise<void> {
  const scene = sceneById.get(sceneId);
  expect(scene, `${sceneId} must have a scene payload`).toBeDefined();
  expect(visited.has(sceneId), `${sceneId} must be reached only once in the scene tree`).toBe(false);
  visited.add(sceneId);
  await waitForScene(page, app, sceneId);
  sceneResults.push(await auditCurrentScene(page, scene!, mode));

  for (const { childSceneId } of scene!.portals) {
    const portal = await preparePortal(page, childSceneId, mode);
    const forwardStarted = performance.now();
    if (mode === "desktop") await startTransitionProbe(page);
    await portal.dispatchEvent("click", { detail: 1 });
    await waitForScene(page, app, childSceneId);
    const forwardMs = performance.now() - forwardStarted;
    const forwardTrace = mode === "desktop"
      ? await finishTransitionProbe(page)
      : { forbiddenUi: [], maxActiveShells: 1, sawForwardActiveTile: true, sawBackActiveTile: false };
    if (mode === "desktop") {
      expect(forwardTrace.forbiddenUi, `${sceneId} -> ${childSceneId} must stay continuous`).toEqual([]);
      expect(forwardTrace.maxActiveShells).toBe(1);
      expect(forwardTrace.sawForwardActiveTile, `${sceneId} -> ${childSceneId} must use the live tile`).toBe(true);
    }

    await runTreeAudit(
      page,
      app,
      sceneById,
      childSceneId,
      mode,
      visited,
      sceneResults,
      portalResults,
      sceneRequests,
    );

    const requestsBeforeReturn = sceneRequests.length;
    const backStarted = performance.now();
    if (mode === "desktop") await startTransitionProbe(page);
    await page.getByRole("button", { name: "← 返回上一层" }).dispatchEvent("click", { detail: 1 });
    await waitForScene(page, app, sceneId);
    const backMs = performance.now() - backStarted;
    const backTrace = mode === "desktop"
      ? await finishTransitionProbe(page)
      : { forbiddenUi: [], maxActiveShells: 1, sawForwardActiveTile: false, sawBackActiveTile: true };
    const returnRequests = sceneRequests.slice(requestsBeforeReturn);
    const parentRefetches = returnRequests.filter((pathname) => (
      pathname === `/data/scenes/${sceneId}.json` || pathname === scene!.asset
    ));
    if (mode === "desktop") {
      expect(backTrace.forbiddenUi, `${childSceneId} -> ${sceneId} must stay continuous`).toEqual([]);
      expect(backTrace.maxActiveShells).toBe(1);
      expect(backTrace.sawBackActiveTile, `${childSceneId} -> ${sceneId} must use the live tile`).toBe(true);
      expect(parentRefetches, `${childSceneId} -> ${sceneId} must not refetch its parent`).toEqual([]);
      portalResults.push({
        parent: sceneId,
        child: childSceneId,
        forwardMs,
        backMs,
        forwardForbiddenUi: forwardTrace.forbiddenUi,
        backForbiddenUi: backTrace.forbiddenUi,
        maxActiveShells: Math.max(forwardTrace.maxActiveShells, backTrace.maxActiveShells),
        returnRequests,
        parentRefetches,
      });
    }
  }
}

test.describe("exhaustive authored-scene runtime audit", () => {
  test.skip(
    process.env.RUNTIME_AUDIT !== "1",
    "the exhaustive traversal runs only in the scheduled/pre-release runtime audit",
  );

  for (const mode of ["desktop", "mobile"] as const) {
    test(`all authored scenes expose a grounded ${mode} runtime`, async ({ page }, testInfo) => {
    test.skip(
      (mode === "desktop" && testInfo.project.name !== "chromium")
      || (mode === "mobile" && testInfo.project.name !== "mobile-chromium"),
      `the ${mode} audit runs only in its matching project`,
    );
    test.setTimeout(180_000);
    if (mode === "mobile") await page.emulateMedia({ reducedMotion: "reduce" });

    const { manifest, sceneById } = await readSceneContracts();
    const sceneRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (/\/(?:data\/scenes\/[^/]+\.json|scenes\/[^/]+\.(?:jpe?g|webp|avif))$/i.test(pathname)) {
        sceneRequests.push(pathname);
      }
    });
    await page.goto("/#world", { waitUntil: "domcontentloaded" });
    const app = page.locator(APP);
    await expect(app).toBeVisible();

    const visited = new Set<string>();
    const sceneResults: SceneRuntimeResult[] = [];
    const portalResults: PortalRuntimeResult[] = [];
    await runTreeAudit(
      page,
      app,
      sceneById,
      manifest.rootSceneId,
      mode,
      visited,
      sceneResults,
      portalResults,
      sceneRequests,
    );
    expect([...visited].sort()).toEqual(manifest.scenes.map(({ id }) => id).sort());
    expect(sceneResults).toHaveLength(manifest.scenes.length);
    if (mode === "desktop") {
      expect(portalResults).toHaveLength(
        [...sceneById.values()].reduce((sum, scene) => sum + scene.portals.length, 0),
      );
    }

    await mkdir("artifacts/audit", { recursive: true });
    await writeFile(
      `artifacts/audit/runtime-scenes-${mode}.json`,
      `${JSON.stringify({ mode, scenes: sceneResults, portals: portalResults }, null, 2)}\n`,
    );
    expect(
      sceneResults.filter(({ readableWords }) => readableWords === 0).map(({ id }) => id),
      `${mode} keeps only the root atlas word-free until one district is hovered`,
    ).toEqual(["world-map"]);
    expect(
      sceneResults.filter(({ missingSemanticData }) => missingSemanticData > 0)
        .map(({ id, missingSemanticData }) => ({ id, missingSemanticData })),
      `${mode} labels must expose semantic palette data`,
    ).toEqual([]);
    const realmLinkedLabels = sceneResults.reduce((sum, result) => sum + result.realmLinkedLabels, 0);
    const fallbackLinkedLabels = sceneResults.reduce((sum, result) => sum + result.fallbackLinkedLabels, 0);
    expect(realmLinkedLabels, `${mode} linked labels must prefer realm palettes`).toBeGreaterThan(
      fallbackLinkedLabels,
    );
    expect(fallbackLinkedLabels, `${mode} linked labels must not use visual fallbacks`).toBe(0);
    });
  }
});
