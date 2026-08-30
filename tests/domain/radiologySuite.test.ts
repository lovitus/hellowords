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

interface RadiologyLabel {
  readonly id: string;
  readonly word: string;
  readonly translation: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: number;
  readonly sourceVisualRegion: string;
}

interface RadiologyRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface RadiologyZone {
  readonly id: string;
  readonly labelIds: readonly string[];
}

interface RadiologyScene {
  readonly id: string;
  readonly title: string;
  readonly translation: string;
  readonly subtitle: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly parentId: string;
  readonly labels: readonly RadiologyLabel[];
  readonly visualRegions: readonly RadiologyRegion[];
  readonly detailZones: readonly RadiologyZone[];
  readonly portals: readonly unknown[];
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

test("radiology suite is an audited terminal scene with distinct practical terms", async () => {
  const scene = await readJson<RadiologyScene>("radiology-suite.json");
  assert.equal(scene.id, "radiology-suite");
  assert.equal(scene.parentId, "hospital");
  assert.equal(scene.asset, "/scenes/radiology-suite-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 87);
  assert.equal(scene.visualRegions.length, scene.labels.length);
  assert.equal(scene.detailZones.length, 6);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [17, 18, 22, 19, 11],
  );
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 6);
  assert.equal(scene.anchorAudit.retainedLabelCount, 87);

  const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const assetBytes = await readFile(assetPath);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );
  assert.equal(
    createHash("sha256").update(assetBytes).digest("hex"),
    scene.anchorAudit.reviewedAssetSha256,
  );

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a visual audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const zoneLabelIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneLabelIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneLabelIds.has(label.id), `${label.id} has a detail zone`);

  const manifest = await readJson<{ scenes: readonly { id: string }[] }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ labels: readonly { word: string }[] }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const label of scene.labels) {
    assert.equal(existingWords.has(label.word.toLocaleLowerCase()), false, `radiology batch duplicates ${label.word}`);
  }
});

test("hospital exposes the radiology suite through the CT/MRI atrium crop", async () => {
  const hospital = await readJson<{
    portals: readonly {
      id: string;
      label: string;
      translation: string;
      childSceneId: string;
      sourceVisualRegion: string;
      x: number;
      y: number;
      width: number;
      height: number;
      enterScale: number;
    }[];
  }>("hospital.json");
  assert.deepEqual(
    hospital.portals.map(({ childSceneId }) => childSceneId),
    ["emergency-department", "pathology-lab", "radiology-suite", "hospital-pharmacy"],
  );
  assert.deepEqual(
    hospital.portals.find(({ childSceneId }) => childSceneId === "radiology-suite"),
    {
      id: "enter-radiology-suite",
      label: "Enter the radiology suite",
      translation: "进入放射影像科",
      childSceneId: "radiology-suite",
      sourceVisualRegion: "radiology-suite",
      x: 700,
      y: 280,
      width: 310,
      height: 300,
      enterScale: 3.4,
    },
  );
});
