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

interface BedsideMonitorScene {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly { id: string; word: string; x: number; y: number; minLevel: number; sourceVisualRegion: string }[];
  readonly visualRegions: readonly Region[];
  readonly detailZones: readonly { id: string; x: number; y: number; width: number; height: number; labelIds: readonly string[] }[];
  readonly portals: readonly unknown[];
  readonly anchorAudit: { status: string; policy: string; reviewedAsset: string; reviewedAssetSha256: string; retainedLabelCount: number };
}

test("the bedside monitor station grounds 150 distinct visible equipment terms", async () => {
  const scene = await readJson<BedsideMonitorScene>("bedside-monitor-station.json");
  assert.deepEqual(
    [scene.id, scene.parentId, scene.asset],
    ["bedside-monitor-station", "intensive-care-unit", "/scenes/bedside-monitor-station-premium-v1.jpg"],
  );
  assert.deepEqual([scene.width, scene.height], [1600, 900]);
  assert.equal(scene.labels.length, 150);
  assert.equal(new Set(scene.labels.map(({ word }) => word)).size, 150);
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 150);
  assert.equal(scene.visualRegions.length, 150);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["bedside-monitor-station-zone-primary-monitor-and-mount", 25],
    ["bedside-monitor-station-zone-headwall-service-column", 25],
    ["bedside-monitor-station-zone-pump-rack-and-airway", 25],
    ["bedside-monitor-station-zone-bed-and-handset", 25],
    ["bedside-monitor-station-zone-portable-support-equipment", 25],
    ["bedside-monitor-station-zone-rear-bay-and-cart", 25],
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length), [27, 26, 46, 35, 16]);
  assert.equal(new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds)).size, 150);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.retainedLabelCount, 150);

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.word} keeps a pixel-audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.word} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.word} y`);
    const zone = scene.detailZones.find(({ labelIds }) => labelIds.includes(label.id));
    assert.ok(zone, `${label.word} belongs to a detail zone`);
    assert.ok(label.x >= zone.x && label.x <= zone.x + zone.width, `${label.word} zone x`);
    assert.ok(label.y >= zone.y && label.y <= zone.y + zone.height, `${label.word} zone y`);
  }

  const sceneWords = new Set(scene.labels.map(({ word }) => word.trim().toLocaleLowerCase("en-US")));
  const existingWords = new Set<string>();
  for (const file of (await readdir(sceneRoot)).filter((name) => name.endsWith(".json") && name !== "bedside-monitor-station.json")) {
    const other = JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as { labels?: readonly { word: string }[] };
    for (const label of other.labels ?? []) existingWords.add(label.word.trim().toLocaleLowerCase("en-US"));
  }
  assert.deepEqual([...sceneWords].filter((word) => existingWords.has(word)), []);

  const assetBytes = await readFile(resolve(projectRoot, "public", scene.asset.slice(1)));
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const assetMetadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: assetMetadata.format, width: assetMetadata.width, height: assetMetadata.height, channels: assetMetadata.channels },
    { format: "jpeg", width: 1600, height: 900, channels: 3 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/bedside-monitor-station-v1.png"));
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), "fea4baa41650f2b253f27436954eceedb0da6386cec8d5a2db53917581d0e42c");
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height, channels: sourceMetadata.channels },
    { format: "png", width: 1672, height: 941, channels: 3 },
  );
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

test("the bedside-monitor raster stays bright and readable for dense labels", async () => {
  const metrics = await measure(resolve(projectRoot, "public/scenes/bedside-monitor-station-premium-v1.jpg"));
  assert.ok(metrics.meanLuminance >= 130, `bedside monitor mean luminance is ${metrics.meanLuminance.toFixed(2)}`);
  assert.ok(metrics.meanLuminance <= 180, `bedside monitor mean luminance is ${metrics.meanLuminance.toFixed(2)}`);
  assert.ok(metrics.darkFraction <= 0.11, `bedside monitor dark fraction is ${metrics.darkFraction.toFixed(4)}`);
  assert.ok(metrics.deepDarkFraction <= 0.05, `bedside monitor deep-dark fraction is ${metrics.deepDarkFraction.toFixed(4)}`);
  assert.ok(metrics.meanChroma >= 0.05, `bedside monitor mean chroma is ${metrics.meanChroma.toFixed(4)}`);
  assert.ok(metrics.meanChroma <= 0.16, `bedside monitor mean chroma is ${metrics.meanChroma.toFixed(4)}`);
  assert.ok(metrics.channelMeanSpread <= 20, `bedside monitor channel spread is ${metrics.channelMeanSpread.toFixed(2)}`);
});
