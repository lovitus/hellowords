import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const scenePath = resolve(projectRoot, "public/data/scenes/city-street.json");
const expectedAsset = "/scenes/city-street-bright-v4.jpg";
const expectedSha256 = "e280b0047e7bf0dbcf7f1ff392c38d5b88f06e11bb6304f3d998f47f37438fdf";

interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Label {
  readonly id: string;
  readonly word: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: 0 | 1 | 2 | 3 | 4;
  readonly sourceVisualRegion: string;
}

interface Region extends Rectangle {
  readonly id: string;
}

interface Portal extends Rectangle {
  readonly id: string;
  readonly childSceneId: string;
  readonly sourceVisualRegion: string;
}

interface DetailZone extends Rectangle {
  readonly id: string;
  readonly targetScale: number;
  readonly labelIds: readonly string[];
}

interface Scene {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly Label[];
  readonly portals: readonly Portal[];
  readonly visualRegions: readonly Region[];
  readonly detailZones: readonly DetailZone[];
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

interface Pipeline {
  removeAlpha(): Pipeline;
  resize(width: number, height: number): Pipeline;
  extract(rectangle: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): Pipeline;
  raw(): Pipeline;
  metadata(): Promise<{ readonly format?: string; readonly width?: number; readonly height?: number; readonly channels?: number }>;
  toBuffer(options: { readonly resolveWithObject: true }): Promise<{
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number; readonly channels: number };
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => Pipeline;

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

function overlaps(left: Rectangle, right: Rectangle): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

async function loadScene(): Promise<Scene> {
  return JSON.parse(await readFile(scenePath, "utf8")) as Scene;
}

async function luminanceMetrics(pipeline: Pipeline): Promise<{
  readonly mean: number;
  readonly darkFraction: number;
  readonly deepDarkFraction: number;
}> {
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let dark = 0;
  let deepDark = 0;
  const pixelCount = info.width * info.height;
  for (let index = 0; index < data.length; index += info.channels) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    sum += luminance;
    if (luminance < 64) dark += 1;
    if (luminance < 32) deepDark += 1;
  }
  return {
    mean: sum / pixelCount,
    darkFraction: dark / pixelCount,
    deepDarkFraction: deepDark / pixelCount,
  };
}

test("city street v4 keeps 149 freshly grounded anchors and three destination contracts", async () => {
  const scene = await loadScene();
  assert.equal(scene.id, "city-street");
  assert.equal(scene.parentId, "world-map");
  assert.equal(scene.asset, expectedAsset);
  assert.equal(scene.width, 1600);
  assert.equal(scene.height, 900);
  assert.equal(scene.labels.length, 149);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [20, 20, 23, 32, 54],
  );
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 149);
  assert.equal(new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size, 149);

  const words = new Set(scene.labels.map(({ word }) => word));
  for (const required of [
    "science museum", "museum entrance", "telescope", "storefront", "transit hub",
    "transit entrance", "crosswalk", "curb ramp", "tactile paving", "storm drain",
    "car", "fire hydrant", "bicycle", "helmet", "backpack",
  ]) assert.ok(words.has(required), `missing final-pixel evidence: ${required}`);
  for (const rejected of ["skeleton", "atom symbol", "store sign", "bus door", "taxi", "anatomy model", "brand"])
    assert.ok(!words.has(rejected), `unsupported or forbidden label remains: ${rejected}`);

  assert.deepEqual(
    scene.portals.map(({ id, childSceneId }) => [id, childSceneId]),
    [
      ["enter-science-museum", "science-museum"],
      ["enter-city-cafe", "city-cafe"],
      ["enter-transit", "transit-hub"],
    ],
  );
  for (let left = 0; left < scene.portals.length; left += 1) {
    for (let right = left + 1; right < scene.portals.length; right += 1)
      assert.ok(!overlaps(scene.portals[left], scene.portals[right]), "destination portals stay disjoint");
  }
});

test("city street v4 anchors, regions, portals and six zoom zones stay on audited pixels", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  assert.equal(regions.size, scene.visualRegions.length);
  for (const region of scene.visualRegions) assert.ok(rectangleInside(region, canvas), `region out of bounds: ${region.id}`);
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `missing visual region: ${label.id}`);
    assert.ok(pointInside(label, region), `anchor misses reviewed region: ${label.id}`);
  }
  for (const portal of scene.portals) {
    const region = regions.get(portal.sourceVisualRegion);
    assert.ok(region, `portal missing reviewed region: ${portal.id}`);
    assert.ok(rectangleInside(portal, region), `portal leaves reviewed destination: ${portal.id}`);
  }

  assert.equal(scene.detailZones.length, 6);
  const labels = new Map(scene.labels.map((label) => [label.id, label]));
  const assigned = new Set<string>();
  for (const zone of scene.detailZones) {
    assert.ok(rectangleInside(zone, canvas), `zone out of bounds: ${zone.id}`);
    assert.ok(zone.targetScale >= 2.3 && zone.targetScale <= 3, `zone scale drifts: ${zone.id}`);
    assert.ok(zone.labelIds.length >= 4, `zone too sparse: ${zone.id}`);
    for (const labelId of zone.labelIds) {
      assert.ok(!assigned.has(labelId), `label reused by multiple zones: ${labelId}`);
      assigned.add(labelId);
      const label = labels.get(labelId);
      assert.ok(label, `unknown zone label: ${labelId}`);
      assert.ok(pointInside(label, zone), `zone misses anchor: ${zone.id}/${labelId}`);
    }
  }
  assert.equal(assigned.size, scene.labels.length, "all 149 anchors participate in local zoom exploration");
});

test("city street v4 locks the reviewed bright RGB JPEG and audit", async () => {
  const scene = await loadScene();
  const file = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const [bytes, metadata, assetStat] = await Promise.all([
    readFile(file),
    decodeImage(file).metadata(),
    stat(file),
  ]);
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 900);
  assert.equal(metadata.channels, 3);
  assert.ok(assetStat.size < 1_228_800, "city street asset stays inside the raster budget");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256);

  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, expectedAsset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, expectedSha256);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
  assert.equal(
    scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount,
    scene.anchorAudit.removedLabelCount,
  );

  const thumbnail = decodeImage(bytes).resize(400, 225);
  const frame = await luminanceMetrics(thumbnail);
  assert.ok(frame.mean >= 115, `thumbnail mean luminance is ${frame.mean.toFixed(2)}`);
  assert.ok(frame.darkFraction <= 0.25, `thumbnail dark fraction is ${frame.darkFraction.toFixed(4)}`);
  assert.ok(frame.deepDarkFraction <= 0.05, `thumbnail deep-dark fraction is ${frame.deepDarkFraction.toFixed(4)}`);

  for (const portal of scene.portals) {
    const crop = decodeImage(bytes).extract({
      left: portal.x,
      top: portal.y,
      width: portal.width,
      height: portal.height,
    });
    const metrics = await luminanceMetrics(crop);
    assert.ok(metrics.mean >= 95, `${portal.id} is too dark: ${metrics.mean.toFixed(2)}`);
  }
});
