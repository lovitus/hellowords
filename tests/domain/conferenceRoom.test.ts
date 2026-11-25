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
  readonly relatedWords: readonly Pick<Label, "id" | "word">[];
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

test("conference room keeps its 143 terms across photographed objects and related vocabulary", async () => {
  const scene = await readJson<Scene>("conference-room.json");
  assert.equal(scene.id, "conference-room");
  assert.equal(scene.parentId, "office-building");
  assert.equal(scene.asset, "/scenes/conference-room-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 130);
  assert.equal(scene.relatedWords.length, 13);
  assert.ok(scene.relatedWords.every((word) => !("x" in word) && !("y" in word)));
  assert.equal(scene.visualRegions.length, scene.labels.length + scene.portals.length);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["conference-room-zone-glass-entry", 20],
    ["conference-room-zone-credenza-storage", 20],
    ["conference-room-zone-table-cable-hardware", 19],
    ["conference-room-zone-chair-seating", 25],
    ["conference-room-zone-display-whiteboard", 14],
    ["conference-room-zone-ceiling-light-acoustic", 17],
    ["conference-room-zone-floor-glass-edges", 15],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    [14, 12, 34, 33, 37],
  );
  const vocabulary = [...scene.labels, ...scene.relatedWords];
  // Fingerprint of the sorted vocabulary IDs from the original 143 spatial terms.
  const ids = vocabulary.map(({ id }) => id).sort();
  assert.equal(
    createHash("sha256").update(ids.join("\n")).digest("hex"),
    "4b50cedb077092ce202a9016afe5c892d6121c02d5875ea104033029a74d9f65",
  );
  assert.equal(new Set(vocabulary.map(({ word }) => word.toLocaleLowerCase())).size, 143);
  assert.deepEqual(scene.portals.map(({ childSceneId }) => childSceneId), ["video-conferencing-console"]);
  assert.ok(["image-reviewed", "human-verified"].includes(scene.anchorAudit.status));
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "d12438f3e95d9d580d0beb21b18baa7547d921ce18f205a61b279219a82533e1");
  assert.equal(scene.anchorAudit.previousLabelCount, 151);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
  assert.equal(scene.anchorAudit.removedLabelCount, 8 + scene.relatedWords.length);

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
  for (const { word } of vocabulary) {
    assert.equal(existingWords.has(word.toLocaleLowerCase()), false, `conference room does not duplicate ${word}`);
  }

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/conference-room-v1.png"));
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "75295d1d3a58d08877dd49b1046b0cd00086899ba1fb68f5f89d3c350a1af2f6",
  );
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
});

test("office building exposes separate, bounded conference-room and break-room entrances", async () => {
  const parent = await readJson<{
    readonly portals: readonly { childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[];
    readonly visualRegions: readonly { id: string; x: number; y: number; width: number; height: number }[];
  }>("office-building.json");
  const portal = parent.portals.find(({ childSceneId }) => childSceneId === "conference-room");
  const breakRoom = parent.portals.find(({ childSceneId }) => childSceneId === "office-break-room");
  assert.ok(portal);
  assert.ok(breakRoom);
  const destinationsAt = (x: number, y: number) => parent.portals
    .filter((p) => x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height)
    .map((p) => p.childSceneId);
  assert.deepEqual(destinationsAt(772, 528), ["conference-room"], "table inside the glass meeting room");
  assert.deepEqual(destinationsAt(918, 493), [], "coffee maker beside the glass stays explorable in the atrium");
  assert.deepEqual(destinationsAt(1048, 510), ["office-break-room"], "kitchenette counter");
  const region = parent.visualRegions.find(({ id }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  const breakRoomRegion = parent.visualRegions.find(({ id }) => id === breakRoom.sourceVisualRegion);
  assert.ok(breakRoomRegion);
  assert.deepEqual([breakRoomRegion.x, breakRoomRegion.y, breakRoomRegion.width, breakRoomRegion.height], [breakRoom.x, breakRoom.y, breakRoom.width, breakRoom.height]);
});
