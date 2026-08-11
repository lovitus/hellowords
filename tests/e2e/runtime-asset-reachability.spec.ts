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
  portals: Array<{ childSceneId: string }>;
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

  const assets = [...sceneById.values()].map(({ asset }) => asset);
  expect(new Set(assets).size, "each scene must own a distinct runtime image URL").toBe(assets.length);
  const decodedAssets = await fetchAndDecodeAssets(page, assets);
  expect(decodedAssets.map(({ asset }) => asset).sort()).toEqual([...assets].sort());
  verifyDecodedAssets(decodedAssets);
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
