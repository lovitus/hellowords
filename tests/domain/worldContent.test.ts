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

test("mature world has four subject branches and six deep, fully reachable paths", async () => {
  const { manifest, scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const root = byId.get(manifest.rootSceneId);
  assert.ok(root);
  assert.equal(root.parentId, null);
  assert.deepEqual(
    root.portals.map((portal) => portal.childSceneId),
    ["apartment", "city-street", "city-park", "community-garden"],
  );

  const reachable = new Set<string>();
  const visit = (id: string) => {
    assert.ok(!reachable.has(id), `cycle or duplicate path at ${id}`);
    reachable.add(id);
    for (const portal of byId.get(id)?.portals ?? []) visit(portal.childSceneId);
  };
  visit(root.id);
  assert.equal(reachable.size, scenes.length);
  assert.ok(scenes.length >= 37, "the new authored scene batch expands the world");
  assert.deepEqual(
    byId.get("community-garden")?.portals.map(({ childSceneId }) => childSceneId),
    ["greenhouse-interior", "potting-workbench"],
    "the garden overview exposes two real illustrated subregions",
  );

  const expectedPaths = [
    ["world-map", "apartment", "kitchen", "coffee-machine", "water-tank", "polymer"],
    ["world-map", "apartment", "bedroom", "wardrobe-interior", "cotton-shirt"],
    ["world-map", "city-street", "transit-hub", "electric-bus", "battery", "lithium-ion-cell"],
    ["world-map", "city-street", "transit-hub", "railway-platform", "train-carriage", "rail-bogie"],
    ["world-map", "city-street", "science-museum", "human-body", "heart", "blood-cell", "hemoglobin", "oxygen-molecule"],
    ["world-map", "city-park", "oak-tree", "leaf", "plant-cell", "chloroplast-interior"],
    ["world-map", "community-garden", "greenhouse-interior", "tomato-plant"],
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
  for (const scene of scenes) {
    const expectedCanvas = scene.id === "world-map"
      ? { width: 2604, height: 989 }
      : { width: 1600, height: 900 };
    assert.deepEqual(
      { width: scene.width, height: scene.height },
      expectedCanvas,
      `${scene.id} logical canvas`,
    );
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
    assert.ok(
      scene.anchorAudit.removedLabelCount >= scene.anchorAudit.removedExamples.length,
      `${scene.id} examples are a truthful subset of its rejected candidates`,
    );

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
    "railway-platform": ["bicycle", "drainage channel", "station sign"],
    battery: ["negative terminal", "temperature sensor", "current sensor", "pressure-relief valve"],
    "city-cafe": ["barista", "brand", "menu text", "aroma", "music", "queue"],
    "dinosaur-hall": ["living dinosaur", "roaring", "predator", "Cretaceous period", "extinction", "paleontologist", "excavation"],
    hemoglobin: ["affinity", "cooperativity", "saturation", "allostery", "anemia", "mutation"],
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
  assert.equal(cityPark.labels.length, 63, "city park keeps its expanded final-pixel vocabulary");
  const cityParkWords = new Set(cityPark.labels.map((label) => label.word));
  for (const term of ["pond water", "bridge deck", "oak leaf", "fountain spray", "gazebo railing", "daisy center"]) {
    assert.ok(cityParkWords.has(term), `city park shows ${term}`);
  }
  assert.deepEqual(
    cityPark.portals.map(({ id, x, y, width, height }) => [id, x, y, width, height]),
    [
      ["enter-oak-tree", 800, 0, 800, 760],
      ["enter-pond-edge", 0, 550, 700, 350],
    ],
  );

  const cityStreet = byId.get("city-street");
  assert.ok(cityStreet);
  assert.equal(cityStreet.asset, "/scenes/city-street-bright-v4.jpg");
  const streetWords = new Set(cityStreet.labels.map((label) => label.word));
  for (const visibleMuseumTerm of ["science museum", "museum entrance", "exhibit window", "telescope"]) {
    assert.ok(streetWords.has(visibleMuseumTerm), `city street shows ${visibleMuseumTerm}`);
  }
  for (const rejectedMuseumTerm of ["atom symbol", "skeleton"]) {
    assert.ok(!streetWords.has(rejectedMuseumTerm), `bright city street rejects ${rejectedMuseumTerm}`);
  }
  assert.deepEqual(
    cityStreet.portals.find((portal) => portal.id === "enter-science-museum"),
    {
      id: "enter-science-museum",
      label: "Enter the science museum",
      translation: "进入科学馆",
      childSceneId: "science-museum",
      x: 0,
      y: 70,
      width: 605,
      height: 560,
      enterScale: 3.6,
      sourceVisualRegion: "portal-museum",
    },
  );

  assert.deepEqual(
    byId.get("railway-platform")?.portals.map(({ id, childSceneId, sourceVisualRegion }) => (
      [id, childSceneId, sourceVisualRegion]
    )),
    [["enter-train-carriage", "train-carriage", "portal-train-carriage"]],
  );
  assert.deepEqual(
    byId.get("battery")?.portals.map(({ id, childSceneId, sourceVisualRegion }) => (
      [id, childSceneId, sourceVisualRegion]
    )),
    [["enter-lithium-cell", "lithium-ion-cell", "portal-cell-module"]],
  );

  const heartTranslations = new Map(
    byId.get("heart")?.labels.map((label) => [label.word, label.translation]),
  );
  assert.deepEqual(
    ["right atrium", "left atrium", "right ventricle", "left ventricle"]
      .map((word) => [word, heartTranslations.get(word)]),
    [
      ["right atrium", "右心房"],
      ["left atrium", "左心房"],
      ["right ventricle", "右心室"],
      ["left ventricle", "左心室"],
    ],
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

test("premium exploration scenes expose dense, truthful local detail slices", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const premiumSceneIds = [
    "world-map",
    "apartment",
    "kitchen",
    "coffee-machine",
    "water-tank",
    "polymer",
    "bedroom",
    "bathroom",
    "wardrobe-interior",
    "cotton-shirt",
    "city-street",
    "city-cafe",
    "transit-hub",
    "electric-bus",
    "railway-platform",
    "train-carriage",
    "rail-bogie",
    "battery",
    "lithium-ion-cell",
    "science-museum",
    "dinosaur-hall",
    "human-body",
    "heart",
    "blood-cell",
    "community-garden",
    "greenhouse-interior",
    "tomato-plant",
    "potting-workbench",
    "city-park",
    "pond-edge",
    "frog",
    "oak-tree",
    "leaf",
    "plant-cell",
    "oxygen-molecule",
    "hemoglobin",
    "chloroplast-interior",
  ] as const;
  const minimums: Readonly<Record<string, number>> = {
    ...Object.fromEntries(premiumSceneIds.map((sceneId) => [sceneId, 32])),
    polymer: 24,
    bathroom: 36,
    "city-cafe": 36,
    "dinosaur-hall": 36,
    "human-body": 32,
    "heart": 32,
    "blood-cell": 28,
    "community-garden": 40,
    "lithium-ion-cell": 28,
    frog: 28,
    "oxygen-molecule": 26,
    hemoglobin: 22,
    "chloroplast-interior": 32,
  };
  for (const [sceneId, minimum] of Object.entries(minimums)) {
    const scene = byId.get(sceneId);
    assert.ok(scene, `${sceneId} exists`);
    assert.match(scene.asset, /\.jpg$/, `${sceneId} uses reviewed premium raster art`);
    assert.ok(scene.labels.length >= minimum, `${sceneId} carries useful vocabulary density`);
    const lodCounts = [0, 1, 2, 3, 4].map((level) => (
      scene.labels.filter((label) => label.minLevel === level).length
    ));
    assert.ok(lodCounts[0] + lodCounts[1] >= 12, `${sceneId} has a rich overview`);
    assert.ok(lodCounts.every((count) => count >= 3), `${sceneId} rewards every zoom band`);
    const detailZones = scene.detailZones ?? [];
    assert.ok(detailZones.length >= 4, `${sceneId} has at least four authored detail zones`);
    const labelById = new Map(scene.labels.map((label) => [label.id, label]));
    const assignedLabelIds = new Set<string>();
    for (const zone of detailZones) {
      assert.ok(zone.title.trim(), `${sceneId}/${zone.id} title`);
      assert.ok(zone.translation.trim(), `${sceneId}/${zone.id} translation`);
      assert.ok(zone.description.length >= 24, `${sceneId}/${zone.id} description`);
      assert.ok(zone.targetScale > 1 && zone.targetScale <= 4, `${sceneId}/${zone.id} target scale`);
      assert.ok(zone.labelIds.length >= 4, `${sceneId}/${zone.id} useful word batch`);
      for (const labelId of zone.labelIds) {
        const label = labelById.get(labelId);
        assert.ok(label, `${sceneId}/${zone.id}/${labelId} exists`);
        assert.ok(!assignedLabelIds.has(labelId), `${sceneId}/${labelId} belongs to one detail zone`);
        assignedLabelIds.add(labelId);
        assert.ok(label.x >= zone.x && label.x <= zone.x + zone.width, `${sceneId}/${zone.id}/${labelId} x`);
        assert.ok(label.y >= zone.y && label.y <= zone.y + zone.height, `${sceneId}/${zone.id}/${labelId} y`);
      }
    }
    assert.ok(
      assignedLabelIds.size / scene.labels.length >= 0.6,
      `${sceneId} assigns most anchors to an authored local exploration`,
    );
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

test("kitchen preserves its expanded appliance and island vocabulary", async () => {
  const { scenes } = await loadWorld();
  const kitchen = scenes.find((scene) => scene.id === "kitchen");
  assert.ok(kitchen);
  assert.equal(kitchen.labels.length, 116);
  const words = new Set(kitchen.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of ["sink divider", "cabinet hinge", "burner", "oven door", "coffee screen", "steam wand", "island edge"]) {
    assert.ok(words.has(required), `kitchen visibly grounds ${required}`);
  }
});

test("premium coffee machine grounds its cutaway and keeps one real water-tank portal", async () => {
  const { scenes } = await loadWorld();
  const coffeeMachine = scenes.find((scene) => scene.id === "coffee-machine");
  assert.ok(coffeeMachine);
  assert.equal(coffeeMachine.asset, "/scenes/coffee-machine-premium-v1.jpg");
  assert.equal(coffeeMachine.parentId, "kitchen");
  assert.equal(coffeeMachine.labels.length, 40);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      coffeeMachine.labels.filter((label) => label.minLevel === level).length
    )),
    [12, 10, 8, 6, 4],
  );
  assert.equal(coffeeMachine.detailZones?.length, 7);
  assert.deepEqual(coffeeMachine.portals, [
    {
      id: "enter-water-tank",
      label: "Inspect the open water tank",
      translation: "查看透明水箱",
      childSceneId: "water-tank",
      x: 50,
      y: 15,
      width: 300,
      height: 680,
      enterScale: 3.3,
      sourceVisualRegion: "portal-water-tank",
    },
  ]);

  const words = new Set(coffeeMachine.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "water tank",
    "reservoir lid",
    "waterline",
    "outlet valve",
    "bean hopper",
    "burr grinder",
    "pressure gauge",
    "group head",
    "portafilter",
    "filter basket",
    "steam wand",
    "drip tray",
    "boiler",
    "water pump",
    "electric motor",
    "circuit board",
    "wire harness",
    "power cord",
  ]) {
    assert.ok(words.has(required), `coffee machine visibly grounds ${required}`);
  }
  for (const unsupported of ["thermostat", "heating coil", "automatic mode", "espresso aroma"]) {
    assert.ok(!words.has(unsupported), `coffee machine omits inferred ${unsupported}`);
  }
});

test("premium water tank grounds its service details and keeps one real polymer portal", async () => {
  const { scenes } = await loadWorld();
  const waterTank = scenes.find((scene) => scene.id === "water-tank");
  assert.ok(waterTank);
  assert.equal(waterTank.asset, "/scenes/water-tank-premium-v1.jpg");
  assert.equal(waterTank.parentId, "coffee-machine");
  assert.equal(waterTank.labels.length, 36);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      waterTank.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 8, 7, 6, 5],
  );
  assert.equal(waterTank.detailZones?.length, 5);
  assert.deepEqual(waterTank.portals, [
    {
      id: "enter-polymer",
      label: "Inspect the clear plastic wall",
      translation: "查看透明塑料壁",
      childSceneId: "polymer",
      x: 1080,
      y: 190,
      width: 320,
      height: 620,
      enterScale: 3.25,
      sourceVisualRegion: "portal-polymer-wall",
    },
  ]);

  const words = new Set(waterTank.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "clear plastic wall",
    "lid gasket",
    "hinge pin",
    "pouring lip",
    "waterline",
    "meniscus",
    "condensation beads",
    "air bubble",
    "reinforcing rib",
    "wall thickness",
    "outlet valve",
    "filter screen",
    "valve spring",
    "rubber o-ring",
    "mounting slot",
    "locating tab",
  ]) {
    assert.ok(words.has(required), `water tank visibly grounds ${required}`);
  }
  for (const unsupported of [
    "float switch",
    "overflow",
    "pressure sensor",
    "hydrostatic pressure",
    "refill",
    "watertight",
  ]) {
    assert.ok(!words.has(unsupported), `water tank omits inferred ${unsupported}`);
  }
});

test("premium pond edge grounds its freshwater life and keeps one real frog portal", async () => {
  const { scenes } = await loadWorld();
  const pondEdge = scenes.find((scene) => scene.id === "pond-edge");
  assert.ok(pondEdge);
  assert.equal(pondEdge.asset, "/scenes/pond-edge-premium-v1.jpg");
  assert.equal(pondEdge.parentId, "city-park");
  assert.equal(pondEdge.labels.length, 40);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      pondEdge.labels.filter((label) => label.minLevel === level).length
    )),
    [12, 10, 8, 6, 4],
  );
  assert.equal(pondEdge.detailZones?.length, 6);
  assert.deepEqual(pondEdge.portals, [
    {
      id: "enter-frog",
      label: "Meet the frog on the shore",
      translation: "观察岸边青蛙",
      childSceneId: "frog",
      x: 1175,
      y: 350,
      width: 350,
      height: 260,
      enterScale: 3.3,
      sourceVisualRegion: "portal-frog",
    },
  ]);

  const words = new Set(pondEdge.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "cattail",
    "water lily",
    "lily bud",
    "duckweed",
    "dragonfly",
    "damselfly",
    "water strider",
    "pond snail",
    "minnow",
    "tadpole",
    "frog eye",
    "tree root",
    "mud bank",
    "air bubble",
  ]) {
    assert.ok(words.has(required), `pond edge visibly grounds ${required}`);
  }
  for (const unsupported of ["heron", "kingfisher", "turtle", "fish jumping", "swimming", "hunting"]) {
    assert.ok(!words.has(unsupported), `pond edge omits inferred ${unsupported}`);
  }
});

test("premium lithium-ion cell stays within its pixel-evidence ceiling", async () => {
  const { scenes } = await loadWorld();
  const cell = scenes.find((scene) => scene.id === "lithium-ion-cell");
  assert.ok(cell);
  assert.equal(cell.parentId, "battery");
  assert.equal(cell.asset, "/scenes/lithium-ion-cell-premium-v2.jpg");
  assert.ok(cell.labels.length >= 28 && cell.labels.length <= 31);
  assert.equal(cell.detailZones?.length, 4);
  assert.deepEqual(cell.portals, [], "lithium-ion cell remains a terminal study");

  const words = new Set(cell.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "positive terminal",
    "negative terminal",
    "jelly roll",
    "positive tab bundle",
    "negative tab bundle",
    "separator sheet",
    "electrode sheet",
    "aluminum foil",
    "copper foil",
    "safety vent",
    "electrolyte fill port",
  ]) {
    assert.ok(words.has(visible), `lithium-ion cell visibly grounds ${visible}`);
  }
  for (const inferred of [
    "ion migration",
    "electron flow",
    "electrolyte droplet",
    "capacity",
    "cycle life",
    "overcharge",
    "flammable",
  ]) {
    assert.ok(!words.has(inferred), `lithium-ion cell omits inferred ${inferred}`);
  }
});

test("premium rail bogie grounds powered running gear without maintenance claims", async () => {
  const { scenes } = await loadWorld();
  const bogie = scenes.find((scene) => scene.id === "rail-bogie");
  assert.ok(bogie);
  assert.equal(bogie.parentId, "train-carriage");
  assert.equal(bogie.asset, "/scenes/rail-bogie-premium-v2.jpg");
  assert.equal(bogie.labels.length, 40);
  assert.equal(bogie.detailZones?.length, 5);
  assert.deepEqual(bogie.portals, [], "rail bogie remains a terminal engineering study");

  const words = new Set(bogie.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "bogie frame",
    "wheelset",
    "wheel",
    "axle",
    "axlebox",
    "primary suspension spring",
    "air spring",
    "traction motor",
    "gearbox",
    "brake disc",
    "brake caliper",
    "vertical damper",
    "rail clip",
  ]) {
    assert.ok(words.has(visible), `rail bogie visibly grounds ${visible}`);
  }
  for (const inferred of [
    "lubricant",
    "alignment",
    "vibration",
    "accelerate",
    "inspect",
    "misaligned",
    "load bearing",
    "derailment",
  ]) {
    assert.ok(!words.has(inferred), `rail bogie omits inferred ${inferred}`);
  }
});

test("premium frog is a grounded terminal external-anatomy study", async () => {
  const { scenes } = await loadWorld();
  const frog = scenes.find((scene) => scene.id === "frog");
  assert.ok(frog);
  assert.equal(frog.asset, "/scenes/frog-premium-v1.jpg");
  assert.equal(frog.parentId, "pond-edge");
  assert.deepEqual(frog.portals, [], "frog remains a terminal scene");
  assert.equal(frog.labels.length, 34);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      frog.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 8, 7, 5, 4],
  );
  assert.equal(frog.detailZones?.length, 4);

  const words = new Set(frog.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "snout",
    "nostril",
    "iris",
    "pupil",
    "tympanum",
    "throat",
    "dorsolateral fold",
    "skin bump",
    "side stripe",
    "foreleg",
    "forefoot",
    "finger pad",
    "hind leg",
    "thigh",
    "knee",
    "shank",
    "ankle",
    "toe pad",
    "webbing",
  ]) {
    assert.ok(words.has(required), `frog visibly grounds ${required}`);
  }
  for (const unsupported of [
    "tongue",
    "heart",
    "blood vessel",
    "egg mass",
    "polliwog",
    "jump",
    "hibernate",
    "cricket",
  ]) {
    assert.ok(!words.has(unsupported), `frog omits unpictured ${unsupported}`);
  }
});

test("premium polymer stays within its evidence ceiling and remains a terminal material study", async () => {
  const { scenes } = await loadWorld();
  const polymer = scenes.find((scene) => scene.id === "polymer");
  assert.ok(polymer);
  assert.equal(polymer.asset, "/scenes/polymer-premium-v2.jpg");
  assert.equal(polymer.parentId, "water-tank");
  assert.deepEqual(polymer.portals, [], "polymer remains a terminal scene");
  assert.equal(polymer.labels.length, 37, "polymer keeps its reviewed 37-anchor evidence ceiling");

  const words = new Set(polymer.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "polymer specimen",
    "polymer chain",
    "cross-link",
    "polymer film",
    "plastic pellet",
    "fiber bundle",
    "fiber",
    "lamella",
    "pore",
    "crack",
  ]) {
    assert.ok(words.has(required), `polymer visibly grounds ${required}`);
  }
  for (const unsupported of [
    "monomer",
    "polymerization",
    "molecular weight",
    "elasticity",
    "density",
    "recycling",
    "repeating unit",
    "side group",
  ]) {
    assert.ok(!words.has(unsupported), `polymer omits inferred ${unsupported}`);
  }
});

test("premium wardrobe keeps one grounded shirt portal without padded material claims", async () => {
  const { scenes } = await loadWorld();
  const wardrobe = scenes.find((scene) => scene.id === "wardrobe-interior");
  assert.ok(wardrobe);
  assert.equal(wardrobe.asset, "/scenes/wardrobe-interior-premium-v2.jpg");
  assert.deepEqual(
    wardrobe.portals.map(({ childSceneId }) => childSceneId),
    ["cotton-shirt"],
  );
  assert.equal(wardrobe.portals[0]?.sourceVisualRegion, "portal-shirt");
  const displayWords = new Set(wardrobe.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const unsupported of ["garment", "closet", "buttonhole", "seam", "cotton", "denim"]) {
    assert.ok(!displayWords.has(unsupported), `wardrobe omits unsupported ${unsupported}`);
  }
});

test("premium cotton shirt connects garment construction to visible woven material", async () => {
  const { scenes } = await loadWorld();
  const shirt = scenes.find((scene) => scene.id === "cotton-shirt");
  assert.ok(shirt);
  assert.equal(shirt.parentId, "wardrobe-interior");
  assert.equal(shirt.asset, "/scenes/cotton-shirt-premium-v2.jpg");
  assert.equal(shirt.labels.length, 40);
  assert.equal(shirt.detailZones?.length, 5);
  assert.deepEqual(shirt.portals, [], "cotton shirt remains a terminal textile study");

  const words = new Set(shirt.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "cotton shirt",
    "collar",
    "collar stand",
    "collar point",
    "shoulder seam",
    "armhole seam",
    "sleeve placket",
    "cuff",
    "front placket",
    "chest pocket",
    "shirttail hem",
    "plain weave",
    "warp yarn",
    "weft yarn",
    "cotton boll",
    "thread spool",
    "needle",
    "thimble",
    "pin cushion",
    "dressmaking shears",
  ]) {
    assert.ok(words.has(visible), `cotton shirt visibly grounds ${visible}`);
  }
  for (const inferred of [
    "loom",
    "sewing machine",
    "dye",
    "harvest",
    "iron",
    "breathable",
    "shrinkage",
    "absorbency",
  ]) {
    assert.ok(!words.has(inferred), `cotton shirt omits inferred ${inferred}`);
  }
});

test("premium oxygen scene is terminal and excludes invisible quantum or process labels", async () => {
  const { scenes } = await loadWorld();
  const oxygen = scenes.find((scene) => scene.id === "oxygen-molecule");
  assert.ok(oxygen);
  assert.equal(oxygen.asset, "/scenes/oxygen-molecule-premium-v2.jpg");
  assert.deepEqual(oxygen.portals, []);
  assert.equal(oxygen.labels.length, 26);
  const displayWords = new Set(oxygen.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const unsupported of [
    "electron pair",
    "molecular orbital",
    "type II pneumocyte",
    "smooth muscle",
    "oxidation",
    "inhale",
  ]) {
    assert.ok(!displayWords.has(unsupported), `oxygen omits unsupported ${unsupported}`);
  }
});

test("premium hemoglobin preserves one grounded oxygen portal at its 22-word ceiling", async () => {
  const { scenes } = await loadWorld();
  const hemoglobin = scenes.find((scene) => scene.id === "hemoglobin");
  assert.ok(hemoglobin);
  assert.equal(hemoglobin.asset, "/scenes/hemoglobin-premium-v2.jpg");
  assert.equal(hemoglobin.labels.length, 22);
  assert.deepEqual(
    hemoglobin.portals.map(({ childSceneId, sourceVisualRegion }) => (
      [childSceneId, sourceVisualRegion]
    )),
    [["oxygen-molecule", "portal-bound-oxygen"]],
  );
  const displayWords = new Set(hemoglobin.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "tetramer",
    "alpha subunit",
    "beta subunit",
    "heme group",
    "porphyrin ring",
    "iron ion",
    "oxygen molecule",
    "proximal histidine",
    "distal histidine",
    "axial coordination bond",
  ]) {
    assert.ok(displayWords.has(required), `hemoglobin visibly grounds ${required}`);
  }
  for (const unsupported of [
    "affinity",
    "cooperativity",
    "saturation",
    "allostery",
    "anemia",
    "mutation",
  ]) {
    assert.ok(!displayWords.has(unsupported), `hemoglobin omits inferred ${unsupported}`);
  }
});

test("bathroom adds a dense terminal apartment room without overlapping sibling portals", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const bathroom = byId.get("bathroom");
  assert.ok(bathroom);
  assert.equal(bathroom.parentId, "apartment");
  assert.equal(bathroom.asset, "/scenes/bathroom-premium-v1.jpg");
  assert.ok(bathroom.labels.length >= 36 && bathroom.labels.length <= 81);
  assert.ok((bathroom.detailZones?.length ?? 0) >= 5);
  assert.deepEqual(bathroom.portals, [], "bathroom remains a terminal room");

  const apartment = byId.get("apartment");
  assert.ok(apartment);
  const bathroomPortal = apartment.portals.find(({ childSceneId }) => childSceneId === "bathroom");
  assert.deepEqual(bathroomPortal, {
    id: "enter-bathroom",
    label: "Enter the bathroom",
    translation: "进入浴室",
    childSceneId: "bathroom",
    x: 918,
    y: 510,
    width: 682,
    height: 390,
    enterScale: 3.6,
    sourceVisualRegion: "portal-bathroom",
  });
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
  assert.ok(bathroomPortal);
  for (const portal of apartment.portals.filter(({ childSceneId }) => childSceneId !== "bathroom")) {
    assert.ok(!overlaps(bathroomPortal, portal), `bathroom portal does not overlap ${portal.id}`);
  }

  const words = new Set(bathroom.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "bathtub",
    "bath spout",
    "vanity",
    "sink",
    "mirror",
    "toilet",
    "rainfall showerhead",
    "hand shower",
    "shower niche",
    "P-trap",
    "linear drain",
    "folded towels",
  ]) {
    assert.ok(words.has(required.toLocaleLowerCase()), `bathroom visibly grounds ${required}`);
  }
  for (const unsupported of ["humidity", "cleanliness", "hot water"]) {
    assert.ok(!words.has(unsupported), `bathroom omits inferred ${unsupported}`);
  }
  const bathroomLabels = new Map(bathroom.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["flush-button", "shelf", "towel-rail"].map((id) => {
      const label = bathroomLabels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[1002, 475], [1550, 355], [1495, 575]],
    "small bathroom parts stay anchored on their visible pixels",
  );
});

test("dinosaur hall is a grounded terminal branch with a separate museum portal", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const dinosaurHall = byId.get("dinosaur-hall");
  assert.ok(dinosaurHall);
  assert.equal(dinosaurHall.parentId, "science-museum");
  assert.equal(dinosaurHall.asset, "/scenes/dinosaur-hall-premium-v1.jpg");
  assert.ok(dinosaurHall.labels.length >= 36 && dinosaurHall.labels.length <= 45);
  assert.ok((dinosaurHall.detailZones?.length ?? 0) >= 5);
  assert.deepEqual(dinosaurHall.portals, [], "dinosaur hall remains a terminal exhibit");

  const museum = byId.get("science-museum");
  assert.ok(museum);
  assert.equal(museum.labels.length, 121, "science museum keeps its expanded final-pixel vocabulary");
  const museumWords = new Set(museum.labels.map((label) => label.word));
  for (const term of ["dinosaur tail", "telescope finder", "microscope turret", "fossil spiral", "DNA helix", "pedestal plinth"]) {
    assert.ok(museumWords.has(term), `science museum shows ${term}`);
  }
  const dinosaurPortal = museum.portals.find(({ childSceneId }) => childSceneId === "dinosaur-hall");
  const humanPortal = museum.portals.find(({ childSceneId }) => childSceneId === "human-body");
  assert.ok(dinosaurPortal);
  assert.ok(humanPortal);
  assert.deepEqual(dinosaurPortal, {
    id: "enter-dinosaur-hall",
    label: "Enter the dinosaur hall",
    translation: "进入恐龙展厅",
    childSceneId: "dinosaur-hall",
    x: 0,
    y: 65,
    width: 570,
    height: 445,
    enterScale: 3.6,
    sourceVisualRegion: "portal-dinosaur-hall",
  });
  assert.ok(
    dinosaurPortal.x + dinosaurPortal.width <= humanPortal.x,
    "left dinosaur portal stays completely separate from the right anatomy portal",
  );

  const words = new Set(dinosaurHall.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "Tyrannosaurus skeleton",
    "skull",
    "jaw",
    "teeth",
    "rib cage",
    "pelvis",
    "tail",
    "forelimb",
    "femur",
    "Triceratops skull",
    "ammonite fossil",
    "trilobite fossil",
    "fossil egg",
    "fossil matrix",
    "hammer",
    "rock strata",
  ]) {
    assert.ok(words.has(required.toLocaleLowerCase()), `dinosaur hall visibly grounds ${required}`);
  }
  for (const unsupported of [
    "living dinosaur",
    "roaring",
    "predator",
    "Cretaceous period",
    "extinction",
    "paleontologist",
    "excavation",
    "rock fracture",
  ]) {
    assert.ok(!words.has(unsupported.toLocaleLowerCase()), `dinosaur hall omits inferred ${unsupported}`);
  }
});

test("premium human body keeps a truthful heart portal and six grounded anatomy crops", async () => {
  const { scenes } = await loadWorld();
  const humanBody = scenes.find((scene) => scene.id === "human-body");
  assert.ok(humanBody);
  assert.equal(humanBody.parentId, "science-museum");
  assert.equal(humanBody.asset, "/scenes/human-body-premium-v2.jpg");
  assert.equal(humanBody.labels.length, 40);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      humanBody.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 8, 8, 8, 8],
    "every zoom band reveals an equal batch of grounded anatomy words",
  );
  assert.equal(humanBody.detailZones?.length, 6);
  assert.deepEqual(humanBody.portals, [{
    id: "enter-heart",
    label: "Inspect the heart",
    translation: "观察心脏",
    childSceneId: "heart",
    x: 1238,
    y: 238,
    width: 92,
    height: 105,
    enterScale: 3.6,
    sourceVisualRegion: "portal-heart",
  }]);

  const words = new Set(humanBody.labels.map(({ word }) => word));
  for (const visible of [
    "mannequin",
    "head",
    "elbow",
    "fingers",
    "skeleton",
    "skull",
    "rib cage",
    "spine",
    "pelvis",
    "femur",
    "deltoid",
    "quadriceps",
    "trachea",
    "lung",
    "heart",
    "liver",
    "stomach",
    "small intestine",
    "large intestine",
  ]) {
    assert.ok(words.has(visible), `human body visibly grounds ${visible}`);
  }
  for (const unsupported of [
    "brain",
    "kidney",
    "pancreas",
    "spinal cord",
    "skin",
    "diaphragm",
    "disease",
  ]) {
    assert.ok(!words.has(unsupported), `human body omits invisible ${unsupported}`);
  }
});

test("premium heart exposes four chambers and one isolated blood-cell portal", async () => {
  const { scenes } = await loadWorld();
  const heart = scenes.find((scene) => scene.id === "heart");
  assert.ok(heart);
  assert.equal(heart.parentId, "human-body");
  assert.equal(heart.asset, "/scenes/heart-premium-v2.jpg");
  assert.equal(heart.labels.length, 36);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      heart.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 8, 7, 7, 6],
  );
  assert.equal(heart.detailZones?.length, 5);
  assert.deepEqual(heart.portals, [{
    id: "enter-blood-cell",
    label: "Follow a blood cell",
    translation: "跟随血细胞",
    childSceneId: "blood-cell",
    x: 1138,
    y: 378,
    width: 245,
    height: 180,
    enterScale: 3.6,
    sourceVisualRegion: "portal-red-cell",
  }]);

  const words = new Set(heart.labels.map(({ word }) => word));
  for (const visible of [
    "right atrium",
    "left atrium",
    "right ventricle",
    "left ventricle",
    "interventricular septum",
    "tricuspid valve",
    "mitral valve",
    "chordae tendineae",
    "papillary muscle",
    "aorta",
    "superior vena cava",
    "pulmonary trunk",
    "coronary artery",
    "tunica externa",
    "tunica media",
    "tunica intima",
    "lumen",
    "red blood cell",
    "capillary",
  ]) {
    assert.ok(words.has(visible), `heart visibly grounds ${visible}`);
  }
  for (const inferred of [
    "oxygenated blood",
    "deoxygenated blood",
    "electrocardiogram",
    "flow",
    "sinoatrial node",
    "cardiac output",
  ]) {
    assert.ok(!words.has(inferred), `heart omits inferred ${inferred}`);
  }
});

test("premium blood cell connects capillary structure to one visible hemoglobin model", async () => {
  const { scenes } = await loadWorld();
  const bloodCell = scenes.find((scene) => scene.id === "blood-cell");
  assert.ok(bloodCell);
  assert.equal(bloodCell.parentId, "heart");
  assert.equal(bloodCell.asset, "/scenes/blood-cell-premium-v2.jpg");
  assert.equal(bloodCell.labels.length, 36);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      bloodCell.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 7, 7, 7, 7],
  );
  assert.equal(bloodCell.detailZones?.length, 5);
  assert.deepEqual(bloodCell.portals, [{
    id: "enter-hemoglobin",
    label: "Inspect hemoglobin",
    translation: "查看血红蛋白",
    childSceneId: "hemoglobin",
    x: 850,
    y: 310,
    width: 360,
    height: 350,
    enterScale: 3.6,
    sourceVisualRegion: "portal-hemoglobin-tetramer",
  }]);

  const words = new Set(bloodCell.labels.map(({ word }) => word));
  for (const visible of [
    "capillary",
    "endothelial lining",
    "endothelial cell",
    "basement membrane",
    "pericyte",
    "red blood cell",
    "biconcave disc",
    "red cell membrane",
    "lipid bilayer",
    "membrane protein",
    "spectrin filament",
    "neutrophil",
    "lobed nucleus",
    "platelet",
    "hemoglobin",
    "protein subunit",
    "heme group",
  ]) {
    assert.ok(words.has(visible), `blood cell visibly grounds ${visible}`);
  }
  for (const unsupported of [
    "antibody",
    "bacteria",
    "oxygen marker",
    "phagocytosis",
    "hematocrit",
    "fibrin",
    "donation",
  ]) {
    assert.ok(!words.has(unsupported), `blood cell omits inferred ${unsupported}`);
  }
});

test("community garden adds one disjoint root portal and two grounded local branches", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const root = byId.get("world-map");
  const garden = byId.get("community-garden");
  assert.ok(root);
  assert.ok(garden);
  assert.equal(garden.parentId, "world-map");
  assert.equal(garden.asset, "/scenes/community-garden-premium-v1.jpg");
  assert.equal(garden.labels.length, 48);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      garden.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 10, 10, 9, 9],
  );
  assert.ok((garden.detailZones?.length ?? 0) >= 6);
  assert.deepEqual(garden.portals, [
    {
      id: "enter-greenhouse-interior",
      label: "Explore the greenhouse",
      translation: "探索温室内部",
      childSceneId: "greenhouse-interior",
      x: 900,
      y: 30,
      width: 700,
      height: 450,
      enterScale: 2.7,
      sourceVisualRegion: "greenhouse-bay",
    },
    {
      id: "enter-potting-workbench",
      label: "Explore the potting workbench",
      translation: "探索园艺工作台",
      childSceneId: "potting-workbench",
      x: 0,
      y: 380,
      width: 530,
      height: 430,
      enterScale: 2.7,
      sourceVisualRegion: "potting-bench-area",
    },
  ]);

  const gardenPortal = root.portals.find(({ childSceneId }) => childSceneId === "community-garden");
  assert.ok(gardenPortal);
  assert.deepEqual(gardenPortal, {
    id: "enter-community-garden",
    label: "Enter the community garden",
    translation: "进入社区花园",
    childSceneId: "community-garden",
    x: 240,
    y: 530,
    width: 480,
    height: 260,
    enterScale: 3.75,
    sourceVisualRegion: "portal-enter-community-garden",
  });
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
  for (const portal of root.portals.filter(({ childSceneId }) => childSceneId !== "community-garden")) {
    assert.ok(!overlaps(gardenPortal, portal), `garden portal does not overlap ${portal.id}`);
  }

  const words = new Set(garden.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "greenhouse",
    "raised bed",
    "potting bench",
    "compost bin",
    "rain barrel",
    "wheelbarrow",
    "watering can",
    "seedling tray",
    "bean trellis",
    "garden hose",
    "hose reel",
    "drip line",
    "sunflower",
    "butterfly",
  ]) {
    assert.ok(words.has(visible), `community garden visibly grounds ${visible}`);
  }
  for (const inferred of [
    "volunteering",
    "harvest",
    "sustainability",
    "pollination",
    "composting",
    "organic",
  ]) {
    assert.ok(!words.has(inferred), `community garden omits inferred ${inferred}`);
  }
});

test("greenhouse, tomato plant and potting workbench form dense truthful garden slices", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const greenhouse = byId.get("greenhouse-interior");
  const tomato = byId.get("tomato-plant");
  const workbench = byId.get("potting-workbench");
  assert.ok(greenhouse);
  assert.ok(tomato);
  assert.ok(workbench);

  assert.equal(greenhouse.parentId, "community-garden");
  assert.equal(greenhouse.asset, "/scenes/greenhouse-interior-premium-v1.jpg");
  assert.equal(greenhouse.labels.length, 46);
  assert.deepEqual(
    greenhouse.labels.reduce<number[]>((counts, label) => {
      counts[label.minLevel ?? 0] += 1;
      return counts;
    }, [0, 0, 0, 0, 0]),
    [9, 9, 9, 9, 10],
  );
  assert.deepEqual(greenhouse.portals, [{
    id: "enter-tomato-plant",
    label: "Study the tomato plant",
    translation: "细看番茄植株",
    childSceneId: "tomato-plant",
    x: 1040,
    y: 35,
    width: 400,
    height: 825,
    enterScale: 3.1,
    sourceVisualRegion: "portal-tomato-plant",
  }]);

  assert.equal(tomato.parentId, "greenhouse-interior");
  assert.equal(tomato.asset, "/scenes/tomato-plant-premium-v1.jpg");
  assert.equal(tomato.labels.length, 44);
  assert.equal(tomato.portals.length, 0);
  assert.ok((tomato.detailZones?.length ?? 0) >= 5);

  assert.equal(workbench.parentId, "community-garden");
  assert.equal(workbench.asset, "/scenes/potting-workbench-premium-v1.jpg");
  assert.equal(workbench.labels.length, 49);
  assert.equal(workbench.portals.length, 0);
  assert.ok((workbench.detailZones?.length ?? 0) >= 6);

  for (const [scene, required] of [
    [greenhouse, ["greenhouse interior", "glass pane", "roof vent", "tomato plant"]],
    [tomato, ["main stem", "compound leaf", "tomato flower", "ripe tomato"]],
    [workbench, ["watering can", "seedling tray", "pruning shears", "garden hose"]],
  ] as const) {
    const words = new Set(scene.labels.map(({ word }) => word));
    for (const word of required) assert.ok(words.has(word), `${scene.id} visibly grounds ${word}`);
  }
});

test("city cafe is a new terminal storefront branch with a non-overlapping parent portal", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const cafe = byId.get("city-cafe");
  assert.ok(cafe);
  assert.equal(cafe.parentId, "city-street");
  assert.equal(cafe.asset, "/scenes/city-cafe-premium-v2.jpg");
  assert.ok(cafe.labels.length >= 36 && cafe.labels.length <= 45);
  assert.ok((cafe.detailZones?.length ?? 0) >= 5);
  assert.deepEqual(cafe.portals, [], "city cafe remains its own terminal exploration");

  const street = byId.get("city-street");
  assert.ok(street);
  const cafePortal = street.portals.find(({ childSceneId }) => childSceneId === "city-cafe");
  assert.ok(cafePortal);
  assert.deepEqual(cafePortal, {
    id: "enter-city-cafe",
    label: "Enter the city cafe",
    translation: "进入城市咖啡馆",
    childSceneId: "city-cafe",
    x: 620,
    y: 155,
    width: 365,
    height: 470,
    enterScale: 3.6,
    sourceVisualRegion: "portal-cafe",
  });
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
  for (const portal of street.portals.filter(({ childSceneId }) => childSceneId !== "city-cafe")) {
    assert.ok(!overlaps(cafePortal, portal), `cafe portal does not overlap ${portal.id}`);
  }

  const words = new Set(cafe.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "service counter",
    "countertop",
    "espresso machine",
    "group head",
    "portafilter",
    "coffee grinder",
    "display case",
    "croissant",
    "banquette",
    "coffee cup",
    "glass carafe",
  ]) {
    assert.ok(words.has(required), `city cafe visibly grounds ${required}`);
  }
  assert.ok(!words.has("stone countertop"), "city cafe does not infer an unprovable countertop material");
  const cafeLabels = new Map(cafe.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["brick-wall", "pressure-gauge", "coffee-grinder", "bean-hopper", "steam-wand", "wall-sconce"]
      .map((id) => {
        const label = cafeLabels.get(id);
        assert.ok(label);
        return [label.x, label.y];
      }),
    [[1050, 150], [1260, 365], [1455, 470], [1455, 320], [1375, 450], [526, 253]],
    "cafe detail anchors remain on the named visible objects",
  );
  assert.equal(byId.get("coffee-machine")?.parentId, "kitchen");
  const coffeeMachineParents = scenes.flatMap((scene) => (
    scene.portals.filter(({ childSceneId }) => childSceneId === "coffee-machine")
      .map(() => scene.id)
  ));
  assert.deepEqual(coffeeMachineParents, ["kitchen"], "existing coffee-machine branch stays single-parented");
});

test("spatial anchors cross-link to real, word-identical entries in the 10k lexicon", async () => {
  const { scenes } = await loadWorld();
  const semanticRoot = resolve(projectRoot, "public/data/semantic");
  const manifest = JSON.parse(
    await readFile(resolve(semanticRoot, "manifest.json"), "utf8"),
  ) as { entryCount: number; shards: Array<{ path: string }> };
  const shards = await Promise.all(manifest.shards.map(async ({ path }) => (
    JSON.parse(await readFile(resolve(semanticRoot, path), "utf8")) as {
      nodes: Array<{ id: string; word: string }>;
    }
  )));
  const lexiconById = new Map(
    shards.flatMap(({ nodes }) => nodes).map((node) => [node.id, node] as const),
  );
  assert.equal(lexiconById.size, 10_000, "the complete lexical world is loaded");

  const linked = scenes.flatMap((scene) => scene.labels.map((label) => ({ scene, label })))
    .filter(({ label }) => Boolean(label.lexemeId));
  assert.ok(linked.length >= 180, "a material spatial-to-lexical crosswalk is authored");
  for (const { scene, label } of linked) {
    const lexeme = lexiconById.get(label.lexemeId!);
    assert.ok(lexeme, `${scene.id}/${label.id} lexeme exists`);
    assert.equal(
      lexeme.word.trim().toLocaleLowerCase().replace(/\s+/g, " "),
      label.word.trim().toLocaleLowerCase().replace(/\s+/g, " "),
      `${scene.id}/${label.id} lexeme has the same display word`,
    );
  }

  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const wrongSenseRegressions: Readonly<Record<string, readonly string[]>> = {
    battery: ["battery", "controller"],
    "city-street": ["intersection", "skeleton"],
    frog: ["pupil", "heart"],
    heart: ["heart", "chamber"],
    "oak-tree": ["branch", "soil"],
    polymer: ["polymer-chain", "branch"],
    "science-museum": ["globe", "horn", "button"],
    "world-map": ["path", "table"],
  };
  for (const [sceneId, labelIds] of Object.entries(wrongSenseRegressions)) {
    for (const labelId of labelIds) {
      assert.equal(
        byId.get(sceneId)?.labels.find((label) => label.id === labelId)?.lexemeId,
        undefined,
        `${sceneId}/${labelId} stays unlinked from the wrong 10k sense`,
      );
    }
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
      assert.ok(
        source.includes(`viewBox="0 0 ${scene.width} ${scene.height}"`),
        `${scene.id} coordinate system`,
      );
    } else {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${scene.id} JPEG signature`);
      assert.deepEqual(
        readJpegDimensions(bytes),
        { width: scene.width, height: scene.height },
        `${scene.id} base raster dimensions`,
      );
    }
  }
});
