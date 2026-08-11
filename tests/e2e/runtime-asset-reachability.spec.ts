import { expect, test, type Page } from "@playwright/test";
import {
  LEXICAL_WORLD_VISUAL_MANIFEST,
  type ApprovedLexicalWorldRealmVisual,
  type ApprovedLexicalWorldVisual,
} from "../../app/lib/lexical-world-visuals";

interface SceneManifestEntry {
  id: string;
  title: string;
  parentId: string | null;
}

interface SceneManifest {
  rootSceneId: string;
  scenes: SceneManifestEntry[];
}

interface RuntimeScene {
  id: string;
  parentId: string | null;
  asset: string;
  assets?: {
    base: RuntimeSceneAssetDescriptor;
    high?: RuntimeSceneAssetDescriptor;
  };
  portals: Array<{ childSceneId: string }>;
}

interface RuntimeSceneAssetDescriptor {
  src: string;
  width: number;
  height: number;
  sha256: string;
}

interface BrowserSceneFetch {
  path: string;
  status: number;
  scene: RuntimeScene;
}

interface LexicalManifest {
  childrenCount: number;
  children: Array<{ id: string; path: string }>;
}

interface DecodedAsset {
  asset: string;
  status: number;
  width: number;
  height: number;
  error: string | null;
}

async function fetchSceneGraphInBrowser(page: Page): Promise<{
  manifestStatus: number;
  manifest: SceneManifest;
  sceneFetches: BrowserSceneFetch[];
}> {
  return page.evaluate(async () => {
    const manifestResponse = await fetch("/data/scenes/manifest.json", { cache: "no-store" });
    const manifest = await manifestResponse.json() as SceneManifest;
    const sceneFetches = await Promise.all(manifest.scenes.map(async ({ id }) => {
      const path = `/data/scenes/${id}.json`;
      const response = await fetch(path, { cache: "no-store" });
      return {
        path,
        status: response.status,
        scene: await response.json() as RuntimeScene,
      };
    }));
    return { manifestStatus: manifestResponse.status, manifest, sceneFetches };
  });
}

async function fetchAndDecodeAssets(page: Page, assets: readonly string[]): Promise<DecodedAsset[]> {
  return page.evaluate(async (assetUrls) => {
    const results: DecodedAsset[] = [];
    const batchSize = 4;

    for (let index = 0; index < assetUrls.length; index += batchSize) {
      const batch = assetUrls.slice(index, index + batchSize);
      const decoded = await Promise.all(batch.map(async (asset): Promise<DecodedAsset> => {
        try {
          // Keep the default browser cache: lexical CSS may already have loaded
          // this exact URL, and the smoke test should decode those live bytes
          // without forcing a second download.
          const response = await fetch(asset);
          if (!response.ok) {
            return { asset, status: response.status, width: 0, height: 0, error: "HTTP error" };
          }
          const objectUrl = URL.createObjectURL(await response.blob());
          try {
            const image = new Image();
            image.decoding = "async";
            image.src = objectUrl;
            await image.decode();
            return {
              asset,
              status: response.status,
              width: image.naturalWidth,
              height: image.naturalHeight,
              error: null,
            };
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        } catch (error) {
          return {
            asset,
            status: 0,
            width: 0,
            height: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }));
      results.push(...decoded);
    }
    return results;
  }, [...assets]);
}

function verifyDecodedAssets(results: readonly DecodedAsset[]): void {
  for (const result of results) {
    expect(result.status, `${result.asset} must be served by the deployed runtime`).toBe(200);
    expect(result.error, `${result.asset} must decode as an image`).toBeNull();
    expect(result.width, `${result.asset} must have a decoded width`).toBeGreaterThan(0);
    expect(result.height, `${result.asset} must have a decoded height`).toBeGreaterThan(0);
  }
}

test("every scene-manifest image is deployed, decodable, unique, and root-reachable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "the complete asset audit runs once on desktop");
  test.setTimeout(90_000);
  // Establish a same-origin browser document without mounting the application,
  // whose neighborhood prefetch would otherwise download scene assets twice.
  await page.goto("/data/scenes/manifest.json", { waitUntil: "domcontentloaded" });

  const { manifestStatus, manifest, sceneFetches } = await fetchSceneGraphInBrowser(page);
  expect(manifestStatus).toBe(200);
  expect(manifest.scenes.length).toBeGreaterThan(0);
  expect(new Set(manifest.scenes.map(({ id }) => id)).size).toBe(manifest.scenes.length);

  const sceneById = new Map<string, RuntimeScene>();
  for (const sceneFetch of sceneFetches) {
    expect(sceneFetch.status, sceneFetch.path).toBe(200);
    const manifestEntry = manifest.scenes.find(({ id }) => id === sceneFetch.scene.id);
    expect(manifestEntry, `${sceneFetch.scene.id} must be registered in the runtime manifest`).toBeDefined();
    expect(sceneFetch.scene.parentId).toBe(manifestEntry?.parentId ?? null);
    sceneById.set(sceneFetch.scene.id, sceneFetch.scene);
  }

  expect(sceneById.size).toBe(manifest.scenes.length);
  const root = sceneById.get(manifest.rootSceneId);
  expect(root, `root scene ${manifest.rootSceneId} must have a JSON payload`).toBeDefined();
  expect(root?.parentId).toBeNull();

  for (const scene of sceneById.values()) {
    const visited = new Set<string>();
    let cursor = scene;
    while (cursor.id !== manifest.rootSceneId) {
      expect(visited.has(cursor.id), `cycle detected while walking from ${scene.id}`).toBe(false);
      visited.add(cursor.id);
      expect(cursor.parentId, `${cursor.id} must name a parent`).not.toBeNull();
      const parent = sceneById.get(cursor.parentId as string);
      expect(parent, `${cursor.id} parent ${cursor.parentId} must be registered`).toBeDefined();
      expect(
        parent?.portals.some(({ childSceneId }) => childSceneId === cursor.id),
        `${cursor.id} must be referenced by a portal in ${parent?.id ?? cursor.parentId}`,
      ).toBe(true);
      cursor = parent as RuntimeScene;
    }

    for (const portal of scene.portals) {
      expect(
        sceneById.has(portal.childSceneId),
        `${scene.id} portal target ${portal.childSceneId} must be registered`,
      ).toBe(true);
    }
  }

  const canonicalAssets = [...sceneById.values()].map(({ asset }) => asset);
  expect(new Set(canonicalAssets).size, "each scene must own a distinct runtime image URL").toBe(canonicalAssets.length);
  const descriptorBySrc = new Map<string, RuntimeSceneAssetDescriptor>();
  for (const scene of sceneById.values()) {
    if (!scene.assets) continue;
    expect(scene.assets.base.src, `${scene.id} base must remain its canonical scene.asset`).toBe(scene.asset);
    for (const descriptor of [scene.assets.base, scene.assets.high].filter(
      (candidate): candidate is RuntimeSceneAssetDescriptor => Boolean(candidate),
    )) {
      expect(descriptorBySrc.has(descriptor.src), `${descriptor.src} must belong to one asset tier`).toBe(false);
      descriptorBySrc.set(descriptor.src, descriptor);
    }
  }
  const assets = [...new Set([...canonicalAssets, ...descriptorBySrc.keys()])];
  const decodedAssets = await fetchAndDecodeAssets(page, assets);
  expect(decodedAssets.map(({ asset }) => asset).sort()).toEqual([...assets].sort());
  verifyDecodedAssets(decodedAssets);
  for (const decoded of decodedAssets) {
    const descriptor = descriptorBySrc.get(decoded.asset);
    if (!descriptor) continue;
    expect(decoded.width, `${decoded.asset} width must match its tier descriptor`).toBe(descriptor.width);
    expect(decoded.height, `${decoded.asset} height must match its tier descriptor`).toBe(descriptor.height);
  }
});

test("world-map swaps its decoded 3200x1800 tier in place and reuses it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "the exact desktop pixel-demand boundary runs once");
  const highRequests: string[] = [];
  const expected = await page.request.get("/data/scenes/world-map.json").then(async (response) => ({
    status: response.status(),
    scene: await response.json() as RuntimeScene,
  }));
  expect(expected.status).toBe(200);
  expect(expected.scene.assets?.base).toBeDefined();
  expect(expected.scene.assets?.high).toMatchObject({ width: 3_200, height: 1_800 });
  const base = expected.scene.assets!.base;
  const high = expected.scene.assets!.high!;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === high.src) highRequests.push(request.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  const viewport = page.locator('.viewer-shell:not([data-phase]) [data-testid="world-viewport"]');
  const art = viewport.locator(".scene-art");
  await expect(viewport).toHaveAttribute("data-active-asset-tier", "base");
  await expect(viewport).toHaveAttribute("data-active-asset-src", base.src);
  await expect(art).toHaveAttribute("src", base.src);
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => (
    image.complete ? [image.naturalWidth, image.naturalHeight] : [0, 0]
  ))).toEqual([base.width, base.height]);

  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  for (let step = 0; step < 3 && await viewport.getAttribute("data-desired-asset-tier") !== "high"; step += 1) {
    await zoomIn.click();
  }
  await expect(viewport).toHaveAttribute("data-desired-asset-tier", "high");
  await expect(viewport).toHaveAttribute("data-active-asset-tier", "high");
  await expect(viewport).toHaveAttribute("data-active-asset-src", high.src);
  await expect(art).toHaveAttribute("src", high.src);
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => (
    image.complete ? [image.naturalWidth, image.naturalHeight] : [0, 0]
  ))).toEqual([3_200, 1_800]);

  for (let step = 0; step < 3 && await viewport.getAttribute("data-desired-asset-tier") !== "base"; step += 1) {
    await zoomOut.click();
  }
  await expect(viewport).toHaveAttribute("data-desired-asset-tier", "base");
  await expect(viewport).toHaveAttribute("data-active-asset-tier", "base");
  const requestsAfterFirstDecode = highRequests.length;
  expect(requestsAfterFirstDecode).toBeGreaterThan(0);
  for (let step = 0; step < 3 && await viewport.getAttribute("data-desired-asset-tier") !== "high"; step += 1) {
    await zoomIn.click();
  }
  await expect(viewport).toHaveAttribute("data-active-asset-tier", "high");
  await expect(art).toHaveAttribute("src", high.src);
  expect(highRequests, "a decoded high tier must not be fetched again after zooming out and back in")
    .toHaveLength(requestsAfterFirstDecode);
});

test("the approved lexical overview and every realm own distinct live semantic tiles", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "the complete asset audit runs once on desktop");
  test.setTimeout(60_000);
  // This loop audits the approved image mapping, not camera animation. Keep
  // each reset synchronous so a moving realm button cannot lose pointer-up.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#world", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /打开 .*10,000 个词/ }).click();
  const dialog = page.getByRole("dialog", { name: "一万个词的分层探索世界" });
  const field = dialog.getByTestId("semantic-zoom-field");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("aria-busy", "false");

  // The runtime has already fetched this manifest to render the overview. A
  // normal cached fetch gives the test the exact deployed hierarchy cheaply.
  const lexicalResponse = await page.evaluate(async () => {
    const response = await fetch("/data/lexical-world/manifest.json");
    return { status: response.status, manifest: await response.json() as LexicalManifest };
  });
  expect(lexicalResponse.status).toBe(200);
  expect(lexicalResponse.manifest.children.length).toBe(lexicalResponse.manifest.childrenCount);

  const approvedVisuals = Object.values(
    LEXICAL_WORLD_VISUAL_MANIFEST,
  ) as readonly ApprovedLexicalWorldVisual[];
  const overview = approvedVisuals.find(({ role }) => role === "overview");
  const realmVisuals = approvedVisuals.filter(
    (visual): visual is ApprovedLexicalWorldRealmVisual => visual.role === "realm",
  );
  expect(overview).toBeDefined();
  expect(realmVisuals.length).toBe(lexicalResponse.manifest.children.length);

  const realmVisualById = new Map(realmVisuals.map((visual) => [visual.realmId, visual]));
  const expectedRealmAssets = lexicalResponse.manifest.children.map(({ id }) => {
    const visual = realmVisualById.get(id);
    expect(visual, `${id} must own an approved visual`).toBeDefined();
    return visual?.asset as string;
  });
  const approvedAssets = [overview?.asset as string, ...expectedRealmAssets];
  expect(new Set(approvedAssets).size).toBe(approvedAssets.length);

  const runtimeOverview = field.getByTestId("semantic-zoom-overview");
  await expect(runtimeOverview).toHaveAttribute("src", overview?.asset as string);
  await expect.poll(() => runtimeOverview.evaluate((image: HTMLImageElement) => (
    image.complete && image.naturalWidth === 1600 && image.naturalHeight === 900
  ))).toBe(true);
  const runtimeOverviewAsset = await runtimeOverview.getAttribute("src");

  const realmNodes = field.locator('[data-testid="semantic-zoom-node"][data-level="realm"]');
  await expect(realmNodes).toHaveCount(lexicalResponse.manifest.children.length);
  const runtimeRealmAssets: string[] = [];
  for (const { id } of lexicalResponse.manifest.children) {
    const expectedVisual = realmVisualById.get(id);
    expect(expectedVisual).toBeDefined();
    await field.locator(`[data-testid="semantic-zoom-node"][data-level="realm"][data-id="${id}"]`).click();
    await expect(field).toHaveAttribute("data-active-realm", id);
    await expect(field).toHaveAttribute("data-active-asset", expectedVisual!.asset);
    const runtimeTile = field.locator(`[data-testid="semantic-realm-tile"][data-realm="${id}"]`);
    await expect(runtimeTile).toHaveCount(1);
    await expect(runtimeTile).toHaveAttribute("data-asset", expectedVisual!.asset);
    const runtimeImage = runtimeTile.locator("img");
    await expect(runtimeImage).toHaveAttribute("src", expectedVisual!.asset);
    await expect.poll(() => runtimeImage.evaluate((image: HTMLImageElement) => (
      image.complete && image.naturalWidth === 1600 && image.naturalHeight === 900
    ))).toBe(true);
    runtimeRealmAssets.push((await runtimeTile.getAttribute("data-asset"))!);
    await field.getByTestId("semantic-zoom-reset").click();
    await expect(field).toHaveAttribute("data-level", "realm");
    await expect(field).not.toHaveAttribute("data-active-realm", /.+/);
    await expect(field.getByTestId("semantic-realm-tile")).toHaveCount(0);
  }

  expect(runtimeRealmAssets).toEqual(expectedRealmAssets);
  expect(new Set(runtimeRealmAssets).size).toBe(runtimeRealmAssets.length);
  expect(runtimeRealmAssets).not.toContain(runtimeOverviewAsset);
  verifyDecodedAssets(await fetchAndDecodeAssets(page, approvedAssets));
});
