import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

interface ImagePipeline {
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;
const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as T;
}

test("warehouse-loading-dock grounds 121 visible warehouse and dock terms", async () => {
  const scene = await readJson<{
    id: string;
    parentId: string;
    asset: string;
    width: number;
    height: number;
    labels: Array<{ id: string; word: string; minLevel: number; sourceVisualRegion: string }>;
    visualRegions: Array<{ id: string }>;
    detailZones: Array<{ id: string; labelIds: string[] }>;
    portals: unknown[];
    anchorAudit: {
      status: string;
      policy: string;
      reviewedAssetSha256: string;
      previousLabelCount: number;
      retainedLabelCount: number;
      removedLabelCount: number;
    };
  }>("warehouse-loading-dock.json");
  assert.equal(scene.id, "warehouse-loading-dock");
  assert.equal(scene.parentId, "service-core");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 121);
  assert.equal(scene.visualRegions.length, 121);
  assert.deepEqual(scene.detailZones.map((zone) => [zone.id, zone.labelIds.length]), [
    ["warehouse-zone-forklift", 26],
    ["warehouse-zone-rack-storage", 25],
    ["warehouse-zone-material-handling", 18],
    ["warehouse-zone-packing-station", 26],
    ["warehouse-zone-loading-dock", 26],
  ]);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 7);
  assert.equal(scene.anchorAudit.removedLabelCount, 7);

  const words = new Set(scene.labels.map((label) => label.word.toLocaleLowerCase()));
  assert.equal(words.size, scene.labels.length);
  for (const term of [
    "warehouse forklift mast",
    "rack upright",
    "manual pallet jack",
    "electric pallet truck",
    "packing bench",
    "packing roller conveyor",
    "dock leveler",
    "convex safety mirror",
    "eyewash station",
  ]) assert.ok(words.has(term), `warehouse visibly grounds ${term}`);

  const zoneIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneIds.has(label.id), `${label.id} belongs to one detail zone`);

  const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const bytes = await readFile(assetPath);
  const metadata = await decodeImage(bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.deepEqual([metadata.width, metadata.height], [1_600, 900]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);

  const manifest = await readJson<{ scenes: Array<{ id: string }> }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ labels: Array<{ word: string }> }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  const novelCount = [...words].filter((word) => !existingWords.has(word)).length;
  assert.ok(novelCount >= 95, `warehouse adds at least 95 distinct grounded terms, got ${novelCount}`);
});

test("service-core exposes the warehouse portal on its visible loading door", async () => {
  const parent = await readJson<{
    portals: Array<Record<string, unknown>>;
    visualRegions: Array<Record<string, unknown>>;
  }>("service-core.json");
  assert.deepEqual(parent.portals.find((portal) => portal.childSceneId === "warehouse-loading-dock"), {
    id: "enter-warehouse-loading-dock",
    label: "Enter the warehouse loading dock",
    translation: "进入仓库装卸区",
    childSceneId: "warehouse-loading-dock",
    sourceVisualRegion: "portal-warehouse-loading-dock",
    x: 1385,
    y: 405,
    width: 215,
    height: 300,
    enterScale: 3.4,
  });
  assert.deepEqual(parent.visualRegions.find(({ id }) => id === "portal-warehouse-loading-dock"), {
    id: "portal-warehouse-loading-dock",
    description: "Visible freight door, dock plate and pallet-handling area on the office service-core photograph",
    kind: "object",
    x: 1385,
    y: 405,
    width: 215,
    height: 300,
  });
});
