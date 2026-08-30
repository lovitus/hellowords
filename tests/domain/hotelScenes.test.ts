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

function slug(value: string): string {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

test("hotel exterior and lobby/rooms scenes keep reviewed, non-duplicated vocabulary", async () => {
  const [exterior, rooms] = await Promise.all([
    readJson<{
      id: string;
      parentId: string;
      asset: string;
      width: number;
      height: number;
      labels: Array<{ word: string; minLevel: number; sourceVisualRegion: string }>;
      visualRegions: Array<{ id: string }>;
      detailZones: Array<{ id: string; labelIds: string[] }>;
      portals: Array<Record<string, unknown>>;
      anchorAudit: { status: string; policy: string; reviewedAssetSha256: string; retainedLabelCount: number };
    }>("hotel-exterior.json"),
    readJson<{
      id: string;
      parentId: string;
      asset: string;
      width: number;
      height: number;
      labels: Array<{ word: string; minLevel: number; sourceVisualRegion: string }>;
      visualRegions: Array<{ id: string }>;
      detailZones: Array<{ id: string; labelIds: string[] }>;
      portals: unknown[];
      anchorAudit: { status: string; policy: string; reviewedAssetSha256: string; retainedLabelCount: number };
    }>("hotel-lobby-rooms.json"),
  ]);
  assert.equal(exterior.id, "hotel-exterior");
  assert.equal(exterior.parentId, "city-street");
  assert.equal(exterior.labels.length, 69);
  assert.equal(exterior.detailZones.length, 6);
  assert.equal(exterior.visualRegions.length, 70);
  assert.equal(exterior.portals.length, 1);
  assert.equal(rooms.id, "hotel-lobby-rooms");
  assert.equal(rooms.parentId, "hotel-exterior");
  assert.equal(rooms.labels.length, 107);
  assert.equal(rooms.detailZones.length, 5);
  assert.equal(rooms.visualRegions.length, 107);
  assert.deepEqual(rooms.portals, []);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => exterior.labels.filter((label) => label.minLevel === level).length),
    [12, 12, 16, 12, 17],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => rooms.labels.filter((label) => label.minLevel === level).length),
    [10, 10, 28, 29, 30],
  );
  for (const scene of [exterior, rooms]) {
    assert.equal(scene.anchorAudit.status, "human-verified");
    assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
    assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
    const regionIds = new Set(scene.visualRegions.map((region) => region.id));
    assert.equal(regionIds.size, scene.visualRegions.length);
    const zoneIds = new Set(scene.detailZones.flatMap((zone) => zone.labelIds));
    assert.equal(zoneIds.size, scene.labels.length);
    for (const label of scene.labels) {
      assert.ok(regionIds.has(label.sourceVisualRegion), `${scene.id}/${label.word} region`);
      assert.ok(zoneIds.has(`${scene.id}-${slug(label.word)}`), `${scene.id}/${label.word} zone`);
    }
    const file = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
    const bytes = await readFile(file);
    const metadata = await decodeImage(bytes).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.deepEqual([metadata.width, metadata.height], [1_600, 900]);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), scene.anchorAudit.reviewedAssetSha256);
  }

  const manifest = await readJson<{ scenes: Array<{ id: string }> }>("manifest.json");
  const existingWords = new Set<string>();
  for (const entry of manifest.scenes) {
    if (entry.id === exterior.id || entry.id === rooms.id) continue;
    const other = await readJson<{ labels: Array<{ word: string }> }>(`${entry.id}.json`);
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  const hotelWords = new Set([...exterior.labels, ...rooms.labels].map((label) => label.word.toLocaleLowerCase()));
  assert.equal(hotelWords.size, exterior.labels.length + rooms.labels.length);
  for (const word of hotelWords) assert.equal(existingWords.has(word), false, `hotel term duplicated: ${word}`);
});

test("city street splits the mixed-use brick facade into cafe and hotel portals", async () => {
  const city = await readJson<{
    portals: Array<{
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
    }>;
    visualRegions: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  }>("city-street.json");
  const cafe = city.portals.find((portal) => portal.childSceneId === "city-cafe");
  const hotel = city.portals.find((portal) => portal.childSceneId === "hotel-exterior");
  assert.deepEqual(cafe, {
    id: "enter-city-cafe",
    label: "Enter the city cafe",
    translation: "进入城市咖啡馆",
    childSceneId: "city-cafe",
    x: 740,
    y: 340,
    width: 250,
    height: 300,
    enterScale: 3.6,
    sourceVisualRegion: "portal-cafe",
  });
  assert.deepEqual(hotel, {
    id: "enter-hotel-exterior",
    label: "Enter the hotel exterior",
    translation: "进入酒店外立面",
    childSceneId: "hotel-exterior",
    sourceVisualRegion: "portal-hotel-exterior",
    x: 650,
    y: 155,
    width: 300,
    height: 180,
    enterScale: 3.4,
  });
  assert.ok(cafe && hotel);
  assert.ok(cafe.y + cafe.height + 5 <= hotel.y || hotel.y + hotel.height + 5 <= cafe.y);
  assert.ok(city.visualRegions.some(({ id }) => id === "portal-hotel-exterior"));
});
