import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const root = resolve(import.meta.dirname, "../..");
const scenes = resolve(root, "public/data/scenes");
const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(resolve(scenes, name), "utf8")) as T;
const sharp = sharpModule as unknown as (input: Buffer) => { metadata(): Promise<{ format?: string; width?: number; height?: number }> };

test("the post-anesthesia care unit grounds 134 distinct visible recovery-room terms", async () => {
  const scene = await readJson<{
    id: string; parentId: string; asset: string; width: number; height: number;
    labels: readonly { id: string; word: string; x: number; y: number; sourceVisualRegion: string }[];
    visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[];
    detailZones: readonly { id: string; labelIds: readonly string[] }[];
    portals: readonly unknown[];
    anchorAudit: { status: string; policy: string; reviewedAssetSha256: string; retainedLabelCount: number };
  }>("post-anesthesia-care-unit.json");
  assert.deepEqual([scene.id, scene.parentId, scene.asset], ["post-anesthesia-care-unit", "operating-theatre", "/scenes/post-anesthesia-care-unit-premium-v1.jpg"]);
  assert.deepEqual([scene.width, scene.height], [1600, 900]);
  assert.equal(scene.labels.length, 134);
  assert.equal(new Set(scene.labels.map(({ word }) => word)).size, 134);
  assert.equal(scene.detailZones.length, 6);
  assert.equal(new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds)).size, 134);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.retainedLabelCount, 134);
  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.word} has a reviewed region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height);
  }
  const bytes = await readFile(resolve(root, `public${scene.asset}`));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual({ format: metadata.format, width: metadata.width, height: metadata.height }, { format: "jpeg", width: 1600, height: 900 });
});

test("the visible recovery ward is the operating-theatre entrance to PACU", async () => {
  const parent = await readJson<{ portals: readonly { childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[]; visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[] }>("operating-theatre.json");
  const portals = parent.portals.filter(({ childSceneId }) => childSceneId === "post-anesthesia-care-unit");
  assert.equal(portals.length, 1);
  const portal = portals[0];
  const region = parent.visualRegions.find(({ id }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.ok(portal.x >= region.x && portal.y >= region.y);
  assert.ok(portal.x + portal.width <= region.x + region.width);
  assert.ok(portal.y + portal.height <= region.y + region.height);
});
