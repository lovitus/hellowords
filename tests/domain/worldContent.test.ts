import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildVocabularyRevealSummary,
  buildVocabularyZoomCues,
  computeSceneLabelLayout,
  type Scene,
} from "../../app/domain";

interface Manifest {
  rootSceneId: string;
  scenes: Array<{ id: string; title: string; parentId: string | null }>;
}

interface VisualRegion {
  id: string;
  description: string;
  kind: "whole" | "object" | "part" | "diagram";
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AuditedScene extends Scene {
  anchorAudit: {
    status: "human-verified";
    policy: "visible-object-or-part-only";
    reviewedAsset: string;
    reviewedAssetSha256?: string;
    rationale: string;
    previousLabelCount: number;
    retainedLabelCount: number;
    removedLabelCount: number;
    removedExamples: string[];
  };
  visualRegions: VisualRegion[];
  labels: Array<Scene["labels"][number] & { sourceVisualRegion: string }>;
  portals: Array<Scene["portals"][number] & { sourceVisualRegion: string }>;
}

const projectRoot = resolve(import.meta.dirname, "../..");

function readJpegDimensions(bytes: Buffer): { width: number; height: number } {
  const frameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (frameMarkers.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  throw new Error("JPEG has no readable dimensions");
}

async function loadWorld(): Promise<{ manifest: Manifest; scenes: AuditedScene[] }> {
  const dataRoot = resolve(projectRoot, "public/data/scenes");
  const manifest = JSON.parse(await readFile(resolve(dataRoot, "manifest.json"), "utf8")) as Manifest;
  const scenes = await Promise.all(
    manifest.scenes.map(async ({ id }) =>
      JSON.parse(await readFile(resolve(dataRoot, `${id}.json`), "utf8")) as AuditedScene,
    ),
  );
  return { manifest, scenes };
}

test("mature world has three subject branches and six deep, fully reachable paths", async () => {
  const { manifest, scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const root = byId.get(manifest.rootSceneId);
  assert.ok(root);
  assert.equal(root.parentId, null);
  assert.deepEqual(
    root.portals.map((portal) => portal.childSceneId),
    ["apartment", "city-street", "city-park"],
  );

  const reachable = new Set<string>();
  const visit = (id: string) => {
    assert.ok(!reachable.has(id), `cycle or duplicate path at ${id}`);
    reachable.add(id);
    for (const portal of byId.get(id)?.portals ?? []) visit(portal.childSceneId);
  };
  visit(root.id);
  assert.equal(reachable.size, scenes.length);
  assert.equal(scenes.length, 30);

  const expectedPaths = [
    ["world-map", "apartment", "kitchen", "coffee-machine", "water-tank", "polymer"],
    ["world-map", "apartment", "bedroom", "wardrobe-interior", "cotton-shirt"],
    ["world-map", "city-street", "transit-hub", "electric-bus", "battery", "lithium-ion-cell"],
    ["world-map", "city-street", "transit-hub", "railway-platform", "train-carriage", "rail-bogie"],
    ["world-map", "city-street", "science-museum", "human-body", "heart", "blood-cell", "hemoglobin", "oxygen-molecule"],
    ["world-map", "city-park", "oak-tree", "leaf", "plant-cell", "chloroplast-interior"],
  ];
  for (const path of expectedPaths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      assert.ok(
        byId.get(path[index])?.portals.some((portal) => portal.childSceneId === path[index + 1]),
        `missing portal ${path[index]} -> ${path[index + 1]}`,
      );
    }
  }
});

test("every spatial label and portal is traceable to a human-verified visual region", async () => {
  const { scenes } = await loadWorld();
  let retainedTotal = 0;
  let removedTotal = 0;
  for (const scene of scenes) {
    assert.equal(scene.width, 1600, `${scene.id} width`);
    assert.equal(scene.height, 900, `${scene.id} height`);
    assert.equal(scene.anchorAudit.status, "human-verified", `${scene.id} audit status`);
    assert.equal(
      scene.anchorAudit.policy,
      "visible-object-or-part-only",
      `${scene.id} visual-only policy`,
    );
    assert.equal(scene.anchorAudit.reviewedAsset, scene.asset, `${scene.id} reviewed asset`);
    assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length, `${scene.id} retained count`);
    assert.equal(
      scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount,
      scene.anchorAudit.removedLabelCount,
      `${scene.id} audit reconciliation`,
    );
    assert.ok(scene.anchorAudit.rationale.length >= 40, `${scene.id} rationale`);
    assert.ok(scene.anchorAudit.removedExamples.length >= 3, `${scene.id} removed examples`);

    retainedTotal += scene.labels.length;
    removedTotal += scene.anchorAudit.removedLabelCount;
    assert.deepEqual(
      [...new Set(scene.labels.map((label) => label.minLevel))].sort(),
      [0, 1, 2, 3, 4],
      `${scene.id} density bands`,
    );
    assert.equal(
      new Set(scene.labels.map((label) => label.word.toLocaleLowerCase())).size,
      scene.labels.length,
      `${scene.id} unique display terms`,
    );
    const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
    assert.equal(regions.size, scene.visualRegions.length, `${scene.id} unique visual regions`);
    for (const label of scene.labels) {
      assert.ok(label.translation.trim(), `${scene.id}/${label.id} translation`);
      const region = regions.get(label.sourceVisualRegion);
      assert.ok(region, `${scene.id}/${label.id} source region`);
      assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${scene.id}/${label.id} x`);
      assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${scene.id}/${label.id} y`);
    }
    for (const portal of scene.portals) {
      const region = regions.get(portal.sourceVisualRegion);
      assert.ok(region, `${scene.id}/${portal.id} source region`);
      assert.ok(portal.x >= region.x && portal.y >= region.y, `${scene.id}/${portal.id} origin`);
      assert.ok(
        portal.x + portal.width <= region.x + region.width &&
          portal.y + portal.height <= region.y + region.height,
        `${scene.id}/${portal.id} rectangle`,
      );
    }
  }
  assert.ok(removedTotal > retainedTotal, "quality audit removes more unsupported labels than it retains");
});

test("known floating-label regressions stay removed and critical portals match visible objects", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));

  const forbidden: Record<string, string[]> = {
    "city-park": [
      "sprinkler",
      "barbecue",
      "rabbit",
      "skateboarding",
      "drinking fountain",
      "bird feeder",
      "walking trail",
      "fallen leaves",
    ],
    kitchen: ["boiling", "frying", "recipe", "ingredient"],
    bedroom: ["sleep", "dream", "cozy", "alarm clock"],
    polymer: ["thermoplastic", "polymerization", "molecular weight"],
    "oxygen-molecule": ["combustion", "oxidation", "hypoxia"],
    frog: ["jump", "hibernate", "food chain"],
  };
  for (const [sceneId, terms] of Object.entries(forbidden)) {
    const words = new Set(byId.get(sceneId)?.labels.map((label) => label.word.toLocaleLowerCase()));
    for (const term of terms) assert.ok(!words.has(term), `${sceneId} cross-topic filler: ${term}`);
  }

  const cityPark = byId.get("city-park");
  assert.ok(cityPark);
  assert.deepEqual(
    cityPark.portals.map(({ id, x, y, width, height }) => [id, x, y, width, height]),
    [
      ["enter-oak-tree", 650, 0, 900, 710],
      ["enter-pond-edge", 0, 560, 500, 340],
    ],
  );

  const cityStreet = byId.get("city-street");
  assert.ok(cityStreet);
  assert.equal(cityStreet.asset, "/scenes/city-street-museum-v2.jpg");
  const streetWords = new Set(cityStreet.labels.map((label) => label.word));
  for (const visibleMuseumTerm of ["science museum", "atom symbol", "telescope", "skeleton"]) {
    assert.ok(streetWords.has(visibleMuseumTerm), `city street shows ${visibleMuseumTerm}`);
  }
  assert.deepEqual(
    cityStreet.portals.find((portal) => portal.id === "enter-science-museum"),
    {
      id: "enter-science-museum",
      label: "Enter the science museum",
      translation: "进入科学馆",
      childSceneId: "science-museum",
      x: 0,
      y: 0,
      width: 285,
      height: 660,
      enterScale: 3.6,
      sourceVisualRegion: "portal-museum",
    },
  );

  assert.equal(
    byId.get("heart")?.labels.find((label) => label.word === "chamber")?.translation,
    "心腔",
  );
});

test("vocabulary zoom cues use real non-portal object anchors in every scene", async () => {
  const { scenes } = await loadWorld();
  let cueCount = 0;
  for (const scene of scenes) {
    const cues = buildVocabularyZoomCues(
      scene.labels,
      scene.portals,
      scene.width,
      scene.height,
    );
    assert.ok(cues.length <= 4, `${scene.id} cue budget`);
    assert.ok(cues.length >= 1, `${scene.id} has a reveal-only vocabulary cue`);
    cueCount += cues.length;
    for (const cue of cues) {
      const anchor = scene.labels.find((label) => label.id === cue.anchorLabelId);
      assert.ok(anchor, `${scene.id}/${cue.id} anchor label`);
      assert.equal(cue.x, anchor.x, `${scene.id}/${cue.id} authored anchor x`);
      assert.equal(cue.y, anchor.y, `${scene.id}/${cue.id} authored anchor y`);
      assert.ok(cue.labelIds.includes(anchor.id), `${scene.id}/${cue.id} anchor membership`);
      assert.ok(
        scene.portals.every((portal) => !(
          cue.x >= portal.x
          && cue.x <= portal.x + portal.width
          && cue.y >= portal.y
          && cue.y <= portal.y + portal.height
        )),
        `${scene.id}/${cue.id} must not compete with an entry portal`,
      );
    }
  }
  assert.ok(cueCount >= scenes.length * 2, "the world exposes useful reveal-only zoom guidance");
});

test("every scene with future vocabulary exposes a truthful scene-wide zoom summary", async () => {
  const { scenes } = await loadWorld();
  let futureVocabularySceneCount = 0;

  for (const scene of scenes) {
    const summary = buildVocabularyRevealSummary(scene.labels, 1, 4);
    if (summary.hiddenLabels.length === 0) continue;
    futureVocabularySceneCount += 1;

    const hiddenIds = summary.hiddenLabels.map((label) => label.id);
    const nextIds = summary.nextLabels.map((label) => label.id);
    assert.equal(
      new Set(hiddenIds).size,
      hiddenIds.length,
      `${scene.id} summary count is deduplicated by stable label id`,
    );
    assert.ok(nextIds.length > 0, `${scene.id} summary names a real next reveal batch`);
    assert.ok(
      nextIds.every((id) => hiddenIds.includes(id)),
      `${scene.id} next reveal batch is a subset of its hidden count`,
    );
    assert.ok(summary.nextLod !== null, `${scene.id} summary exposes the next LOD`);
    assert.ok(
      summary.nextLabels.every((label) => label.minLevel === summary.nextLod),
      `${scene.id} next batch belongs to exactly one honest LOD`,
    );
    assert.notEqual(summary.targetScale, null, `${scene.id} summary exposes a target scale`);
    assert.ok(
      summary.targetScale! > 1 && summary.targetScale! <= 4,
      `${scene.id} summary points to a reachable higher scale`,
    );

    const regionalIds = new Set(buildVocabularyZoomCues(
      scene.labels,
      scene.portals,
      scene.width,
      scene.height,
    ).flatMap((cue) => cue.labelIds));
    const hiddenOutsideRegionalBudget = hiddenIds.filter((id) => !regionalIds.has(id));
    if (hiddenOutsideRegionalBudget.length > 0) {
      assert.ok(
        summary.hiddenLabels.some((label) => hiddenOutsideRegionalBudget.includes(label.id)),
        `${scene.id} global guidance covers words omitted by the regional cue budget`,
      );
    }
  }

  assert.ok(
    futureVocabularySceneCount >= Math.floor(scenes.length * 0.9),
    "nearly every authored scene should reward continued zooming",
  );
});

test("premium exploration scenes stay visually dense across every zoom band", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const minimums: Readonly<Record<string, number>> = {
    kitchen: 36,
    "science-museum": 28,
    "oak-tree": 32,
    leaf: 28,
    "plant-cell": 28,
    "chloroplast-interior": 24,
  };
  for (const [sceneId, minimum] of Object.entries(minimums)) {
    const scene = byId.get(sceneId);
    assert.ok(scene, `${sceneId} exists`);
    if (sceneId === "science-museum") {
      assert.equal(scene.asset, "/scenes/science-museum-bright-v3.jpg", `${sceneId} uses reviewed bright art`);
    } else {
      assert.match(scene.asset, /-premium-v2\.jpg$/, `${sceneId} uses reviewed premium art`);
    }
    assert.ok(scene.labels.length >= minimum, `${sceneId} carries useful vocabulary density`);
    const lodCounts = [0, 1, 2, 3, 4].map((level) => (
      scene.labels.filter((label) => label.minLevel === level).length
    ));
    assert.ok(lodCounts[0] + lodCounts[1] >= 12, `${sceneId} has a rich overview`);
    assert.ok(lodCounts.every((count) => count >= 3), `${sceneId} rewards every zoom band`);
    const desktopWidth = 1_280;
    const desktopHeight = 632;
    const desktopFit = Math.min(desktopWidth / scene.width, desktopHeight / scene.height);
    const desktopLayout = computeSceneLabelLayout(
      scene.labels,
      {
        fit: desktopFit,
        scale: 1,
        x: (desktopWidth - scene.width * desktopFit) / 2,
        y: (desktopHeight - scene.height * desktopFit) / 2,
      },
      { width: desktopWidth, height: desktopHeight, compact: false },
      false,
    );
    assert.ok(
      desktopLayout.filter((label) => label.interactive).length >= 12,
      `${sceneId} actually exposes at least twelve non-colliding overview labels`,
    );
    const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//, ""));
    const bytes = await readFile(assetPath);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      scene.anchorAudit.reviewedAssetSha256,
      `${sceneId} audit is tied to the exact reviewed pixels`,
    );
  }
});

test("every scene uses a real, accessible external visual asset", async () => {
  const { scenes } = await loadWorld();
  assert.equal(new Set(scenes.map((scene) => scene.asset)).size, scenes.length, "each semantic slice has its own visual");
  for (const scene of scenes) {
    const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//, ""));
    const bytes = await readFile(assetPath);
    assert.ok(bytes.byteLength > 1_000, `${scene.id} asset is unexpectedly empty`);
    if (scene.asset.endsWith(".svg")) {
      const source = bytes.toString("utf8");
      assert.match(source, /<title[ >]/, `${scene.id} accessible title`);
      assert.match(source, /<desc[ >]/, `${scene.id} accessible description`);
      assert.ok(source.includes('viewBox="0 0 1600 900"'), `${scene.id} coordinate system`);
    } else {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${scene.id} JPEG signature`);
      assert.deepEqual(readJpegDimensions(bytes), { width: 1600, height: 900 }, `${scene.id} raster dimensions`);
    }
  }
});
