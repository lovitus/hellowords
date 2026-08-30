import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const root = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(root, "public/data/scenes");
const sharp = sharpModule as unknown as (input: string | Buffer) => { metadata(): Promise<{ format?: string; width?: number; height?: number }> };
const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(resolve(sceneRoot, name), "utf8")) as T;

interface Scene {
  id: string; parentId: string; asset: string; width: number; height: number;
  labels: readonly { id: string; word: string; x: number; y: number; minLevel: number; sourceVisualRegion: string }[];
  visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[];
  detailZones: readonly { id: string; labelIds: readonly string[] }[];
  portals: readonly unknown[];
  anchorAudit: { status: string; policy: string; reviewedAsset: string; reviewedAssetSha256: string; retainedLabelCount: number; removedLabelCount: number; previousLabelCount: number };
}

test("the walk-in cooler grounds 144 distinct visible terms in six inspectable zones", async () => {
  const scene = await readJson<Scene>("supermarket-walk-in-cooler.json");
  assert.equal(scene.id, "supermarket-walk-in-cooler");
  assert.equal(scene.parentId, "supermarket-backroom");
  assert.equal(scene.asset, "/scenes/supermarket-walk-in-cooler-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1600, 900]);
  assert.equal(scene.labels.length, 144);
  assert.equal(new Set(scene.labels.map(({ word }) => word)).size, 144);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["supermarket-walk-in-cooler-zone-dairy-shelving", 24],
    ["supermarket-walk-in-cooler-zone-produce-shelving", 24],
    ["supermarket-walk-in-cooler-zone-mobile-storage", 24],
    ["supermarket-walk-in-cooler-zone-refrigeration", 24],
    ["supermarket-walk-in-cooler-zone-cooler-doorway", 24],
    ["supermarket-walk-in-cooler-zone-room-fabric", 24],
  ]);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.retainedLabelCount, 144);
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.removedLabelCount, 144);

  const ids = new Set(scene.labels.map(({ id }) => id));
  assert.equal(ids.size, 144);
  assert.equal(new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds)).size, 144);
  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.word} has an audited region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.word} x is contained`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.word} y is contained`);
  }

  const bytes = await readFile(resolve(root, `public${scene.asset}`));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual({ format: metadata.format, width: metadata.width, height: metadata.height }, { format: "jpeg", width: 1600, height: 900 });
  const source = await readFile(resolve(root, "scripts/assets/supermarket-walk-in-cooler-v1.png"));
  assert.equal(createHash("sha256").update(source).digest("hex"), "c559a638ec3396b26cc926c495d7c3a71c6e4befd00358b230feb655ba933b8a");
});

test("the visible backroom cooler doorway is the only entrance to the walk-in cooler", async () => {
  const parent = await readJson<{ portals: readonly { id: string; childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[]; visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[] }>("supermarket-backroom.json");
  const portals = parent.portals.filter(({ childSceneId }) => childSceneId === "supermarket-walk-in-cooler");
  assert.equal(portals.length, 1);
  assert.deepEqual(portals[0], { id: "enter-supermarket-walk-in-cooler", label: "Enter the supermarket walk-in cooler", translation: "进入超市步入式冷库", childSceneId: "supermarket-walk-in-cooler", sourceVisualRegion: "portal-supermarket-walk-in-cooler-doorway", x: 1040, y: 155, width: 280, height: 465, enterScale: 3.2 });
  const region = parent.visualRegions.find(({ id }) => id === portals[0]?.sourceVisualRegion);
  assert.ok(region);
  assert.ok(portals[0].x >= region.x && portals[0].y >= region.y);
  assert.ok(portals[0].x + portals[0].width <= region.x + region.width);
  assert.ok(portals[0].y + portals[0].height <= region.y + region.height);
});
