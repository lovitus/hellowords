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

test("aircraft lavatory keeps 138 reviewed entrance, vanity, toilet and wall terms", async () => {
  const scene = await readJson<Scene>("aircraft-lavatory.json");
  assert.equal(scene.id, "aircraft-lavatory");
  assert.equal(scene.parentId, "aircraft-cabin");
  assert.equal(scene.asset, "/scenes/aircraft-lavatory-premium-v1.jpg");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 138);
  assert.equal(scene.visualRegions.length, 138);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => [id, labelIds.length]), [
    ["aircraft-lavatory-zone-cabin-connection-entry", 22],
    ["aircraft-lavatory-zone-upper-back-service", 25],
    ["aircraft-lavatory-zone-vanity-left", 25],
    ["aircraft-lavatory-zone-toilet-center", 26],
    ["aircraft-lavatory-zone-right-door-wall", 25],
    ["aircraft-lavatory-zone-lower-floor", 15],
  ]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter(({ minLevel }) => minLevel === level).length),
    [12, 12, 38, 37, 39],
  );
  assert.equal(new Set(scene.labels.map(({ id }) => id)).size, 138);
  assert.equal(new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size, 138);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, scene.asset);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, "656375726949d55919bcef32f468b24d9cf454bcfc731882871b4ba6c7de4f60");
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
  assert.equal(zoneLabelIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneLabelIds.has(label.id), `${label.id} has a detail zone`);

  const existingWords = new Set<string>();
  const manifest = await readJson<{ readonly scenes: readonly { readonly id: string }[] }>("manifest.json");
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ readonly labels: readonly { readonly word: string }[] }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const word of new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase()))) {
    assert.equal(existingWords.has(word), false, `aircraft-lavatory does not duplicate ${word}`);
  }

  const assetPath = resolve(projectRoot, "public", scene.asset.slice(1));
  const assetBytes = await readFile(assetPath);
  assert.equal(createHash("sha256").update(assetBytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  const metadata = await decodeImage(assetBytes).metadata();
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "jpeg", width: 1_600, height: 900 },
  );

  const sourceBytes = await readFile(resolve(projectRoot, "scripts/assets/aircraft-lavatory-v1.png"));
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "d0f3894c0536aca629280a92d812b76009d3ab211a41841fedcd9f29c6a50017",
  );
  const sourceMetadata = await decodeImage(sourceBytes).metadata();
  assert.deepEqual(
    { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
    { format: "png", width: 1_672, height: 941 },
  );
});

test("aircraft cabin exposes the open lavatory as the child portal", async () => {
  const parent = await readJson<{
    readonly portals: readonly Record<string, unknown>[];
    readonly visualRegions: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  }>("aircraft-cabin.json");
  assert.deepEqual(parent.portals.find(({ childSceneId }) => childSceneId === "aircraft-lavatory"), {
    id: "enter-aircraft-lavatory",
    label: "Enter the aircraft lavatory",
    translation: "进入飞机卫生间",
    childSceneId: "aircraft-lavatory",
    sourceVisualRegion: "portal-aircraft-lavatory",
    x: 1_110,
    y: 170,
    width: 390,
    height: 560,
    enterScale: 3.6,
  });
  assert.deepEqual(parent.visualRegions.find(({ id }) => id === "portal-aircraft-lavatory"), {
    id: "portal-aircraft-lavatory",
    description: "Complete open lavatory compartment with visible sink and toilet on the aircraft-cabin photograph",
    kind: "object",
    x: 1_110,
    y: 170,
    width: 390,
    height: 560,
  });
});

