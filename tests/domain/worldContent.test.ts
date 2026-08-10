import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { Scene } from "../../app/domain/types";

interface Manifest {
  rootSceneId: string;
  scenes: Array<{ id: string; title: string; parentId: string | null }>;
}

const projectRoot = resolve(import.meta.dirname, "../..");

async function loadWorld(): Promise<{ manifest: Manifest; scenes: Scene[] }> {
  const dataRoot = resolve(projectRoot, "public/data/scenes");
  const manifest = JSON.parse(await readFile(resolve(dataRoot, "manifest.json"), "utf8")) as Manifest;
  const scenes = await Promise.all(
    manifest.scenes.map(async ({ id }) =>
      JSON.parse(await readFile(resolve(dataRoot, `${id}.json`), "utf8")) as Scene,
    ),
  );
  return { manifest, scenes };
}

test("mature world has three subject branches and six deep, fully reachable paths", async () => {
  const { manifest, scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const root = byId.get(manifest.rootSceneId);
  assert.ok(root);
  assert.equal(root.parentId, null);
  assert.deepEqual(
    root.portals.map((portal) => portal.childSceneId),
    ["apartment", "city-street", "city-park"],
  );

  const reachable = new Set<string>();
  const visit = (id: string) => {
    assert.ok(!reachable.has(id), `cycle or duplicate path at ${id}`);
    reachable.add(id);
    for (const portal of byId.get(id)?.portals ?? []) visit(portal.childSceneId);
  };
  visit(root.id);
  assert.equal(reachable.size, scenes.length);
  assert.equal(scenes.length, 30);

  const expectedPaths = [
    ["world-map", "apartment", "kitchen", "coffee-machine", "water-tank", "polymer"],
    ["world-map", "apartment", "bedroom", "wardrobe-interior", "cotton-shirt"],
    ["world-map", "city-street", "transit-hub", "electric-bus", "battery", "lithium-ion-cell"],
    ["world-map", "city-street", "transit-hub", "railway-platform", "train-carriage", "rail-bogie"],
    ["world-map", "city-street", "science-museum", "human-body", "heart", "blood-cell", "hemoglobin", "oxygen-molecule"],
    ["world-map", "city-park", "oak-tree", "leaf", "plant-cell", "chloroplast-interior"],
  ];
  for (const path of expectedPaths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      assert.ok(
        byId.get(path[index])?.portals.some((portal) => portal.childSceneId === path[index + 1]),
        `missing portal ${path[index]} -> ${path[index + 1]}`,
      );
    }
  }
});

test("every slice has five curated LOD bands and enough logical anchors for dense zoom", async () => {
  const { scenes } = await loadWorld();
  assert.equal(scenes.reduce((sum, scene) => sum + scene.labels.length, 0), 1_622);
  for (const scene of scenes) {
    assert.equal(scene.width, 1600, `${scene.id} width`);
    assert.equal(scene.height, 900, `${scene.id} height`);
    assert.ok(scene.labels.length >= 48, `${scene.id} minimum logical anchors`);
    assert.ok(scene.labels.length <= 80, `${scene.id} content budget`);
    assert.deepEqual(
      [...new Set(scene.labels.map((label) => label.minLevel))].sort(),
      [0, 1, 2, 3, 4],
      `${scene.id} density bands`,
    );
    assert.ok(
      scene.labels.filter((label) => (label.minLevel ?? 0) <= 2).length >= 36,
      `${scene.id} early zoom density`,
    );
    assert.equal(
      new Set(scene.labels.map((label) => label.word.toLocaleLowerCase())).size,
      scene.labels.length,
      `${scene.id} unique display terms`,
    );
    for (const label of scene.labels) {
      assert.ok(label.translation.trim(), `${scene.id}/${label.id} translation`);
      assert.ok(label.x >= 0 && label.x <= scene.width, `${scene.id}/${label.id} x`);
      assert.ok(label.y >= 0 && label.y <= scene.height, `${scene.id}/${label.id} y`);
    }
  }
});

test("context translations and cross-topic filler regressions stay curated", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const translation = (sceneId: string, word: string) =>
    byId.get(sceneId)?.labels.find((label) => label.word === word)?.translation;

  assert.equal(translation("world-map", "natural"), "自然的");
  assert.equal(translation("kitchen", "sharp"), "锋利的");
  assert.equal(translation("coffee-machine", "chamber"), "腔室");
  assert.equal(translation("coffee-machine", "automatic"), "自动运行的");
  assert.equal(translation("heart", "chamber"), "心腔");

  const forbidden: Record<string, string[]> = {
    kitchen: ["sleep", "upstairs", "cotton", "leather"],
    bedroom: ["cook", "stove", "boiler", "battery"],
    "oxygen-molecule": ["leather", "synthetic", "sofa", "passenger"],
    "plant-cell": ["passenger", "brake", "sofa"],
  };
  for (const [sceneId, terms] of Object.entries(forbidden)) {
    const words = new Set(byId.get(sceneId)?.labels.map((label) => label.word.toLocaleLowerCase()));
    for (const term of terms) assert.ok(!words.has(term), `${sceneId} cross-topic filler: ${term}`);
  }

  const allWords = new Set(scenes.flatMap((scene) => scene.labels.map((label) => label.word.toLocaleLowerCase())));
  assert.ok(allWords.size >= 1_500, `expected broad vocabulary coverage, found ${allWords.size}`);
});

test("every scene uses a real, accessible external visual asset", async () => {
  const { scenes } = await loadWorld();
  assert.equal(new Set(scenes.map((scene) => scene.asset)).size, scenes.length, "each semantic slice has its own visual");
  for (const scene of scenes) {
    const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//, ""));
    const bytes = await readFile(assetPath);
    assert.ok(bytes.byteLength > 1_000, `${scene.id} asset is unexpectedly empty`);
    if (scene.asset.endsWith(".svg")) {
      const source = bytes.toString("utf8");
      assert.match(source, /<title[ >]/, `${scene.id} accessible title`);
      assert.match(source, /<desc[ >]/, `${scene.id} accessible description`);
      assert.ok(source.includes('viewBox="0 0 1600 900"'), `${scene.id} coordinate system`);
    } else {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${scene.id} JPEG signature`);
    }
  }
});
