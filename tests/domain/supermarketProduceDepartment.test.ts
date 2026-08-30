import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(resolve(sceneRoot, name), "utf8")) as T;
const decodeImage = sharpModule as unknown as (input: string | Buffer) => {
  metadata(): Promise<{ format?: string; width?: number; height?: number; channels?: number }>;
  removeAlpha(): { raw(): { toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> } };
};

interface Region {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ProduceScene {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly { id: string; word: string; x: number; y: number; minLevel: number; sourceVisualRegion: string }[];
  readonly visualRegions: readonly Region[];
  readonly detailZones: readonly { id: string; labelIds: readonly string[] }[];
  readonly portals: readonly { readonly childSceneId: string }[];
  readonly anchorAudit: { status: string; policy: string; reviewedAsset: string; reviewedAssetSha256: string; retainedLabelCount: number };
}

test("the supermarket produce department grounds 150 distinct visible produce terms", async () => {
  const scene = await readJson<ProduceScene>("supermarket-produce-department.json");
  assert.deepEqual(
    [scene.id, scene.parentId, scene.asset],
    ["supermarket-produce-department", "supermarket-grocery", "/scenes/supermarket-produce-department-premium-v1.jpg"],
  );
  assert.deepEqual([scene.width, scene.height], [1600, 900]);
  assert.equal(scene.labels.length, 150);
  assert.equal(new Set(scene.labels.map(({ word }) => word)).size, 150);
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 150);
  assert.equal(scene.visualRegions.length, scene.labels.length + scene.portals.length);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["supermarket-produce-department-zone-left-fruit-crates", 25],
    ["supermarket-produce-department-zone-central-fruit-display", 24],
    ["supermarket-produce-department-zone-scale-and-bag-station", 24],
    ["supermarket-produce-department-zone-leafy-greens-and-herbs", 24],
    ["supermarket-produce-department-zone-vegetable-trays", 27],
    ["supermarket-produce-department-zone-lower-produce-storage", 26],
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length), [32, 42, 27, 30, 19]);
  assert.equal(new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds)).size, 150);
  assert.deepEqual(scene.portals.map(({ childSceneId }) => childSceneId), ["produce-weighing-station"]);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.retainedLabelCount, 150);

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  const zoneLabelIds = new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.word} keeps a pixel-audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.word} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.word} y`);
    assert.ok(zoneLabelIds.has(label.id), `${label.word} belongs to a detail zone`);
    const zone = scene.detailZones.find(({ labelIds }) => labelIds.includes(label.id));
    assert.ok(zone, `${label.word} has a detail zone`);
  }

  const sceneWords = new Set(scene.labels.map(({ word }) => word.trim().toLocaleLowerCase("en-US")));
  const existingWords = new Set<string>();
  for (const file of (await readdir(sceneRoot)).filter((name) => name.endsWith(".json") && name !== "supermarket-produce-department.json")) {
    const other = JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as { labels?: readonly { word: string }[] };
    for (const label of other.labels ?? []) existingWords.add(label.word.trim().toLocaleLowerCase("en-US"));
  }
  assert.deepEqual([...sceneWords].filter((word) => existingWords.has(word)), []);

  const assetBytes = await readFile(resolve(projectRoot, "public", scene.asset.slice(1)));
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const assetMetadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual({ format: assetMetadata.format, width: assetMetadata.width, height: assetMetadata.height, channels: assetMetadata.channels }, { format: "jpeg", width: 1600, height: 900, channels: 3 });

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/supermarket-produce-department-v1.png"));
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), "01a5fc44bb3d41f6d21fca158ae34649a5beaf0a68e95bb2aee1994bc5c973b9");
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual({ format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height, channels: sourceMetadata.channels }, { format: "png", width: 1672, height: 941, channels: 3 });
});

async function measure(file: string) {
  const { data, info } = await decodeImage(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  const pixels = info.width * info.height;
  let luminance = 0;
  let dark = 0;
  let deepDark = 0;
  let chroma = 0;
  const channelSums = [0, 0, 0];
  for (let index = 0; index < data.length; index += 3) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminance += y;
    if (y < 64) dark += 1;
    if (y < 32) deepDark += 1;
    chroma += (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
    channelSums[0] += red;
    channelSums[1] += green;
    channelSums[2] += blue;
  }
  const channelMeans = channelSums.map((sum) => sum / pixels);
  return {
    meanLuminance: luminance / pixels,
    darkFraction: dark / pixels,
    deepDarkFraction: deepDark / pixels,
    meanChroma: chroma / pixels,
    channelMeanSpread: Math.max(...channelMeans) - Math.min(...channelMeans),
  };
}

test("the produce raster keeps a bright, colorful retail visual range", async () => {
  const metrics = await measure(resolve(projectRoot, "public/scenes/supermarket-produce-department-premium-v1.jpg"));
  assert.ok(metrics.meanLuminance >= 88, `produce mean luminance is ${metrics.meanLuminance.toFixed(2)}`);
  assert.ok(metrics.meanLuminance <= 145, `produce mean luminance is ${metrics.meanLuminance.toFixed(2)}`);
  assert.ok(metrics.darkFraction <= 0.4, `produce dark fraction is ${metrics.darkFraction.toFixed(4)}`);
  assert.ok(metrics.deepDarkFraction <= 0.19, `produce deep-dark fraction is ${metrics.deepDarkFraction.toFixed(4)}`);
  assert.ok(metrics.meanChroma >= 0.18, `produce mean chroma is ${metrics.meanChroma.toFixed(4)}`);
  assert.ok(metrics.meanChroma <= 0.3, `produce mean chroma is ${metrics.meanChroma.toFixed(4)}`);
  assert.ok(metrics.channelMeanSpread <= 65, `produce channel spread is ${metrics.channelMeanSpread.toFixed(2)}`);
});

test("the supermarket exposes one bounded left-hand produce entrance", async () => {
  const parent = await readJson<{
    readonly portals: readonly { childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[];
    readonly visualRegions: readonly Region[];
  }>("supermarket-grocery.json");
  const portal = parent.portals.find(({ childSceneId }) => childSceneId === "supermarket-produce-department");
  assert.ok(portal);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [0, 270, 300, 430]);
  const region = parent.visualRegions.find(({ id }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual(
    [region.x, region.y, region.width, region.height],
    [portal.x, portal.y, portal.width, portal.height],
  );
});
