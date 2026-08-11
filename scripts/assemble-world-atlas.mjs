#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_SCENE_ROOT = resolve(PROJECT_ROOT, "public/data/scenes");
const DEFAULT_SEMANTIC_ROOT = resolve(PROJECT_ROOT, "public/data/semantic");
const CANVAS = Object.freeze({ width: 1600, height: 900 });
const REGION_SIZE = 32;
const BASE_ASSET = Object.freeze({
  src: "/scenes/world-atlas-master-1600-v2.jpg",
  width: 1600,
  height: 900,
  sha256: "d7e918e18d31b62fc31386776ffc242c9fefae6c359ae64bf1e9965b491cb008",
});
const HIGH_ASSET = Object.freeze({
  src: "/scenes/world-atlas-master-3200-v2.jpg",
  width: 3200,
  height: 1800,
  sha256: "c5fa38cd83c57d2864ee2a1c668e1518a28c8cee77639f5c4b2db875c53c5ded",
});
const REMOVED_EXAMPLES = Object.freeze([
  "unverified activity",
  "hidden mechanism",
  "duplicate synonym",
]);
const PORTALS = Object.freeze([
  {
    id: "enter-home",
    label: "Explore home",
    translation: "探索家园",
    childSceneId: "apartment",
    sourceVisualRegion: "portal-home",
    x: 160,
    y: 45,
    width: 355,
    height: 275,
    enterScale: 3.6,
    regionDescription: "Complete apartment landmark and its visible rooms in the home district",
  },
  {
    id: "enter-city",
    label: "Explore the city",
    translation: "探索城市",
    childSceneId: "city-street",
    sourceVisualRegion: "portal-city",
    x: 965,
    y: 140,
    width: 560,
    height: 280,
    enterScale: 3.6,
    regionDescription: "Complete civic, museum and transit landmark group in the city district",
  },
  {
    id: "enter-nature",
    label: "Explore nature",
    translation: "探索自然",
    childSceneId: "city-park",
    sourceVisualRegion: "portal-nature",
    x: 1080,
    y: 475,
    width: 475,
    height: 380,
    enterScale: 3.6,
    regionDescription: "Complete oak, wetland, path and pond landmark group in the nature district",
  },
  {
    id: "enter-community-garden",
    label: "Enter the community garden",
    translation: "进入社区花园",
    childSceneId: "community-garden",
    sourceVisualRegion: "portal-community-garden",
    x: 80,
    y: 470,
    width: 545,
    height: 325,
    enterScale: 3.6,
    regionDescription: "Complete greenhouse, workbench and raised-bed community garden",
  },
]);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, path) {
  if (!isRecord(value)) fail(path, "expected a JSON object");
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(path, "expected a non-empty string");
  return value.trim();
}

function requireNumber(value, path, minimum, maximum) {
  if (!Number.isFinite(value)) fail(path, "expected a finite number");
  if (value < minimum || value > maximum) {
    fail(path, `expected a number from ${minimum} through ${maximum}; received ${value}`);
  }
  return value;
}

function requireRectangle(value, path) {
  const rectangle = {
    x: requireNumber(value.x, `${path}.x`, 0, CANVAS.width),
    y: requireNumber(value.y, `${path}.y`, 0, CANVAS.height),
    width: requireNumber(value.width, `${path}.width`, Number.MIN_VALUE, CANVAS.width),
    height: requireNumber(value.height, `${path}.height`, Number.MIN_VALUE, CANVAS.height),
  };
  if (rectangle.x + rectangle.width > CANVAS.width) {
    fail(path, `rectangle ends at x=${rectangle.x + rectangle.width}, beyond ${CANVAS.width}`);
  }
  if (rectangle.y + rectangle.height > CANVAS.height) {
    fail(path, `rectangle ends at y=${rectangle.y + rectangle.height}, beyond ${CANVAS.height}`);
  }
  return rectangle;
}

function normalizeWord(word) {
  return word.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function pointInside(point, rectangle) {
  return point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height;
}

function parseZone(rawValue, path, authoredBatch) {
  const raw = requireRecord(rawValue, path);
  const targetScale = raw.targetScale === undefined
    ? 3
    : requireNumber(raw.targetScale, `${path}.targetScale`, 1.000001, 4);
  const description = requireText(raw.description, `${path}.description`);
  if (description.length < 24) {
    fail(`${path}.description`, "expected a concrete description of at least 24 characters");
  }
  let authoredLabelIds;
  if (raw.labelIds !== undefined) {
    authoredLabelIds = requireArray(raw.labelIds, `${path}.labelIds`).map((id, index) => (
      requireText(id, `${path}.labelIds[${index}]`)
    ));
    if (new Set(authoredLabelIds).size !== authoredLabelIds.length) {
      fail(`${path}.labelIds`, "contains a duplicate anchor id");
    }
  }
  return {
    id: requireText(raw.id, `${path}.id`),
    title: requireText(raw.title, `${path}.title`),
    translation: requireText(raw.translation, `${path}.translation`),
    description,
    ...requireRectangle(raw, path),
    targetScale,
    authoredLabelIds,
    authoredAt: path,
    authoredBatch,
  };
}

function parseAnchor(rawValue, path, authoredBatch) {
  const raw = requireRecord(rawValue, path);
  if (raw.zone !== undefined && raw.zoneId !== undefined && raw.zone !== raw.zoneId) {
    fail(path, `zone (${JSON.stringify(raw.zone)}) conflicts with zoneId (${JSON.stringify(raw.zoneId)})`);
  }
  const rawLod = raw.lod ?? raw.minLevel;
  if (raw.lod !== undefined && raw.minLevel !== undefined && raw.lod !== raw.minLevel) {
    fail(path, `lod (${raw.lod}) conflicts with minLevel (${raw.minLevel})`);
  }
  if (!Number.isInteger(rawLod) || rawLod < 0 || rawLod > 4) {
    fail(`${path}.lod`, `expected an integer from 0 through 4; received ${JSON.stringify(rawLod)}`);
  }
  const regionKind = raw.kind ?? (
    rawLod === 0 ? "whole" : rawLod >= 3 ? "part" : "object"
  );
  if (!["whole", "object", "part", "diagram"].includes(regionKind)) {
    fail(
      `${path}.kind`,
      `expected "whole", "object", "part" or "diagram"; received ${JSON.stringify(regionKind)}`,
    );
  }
  let lexemeId;
  if (raw.lexemeId !== undefined) {
    lexemeId = requireText(raw.lexemeId, `${path}.lexemeId`);
    if (!/^en-[a-f0-9]{16}$/u.test(lexemeId)) {
      fail(`${path}.lexemeId`, `expected a stable en-<16 lowercase hex> id; received ${JSON.stringify(lexemeId)}`);
    }
  }
  const word = requireText(raw.word, `${path}.word`);
  if (!/^[a-z][a-z -]*$/i.test(word)) {
    fail(`${path}.word`, `expected a natural English display term matching /^[a-z][a-z -]*$/i; received ${JSON.stringify(word)}`);
  }
  return {
    id: requireText(raw.id, `${path}.id`),
    word,
    translation: requireText(raw.translation, `${path}.translation`),
    x: requireNumber(raw.x, `${path}.x`, 0, CANVAS.width),
    y: requireNumber(raw.y, `${path}.y`, 0, CANVAS.height),
    lod: rawLod,
    zoneId: requireText(raw.zoneId ?? raw.zone, `${path}.zoneId`),
    kind: regionKind,
    lexemeId,
    authoredAt: path,
    authoredBatch,
  };
}

/**
 * Merge and validate independently authored atlas batches. Paths are
 * retained only for actionable diagnostics and never enter generated JSON.
 */
export function mergeAtlasBatches(batchDocuments) {
  if (!Array.isArray(batchDocuments) || batchDocuments.length < 1) {
    throw new Error(`Expected at least one atlas batch; received ${batchDocuments?.length ?? 0}`);
  }
  const zones = [];
  const anchors = [];
  for (const [batchIndex, document] of batchDocuments.entries()) {
    const batchPath = document?.path || `<batch ${batchIndex + 1}>`;
    const batch = requireRecord(document?.data, batchPath);
    for (const [index, rawZone] of requireArray(batch.zones, `${batchPath}.zones`).entries()) {
      zones.push(parseZone(rawZone, `${batchPath}.zones[${index}]`, batchPath));
    }
    for (const [index, rawAnchor] of requireArray(batch.anchors, `${batchPath}.anchors`).entries()) {
      anchors.push(parseAnchor(rawAnchor, `${batchPath}.anchors[${index}]`, batchPath));
    }
  }
  if (!zones.length) throw new Error("Atlas batches contain no zones");
  if (!anchors.length) throw new Error("Atlas batches contain no anchors");

  const zoneById = new Map();
  for (const zone of zones) {
    const previous = zoneById.get(zone.id);
    if (previous) fail(zone.authoredAt, `duplicate zone id ${JSON.stringify(zone.id)}; first used at ${previous.authoredAt}`);
    zoneById.set(zone.id, zone);
  }

  const anchorById = new Map();
  const anchorByWord = new Map();
  for (const anchor of anchors) {
    const previousId = anchorById.get(anchor.id);
    if (previousId) {
      fail(anchor.authoredAt, `duplicate anchor id ${JSON.stringify(anchor.id)}; first used at ${previousId.authoredAt}`);
    }
    anchorById.set(anchor.id, anchor);
    const normalizedWord = normalizeWord(anchor.word);
    const previousWord = anchorByWord.get(normalizedWord);
    if (previousWord) {
      fail(
        anchor.authoredAt,
        `duplicate word ${JSON.stringify(anchor.word)} (normalized as ${JSON.stringify(normalizedWord)}); first used at ${previousWord.authoredAt}`,
      );
    }
    anchorByWord.set(normalizedWord, anchor);

    const zone = zoneById.get(anchor.zoneId);
    if (!zone) fail(anchor.authoredAt, `references unknown zone ${JSON.stringify(anchor.zoneId)}`);
    if (!pointInside(anchor, zone)) {
      fail(
        anchor.authoredAt,
        `point (${anchor.x}, ${anchor.y}) is outside zone ${JSON.stringify(zone.id)} `
          + `[${zone.x}, ${zone.y}, ${zone.width}, ${zone.height}]`,
      );
    }
  }
  for (const zone of zones) {
    if (!zone.authoredLabelIds) continue;
    // A reviewed batch owns the exact anchor inventory it authored. Later
    // batches may add new audited anchors to that same spatial zone without
    // rewriting or weakening the earlier batch's local completeness check.
    const generated = anchors
      .filter((anchor) => anchor.zoneId === zone.id && anchor.authoredBatch === zone.authoredBatch)
      .map(({ id }) => id)
      .sort((left, right) => left.localeCompare(right, "en"));
    const authored = [...zone.authoredLabelIds].sort((left, right) => left.localeCompare(right, "en"));
    const missing = generated.filter((id) => !authored.includes(id));
    const unexpected = authored.filter((id) => !generated.includes(id));
    if (missing.length || unexpected.length) {
      fail(
        `${zone.authoredAt}.labelIds`,
        `does not exactly match anchors assigned to zone ${JSON.stringify(zone.id)}`
          + `${missing.length ? `; missing ${missing.join(", ")}` : ""}`
          + `${unexpected.length ? `; unexpected ${unexpected.join(", ")}` : ""}`,
      );
    }
  }
  return { anchors, zones, zoneById };
}

/** Build the reviewed word -> lexeme-id set from every non-root spatial scene. */
export function buildReviewedLexemeIndex(scenes) {
  const index = new Map();
  for (const scene of scenes) {
    if (scene.id === "world-map") continue;
    for (const label of scene.labels ?? []) {
      if (typeof label.word !== "string" || typeof label.lexemeId !== "string") continue;
      const word = normalizeWord(label.word);
      let entry = index.get(word);
      if (!entry) {
        entry = new Map();
        index.set(word, entry);
      }
      const sources = entry.get(label.lexemeId) ?? [];
      sources.push(`${scene.id}/${label.id}`);
      entry.set(label.lexemeId, sources);
    }
  }
  return index;
}

function resolveAnchorLexeme(anchor, reviewedLexemes, semanticLexemes) {
  const normalizedWord = normalizeWord(anchor.word);
  const reviewed = reviewedLexemes.get(normalizedWord) ?? new Map();
  if (reviewed.size > 1) {
    const evidence = [...reviewed]
      .map(([id, sources]) => `${id} at ${sources.join(", ")}`)
      .join("; ");
    fail(anchor.authoredAt, `reviewed scenes disagree on lexemeId for ${JSON.stringify(anchor.word)}: ${evidence}`);
  }
  if (anchor.lexemeId) {
    const semanticWord = semanticLexemes?.get(anchor.lexemeId);
    if (semanticLexemes && !semanticWord) {
      fail(anchor.authoredAt, `explicit lexemeId ${anchor.lexemeId} does not exist in the 10k semantic lexicon`);
    }
    if (semanticWord && normalizeWord(semanticWord) !== normalizedWord) {
      fail(
        anchor.authoredAt,
        `explicit lexemeId ${anchor.lexemeId} belongs to ${JSON.stringify(semanticWord)}, not ${JSON.stringify(anchor.word)}`,
      );
    }
    const reviewedId = reviewed.keys().next().value;
    if (reviewedId && reviewedId !== anchor.lexemeId) {
      const sources = reviewed.get(reviewedId).join(", ");
      fail(
        anchor.authoredAt,
        `explicit lexemeId ${anchor.lexemeId} conflicts with reviewed ${reviewedId} from ${sources}`,
      );
    }
    return anchor.lexemeId;
  }
  return reviewed.keys().next().value;
}

function anchorRegion(anchor) {
  const half = REGION_SIZE / 2;
  return {
    id: `anchor-${anchor.id}`,
    description: `Audited ${anchor.kind} pixels containing the visible “${anchor.word}” anchor`,
    kind: anchor.kind,
    x: Math.max(0, Math.min(CANVAS.width - REGION_SIZE, anchor.x - half)),
    y: Math.max(0, Math.min(CANVAS.height - REGION_SIZE, anchor.y - half)),
    width: REGION_SIZE,
    height: REGION_SIZE,
  };
}

function cleanAuthoredFields(value) {
  const cleaned = { ...value };
  delete cleaned.authoredAt;
  delete cleaned.authoredBatch;
  delete cleaned.authoredLabelIds;
  return cleaned;
}

function portalDescriptor(portal) {
  return {
    id: portal.id,
    label: portal.label,
    translation: portal.translation,
    childSceneId: portal.childSceneId,
    sourceVisualRegion: portal.sourceVisualRegion,
    x: portal.x,
    y: portal.y,
    width: portal.width,
    height: portal.height,
    enterScale: portal.enterScale,
  };
}

/**
 * Compile already-loaded batches into a deterministic, complete world-map
 * scene. The pure API makes the authoring contract cheap to unit test.
 */
export function assembleWorldAtlas(batchDocuments, options = {}) {
  const { anchors, zones } = mergeAtlasBatches(batchDocuments);
  const reviewedLexemes = options.reviewedLexemes ?? new Map();
  const semanticLexemes = options.semanticLexemes;
  const sortedAnchors = [...anchors].sort((left, right) => (
    left.lod - right.lod
      || left.zoneId.localeCompare(right.zoneId, "en")
      || left.id.localeCompare(right.id, "en")
  ));
  const bandRanks = new Map();
  const labels = sortedAnchors.map((anchor) => {
    const bandRank = bandRanks.get(anchor.lod) ?? 0;
    bandRanks.set(anchor.lod, bandRank + 1);
    const lexemeId = resolveAnchorLexeme(anchor, reviewedLexemes, semanticLexemes);
    return {
      id: anchor.id,
      word: anchor.word,
      translation: anchor.translation,
      x: anchor.x,
      y: anchor.y,
      priority: Number((anchor.lod + 1 + bandRank / 100_000).toFixed(6)),
      minLevel: anchor.lod,
      sourceVisualRegion: `anchor-${anchor.id}`,
      ...(lexemeId ? { lexemeId } : {}),
    };
  });
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const zoneLabels = new Map(zones.map((zone) => [zone.id, []]));
  for (const anchor of anchors) zoneLabels.get(anchor.zoneId).push(anchor.id);
  const detailZones = [...zones]
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
    .map((zone) => ({
      ...cleanAuthoredFields(zone),
      labelIds: zoneLabels.get(zone.id).sort((left, right) => (
        labelById.get(left).priority - labelById.get(right).priority
          || left.localeCompare(right, "en")
      )),
    }));
  const portalRegions = PORTALS.map(({ regionDescription, ...portal }) => ({
    id: portal.sourceVisualRegion,
    description: regionDescription,
    kind: "object",
    x: portal.x,
    y: portal.y,
    width: portal.width,
    height: portal.height,
  }));
  const portals = PORTALS.map(portalDescriptor);
  const anchorRegions = sortedAnchors.map(anchorRegion);
  const retainedLabelCount = labels.length;
  const removedLabelCount = REMOVED_EXAMPLES.length;

  return {
    id: "world-map",
    title: "World atlas",
    translation: "词境世界",
    subtitle: "Explore one continuous, high-detail world",
    asset: BASE_ASSET.src,
    assets: {
      base: { ...BASE_ASSET },
      high: { ...HIGH_ASSET },
    },
    width: CANVAS.width,
    height: CANVAS.height,
    parentId: null,
    labels,
    portals,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: BASE_ASSET.src,
      reviewedAssetSha256: BASE_ASSET.sha256,
      rationale: `Merged ${batchDocuments.length === 2 ? "two" : batchDocuments.length} pixel-audited atlas batches into ${retainedLabelCount} independently pointable visible objects or parts across ${detailZones.length} contained exploration zones.`,
      previousLabelCount: retainedLabelCount + removedLabelCount,
      retainedLabelCount,
      removedLabelCount,
      removedExamples: [...REMOVED_EXAMPLES],
    },
    visualRegions: [...portalRegions, ...anchorRegions],
    detailZones,
  };
}

async function readJson(path, role) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${role} ${path}: ${error.message}`, { cause: error });
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Cannot parse ${role} ${path}: ${error.message}`, { cause: error });
  }
}

async function loadReviewedScenes(sceneRoot) {
  const manifestPath = resolve(sceneRoot, "manifest.json");
  const manifest = await readJson(manifestPath, "scene manifest");
  if (!Array.isArray(manifest.scenes)) fail(manifestPath, "scenes must be an array");
  return Promise.all(manifest.scenes
    .filter(({ id }) => id !== "world-map")
    .map(async ({ id }, index) => {
      const sceneId = requireText(id, `${manifestPath}.scenes[${index}].id`);
      return readJson(resolve(sceneRoot, `${sceneId}.json`), `scene ${sceneId}`);
    }));
}

async function loadSemanticLexemes(semanticRoot) {
  const manifestPath = resolve(semanticRoot, "manifest.json");
  const manifest = await readJson(manifestPath, "semantic manifest");
  if (!Array.isArray(manifest.shards)) fail(manifestPath, "shards must be an array");
  const shards = await Promise.all(manifest.shards.map(async ({ path }, index) => {
    const shardPath = requireText(path, `${manifestPath}.shards[${index}].path`);
    return readJson(resolve(semanticRoot, shardPath), `semantic shard ${shardPath}`);
  }));
  const lexemes = new Map();
  for (const shard of shards) {
    for (const node of shard.nodes ?? []) {
      if (typeof node.id === "string" && typeof node.word === "string") lexemes.set(node.id, node.word);
    }
  }
  return lexemes;
}

function usage() {
  return `Usage:
  node scripts/assemble-world-atlas.mjs <batch.json> [more-batches.json ...] --output <new-scene.json> [--force]

Batch schema:
  {"anchors":[{"id":"bed","word":"bed","translation":"床","x":300,"y":200,"lod":1,"zoneId":"home"}],
   "zones":[{"id":"home","title":"Home","translation":"家园","description":"Visible home district objects","x":0,"y":0,"width":800,"height":450,"targetScale":3}]}

The output path is mandatory. Existing files are never overwritten unless --force is explicit.`;
}

function parseArguments(argv) {
  const positional = [];
  let output;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "--output") {
      output = argv[index + 1];
      if (!output || output.startsWith("--")) throw new Error("--output requires a path");
      index += 1;
      continue;
    }
    if (argument.startsWith("--output=")) {
      output = argument.slice("--output=".length);
      if (!output) throw new Error("--output requires a path");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    positional.push(argument);
  }
  if (positional.length < 1) {
    throw new Error(`Expected at least one batch JSON path; received ${positional.length}`);
  }
  if (!output) throw new Error("--output is required; this tool has no implicit destination");
  return { help: false, batchPaths: positional, output, force };
}

export async function runAtlasAssembler({
  batchPaths,
  output,
  force = false,
  sceneRoot = DEFAULT_SCENE_ROOT,
  semanticRoot = DEFAULT_SEMANTIC_ROOT,
}) {
  if (!Array.isArray(batchPaths) || batchPaths.length < 1) {
    throw new Error(`Expected at least one batch JSON path; received ${batchPaths?.length ?? 0}`);
  }
  const resolvedBatchPaths = batchPaths.map((path) => resolve(path));
  const batchDocuments = await Promise.all(resolvedBatchPaths.map(async (path) => ({
    path,
    data: await readJson(path, "atlas batch"),
  })));
  const [reviewedScenes, semanticLexemes] = await Promise.all([
    loadReviewedScenes(sceneRoot),
    loadSemanticLexemes(semanticRoot),
  ]);
  const scene = assembleWorldAtlas(batchDocuments, {
    reviewedLexemes: buildReviewedLexemeIndex(reviewedScenes),
    semanticLexemes,
  });
  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, `${JSON.stringify(scene, null, 2)}\n`, {
      encoding: "utf8",
      flag: force ? "w" : "wx",
    });
  } catch (error) {
    if (!force && error?.code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing output ${outputPath}; choose a new --output or pass --force`);
    }
    throw error;
  }
  return {
    outputPath,
    labelCount: scene.labels.length,
    zoneCount: scene.detailZones.length,
    reusedLexemeCount: scene.labels.filter(({ lexemeId }) => lexemeId).length,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = await runAtlasAssembler(args);
  console.log(JSON.stringify({ status: "generated", ...result }));
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`assemble-world-atlas: ${error.message}`);
    process.exitCode = 1;
  });
}
