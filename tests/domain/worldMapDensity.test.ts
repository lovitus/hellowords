import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";
import {
  buildPortalCueProtectedRegions,
  computeSceneLabelLayout,
  maximumSceneCameraScale,
  type Scene,
  type SceneLabelCamera,
  type SceneLabelLayoutItem,
  type SceneLabelProtectedRegion,
  type SceneLabelViewport,
} from "../../app/domain";
import { buildViewerChromeProtectedRegions } from "../../app/components/SceneViewport";

const projectRoot = resolve(import.meta.dirname, "../..");
const scenePath = resolve(projectRoot, "public/data/scenes/world-map.json");
const expectedGroundedLabels = 1_289;
const expectedVisualRegions = 1_294;
const expectedDetailZones = 66;
const expectedLodCounts = { 0: 202, 1: 446, 2: 456, 3: 172, 4: 13 } as const;
const minimumExplorationCoverage = 0.9;

const expectedAssets = {
  base: {
    src: "/scenes/world-mega-atlas-2604-v21.jpg",
    width: 2_604,
    height: 989,
    sha256: "1f604a7727b9d18cf4d4447eaf88b5883eb3720f6d4540bdd1af6c86654bd54d",
  },
  high: {
    src: "/scenes/world-mega-atlas-5208-v21.jpg",
    width: 5_208,
    height: 1_978,
    sha256: "8761e582e58bfb2aa46443c0eb9000a1a87b6582d23718a1be71c609258dc9a4",
  },
} as const;

const expectedPortals = [
  {
    childSceneId: "apartment",
    sourceVisualRegion: "portal-enter-home",
    rectangle: { x: 1_500, y: 620, width: 200, height: 150 },
  },
  {
    childSceneId: "city-street",
    sourceVisualRegion: "portal-enter-city",
    rectangle: { x: 1_808, y: 20, width: 200, height: 150 },
  },
  {
    childSceneId: "city-park",
    sourceVisualRegion: "portal-enter-nature",
    rectangle: { x: 1_740, y: 510, width: 480, height: 360 },
  },
  {
    childSceneId: "community-garden",
    sourceVisualRegion: "portal-enter-community-garden",
    rectangle: { x: 240, y: 530, width: 480, height: 260 },
  },
  {
    childSceneId: "school-campus",
    sourceVisualRegion: "portal-enter-school-campus",
    rectangle: { x: 500, y: 330, width: 220, height: 100 },
  },
] as const;

const explorationViewports = [
  { name: "desktop", width: 1_280, height: 720, compact: false },
  { name: "mobile", width: 390, height: 640, compact: true },
] as const;

interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface ImagePipeline {
  metadata(): Promise<{
    readonly format?: string;
    readonly width?: number;
    readonly height?: number;
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;

async function loadScene(): Promise<Scene> {
  return JSON.parse(await readFile(scenePath, "utf8")) as Scene;
}

function assetFile(src: string): string {
  return resolve(projectRoot, "public", src.replace(/^\//u, ""));
}

function pointInside(point: { readonly x: number; readonly y: number }, rectangle: Rectangle): boolean {
  return point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height;
}

function rectangleInside(inner: Rectangle, outer: Rectangle): boolean {
  return inner.width > 0
    && inner.height > 0
    && inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function rectanglesOverlap(first: Rectangle, second: Rectangle): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function boundsOverlap(first: Bounds, second: Bounds): boolean {
  return !(
    first.right <= second.left
    || first.left >= second.right
    || first.bottom <= second.top
    || first.top >= second.bottom
  );
}

function itemBounds(item: SceneLabelLayoutItem): Bounds {
  return {
    left: item.screenX - item.width / 2,
    right: item.screenX + item.width / 2,
    top: item.screenY - item.height / 2,
    bottom: item.screenY + item.height / 2,
  };
}

function normalizedWord(word: string): string {
  return word.normalize("NFKC").trim().toLocaleLowerCase("en");
}

function sampleCameraAxis(
  viewportLength: number,
  scaledSceneLength: number,
  margin: number,
): readonly number[] {
  const minimum = Math.min(margin, viewportLength - scaledSceneLength - margin);
  const maximum = Math.max(viewportLength - scaledSceneLength - margin, margin);
  const travel = maximum - minimum;
  const intervalCount = Math.max(1, Math.ceil(travel / (viewportLength * 0.18)));
  return Array.from(
    { length: intervalCount + 1 },
    (_, index) => minimum + travel * index / intervalCount,
  );
}

function explorationScales(maximumScale: number): readonly number[] {
  return [...new Set([1, 2.1, 4.15, maximumScale].filter((scale) => scale <= maximumScale))]
    .sort((a, b) => a - b);
}

/** Covers every production pan extreme with overlapping crops through the responsive spatial ceiling. */
function explorationCameras(scene: Scene, viewport: SceneLabelViewport): readonly SceneLabelCamera[] {
  const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  const margin = Math.min(viewport.width, viewport.height) * 0.18;
  return explorationScales(maximumSceneCameraScale(fit)).flatMap((scale) => {
    const effectiveScale = fit * scale;
    const horizontalTranslations = sampleCameraAxis(
      viewport.width,
      scene.width * effectiveScale,
      margin,
    );
    const verticalTranslations = sampleCameraAxis(
      viewport.height,
      scene.height * effectiveScale,
      margin,
    );
    return horizontalTranslations.flatMap((x) => verticalTranslations.map((y) => ({
      x,
      y,
      fit,
      scale,
    })));
  });
}

function representativeReplayIndices(frameCount: number): ReadonlySet<number> {
  const lastIndex = frameCount - 1;
  const sampleCount = Math.min(11, frameCount);
  return new Set(Array.from(
    { length: sampleCount },
    (_, index) => Math.round(lastIndex * index / Math.max(1, sampleCount - 1)),
  ));
}

function protectedRegionsFor(
  scene: Scene,
  camera: SceneLabelCamera,
  viewport: SceneLabelViewport,
): readonly SceneLabelProtectedRegion[] {
  return [
    ...buildViewerChromeProtectedRegions(viewport.width, viewport.height),
    ...buildPortalCueProtectedRegions(scene.portals, camera, viewport),
  ];
}

type LayoutSignature = ReadonlyArray<readonly [
  id: string,
  interactive: boolean,
  adaptive: boolean,
  opacity: number,
  screenX: number,
  screenY: number,
  offsetX: number,
  offsetY: number,
  placementOrder: number,
]>;

function layoutSignature(layout: readonly SceneLabelLayoutItem[]): LayoutSignature {
  return layout.map((item) => [
    item.id,
    item.interactive,
    item.adaptive,
    item.opacity,
    item.screenX,
    item.screenY,
    item.offsetX,
    item.offsetY,
    item.placementOrder,
  ]);
}

function assertCollisionFreeFrame(
  viewportName: string,
  frameIndex: number,
  layout: readonly SceneLabelLayoutItem[],
  protectedRegions: readonly SceneLabelProtectedRegion[],
  viewport: SceneLabelViewport,
): void {
  const visible = layout.filter((item) => item.interactive);
  for (let index = 0; index < visible.length; index += 1) {
    const item = visible[index];
    const bounds = itemBounds(item);
    assert.ok(bounds.left >= 0 && bounds.right <= viewport.width, `${viewportName}/${frameIndex}/${item.id} x bounds`);
    assert.ok(bounds.top >= 0 && bounds.bottom <= viewport.height, `${viewportName}/${frameIndex}/${item.id} y bounds`);
    for (const protectedRegion of protectedRegions) {
      assert.equal(
        boundsOverlap(bounds, protectedRegion),
        false,
        `${viewportName}/${frameIndex}/${item.id} avoids portal controls`,
      );
    }
    for (let otherIndex = index + 1; otherIndex < visible.length; otherIndex += 1) {
      assert.equal(
        boundsOverlap(bounds, itemBounds(visible[otherIndex])),
        false,
        `${viewportName}/${frameIndex}/${item.id} overlaps ${visible[otherIndex].id}`,
      );
    }
  }
}

test("world atlas pins canonical base and on-demand high-resolution bytes", async () => {
  const scene = await loadScene();
  assert.equal(scene.id, "world-map");
  assert.equal(scene.asset, expectedAssets.base.src);
  assert.equal(scene.width, expectedAssets.base.width);
  assert.equal(scene.height, expectedAssets.base.height);
  assert.deepEqual(scene.assets, expectedAssets);

  for (const [tier, descriptor] of Object.entries(expectedAssets)) {
    const file = assetFile(descriptor.src);
    const [bytes, metadata] = await Promise.all([
      readFile(file),
      decodeImage(file).metadata(),
    ]);
    assert.equal(metadata.format, "jpeg", `${tier} encoded format`);
    assert.equal(metadata.width, descriptor.width, `${tier} decoded width`);
    assert.equal(metadata.height, descriptor.height, `${tier} decoded height`);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      descriptor.sha256,
      `${tier} immutable digest`,
    );
  }

  assert.ok(scene.anchorAudit, "the atlas keeps a human anchor audit");
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, expectedAssets.base.src);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, expectedAssets.base.sha256);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
});

test("world atlas contains 1289 unique grounded words across 66 bounded exploration zones", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = scene.visualRegions;
  const zones = scene.detailZones;
  assert.ok(regions, "grounded atlas labels require reviewed visual regions");
  assert.ok(zones, "the atlas requires authored local exploration zones");
  assert.equal(scene.labels.length, expectedGroundedLabels, "the v21 atlas keeps its audited label inventory");
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, scene.labels.length, "label ids stay unique");
  assert.equal(
    new Set(scene.labels.map(({ word }) => normalizedWord(word))).size,
    scene.labels.length,
    "grounded atlas words stay unique",
  );

  const regionsById = new Map(regions.map((region) => [region.id, region]));
  assert.equal(regions.length, expectedVisualRegions, "every label and portal keeps one reviewed pixel region");
  assert.equal(regionsById.size, regions.length, "visual-region ids stay unique");
  for (const region of regions) {
    assert.ok(rectangleInside(region, canvas), `visual region leaves the atlas: ${region.id}`);
  }

  const labelRegionIds = new Set<string>();
  for (const label of scene.labels) {
    assert.ok(label.word.trim(), `empty word: ${label.id}`);
    assert.ok(label.translation.trim(), `empty translation: ${label.id}`);
    assert.ok(pointInside(label, canvas), `anchor leaves the atlas: ${label.id}`);
    assert.ok(label.sourceVisualRegion, `anchor lacks a reviewed region: ${label.id}`);
    const region = regionsById.get(label.sourceVisualRegion);
    assert.ok(region, `anchor references an unknown region: ${label.id}/${label.sourceVisualRegion}`);
    assert.ok(pointInside(label, region), `anchor misses its reviewed pixels: ${label.id}`);
    assert.equal(
      labelRegionIds.has(label.sourceVisualRegion),
      false,
      `anchors cannot share a reviewed pixel region: ${label.sourceVisualRegion}`,
    );
    labelRegionIds.add(label.sourceVisualRegion);
  }
  assert.equal(labelRegionIds.size, scene.labels.length, "every anchor owns one reviewed pixel region");

  assert.equal(zones.length, expectedDetailZones, "the six panels retain all authored local detail groups");
  assert.equal(new Set(zones.map(({ id }) => id)).size, zones.length, "detail-zone ids stay unique");
  const labelsById = new Map(scene.labels.map((label) => [label.id, label]));
  const zoneMembership = new Map(scene.labels.map((label) => [label.id, 0]));
  for (const zone of zones) {
    assert.ok(rectangleInside(zone, canvas), `detail zone leaves the atlas: ${zone.id}`);
    assert.ok(zone.targetScale > 1 && zone.targetScale <= 4.15, `invalid detail scale: ${zone.id}`);
    assert.ok(zone.labelIds.length > 0, `empty detail zone: ${zone.id}`);
    assert.equal(new Set(zone.labelIds).size, zone.labelIds.length, `duplicate label in zone: ${zone.id}`);
    for (const labelId of zone.labelIds) {
      const label = labelsById.get(labelId);
      assert.ok(label, `zone references an unknown label: ${zone.id}/${labelId}`);
      assert.ok(pointInside(label, zone), `zone misses its anchor: ${zone.id}/${labelId}`);
      zoneMembership.set(labelId, (zoneMembership.get(labelId) ?? 0) + 1);
    }
  }
  for (let index = 0; index < zones.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < zones.length; otherIndex += 1) {
      assert.equal(
        rectanglesOverlap(zones[index], zones[otherIndex]),
        false,
        `${zones[index].id} overlaps ${zones[otherIndex].id}`,
      );
    }
  }
  for (const [labelId, memberships] of zoneMembership) {
    assert.equal(memberships, 1, `every grounded label belongs to exactly one zone: ${labelId}`);
  }

  for (const level of [0, 1, 2, 3, 4] as const) {
    assert.equal(
      scene.labels.filter((label) => label.minLevel === level).length,
      expectedLodCounts[level],
      `LOD ${level} keeps its audited v21 inventory`,
    );
  }
});

test("world atlas keeps five exact, non-overlapping spatial entrances", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = new Map((scene.visualRegions ?? []).map((region) => [region.id, region]));
  assert.equal(scene.portals.length, 5);
  assert.deepEqual(
    scene.portals.map(({ childSceneId }) => childSceneId),
    expectedPortals.map(({ childSceneId }) => childSceneId),
    "portal order remains home, city, nature, community",
  );

  for (const [index, portal] of scene.portals.entries()) {
    const expected = expectedPortals[index];
    assert.deepEqual(
      { x: portal.x, y: portal.y, width: portal.width, height: portal.height },
      expected.rectangle,
      `${portal.childSceneId} portal crop`,
    );
    assert.ok(rectangleInside(portal, canvas), `portal leaves the atlas: ${portal.id}`);
    assert.equal(
      portal.sourceVisualRegion,
      expected.sourceVisualRegion,
      `${portal.childSceneId} keeps its reviewed destination region`,
    );
    const sourceRegion = regions.get(portal.sourceVisualRegion);
    assert.ok(sourceRegion, `portal references an unknown region: ${portal.id}`);
    assert.deepEqual(
      { x: sourceRegion.x, y: sourceRegion.y, width: sourceRegion.width, height: sourceRegion.height },
      expected.rectangle,
      `${portal.childSceneId} reviewed region exactly matches its entrance`,
    );
  }

  for (let index = 0; index < scene.portals.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < scene.portals.length; otherIndex += 1) {
      assert.equal(
        rectanglesOverlap(scene.portals[index], scene.portals[otherIndex]),
        false,
        `${scene.portals[index].id} overlaps ${scene.portals[otherIndex].id}`,
      );
    }
  }
});

test("production label layout reveals at least 90% of the atlas without collisions or camera-history drift", async () => {
  const scene = await loadScene();

  for (const viewportConfiguration of explorationViewports) {
    const viewport: SceneLabelViewport = viewportConfiguration;
    const cameras = explorationCameras(scene, viewport);
    const replayIndices = representativeReplayIndices(cameras.length);
    const signatures = new Map<number, LayoutSignature>();
    const encountered = new Set<string>();

    assert.ok(
      new Set(cameras.map(({ x }) => x)).size > 2
        && new Set(cameras.map(({ y }) => y)).size > 2,
      `${viewportConfiguration.name} camera sweep pans in both dimensions`,
    );

    for (const [frameIndex, camera] of cameras.entries()) {
      const protectedRegions = protectedRegionsFor(scene, camera, viewport);
      const layout = computeSceneLabelLayout(
        scene.labels,
        camera,
        viewport,
        false,
        { protectedRegions },
      );
      assertCollisionFreeFrame(
        viewportConfiguration.name,
        frameIndex,
        layout,
        protectedRegions,
        viewport,
      );
      for (const item of layout) {
        if (item.interactive) encountered.add(item.id);
      }
      if (replayIndices.has(frameIndex)) signatures.set(frameIndex, layoutSignature(layout));
    }

    assert.ok(
      encountered.size >= Math.ceil(scene.labels.length * minimumExplorationCoverage),
      `${viewportConfiguration.name} camera sweep reached ${encountered.size}/${scene.labels.length} atlas words`,
    );

    for (const frameIndex of [...replayIndices].sort((left, right) => right - left)) {
      const camera = cameras[frameIndex];
      const protectedRegions = protectedRegionsFor(scene, camera, viewport);
      const replay = computeSceneLabelLayout(
        scene.labels,
        camera,
        viewport,
        false,
        { protectedRegions },
      );
      assert.deepEqual(
        layoutSignature(replay),
        signatures.get(frameIndex),
        `${viewportConfiguration.name}/${frameIndex} returns to the exact same label set and offsets`,
      );
    }
  }
});
