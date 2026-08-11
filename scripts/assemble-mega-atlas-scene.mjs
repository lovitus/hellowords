#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_SCENE_ROOT = resolve(PROJECT_ROOT, "public/data/scenes");
const REGION_SIZE_IN_SOURCE_PIXELS = 32;
const WORD_PATTERN = /^[a-z][a-z -]*$/iu;
const LEXEME_ID_PATTERN = /^en-[a-f0-9]{16}$/u;
const SEMANTIC_REALMS = new Set([
  "nature-life",
  "body-daily-life",
  "objects-technology",
  "people-society",
  "mind-values",
  "language-culture",
  "actions-events",
  "space-time-measure",
  "qualities-states",
  "grammar-relations",
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
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `expected a finite number from ${minimum} through ${maximum}; received ${value}`);
  }
  return value;
}

function normalizeWord(word) {
  return word.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function scaleNumber(value, scale) {
  return Number((value * scale).toFixed(6));
}

function scaleRectangle(value, scale) {
  return {
    x: scaleNumber(value.x, scale),
    y: scaleNumber(value.y, scale),
    width: scaleNumber(value.width, scale),
    height: scaleNumber(value.height, scale),
  };
}

function pointInside(point, rectangle) {
  return point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height;
}

function validateAsset(rawValue, path) {
  const raw = requireRecord(rawValue, path);
  const sha = requireText(raw.sha256, `${path}.sha256`);
  if (!/^[a-f0-9]{64}$/u.test(sha)) fail(`${path}.sha256`, "expected 64 lowercase hexadecimal characters");
  return {
    src: requireText(raw.src, `${path}.src`),
    width: requireNumber(raw.width, `${path}.width`, 1, 100_000),
    height: requireNumber(raw.height, `${path}.height`, 1, 100_000),
    sha256: sha,
  };
}

function parseConfiguration(rawValue, sourceWidth, sourceHeight, path = "<config>") {
  const raw = requireRecord(rawValue, path);
  const logicalScale = requireNumber(raw.logicalScale, `${path}.logicalScale`, Number.MIN_VALUE, 1);
  const sceneRaw = requireRecord(raw.scene, `${path}.scene`);
  const assetsRaw = requireRecord(sceneRaw.assets, `${path}.scene.assets`);
  const base = validateAsset(assetsRaw.base, `${path}.scene.assets.base`);
  const high = validateAsset(assetsRaw.high, `${path}.scene.assets.high`);
  const logicalWidth = scaleNumber(sourceWidth, logicalScale);
  const logicalHeight = scaleNumber(sourceHeight, logicalScale);
  if (base.width !== logicalWidth || base.height !== logicalHeight) {
    fail(`${path}.scene.assets.base`, `expected logical-size base ${logicalWidth}x${logicalHeight}`);
  }
  if (high.width !== sourceWidth || high.height !== sourceHeight) {
    fail(`${path}.scene.assets.high`, `expected source-size high ${sourceWidth}x${sourceHeight}`);
  }
  if (sceneRaw.asset !== undefined && sceneRaw.asset !== base.src) {
    fail(`${path}.scene.asset`, "must equal assets.base.src when authored");
  }
  const panelSemanticRealmsRaw = requireRecord(
    sceneRaw.panelSemanticRealms,
    `${path}.scene.panelSemanticRealms`,
  );
  const panelSemanticRealms = new Map(Object.entries(panelSemanticRealmsRaw).map(([panelId, realm]) => {
    const parsedRealm = requireText(realm, `${path}.scene.panelSemanticRealms.${panelId}`);
    if (!SEMANTIC_REALMS.has(parsedRealm)) {
      fail(`${path}.scene.panelSemanticRealms.${panelId}`, `unknown semantic realm ${JSON.stringify(parsedRealm)}`);
    }
    return [panelId, parsedRealm];
  }));
  const portals = requireArray(sceneRaw.portals, `${path}.scene.portals`).map((value, index) => {
    const portalPath = `${path}.scene.portals[${index}]`;
    const portal = requireRecord(value, portalPath);
    const sourceRectangle = {
      x: requireNumber(portal.x, `${portalPath}.x`, 0, sourceWidth),
      y: requireNumber(portal.y, `${portalPath}.y`, 0, sourceHeight),
      width: requireNumber(portal.width, `${portalPath}.width`, Number.MIN_VALUE, sourceWidth),
      height: requireNumber(portal.height, `${portalPath}.height`, Number.MIN_VALUE, sourceHeight),
    };
    if (sourceRectangle.x + sourceRectangle.width > sourceWidth
      || sourceRectangle.y + sourceRectangle.height > sourceHeight) {
      fail(portalPath, "portal rectangle leaves the compiled source canvas");
    }
    return {
      id: requireText(portal.id, `${portalPath}.id`),
      label: requireText(portal.label, `${portalPath}.label`),
      translation: requireText(portal.translation, `${portalPath}.translation`),
      childSceneId: requireText(portal.childSceneId, `${portalPath}.childSceneId`),
      sourceVisualRegion: `portal-${requireText(portal.id, `${portalPath}.id`)}`,
      ...scaleRectangle(sourceRectangle, logicalScale),
      enterScale: portal.enterScale === undefined
        ? 4
        : requireNumber(portal.enterScale, `${portalPath}.enterScale`, 1.000001, 100),
      regionDescription: requireText(portal.description, `${portalPath}.description`),
    };
  });
  if (new Set(portals.map(({ id }) => id)).size !== portals.length) {
    fail(`${path}.scene.portals`, "portal ids must be unique");
  }
  return {
    logicalScale,
    logicalWidth,
    logicalHeight,
    scene: {
      id: requireText(sceneRaw.id, `${path}.scene.id`),
      title: requireText(sceneRaw.title, `${path}.scene.title`),
      translation: requireText(sceneRaw.translation, `${path}.scene.translation`),
      subtitle: requireText(sceneRaw.subtitle, `${path}.scene.subtitle`),
      assets: { base, high },
      portals,
      panelSemanticRealms,
    },
  };
}

function parseCompiledBatch(rawValue, path = "<compiled-batch>") {
  const raw = requireRecord(rawValue, path);
  const layout = requireRecord(raw.layout, `${path}.layout`);
  const width = requireNumber(layout.width, `${path}.layout.width`, 1, 100_000);
  const height = requireNumber(layout.height, `${path}.layout.height`, 1, 100_000);
  const panelIds = new Set(requireArray(layout.panels, `${path}.layout.panels`).map((panel, index) => (
    requireText(requireRecord(panel, `${path}.layout.panels[${index}]`).id, `${path}.layout.panels[${index}].id`)
  )));
  const zones = requireArray(raw.zones, `${path}.zones`).map((value, index) => {
    const zonePath = `${path}.zones[${index}]`;
    const zone = requireRecord(value, zonePath);
    const sourcePanel = requireText(zone.sourcePanel, `${zonePath}.sourcePanel`);
    if (!panelIds.has(sourcePanel)) fail(`${zonePath}.sourcePanel`, `unknown panel ${JSON.stringify(sourcePanel)}`);
    const rectangle = {
      x: requireNumber(zone.x, `${zonePath}.x`, 0, width),
      y: requireNumber(zone.y, `${zonePath}.y`, 0, height),
      width: requireNumber(zone.width, `${zonePath}.width`, Number.MIN_VALUE, width),
      height: requireNumber(zone.height, `${zonePath}.height`, Number.MIN_VALUE, height),
    };
    if (rectangle.x + rectangle.width > width || rectangle.y + rectangle.height > height) {
      fail(zonePath, "zone rectangle leaves the compiled source canvas");
    }
    return {
      ...zone,
      id: requireText(zone.id, `${zonePath}.id`),
      title: requireText(zone.title, `${zonePath}.title`),
      translation: requireText(zone.translation, `${zonePath}.translation`),
      description: requireText(zone.description, `${zonePath}.description`),
      targetScale: zone.targetScale === undefined
        ? 3.2
        : requireNumber(zone.targetScale, `${zonePath}.targetScale`, 1.000001, 100),
      sourcePanel,
      ...rectangle,
      authoredAt: zonePath,
    };
  });
  const zoneById = new Map();
  for (const zone of zones) {
    if (zoneById.has(zone.id)) fail(zone.authoredAt, `duplicate zone id ${JSON.stringify(zone.id)}`);
    zoneById.set(zone.id, zone);
  }
  const anchors = requireArray(raw.anchors, `${path}.anchors`).map((value, index) => {
    const anchorPath = `${path}.anchors[${index}]`;
    const anchor = requireRecord(value, anchorPath);
    const id = requireText(anchor.id, `${anchorPath}.id`);
    const word = requireText(anchor.word, `${anchorPath}.word`);
    if (!WORD_PATTERN.test(word)) fail(`${anchorPath}.word`, `unsupported English display term ${JSON.stringify(word)}`);
    const lod = anchor.lod ?? anchor.minLevel;
    if (!Number.isInteger(lod) || lod < 0 || lod > 4) fail(`${anchorPath}.lod`, "expected an integer from 0 through 4");
    const zoneId = requireText(anchor.zoneId, `${anchorPath}.zoneId`);
    const zone = zoneById.get(zoneId);
    if (!zone) fail(`${anchorPath}.zoneId`, `unknown zone ${JSON.stringify(zoneId)}`);
    const parsed = {
      id,
      word,
      translation: requireText(anchor.translation, `${anchorPath}.translation`),
      x: requireNumber(anchor.x, `${anchorPath}.x`, 0, width),
      y: requireNumber(anchor.y, `${anchorPath}.y`, 0, height),
      lod,
      zoneId,
      sourcePanel: requireText(anchor.sourcePanel, `${anchorPath}.sourcePanel`),
      authoredAt: anchorPath,
      ...(anchor.lexemeId ? { lexemeId: requireText(anchor.lexemeId, `${anchorPath}.lexemeId`) } : {}),
    };
    if (!panelIds.has(parsed.sourcePanel)) fail(`${anchorPath}.sourcePanel`, "unknown source panel");
    if (parsed.sourcePanel !== zone.sourcePanel) {
      fail(
        `${anchorPath}.sourcePanel`,
        `does not match zone ${JSON.stringify(zoneId)} on panel ${JSON.stringify(zone.sourcePanel)}`,
      );
    }
    if (!pointInside(parsed, zone)) fail(anchorPath, `anchor point leaves zone ${JSON.stringify(zoneId)}`);
    if (parsed.lexemeId && !LEXEME_ID_PATTERN.test(parsed.lexemeId)) fail(`${anchorPath}.lexemeId`, "invalid lexeme id");
    return parsed;
  });
  if (new Set(anchors.map(({ id }) => id)).size !== anchors.length) fail(`${path}.anchors`, "anchor ids must be unique");
  return {
    width,
    height,
    panels: requireArray(layout.panels, `${path}.layout.panels`),
    zones,
    anchors,
    removedAmbiguous: requireArray(raw.removedAmbiguous, `${path}.removedAmbiguous`),
  };
}

/** Build an exact-word lexeme index from already human-reviewed spatial scenes. */
export function buildReviewedSpatialLexemeIndex(scenes) {
  const byWord = new Map();
  for (const scene of scenes) {
    if (scene.id === "world-map") continue;
    for (const label of scene.labels ?? []) {
      if (typeof label.word !== "string" || !LEXEME_ID_PATTERN.test(label.lexemeId ?? "")) continue;
      const normalized = normalizeWord(label.word);
      const ids = byWord.get(normalized) ?? new Set();
      ids.add(label.lexemeId);
      byWord.set(normalized, ids);
    }
  }
  return new Map([...byWord].map(([word, ids]) => [word, ids.size === 1 ? [...ids][0] : undefined]));
}

function selectUniqueWords(anchors, panelRank) {
  const ranked = [...anchors].sort((left, right) => (
    left.lod - right.lod
      || panelRank.get(left.sourcePanel) - panelRank.get(right.sourcePanel)
      || compareText(left.id, right.id)
  ));
  const kept = [];
  const duplicateWords = [];
  const firstByWord = new Map();
  for (const anchor of ranked) {
    const normalized = normalizeWord(anchor.word);
    const first = firstByWord.get(normalized);
    if (first) {
      duplicateWords.push({
        normalizedWord: normalized,
        keptId: first.id,
        removedId: anchor.id,
        keptPanel: first.sourcePanel,
        removedPanel: anchor.sourcePanel,
      });
      continue;
    }
    firstByWord.set(normalized, anchor);
    kept.push(anchor);
  }
  return { kept, duplicateWords };
}

function anchorRegion(anchor, sourceWidth, sourceHeight, logicalScale) {
  const size = REGION_SIZE_IN_SOURCE_PIXELS * logicalScale;
  const x = Math.max(0, Math.min(sourceWidth * logicalScale - size, anchor.x * logicalScale - size / 2));
  const y = Math.max(0, Math.min(sourceHeight * logicalScale - size, anchor.y * logicalScale - size / 2));
  return {
    id: `anchor-${anchor.id}`,
    description: `Pixel-audited visible “${anchor.word}” on the ${anchor.sourcePanel} source panel`,
    kind: anchor.lod === 0 ? "whole" : anchor.lod >= 3 ? "part" : "object",
    x: scaleNumber(x, 1),
    y: scaleNumber(y, 1),
    width: size,
    height: size,
  };
}

/** Convert a reviewed six-panel high-coordinate batch into one production Scene. */
export function assembleMegaAtlasScene(compiledValue, configurationValue, options = {}) {
  const compiled = parseCompiledBatch(compiledValue, options.batchPath);
  const configuration = parseConfiguration(
    configurationValue,
    compiled.width,
    compiled.height,
    options.configPath,
  );
  const panelRank = new Map(compiled.panels.map((panel, index) => [panel.id, index]));
  for (const panelId of panelRank.keys()) {
    if (!configuration.scene.panelSemanticRealms.has(panelId)) {
      fail(options.configPath ?? "<config>", `missing semantic realm for panel ${JSON.stringify(panelId)}`);
    }
  }
  for (const panelId of configuration.scene.panelSemanticRealms.keys()) {
    if (!panelRank.has(panelId)) {
      fail(options.configPath ?? "<config>", `semantic realm references unknown panel ${JSON.stringify(panelId)}`);
    }
  }
  const { kept, duplicateWords } = selectUniqueWords(compiled.anchors, panelRank);
  const reviewedLexemes = options.reviewedLexemes ?? new Map();
  const sortedAnchors = [...kept].sort((left, right) => (
    left.lod - right.lod || compareText(left.zoneId, right.zoneId) || compareText(left.id, right.id)
  ));
  const bandRanks = new Map();
  const labels = sortedAnchors.map((anchor) => {
    const bandRank = bandRanks.get(anchor.lod) ?? 0;
    bandRanks.set(anchor.lod, bandRank + 1);
    const reviewedLexemeId = reviewedLexemes.get(normalizeWord(anchor.word));
    const lexemeId = anchor.lexemeId ?? reviewedLexemeId;
    return {
      id: anchor.id,
      word: anchor.word,
      translation: anchor.translation,
      x: scaleNumber(anchor.x, configuration.logicalScale),
      y: scaleNumber(anchor.y, configuration.logicalScale),
      priority: Number((anchor.lod + 1 + bandRank / 100_000).toFixed(6)),
      minLevel: anchor.lod,
      sourceVisualRegion: `anchor-${anchor.id}`,
      semanticRealmId: configuration.scene.panelSemanticRealms.get(anchor.sourcePanel),
      ...(lexemeId ? { lexemeId } : {}),
    };
  });
  const retainedIds = new Set(labels.map(({ id }) => id));
  const detailZones = compiled.zones.map((zone) => ({
    id: zone.id,
    title: zone.title,
    translation: zone.translation,
    description: zone.description,
    ...scaleRectangle(zone, configuration.logicalScale),
    targetScale: zone.targetScale,
    labelIds: compiled.anchors
      .filter((anchor) => anchor.zoneId === zone.id && retainedIds.has(anchor.id))
      .sort((left, right) => left.lod - right.lod || compareText(left.id, right.id))
      .map(({ id }) => id),
  }));
  const anchorRegions = sortedAnchors.map((anchor) => (
    anchorRegion(anchor, compiled.width, compiled.height, configuration.logicalScale)
  ));
  const portalRegions = configuration.scene.portals.map((portal) => ({
    id: portal.sourceVisualRegion,
    description: portal.regionDescription,
    kind: "object",
    x: portal.x,
    y: portal.y,
    width: portal.width,
    height: portal.height,
  }));
  const portals = configuration.scene.portals.map((portal) => ({
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
  }));
  const authoredRemoved = compiled.removedAmbiguous.length;
  const removedLabelCount = authoredRemoved + duplicateWords.length;
  const removedExamples = [
    ...compiled.removedAmbiguous.slice(0, 3).map((entry) => (
      typeof entry?.candidate === "string" ? entry.candidate : "ambiguous source detail"
    )),
    ...duplicateWords.slice(0, 3).map(({ normalizedWord }) => `duplicate ${normalizedWord}`),
  ].slice(0, 6);
  while (removedExamples.length < 3) removedExamples.push("unverified source detail");
  const { scene } = configuration;
  return {
    scene: {
      id: scene.id,
      title: scene.title,
      translation: scene.translation,
      subtitle: scene.subtitle,
      asset: scene.assets.base.src,
      assets: scene.assets,
      width: configuration.logicalWidth,
      height: configuration.logicalHeight,
      parentId: null,
      labels,
      portals,
      anchorAudit: {
        status: "human-verified",
        policy: "visible-object-or-part-only",
        reviewedAsset: scene.assets.base.src,
        reviewedAssetSha256: scene.assets.base.sha256,
        rationale: `Compiled ${compiled.panels.length} independently pixel-audited source panels into one shared ${configuration.logicalWidth} by ${configuration.logicalHeight} logical atlas with ${labels.length} unique, directly visible words across ${detailZones.length} exploration zones.`,
        previousLabelCount: labels.length + removedLabelCount,
        retainedLabelCount: labels.length,
        removedLabelCount,
        removedExamples,
      },
      visualRegions: [...portalRegions, ...anchorRegions],
      detailZones,
    },
    report: {
      authoredAnchorCount: compiled.anchors.length,
      retainedLabelCount: labels.length,
      duplicateWords,
      removedAmbiguousCount: authoredRemoved,
      reusedLexemeCount: labels.filter(({ lexemeId }) => lexemeId).length,
    },
  };
}

async function readJson(path, role) {
  const bytes = await readFile(path);
  try {
    return { data: JSON.parse(bytes.toString("utf8")), bytes, sha256: sha256(bytes) };
  } catch (error) {
    throw new Error(`Cannot parse ${role} ${path}: ${error.message}`, { cause: error });
  }
}

async function loadReviewedScenes(sceneRoot) {
  const manifest = await readJson(resolve(sceneRoot, "manifest.json"), "scene manifest");
  return Promise.all(requireArray(manifest.data.scenes, "manifest.scenes")
    .filter(({ id }) => id !== "world-map")
    .map(({ id }) => readJson(resolve(sceneRoot, `${id}.json`), `scene ${id}`).then(({ data }) => data)));
}

export async function runMegaAtlasSceneAssembler({
  batchPath,
  configPath,
  output,
  force = false,
  sceneRoot = DEFAULT_SCENE_ROOT,
}) {
  const resolvedBatchPath = resolve(batchPath);
  const resolvedConfigPath = resolve(configPath);
  const resolvedOutput = resolve(output);
  if ([resolvedBatchPath, resolvedConfigPath].includes(resolvedOutput)) {
    throw new Error("Output must not overwrite an input file");
  }
  const [batch, config, scenes] = await Promise.all([
    readJson(resolvedBatchPath, "compiled batch"),
    readJson(resolvedConfigPath, "scene configuration"),
    loadReviewedScenes(sceneRoot),
  ]);
  const assembled = assembleMegaAtlasScene(batch.data, config.data, {
    batchPath: resolvedBatchPath,
    configPath: resolvedConfigPath,
    reviewedLexemes: buildReviewedSpatialLexemeIndex(scenes),
  });
  const serialized = `${JSON.stringify(assembled.scene, null, 2)}\n`;
  await mkdir(dirname(resolvedOutput), { recursive: true });
  try {
    await writeFile(resolvedOutput, serialized, { encoding: "utf8", flag: force ? "w" : "wx" });
  } catch (error) {
    if (!force && error?.code === "EEXIST") throw new Error(`Refusing to overwrite existing output ${resolvedOutput}`);
    throw error;
  }
  return {
    status: "generated",
    outputPath: resolvedOutput,
    output: { bytes: Buffer.byteLength(serialized), sha256: sha256(serialized) },
    ...assembled.report,
    inputs: {
      batch: { path: resolvedBatchPath, bytes: batch.bytes.byteLength, sha256: batch.sha256 },
      config: { path: resolvedConfigPath, bytes: config.bytes.byteLength, sha256: config.sha256 },
    },
  };
}

export function parseMegaAtlasSceneArguments(argv) {
  const positional = [];
  let configPath;
  let output;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "--config" || argument === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path`);
      if (argument === "--config") configPath = value;
      else output = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    positional.push(argument);
  }
  if (positional.length !== 1) throw new Error(`Expected one compiled batch path; received ${positional.length}`);
  if (!configPath) throw new Error("--config is required");
  if (!output) throw new Error("--output is required");
  return { help: false, batchPath: positional[0], configPath, output, force };
}

function usage() {
  return "Usage: node scripts/assemble-mega-atlas-scene.mjs <compiled-batch.json> --config <scene-config.json> --output <world-map.json> [--force]";
}

async function main() {
  const arguments_ = parseMegaAtlasSceneArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(usage());
    return;
  }
  console.log(JSON.stringify(await runMegaAtlasSceneAssembler(arguments_)));
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`assemble-mega-atlas-scene: ${error.message}`);
    process.exitCode = 1;
  });
}
