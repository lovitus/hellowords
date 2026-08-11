import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";
import {
  buildPortalCueProtectedRegions,
  computeSceneLabelLayout,
  type Scene,
  type SceneLabelCamera,
  type SceneLabelLayoutItem,
  type SceneLabelProtectedRegion,
  type SceneLabelViewport,
} from "../../app/domain";

const projectRoot = resolve(import.meta.dirname, "../..");
const scenePath = resolve(projectRoot, "public/data/scenes/world-map.json");
const minimumGroundedLabels = 300;
const minimumExplorationCoverage = 0.9;

const expectedAssets = {
  base: {
    src: "/scenes/world-atlas-master-1600-v2.jpg",
    width: 1_600,
    height: 900,
    sha256: "d7e918e18d31b62fc31386776ffc242c9fefae6c359ae64bf1e9965b491cb008",
  },
  high: {
    src: "/scenes/world-atlas-master-3200-v2.jpg",
    width: 3_200,
    height: 1_800,
    sha256: "c5fa38cd83c57d2864ee2a1c668e1518a28c8cee77639f5c4b2db875c53c5ded",
  },
} as const;

const expectedPortalRectangles = {
  apartment: { x: 160, y: 45, width: 355, height: 275 },
  "city-street": { x: 965, y: 140, width: 560, height: 280 },
  "community-garden": { x: 80, y: 470, width: 545, height: 325 },
  "city-park": { x: 1_080, y: 475, width: 475, height: 380 },
} as const;

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

function sampleAxis(sceneLength: number, visibleLength: number): readonly number[] {
  if (visibleLength >= sceneLength) return [sceneLength / 2];
  const travel = sceneLength - visibleLength;
  const intervalCount = Math.max(1, Math.ceil(travel / (visibleLength * 0.25)));
  return Array.from(
    { length: intervalCount + 1 },
    (_, index) => visibleLength / 2 + travel * index / intervalCount,
  );
}

function centeredCamera(
  centerX: number,
  centerY: number,
  scale: number,
  fit: number,
  viewport: SceneLabelViewport,
): SceneLabelCamera {
  return {
    x: viewport.width / 2 - centerX * fit * scale,
    y: viewport.height / 2 - centerY * fit * scale,
    fit,
    scale,
  };
}

/** Covers the whole raster with dense overlapping pans across the authored spatial zoom range. */
function explorationCameras(scene: Scene, viewport: SceneLabelViewport): readonly SceneLabelCamera[] {
  const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  const sweep = [1, 1.55, 2.1, 2.7, 3.35, 4.15].flatMap((scale) => {
    const effectiveScale = fit * scale;
    const horizontalCenters = sampleAxis(scene.width, viewport.width / effectiveScale);
    const verticalCenters = sampleAxis(scene.height, viewport.height / effectiveScale);
    return horizontalCenters.flatMap((centerX) => verticalCenters.map((centerY) => (
      centeredCamera(centerX, centerY, scale, fit, viewport)
    )));
  });
  const focusScale = 4.15;
  const visibleWidth = viewport.width / (fit * focusScale);
  const visibleHeight = viewport.height / (fit * focusScale);
  const focusedAnchors = scene.labels.map((label) => centeredCamera(
    Math.min(
      scene.width - Math.min(scene.width, visibleWidth) / 2,
      Math.max(Math.min(scene.width, visibleWidth) / 2, label.x),
    ),
    Math.min(
      scene.height - Math.min(scene.height, visibleHeight) / 2,
      Math.max(Math.min(scene.height, visibleHeight) / 2, label.y),
    ),
    focusScale,
    fit,
    viewport,
  ));
  return [...sweep, ...focusedAnchors];
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

test("world atlas contains 300+ unique grounded words across twelve bounded exploration zones", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = scene.visualRegions;
  const zones = scene.detailZones;
  assert.ok(regions, "grounded atlas labels require reviewed visual regions");
  assert.ok(zones, "the atlas requires authored local exploration zones");
  assert.ok(scene.labels.length >= minimumGroundedLabels, "the master scene carries hundreds of real anchors");
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, scene.labels.length, "label ids stay unique");
  assert.equal(
    new Set(scene.labels.map(({ word }) => normalizedWord(word))).size,
    scene.labels.length,
    "grounded atlas words stay unique",
  );

  const regionsById = new Map(regions.map((region) => [region.id, region]));
  assert.equal(regionsById.size, regions.length, "visual-region ids stay unique");
  for (const region of regions) {
    assert.ok(rectangleInside(region, canvas), `visual region leaves the atlas: ${region.id}`);
  }

  for (const label of scene.labels) {
    assert.ok(label.word.trim(), `empty word: ${label.id}`);
    assert.ok(label.translation.trim(), `empty translation: ${label.id}`);
    assert.ok(pointInside(label, canvas), `anchor leaves the atlas: ${label.id}`);
    assert.ok(label.sourceVisualRegion, `anchor lacks a reviewed region: ${label.id}`);
    const region = regionsById.get(label.sourceVisualRegion);
    assert.ok(region, `anchor references an unknown region: ${label.id}/${label.sourceVisualRegion}`);
    assert.ok(pointInside(label, region), `anchor misses its reviewed pixels: ${label.id}`);
  }

  assert.equal(zones.length, 12, "the master raster is explored as twelve local detail groups");
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
  for (const [labelId, memberships] of zoneMembership) {
    assert.equal(memberships, 1, `every grounded label belongs to exactly one zone: ${labelId}`);
  }

  for (const level of [0, 1, 2, 3, 4] as const) {
    assert.ok(
      scene.labels.filter((label) => label.minLevel === level).length >= 20,
      `LOD ${level} keeps at least twenty authored anchors`,
    );
  }
});

test("world atlas keeps four exact, non-overlapping spatial entrances", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = new Map((scene.visualRegions ?? []).map((region) => [region.id, region]));
  assert.equal(scene.portals.length, 4);
  assert.deepEqual(
    [...scene.portals.map(({ childSceneId }) => childSceneId)].sort(),
    [...Object.keys(expectedPortalRectangles)].sort(),
  );

  for (const portal of scene.portals) {
    const expected = expectedPortalRectangles[portal.childSceneId as keyof typeof expectedPortalRectangles];
    assert.ok(expected, `unexpected atlas destination: ${portal.childSceneId}`);
    assert.deepEqual(
      { x: portal.x, y: portal.y, width: portal.width, height: portal.height },
      expected,
      `${portal.childSceneId} portal crop`,
    );
    assert.ok(rectangleInside(portal, canvas), `portal leaves the atlas: ${portal.id}`);
    assert.ok(portal.sourceVisualRegion, `portal lacks a reviewed region: ${portal.id}`);
    const sourceRegion = regions.get(portal.sourceVisualRegion);
    assert.ok(sourceRegion, `portal references an unknown region: ${portal.id}`);
    assert.ok(rectangleInside(portal, sourceRegion), `portal leaves its reviewed destination: ${portal.id}`);
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
    const signatures: LayoutSignature[] = [];
    const encountered = new Set<string>();

    for (const [frameIndex, camera] of cameras.entries()) {
      const protectedRegions = buildPortalCueProtectedRegions(scene.portals, camera, viewport);
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
      signatures.push(layoutSignature(layout));
    }

    assert.ok(
      encountered.size >= Math.ceil(scene.labels.length * minimumExplorationCoverage),
      `${viewportConfiguration.name} camera sweep reached ${encountered.size}/${scene.labels.length} atlas words`,
    );

    for (let frameIndex = cameras.length - 1; frameIndex >= 0; frameIndex -= 1) {
      const camera = cameras[frameIndex];
      const protectedRegions = buildPortalCueProtectedRegions(scene.portals, camera, viewport);
      const replay = computeSceneLabelLayout(
        scene.labels,
        camera,
        viewport,
        false,
        { protectedRegions },
      );
      assert.deepEqual(
        layoutSignature(replay),
        signatures[frameIndex],
        `${viewportConfiguration.name}/${frameIndex} returns to the exact same label set and offsets`,
      );
    }
  }
});
