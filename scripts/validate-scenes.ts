import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertValidSceneGraph,
  assertSceneAssetIntegrity,
  resolveSceneAssets,
  type Label,
  type Portal,
  type Scene,
  type SceneDetailZone,
} from "../app/domain/index";

interface SceneManifest {
  schemaVersion: number;
  rootSceneId: string;
  scenes: Array<{ id: string; title: string; parentId: string | null }>;
}

type VisualRegionKind = "whole" | "object" | "part" | "diagram";

interface VisualRegion {
  id: string;
  description: string;
  kind: VisualRegionKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnchorAudit {
  status: "human-verified";
  policy: "visible-object-or-part-only";
  reviewedAsset: string;
  reviewedAssetSha256?: string;
  rationale: string;
  previousLabelCount: number;
  retainedLabelCount: number;
  removedLabelCount: number;
  removedExamples: string[];
}

interface AuditedLabel extends Label {
  sourceVisualRegion: string;
}

interface AuditedPortal extends Portal {
  sourceVisualRegion: string;
}

interface AuditedScene extends Scene {
  anchorAudit: AnchorAudit;
  visualRegions: VisualRegion[];
  detailZones?: SceneDetailZone[];
  labels: AuditedLabel[];
  portals: AuditedPortal[];
}

interface SemanticManifest {
  entryCount: number;
  shards: Array<{ path: string }>;
}

interface SemanticNode {
  id: string;
  word: string;
}

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "public/data/scenes");
const publicRoot = resolve(projectRoot, "public");
const MIN_MATURE_SCENES = 37;
const MIN_ROOT_BRANCHES = 4;
const MIN_MATURE_ROOT_BRANCHES = 4;
const MIN_SCENES_PER_MATURE_ROOT_BRANCH = 4;
const MIN_DEEP_PATHS = 6;
const MIN_DEEP_PATH_SCENES = 5;
const DENSITY_LEVELS = [0, 1, 2, 3, 4] as const;
const PREMIUM_DENSITY_MINIMUMS: Readonly<Record<string, number>> = {
  "world-map": 32,
  apartment: 32,
  kitchen: 32,
  "coffee-machine": 32,
  "water-tank": 32,
  "pond-edge": 32,
  // One terminal external-anatomy portrait visibly supports 34 features.
  // The lower floor allows evidence-led revisions without adding internal anatomy.
  frog: 28,
  // The upgraded terminal polymer exhibit resolves distinct macro,
  // morphological and molecular structures. Its evidence floor stays at 50
  // while the explicit ceiling below blocks invisible properties and
  // near-synonyms from inflating the scene.
  polymer: 50,
  bedroom: 32,
  bathroom: 36,
  "wardrobe-interior": 32,
  "cotton-shirt": 32,
  "city-street": 32,
  // The urban-services overview anchors three clearly separated campus blocks
  // and their shared connectors before handing off to the specialist scenes.
  "urban-services": 80,
  // The hospital raster visibly separates emergency, pathology, radiology,
  // pharmacy and operating-theatre areas; its floor keeps disease and INN terms
  // in the clinical-reference band without turning them into treatment advice.
  hospital: 100,
  // The dedicated radiology photograph resolves CT, MRI, X-ray, mammography,
  // ultrasound and preparation fixtures without adding patient or dose claims.
  "radiology-suite": 64,
  // Acute-care scenes retain only visible triage, resuscitation, examination,
  // theatre, scrub, sterile-store and recovery fixtures.
  "emergency-department": 90,
  "operating-theatre": 90,
  "post-anesthesia-care-unit": 120,
  "intensive-care-unit": 140,
  // The dedicated pathology lab keeps microscope, specimen, embedding, staining
  // and cold-storage terms in one focused educational bench.
  "pathology-lab": 100,
  // The pharmacy close-up keeps storage, dispensing, compounding and generic
  // medicine terms on visible shelves, counters and equipment.
  "hospital-pharmacy": 100,
  // The terminal raster resolves passenger processing, security, gate, baggage
  // claim and airside structures with a bounded, independently pointable set.
  airport: 100,
  // The standalone baggage-claim photograph resolves carousel, luggage,
  // arrivals, customs and service fixtures without inferring flight states.
  "baggage-claim": 64,
  "check-in-counter": 140,
  "baggage-drop-station": 145,
  // The airport continuation resolves a complete screening lane and one
  // connected gate/boarding-bridge scene without passenger or flight claims.
  "security-checkpoint": 90,
  "boarding-gate": 100,
  // The connected wide-body cabin resolves the entry, galley, seating,
  // overhead-service, lavatory and room-fabric parts without flight claims.
  "aircraft-cabin": 120,
  "aircraft-lavatory": 120,
  // The office atrium resolves reception, open work floor, meeting, pantry and
  // building-service hardware without inferring people, companies or policies.
  "office-building": 100,
  // The standalone service-core photograph resolves electrical, HVAC, fire,
  // janitorial and loading hardware as a bounded facilities vocabulary.
  "service-core": 80,
  // The hotel exterior and connected lobby/rooms photographs keep facade,
  // arrival, guest-room, bathroom and housekeeping parts independently visible.
  "hotel-exterior": 64,
  "hotel-lobby-rooms": 90,
  // The connected supermarket backroom keeps receiving, material-handling,
  // pallet-rack, refrigeration, packing and sanitation hardware visible.
  "supermarket-backroom": 120,
  "supermarket-checkout-station": 120,
  "refrigerated-display-case": 130,
  "supermarket-produce-department": 140,
  "produce-weighing-station": 140,
  // The connected walk-in cooler resolves dairy, produce, mobile storage,
  // refrigeration, doorway and insulated-room parts without temperature claims.
  "supermarket-walk-in-cooler": 120,
  "city-cafe": 36,
  "electric-bus": 32,
  "railway-platform": 32,
  "train-carriage": 32,
  "rail-bogie": 32,
  battery: 32,
  // The terminal prismatic-cell study resolves 32 independently pointable
  // enclosure, terminal, winding and unfolded-layer structures. Its ceiling
  // blocks invisible electrochemistry and performance terms from returning.
  "lithium-ion-cell": 28,
  "science-museum": 32,
  "dinosaur-hall": 36,
  "human-body": 32,
  heart: 32,
  "blood-cell": 28,
  "community-garden": 40,
  "greenhouse-interior": 40,
  "tomato-plant": 40,
  "potting-workbench": 40,
  "city-park": 32,
  "oak-tree": 32,
  leaf: 32,
  "plant-cell": 32,
  // The terminal oxygen scene now exposes a richer anatomical exchange path;
  // the lower floor leaves room for future evidence-led revisions without
  // allowing the image to regress to a token handful.
  "oxygen-molecule": 50,
  // The reviewed alpha2-beta2 render now exposes distinct heme, ribbon and
  // coordination structures; the lower floor keeps future revisions evidence-led.
  hemoglobin: 44,
  // The reviewed school-campus photograph supports distinct classroom,
  // library, arts, music, gym, infirmary, locker, utility and grounds parts.
  "school-campus": 64,
  // This terminal specialist image supports 28 distinct structures. Requiring
  // 32 produced synonym pairs at identical pixels, which is worse than an
  // explicit evidence-based exception.
  "chloroplast-interior": 32,
};
const PREMIUM_DENSITY_MAXIMUMS: Readonly<Record<string, number>> = {
  // The final bright park raster resolves separate bridge, pond, playground,
  // fountain, gazebo, oak, bench, daisy and picnic parts without activity or
  // wildlife inference; the ceiling blocks ornamental padding.
  // The final park raster also resolves bridge arches, pond waterlines, plant
  // veins, bark grooves, root forks and small fixture parts for 174 anchors.
  "city-park": 174,
  "city-street": 179,
  apartment: 173,
  "urban-services": 120,
  // The latest professional-depth passes add reviewed equipment, medicine,
  // airside, imaging, dispensing and conference-room bands to each facility.
  hospital: 440,
  // The radiology-suite photograph resolves 87 independently pointable
  // imaging, control, preparation and room-hardware parts.
  "radiology-suite": 87,
  "emergency-department": 108,
  "operating-theatre": 109,
  "post-anesthesia-care-unit": 134,
  "intensive-care-unit": 159,
  "pathology-lab": 450,
  "hospital-pharmacy": 390,
  airport: 390,
  // The baggage-claim render supports 95 distinct visible carousel, luggage,
  // arrivals, customs and reception parts without duplicate parent terms.
  "baggage-claim": 95,
  "check-in-counter": 153,
  "baggage-drop-station": 155,
  "security-checkpoint": 103,
  "boarding-gate": 120,
  "aircraft-cabin": 142,
  "aircraft-lavatory": 138,
  "office-building": 390,
  // The service-core render supports 90 distinct visible facility parts while
  // excluding hidden system states, operational claims and duplicate names.
  "service-core": 90,
  "hotel-exterior": 69,
  "hotel-lobby-rooms": 107,
  "supermarket-backroom": 143,
  "supermarket-checkout-station": 144,
  "refrigerated-display-case": 141,
  "supermarket-produce-department": 150,
  "produce-weighing-station": 150,
  "supermarket-walk-in-cooler": 144,
  // The bright gallery resolves separate fossil, optical, robotic, physics and
  // life-science parts; the ceiling blocks roles, venues and signage claims.
  // The final pixel pass also retains separately visible fossil, telescope,
  // microscope, robot, optics and anatomy subparts for a 206-anchor set.
  "science-museum": 206,
  // The final kitchen raster resolves appliance, sink, coffee-nook and island
  // parts; the ceiling blocks cooking processes and hidden appliance claims.
  kitchen: 176,
  // The final raster has clear macro forms, microstructure and one coherent
  // molecular model; the 60-anchor ceiling excludes unsupported chemistry
  // while admitting separately visible edges, junctions and fracture parts.
  polymer: 60,
  // The bright bathroom exposes a full suite of independently pointable
  // fixtures plus readable hardware/textile subparts; the ceiling blocks
  // invisible conditions while allowing the reviewed 133-anchor scene.
  bathroom: 163,
  // The bright bedroom resolves separate bedding, study, window, storage and
  // room-finish parts; the ceiling blocks moods, actions and hidden routines.
  bedroom: 164,
  // The terminal photograph resolves separate rail, bus, access, ticketing and
  // mobility fixtures; the ceiling blocks blank display readings and services.
  "transit-hub": 103,
  // The bright cafe resolves seating, tableware, pastry-display and espresso
  // equipment parts; the ceiling blocks people, branding and inferred service.
  "city-cafe": 130,
  // The bright oak raster resolves separate bark, web, nest, leaf, acorn,
  // root, moss, fern, flower and grass parts; the ceiling blocks invisible
  // biology and synonym padding while retaining the complete Leaf portal.
  "oak-tree": 68,
  "coffee-machine": 60,
  "cotton-shirt": 55,
  // The clear reservoir resolves additional lid, wall, water-surface, filter
  // and base parts without reintroducing hidden sensors or actions.
  "water-tank": 61,
  // The bright pond raster resolves distinct emergent leaves and seed heads,
  // floating-garden parts, water ripples, shallow-water life, bank textures and
  // external frog details; the ceiling blocks absent wildlife and behaviors.
  "pond-edge": 65,
  // The bright frog portrait resolves separate head, skin, limb, toe and
  // supporting-stone details; the ceiling blocks internal anatomy, life stages
  // and behavior that are not visible in the single resting frame.
  frog: 59,
  // The sunlit gallery exposes separate skull, jaw, vertebra, limb, horn,
  // fossil and preparation-tool parts; the ceiling blocks behavior, era,
  // species claims and museum activities that are not visible in one frame.
  "dinosaur-hall": 69,
  // The bright electric-bus cutaway resolves the cabin, entry, running gear
  // and underfloor battery parts; the ceiling blocks passenger roles and
  // operating states that are not visible in a static frame while allowing
  // the reviewed front-entry hardware additions.
  "electric-bus": 85,
  "human-body": 90,
  // The reviewed carriage raster exposes the complete cabin plus distinct
  // door, seat, suspension and foreground track hardware; the ceiling blocks
  // unsupported service claims while allowing the expanded 70-anchor audit.
  "train-carriage": 100,
  // The bright bogie raster resolves frame welds/ribs, wheel and motor
  // subparts, suspension seats, linkage pins and track fasteners; the ceiling
  // blocks maintenance actions, failure states and hidden load concepts.
  "rail-bogie": 95,
  // The final platform raster resolves passenger fixtures, train hardware,
  // overhead electrification and track subparts; the ceiling blocks signage
  // and inferred service states while allowing the reviewed 96-anchor scene.
  "railway-platform": 126,
  // The battery cutaway resolves pack, module, cell, electrical, cooling and
  // enclosure hardware; the ceiling blocks invisible electrochemistry and
  // sensors that cannot be identified as separate objects in this frame.
  battery: 90,
  // The prismatic-cell cutaway resolves terminal seals, tab roots, winding
  // surfaces, sheet folds and collector edges while still excluding invisible
  // electrochemistry and performance claims.
  "lithium-ion-cell": 60,
  // The school-campus crop keeps one bounded label per newly reviewed fixture
  // or part; the ceiling blocks activities, signage and duplicate furniture.
  "school-campus": 73,
  // The bright cutaway resolves chamber walls, individual cusps, connected
  // vessel openings, coronary surface branches and a readable red-cell rim;
  // the ceiling still excludes invisible physiology and conduction claims.
  heart: 91,
  // The bright capillary cutaway resolves endothelial boundaries, distinct
  // red-cell surfaces, a membrane/cytoskeleton mesh, neutrophil granules and
  // platelet projections; the ceiling blocks unsupported immune processes.
  "blood-cell": 91,
  // The bright garden resolves greenhouse fittings, raised-bed crops, tools,
  // compost, rain collection and a flowering border; the ceiling blocks
  // gardening activities and inferred ecological processes.
  "community-garden": 163,
  // The greenhouse raster resolves shell hardware, benches, propagation trays,
  // soil, aisle equipment and the complete tomato portal; the ceiling blocks
  // invisible growing processes and climate claims. The focused propagation
  // crop adds eleven individually visible tray, seedling and pot parts.
  "greenhouse-interior": 112,
  // The close tomato raster resolves external stem, leaf, flower, fruit,
  // support, substrate and pest evidence; the ceiling blocks invisible plant
  // physiology and unsupported underground structures.
  "tomato-plant": 99,
  // The final workbench raster resolves timber joints, containers, seedlings,
  // tool edges and watering fittings; the ceiling blocks actions and claims
  // about plant health or material quality. The focused lower-shelf crop adds
  // twelve visible sack, pot, fibre and shelf parts.
  "potting-workbench": 116,
  // The photographed wardrobe resolves a complete cabinet, garment rack,
  // shirt construction and accessory shelf; the ceiling blocks fabric and
  // stitching claims while allowing the reviewed 60-anchor set.
  "wardrobe-interior": 60,
  // The rendered cell has separable cytoplasm, nuclear, chloroplast and
  // membrane substructures; the ceiling rejects invisible molecular steps.
  // The bright plant-cell cutaway resolves additional ER, Golgi, vacuole,
  // chloroplast, mitochondrion and wall subparts without process padding.
  "plant-cell": 60,
  // The final gas-exchange cutaway resolves airway, alveolar, barrier,
  // capillary, erythrocyte and molecular parts; the ceiling blocks invisible
  // gas metrics and process claims.
  "oxygen-molecule": 90,
  // The alpha2-beta2 render resolves four hemes, colored globin ribbons,
  // central interfaces and one enlarged coordination pocket; the ceiling
  // blocks invisible affinity, disease and binding-behavior claims.
  hemoglobin: 81,
  // The final chloroplast raster resolves separate grana, lamella, DNA,
  // stromal-particle and membrane-complex details without process padding.
  "chloroplast-interior": 51,
};
const MIN_PREMIUM_OVERVIEW_LABELS = 12;
const MIN_PREMIUM_LABELS_PER_LOD = 3;
const MIN_PREMIUM_DETAIL_ZONES = 4;
const MIN_DETAIL_ZONE_LABELS = 4;
const MIN_DETAIL_ZONE_COVERAGE = 0.6;
const PREMIUM_LOD_MINIMUMS: Readonly<Record<string, number>> = {
  "community-garden": 7,
  "greenhouse-interior": 9,
  "tomato-plant": 8,
  "potting-workbench": 9,
  "chloroplast-interior": 7,
};
const PREMIUM_DETAIL_ZONE_MINIMUMS: Readonly<Record<string, number>> = {
  "community-garden": 6,
  "greenhouse-interior": 6,
  "tomato-plant": 5,
  "potting-workbench": 6,
  "chloroplast-interior": 5,
};
const MIN_SPATIAL_LEXICON_LINKS = 180;
const MAX_RASTER_BYTES = 1_228_800;
const RASTER_BUDGET_REFERENCE_AREA = 1_600 * 900;
const VISUAL_REGION_KINDS = new Set<VisualRegionKind>([
  "whole",
  "object",
  "part",
  "diagram",
]);

const FORBIDDEN_UNGROUNDED: Readonly<Record<string, readonly string[]>> = {
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
  "coffee-machine": ["thermostat", "heating coil", "automatic mode", "espresso aroma"],
  "water-tank": [
    "float switch",
    "overflow",
    "pressure sensor",
    "hydrostatic pressure",
    "refill",
    "watertight",
  ],
  "pond-edge": ["heron", "kingfisher", "turtle", "fish jumping", "swimming", "hunting"],
  bedroom: ["sleep", "dream", "cozy", "alarm clock", "slippers"],
  bathroom: ["humidity", "cleanliness", "hot water"],
  "railway-platform": ["bicycle", "drainage channel", "station sign"],
  "electric-bus": [
    "driver",
    "passenger",
    "route number",
    "destination sign",
    "regenerative braking",
    "climate control",
  ],
  "train-carriage": [
    "route display",
    "passenger",
    "intercom",
    "power socket",
    "fire extinguisher",
    "crowded",
  ],
  "rail-bogie": [
    "lubricant",
    "alignment",
    "vibration",
    "accelerate",
    "inspect",
    "misaligned",
    "load bearing",
    "derailment",
  ],
  battery: ["negative terminal", "temperature sensor", "current sensor", "pressure-relief valve"],
  "lithium-ion-cell": [
    "ion migration",
    "electron flow",
    "electrolyte droplet",
    "capacity",
    "cycle life",
    "overcharge",
    "flammable",
  ],
  "city-cafe": ["barista", "brand", "menu text", "aroma", "music", "queue"],
  "dinosaur-hall": ["living dinosaur", "roaring", "predator", "Cretaceous period", "extinction", "paleontologist", "excavation"],
  hemoglobin: ["affinity", "cooperativity", "saturation", "allostery", "anemia", "mutation"],
  heart: [
    "oxygenated blood",
    "deoxygenated blood",
    "electrocardiogram",
    "flow",
    "sinoatrial node",
    "cardiac output",
    "murmur",
    "cardiac cycle",
  ],
  "blood-cell": [
    "antibody",
    "bacteria",
    "oxygen marker",
    "phagocytosis",
    "hematocrit",
    "fibrin",
    "donation",
  ],
  "wardrobe-interior": ["garment", "closet", "buttonhole", "seam", "cotton", "hang up", "denim"],
  "cotton-shirt": [
    "loom",
    "sewing machine",
    "dye",
    "harvest",
    "iron",
    "breathable",
    "shrinkage",
    "absorbency",
  ],
  polymer: ["thermoplastic", "polymerization", "molecular weight", "recycling"],
  "oxygen-molecule": [
    "combustion",
    "oxidation",
    "hypoxia",
    "inhale",
    "electron pair",
    "molecular orbital",
    "type II pneumocyte",
    "smooth muscle",
  ],
  frog: [
    "jump",
    "hibernate",
    "food chain",
    "cricket",
    "tongue",
    "heart",
    "blood vessel",
    "egg mass",
    "polliwog",
  ],
  "community-garden": [
    "volunteering",
    "harvest",
    "sustainability",
    "pollination",
    "composting",
    "organic",
  ],
  "greenhouse-interior": [
    "photosynthesis",
    "humidity",
    "ventilation",
    "germination",
    "growth",
    "watering",
    "temperature",
  ],
  "tomato-plant": [
    "photosynthesis",
    "pollination",
    "ripening",
    "transpiration",
    "nutrient uptake",
    "disease resistance",
    "growth",
  ],
  "potting-workbench": [
    "potting",
    "repotting",
    "watering",
    "tying",
    "pruning",
    "soil fertility",
    "plant growth",
    "sharp",
    "durable",
  ],
};

/** Exact spelling is insufficient when the 10k node selects another sense. */
const FORBIDDEN_CONTEXTUAL_LEXEME_LINKS: Readonly<Record<string, readonly string[]>> = {
  apartment: ["television"],
  battery: ["battery", "module", "cable", "controller"],
  "city-park": ["path", "branch", "picnic"],
  "city-street": ["van", "intersection", "skeleton"],
  "coffee-machine": ["lid", "cable", "screw"],
  "electric-bus": ["seat", "battery"],
  frog: ["pupil", "spots", "heart"],
  heart: ["heart", "chamber"],
  "human-body": ["heart"],
  "lithium-ion-cell": ["tab"],
  "oak-tree": ["branch", "soil"],
  polymer: ["chain", "branch"],
  "railway-platform": ["track"],
  "science-museum": ["globe", "horn", "button"],
  "water-tank": ["reflection", "foot"],
  "world-map": ["path", "table"],
};

function validateAnchorAudit(
  scene: AuditedScene,
  lexiconById: ReadonlyMap<string, SemanticNode>,
): void {
  const { anchorAudit } = scene;
  if (!anchorAudit || anchorAudit.status !== "human-verified") {
    throw new Error(`Scene ${scene.id} has not been human verified against its visual`);
  }
  if (anchorAudit.policy !== "visible-object-or-part-only") {
    throw new Error(`Scene ${scene.id} uses an unsupported anchor policy`);
  }
  if (anchorAudit.reviewedAsset !== scene.asset) {
    throw new Error(`Scene ${scene.id} audit targets ${anchorAudit.reviewedAsset}, not ${scene.asset}`);
  }
  if (anchorAudit.rationale.trim().length < 40) {
    throw new Error(`Scene ${scene.id} needs a substantive visual-audit rationale`);
  }
  if (anchorAudit.retainedLabelCount !== scene.labels.length) {
    throw new Error(`Scene ${scene.id} retained count does not match its labels`);
  }
  if (
    anchorAudit.previousLabelCount - anchorAudit.retainedLabelCount !==
    anchorAudit.removedLabelCount
  ) {
    throw new Error(`Scene ${scene.id} audit counts do not reconcile`);
  }
  if (anchorAudit.removedExamples.length < 3) {
    throw new Error(`Scene ${scene.id} needs representative removed-label evidence`);
  }

  const regionById = new Map<string, VisualRegion>();
  for (const region of scene.visualRegions ?? []) {
    if (!region.id.trim() || regionById.has(region.id)) {
      throw new Error(`Scene ${scene.id} has a blank or duplicate visual region: ${region.id}`);
    }
    if (!VISUAL_REGION_KINDS.has(region.kind)) {
      throw new Error(`Scene ${scene.id}/${region.id} has invalid visual-region kind ${region.kind}`);
    }
    if (region.description.trim().length < 12) {
      throw new Error(`Scene ${scene.id}/${region.id} needs a concrete region description`);
    }
    if (
      !Number.isFinite(region.x) ||
      !Number.isFinite(region.y) ||
      !Number.isFinite(region.width) ||
      !Number.isFinite(region.height) ||
      region.width <= 0 ||
      region.height <= 0 ||
      region.x < 0 ||
      region.y < 0 ||
      region.x + region.width > scene.width ||
      region.y + region.height > scene.height
    ) {
      throw new Error(`Scene ${scene.id}/${region.id} has an invalid visual-region rectangle`);
    }
    regionById.set(region.id, region);
  }
  if (!regionById.size) throw new Error(`Scene ${scene.id} has no audited visual regions`);

  const densityBands = new Set(scene.labels.map((label) => label.minLevel));
  if (!DENSITY_LEVELS.every((level) => densityBands.has(level))) {
    throw new Error(`Scene ${scene.id} does not preserve all five authored zoom bands`);
  }
  const premiumMinimum = PREMIUM_DENSITY_MINIMUMS[scene.id];
  if (premiumMinimum !== undefined) {
    if (scene.labels.length < premiumMinimum) {
      throw new Error(
        `Premium scene ${scene.id} has ${scene.labels.length} labels; expected at least ${premiumMinimum}`,
      );
    }
    const premiumMaximum = PREMIUM_DENSITY_MAXIMUMS[scene.id];
    if (premiumMaximum !== undefined && scene.labels.length > premiumMaximum) {
      throw new Error(
        `Premium scene ${scene.id} has ${scene.labels.length} labels; evidence ceiling is ${premiumMaximum}`,
      );
    }
    const lodCounts = DENSITY_LEVELS.map((level) => (
      scene.labels.filter((label) => label.minLevel === level).length
    ));
    if (lodCounts[0] + lodCounts[1] < MIN_PREMIUM_OVERVIEW_LABELS) {
      throw new Error(`Premium scene ${scene.id} needs at least ${MIN_PREMIUM_OVERVIEW_LABELS} overview labels`);
    }
    const minLabelsPerLod = PREMIUM_LOD_MINIMUMS[scene.id] ?? MIN_PREMIUM_LABELS_PER_LOD;
    if (lodCounts.some((count) => count < minLabelsPerLod)) {
      throw new Error(
        `Premium scene ${scene.id} needs at least ${minLabelsPerLod} labels in every LOD`,
      );
    }
    const detailZones = scene.detailZones ?? [];
    const minDetailZones = PREMIUM_DETAIL_ZONE_MINIMUMS[scene.id] ?? MIN_PREMIUM_DETAIL_ZONES;
    if (detailZones.length < minDetailZones) {
      throw new Error(
        `Premium scene ${scene.id} has ${detailZones.length} detail zones; expected at least ${minDetailZones}`,
      );
    }
    const zonedLabels = new Set<string>();
    for (const zone of detailZones) {
      if (zone.description.trim().length < 24) {
        throw new Error(`Premium scene ${scene.id}/${zone.id} needs a concrete crop description`);
      }
      if (zone.labelIds.length < MIN_DETAIL_ZONE_LABELS) {
        throw new Error(
          `Premium scene ${scene.id}/${zone.id} has ${zone.labelIds.length} words; expected at least ${MIN_DETAIL_ZONE_LABELS}`,
        );
      }
      zone.labelIds.forEach((labelId) => zonedLabels.add(labelId));
    }
    if (zonedLabels.size / scene.labels.length < MIN_DETAIL_ZONE_COVERAGE) {
      throw new Error(
        `Premium scene ${scene.id} assigns only ${zonedLabels.size}/${scene.labels.length} anchors to detail zones`,
      );
    }
  }
  const displayWords = new Set(scene.labels.map((label) => label.word.toLocaleLowerCase()));
  for (const example of anchorAudit.removedExamples) {
    if (displayWords.has(example.toLocaleLowerCase())) {
      throw new Error(`Scene ${scene.id} still displays removed example ${example}`);
    }
  }
  for (const label of scene.labels) {
    if (!label.translation.trim()) throw new Error(`Label ${scene.id}/${label.id} has no translation`);
    if (!/^[a-z][a-z -]*$/i.test(label.word)) {
      throw new Error(`Label ${scene.id}/${label.id} is not a natural English display term`);
    }
    const region = regionById.get(label.sourceVisualRegion);
    if (!region) {
      throw new Error(`Label ${scene.id}/${label.id} references no visual region`);
    }
    if (!pointInside(label.x, label.y, region)) {
      throw new Error(`Label ${scene.id}/${label.id} anchor is outside ${region.id}`);
    }
    if (label.lexemeId) {
      const lexeme = lexiconById.get(label.lexemeId);
      if (!lexeme) {
        throw new Error(`Label ${scene.id}/${label.id} references unknown 10k lexeme ${label.lexemeId}`);
      }
      if (normalizeWord(lexeme.word) !== normalizeWord(label.word)) {
        throw new Error(
          `Label ${scene.id}/${label.id} says ${label.word}, but ${label.lexemeId} is ${lexeme.word}`,
        );
      }
    }
  }
  for (const labelId of FORBIDDEN_CONTEXTUAL_LEXEME_LINKS[scene.id] ?? []) {
    if (scene.labels.find((label) => label.id === labelId)?.lexemeId) {
      throw new Error(`Label ${scene.id}/${labelId} restored a known wrong-sense 10k link`);
    }
  }
  for (const portal of scene.portals) {
    if (!portal.translation?.trim()) throw new Error(`Portal ${scene.id}/${portal.id} has no translation`);
    const region = regionById.get(portal.sourceVisualRegion);
    if (!region) {
      throw new Error(`Portal ${scene.id}/${portal.id} references no visual region`);
    }
    if (!rectangleInside(portal, region)) {
      throw new Error(`Portal ${scene.id}/${portal.id} is outside ${region.id}`);
    }
  }
}

function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function pointInside(x: number, y: number, region: VisualRegion): boolean {
  return (
    x >= region.x &&
    x <= region.x + region.width &&
    y >= region.y &&
    y <= region.y + region.height
  );
}

function rectangleInside(
  rectangle: Pick<Portal, "x" | "y" | "width" | "height">,
  region: VisualRegion,
): boolean {
  return (
    rectangle.x >= region.x &&
    rectangle.y >= region.y &&
    rectangle.x + rectangle.width <= region.x + region.width &&
    rectangle.y + rectangle.height <= region.y + region.height
  );
}

function readJpegDimensions(asset: Buffer): { width: number; height: number } {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < asset.length) {
    if (asset[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = asset[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > asset.length) break;
    const segmentLength = asset.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > asset.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: asset.readUInt16BE(offset + 3),
        width: asset.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new Error("JPEG has no readable frame dimensions");
}

async function validateSceneAssetFile(
  scene: AuditedScene,
  descriptor: ReturnType<typeof resolveSceneAssets>[number],
): Promise<number> {
  const assetPath = resolve(publicRoot, descriptor.src.replace(/^\//, ""));
  const assetStat = await stat(assetPath);
  if (!assetStat.isFile()) throw new Error(`Missing scene asset: ${descriptor.src}`);
  const asset = await readFile(assetPath);
  let decodedDimensions = { width: descriptor.width, height: descriptor.height };
  if (descriptor.src.endsWith(".svg")) {
    const source = asset.toString("utf8");
    const expectedViewBox = `viewBox="0 0 ${descriptor.width} ${descriptor.height}"`;
    if (!source.includes(expectedViewBox)) {
      throw new Error(`Asset ${descriptor.src} has the wrong viewBox`);
    }
    if (!source.includes("<title") || !source.includes("<desc")) {
      throw new Error(`Asset ${descriptor.src} needs an accessible title and description`);
    }
  } else if (descriptor.src.endsWith(".jpg") || descriptor.src.endsWith(".jpeg")) {
    if (asset[0] !== 0xff || asset[1] !== 0xd8 || asset[2] !== 0xff) {
      throw new Error(`Asset ${descriptor.src} is not a valid JPEG`);
    }
    decodedDimensions = readJpegDimensions(asset);
    // Keep a stable byte-per-source-pixel budget. Logical canvases can be much
    // larger than a base preview raster, so dividing by scene dimensions would
    // incorrectly punish large continuous atlases at every resolution tier.
    const sourceAreaRatio = descriptor.width * descriptor.height / RASTER_BUDGET_REFERENCE_AREA;
    const maximumBytes = Math.ceil(MAX_RASTER_BYTES * sourceAreaRatio);
    if (assetStat.size > maximumBytes) {
      throw new Error(`Asset ${descriptor.src} exceeds the ${maximumBytes}-byte density-adjusted raster budget`);
    }
  } else {
    throw new Error(`Unsupported scene asset type: ${descriptor.src}`);
  }

  const requiredSha256 = descriptor.sha256
    || (descriptor.tier === "base" && scene.id in PREMIUM_DENSITY_MINIMUMS
      ? scene.anchorAudit.reviewedAssetSha256
      : undefined);
  if (scene.assets || (descriptor.tier === "base" && scene.id in PREMIUM_DENSITY_MINIMUMS)) {
    if (!requiredSha256?.match(/^[a-f0-9]{64}$/)) {
      throw new Error(`Scene ${scene.id}/${descriptor.tier} needs a reviewed SHA-256`);
    }
  }
  assertSceneAssetIntegrity(
    { ...descriptor, sha256: requiredSha256 },
    {
      ...decodedDimensions,
      sha256: createHash("sha256").update(asset).digest("hex"),
    },
  );
  if (
    descriptor.tier === "base"
    && scene.anchorAudit.reviewedAssetSha256
    && descriptor.sha256
    && descriptor.sha256 !== scene.anchorAudit.reviewedAssetSha256
  ) {
    throw new Error(`Scene ${scene.id} base descriptor and anchor-audit hashes disagree`);
  }
  return assetStat.size;
}

async function main() {
  const manifestBytes = await readFile(resolve(dataRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as SceneManifest;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported scene manifest schema");
  if (!manifest.rootSceneId) throw new Error("Scene manifest has no root");

  const semanticRoot = resolve(projectRoot, "public/data/semantic");
  const semanticManifest = JSON.parse(
    await readFile(resolve(semanticRoot, "manifest.json"), "utf8"),
  ) as SemanticManifest;
  const semanticShards = await Promise.all(
    semanticManifest.shards.map(async ({ path }) => (
      JSON.parse(await readFile(resolve(semanticRoot, path), "utf8")) as { nodes: SemanticNode[] }
    )),
  );
  const lexiconById = new Map(
    semanticShards.flatMap(({ nodes }) => nodes).map((node) => [node.id, node] as const),
  );
  if (lexiconById.size !== semanticManifest.entryCount || lexiconById.size !== 10_000) {
    throw new Error(`Spatial crosswalk loaded ${lexiconById.size} lexemes; expected the complete 10,000`);
  }

  const scenes = await Promise.all(
    manifest.scenes.map(async (manifestScene) => {
      const { id } = manifestScene;
      const bytes = await readFile(resolve(dataRoot, `${id}.json`));
      const scene = JSON.parse(bytes.toString("utf8")) as AuditedScene;
      if (scene.id !== id) throw new Error(`Scene file ID mismatch: ${id}`);
      if (scene.title !== manifestScene.title) {
        throw new Error(`Manifest title mismatch for ${id}`);
      }
      if ((scene.parentId ?? null) !== manifestScene.parentId) {
        throw new Error(`Manifest parent mismatch for ${id}`);
      }
      if (!scene.translation?.trim()) throw new Error(`Scene ${id} has no translation`);
      validateAnchorAudit(scene, lexiconById);
      const displayWords = scene.labels.map((label) => label.word.toLocaleLowerCase());
      if (new Set(displayWords).size !== displayWords.length) {
        throw new Error(`Scene ${id} repeats a display term`);
      }
      for (const forbidden of FORBIDDEN_UNGROUNDED[id] ?? []) {
        if (displayWords.includes(forbidden)) {
          throw new Error(`Scene ${id} contains a known ungrounded label: ${forbidden}`);
        }
      }
      const assetBytes = (await Promise.all(
        resolveSceneAssets(scene).map((descriptor) => validateSceneAssetFile(scene, descriptor)),
      )).reduce((sum, bytes) => sum + bytes, 0);
      return { scene, assetBytes };
    }),
  );

  assertValidSceneGraph(scenes.map(({ scene }) => scene));
  const root = scenes.find(({ scene }) => scene.id === manifest.rootSceneId)?.scene;
  if (!root || root.parentId != null) throw new Error("Manifest root is not a root scene");
  if (scenes.length < MIN_MATURE_SCENES) {
    throw new Error(`World has ${scenes.length} scenes; expected at least ${MIN_MATURE_SCENES}`);
  }
  const labelCount = scenes.reduce((sum, { scene }) => sum + scene.labels.length, 0);
  const linkedLabelCount = scenes.reduce(
    (sum, { scene }) => sum + scene.labels.filter((label) => Boolean(label.lexemeId)).length,
    0,
  );
  const detailZoneCount = scenes.reduce(
    (sum, { scene }) => sum + (scene.detailZones?.length ?? 0),
    0,
  );
  if (linkedLabelCount < MIN_SPATIAL_LEXICON_LINKS) {
    throw new Error(
      `Only ${linkedLabelCount} spatial anchors are cross-linked to the 10k lexicon; expected at least ${MIN_SPATIAL_LEXICON_LINKS}`,
    );
  }
  if (root.portals.length < MIN_ROOT_BRANCHES) {
    throw new Error(`World root has ${root.portals.length} branches; expected at least ${MIN_ROOT_BRANCHES}`);
  }
  const portalCount = scenes.reduce((sum, { scene }) => sum + scene.portals.length, 0);
  if (portalCount !== scenes.length - 1) {
    throw new Error("The world must remain a deterministic tree with one portal per non-root scene");
  }

  const sceneById = new Map(scenes.map(({ scene }) => [scene.id, scene]));
  const descendants = (id: string): number => {
    const scene = sceneById.get(id);
    if (!scene) return 0;
    return 1 + scene.portals.reduce((sum, portal) => sum + descendants(portal.childSceneId), 0);
  };
  const branchCoverage = Object.fromEntries(
    root.portals.map((portal) => [portal.childSceneId, descendants(portal.childSceneId)]),
  );
  const matureRootBranchCount = Object.values(branchCoverage).filter(
    (count) => count >= MIN_SCENES_PER_MATURE_ROOT_BRANCH,
  ).length;
  if (matureRootBranchCount < MIN_MATURE_ROOT_BRANCHES) {
    throw new Error(
      `World has ${matureRootBranchCount} mature root branches; expected at least ${MIN_MATURE_ROOT_BRANCHES}`,
    );
  }

  const leafPaths: string[][] = [];
  const collectLeafPaths = (id: string, path: string[]) => {
    const current = sceneById.get(id);
    if (!current) return;
    const nextPath = [...path, id];
    if (!current.portals.length) {
      leafPaths.push(nextPath);
      return;
    }
    current.portals.forEach((portal) => collectLeafPaths(portal.childSceneId, nextPath));
  };
  collectLeafPaths(root.id, []);
  const deepPaths = leafPaths.filter((path) => path.length >= MIN_DEEP_PATH_SCENES);
  if (deepPaths.length < MIN_DEEP_PATHS) {
    throw new Error(`World has ${deepPaths.length} deep leaf paths; expected at least ${MIN_DEEP_PATHS}`);
  }

  const previousLabelCount = scenes.reduce(
    (sum, { scene }) => sum + scene.anchorAudit.previousLabelCount,
    0,
  );
  const removedLabelCount = scenes.reduce(
    (sum, { scene }) => sum + scene.anchorAudit.removedLabelCount,
    0,
  );
  const report = {
    schemaVersion: 1,
    rootSceneId: manifest.rootSceneId,
    sceneCount: scenes.length,
    labelCount,
    linkedLabelCount,
    detailZoneCount,
    previousLabelCount,
    removedLabelCount,
    anchorVerifiedCount: labelCount,
    minLabelsPerScene: Math.min(...scenes.map(({ scene }) => scene.labels.length)),
    maxLabelsPerScene: Math.max(...scenes.map(({ scene }) => scene.labels.length)),
    portalCount,
    rootBranchCount: root.portals.length,
    branchCoverage,
    deepPathCount: deepPaths.length,
    deepestPath: leafPaths.sort((a, b) => b.length - a.length)[0],
    uniqueDisplayWordCount: new Set(scenes.flatMap(({ scene }) => scene.labels.map((label) => label.word.toLocaleLowerCase()))).size,
    assetBytes: scenes.reduce((sum, { assetBytes }) => sum + assetBytes, 0),
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  };
  await mkdir(resolve(projectRoot, "artifacts/correctness"), { recursive: true });
  await writeFile(
    resolve(projectRoot, "artifacts/correctness/scene-integrity.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

await main();
