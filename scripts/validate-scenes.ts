import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertValidSceneGraph,
  type Label,
  type Portal,
  type Scene,
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
  labels: AuditedLabel[];
  portals: AuditedPortal[];
}

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "public/data/scenes");
const publicRoot = resolve(projectRoot, "public");
const MIN_MATURE_SCENES = 30;
const MIN_ROOT_BRANCHES = 3;
const MIN_DEEP_PATHS = 6;
const MIN_DEEP_PATH_SCENES = 5;
const DENSITY_LEVELS = [0, 1, 2, 3, 4] as const;
const PREMIUM_DENSITY_MINIMUMS: Readonly<Record<string, number>> = {
  kitchen: 36,
  "science-museum": 28,
  "oak-tree": 32,
  leaf: 28,
  "plant-cell": 28,
  "chloroplast-interior": 24,
};
const MIN_PREMIUM_OVERVIEW_LABELS = 12;
const MIN_PREMIUM_LABELS_PER_LOD = 3;
const MAX_RASTER_BYTES = 1_228_800;
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
  bedroom: ["sleep", "dream", "cozy", "alarm clock", "slippers"],
  polymer: ["thermoplastic", "polymerization", "molecular weight", "recycling"],
  "oxygen-molecule": ["combustion", "oxidation", "hypoxia", "inhale"],
  frog: ["jump", "hibernate", "food chain", "cricket"],
};

function validateAnchorAudit(scene: AuditedScene): void {
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
    const lodCounts = DENSITY_LEVELS.map((level) => (
      scene.labels.filter((label) => label.minLevel === level).length
    ));
    if (lodCounts[0] + lodCounts[1] < MIN_PREMIUM_OVERVIEW_LABELS) {
      throw new Error(`Premium scene ${scene.id} needs at least ${MIN_PREMIUM_OVERVIEW_LABELS} overview labels`);
    }
    if (lodCounts.some((count) => count < MIN_PREMIUM_LABELS_PER_LOD)) {
      throw new Error(
        `Premium scene ${scene.id} needs at least ${MIN_PREMIUM_LABELS_PER_LOD} labels in every LOD`,
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

async function main() {
  const manifestBytes = await readFile(resolve(dataRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as SceneManifest;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported scene manifest schema");
  if (!manifest.rootSceneId) throw new Error("Scene manifest has no root");

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
      const assetPath = resolve(publicRoot, scene.asset.replace(/^\//, ""));
      const assetStat = await stat(assetPath);
      if (!assetStat.isFile()) throw new Error(`Missing scene asset: ${scene.asset}`);
      if (!scene.translation?.trim()) throw new Error(`Scene ${id} has no translation`);
      validateAnchorAudit(scene);
      const displayWords = scene.labels.map((label) => label.word.toLocaleLowerCase());
      if (new Set(displayWords).size !== displayWords.length) {
        throw new Error(`Scene ${id} repeats a display term`);
      }
      for (const forbidden of FORBIDDEN_UNGROUNDED[id] ?? []) {
        if (displayWords.includes(forbidden)) {
          throw new Error(`Scene ${id} contains a known ungrounded label: ${forbidden}`);
        }
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
        const dimensions = readJpegDimensions(asset);
        if (dimensions.width !== scene.width || dimensions.height !== scene.height) {
          throw new Error(
            `Asset ${scene.asset} is ${dimensions.width}x${dimensions.height}; expected ${scene.width}x${scene.height}`,
          );
        }
        if (assetStat.size > MAX_RASTER_BYTES) {
          throw new Error(`Asset ${scene.asset} exceeds the ${MAX_RASTER_BYTES}-byte raster budget`);
        }
        if (scene.asset.includes("-premium-v2.")) {
          if (!scene.anchorAudit.reviewedAssetSha256?.match(/^[a-f0-9]{64}$/)) {
            throw new Error(`Scene ${scene.id} needs a reviewed SHA-256 for its premium-v2 asset`);
          }
          const assetSha256 = createHash("sha256").update(asset).digest("hex");
          if (assetSha256 !== scene.anchorAudit.reviewedAssetSha256) {
            throw new Error(`Scene ${scene.id} audit hash does not match ${scene.asset}`);
          }
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
