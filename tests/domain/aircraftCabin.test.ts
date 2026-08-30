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
  readonly detailZones: readonly { readonly id: string; readonly labelIds: readonly string[] }[];
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

test("aircraft cabin keeps 142 reviewed door, galley, seating and lavatory terms", async () => {
  const scene = await readJson<Scene>("aircraft-cabin.json");
  assert.equal(scene.id, "aircraft-cabin");
  assert.equal(scene.parentId, "boarding-gate");
  assert.equal(scene.asset, "/scenes/aircraft-cabin-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 142);
  assert.equal(scene.visualRegions.length, 144);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["aircraft-cabin-zone-entry-door-hardware", 22],
    ["aircraft-cabin-zone-forward-galley", 26],
    ["aircraft-cabin-zone-overhead-psu", 20],
    ["aircraft-cabin-zone-cabin-seating", 26],
    ["aircraft-cabin-zone-aisle-floor", 14],
    ["aircraft-cabin-zone-lavatory", 23],
    ["aircraft-cabin-zone-right-door-jamb", 11],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    [14, 14, 38, 38, 38],
  );
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 142);
  assert.equal(new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size, 142);
  assert.deepEqual(scene.portals.map(({ childSceneId }) => childSceneId), [
    "aircraft-lavatory",
    "aircraft-galley-equipment",
  ]);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "43bc4ae1927274df211288acce769e17f16975ddfea8e0c57d8ce5349f697dbc");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 8);
  assert.equal(scene.anchorAudit.removedLabelCount, 8);

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a pixel-audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const zoneLabelIds = new Set(scene.detailZones.flatMap(({ labelIds }) => labelIds));
  assert.equal(zoneLabelIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneLabelIds.has(label.id), `${label.id} has a detail zone`);

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(
    createHash("sha256").update(assetBytes).digest("hex"),
    scene.anchorAudit.reviewedAssetSha256,
  );
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/aircraft-cabin-v1.png"));
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "7571800b6caeae7a6d2b8f0198c8aae76d7291cd334e45cbedbb4d5597e5d926",
  );
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
});

test("boarding gate exposes the open aircraft doorway as the cabin portal", async () => {
  const boardingGate = await readJson<{
    readonly portals: readonly Record<string, unknown>[];
    readonly visualRegions: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  }>("boarding-gate.json");
  assert.deepEqual(boardingGate.portals.find(({ childSceneId }) => childSceneId === "aircraft-cabin"), {
    id: "enter-aircraft-cabin",
    label: "Enter the aircraft cabin",
    translation: "进入飞机客舱",
    childSceneId: "aircraft-cabin",
    sourceVisualRegion: "portal-aircraft-cabin",
    x: 1_300,
    y: 150,
    width: 230,
    height: 420,
    enterScale: 3.6,
  });
  assert.deepEqual(boardingGate.visualRegions.find(({ id }) => id === "portal-aircraft-cabin"), {
    id: "portal-aircraft-cabin",
    description: "Open aircraft doorway with a clear view into the passenger cabin on the boarding-gate photograph",
    kind: "object",
    x: 1_300,
    y: 150,
    width: 230,
    height: 420,
  });
});
