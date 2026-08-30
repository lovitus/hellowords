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

test("school-campus is a reviewed branch scene with new practical vocabulary", async () => {
  const scene = await readJson<{
    id: string;
    parentId: string;
    asset: string;
    width: number;
    height: number;
    labels: Array<{
      id: string;
      word: string;
      x: number;
      y: number;
      minLevel: number;
      sourceVisualRegion: string;
    }>;
    visualRegions: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
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
  }>("school-campus.json");
  assert.equal(scene.id, "school-campus");
  assert.equal(scene.parentId, "world-map");
  assert.equal(scene.width, 1_600);
  assert.equal(scene.height, 900);
  assert.equal(scene.labels.length, 73);
  assert.equal(scene.visualRegions.length, scene.labels.length + 5);
  assert.equal(scene.detailZones.length, 10);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [10, 10, 19, 18, 16],
  );
  assert.deepEqual(
    scene.portals.map((portal) => (portal as { childSceneId: string }).childSceneId),
    ["primary-classroom", "library-reading-room", "school-art-studio", "school-music-room", "school-gymnasium-equipment"],
  );
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 6);
  assert.equal(scene.anchorAudit.removedLabelCount, 6);

  const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const bytes = await readFile(assetPath);
  const metadata = await decodeImage(bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1_600);
  assert.equal(metadata.height, 900);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    scene.anchorAudit.reviewedAssetSha256,
  );

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps its pixel-audited region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const sceneWords = new Set(scene.labels.map((label) => label.word.toLocaleLowerCase()));
  assert.equal(sceneWords.size, scene.labels.length);

  const existingWords = new Set<string>();
  const manifest = await readJson<{ scenes: Array<{ id: string }> }>("manifest.json");
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ labels: Array<{ word: string }> }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const word of sceneWords) {
    assert.equal(existingWords.has(word), false, `school batch does not duplicate ${word}`);
  }

  const zoneLabelIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneLabelIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneLabelIds.has(label.id), `${label.id} has a detail zone`);
});

test("the world atlas exposes the school campus through one reviewed portal", async () => {
  const root = await readJson<{
    portals: Array<{
      id: string;
      childSceneId: string;
      sourceVisualRegion: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    visualRegions: Array<{ id: string }>;
  }>("world-map.json");
  const portal = root.portals.find(({ childSceneId }) => childSceneId === "school-campus");
  assert.deepEqual(portal, {
    id: "enter-school-campus",
    label: "Explore the school campus",
    translation: "探索校园",
    childSceneId: "school-campus",
    sourceVisualRegion: "portal-enter-school-campus",
    x: 600,
    y: 300,
    width: 200,
    height: 100,
    enterScale: 3.75,
  });
  assert.ok(root.visualRegions.some(({ id }) => id === "portal-enter-school-campus"));
});
