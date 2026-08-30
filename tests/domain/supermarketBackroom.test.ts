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
  readonly visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[];
  readonly detailZones: readonly { id: string; labelIds: readonly string[] }[];
  readonly portals: readonly { readonly childSceneId: string }[];
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

test("supermarket backroom grounds 143 distinct receiving and cold-storage terms", async () => {
  const scene = await readJson<Scene>("supermarket-backroom.json");
  assert.equal(scene.id, "supermarket-backroom");
  assert.equal(scene.parentId, "supermarket-grocery");
  assert.equal(scene.asset, "/scenes/supermarket-backroom-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 143);
  assert.equal(new Set(scene.labels.map(({ word }) => word)).size, 143);
  assert.equal(scene.visualRegions.length, 144);
  assert.deepEqual(scene.detailZones.map((zone) => [zone.id, zone.labelIds.length]), [
    ["supermarket-backroom-zone-receiving-bay", 20],
    ["supermarket-backroom-zone-material-handling", 22],
    ["supermarket-backroom-zone-pallet-racking", 27],
    ["supermarket-backroom-zone-cold-storage", 26],
    ["supermarket-backroom-zone-packing-station", 26],
    ["supermarket-backroom-zone-sanitation-utilities", 22],
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length), [21, 32, 42, 34, 14]);
  assert.deepEqual(scene.portals.map(({ childSceneId }) => childSceneId), ["supermarket-walk-in-cooler"]);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 8);
  assert.equal(scene.anchorAudit.retainedLabelCount, 143);

  const assetBytes = await readFile(resolve(projectRoot, "public", scene.asset.slice(1)));
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual({ format: metadata.format, width: metadata.width, height: metadata.height }, { format: "jpeg", width: 1_600, height: 900 });

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/supermarket-backroom-v1.png"));
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), "086d0a45c1b0f1a4557323224cf8aea3d2dcfa02947f36a0b0c63e50f237cfb6");
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual({ format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height }, { format: "png", width: 1_672, height: 941 });

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a pixel-audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const zoneLabelIds = new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds));
  assert.equal(zoneLabelIds.size, scene.labels.length);
});

test("the supermarket service door is the only parent entrance to its backroom", async () => {
  const parent = await readJson<{
    portals: readonly { id: string; childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[];
    visualRegions: readonly { id: string }[];
  }>("supermarket-grocery.json");
  assert.deepEqual(parent.portals.filter(({ childSceneId }) => childSceneId === "supermarket-backroom"), [{
    id: "enter-supermarket-backroom",
    label: "Enter the supermarket backroom",
    translation: "进入超市后场",
    childSceneId: "supermarket-backroom",
    sourceVisualRegion: "portal-supermarket-backroom-service-door",
    x: 1_505,
    y: 90,
    width: 90,
    height: 310,
    enterScale: 4.2,
  }]);
  assert.ok(parent.visualRegions.some(({ id }) => id === "portal-supermarket-backroom-service-door"));
});
