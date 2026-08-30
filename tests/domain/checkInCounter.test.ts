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
  readonly detailZones: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly labelIds: readonly string[];
  }[];
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

test("check-in counter keeps 153 reviewed counter, baggage and kiosk terms", async () => {
  const scene = await readJson<Scene>("check-in-counter.json");
  assert.equal(scene.id, "check-in-counter");
  assert.equal(scene.parentId, "airport");
  assert.equal(scene.asset, "/scenes/check-in-counter-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 153);
  assert.equal(scene.visualRegions.length, 153);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["check-in-counter-zone-counter-row-shell", 22],
    ["check-in-counter-zone-staffed-desk-equipment", 27],
    ["check-in-counter-zone-baggage-conveyor-scale", 22],
    ["check-in-counter-zone-kiosk-bank", 28],
    ["check-in-counter-zone-overhead-info-wall", 18],
    ["check-in-counter-zone-queue-accessibility", 22],
    ["check-in-counter-zone-floor-baggage-ancillaries", 14],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    [14, 14, 43, 41, 41],
  );
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 153);
  assert.equal(new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size, 153);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "f3089bcc3e56bdb5805cfe3a7208e06a56a683d05297ecbb54efea73d5be2414");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 8);
  assert.equal(scene.anchorAudit.removedLabelCount, 8);

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a pixel-audit region`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const labelsById = new Map(scene.labels.map((label) => [label.id, label]));
  const zoneLabelIds = new Set<string>();
  for (const zone of scene.detailZones) {
    for (const labelId of zone.labelIds) {
      assert.equal(zoneLabelIds.has(labelId), false, `${labelId} is assigned twice`);
      zoneLabelIds.add(labelId);
      const label = labelsById.get(labelId);
      assert.ok(label, `${labelId} exists`);
      assert.ok(label.x >= zone.x && label.x <= zone.x + zone.width, `${labelId} zone x`);
      assert.ok(label.y >= zone.y && label.y <= zone.y + zone.height, `${labelId} zone y`);
    }
  }
  assert.equal(zoneLabelIds.size, scene.labels.length);

  const manifest = await readJson<{ readonly scenes: readonly { readonly id: string }[] }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ readonly labels: readonly { readonly word: string }[] }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const word of new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase()))) {
    assert.equal(existingWords.has(word), false, `check-in counter does not duplicate ${word}`);
  }

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/check-in-counter-v1.png"));
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "4c3c56ed197e00557c45b32a02242f853958b57293689575ddfe8a0a1f83c09d",
  );
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
});

test("airport exposes one bounded left-hand check-in-counter entrance", async () => {
  const airport = await readJson<{
    readonly portals: readonly {
      readonly childSceneId: string;
      readonly sourceVisualRegion: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }[];
    readonly visualRegions: readonly {
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }[];
  }>("airport.json");
  const portal = airport.portals.find(({ childSceneId }) => childSceneId === "check-in-counter");
  assert.ok(portal);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [0, 340, 270, 220]);
  const region = airport.visualRegions.find(({ id }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual(
    [region.x, region.y, region.width, region.height],
    [portal.x, portal.y, portal.width, portal.height],
  );
});
