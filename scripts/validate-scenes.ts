import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertValidSceneGraph, type Scene } from "../app/domain/index";

interface SceneManifest {
  schemaVersion: number;
  rootSceneId: string;
  scenes: Array<{ id: string; title: string; parentId: string | null }>;
}

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "public/data/scenes");
const publicRoot = resolve(projectRoot, "public");
const MIN_MATURE_SCENES = 30;
const MIN_NATURAL_ANCHORS = 1_600;
const MIN_ROOT_BRANCHES = 3;
const MIN_LABELS_PER_SCENE = 48;
const MAX_LABELS_PER_SCENE = 80;
const MIN_DEEP_PATHS = 6;
const MIN_DEEP_PATH_SCENES = 5;
const DENSITY_LEVELS = [0, 1, 2, 3, 4] as const;

const TOPIC_SIGNATURES: Readonly<Record<string, readonly string[]>> = {
  "world-map": ["apartment", "station", "oak", "harbor", "natural"],
  apartment: ["living room", "kitchen", "bedroom", "bathroom", "sofa"],
  kitchen: ["stove", "sink", "spatula", "sharp", "recipe"],
  "coffee-machine": ["coffee machine", "boiler", "grinder", "chamber", "automatic"],
  "water-tank": ["tank", "inlet", "outlet", "float switch", "hydrostatic pressure"],
  polymer: ["polymer", "chain", "polymerization", "thermoplastic", "molecular weight"],
  bedroom: ["bedroom", "duvet", "wardrobe", "sleep", "curtain rod"],
  "wardrobe-interior": ["wardrobe", "garment", "zipper", "hang up", "denim"],
  "cotton-shirt": ["cotton shirt", "yarn", "weave", "sewing machine", "breathable"],
  "city-street": ["street", "crosswalk", "storefront", "traffic lane", "fire hydrant"],
  "transit-hub": ["terminal", "platform", "ticket machine", "fare gate", "railway platform"],
  "electric-bus": ["electric bus", "battery", "charging port", "traction motor", "regenerative braking"],
  battery: ["battery", "cell", "anode", "cathode", "busbar"],
  "lithium-ion-cell": ["lithium ion cell", "electrode", "graphite", "ion migration", "cycle life"],
  "railway-platform": ["rail", "platform", "ballast", "mind the gap", "timetable"],
  "train-carriage": ["train carriage", "seatback", "overhead rack", "emergency hammer", "rail journey"],
  "rail-bogie": ["rail bogie", "wheelset", "suspension spring", "traction motor", "friction"],
  "science-museum": ["exhibit", "microscope", "human body", "planetarium", "curator"],
  "human-body": ["body", "brain", "heart", "nervous system", "spinal cord"],
  heart: ["heart", "atrium", "ventricle", "mitral valve", "systole"],
  "blood-cell": ["blood cell", "red blood cell", "platelet", "hemoglobin", "phagocytosis"],
  hemoglobin: ["hemoglobin", "heme", "globin", "oxygen binding site", "oxyhemoglobin"],
  "oxygen-molecule": ["oxygen molecule", "covalent bond", "alveolus", "dissolved oxygen", "essential"],
  "city-park": ["park", "pond", "playground", "walking trail", "pond edge"],
  "oak-tree": ["oak", "tree", "trunk", "acorn", "growth ring"],
  leaf: ["leaf", "vein", "stomata", "xylem", "chloroplast interior"],
  "plant-cell": ["cell", "nucleus", "vacuole", "chloroplast", "golgi apparatus"],
  "chloroplast-interior": ["chloroplast interior", "thylakoid", "granum", "photosystem", "calvin cycle"],
  "pond-edge": ["pond edge", "reed", "lily pad", "tadpole", "freshwater"],
  frog: ["frog", "amphibian", "webbed foot", "metamorphosis", "hibernate"],
};

const FORBIDDEN_FILLERS: Readonly<Record<string, readonly string[]>> = {
  kitchen: ["sleep", "upstairs", "cotton", "leather"],
  bedroom: ["cook", "stove", "boiler", "battery"],
  "coffee-machine": ["heart", "lung", "bedroom"],
  polymer: ["bedroom", "sleep", "passenger", "heart"],
  "train-carriage": ["chloroplast", "polymer", "stomach"],
  "oxygen-molecule": ["leather", "synthetic", "sofa", "passenger"],
  "plant-cell": ["passenger", "brake", "sofa"],
  frog: ["battery", "sofa", "rail"],
};

const CONTEXT_TRANSLATIONS = [
  ["world-map", "natural", "自然的"],
  ["kitchen", "sharp", "锋利的"],
  ["coffee-machine", "chamber", "腔室"],
  ["coffee-machine", "automatic", "自动运行的"],
  ["heart", "chamber", "心腔"],
] as const;

async function main() {
  const manifestBytes = await readFile(resolve(dataRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as SceneManifest;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported scene manifest schema");
  if (!manifest.rootSceneId) throw new Error("Scene manifest has no root");

  const scenes = await Promise.all(
    manifest.scenes.map(async (manifestScene) => {
      const { id } = manifestScene;
      const bytes = await readFile(resolve(dataRoot, `${id}.json`));
      const scene = JSON.parse(bytes.toString("utf8")) as Scene;
      if (scene.id !== id) throw new Error(`Scene file ID mismatch: ${id}`);
      if (scene.title !== manifestScene.title) {
        throw new Error(`Manifest title mismatch for ${id}`);
      }
      if ((scene.parentId ?? null) !== manifestScene.parentId) {
        throw new Error(`Manifest parent mismatch for ${id}`);
      }
      const assetPath = resolve(publicRoot, scene.asset.replace(/^\//, ""));
      const assetStat = await stat(assetPath);
      if (!assetStat.isFile()) throw new Error(`Missing scene asset: ${scene.asset}`);
      if (scene.labels.length > MAX_LABELS_PER_SCENE) {
        throw new Error(`Scene ${id} exceeds the ${MAX_LABELS_PER_SCENE}-anchor content budget`);
      }
      if (scene.labels.length < MIN_LABELS_PER_SCENE) {
        throw new Error(`Scene ${id} has fewer than ${MIN_LABELS_PER_SCENE} curated anchors`);
      }
      if (!scene.translation?.trim()) throw new Error(`Scene ${id} has no translation`);
      const densityBands = new Set(scene.labels.map((label) => label.minLevel));
      if (!DENSITY_LEVELS.every((level) => densityBands.has(level))) {
        throw new Error(`Scene ${id} does not cover all five label-density bands`);
      }
      const firstThreeBands = scene.labels.filter((label) => (label.minLevel ?? 0) <= 2).length;
      if (firstThreeBands < 36) {
        throw new Error(`Scene ${id} has only ${firstThreeBands} anchors through density level 2`);
      }
      const displayWords = scene.labels.map((label) => label.word.toLocaleLowerCase());
      if (new Set(displayWords).size !== displayWords.length) {
        throw new Error(`Scene ${id} repeats a display term`);
      }
      const signature = TOPIC_SIGNATURES[id];
      if (!signature) throw new Error(`Scene ${id} has no authored topic signature`);
      const signatureHits = signature.filter((term) => displayWords.includes(term)).length;
      if (signatureHits / signature.length < 0.8) {
        throw new Error(`Scene ${id} covers only ${signatureHits}/${signature.length} signature terms`);
      }
      for (const forbidden of FORBIDDEN_FILLERS[id] ?? []) {
        if (displayWords.includes(forbidden)) throw new Error(`Scene ${id} contains cross-topic filler: ${forbidden}`);
      }
      for (const label of scene.labels) {
        if (!label.translation.trim()) throw new Error(`Label ${id}/${label.id} has no translation`);
        if (!/^[a-z][a-z -]*$/i.test(label.word)) {
          throw new Error(`Label ${id}/${label.id} is not a natural English display term`);
        }
      }
      for (const portal of scene.portals) {
        if (!portal.translation?.trim()) throw new Error(`Portal ${id}/${portal.id} has no translation`);
      }
      const asset = await readFile(assetPath);
      if (scene.asset.endsWith(".svg")) {
        const source = asset.toString("utf8");
        const expectedViewBox = `viewBox="0 0 ${scene.width} ${scene.height}"`;
        if (!source.includes(expectedViewBox)) throw new Error(`Asset ${scene.asset} has the wrong viewBox`);
        if (!source.includes("<title") || !source.includes("<desc")) {
          throw new Error(`Asset ${scene.asset} needs an accessible title and description`);
        }
      } else if (scene.asset.endsWith(".jpg") || scene.asset.endsWith(".jpeg")) {
        if (asset[0] !== 0xff || asset[1] !== 0xd8 || asset[2] !== 0xff) {
          throw new Error(`Asset ${scene.asset} is not a valid JPEG`);
        }
      } else {
        throw new Error(`Unsupported scene asset type: ${scene.asset}`);
      }
      return { scene, assetBytes: assetStat.size };
    }),
  );

  assertValidSceneGraph(scenes.map(({ scene }) => scene));
  const root = scenes.find(({ scene }) => scene.id === manifest.rootSceneId)?.scene;
  if (!root || root.parentId != null) throw new Error("Manifest root is not a root scene");
  if (scenes.length < MIN_MATURE_SCENES) {
    throw new Error(`World has ${scenes.length} scenes; expected at least ${MIN_MATURE_SCENES}`);
  }
  const labelCount = scenes.reduce((sum, { scene }) => sum + scene.labels.length, 0);
  if (labelCount < MIN_NATURAL_ANCHORS) {
    throw new Error(`World has ${labelCount} anchors; expected at least ${MIN_NATURAL_ANCHORS}`);
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
  if (Object.values(branchCoverage).some((count) => count < 4)) {
    throw new Error("Every root branch must contain at least four explorable scene levels");
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

  for (const [sceneId, word, expected] of CONTEXT_TRANSLATIONS) {
    const actual = sceneById.get(sceneId)?.labels.find((label) => label.word === word)?.translation;
    if (actual !== expected) {
      throw new Error(`Context translation ${sceneId}/${word} is ${JSON.stringify(actual)}; expected ${expected}`);
    }
  }

  const report = {
    schemaVersion: 1,
    rootSceneId: manifest.rootSceneId,
    sceneCount: scenes.length,
    labelCount,
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
