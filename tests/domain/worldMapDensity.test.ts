import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");
const scenePath = resolve(projectRoot, "public/data/scenes/world-map.json");
const expectedAsset = "/scenes/world-map-bright-v4.jpg";
const expectedSha256 = "73536e8b31807e9e98300b8ceba03975210b881aabaf3f3e3718308fdfd82157";

interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface WorldMapLabel {
  readonly id: string;
  readonly word: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: 0 | 1 | 2 | 3 | 4;
  readonly sourceVisualRegion: string;
}

interface WorldMapPortal extends Rectangle {
  readonly id: string;
  readonly childSceneId: string;
  readonly sourceVisualRegion: string;
}

interface WorldMapRegion extends Rectangle {
  readonly id: string;
}

interface WorldMapZone extends Rectangle {
  readonly id: string;
  readonly targetScale: number;
  readonly labelIds: readonly string[];
}

interface WorldMapScene {
  readonly id: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly WorldMapLabel[];
  readonly portals: readonly WorldMapPortal[];
  readonly visualRegions: readonly WorldMapRegion[];
  readonly detailZones: readonly WorldMapZone[];
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

async function loadScene(): Promise<WorldMapScene> {
  return JSON.parse(await readFile(scenePath, "utf8")) as WorldMapScene;
}

function pointInside(point: { readonly x: number; readonly y: number }, rectangle: Rectangle): boolean {
  return point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height;
}

test("world map retains 107 independently pointable labels across every zoom band", async () => {
  const scene = await loadScene();
  assert.equal(scene.id, "world-map");
  assert.equal(scene.asset, expectedAsset);
  assert.equal(scene.width, 1600);
  assert.equal(scene.height, 900);
  assert.equal(scene.labels.length, 107);
  assert.equal(scene.visualRegions.length, 107);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => scene.labels.filter((label) => label.minLevel === level).length),
    [15, 18, 19, 27, 28],
  );
  assert.equal(new Set(scene.labels.map((label) => label.id)).size, 107);
  assert.equal(new Set(scene.labels.map((label) => label.word.toLocaleLowerCase())).size, 107);

  const visibleAdditions = [
    "mountain-ridge",
    "bridge-arch",
    "riverbank",
    "skylight",
    "terrace-railing",
    "coffee-table",
    "ceiling-light",
    "townhouse",
    "dormer-window",
    "front-door",
    "garden-fence",
    "flowering-tree",
    "outdoor-table",
    "office-building",
    "brick-building",
    "office-window",
    "cafe-umbrella",
    "bus-wheel",
    "bus-windshield",
    "station-column",
    "tree-canopy",
    "root",
    "deck-railing",
    "deck-stairs",
    "park-bench",
    "evergreen-tree",
    "greenhouse-frame",
    "glass-pane",
    "greenhouse-door",
    "planter-box",
    "seedling",
    "garden-lamp",
    "shed-roof",
    "shed-window",
  ] as const;
  const labels = new Map(scene.labels.map((label) => [label.id, label]));
  assert.equal(visibleAdditions.length, 34);
  for (const labelId of visibleAdditions) {
    assert.ok(labels.has(labelId), `missing audited world-map addition: ${labelId}`);
  }

  assert.equal(scene.anchorAudit.status, "human-verified");
  assert.equal(scene.anchorAudit.policy, "visible-object-or-part-only");
  assert.equal(scene.anchorAudit.reviewedAsset, expectedAsset);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
  assert.equal(
    scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount,
    scene.anchorAudit.removedLabelCount,
  );
});

test("world map additions remain inside audited pixels and one local exploration zone", async () => {
  const scene = await loadScene();
  const canvas = { x: 0, y: 0, width: scene.width, height: scene.height };
  const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
  assert.equal(regions.size, scene.visualRegions.length);
  for (const label of scene.labels) {
    assert.ok(pointInside(label, canvas), `label leaves canvas: ${label.id}`);
    const region = regions.get(label.sourceVisualRegion);
    assert.ok(region, `label has no audited region: ${label.id}`);
    assert.ok(pointInside(label, region), `label misses audited pixels: ${label.id}`);
  }

  const labels = new Map(scene.labels.map((label) => [label.id, label]));
  const assignedLabels = new Set<string>();
  for (const zone of scene.detailZones) {
    assert.ok(zone.targetScale > 1 && zone.targetScale <= 4, `invalid scale: ${zone.id}`);
    for (const labelId of zone.labelIds) {
      assert.ok(!assignedLabels.has(labelId), `label reused across zones: ${labelId}`);
      assignedLabels.add(labelId);
      const label = labels.get(labelId);
      assert.ok(label, `zone references unknown label: ${zone.id}/${labelId}`);
      assert.ok(pointInside(label, zone), `zone misses label: ${zone.id}/${labelId}`);
    }
  }
  assert.equal(assignedLabels.size, scene.labels.length);
});

test("world map keeps the same four portals and reviewed image bytes", async () => {
  const scene = await loadScene();
  assert.deepEqual(
    scene.portals.map(({ id, childSceneId, x, y, width, height, sourceVisualRegion }) => ({
      id,
      childSceneId,
      x,
      y,
      width,
      height,
      sourceVisualRegion,
    })),
    [
      { id: "enter-home", childSceneId: "apartment", x: 0, y: 170, width: 520, height: 690, sourceVisualRegion: "portal-home" },
      { id: "enter-city", childSceneId: "city-street", x: 550, y: 105, width: 570, height: 445, sourceVisualRegion: "portal-city" },
      { id: "enter-nature", childSceneId: "city-park", x: 1145, y: 70, width: 455, height: 700, sourceVisualRegion: "portal-nature" },
      { id: "enter-community-garden", childSceneId: "community-garden", x: 720, y: 570, width: 420, height: 320, sourceVisualRegion: "portal-community-garden" },
    ],
  );

  const bytes = await readFile(resolve(projectRoot, "public", scene.asset.replace(/^\//u, "")));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha256);
  assert.equal(scene.anchorAudit.reviewedAssetSha256, expectedSha256);
});
