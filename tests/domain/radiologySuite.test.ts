import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";
import type { Portal } from "../../app/domain/types";

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
  readonly relatedWords: readonly Pick<RadiologyLabel, "id" | "word" | "translation">[];
  readonly visualRegions: readonly RadiologyRegion[];
  readonly detailZones: readonly RadiologyZone[];
  readonly portals: readonly Portal[];
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

test("radiology suite keeps its practical terms and enters the ultrasound exam room through the cart front", async () => {
  const scene = await readJson<RadiologyScene>("radiology-suite.json");
  assert.equal(scene.id, "radiology-suite");
  assert.equal(scene.parentId, "hospital");
  assert.equal(scene.asset, "/scenes/radiology-suite-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 74);
  assert.equal(scene.relatedWords.length, 13);
  const vocabulary = [...scene.labels, ...scene.relatedWords];
  assert.equal(new Set(vocabulary.map(({ id }) => id)).size, 87);
  assert.equal(new Set(vocabulary.map(({ word }) => word.toLowerCase())).size, 87);
  assert.ok(scene.relatedWords.every((word) => !("x" in word) && !("y" in word)));
  assert.equal(scene.visualRegions.length, scene.labels.length + scene.portals.length);
  assert.equal(scene.detailZones.length, 6);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [9, 13, 19, 18, 15],
  );
  // Pixel bounds on the four dark slots in the cart front, below the controls.
  const panel = { x: 657, y: 710, width: 38, height: 52 };
  assert.deepEqual(scene.portals, [{
    id: "enter-ultrasound-exam-room",
    label: "Enter the ultrasound exam room",
    translation: "进入超声检查室",
    childSceneId: "ultrasound-exam-room",
    sourceVisualRegion: "portal-ultrasound-exam-room",
    ...panel,
    portraitMarker: { x: 676, y: 736, scaleToObject: true },
    enterScale: 3.4,
  }]);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.previousLabelCount, 93);
  assert.equal(scene.anchorAudit.removedLabelCount, 6 + scene.relatedWords.length);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);

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
  const panelRegion = regions.get("portal-ultrasound-exam-room");
  assert.ok(panelRegion);
  assert.deepEqual(
    [panelRegion.x, panelRegion.y, panelRegion.width, panelRegion.height],
    [panel.x, panel.y, panel.width, panel.height],
  );
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a visual audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  for (const word of ["ultrasound machine", "ultrasound monitor", "ultrasound cart wheel", "exam couch cushion"]) {
    const label = scene.labels.find((entry) => entry.word === word);
    assert.ok(label);
    assert.ok(
      label.x < panel.x || label.x > panel.x + panel.width
        || label.y < panel.y || label.y > panel.y + panel.height,
      `${word} stays outside the entry panel`,
    );
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
  for (const { word } of vocabulary) {
    assert.equal(existingWords.has(word.toLocaleLowerCase()), false, `radiology batch duplicates ${word}`);
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
    ["emergency-department", "pathology-lab", "radiology-suite", "hospital-pharmacy", "hospital-reception"],
  );
  assert.deepEqual(
    hospital.portals.find(({ childSceneId }) => childSceneId === "radiology-suite"),
    {
      id: "enter-radiology-suite",
      label: "Enter the radiology suite",
      translation: "进入放射影像科",
      childSceneId: "radiology-suite",
      sourceVisualRegion: "portal-radiology-scanner-bore",
      x: 881,
      y: 417,
      width: 78,
      height: 83,
      portraitMarker: { x: 954, y: 429 },
      enterScale: 3.4,
    },
  );
});
