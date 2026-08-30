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

const contracts = [
  {
    id: "aircraft-galley-equipment",
    parentId: "aircraft-cabin",
    asset: "/scenes/aircraft-galley-equipment-premium-v1.jpg",
    sha256: "ad4302dc7a0b87d7ae7bc6f596aec9a1c264ca29774d8c5ea0f024c91c3c0bbe",
    labels: 147,
    zoneSizes: [21, 32, 30, 22, 20, 22],
  },
  {
    id: "hemodialysis-unit",
    parentId: "hospital",
    asset: "/scenes/hemodialysis-unit-premium-v1.jpg",
    sha256: "fd89f968c45ae3139c699fd4a333c5eb7b5c10bdd053df35c56a9a6b8af964dc",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
] as const;

for (const contract of contracts) {
  test(`${contract.id} keeps its reviewed visible-object vocabulary and reproducible asset`, async () => {
    const scene = await readJson(`${contract.id}.json`);
    assert.equal(scene.id, contract.id);
    assert.equal(scene.parentId, contract.parentId);
    assert.equal(scene.asset, contract.asset);
    assert.deepEqual([scene.width, scene.height], [1_600, 900]);
    assert.equal(scene.labels.length, contract.labels);
    assert.equal(scene.visualRegions.length, contract.labels);
    assert.deepEqual(scene.detailZones.map(({ labelIds }: { labelIds: string[] }) => labelIds.length), contract.zoneSizes);
    assert.equal(new Set(scene.labels.map(({ id }: { id: string }) => id)).size, contract.labels);
    assert.equal(new Set(scene.labels.map(({ word }: { word: string }) => word.toLocaleLowerCase())).size, contract.labels);
    assert.equal(scene.anchorAudit.status, "human-verified");
    assert.equal(scene.anchorAudit.reviewedAssetSha256, contract.sha256);

    const bytes = await readFile(resolve(projectRoot, `public${contract.asset}`));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), contract.sha256);
    const metadata = await decodeImage(bytes).metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height], ["jpeg", 1_600, 900]);
  });
}

test("aircraft cabin exposes a disjoint, visible forward-galley entrance", async () => {
  const parent = await readJson("aircraft-cabin.json");
  const galley = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "aircraft-galley-equipment");
  const lavatory = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "aircraft-lavatory");
  assert.ok(galley);
  assert.ok(lavatory);
  assert.deepEqual([galley.x, galley.y, galley.width, galley.height], [320, 60, 380, 780]);
  assert.ok(galley.x + galley.width <= lavatory.x, "galley and lavatory entrance crops must not overlap");
  const region = parent.visualRegions.find(({ id }: { id: string }) => id === galley.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [320, 60, 380, 780]);
});
