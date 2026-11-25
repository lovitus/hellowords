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

interface VocabularyWord {
  readonly id: string;
  readonly word: string;
  readonly translation: string;
}

interface Label extends VocabularyWord {
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
  readonly relatedWords: readonly VocabularyWord[];
  readonly visualRegions: readonly {
    readonly id: string;
    readonly kind: string;
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

test("video conferencing console keeps its 144 terms across visible equipment and related words", async () => {
  const scene = await readJson<Scene>("video-conferencing-console.json");
  assert.equal(scene.id, "video-conferencing-console");
  assert.equal(scene.parentId, "conference-room");
  assert.equal(scene.asset, "/scenes/video-conferencing-console-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 68);
  assert.equal(scene.relatedWords.length, 76);
  assert.equal(scene.visualRegions.length, scene.labels.length);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["video-conferencing-console-zone-display-front", 9],
    ["video-conferencing-console-zone-camera-speaker-bar", 9],
    ["video-conferencing-console-zone-touch-console", 8],
    ["video-conferencing-console-zone-table-microphones", 13],
    ["video-conferencing-console-zone-cable-power-hub", 11],
    ["video-conferencing-console-zone-mount-wall-hardware", 14],
    ["video-conferencing-console-zone-room-finish", 4],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    [9, 10, 17, 18, 14],
  );
  const vocabulary = [...scene.labels, ...scene.relatedWords];
  // Sort the 144 original ID/English/Chinese triples so moving a term between lists preserves its identity.
  const triples = vocabulary.map(({ id, word, translation }) => JSON.stringify([id, word, translation])).sort();
  assert.equal(
    createHash("sha256").update(triples.join("\n")).digest("hex"),
    "17cdfea99ece95a06f1d28fcb94803b417922571dd0df2f73374b4ada1ca9c82",
  );
  assert.equal(new Set(vocabulary.map(({ id }) => id)).size, 144);
  assert.equal(new Set(vocabulary.map(({ word }) => word.toLowerCase())).size, 144);
  for (const term of scene.relatedWords) assert.deepEqual(Object.keys(term).sort(), ["id", "translation", "word"]);
  assert.equal(new Set(scene.labels.map(({ x, y }) => `${x},${y}`)).size, scene.labels.length);
  assert.deepEqual(scene.portals, []);
  assert.ok(["image-reviewed", "human-verified"].includes(scene.anchorAudit.status), "scene carries an image review or human sign-off");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "191dcac69bbc53f5ec57497dc078f00d48c06104051886102b4fbf1ab0e863a5");
  assert.equal(scene.anchorAudit.previousLabelCount, 152);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
  assert.equal(scene.anchorAudit.removedLabelCount, 8 + scene.relatedWords.length);

  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  assert.equal(regions.size, scene.labels.length);
  assert.equal(new Set(scene.labels.map(({ sourceVisualRegion }) => sourceVisualRegion)).size, regions.size);
  for (const label of scene.labels) {
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `${label.id} keeps a pixel-audit region`);
    assert.ok(region.width > 0 && region.x >= 0 && region.x + region.width <= scene.width, `${region.id} width`);
    assert.ok(region.height > 0 && region.y >= 0 && region.y + region.height <= scene.height, `${region.id} height`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${label.id} x`);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${label.id} y`);
  }
  const labelsById = new Map(scene.labels.map((label) => [label.id, label]));
  const equipment = [
    ["right-microphone-pod", [1270, 801], [1194, 761, 153, 81]],
    ["near-microphone-pod", [437, 779], [366, 741, 142, 76]],
    ["left-microphone-pod", [614, 605], [577, 588, 75, 31]],
    ["far-microphone-pod", [1027, 607], [989, 591, 76, 31]],
    ["room-touch-console", [1005, 725], [884, 626, 241, 213]],
    ["video-conferencing-display", [835, 269], [535, 97, 600, 345]],
  ] as const;
  for (const [suffix, point, bounds] of equipment) {
    const label = labelsById.get(`video-conferencing-console-${suffix}`);
    assert.ok(label, suffix);
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, suffix);
    assert.equal(region.kind, "object", suffix);
    assert.deepEqual([label.x, label.y], point, suffix);
    assert.deepEqual([region.x, region.y, region.width, region.height], bounds, suffix);
  }
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
    const other = await readJson<{ labels: VocabularyWord[]; relatedWords?: VocabularyWord[] }>(`${entry.id}.json`);
    for (const term of [...other.labels, ...(other.relatedWords ?? [])]) existingWords.add(term.word.toLowerCase());
  }
  for (const { word } of vocabulary) {
    assert.equal(existingWords.has(word.toLowerCase()), false, `video console does not duplicate ${word}`);
  }

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/video-conferencing-console-v1.png"));
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "cad302ea3d5edb5932d441231ba5dd311792de17950d1df41205fe376f068f1d",
  );
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
});

test("conference room keeps one display entrance when integrating current or legacy console data", async () => {
  const parent = await readJson<{
    readonly portals: readonly { id: string; childSceneId: string; sourceVisualRegion: string; x: number; y: number; width: number; height: number }[];
    readonly visualRegions: readonly { id: string; description: string; kind: string; x: number; y: number; width: number; height: number }[];
    readonly anchorAudit: { status: string; rationale: string };
  }>("conference-room.json");
  const entrances = parent.portals.filter(({ childSceneId }) => childSceneId === "video-conferencing-console");
  assert.equal(entrances.length, 1);
  const [portal] = entrances;
  assert.equal(portal.sourceVisualRegion, "portal-video-conferencing-console-display");
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [818, 219, 238, 132]);
  const regions = parent.visualRegions.filter(({ id }) => id === portal.sourceVisualRegion);
  assert.equal(regions.length, 1);
  const [region] = regions;
  assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  const legacyId = "portal-video-conferencing-console-device-group";
  assert.ok(parent.visualRegions.every(({ id }) => id !== legacyId));
  const oldBounds = { x: 760, y: 350, width: 350, height: 250 };
  const oldPortal = { ...portal, sourceVisualRegion: legacyId, ...oldBounds };
  const oldRegion = {
    ...region,
    id: legacyId,
    description: "Complete visible speaker bar, lower display edge and tabletop meeting-device group in the conference-room photograph",
    ...oldBounds,
  };
  const legacyParent = {
    ...parent,
    portals: parent.portals.map((item) => item.id === portal.id ? oldPortal : item),
    visualRegions: parent.visualRegions.map((item) => item.id === region.id ? oldRegion : item),
    anchorAudit: { ...parent.anchorAudit, status: "human-verified", rationale: "The earlier review covered the equipment group." },
  };
  const { integrateVideoConsolePortal } = await import("../../scripts/add-video-conferencing-console-scene.mjs");
  const migrated = integrateVideoConsolePortal(legacyParent);
  assert.deepEqual({ ...migrated, anchorAudit: parent.anchorAudit }, parent);
  assert.equal(migrated.anchorAudit.status, "image-reviewed");
  assert.ok(migrated.anchorAudit.rationale.startsWith(`${legacyParent.anchorAudit.rationale} `));
  assert.ok(migrated.anchorAudit.rationale.includes("front-wall display"));
  assert.deepEqual(integrateVideoConsolePortal(migrated), migrated);
  assert.deepEqual(integrateVideoConsolePortal(parent), parent);
  const signedParent = {
    ...parent,
    anchorAudit: { ...parent.anchorAudit, status: "human-verified", rationale: "The reviewer confirmed the front-wall display entrance." },
  };
  assert.deepEqual(integrateVideoConsolePortal(signedParent), signedParent);
});
