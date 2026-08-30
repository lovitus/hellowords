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
  readonly portals: readonly {
    readonly id: string;
    readonly label: string;
    readonly translation: string;
    readonly childSceneId: string;
    readonly sourceVisualRegion: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly enterScale: number;
  }[];
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

async function assertReviewedScene(scene: Scene, expected: {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly sha256: string;
  readonly labelCount: number;
  readonly zoneIds: readonly string[];
  readonly zoneSizes: readonly number[];
  readonly lodCounts: readonly number[];
  readonly sourceAsset: string;
  readonly sourceSha256: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}): Promise<void> {
  assert.equal(scene.id, expected.id);
  assert.equal(scene.parentId, expected.parentId);
  assert.equal(scene.asset, expected.asset);
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, expected.labelCount);
  assert.equal(scene.visualRegions.length, expected.labelCount + (scene.portals.length ? 1 : 0));
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), expected.zoneIds.map((zoneId, index) => [
    `${scene.id}-zone-${zoneId}`,
    expected.zoneSizes[index],
  ]));
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    expected.lodCounts,
  );
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, expected.labelCount);
  assert.equal(new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size, expected.labelCount);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, expected.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, expected.sha256);
  assert.equal(scene.anchorAudit.retainedLabelCount, expected.labelCount);
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
  assert.equal(zoneLabelIds.size, expected.labelCount);
  for (const label of scene.labels) assert.ok(zoneLabelIds.has(label.id), `${label.id} has a detail zone`);

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), expected.sha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );
  const sourceBytes = await readFile(resolve(projectRoot, expected.sourceAsset));
  assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), expected.sourceSha256);
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: expected.sourceWidth, height: expected.sourceHeight },
  );
}

test("airport security checkpoint keeps 103 reviewed queue, document and screening terms", async () => {
  const scene = await readJson<Scene>("security-checkpoint.json");
  await assertReviewedScene(scene, {
    id: "security-checkpoint",
    parentId: "airport",
    asset: "/scenes/airport-security-checkpoint-premium-v1.jpg",
    sha256: "8a12c6f335b1107d676112bf52033cc30d51aa352e9fbacf0bde609a3ef85e20",
    labelCount: 103,
    zoneIds: ["queue-divestiture", "document-check", "ct-screening", "secondary-inspection", "sterile-exit"],
    zoneSizes: [20, 20, 25, 18, 20],
    lodCounts: [10, 10, 26, 29, 28],
    sourceAsset: "scripts/assets/airport-security-checkpoint-v1.png",
    sourceSha256: "adaa3e827861232004337543ba3880a8c93dbcf3d474842876bcaa4abdf7f022",
    sourceWidth: 1_672,
    sourceHeight: 941,
  });
  assert.deepEqual(scene.portals, [{
    id: "enter-boarding-gate",
    label: "Enter the boarding gate",
    translation: "进入登机口",
    childSceneId: "boarding-gate",
    sourceVisualRegion: "portal-boarding-gate",
    x: 1_250,
    y: 140,
    width: 350,
    height: 380,
    enterScale: 3.4,
  }]);
});

test("boarding gate keeps 120 reviewed lounge, bridge, cabin and airside terms", async () => {
  const scene = await readJson<Scene>("boarding-gate.json");
  await assertReviewedScene(scene, {
    id: "boarding-gate",
    parentId: "security-checkpoint",
    asset: "/scenes/airport-boarding-gate-premium-v1.jpg",
    sha256: "12c9298681df0b7fa1f282fab91ba9af5f05f5a9ddcc16a3b51a5b9e9765436b",
    labelCount: 120,
    zoneIds: ["lounge", "boarding-podium", "podium-floor", "boarding-bridge", "aircraft-cabin", "airside-service"],
    zoneSizes: [25, 20, 10, 25, 25, 15],
    lodCounts: [12, 12, 33, 31, 32],
    sourceAsset: "scripts/assets/airport-boarding-gate-v1.png",
    sourceSha256: "18fc652ba8bc9a697d9afa6ca85b21f0728d0e20286484fa5902925d3f85ffc8",
    sourceWidth: 1_672,
    sourceHeight: 941,
  });
  assert.deepEqual(scene.portals, []);
});

test("airport branch exposes a truthful security-to-boarding path", async () => {
  const airport = await readJson<{
    readonly portals: readonly Record<string, unknown>[];
    readonly visualRegions: readonly { readonly id: string }[];
  }>("airport.json");
  assert.deepEqual(airport.portals.find(({ childSceneId }) => childSceneId === "security-checkpoint"), {
    id: "enter-security-checkpoint",
    label: "Enter the security checkpoint",
    translation: "进入安检区",
    childSceneId: "security-checkpoint",
    sourceVisualRegion: "security-screening",
    x: 280,
    y: 250,
    width: 500,
    height: 430,
    enterScale: 3.4,
  });
  assert.ok(airport.visualRegions.some(({ id }) => id === "security-screening"));

  const manifest = await readJson<{ readonly scenes: readonly { readonly id: string; readonly title: string; readonly parentId: string | null }[] }>("manifest.json");
  assert.deepEqual(manifest.scenes.filter(({ id }) => ["security-checkpoint", "boarding-gate"].includes(id)), [
    { id: "security-checkpoint", title: "Security checkpoint", parentId: "airport" },
    { id: "boarding-gate", title: "Boarding gate", parentId: "security-checkpoint" },
  ]);
});
