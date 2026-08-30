import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const sceneIds = ["emergency-department", "operating-theatre"] as const;
const expected = {
  "emergency-department": {
    labels: 108,
    zones: 5,
    lod: [21, 23, 27, 22, 15],
    parentId: "hospital",
    child: "operating-theatre",
    asset: "/scenes/emergency-department-premium-v1.jpg",
    assetSha256: "0d5878b4fa27bb1cff5c82d21e8e28aa4e22c8d1885160bd9f2dc3191d94ec47",
    source: "scripts/assets/emergency-department-v1.png",
    sourceSha256: "154a830df6496a766b628b87031e3a56e226b9feda147a07010dc331d1eac3a5",
  },
  "operating-theatre": {
    labels: 109,
    zones: 5,
    lod: [24, 21, 26, 21, 17],
    parentId: "emergency-department",
    child: null,
    asset: "/scenes/operating-theatre-premium-v1.jpg",
    assetSha256: "97083eb3798a19d4faf518ba03e8863530c3e60038d782a75ae2dd40516df07e",
    source: "scripts/assets/operating-theatre-v1.png",
    sourceSha256: "dc848c9957e3095e390478367ffe5ed80800e246aca34c5094ecf591900a06d9",
  },
} as const;

interface Label {
  readonly id: string;
  readonly word: string;
  readonly translation: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: number;
  readonly sourceVisualRegion: string;
}

interface Region {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Zone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly labelIds: readonly string[];
}

interface Portal {
  readonly id: string;
  readonly childSceneId: string;
  readonly sourceVisualRegion: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly enterScale: number;
}

interface Scene {
  readonly id: string;
  readonly parentId: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly Label[];
  readonly visualRegions: readonly Region[];
  readonly detailZones: readonly Zone[];
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

const decodeImage = sharpModule as unknown as (input: string | Buffer) => {
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
};

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as T;
}

function rectangleContains(rectangle: Region | Zone | Portal, x: number, y: number): boolean {
  return (
    x >= rectangle.x
    && x <= rectangle.x + rectangle.width
    && y >= rectangle.y
    && y <= rectangle.y + rectangle.height
  );
}

test("the two hospital acute scenes provide 217 distinct pixel-audited anchors", async () => {
  const scenes = new Map<string, Scene>();
  for (const id of sceneIds) scenes.set(id, await readJson<Scene>(`${id}.json`));

  const words = new Map<string, string>();
  for (const entry of scenes.values()) {
    const contract = expected[entry.id as keyof typeof expected];
    assert.equal(entry.width, 1_600);
    assert.equal(entry.height, 900);
    assert.equal(entry.parentId, contract.parentId);
    assert.equal(entry.asset, contract.asset);
    assert.equal(entry.labels.length, contract.labels);
    assert.equal(entry.visualRegions.length, entry.labels.length + (entry.portals.length ? 1 : 0));
    assert.equal(entry.detailZones.length, contract.zones);
    assert.deepEqual(
      [0, 1, 2, 3, 4].map((level) => entry.labels.filter((label) => label.minLevel === level).length),
      contract.lod,
    );
    assert.equal(entry.anchorAudit.status, "human-verified");
    assert.equal(entry.anchorAudit.policy, "visible-object-or-part-only");
    assert.equal(entry.anchorAudit.reviewedAsset, entry.asset);
    assert.equal(entry.anchorAudit.retainedLabelCount, entry.labels.length);
    assert.equal(
      entry.anchorAudit.previousLabelCount - entry.anchorAudit.retainedLabelCount,
      entry.anchorAudit.removedLabelCount,
    );
    assert.ok(entry.anchorAudit.removedExamples.length >= 3);

    const assetBytes = await readFile(resolve(projectRoot, "public", entry.asset.replace(/^\//u, "")));
    assert.equal(createHash("sha256").update(assetBytes).digest("hex"), contract.assetSha256);
    const assetMetadata = await decodeImage(assetBytes).metadata();
    assert.deepEqual(
      { format: assetMetadata.format, width: assetMetadata.width, height: assetMetadata.height },
      { format: "jpeg", width: 1_600, height: 900 },
    );
    const sourceBytes = await readFile(resolve(projectRoot, contract.source));
    assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), contract.sourceSha256);
    const sourceMetadata = await decodeImage(sourceBytes).metadata();
    assert.deepEqual(
      { format: sourceMetadata.format, width: sourceMetadata.width, height: sourceMetadata.height },
      { format: "png", width: 1_672, height: 941 },
    );

    const regionById = new Map(entry.visualRegions.map((region) => [region.id, region]));
    for (const label of entry.labels) {
      const region = regionById.get(label.sourceVisualRegion);
      assert.ok(region, `${entry.id}/${label.id} keeps its audit region`);
      assert.ok(rectangleContains(region, label.x, label.y), `${entry.id}/${label.id} stays on its region`);
      const normalized = label.word.toLocaleLowerCase();
      assert.equal(words.has(normalized), false, `new hospital scenes duplicate ${label.word}`);
      words.set(normalized, `${entry.id}/${label.id}`);
    }
    const zoneLabelIds = new Set(entry.detailZones.flatMap((zone) => zone.labelIds));
    assert.equal(zoneLabelIds.size, entry.labels.length);
    for (const label of entry.labels) assert.ok(zoneLabelIds.has(label.id), `${entry.id}/${label.id} has a zone`);

    if (contract.child) {
      assert.equal(entry.portals.length, 1);
      const portal = entry.portals[0];
      assert.equal(portal.childSceneId, contract.child);
      const portalRegion = regionById.get(portal.sourceVisualRegion);
      assert.ok(portalRegion, `${entry.id} child portal keeps a source region`);
      assert.ok(rectangleContains(portalRegion, portal.x, portal.y));
      assert.ok(rectangleContains(portalRegion, portal.x + portal.width, portal.y + portal.height));
    } else {
      assert.deepEqual(entry.portals, []);
    }
  }
  assert.equal(words.size, 217);
});

test("the acute scene chain is parented emergency department to operating theatre", async () => {
  const emergency = await readJson<Scene>("emergency-department.json");
  const theatre = await readJson<Scene>("operating-theatre.json");
  assert.deepEqual(emergency.portals.map(({ childSceneId }) => childSceneId), ["operating-theatre"]);
  assert.equal(theatre.parentId, emergency.id);
  assert.equal(theatre.portals.length, 0);
});
