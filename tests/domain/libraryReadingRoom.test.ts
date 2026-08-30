import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

interface ImagePipeline { metadata(): Promise<{ format?: string; width?: number; height?: number }>; }
const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;
const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8")) as T;
}

test("school library grounds 121 globally distinct visible terms", async () => {
  const scene = await readJson<{
    id: string;
    parentId: string;
    asset: string;
    width: number;
    height: number;
    labels: Array<{ id: string; word: string; sourceVisualRegion: string }>;
    visualRegions: Array<{ id: string }>;
    detailZones: Array<{ id: string; labelIds: string[] }>;
    portals: unknown[];
    anchorAudit: { status: string; policy: string; reviewedAssetSha256: string; previousLabelCount: number; retainedLabelCount: number; removedLabelCount: number };
  }>("library-reading-room.json");
  assert.equal(scene.id, "library-reading-room");
  assert.equal(scene.parentId, "school-campus");
  assert.deepEqual([scene.width, scene.height], [1_600, 900]);
  assert.equal(scene.labels.length, 121);
  assert.equal(scene.visualRegions.length, 121);
  assert.deepEqual(scene.detailZones.map((zone) => [zone.id, zone.labelIds.length]), [
    ["library-zone-book-stacks", 24],
    ["library-zone-circulation", 26],
    ["library-zone-reading-study", 25],
    ["library-zone-children-media", 26],
    ["library-zone-entrance-safety", 20],
  ]);
  assert.deepEqual(scene.portals, []);
  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount, 6);
  assert.equal(scene.anchorAudit.removedLabelCount, 6);

  const words = new Set(scene.labels.map((label) => label.word.toLocaleLowerCase()));
  assert.equal(words.size, scene.labels.length);
  for (const term of ["library shelving", "circulation desk", "self-checkout kiosk", "RFID checkout pad", "study laptop", "picture-book shelving", "map cabinet", "glazed library door"]) {
    assert.ok(words.has(term.toLocaleLowerCase()), `library visibly grounds ${term}`);
  }
  const zoneIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
  assert.equal(zoneIds.size, scene.labels.length);
  for (const label of scene.labels) assert.ok(zoneIds.has(label.id), `${label.id} belongs to one detail zone`);

  const manifest = await readJson<{ scenes: Array<{ id: string }> }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const other = await readJson<{ labels: Array<{ word: string }> }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  for (const word of words) assert.equal(existingWords.has(word), false, `library term duplicated: ${word}`);

  const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const bytes = await readFile(assetPath);
  const metadata = await decodeImage(bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.deepEqual([metadata.width, metadata.height], [1_600, 900]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
});

test("school campus exposes the library through its visible library room", async () => {
  const parent = await readJson<{ portals: Array<Record<string, unknown>>; visualRegions: Array<Record<string, unknown>> }>("school-campus.json");
  assert.deepEqual(parent.portals.find((portal) => portal.childSceneId === "library-reading-room"), {
    id: "enter-library-reading-room",
    label: "Enter the school library",
    translation: "进入学校图书馆",
    childSceneId: "library-reading-room",
    sourceVisualRegion: "portal-library-reading-room",
    x: 850,
    y: 20,
    width: 470,
    height: 190,
    enterScale: 3.4,
  });
  assert.deepEqual(parent.visualRegions.find(({ id }) => id === "portal-library-reading-room"), {
    id: "portal-library-reading-room",
    description: "Visible school library shelves, reading table and lounge chairs in the upper-right campus room",
    kind: "object",
    x: 850,
    y: 20,
    width: 470,
    height: 190,
  });
});
