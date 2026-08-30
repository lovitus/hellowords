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

test("mature world has six subject branches and fully reachable practical paths", async () => {
  const { manifest, scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const root = byId.get(manifest.rootSceneId);
  assert.ok(root);
  assert.equal(root.parentId, null);
  assert.deepEqual(
    root.portals.map((portal) => portal.childSceneId),
    ["apartment", "city-street", "city-park", "community-garden", "school-campus", "supermarket-grocery"],
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
    ["world-map", "city-street", "transit-hub", "urban-services", "hospital", "pathology-lab"],
    ["world-map", "city-street", "transit-hub", "urban-services", "hospital", "radiology-suite"],
    ["world-map", "city-street", "transit-hub", "urban-services", "hospital", "emergency-department", "operating-theatre", "post-anesthesia-care-unit"],
    ["world-map", "city-street", "transit-hub", "urban-services", "hospital", "hospital-pharmacy"],
    ["world-map", "city-street", "transit-hub", "urban-services", "airport", "baggage-claim"],
    ["world-map", "city-street", "transit-hub", "urban-services", "airport", "security-checkpoint", "boarding-gate", "aircraft-cabin"],
    ["world-map", "city-street", "transit-hub", "urban-services", "office-building", "service-core"],
    ["world-map", "city-street", "transit-hub", "urban-services", "office-building", "service-core", "warehouse-loading-dock"],
    ["world-map", "city-street", "hotel-exterior", "hotel-lobby-rooms"],
    ["world-map", "school-campus", "library-reading-room"],
    ["world-map", "supermarket-grocery", "supermarket-backroom", "supermarket-walk-in-cooler"],
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
  assert.equal(cityPark.labels.length, 174, "city park keeps its expanded final-pixel vocabulary");
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => cityPark.labels.filter((label) => label.minLevel === level).length),
    [13, 22, 59, 46, 34],
  );
  assert.deepEqual(
    cityPark.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["pond-habitat-detail", 89],
      ["oak-tree-detail", 24],
      ["playground-detail", 13],
      ["picnic-detail", 5],
      ["fountain-garden-detail", 23],
      ["park-foreground-detail", 20],
    ],
  );
  const cityParkWords = new Set(cityPark.labels.map((label) => label.word));
  for (const term of [
    "pond water",
    "bridge deck",
    "bridge plank",
    "oak leaf",
    "oak leaf vein",
    "fountain spray",
    "fountain rim",
    "gazebo railing",
    "gazebo post",
    "gazebo roof",
    "shoreline rock",
    "lily center",
    "lily petal",
    "reed blade",
    "tree branch fork",
    "swing seat",
    "swing hook",
    "slide rail",
    "climbing rung",
    "bench seat",
    "bench slat",
    "path stone",
    "path edge",
    "daisy stalk",
    "fern leaflet",
    "picnic basket weave",
    "flower stalk",
    "grass blade",
    "acorn cap",
    "root bark",
    "pond basin",
    "park bridge",
    "bridge arch",
    "pond waterline",
    "lily pad vein",
    "reed stem",
    "duck wing",
    "oak canopy",
    "squirrel tail",
    "bark groove",
    "root fork",
    "fountain nozzle",
    "gazebo roofline",
    "flower cluster",
    "fountain stone",
    "gazebo arch",
    "bench leg",
    "lamp globe",
    "slide handrail",
    "acorn tip",
    "leaf margin",
    "root ridge",
    "bridge rail post",
    "bridge deck plank",
    "lily pad rim",
    "duck bill",
    "water surface",
    "shoreline stone",
  ]) {
    assert.ok(cityParkWords.has(term), `city park shows ${term}`);
  }
  for (const [id, point] of [
    ["bridge-plank", [170, 635]],
    ["oak-leaf-vein", [1470, 170]],
    ["picnic-basket-weave", [978, 535]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = cityPark.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `city park keeps ${id} label`);
    assert.deepEqual(
      [anchor.x, anchor.y],
      point,
      `city park anchors ${id}`,
    );
  }
  assert.deepEqual(
    cityPark.portals.map(({ id, x, y, width, height }) => [id, x, y, width, height]),
    [
      ["enter-oak-tree", 800, 0, 800, 760],
      ["enter-pond-edge", 0, 550, 700, 350],
    ],
  );

  const oakTree = byId.get("oak-tree");
  assert.ok(oakTree);
  assert.equal(oakTree.labels.length, 68, "oak tree keeps its expanded final-pixel vocabulary");
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => oakTree.labels.filter((label) => label.minLevel === level).length),
    [8, 14, 19, 16, 11],
  );
  assert.deepEqual(
    oakTree.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["left-bough-wildlife", 12],
      ["trunk-microhabitat", 14],
      ["leaves-and-acorns", 15],
      ["roots-fungi-and-ground", 16],
      ["woodland-edge-flora", 11],
    ],
  );
  const oakTreeWords = new Set(oakTree.labels.map((label) => label.word));
  for (const term of [
    "squirrel tail",
    "branch bark",
    "web thread",
    "web hub",
    "nest twig",
    "hollow rim",
    "woodpecker wing",
    "bark plate",
    "lichen patch",
    "oak leaf margin",
    "oak leaf petiole",
    "oak leaf lobe tip",
    "acorn stalk",
    "acorn skin",
    "caterpillar segment",
    "root ridge",
    "root tip",
    "bracket shelf",
    "bracket pore",
    "leaf litter edge",
    "moss cushion",
    "fern pinna",
    "fern stipe",
    "wildflower center",
    "grass blade",
  ]) {
    assert.ok(oakTreeWords.has(term), `oak tree shows ${term}`);
  }
  for (const [id, point] of [
    ["squirrel-tail", [153, 137]],
    ["oak-leaf-margin", [1535, 247]],
    ["root-ridge", [700, 735]],
    ["grass-blade", [1335, 728]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = oakTree.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `oak tree keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `oak tree anchors ${id}`);
  }
  assert.deepEqual(oakTree.portals, [
    {
      id: "enter-leaf",
      label: "Enter the oak leaf",
      translation: "进入橡树叶",
      childSceneId: "leaf",
      x: 895,
      y: 5,
      width: 700,
      height: 445,
      enterScale: 3.6,
      sourceVisualRegion: "upper-right-leaf-cluster",
    },
  ]);

  const cityStreet = byId.get("city-street");
  assert.ok(cityStreet);
  assert.equal(cityStreet.asset, "/scenes/city-street-bright-v4.jpg");
  assert.equal(cityStreet.labels.length, 179, "city street keeps its expanded facade vocabulary");
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
    polymer: 50,
    bathroom: 36,
    "city-cafe": 36,
    "dinosaur-hall": 36,
    "human-body": 32,
    "heart": 32,
    "blood-cell": 28,
    "community-garden": 40,
    "lithium-ion-cell": 28,
    frog: 28,
    "oxygen-molecule": 50,
    hemoglobin: 44,
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
  assert.equal(kitchen.labels.length, 176);
  const words = new Set(kitchen.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of ["sink divider", "cabinet hinge", "burner", "oven door", "coffee screen", "steam wand", "island edge", "island countertop", "cutting board grain", "hood vent slot", "cabinet knob"]) {
    assert.ok(words.has(required), `kitchen visibly grounds ${required}`);
  }
});

test("bedroom preserves its expanded bedding, study and storage vocabulary", async () => {
  const { scenes } = await loadWorld();
  const bedroom = scenes.find((scene) => scene.id === "bedroom");
  assert.ok(bedroom);
  assert.equal(bedroom.labels.length, 164);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      bedroom.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 8, 33, 52, 63],
  );
  const words = new Set(bedroom.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "pillow seam",
    "duvet fold",
    "headboard tuft",
    "desk edge",
    "chair cushion",
    "laptop hinge",
    "artwork frame",
    "ceiling shade",
    "window mullion",
    "dresser knob",
    "garment sleeve",
    "shelf basket",
    "wardrobe hinge",
    "basket weave",
    "floor plank",
    "wardrobe door panel",
    "hanger hook",
    "shirt collar",
    "jacket lapel",
    "wardrobe floor",
  ]) {
    assert.ok(words.has(required), `bedroom visibly grounds ${required}`);
  }
  assert.deepEqual(
    bedroom.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["sleeping-area", 58],
      ["study-area", 19],
      ["window-wall", 14],
      ["storage-area", 67],
      ["room-structure", 5],
    ],
  );
  const labels = new Map(bedroom.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["pillow-seam", "desk-edge", "wardrobe-hinge"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[560, 485], [120, 690], [1140, 400]],
    "new bedroom parts stay anchored on their reviewed pixels",
  );
});

test("railway platform preserves its expanded passenger, train and track vocabulary", async () => {
  const { scenes } = await loadWorld();
  const platform = scenes.find((scene) => scene.id === "railway-platform");
  assert.ok(platform);
  assert.equal(platform.labels.length, 126);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      platform.labels.filter((label) => label.minLevel === level).length
    )),
    [7, 6, 19, 39, 55],
  );
  const words = new Set(platform.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "platform tile",
    "platform coping",
    "tactile stud",
    "clock housing",
    "clock mount",
    "bench backrest",
    "bench seat",
    "suitcase wheel",
    "umbrella tip",
    "jacket sleeve",
    "speaker bracket",
    "roof vent",
    "window frame",
    "door threshold",
    "door step",
    "headlight bezel",
    "coupler head",
    "buffer",
    "wheel hub",
    "bogie suspension",
    "rail baseplate",
    "sleeper shoulder",
    "ballast shoulder",
    "mast crossarm",
    "pantograph hinge",
  ]) {
    assert.ok(words.has(required), `railway platform visibly grounds ${required}`);
  }
  assert.deepEqual(
    platform.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["passenger-platform", 34],
      ["train-body", 30],
      ["overhead-electrification", 11],
      ["track-structure", 51],
    ],
  );
  const labels = new Map(platform.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["platform-tile", "roof-vent", "rail-baseplate"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[470, 820], [1110, 250], [1310, 760]],
    "new railway platform parts stay anchored on their reviewed pixels",
  );
});

test("transit hub preserves its expanded rail, concourse and mobility vocabulary", async () => {
  const { scenes } = await loadWorld();
  const hub = scenes.find((scene) => scene.id === "transit-hub");
  assert.ok(hub);
  assert.equal(hub.labels.length, 175);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      hub.labels.filter((label) => label.minLevel === level).length
    )),
    [9, 9, 46, 54, 57],
  );
  const words = new Set(hub.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "clock face",
    "clock rim",
    "roof pane",
    "escalator step",
    "escalator side panel",
    "stair tread",
    "stair railing",
    "fare gate reader",
    "ticket slot",
    "route line",
    "planter rim",
    "plant leaf",
    "bicycle wheel",
    "trolley wheel",
    "trolley handle",
    "bollard cap",
    "bicycle handlebar",
    "bicycle saddle",
    "bicycle pedal",
    "trolley basket",
    "trolley frame",
    "trolley caster",
    "bollard body",
    "bollard base",
    "bollard band",
    "floor reflection",
    "train nose",
    "train window frame",
    "train door handle",
    "train headlight lens",
    "pantograph arm",
    "bus headlight",
    "bus front grille",
    "charging connector",
    "floor tile",
    "platform canopy",
    "boarding marker",
    "ticket validator",
    "escalator comb",
    "wayfinding panel",
    "overhead mast",
    "ceiling beam joint",
    "escalator balustrade",
    "fare gate pedestal",
    "route map frame",
  ]) {
    assert.ok(words.has(required), `transit hub visibly grounds ${required}`);
  }
  assert.deepEqual(
    hub.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["railway-zone", 78],
      ["central-concourse", 66],
      ["electric-bus-zone", 11],
      ["foreground-mobility", 20],
    ],
  );
  const labels = new Map(hub.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["roof-pane", "train-nose", "charging-connector"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[1000, 140], [100, 450], [1220, 570]],
    "new transit hub parts stay anchored on their reviewed pixels",
  );
});

test("city cafe preserves its expanded seating, pastry and espresso vocabulary", async () => {
  const { scenes } = await loadWorld();
  const cafe = scenes.find((scene) => scene.id === "city-cafe");
  assert.ok(cafe);
  assert.equal(cafe.labels.length, 130);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      cafe.labels.filter((label) => label.minLevel === level).length
    )),
    [9, 9, 34, 39, 39],
  );
  const words = new Set(cafe.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "door panel",
    "window mullion",
    "cafe tabletop",
    "counter edge",
    "display glass",
    "table base",
    "chair back",
    "chair seat",
    "banquette back",
    "banquette seat",
    "pendant shade",
    "shelf bracket",
    "plant leaf",
    "cup handle",
    "carafe neck",
    "glass rim",
    "sugar bowl lid",
    "napkin fold",
    "portafilter handle",
    "steam wand tip",
    "grinder chute",
    "cup stack rim",
    "payment screen",
    "receipt slot",
    "menu frame",
    "croissant layer",
    "muffin liner",
    "tart filling",
    "display case corner",
    "glass shelf bracket",
    "steam valve handle",
  ]) {
    assert.ok(words.has(required), `city cafe visibly grounds ${required}`);
  }
  assert.deepEqual(
    cafe.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["cafe-shell", 6],
      ["window-seating", 22],
      ["counter-pastries", 75],
      ["espresso-station", 15],
      ["foreground-tableware", 12],
    ],
  );
  const labels = new Map(cafe.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["door-panel", "display-glass", "steam-wand-tip"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[150, 560], [900, 450], [1375, 500]],
    "new city cafe parts stay anchored on their reviewed pixels",
  );
});

test("train carriage adds grounded coupler, cabin and track parts", async () => {
  const { scenes } = await loadWorld();
  const carriage = scenes.find((scene) => scene.id === "train-carriage");
  assert.ok(carriage);
  assert.equal(carriage.labels.length, 100);
  const words = new Set(carriage.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "buffer",
    "brake hose",
    "sleeper",
    "door seal",
    "window pane",
    "wall panel",
  ]) {
    assert.ok(words.has(required), `train carriage visibly grounds ${required}`);
  }
  assert.deepEqual(
    carriage.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["carriage-shell", 9],
      ["passenger-seating", 14],
      ["entry-vestibule", 14],
      ["overhead-storage", 8],
      ["bogie-assembly", 43],
      ["underbody-equipment", 4],
      ["coupler-and-brake-gear", 4],
      ["foreground-track", 4],
    ],
  );
  assert.equal(
    carriage.detailZones?.find((zone) => zone.id === "coupler-and-brake-gear")?.targetScale,
    2.8,
    "the coupler crop reaches the L4 brake hose in one focus gesture",
  );
  const anchors = new Map(carriage.labels.map((label) => [label.id, [label.x, label.y]] as const));
  for (const [id, point] of [
    ["buffer", [72, 660]],
    ["brake-hose", [120, 720]],
    ["sleeper", [980, 855]],
    ["door-seal", [620, 350]],
    ["window-pane", [1000, 380]],
    ["wall-panel", [1080, 235]],
  ] as const) {
    assert.deepEqual(anchors.get(id), point, `train carriage anchor ${id}`);
  }
});

test("premium coffee machine grounds its cutaway and keeps one real water-tank portal", async () => {
  const { scenes } = await loadWorld();
  const coffeeMachine = scenes.find((scene) => scene.id === "coffee-machine");
  assert.ok(coffeeMachine);
  assert.equal(coffeeMachine.asset, "/scenes/coffee-machine-premium-v1.jpg");
  assert.equal(coffeeMachine.parentId, "kitchen");
  assert.equal(coffeeMachine.labels.length, 60);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      coffeeMachine.labels.filter((label) => label.minLevel === level).length
    )),
    [16, 14, 12, 10, 8],
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
    "top panel",
    "grind chamber",
    "pump housing",
    "side wall",
    "bean chute",
    "gauge bezel",
    "shower screen",
    "steam valve",
    "group gasket",
    "portafilter handle",
    "drain opening",
    "boiler fitting",
    "pressure valve",
    "hose clamp",
    "pump inlet",
    "pump outlet",
    "flow meter",
    "terminal block",
    "boiler outlet",
    "water inlet",
  ]) {
    assert.ok(words.has(required), `coffee machine visibly grounds ${required}`);
  }
  const addedAnchors = new Map(coffeeMachine.labels.map((label) => [label.id, [label.x, label.y]]));
  assert.deepEqual(addedAnchors.get("pump-housing"), [1190, 580], "pump housing stays on its distinct black pump casing");
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
  assert.equal(waterTank.labels.length, 61);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      waterTank.labels.filter((label) => label.minLevel === level).length
    )),
    [12, 14, 14, 11, 10],
  );
  assert.equal(waterTank.detailZones?.length, 9);
  assert.deepEqual(
    waterTank.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["lid-and-rim", 12],
      ["lid-corner-detail", 5],
      ["water-and-air", 7],
      ["surface-ripple-detail", 4],
      ["wall-construction", 10],
      ["outlet-assembly", 10],
      ["filter-cup-detail", 4],
      ["base-and-mounts", 4],
      ["base-bracket-detail", 4],
    ],
  );
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
    "fill opening",
    "lid underside",
    "hinge barrel",
    "hinge arm",
    "latch insert",
    "lid corner",
    "hinge leaf",
    "filter cup",
    "latch housing",
    "surface ripple",
    "bottom rail",
    "front corner post",
    "condensation streak",
    "lid channel",
    "base bracket",
    "left rubber foot",
    "outlet tube",
    "valve plunger",
    "valve seat",
    "filter housing",
    "outlet bracket",
    "base lip",
    "filter rim",
    "filter mesh",
    "outlet collar",
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

test("premium plant cell expands only into visible organelle subparts", async () => {
  const { scenes } = await loadWorld();
  const cell = scenes.find((scene) => scene.id === "plant-cell");
  assert.ok(cell);
  assert.equal(cell.parentId, "leaf");
  assert.equal(cell.asset, "/scenes/plant-cell-premium-v2.jpg");
  assert.equal(cell.labels.length, 60);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      cell.labels.filter((label) => label.minLevel === level).length
    )),
    [7, 10, 13, 17, 13],
  );
  assert.deepEqual(
    cell.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["nucleus-and-er", 14],
      ["golgi-and-smooth-er", 8],
      ["vacuole-and-cytoplasm", 12],
      ["chloroplast-cutaway", 7],
      ["thylakoid-stack-detail", 5],
      ["mitochondria-and-wall", 4],
      ["upper-wall-junction", 4],
      ["mitochondrion-detail", 6],
    ],
  );
  assert.deepEqual(cell.portals.map(({ childSceneId, sourceVisualRegion }) => (
    [childSceneId, sourceVisualRegion]
  )), [["chloroplast-interior", "chloroplast-cutaway"]]);

  const words = new Set(cell.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "rough ER sheet",
    "Golgi stack",
    "cytoskeleton bundle",
    "ribosome cluster",
    "vacuole edge",
    "thylakoid membrane",
    "smooth ER branch",
    "nucleolar core",
    "Golgi cisterna edge",
    "granum edge",
    "crista tip",
    "nuclear envelope fold",
    "chloroplast inner membrane",
    "cell wall junction",
  ]) {
    assert.ok(words.has(visible.toLocaleLowerCase()), `plant cell visibly grounds ${visible}`);
  }
  for (const unsupported of [
    "enzyme",
    "glucose",
    "osmosis",
    "mitosis",
    "gene expression",
    "plasmodesma",
  ]) {
    assert.ok(!words.has(unsupported), `plant cell omits inferred ${unsupported}`);
  }
});

test("premium battery pack expands only into clearly resolved electrical and thermal parts", async () => {
  const { scenes } = await loadWorld();
  const battery = scenes.find((scene) => scene.id === "battery");
  assert.ok(battery);
  assert.equal(battery.parentId, "electric-bus");
  assert.equal(battery.asset, "/scenes/battery-premium-v2.jpg");
  assert.equal(battery.labels.length, 90);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      battery.labels.filter((label) => label.minLevel === level).length
    )),
    [7, 13, 27, 23, 20],
  );
  assert.deepEqual(
    battery.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["pack-shell", 39],
      ["lid-and-seal", 5],
      ["cell-module", 17],
      ["power-electronics", 12],
      ["power-terminal", 4],
      ["thermal-management", 13],
    ],
  );
  assert.deepEqual(
    battery.portals.map(({ id, childSceneId, sourceVisualRegion }) => (
      [id, childSceneId, sourceVisualRegion]
    )),
    [["enter-lithium-cell", "lithium-ion-cell", "portal-cell-module"]],
  );

  const words = new Set(battery.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "insulation sheet",
    "module clamp",
    "cell spacer",
    "cable clamp",
    "voltage sense wire",
    "coolant manifold",
    "support rail",
    "vent grille",
    "enclosure rib",
    "mounting hole",
    "cell can",
    "module end plate",
    "cable gland",
    "terminal lug",
    "coolant tube",
    "lid port",
    "lid recess",
    "cell terminal stud",
    "cell holder rib",
    "module side wall",
    "wire loom",
    "tube retainer",
    "coolant tee",
    "front wall bolt",
    "flange bolt",
    "mounting tab",
    "vent mesh",
    "connector lock",
  ]) {
    assert.ok(words.has(visible), `battery visibly grounds ${visible}`);
  }
  for (const unsupported of [
    "negative terminal",
    "temperature sensor",
    "current sensor",
    "pressure-relief valve",
    "thermal runaway",
    "voltage",
    "energy",
  ]) {
    assert.ok(!words.has(unsupported), `battery omits unsupported ${unsupported}`);
  }

  const labels = new Map(battery.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["insulation-sheet", "cable-clamp", "coolant-manifold", "mounting-hole", "cell-can", "lid-port", "coolant-tee", "connector-lock"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[460, 535], [790, 425], [820, 610], [1380, 790], [490, 465], [1278, 89], [815, 600], [1400, 345]],
    "new battery parts stay anchored on the reviewed cutaway pixels",
  );
});

test("premium electric bus expands its visible cabin and running gear without adding rider claims", async () => {
  const { scenes } = await loadWorld();
  const bus = scenes.find((scene) => scene.id === "electric-bus");
  assert.ok(bus);
  assert.equal(bus.parentId, "transit-hub");
  assert.equal(bus.asset, "/scenes/electric-bus-premium-v2.jpg");
  assert.equal(bus.labels.length, 85);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      bus.labels.filter((label) => label.minLevel === level).length
    )),
    [7, 10, 21, 25, 22],
  );
  assert.deepEqual(
    bus.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["bus-shell", 6],
      ["passenger-cabin", 40],
      ["front-entry-cab", 17],
      ["underfloor-energy", 6],
      ["rear-drivetrain", 4],
      ["front-running-gear", 10],
    ],
  );
  assert.deepEqual(
    bus.portals.map(({ id, childSceneId, sourceVisualRegion }) => (
      [id, childSceneId, sourceVisualRegion]
    )),
    [["enter-battery", "battery", "portal-battery"]],
  );

  const words = new Set(bus.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const visible of [
    "front bumper",
    "rear bumper",
    "seat cushion",
    "seat leg",
    "wheel rim",
    "suspension arm",
    "battery tray",
    "cable clamp",
    "door handle",
    "step",
    "brake disc",
    "door frame",
    "door window",
    "door hinge",
    "wheel lug",
  ]) {
    assert.ok(words.has(visible), `electric bus visibly grounds ${visible}`);
  }
  for (const unsupported of [
    "driver",
    "passenger",
    "route number",
    "destination sign",
    "regenerative braking",
    "climate control",
    "boarding",
  ]) {
    assert.ok(!words.has(unsupported), `electric bus omits unsupported ${unsupported}`);
  }

  const labels = new Map(bus.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["front-bumper", "seat-cushion", "battery-tray", "brake-disc", "door-frame", "door-window", "door-hinge", "wheel-lug"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[1370, 760], [450, 510], [620, 735], [910, 675], [1045, 360], [1080, 355], [1150, 430], [930, 675]],
    "new bus parts stay anchored on the reviewed cutaway pixels",
  );
});

test("premium pond edge grounds its freshwater life and keeps one real frog portal", async () => {
  const { scenes } = await loadWorld();
  const pondEdge = scenes.find((scene) => scene.id === "pond-edge");
  assert.ok(pondEdge);
  assert.equal(pondEdge.asset, "/scenes/pond-edge-premium-v1.jpg");
  assert.equal(pondEdge.parentId, "city-park");
  assert.equal(pondEdge.labels.length, 65);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      pondEdge.labels.filter((label) => label.minLevel === level).length
    )),
    [12, 15, 17, 12, 9],
  );
  assert.equal(pondEdge.detailZones?.length, 6);
  assert.deepEqual(
    pondEdge.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["emergent-plants-insects", 14],
      ["floating-garden", 12],
      ["open-water", 8],
      ["clear-shallows", 10],
      ["bank-textures", 13],
      ["frog-portrait", 7],
    ],
  );
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
    "cattail stem",
    "cattail bract",
    "reed blade tip",
    "dragonfly body",
    "damselfly wing",
    "lily pad vein",
    "lily pad notch",
    "water lily center",
    "lily bud sepal",
    "snail foot",
    "ripple ring",
    "water reflection line",
    "water strider leg",
    "surface bubble",
    "minnow fin",
    "tadpole eye",
    "submerged leaf",
    "air bubble cluster",
    "shoreline pebble",
    "root bark ridge",
    "mud bank stone",
    "fallen twig tip",
    "frog tympanum",
    "frog toe pad",
    "frog dorsal stripe",
  ]) {
    assert.ok(words.has(required), `pond edge visibly grounds ${required}`);
  }
  for (const [id, point] of [
    ["cattail-stem", [260, 230]],
    ["water-lily-center", [350, 455]],
    ["minnow-fin", [625, 765]],
    ["shoreline-pebble", [1210, 650]],
    ["frog-tympanum", [1280, 470]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = pondEdge.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `pond edge keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `pond edge anchors ${id}`);
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
  assert.equal(cell.labels.length, 60);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      cell.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 13, 12, 13, 12],
  );
  assert.equal(cell.detailZones?.length, 7);
  assert.deepEqual(
    cell.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["lid-and-terminals", 11],
      ["positive-terminal-detail", 5],
      ["negative-terminal-detail", 4],
      ["cell-enclosure", 12],
      ["wound-electrode-core", 14],
      ["unfolded-layer-stack", 10],
      ["unfolded-layer-edges", 4],
    ],
  );
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
    "terminal washer",
    "fill-port cap",
    "winding face",
    "vent rim",
    "separator edge",
    "case corner",
    "winding edge",
    "electrode edge",
    "tab weld",
    "foil fold",
    "bottom insulator",
    "base rail",
    "fan tip",
    "layer fold",
    "positive terminal seal",
    "negative terminal seal",
    "fill-port collar",
    "cover lip",
    "winding outer turn",
    "core wall",
    "case side rail",
    "positive tab root",
    "negative tab root",
    "separator fold",
    "electrode fold",
    "vent screen",
    "collector edge",
    "case lip",
  ]) {
    assert.ok(words.has(visible), `lithium-ion cell visibly grounds ${visible}`);
  }
  const anchors = new Map(cell.labels.map((label) => [label.id, [label.x, label.y]]));
  for (const [id, point] of [
    ["terminal-washer", [420, 125]],
    ["fill-port-cap", [603, 80]],
    ["vent-rim", [755, 140]],
    ["case-corner", [300, 750]],
    ["tab-weld", [490, 300]],
    ["fan-tip", [1430, 730]],
    ["positive-terminal-seal", [420, 105]],
    ["cover-lip", [760, 170]],
    ["positive-tab-root", [470, 285]],
    ["electrode-fold", [1260, 650]],
  ] as const) {
    assert.deepEqual(anchors.get(id), point, `lithium-ion cell anchors ${id}`);
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
  assert.equal(bogie.labels.length, 95);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      bogie.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 13, 26, 25, 23],
  );
  assert.equal(bogie.detailZones?.length, 5);
  assert.deepEqual(
    bogie.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["frame-and-secondary-suspension", 51],
      ["powered-wheelset", 17],
      ["axlebox-and-primary-suspension", 7],
      ["right-running-gear", 11],
      ["track-interface", 9],
    ],
  );
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
    "frame weld",
    "side frame rib",
    "cross member plate",
    "air spring rib",
    "pivot cap",
    "conduit clip",
    "bracket bolt",
    "wheel hub",
    "wheel rim",
    "disc hole",
    "motor shaft",
    "gear tooth",
    "coupling ring",
    "motor endcap",
    "bearing seal",
    "spring seat",
    "damper mount",
    "wheel hub cap",
    "traction link pin",
    "anti-roll joint",
    "brake hose fitting",
    "rail foot",
    "sleeper edge",
    "ballast stone",
    "sleeper fastener",
  ]) {
    assert.ok(words.has(visible), `rail bogie visibly grounds ${visible}`);
  }
  for (const [id, point] of [
    ["frame-weld", [650, 300]],
    ["wheel-hub", [280, 470]],
    ["bearing-seal", [525, 690]],
    ["wheel-hub-cap", [1335, 560]],
    ["rail-foot", [825, 810]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = bogie.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `rail bogie keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `rail bogie anchors ${id}`);
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
  assert.equal(frog.labels.length, 59);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      frog.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 13, 15, 13, 8],
  );
  assert.equal(frog.detailZones?.length, 4);
  assert.deepEqual(
    frog.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["head-and-senses", 15],
      ["body-and-skin", 14],
      ["front-limb", 13],
      ["rear-limb", 15],
    ],
  );

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
    "eye rim",
    "eyelid",
    "nostril rim",
    "mouth corner",
    "throat fold",
    "jawline",
    "back spot",
    "flank spot",
    "belly skin",
    "side stripe edge",
    "skin crease",
    "shoulder spot",
    "forearm",
    "forearm stripe",
    "wrist crease",
    "finger joint",
    "finger tip",
    "forefoot palm",
    "thigh stripe",
    "knee fold",
    "ankle tendon",
    "toe segment",
    "webbing edge",
    "hind foot sole",
    "stone moss",
  ]) {
    assert.ok(words.has(required), `frog visibly grounds ${required}`);
  }
  for (const [id, point] of [
    ["eye-rim", [1060, 275]],
    ["back-spot", [700, 300]],
    ["forearm", [885, 580]],
    ["toe-segment", [220, 690]],
    ["stone-moss", [480, 730]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = frog.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `frog keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `frog anchors ${id}`);
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

test("premium polymer expands visible material structure and remains a terminal study", async () => {
  const { scenes } = await loadWorld();
  const polymer = scenes.find((scene) => scene.id === "polymer");
  assert.ok(polymer);
  assert.equal(polymer.asset, "/scenes/polymer-premium-v2.jpg");
  assert.equal(polymer.parentId, "water-tank");
  assert.deepEqual(polymer.portals, [], "polymer remains a terminal scene");
  assert.equal(polymer.labels.length, 60, "polymer keeps its reviewed 60-anchor evidence ceiling");

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
    "crystallite",
    "lamellar stack",
    "polymer assembly",
    "material cross section",
    "film roll",
    "pellet cluster",
    "crystalline lamella",
    "spherulite ray",
    "lamella edge",
    "interlamellar region",
    "amorphous pocket",
    "filler surface",
    "pore rim",
    "tie molecule",
    "chain junction",
    "backbone bend",
    "fracture branch",
    "cross-link node",
    "chain segment",
    "crack branch",
    "molecular loop",
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
  assert.equal(wardrobe.labels.length, 60);
  assert.deepEqual(
    wardrobe.portals.map(({ childSceneId }) => childSceneId),
    ["cotton-shirt"],
  );
  assert.equal(wardrobe.portals[0]?.sourceVisualRegion, "portal-shirt");
  const displayWords = new Set(wardrobe.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of ["window sill", "door panel", "jacket cuff", "trouser leg"]) {
    assert.ok(displayWords.has(required), `wardrobe visibly grounds ${required}`);
  }
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
  assert.equal(shirt.labels.length, 55);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      shirt.labels.filter((label) => label.minLevel === level).length
    )),
    [11, 11, 11, 11, 11],
  );
  assert.equal(shirt.detailZones?.length, 6);
  assert.deepEqual(
    shirt.detailZones?.slice(-2).map((zone) => [zone.id, zone.labelIds.length, zone.targetScale]),
    [["cotton-materials", 4, 1.25], ["sewing-tools", 16, 2.4]],
  );
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
    "yoke",
    "collar button",
    "side seam",
    "buttonhole",
    "cuff opening",
    "pocket corner",
    "sleeve buttonhole",
    "needle eye",
    "thread loop",
    "spool core",
    "thimble rim",
    "shear pivot",
    "needle point",
    "pin head",
    "shear handle",
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

test("premium oxygen scene expands the visible exchange path without process padding", async () => {
  const { scenes } = await loadWorld();
  const oxygen = scenes.find((scene) => scene.id === "oxygen-molecule");
  assert.ok(oxygen);
  assert.equal(oxygen.asset, "/scenes/oxygen-molecule-premium-v2.jpg");
  assert.deepEqual(oxygen.portals, []);
  assert.equal(oxygen.labels.length, 90);
  const displayWords = new Set(oxygen.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "alveolar network",
    "alveolar opening",
    "respiratory membrane",
    "bronchiole lumen",
    "alveolar pore",
    "capillary wall",
    "red blood cell cluster",
    "endothelial nucleus",
    "oxygen pair",
    "red cell dimple",
    "hemoglobin cluster",
    "carbon atom",
  ]) {
    assert.ok(displayWords.has(required), `oxygen visibly grounds ${required}`);
  }
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

test("premium hemoglobin expands its grounded structure vocabulary and preserves the oxygen portal", async () => {
  const { scenes } = await loadWorld();
  const hemoglobin = scenes.find((scene) => scene.id === "hemoglobin");
  assert.ok(hemoglobin);
  assert.equal(hemoglobin.asset, "/scenes/hemoglobin-premium-v2.jpg");
  assert.equal(hemoglobin.labels.length, 81);
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
    "alpha beta dimer",
    "heme array",
    "helix bundle",
    "heme plane",
    "distal pocket",
    "oxygen ligand",
    "porphyrin nitrogen",
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

test("apartment keeps its room portals and newly reviewed fixture parts", async () => {
  const { scenes } = await loadWorld();
  const apartment = scenes.find((scene) => scene.id === "apartment");
  assert.ok(apartment);
  assert.equal(apartment.labels.length, 173);
  const words = new Set(apartment.labels.map(({ word }) => word.toLocaleLowerCase()));
  for (const required of [
    "sofa arm",
    "chair seat",
    "drawer",
    "bathtub faucet",
    "shower drain",
    "wall niche",
    "sofa leg",
    "coffee table top",
    "media drawer",
    "floorboard grain",
    "media cabinet handle",
  ]) {
    assert.ok(words.has(required), `apartment visibly grounds ${required}`);
  }
  assert.deepEqual(
    apartment.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["living-room-detail", 93],
      ["kitchen-detail", 26],
      ["bedroom-detail", 18],
      ["bathroom-detail", 24],
      ["central-stair-upper-detail", 8],
      ["central-stair-lower-detail", 4],
    ],
  );
  const apartmentLabels = new Map(apartment.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["sofa-leg-pro-2", "media-cabinet-handle-pro-2"].map((id) => {
      const label = apartmentLabels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[340, 416], [50, 335]],
    "new living-room parts stay on their visible object pixels",
  );
});

test("bathroom adds a dense terminal apartment room without overlapping sibling portals", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const bathroom = byId.get("bathroom");
  assert.ok(bathroom);
  assert.equal(bathroom.parentId, "apartment");
  assert.equal(bathroom.asset, "/scenes/bathroom-premium-v1.jpg");
  assert.equal(bathroom.labels.length, 163);
  assert.ok((bathroom.detailZones?.length ?? 0) >= 5);
  assert.deepEqual(bathroom.portals, [], "bathroom remains a terminal room");

  const apartment = byId.get("apartment");
  assert.ok(apartment);
  assert.deepEqual(
    apartment.detailZones?.slice(-2).map((zone) => [zone.id, zone.labelIds.length, zone.targetScale]),
    [["central-stair-upper-detail", 8, 2.35], ["central-stair-lower-detail", 4, 2.35]],
    "the tall stair core is split into two focusable crops",
  );
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
    "window pane",
    "toilet bowl rim",
    "showerhead nozzle",
    "glass door hinge",
    "niche shelf",
    "towel hem",
    "shower arm",
    "glass clamp",
    "mixer trim",
    "towel stripe",
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
  assert.equal(dinosaurHall.labels.length, 69);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      dinosaurHall.labels.filter((label) => label.minLevel === level).length
    )),
    [7, 11, 20, 18, 13],
  );
  assert.deepEqual(
    dinosaurHall.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["tyrannosaur-head", 10],
      ["axial-skeleton", 15],
      ["limbs-and-feet", 13],
      ["triceratops-display", 9],
      ["fossil-cabinet", 10],
      ["fossil-preparation", 11],
    ],
  );
  assert.ok((dinosaurHall.detailZones?.length ?? 0) >= 5);
  assert.deepEqual(dinosaurHall.portals, [], "dinosaur hall remains a terminal exhibit");

  const museum = byId.get("science-museum");
  assert.ok(museum);
  assert.equal(museum.labels.length, 206, "science museum keeps its expanded final-pixel vocabulary");
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => museum.labels.filter((label) => label.minLevel === level).length),
    [8, 18, 47, 61, 72],
  );
  const museumWords = new Set(museum.labels.map((label) => label.word));
  for (const term of [
    "dinosaur tail",
    "telescope finder",
    "microscope turret",
    "fossil spiral",
    "DNA helix",
    "pedestal plinth",
    "vertebra",
    "shoulder blade",
    "telescope tube ring",
    "planetary ring",
    "focus knob",
    "robot link",
    "ammonite chamber",
    "prism edge",
    "anatomy leg",
    "zygomatic arch",
    "cervical vertebra",
    "femoral head",
    "skeletal mount",
    "bone surface",
  ]) {
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
    "skull ridge",
    "snout",
    "jaw hinge",
    "skull roof",
    "lower jaw rim",
    "shoulder blade",
    "sacrum",
    "neck vertebra",
    "rib curve",
    "tail joint",
    "vertebral process",
    "humerus",
    "radius",
    "ulna",
    "metatarsal",
    "toe joint",
    "eye socket",
    "frill edge",
    "horn base",
    "beak ridge",
    "ammonite rib",
    "trilobite segment",
    "petrified wood layer",
    "brush bristles",
    "hammer head",
  ]) {
    assert.ok(words.has(required.toLocaleLowerCase()), `dinosaur hall visibly grounds ${required}`);
  }
  for (const [id, point] of [
    ["skull-ridge", [270, 130]],
    ["shoulder-blade", [760, 225]],
    ["metatarsal", [875, 480]],
    ["trilobite-segment", [680, 700]],
    ["hammer-head", [1265, 735]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = dinosaurHall.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `dinosaur hall keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `dinosaur hall anchors ${id}`);
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
  assert.equal(humanBody.labels.length, 90);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      humanBody.labels.filter((label) => label.minLevel === level).length
    )),
    [12, 12, 22, 22, 22],
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
    "chest",
    "abdomen",
    "head",
    "mandible",
    "elbow",
    "fingers",
    "thumb",
    "skeleton",
    "skull",
    "rib cage",
    "rib",
    "spine",
    "vertebra",
    "pelvis",
    "femur",
    "radius",
    "ulna",
    "fibula",
    "deltoid",
    "pectoralis",
    "triceps",
    "abdominal muscle",
    "calf muscle",
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
  assert.equal(heart.labels.length, 91);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      heart.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 12, 27, 25, 19],
  );
  assert.equal(heart.detailZones?.length, 5);
  assert.deepEqual(
    heart.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["great-vessels-zone", 14],
      ["atria-and-valves-zone", 11],
      ["ventricles-zone", 16],
      ["coronary-surface-zone", 8],
      ["artery-cutaway-zone", 42],
    ],
  );
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
    "aortic valve cusp",
    "pulmonary artery lumen",
    "pulmonary vein opening",
    "vena cava wall",
    "vessel rim",
    "right atrial wall",
    "left atrial wall",
    "tricuspid cusp",
    "mitral cusp",
    "atrial septum",
    "apical wall",
    "trabecular ridge",
    "septal muscle",
    "chordal attachment",
    "papillary tip",
    "ventricular wall layer",
    "coronary branch",
    "coronary groove",
    "fat lobule",
    "surface vessel",
    "artery ring",
    "endothelial lining",
    "red cell membrane",
    "red cell dimple",
    "capillary branch",
  ]) {
    assert.ok(words.has(visible), `heart visibly grounds ${visible}`);
  }
  for (const [id, point] of [
    ["aortic-valve-cusp", [500, 250]],
    ["atrial-septum", [520, 345]],
    ["red-cell-dimple", [1260, 430]],
    ["capillary-branch", [1490, 680]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = heart.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `heart keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `heart anchors ${id}`);
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
  assert.equal(bloodCell.labels.length, 91);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      bloodCell.labels.filter((label) => label.minLevel === level).length
    )),
    [8, 13, 25, 24, 21],
  );
  assert.equal(bloodCell.detailZones?.length, 5);
  assert.deepEqual(
    bloodCell.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["capillary-wall-zone", 13],
      ["blood-field-zone", 10],
      ["red-cell-cutaway-zone", 51],
      ["neutrophil-zone", 10],
      ["platelet-zone", 7],
    ],
  );
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
    "endothelial border",
    "endothelial junction",
    "basement membrane ridge",
    "pericyte process",
    "capillary wall fold",
    "free red cell",
    "red cell rim",
    "red cell pair",
    "membrane cortex",
    "spectrin network",
    "actin junction",
    "membrane protein cluster",
    "lipid head",
    "cytoskeletal strand",
    "hemoglobin cluster",
    "tetramer interface",
    "cytoplasm pocket",
    "cutaway rim",
    "neutrophil lobe",
    "granule cluster",
    "neutrophil rim",
    "granule particle",
    "platelet lobe",
    "platelet granule cluster",
    "pseudopod tip",
  ]) {
    assert.ok(words.has(visible), `blood cell visibly grounds ${visible}`);
  }
  for (const [id, point] of [
    ["endothelial-border", [650, 118]],
    ["free-red-cell", [1390, 390]],
    ["membrane-cortex", [700, 390]],
    ["granule-cluster", [215, 300]],
    ["pseudopod-tip", [1180, 580]],
  ] as const) {
    const anchor: Scene["labels"][number] | undefined = bloodCell.labels.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(anchor, `blood cell keeps ${id} label`);
    assert.deepEqual([anchor.x, anchor.y], point, `blood cell anchors ${id}`);
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
  assert.equal(garden.labels.length, 163);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      garden.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 10, 45, 54, 44],
  );
  assert.deepEqual(
    garden.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["garden-overview", 6],
      ["greenhouse-zone", 73],
      ["raised-bed-zone", 42],
      ["potting-zone", 13],
      ["water-zone", 11],
      ["compost-zone", 10],
      ["pollinator-zone", 8],
    ],
  );
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
    "greenhouse roof ridge",
    "greenhouse vent frame",
    "greenhouse door handle",
    "staging shelf",
    "tomato cluster",
    "bed corner post",
    "bed timber slat",
    "carrot top",
    "kale leaf",
    "bench surface",
    "bench shelf edge",
    "tray cell",
    "watering handle",
    "trowel blade",
    "compost slat",
    "wheelbarrow handle",
    "wheelbarrow wheel",
    "barrel lid",
    "tap handle",
    "hose coupler",
    "hose reel crank",
    "sunflower center",
    "sunflower petal",
    "butterfly wing",
    "fence post",
    "greenhouse frame joint",
    "glazing clip",
    "vent louver",
    "seedling cotyledon",
    "tomato pedicel",
    "drip emitter",
    "bed soil surface",
    "kale stalk",
    "trellis clip",
    "tomato stem",
    "crop stake",
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
  const labels = new Map(garden.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["greenhouse-roof-ridge", "bench-surface", "sunflower-center"].map((id) => {
      const label = labels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[1235, 60], [260, 610], [1475, 765]],
    "new community garden parts stay anchored on their reviewed pixels",
  );
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
  assert.equal(greenhouse.labels.length, 112);
  assert.deepEqual(
    greenhouse.labels.reduce<number[]>((counts, label) => {
      counts[label.minLevel ?? 0] += 1;
      return counts;
    }, [0, 0, 0, 0, 0]),
    [9, 11, 35, 31, 26],
  );
  assert.deepEqual(
    greenhouse.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["greenhouse-structure", 42],
      ["potting-workbench", 17],
      ["propagation-area", 17],
      ["soil-station", 6],
      ["back-growing-bench", 8],
      ["central-aisle", 12],
      ["tomato-portal-zone", 10],
    ],
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
  assert.equal(tomato.labels.length, 99);
  assert.equal(tomato.portals.length, 0);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      tomato.labels.filter((label) => label.minLevel === level).length
    )),
    [9, 11, 31, 29, 19],
  );
  assert.deepEqual(
    tomato.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["plant-architecture", 8],
      ["leaf-anatomy", 45],
      ["flower-anatomy", 10],
      ["fruit-anatomy", 14],
      ["support-and-base", 18],
      ["pest-evidence", 4],
    ],
  );

  assert.equal(workbench.parentId, "community-garden");
  assert.equal(workbench.asset, "/scenes/potting-workbench-premium-v1.jpg");
  assert.equal(workbench.labels.length, 116);
  assert.equal(workbench.portals.length, 0);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((level) => (
      workbench.labels.filter((label) => label.minLevel === level).length
    )),
    [10, 10, 29, 34, 33],
  );
  assert.deepEqual(
    workbench.detailZones?.map((zone) => [zone.id, zone.labelIds.length]),
    [
      ["bench-structure-zone", 11],
      ["watering-zone", 9],
      ["seedling-potting-zone", 16],
      ["hand-tool-zone", 44],
      ["tying-supplies-zone", 9],
      ["lower-storage-zone", 20],
      ["side-tool-zone", 5],
    ],
  );

  for (const [scene, required] of [
    [greenhouse, [
      "greenhouse interior",
      "glass pane",
      "roof vent",
      "tomato plant",
      "glass door handle",
      "door threshold",
      "roof glazing bar",
      "vent latch",
      "staging shelf",
      "watering can rim",
      "watering can handle",
      "seed tray cell",
      "propagation tray rim",
      "tray divider",
      "seedling plug",
      "cotyledon",
      "seedling leaf pair",
      "potting mix surface",
      "tray drainage hole",
      "basil node",
      "terracotta pot rim",
      "basil leaf",
      "pot rim",
      "saucer rim",
      "twine strand",
      "trowel handle",
      "shear handle",
      "soil bag fold",
      "scoop handle",
      "fan stand",
      "drip emitter",
      "tomato stem",
      "tomato leaflet",
      "tomato cluster",
      "marigold center",
      "pepper stem",
      "paving edge",
      "gravel stone",
    ]],
    [tomato, [
      "main stem",
      "compound leaf",
      "tomato flower",
      "ripe tomato",
      "leaflet tip",
      "leaflet base",
      "leaf midrib",
      "leaf lobe",
      "leaf axil",
      "leaf trichome",
      "flower sepal",
      "flower center",
      "flower branch",
      "flower anther tip",
      "fruit shoulder",
      "fruit skin",
      "fruit branch",
      "fruit calyx lobe",
      "fruit pedicel",
      "bamboo tip",
      "bamboo node",
      "tie knot",
      "clip jaw",
      "grow bag rim",
      "bag fold",
      "bag seam",
      "soil surface",
      "drip barb",
      "irrigation joint",
    ]],
    [workbench, [
      "watering can",
      "seedling tray",
      "pruning shears",
      "garden hose",
      "watering can rim",
      "tray rim",
      "seedling stem",
      "pot rim",
      "worktop edge",
      "scoop bowl",
      "mister trigger",
      "tomato leaf",
      "bamboo tip",
      "sieve mesh",
      "soil sack fold",
      "trowel blade",
      "pruner spring",
      "soil sack rim",
      "soil sack opening",
      "soil sack side",
      "bucket side",
      "nursery pot base",
      "pot stack side",
      "coir disc surface",
      "coir fiber edge",
      "burlap mat fold",
      "burlap mat edge",
      "lower shelf board",
      "shelf front edge",
    ]],
  ] as const) {
    const words = new Set(scene.labels.map(({ word }) => word));
    for (const word of required) assert.ok(words.has(word), `${scene.id} visibly grounds ${word}`);
  }
  const workbenchLabels = new Map(workbench.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["watering-can-rim", "worktop-edge", "sieve-mesh"].map((id) => {
      const label = workbenchLabels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[362, 240], [800, 483], [1435, 624]],
    "new potting workbench parts stay anchored on their reviewed pixels",
  );
  const greenhouseLabels = new Map(greenhouse.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["glass-door-handle", "seed-tray-cell", "tomato-cluster"].map((id) => {
      const label = greenhouseLabels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[1564, 430], [338, 512], [1249, 553]],
    "new greenhouse parts stay anchored on their reviewed pixels",
  );
  const tomatoLabels = new Map(tomato.labels.map((label) => [label.id, label] as const));
  assert.deepEqual(
    ["leaflet-tip", "fruit-shoulder", "grow-bag-rim"].map((id) => {
      const label = tomatoLabels.get(id);
      assert.ok(label);
      return [label.x, label.y];
    }),
    [[312, 650], [976, 631], [1210, 845]],
    "new tomato plant parts stay anchored on their reviewed pixels",
  );
});

test("city cafe is a new terminal storefront branch with a non-overlapping parent portal", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const cafe = byId.get("city-cafe");
  assert.ok(cafe);
  assert.equal(cafe.parentId, "city-street");
  assert.equal(cafe.asset, "/scenes/city-cafe-premium-v2.jpg");
  assert.equal(cafe.labels.length, 130);
  assert.ok((cafe.detailZones?.length ?? 0) >= 5);
  assert.deepEqual(cafe.portals, [], "city cafe remains its own terminal exploration");

  const street = byId.get("city-street");
  assert.ok(street);
  const cafePortal = street.portals.find(({ childSceneId }) => childSceneId === "city-cafe");
  assert.ok(cafePortal);
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
  assert.deepEqual(cafePortal, {
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
  const hotelPortal = street.portals.find(({ childSceneId }) => childSceneId === "hotel-exterior");
  assert.ok(hotelPortal);
  assert.deepEqual(hotelPortal, {
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
  assert.ok(!overlaps(cafePortal, hotelPortal), "hotel upper facade stays separate from cafe storefront");
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

test("urban services adds hospital, airport and office vocabulary without breaking the transit branch", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const urban = byId.get("urban-services");
  assert.ok(urban);
  assert.equal(urban.parentId, "transit-hub");
  assert.equal(urban.labels.length, 120);
  assert.equal(urban.detailZones?.length, 4);
  assert.deepEqual(
    urban.portals.map(({ childSceneId }) => childSceneId),
    ["hospital", "airport", "office-building"],
  );
  for (const [sceneId, count, zones, parent, required] of [
    ["hospital", 440, 6, "urban-services", ["emergency department", "pathology laboratory", "mri scanner", "pharmacy", "cancer", "paracetamol", "cardiology", "hypertension", "suction unit", "table strap", "defibrillator", "pulse oximeter", "mri bore", "positioning laser", "surgical light handle"]],
    ["radiology-suite", 87, 6, "hospital", ["ct bay", "mri bay", "radiography room", "mammography room", "ultrasound bay", "contrast injector tower", "radiation indicator", "wall clock face", "x-ray collimator", "ultrasound probe head", "sink basin drain", "ceiling light panel"]],
    ["emergency-department", 108, 5, "hospital", ["triage bay", "triage workstation", "ed resuscitation bay", "ed examination couch", "clinical pass-through", "ed door vision panel"]],
    ["operating-theatre", 109, 5, "emergency-department", ["operating room", "theatre operating table", "theatre anesthesia machine", "scrub bay", "sterile ceiling panel", "recovery vacuum outlet"]],
    ["pathology-lab", 450, 6, "hospital", ["histopathology", "microscope", "tissue cassette", "microtome", "staining tray", "cold cabinet", "immunohistochemistry", "slide digitizer", "cryostat", "cold chain", "blade holder", "wax scraper", "section bath", "pipette plunger", "freezer door"]],
    ["hospital-pharmacy", 390, 5, "hospital", ["medicine shelf", "dispensing counter", "tablet", "automated dispensing cabinet", "rolling cart", "doxycycline", "cetirizine", "lamotrigine", "drawer cart", "cart shelf mat", "azithromycin", "nystatin", "dispensing chute", "prescription scanner", "calibration weight"]],
    ["airport", 390, 5, "urban-services", ["check in counter", "security screening", "jet bridge", "baggage carousel", "runway", "control tower", "aircraft fuselage", "body scanner", "claim chute", "carousel motor", "runway threshold", "ground power unit", "gate sign frame", "departure board frame", "luggage shell"]],
    ["baggage-claim", 95, 5, "airport", ["reclaim carousel", "hard-shell suitcase", "claim tag", "arrival foyer", "cart bay", "customs booth", "inspection tray", "arrivals reception counter", "arrival wall clock", "security camera dome"]],
    ["office-building", 390, 5, "urban-services", ["reception", "open plan office", "conference room", "server room", "hvac duct", "fire panel", "data center", "docking station", "fan coil", "ceiling hatch", "lift indicator", "fiber tray", "conference table corner", "marker rack", "backsplash tile"]],
    ["service-core", 90, 5, "office-building", ["switchboard door", "breaker handle", "filter pleat", "valve wheel", "utility sink basin", "dock plate", "pallet jack handle", "freight elevator seam"]],
  ] as const) {
    const scene = byId.get(sceneId);
    assert.ok(scene);
    assert.equal(scene.parentId, parent);
    assert.equal(scene.labels.length, count);
    assert.equal(scene.detailZones?.length, zones);
    const words = new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase()));
    for (const term of required) assert.ok(words.has(term), `${sceneId} visibly grounds ${term}`);
  }
  assert.deepEqual(
    byId.get("hospital")?.portals.map(({ childSceneId }) => childSceneId),
    ["emergency-department", "pathology-lab", "radiology-suite", "hospital-pharmacy"],
  );
  assert.deepEqual(
    byId.get("airport")?.portals.map(({ childSceneId }) => childSceneId),
    ["baggage-claim", "security-checkpoint"],
  );
  const transit = byId.get("transit-hub");
  assert.ok(transit?.portals.some(({ childSceneId }) => childSceneId === "urban-services"));
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
