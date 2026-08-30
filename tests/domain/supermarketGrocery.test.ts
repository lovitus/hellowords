import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const decodeImage = sharpModule as unknown as (input: string | Buffer) => {
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
};

interface Label {
  readonly id: string;
  readonly word: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: number;
  readonly sourceVisualRegion: string;
}

interface Region {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Zone {
  readonly id: string;
  readonly labelIds: readonly string[];
}

interface Scene {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly Label[];
  readonly visualRegions: readonly Region[];
  readonly detailZones: readonly Zone[];
  readonly portals: readonly unknown[];
  readonly anchorAudit: {
    readonly status: string;
    readonly policy: string;
    readonly reviewedAsset: string;
    readonly reviewedAssetSha256: string;
    readonly previousLabelCount: number;
    readonly retainedLabelCount: number;
    readonly removedLabelCount: number;
  };
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as T;
}

test("supermarket grocery is an audited terminal scene with dense practical vocabulary", async () => {
  const scene = await readJson<Scene>("supermarket-grocery.json");
  assert.equal(scene.id, "supermarket-grocery");
  assert.equal(scene.parentId, "world-map");
  assert.equal(scene.asset, "/scenes/supermarket-grocery-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 115);
  assert.equal(scene.visualRegions.length, scene.labels.length);
  assert.deepEqual(scene.detailZones.map((zone) => [zone.id, zone.labelIds.length]), [
    ["supermarket-grocery-zone-produce-section", 23],
    ["supermarket-grocery-zone-chilled-dairy", 24],
    ["supermarket-grocery-zone-grocery-aisle", 24],
    ["supermarket-grocery-zone-checkout-lanes", 25],
    ["supermarket-grocery-zone-store-services", 19],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [20, 29, 32, 22, 12],
  );
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 6);
  assert.equal(scene.anchorAudit.retainedLabelCount, 115);

  const assetBytes = await readFile(resolve(projectRoot, "public", scene.asset.replace(/^\//u, "")));
  const assetMetadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: assetMetadata.format, width: assetMetadata.width, height: assetMetadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );
  assert.equal(
    createHash("sha256").update(assetBytes).digest("hex"),
    scene.anchorAudit.reviewedAssetSha256,
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/supermarket-grocery-v1.png"));
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "14c8a91258539f6851144a1ac1bca3b43356ffe14226845734d9338ba6b579c9",
  );

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a visual audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const zoneLabelIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneLabelIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneLabelIds.has(label.id), `${label.id} has a detail zone`);

  const manifest = await readJson<{ scenes: readonly { id: string }[] }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ labels: readonly { word: string }[] }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const label of scene.labels) {
    assert.equal(existingWords.has(label.word.toLocaleLowerCase()), false, `supermarket term duplicated: ${label.word}`);
  }
});

test("the market atlas exposes supermarket through one real retail-panel portal", async () => {
  const worldMap = await readJson<{
    portals: readonly {
      id: string;
      label: string;
      translation: string;
      childSceneId: string;
      sourceVisualRegion: string;
      x: number;
      y: number;
      width: number;
      height: number;
      enterScale: number;
    }[];
    visualRegions: readonly { id: string }[];
  }>("world-map.json");
  assert.deepEqual(
    worldMap.portals.find(({ childSceneId }) => childSceneId === "supermarket-grocery"),
    {
      id: "enter-supermarket-grocery",
      label: "Explore the supermarket",
      translation: "探索超市",
      childSceneId: "supermarket-grocery",
      sourceVisualRegion: "portal-enter-supermarket-grocery",
      x: 1_045,
      y: 785,
      width: 200,
      height: 119,
      enterScale: 3.75,
    },
  );
  assert.ok(worldMap.visualRegions.some(({ id }) => id === "portal-enter-supermarket-grocery"));
});
