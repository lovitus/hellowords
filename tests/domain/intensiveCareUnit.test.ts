import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const root = resolve(import.meta.dirname, "../..");
const scenes = resolve(root, "public/data/scenes");
const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(resolve(scenes, name), "utf8")) as T;
const sharp = sharpModule as unknown as (input: Buffer) => {
  metadata(): Promise<{ format?: string; width?: number; height?: number; channels?: number }>;
  stats(): Promise<{ channels: readonly { mean: number; stdev: number }[] }>;
};

type Scene = {
  id: string;
  parentId: string;
  asset: string;
  width: number;
  height: number;
  labels: readonly { id: string; word: string; x: number; y: number; sourceVisualRegion: string }[];
  visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[];
  detailZones: readonly { id: string; labelIds: readonly string[] }[];
  portals: readonly unknown[];
  anchorAudit: {
    status: string;
    policy: string;
    reviewedAssetSha256: string;
    retainedLabelCount: number;
  };
};

test("the intensive-care unit grounds 159 distinct visible ICU objects", async () => {
  const scene = await readJson<Scene>("intensive-care-unit.json");
  assert.deepEqual(
    [scene.id, scene.parentId, scene.asset],
    ["intensive-care-unit", "emergency-department", "/scenes/intensive-care-unit-premium-v1.jpg"],
  );
  assert.deepEqual([scene.width, scene.height], [1600, 900]);
  assert.equal(scene.labels.length, 159);
  assert.equal(new Set(scene.labels.map(({ word }) => word)).size, 159);
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 159);
  assert.equal(scene.visualRegions.length, 159);
  assert.equal(scene.detailZones.length, 6);
  assert.equal(new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds)).size, 159);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.retainedLabelCount, 159);
  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.word} has a reviewed region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.word} x is in its region`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.word} y is in its region`);
  }
  const sceneWords = new Set(scene.labels.map(({ word }) => word.trim().toLocaleLowerCase("en-US")));
  const existingWords = new Set<string>();
  for (const file of (await readdir(scenes)).filter((name) => name.endsWith(".json") && name !== "intensive-care-unit.json")) {
    const other = JSON.parse(await readFile(resolve(scenes, file), "utf8")) as { labels?: readonly { word: string }[] };
    for (const label of other.labels ?? []) existingWords.add(label.word.trim().toLocaleLowerCase("en-US"));
  }
  assert.deepEqual([...sceneWords].filter((word) => existingWords.has(word)), []);

  const bytes = await readFile(resolve(root, `public${scene.asset}`));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height, channels: metadata.channels },
    { format: "jpeg", width: 1600, height: 900, channels: 3 },
  );
});

test("the ICU source raster is readable and the authoring output is reproducible", async () => {
  const sourcePath = resolve(root, "scripts/assets/intensive-care-unit-v1.png");
  const source = await readFile(sourcePath);
  assert.equal(createHash("sha256").update(source).digest("hex"), "b5d7282ddde1f1f8bbe7b77f806ea0d3ffbb37af2e488ccf961b4fd7b3f226d8");
  const metadata = await sharp(source).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height, channels: metadata.channels },
    { format: "png", width: 1672, height: 941, channels: 3 },
  );
  const stats = await sharp(source).stats();
  const mean = stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length;
  const spread = Math.max(...stats.channels.map((channel) => channel.mean)) - Math.min(...stats.channels.map((channel) => channel.mean));
  assert.ok(mean > 100 && mean < 230, `ICU source mean luminance is ${mean}`);
  assert.ok(spread > 2, `ICU source retains useful color separation (${spread})`);
});
