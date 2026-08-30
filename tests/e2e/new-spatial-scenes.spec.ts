import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const INTERACTION_LAYER = '[data-testid="scene-interaction-layer"]';
const HOTSPOT = '[data-testid="scene-hotspot"]';
const AUTHORED_CUE = '[data-testid="scene-vocabulary-cue"][data-cue-source="authored-zone"]';
const projectRoot = process.cwd();

interface SceneFile {
  id: string;
  title: string;
  asset: string;
  detailZones?: Array<{ id: string }>;
}

interface ManifestFile {
  scenes: Array<{ id: string }>;
}

interface NewSceneContract {
  target: string;
  path: string[];
  parent: string;
  asset: string;
  title: string;
  authoredZoneCount: number;
  desktopMinimumWords: number;
  mobileMinimumWords: number;
  runOnMobile: boolean;
}

interface ReturnTrace {
  loaderAppeared: boolean;
  settled: Array<{ from: string; to: string; cache: "warm" | "cold" }>;
}

function readScene(sceneId: string): SceneFile {
  return JSON.parse(
    readFileSync(resolve(projectRoot, `public/data/scenes/${sceneId}.json`), "utf8"),
  ) as SceneFile;
}

function contract(
  target: string,
  parent: string,
  path: string[],
  options: Pick<NewSceneContract, "desktopMinimumWords" | "mobileMinimumWords" | "runOnMobile">,
): NewSceneContract {
  const scene = readScene(target);
  return {
    target,
    parent,
    path,
    asset: scene.asset,
    title: scene.title,
    authoredZoneCount: scene.detailZones?.length ?? 0,
    ...options,
  };
}

const manifest = JSON.parse(
  readFileSync(resolve(projectRoot, "public/data/scenes/manifest.json"), "utf8"),
) as ManifestFile;
const manifestSceneIds = new Set(manifest.scenes.map(({ id }) => id));

const newSceneContracts: NewSceneContract[] = [
  contract("community-garden", "world-map", [], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("school-campus", "world-map", [], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("library-reading-room", "school-campus", ["school-campus"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("supermarket-grocery", "world-map", [], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("supermarket-backroom", "supermarket-grocery", ["supermarket-grocery"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("service-core", "office-building", [
    "city-street",
    "transit-hub",
    "urban-services",
    "office-building",
  ], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("warehouse-loading-dock", "service-core", [
    "city-street",
    "transit-hub",
    "urban-services",
    "office-building",
    "service-core",
  ], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("greenhouse-interior", "community-garden", ["community-garden"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("tomato-plant", "greenhouse-interior", ["community-garden", "greenhouse-interior"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: false,
  }),
  contract("potting-workbench", "community-garden", ["community-garden"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: false,
  }),
  contract("city-cafe", "city-street", ["city-street"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("hotel-exterior", "city-street", ["city-street"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("hotel-lobby-rooms", "hotel-exterior", ["city-street", "hotel-exterior"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("radiology-suite", "hospital", ["city-street", "transit-hub", "urban-services", "hospital"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("baggage-claim", "airport", ["city-street", "transit-hub", "urban-services", "airport"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: true,
  }),
  contract("dinosaur-hall", "science-museum", ["city-street", "science-museum"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: false,
  }),
  contract("bathroom", "apartment", ["apartment"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: false,
  }),
  contract("train-carriage", "railway-platform", ["city-street", "transit-hub", "railway-platform"], {
    desktopMinimumWords: 12,
    mobileMinimumWords: 7,
    runOnMobile: false,
  }),
];

for (const { target } of newSceneContracts) {
  if (!manifestSceneIds.has(target)) {
    throw new Error(`New spatial scene ${target} is missing from the runtime manifest`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openWorld(page: Page): Promise<Locator> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).not.toHaveAttribute("data-scene-id", /^(?:|loading)$/);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");
  return app;
}

async function enterScene(page: Page, app: Locator, target: string): Promise<void> {
  const portal = page.locator(`${HOTSPOT}[data-target-scene="${target}"]`);
  await expect(portal).toBeVisible();
  await portal.click();
  await expect(app).toHaveAttribute("data-scene-id", target);
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(INTERACTION_LAYER)).toHaveAttribute("data-positioned", "true");
}

async function navigateToParent(
  page: Page,
  app: Locator,
  path: readonly string[],
): Promise<void> {
  for (const sceneId of path) await enterScene(page, app, sceneId);
}

async function readableWordCount(page: Page): Promise<number> {
  return page.getByTestId("word-label").evaluateAll((labels) => labels.filter((label) => {
    const style = window.getComputedStyle(label);
    return (
      (label as HTMLElement).dataset.interactive === "true"
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number.parseFloat(style.opacity) >= 0.8
    );
  }).length);
}

async function startReturnTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trace: ReturnTrace = { loaderAppeared: Boolean(document.querySelector(".loading-pill")), settled: [] };
    const observer = new MutationObserver((records) => {
      for (const node of records.flatMap((record) => [...record.addedNodes])) {
        if (
          node instanceof Element
          && (node.matches(".loading-pill") || node.querySelector(".loading-pill"))
        ) {
          trace.loaderAppeared = true;
        }
      }
    });
    const onSettled = (event: Event) => {
      const detail = (event as CustomEvent<ReturnTrace["settled"][number]>).detail;
      trace.settled.push({ from: detail.from, to: detail.to, cache: detail.cache });
    };
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("world:scene-settled", onSettled);
    Reflect.set(window, "__newSpatialSceneReturnTrace", { trace, observer, onSettled });
  });
}

async function finishReturnTrace(page: Page): Promise<ReturnTrace> {
  await expect.poll(() => page.evaluate(() => (
    (Reflect.get(window, "__newSpatialSceneReturnTrace") as { trace: ReturnTrace })
      .trace.settled.length
  ))).toBeGreaterThan(0);
  return page.evaluate(() => {
    const probe = Reflect.get(window, "__newSpatialSceneReturnTrace") as {
      trace: ReturnTrace;
      observer: MutationObserver;
      onSettled: (event: Event) => void;
    };
    probe.observer.disconnect();
    window.removeEventListener("world:scene-settled", probe.onSettled);
    return probe.trace;
  });
}

for (const sceneContract of newSceneContracts) {
  test(`${sceneContract.parent} enters grounded ${sceneContract.target} and returns warm`, async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chromium" && !sceneContract.runOnMobile,
      "one new scene owns the focused mobile navigation contract",
    );

    const app = await openWorld(page);
    await navigateToParent(page, app, sceneContract.path);
    await expect(app).toHaveAttribute("data-scene-id", sceneContract.parent);

    const portal = page.locator(`${HOTSPOT}[data-target-scene="${sceneContract.target}"]`);
    await expect(portal).toBeVisible();
    await expect(portal).toHaveAttribute(
      "aria-label",
      new RegExp(`进入 ${escapeRegExp(sceneContract.title)}`),
    );

    await portal.click();
    await expect(app).toHaveAttribute("data-scene-id", sceneContract.target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    const activeArt = page.locator(".viewer-shell:not([data-phase]) .scene-art");
    await expect(activeArt).toHaveAttribute(
      "src",
      sceneContract.asset,
    );
    await expect.poll(() => activeArt.evaluate((image) => (
      (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
    ))).toBe(true);
    const assetResponse = await request.get(sceneContract.asset);
    expect(assetResponse.status()).toBe(200);

    const sceneResponse = await request.get(`/data/scenes/${sceneContract.target}.json`);
    expect(sceneResponse.status()).toBe(200);
    const scenePayload = await sceneResponse.json() as SceneFile;
    expect(scenePayload.detailZones?.length ?? 0).toBe(sceneContract.authoredZoneCount);
    expect(sceneContract.authoredZoneCount).toBeGreaterThanOrEqual(5);
    const authoredCues = page.locator(AUTHORED_CUE);
    await expect.poll(() => authoredCues.count()).toBeGreaterThanOrEqual(5);
    const renderedZoneIds = await authoredCues.evaluateAll((cues) => cues.map((cue) => (
      (cue as HTMLElement).dataset.detailZoneId ?? ""
    )));
    const configuredZoneIds = new Set(
      (scenePayload.detailZones ?? []).map(({ id }) => id),
    );
    expect(new Set(renderedZoneIds).size).toBe(renderedZoneIds.length);
    expect(renderedZoneIds.every((zoneId) => configuredZoneIds.has(zoneId))).toBe(true);
    expect(renderedZoneIds.length).toBeLessThanOrEqual(sceneContract.authoredZoneCount);

    const minimumWords = testInfo.project.name === "mobile-chromium"
      ? sceneContract.mobileMinimumWords
      : sceneContract.desktopMinimumWords;
    await expect.poll(() => readableWordCount(page)).toBeGreaterThanOrEqual(minimumWords);

    await expect(app).toHaveAttribute("data-transition-cache", "idle");
    await startReturnTrace(page);
    await page.getByRole("button", { name: /返回上一层/ }).click();
    await expect(app).toHaveAttribute("data-scene-id", sceneContract.parent);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    const returnTrace = await finishReturnTrace(page);
    expect(returnTrace.loaderAppeared, "returning to the retained parent never mounts the cold loader").toBe(false);
    expect(returnTrace.settled.at(-1)).toMatchObject({
      from: sceneContract.target,
      to: sceneContract.parent,
      cache: "warm",
    });
  });
}
