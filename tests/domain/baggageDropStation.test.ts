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

interface Scene {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly Label[];
  readonly visualRegions: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly detailZones: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly labelIds: readonly string[];
  }[];
  readonly portals: readonly {
    readonly childSceneId: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
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

test("baggage-drop station keeps 155 reviewed scale, conveyor and scanner terms", async () => {
  const scene = await readJson<Scene>("baggage-drop-station.json");
  assert.equal(scene.id, "baggage-drop-station");
  assert.equal(scene.parentId, "check-in-counter");
  assert.equal(scene.asset, "/scenes/baggage-drop-station-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 155);
  assert.equal(scene.visualRegions.length, 156);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["baggage-drop-station-zone-left-drop-module", 25],
    ["baggage-drop-station-zone-center-conveyor-lane", 27],
    ["baggage-drop-station-zone-right-drop-module", 26],
    ["baggage-drop-station-zone-scanner-tag-equipment", 25],
    ["baggage-drop-station-zone-baggage-containers", 17],
    ["baggage-drop-station-zone-cabinet-service-panels", 20],
    ["baggage-drop-station-zone-floor-safety-rails", 15],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    [14, 14, 43, 42, 42],
  );
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 155);
  assert.equal(new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size, 155);
  assert.deepEqual(scene.portals.map(({ childSceneId }) => childSceneId), ["airport-baggage-conveyor"]);
  const conveyorPortal = scene.portals[0];
  assert.deepEqual([conveyorPortal.x, conveyorPortal.y, conveyorPortal.width, conveyorPortal.height], [700, 320, 285, 205]);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "ae99367a4eadff96cac480b88e6dcc41f585b2078615786283116bd8bd117e90");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 8);
  assert.equal(scene.anchorAudit.removedLabelCount, 8);

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a pixel-audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const labelsById = new Map(scene.labels.map((label) => [label.id, label]));
  const zoneLabelIds = new Set<string>();
  for (const zone of scene.detailZones) {
    for (const labelId of zone.labelIds) {
      assert.equal(zoneLabelIds.has(labelId), false, `${labelId} is assigned twice`);
      zoneLabelIds.add(labelId);
      const label = labelsById.get(labelId);
      assert.ok(label, `${labelId} exists`);
      assert.ok(label.x >= zone.x && label.x <= zone.x + zone.width, `${labelId} zone x`);
      assert.ok(label.y >= zone.y && label.y <= zone.y + zone.height, `${labelId} zone y`);
    }
  }
  assert.equal(zoneLabelIds.size, scene.labels.length);

  const manifest = await readJson<{ readonly scenes: readonly { readonly id: string }[] }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ readonly labels: readonly { readonly word: string }[] }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const word of new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase()))) {
    assert.equal(existingWords.has(word), false, `baggage-drop station does not duplicate ${word}`);
  }

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/baggage-drop-station-v1.png"));
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "7a3bf4aa6080f44f5b701f0260d49542b4309be90d10ae99ac9406149aba6745",
  );
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
});

test("check-in counter exposes one bounded baggage-drop entrance", async () => {
  const parent = await readJson<{
    readonly portals: readonly { childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[];
    readonly visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[];
  }>("check-in-counter.json");
  const portal = parent.portals.find(({ childSceneId }) => childSceneId === "baggage-drop-station");
  assert.ok(portal);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [470, 350, 600, 330]);
  const region = parent.visualRegions.find(({ id }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
});
