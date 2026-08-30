import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { compileMegaAtlasPanels } from "../../scripts/compile-mega-atlas-panels.mjs";
import {
  assembleMegaAtlasScene,
  buildReviewedSpatialLexemeIndex,
  parseMegaAtlasSceneArguments,
  runMegaAtlasSceneAssembler,
} from "../../scripts/assemble-mega-atlas-scene.mjs";

const zeroHash = "0".repeat(64);
const oneHash = "1".repeat(64);
const projectRoot = resolve(import.meta.dirname, "../..");

function fixtureCompiledBatch() {
  const panels = Array.from({ length: 6 }, (_, index) => ({
    id: `panel-${index + 1}`,
    file: `panel-${index + 1}.json`,
    row: Math.floor(index / 3),
    col: index % 3,
    x: (index % 3) * 1_768,
    y: Math.floor(index / 3) * 1_037,
    width: 1_672,
    height: 941,
  }));
  return {
    schemaVersion: 1,
    layout: {
      columns: 3,
      rows: 2,
      panelWidth: 1_672,
      panelHeight: 941,
      gutters: { horizontal: 96, vertical: 96 },
      width: 5_208,
      height: 1_978,
      panels,
    },
    counts: {},
    zones: panels.map((panel, index) => ({
      id: `zone-${index + 1}`,
      title: `Zone ${index + 1}`,
      translation: `分区${index + 1}`,
      description: `Pixel-audited visible objects in source panel ${index + 1}`,
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      targetScale: 3.2,
      sourcePanel: panel.id,
    })),
    anchors: [
      {
        id: "school-chair",
        word: "chair",
        translation: "椅子",
        x: 100,
        y: 120,
        lod: 1,
        zoneId: "zone-1",
        sourcePanel: "panel-1",
      },
      {
        id: "market-chair",
        word: "Chair",
        translation: "座椅",
        x: 1_900,
        y: 1_200,
        lod: 3,
        zoneId: "zone-5",
        sourcePanel: "panel-5",
      },
      {
        id: "wetland-reed",
        word: "reed stem",
        translation: "芦苇茎",
        x: 4_000,
        y: 1_400,
        lod: 2,
        zoneId: "zone-6",
        sourcePanel: "panel-6",
      },
    ],
    removedAmbiguous: [
      { candidate: "hidden hinge", reason: "not visible", sourcePanel: "panel-1" },
      { candidate: "fish species", reason: "not distinguishable", sourcePanel: "panel-6" },
    ],
  };
}

function fixtureConfiguration() {
  return {
    logicalScale: 0.5,
    scene: {
      id: "world-map",
      title: "Mega atlas",
      translation: "万物大图",
      subtitle: "One continuous, high-detail world",
      panelSemanticRealms: Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [`panel-${index + 1}`, index < 3 ? "objects-technology" : "nature-life"]),
      ),
      asset: "/scenes/mega-base.jpg",
      assets: {
        base: { src: "/scenes/mega-base.jpg", width: 2_604, height: 989, sha256: zeroHash },
        high: { src: "/scenes/mega-high.jpg", width: 5_208, height: 1_978, sha256: oneHash },
      },
      portals: [{
        id: "enter-city",
        label: "Explore city",
        translation: "探索城市",
        childSceneId: "city-street",
        x: 3_600,
        y: 100,
        width: 500,
        height: 400,
        enterScale: 5,
        description: "Complete visible city transit building and street frontage",
      }],
    },
  };
}

test("scene assembler scales the source canvas, keeps truthful regions and removes duplicate display words", () => {
  const assembled = assembleMegaAtlasScene(fixtureCompiledBatch(), fixtureConfiguration(), {
    reviewedLexemes: new Map([["chair", "en-0000000000000001"]]),
  });
  const { scene, report } = assembled;

  assert.deepEqual({ width: scene.width, height: scene.height }, { width: 2_604, height: 989 });
  assert.equal(scene.asset, "/scenes/mega-base.jpg");
  assert.equal(scene.assets.high.width, 5_208);
  assert.equal(scene.labels.length, 2);
  assert.deepEqual(scene.labels.map(({ id }) => id), ["school-chair", "wetland-reed"]);
  assert.equal(scene.labels[0].lexemeId, "en-0000000000000001");
  assert.equal(scene.labels[0].semanticRealmId, "objects-technology");
  assert.equal(scene.labels[1].semanticRealmId, "nature-life");
  assert.deepEqual(
    { x: scene.labels[0].x, y: scene.labels[0].y },
    { x: 50, y: 60 },
  );
  assert.equal(scene.anchorAudit.retainedLabelCount, 2);
  assert.equal(scene.anchorAudit.removedLabelCount, 3);
  assert.equal(scene.anchorAudit.previousLabelCount, 5);
  assert.equal(report.authoredAnchorCount, 3);
  assert.deepEqual(report.duplicateWords, [{
    normalizedWord: "chair",
    keptId: "school-chair",
    removedId: "market-chair",
    keptPanel: "panel-1",
    removedPanel: "panel-5",
  }]);

  const chairRegion = scene.visualRegions.find(({ id }) => id === "anchor-school-chair");
  assert.ok(chairRegion);
  assert.ok(scene.labels[0].x >= chairRegion.x && scene.labels[0].x <= chairRegion.x + chairRegion.width);
  assert.ok(scene.labels[0].y >= chairRegion.y && scene.labels[0].y <= chairRegion.y + chairRegion.height);
  assert.deepEqual(scene.portals[0], {
    id: "enter-city",
    label: "Explore city",
    translation: "探索城市",
    childSceneId: "city-street",
    sourceVisualRegion: "portal-enter-city",
    x: 1_800,
    y: 50,
    width: 250,
    height: 200,
    enterScale: 5,
  });
});

test("zones keep only retained ids and stay in the scaled logical coordinate space", () => {
  const { scene } = assembleMegaAtlasScene(fixtureCompiledBatch(), fixtureConfiguration());
  const first = scene.detailZones.find(({ id }) => id === "zone-1");
  const market = scene.detailZones.find(({ id }) => id === "zone-5");
  assert.deepEqual(
    { x: first.x, y: first.y, width: first.width, height: first.height, labelIds: first.labelIds },
    { x: 0, y: 0, width: 836, height: 470.5, labelIds: ["school-chair"] },
  );
  assert.deepEqual(market.labelIds, [], "the removed duplicate must not survive a zone inventory");
  for (const zone of scene.detailZones) {
    assert.ok(zone.x >= 0 && zone.x + zone.width <= scene.width);
    assert.ok(zone.y >= 0 && zone.y + zone.height <= scene.height);
  }
});

test("reviewed spatial lexeme reuse is conservative when scenes disagree on a homograph", () => {
  const index = buildReviewedSpatialLexemeIndex([
    { id: "world-map", labels: [{ word: "chair", lexemeId: "en-ffffffffffffffff" }] },
    { id: "school", labels: [{ word: "chair", lexemeId: "en-0000000000000001" }] },
    { id: "home", labels: [{ word: "Chair", lexemeId: "en-0000000000000001" }] },
    { id: "river", labels: [{ word: "bank", lexemeId: "en-0000000000000002" }] },
    { id: "city", labels: [{ word: "bank", lexemeId: "en-0000000000000003" }] },
  ]);
  assert.equal(index.get("chair"), "en-0000000000000001");
  assert.equal(index.get("bank"), undefined);
});

test("CLI runner writes a deterministic scene and refuses implicit overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "hellowords-mega-scene-"));
  try {
    const sceneRoot = join(root, "scenes");
    await mkdir(sceneRoot);
    await writeFile(join(sceneRoot, "manifest.json"), JSON.stringify({
      scenes: [{ id: "world-map" }, { id: "school" }],
    }));
    await writeFile(join(sceneRoot, "school.json"), JSON.stringify({
      id: "school",
      labels: [{ word: "chair", lexemeId: "en-0000000000000001" }],
    }));
    const batchPath = join(root, "compiled.json");
    const configPath = join(root, "config.json");
    const output = join(root, "world-map.json");
    await writeFile(batchPath, JSON.stringify(fixtureCompiledBatch()));
    await writeFile(configPath, JSON.stringify(fixtureConfiguration()));
    const result = await runMegaAtlasSceneAssembler({ batchPath, configPath, output, sceneRoot });
    const scene = JSON.parse(await readFile(output, "utf8"));
    assert.equal(result.retainedLabelCount, 2);
    assert.equal(result.reusedLexemeCount, 1);
    assert.equal(scene.labels[0].lexemeId, "en-0000000000000001");
    await assert.rejects(
      runMegaAtlasSceneAssembler({ batchPath, configPath, output, sceneRoot }),
      /Refusing to overwrite existing output/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI parser requires one batch plus explicit config and output", () => {
  assert.deepEqual(
    parseMegaAtlasSceneArguments(["compiled.json", "--config", "scene.json", "--output", "world.json", "--force"]),
    {
      help: false,
      batchPath: "compiled.json",
      configPath: "scene.json",
      output: "world.json",
      force: true,
    },
  );
  assert.throws(() => parseMegaAtlasSceneArguments(["compiled.json"]), /--config is required/);
});

test("the published mega atlas is byte-reproducible from six reviewed local batches", async () => {
  const dataRoot = resolve(projectRoot, "scripts/data/mega-atlas-v21");
  const sceneRoot = resolve(projectRoot, "public/data/scenes");
  const layout = JSON.parse(await readFile(resolve(dataRoot, "layout.json"), "utf8"));
  const panelDocuments = await Promise.all(layout.panels.map(async (panel) => ({
    panelId: panel.id,
    path: resolve(dataRoot, panel.file),
    data: JSON.parse(await readFile(resolve(dataRoot, panel.file), "utf8")),
  })));
  const compiled = compileMegaAtlasPanels(layout, panelDocuments, {
    layoutPath: resolve(dataRoot, "layout.json"),
  });
  const config = JSON.parse(await readFile(resolve(dataRoot, "scene-config.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(sceneRoot, "manifest.json"), "utf8"));
  const reviewedScenes = await Promise.all(manifest.scenes
    .filter(({ id }) => id !== "world-map")
    .map(async ({ id }) => JSON.parse(await readFile(resolve(sceneRoot, `${id}.json`), "utf8"))));
  const generated = assembleMegaAtlasScene(compiled.batch, config, {
    reviewedLexemes: buildReviewedSpatialLexemeIndex(reviewedScenes),
  }).scene;
  const publishedText = await readFile(resolve(sceneRoot, "world-map.json"), "utf8");
  const published = JSON.parse(publishedText);

  assert.deepEqual(generated, published);
  assert.equal(`${JSON.stringify(generated, null, 2)}\n`, publishedText);
  assert.equal(generated.labels.length, 1_289);
  assert.equal(generated.detailZones.length, 66);
  assert.equal(generated.visualRegions.length, 1_294);
});
