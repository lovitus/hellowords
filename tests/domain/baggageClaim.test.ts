import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

interface ImagePipeline {
  metadata(): Promise<{ readonly format?: string; readonly width?: number; readonly height?: number }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;
const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as T;
}

test("baggage claim is a reviewed terminal airport scene with 95 grounded parts", async () => {
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
  }>("baggage-claim.json");
  assert.equal(scene.id, "baggage-claim");
  assert.equal(scene.parentId, "airport");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 95);
  assert.equal(scene.visualRegions.length, 95);
  assert.deepEqual(scene.detailZones.map((zone) => [zone.id, zone.labelIds.length]), [
    ["baggage-claim-zone-reclaim-carousel", 21],
    ["baggage-claim-zone-luggage-detail", 23],
    ["baggage-claim-zone-arrival-facilities", 23],
    ["baggage-claim-zone-customs-inspection", 19],
    ["baggage-claim-zone-reception-and-architecture", 9],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [19, 21, 27, 14, 14],
  );
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 6);
  assert.equal(scene.anchorAudit.removedLabelCount, 6);

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
  const words = new Set(scene.labels.map((label) => label.word.toLocaleLowerCase()));
  assert.equal(words.size, scene.labels.length);
  for (const word of words) assert.equal(existingWords.has(word), false, `new baggage term duplicated: ${word}`);
  const zoneIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneIds.has(label.id), `${label.id} has a detail zone`);
});

test("airport exposes baggage claim through one reviewed arrival-side portal", async () => {
  const airport = await readJson<{
    portals: Array<Record<string, unknown>>;
    visualRegions: Array<Record<string, unknown>>;
  }>("airport.json");
  assert.deepEqual(airport.portals.find((portal) => portal.childSceneId === "baggage-claim"), {
    id: "enter-baggage-claim",
    label: "Enter baggage claim",
    translation: "进入行李提取区",
    childSceneId: "baggage-claim",
    sourceVisualRegion: "baggage-claim",
    x: 1_010,
    y: 470,
    width: 430,
    height: 360,
    enterScale: 3.4,
  });
});
