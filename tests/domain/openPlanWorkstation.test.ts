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

async function readJson(file: string) {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8"));
}

test("open-plan workstation keeps 150 reviewed, independently pointable terms", async () => {
  const scene = await readJson("open-plan-workstation.json");
  assert.equal(scene.id, "open-plan-workstation");
  assert.equal(scene.parentId, "office-building");
  assert.equal(scene.asset, "/scenes/open-plan-workstation-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 150);
  assert.equal(scene.visualRegions.length, 150);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }: { id: string; labelIds: string[] }) => [id, labelIds.length]), [
    ["open-plan-workstation-zone-left-workstation-island", 25],
    ["open-plan-workstation-zone-center-workstation-island", 25],
    ["open-plan-workstation-zone-right-workstation-island", 25],
    ["open-plan-workstation-zone-shared-office-fittings", 25],
    ["open-plan-workstation-zone-cable-management-and-seating", 25],
    ["open-plan-workstation-zone-lighting-plants-and-floor", 25],
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }: { minLevel: number }) => minLevel === level).length), [45, 31, 40, 25, 9]);
  assert.equal(new Set(scene.labels.map(({ id }: { id: string }) => id)).size, 150);
  assert.equal(new Set(scene.labels.map(({ word }: { word: string }) => word.toLocaleLowerCase())).size, 150);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "9acbbe66dd5fb56faa58562c07219f723bb39d12d535648fa7be6e3abcd7f1df");
});

test("open-plan workstation asset and office entrance are reproducible and bounded", async () => {
  const bytes = await readFile(resolve(projectRoot, "public/scenes/open-plan-workstation-premium-v1.jpg"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "9acbbe66dd5fb56faa58562c07219f723bb39d12d535648fa7be6e3abcd7f1df");
  const metadata = await decodeImage(bytes).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["jpeg", 1_600, 900]);

  const parent = await readJson("office-building.json");
  const portal = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "open-plan-workstation");
  assert.ok(portal);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [330, 410, 270, 270]);
  const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [330, 410, 270, 270]);
});
