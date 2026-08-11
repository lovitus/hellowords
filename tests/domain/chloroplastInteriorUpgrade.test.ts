import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const scenePath = resolve(projectRoot, "public/data/scenes/chloroplast-interior.json");
const expectedAsset = "/scenes/chloroplast-interior-premium-v3.jpg";
const expectedSha256 = "28a1078d445a763a3a3796543c8b7088d863defa8418089a9a681c640a0c406b";

interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ChloroplastLabel {
  readonly id: string;
  readonly word: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: 0 | 1 | 2 | 3 | 4;
  readonly sourceVisualRegion: string;
}

interface ChloroplastRegion extends Rectangle {
  readonly id: string;
}

interface ChloroplastZone extends Rectangle {
  readonly id: string;
  readonly targetScale: number;
  readonly labelIds: readonly string[];
}

interface ChloroplastScene {
  readonly id: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly parentId: string;
  readonly labels: readonly ChloroplastLabel[];
  readonly portals: readonly unknown[];
  readonly visualRegions: readonly ChloroplastRegion[];
  readonly detailZones: readonly ChloroplastZone[];
  readonly anchorAudit: {
    readonly status: string;
    readonly policy: string;
    readonly reviewedAsset: string;
    readonly reviewedAssetSha256: string;
    readonly previousLabelCount: number;
    readonly retainedLabelCount: number;
    readonly removedLabelCount: number;
    readonly removedExamples: readonly string[];
  };
}

interface ImagePipeline {
  metadata(): Promise<{
    readonly format?: string;
    readonly width?: number;
    readonly height?: number;
    readonly channels?: number;
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;

async function loadScene(): Promise<ChloroplastScene> {
  return JSON.parse(await readFile(scenePath, "utf8")) as ChloroplastScene;
}

function pointInside(point: { readonly x: number; readonly y: number }, rectangle: Rectangle): boolean {
  return point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height;
}

function rectangleInside(inner: Rectangle, outer: Rectangle): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

test("chloroplast upgrade preserves the terminal scientific scene schema", async () => {
  const scene = await loadScene();
  assert.equal(scene.id, "chloroplast-interior");
  assert.equal(scene.parentId, "plant-cell");
  assert.equal(scene.asset, expectedAsset);
  assert.equal(scene.width, 1600);
  assert.equal(scene.height, 900);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.labels.length, 36);
  assert.equal(scene.visualRegions.length, 25);
  assert.equal(scene.detailZones.length, 6);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [8, 7, 7, 7, 7],
  );

  assert.equal(new Set(scene.labels.map((label) => label.id)).size, scene.labels.length);
  assert.equal(
    new Set(scene.labels.map((label) => label.word.toLocaleLowerCase())).size,
    scene.labels.length,
  );
  const words = new Set(scene.labels.map((label) => label.word));
  for (const term of [
    "outer membrane",
    "inner membrane",
    "intermembrane space",
    "stroma",
    "granum",
    "thylakoid",
    "thylakoid lumen",
    "stroma lamella",
    "starch grain",
    "plastoglobule",
    "ribosome",
    "DNA loop",
    "photosystem",
    "ATP synthase",
  ]) {
    assert.ok(words.has(term), `missing required visible structure: ${term}`);
  }
  for (const invisibleProcess of [
    "Calvin cycle",
    "Rubisco",
    "carbon fixation",
    "electron transport chain",
    "NADPH",
    "proton gradient",
  ]) {
    assert.ok(!words.has(invisibleProcess), `process is not a pointable structure: ${invisibleProcess}`);
  }

  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, expectedAsset);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
  assert.equal(
    scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount,
    scene.anchorAudit.removedLabelCount,
  );
  assert.equal(scene.anchorAudit.removedExamples.length, scene.anchorAudit.removedLabelCount);
});

test("chloroplast anchors, audited regions, and six detail zones stay on their final pixels", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  assert.equal(regions.size, scene.visualRegions.length);
  for (const region of scene.visualRegions) {
    assert.ok(rectangleInside(region, canvas), `visual region leaves canvas: ${region.id}`);
  }
  for (const label of scene.labels) {
    assert.ok(pointInside(label, canvas), `label leaves canvas: ${label.id}`);
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `label has no audited visual region: ${label.id}`);
    assert.ok(pointInside(label, region), `label misses audited pixels: ${label.id}`);
  }

  const labels = new Map(scene.labels.map((label) => [label.id, label]));
  const zoneIds = new Set<string>();
  const assignedLabels = new Set<string>();
  for (const zone of scene.detailZones) {
    assert.ok(!zoneIds.has(zone.id), `duplicate detail zone: ${zone.id}`);
    zoneIds.add(zone.id);
    assert.ok(rectangleInside(zone, canvas), `detail zone leaves canvas: ${zone.id}`);
    assert.ok(zone.targetScale > 1 && zone.targetScale <= 4, `invalid scale: ${zone.id}`);
    assert.ok(zone.labelIds.length >= 4, `detail zone is too sparse: ${zone.id}`);
    for (const labelId of zone.labelIds) {
      assert.ok(!assignedLabels.has(labelId), `label reused across detail zones: ${labelId}`);
      assignedLabels.add(labelId);
      const label = labels.get(labelId);
      assert.ok(label, `detail zone references unknown label: ${labelId}`);
      assert.ok(pointInside(label, zone), `detail-zone crop misses label: ${zone.id}/${labelId}`);
    }
  }
  assert.deepEqual(
    scene.labels.filter((label) => !assignedLabels.has(label.id)).map((label) => label.id),
    ["chloroplast"],
  );
  assert.equal(assignedLabels.size, 35);
});

test("chloroplast audit hash locks a compact 1600 by 900 RGB JPEG", async () => {
  const scene = await loadScene();
  const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const [bytes, assetStat, metadata] = await Promise.all([
    readFile(assetPath),
    stat(assetPath),
    decodeImage(assetPath).metadata(),
  ]);

  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 900);
  assert.equal(metadata.channels, 3);
  assert.ok(assetStat.size <= 1_228_800, "asset stays inside the project raster budget");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, expectedSha256);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, expectedSha256);
});
