import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

interface ImagePipeline {
  metadata(): Promise<{
    readonly format?: string;
    readonly width?: number;
    readonly height?: number;
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;
const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as T;
}

test("service-core is a reviewed facilities branch with 90 grounded parts", async () => {
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
  }>("service-core.json");
  assert.equal(scene.id, "service-core");
  assert.equal(scene.parentId, "office-building");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 90);
  assert.equal(scene.visualRegions.length, 91);
  assert.deepEqual(scene.detailZones.map((zone) => [zone.id, zone.labelIds.length]), [
    ["service-core-zone-electrical-distribution", 20],
    ["service-core-zone-hvac-mechanical", 22],
    ["service-core-zone-fire-riser", 18],
    ["service-core-zone-janitorial-service", 14],
    ["service-core-zone-loading-service", 16],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [10, 10, 23, 22, 25],
  );
  assert.deepEqual(
    scene.portals.map((portal) => (portal as { childSceneId: string }).childSceneId),
    ["warehouse-loading-dock"],
  );
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
  for (const word of words) assert.equal(existingWords.has(word), false, `new service term duplicated: ${word}`);
  const zoneIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneIds.has(label.id), `${label.id} has a detail zone`);
});

test("office-building exposes the service-core portal on its reviewed right-hand core", async () => {
  const office = await readJson<{
    portals: Array<Record<string, unknown>>;
    visualRegions: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  }>("office-building.json");
  assert.deepEqual(office.portals.find((portal) => portal.childSceneId === "service-core"), {
    id: "enter-service-core",
    label: "Enter the service core",
    translation: "进入设备核心",
    childSceneId: "service-core",
    sourceVisualRegion: "portal-service-core",
    x: 1320,
    y: 200,
    width: 280,
    height: 350,
    enterScale: 3.4,
  });
  assert.deepEqual(office.visualRegions.find(({ id }) => id === "portal-service-core"), {
    id: "portal-service-core",
    description: "Bright visible elevator, stairwell and building-service core on the office atrium photograph",
    kind: "object",
    x: 1320,
    y: 200,
    width: 280,
    height: 350,
  });
});
