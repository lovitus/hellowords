#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MEGA_ATLAS_PANEL_CONTRACT = Object.freeze({
  columns: 3,
  rows: 2,
  panelWidth: 1_672,
  panelHeight: 941,
  panelCount: 6,
});

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
  if (typeof value !== "string" || !value.trim()) {
    fail(path, "expected a non-empty string");
  }
  return value.trim();
}

function requireSafeInteger(value, path, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(path, `expected a safe integer from ${minimum} through ${maximum}; received ${value}`);
  }
  return value;
}

function requireFiniteNumber(value, path, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `expected a finite number from ${minimum} through ${maximum}; received ${value}`);
  }
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeWord(word) {
  return word.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function serializeMegaAtlasPanelBatch(batch) {
  return `${JSON.stringify(canonicalize(batch), null, 2)}\n`;
}

function parseGutters(rawValue, path) {
  if (rawValue === undefined) return { horizontal: 0, vertical: 0 };
  const raw = requireRecord(rawValue, path);
  if (
    raw.horizontal !== undefined
    && raw.x !== undefined
    && raw.horizontal !== raw.x
  ) {
    fail(path, `horizontal (${raw.horizontal}) conflicts with x (${raw.x})`);
  }
  if (
    raw.vertical !== undefined
    && raw.y !== undefined
    && raw.vertical !== raw.y
  ) {
    fail(path, `vertical (${raw.vertical}) conflicts with y (${raw.y})`);
  }
  return {
    horizontal: requireSafeInteger(raw.horizontal ?? raw.x ?? 0, `${path}.horizontal`, 0, 100_000),
    vertical: requireSafeInteger(raw.vertical ?? raw.y ?? 0, `${path}.vertical`, 0, 100_000),
  };
}

/** Validate and canonicalize the fixed 3 x 2 panel layout. */
export function parseMegaAtlasPanelLayout(rawValue, path = "<layout>") {
  const raw = requireRecord(rawValue, path);
  const columns = requireSafeInteger(raw.columns, `${path}.columns`, 1, 100);
  const rows = requireSafeInteger(raw.rows, `${path}.rows`, 1, 100);
  const panelWidth = requireSafeInteger(raw.panelWidth, `${path}.panelWidth`, 1, 100_000);
  const panelHeight = requireSafeInteger(raw.panelHeight, `${path}.panelHeight`, 1, 100_000);
  if (columns !== MEGA_ATLAS_PANEL_CONTRACT.columns) {
    fail(`${path}.columns`, `expected exactly ${MEGA_ATLAS_PANEL_CONTRACT.columns}; received ${columns}`);
  }
  if (rows !== MEGA_ATLAS_PANEL_CONTRACT.rows) {
    fail(`${path}.rows`, `expected exactly ${MEGA_ATLAS_PANEL_CONTRACT.rows}; received ${rows}`);
  }
  if (panelWidth !== MEGA_ATLAS_PANEL_CONTRACT.panelWidth) {
    fail(
      `${path}.panelWidth`,
      `expected exactly ${MEGA_ATLAS_PANEL_CONTRACT.panelWidth}; received ${panelWidth}`,
    );
  }
  if (panelHeight !== MEGA_ATLAS_PANEL_CONTRACT.panelHeight) {
    fail(
      `${path}.panelHeight`,
      `expected exactly ${MEGA_ATLAS_PANEL_CONTRACT.panelHeight}; received ${panelHeight}`,
    );
  }

  const gutters = parseGutters(raw.gutters, `${path}.gutters`);
  const authoredPanels = requireArray(raw.panels, `${path}.panels`);
  if (authoredPanels.length !== MEGA_ATLAS_PANEL_CONTRACT.panelCount) {
    fail(
      `${path}.panels`,
      `expected exactly ${MEGA_ATLAS_PANEL_CONTRACT.panelCount} panels; received ${authoredPanels.length}`,
    );
  }

  const panelById = new Map();
  const panelByFile = new Map();
  const panelByCell = new Map();
  for (const [index, value] of authoredPanels.entries()) {
    const panelPath = `${path}.panels[${index}]`;
    const panel = requireRecord(value, panelPath);
    const id = requireText(panel.id, `${panelPath}.id`);
    const file = requireText(panel.file, `${panelPath}.file`);
    const row = requireSafeInteger(panel.row, `${panelPath}.row`, 0, rows - 1);
    const col = requireSafeInteger(panel.col, `${panelPath}.col`, 0, columns - 1);
    const previousId = panelById.get(id);
    if (previousId) fail(`${panelPath}.id`, `duplicate panel id ${JSON.stringify(id)}; first used at ${previousId}`);
    const previousFile = panelByFile.get(file);
    if (previousFile) {
      fail(`${panelPath}.file`, `duplicate panel file ${JSON.stringify(file)}; first used at ${previousFile}`);
    }
    const cell = `${row},${col}`;
    const previousCell = panelByCell.get(cell);
    if (previousCell) {
      fail(panelPath, `cell row=${row}, col=${col} is already occupied by panel ${JSON.stringify(previousCell.id)}`);
    }
    const parsed = {
      id,
      file,
      row,
      col,
      x: col * (panelWidth + gutters.horizontal),
      y: row * (panelHeight + gutters.vertical),
      width: panelWidth,
      height: panelHeight,
      authoredAt: panelPath,
    };
    panelById.set(id, panelPath);
    panelByFile.set(file, panelPath);
    panelByCell.set(cell, parsed);
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (!panelByCell.has(`${row},${col}`)) {
        fail(`${path}.panels`, `missing panel at row=${row}, col=${col}`);
      }
    }
  }

  const panels = [...panelByCell.values()]
    .sort((left, right) => left.row - right.row || left.col - right.col)
    .map((panel) => ({
      id: panel.id,
      file: panel.file,
      row: panel.row,
      col: panel.col,
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
    }));
  return {
    columns,
    rows,
    panelWidth,
    panelHeight,
    gutters,
    width: columns * panelWidth + (columns - 1) * gutters.horizontal,
    height: rows * panelHeight + (rows - 1) * gutters.vertical,
    panels,
  };
}

function requireMatchingSourcePanel(raw, path, panelId) {
  if (raw.sourcePanel !== undefined && raw.sourcePanel !== panelId) {
    fail(
      `${path}.sourcePanel`,
      `expected ${JSON.stringify(panelId)} when authored; received ${JSON.stringify(raw.sourcePanel)}`,
    );
  }
}

function parseLocalZone(rawValue, path, panel) {
  const raw = requireRecord(rawValue, path);
  requireMatchingSourcePanel(raw, path, panel.id);
  const id = requireText(raw.id, `${path}.id`);
  const x = requireFiniteNumber(raw.x, `${path}.x`, 0, panel.width);
  const y = requireFiniteNumber(raw.y, `${path}.y`, 0, panel.height);
  const width = requireFiniteNumber(raw.width, `${path}.width`, Number.MIN_VALUE, panel.width);
  const height = requireFiniteNumber(raw.height, `${path}.height`, Number.MIN_VALUE, panel.height);
  if (x + width > panel.width) {
    fail(path, `local zone ends at x=${x + width}, beyond panel width ${panel.width}`);
  }
  if (y + height > panel.height) {
    fail(path, `local zone ends at y=${y + height}, beyond panel height ${panel.height}`);
  }
  let labelIds;
  if (raw.labelIds !== undefined) {
    labelIds = requireArray(raw.labelIds, `${path}.labelIds`).map((value, index) => (
      requireText(value, `${path}.labelIds[${index}]`)
    ));
    if (new Set(labelIds).size !== labelIds.length) {
      fail(`${path}.labelIds`, "contains a duplicate anchor id");
    }
  }
  return {
    id,
    local: { x, y, width, height },
    labelIds,
    authoredAt: path,
    output: {
      ...raw,
      id,
      x: panel.x + x,
      y: panel.y + y,
      width,
      height,
      ...(labelIds ? { labelIds } : {}),
      sourcePanel: panel.id,
    },
  };
}

function parseLocalAnchor(rawValue, path, panel) {
  const raw = requireRecord(rawValue, path);
  requireMatchingSourcePanel(raw, path, panel.id);
  if (raw.zone !== undefined && raw.zoneId !== undefined && raw.zone !== raw.zoneId) {
    fail(path, `zone (${JSON.stringify(raw.zone)}) conflicts with zoneId (${JSON.stringify(raw.zoneId)})`);
  }
  const id = requireText(raw.id, `${path}.id`);
  const word = requireText(raw.word, `${path}.word`);
  const zoneId = requireText(raw.zoneId ?? raw.zone, `${path}.zoneId`);
  const x = requireFiniteNumber(raw.x, `${path}.x`, 0, panel.width);
  const y = requireFiniteNumber(raw.y, `${path}.y`, 0, panel.height);
  const output = {
    ...raw,
    id,
    word,
    x: panel.x + x,
    y: panel.y + y,
    zoneId,
    sourcePanel: panel.id,
  };
  delete output.zone;
  return {
    id,
    word,
    zoneId,
    local: { x, y },
    authoredAt: path,
    output,
  };
}

function parseRemovedAmbiguous(rawValue, path, panel) {
  const raw = requireRecord(rawValue, path);
  requireMatchingSourcePanel(raw, path, panel.id);
  return {
    ...raw,
    candidate: requireText(raw.candidate, `${path}.candidate`),
    reason: requireText(raw.reason, `${path}.reason`),
    sourcePanel: panel.id,
  };
}

function pointInsideZone(point, zone) {
  return point.x >= zone.x
    && point.x <= zone.x + zone.width
    && point.y >= zone.y
    && point.y <= zone.y + zone.height;
}

function parsePanelBatch(document, panel) {
  const path = document.path || `<panel ${panel.id}>`;
  const raw = requireRecord(document.data, path);
  if (raw.panelId !== undefined && raw.panelId !== panel.id) {
    fail(`${path}.panelId`, `expected ${JSON.stringify(panel.id)}; received ${JSON.stringify(raw.panelId)}`);
  }
  const zones = requireArray(raw.zones, `${path}.zones`).map((value, index) => (
    parseLocalZone(value, `${path}.zones[${index}]`, panel)
  ));
  const anchors = requireArray(raw.anchors, `${path}.anchors`).map((value, index) => (
    parseLocalAnchor(value, `${path}.anchors[${index}]`, panel)
  ));
  const removedAmbiguous = requireArray(
    raw.removedAmbiguous,
    `${path}.removedAmbiguous`,
  ).map((value, index) => (
    parseRemovedAmbiguous(value, `${path}.removedAmbiguous[${index}]`, panel)
  ));

  const zoneById = new Map();
  for (const zone of zones) {
    const previous = zoneById.get(zone.id);
    if (previous) {
      fail(zone.authoredAt, `duplicate local zone id ${JSON.stringify(zone.id)}; first used at ${previous.authoredAt}`);
    }
    zoneById.set(zone.id, zone);
  }
  const anchorById = new Map();
  for (const anchor of anchors) {
    const previous = anchorById.get(anchor.id);
    if (previous) {
      fail(anchor.authoredAt, `duplicate local anchor id ${JSON.stringify(anchor.id)}; first used at ${previous.authoredAt}`);
    }
    anchorById.set(anchor.id, anchor);
    const zone = zoneById.get(anchor.zoneId);
    if (!zone) {
      fail(anchor.authoredAt, `references unknown local zone ${JSON.stringify(anchor.zoneId)}`);
    }
    if (!pointInsideZone(anchor.local, zone.local)) {
      fail(
        anchor.authoredAt,
        `local point (${anchor.local.x}, ${anchor.local.y}) is outside zone ${JSON.stringify(zone.id)} `
          + `[${zone.local.x}, ${zone.local.y}, ${zone.local.width}, ${zone.local.height}]`,
      );
    }
  }
  for (const zone of zones) {
    if (!zone.labelIds) continue;
    const authored = [...zone.labelIds].sort(compareText);
    const assigned = anchors
      .filter((anchor) => anchor.zoneId === zone.id)
      .map((anchor) => anchor.id)
      .sort(compareText);
    const missing = assigned.filter((id) => !authored.includes(id));
    const unexpected = authored.filter((id) => !assigned.includes(id));
    if (missing.length || unexpected.length) {
      fail(
        `${zone.authoredAt}.labelIds`,
        `does not exactly match anchors assigned to zone ${JSON.stringify(zone.id)}`
          + `${missing.length ? `; missing ${missing.join(", ")}` : ""}`
          + `${unexpected.length ? `; unexpected ${unexpected.join(", ")}` : ""}`,
      );
    }
  }
  return { panel, path, zones, anchors, removedAmbiguous };
}

function comparePanelEntity(panelRank, left, right) {
  return panelRank.get(left.output.sourcePanel) - panelRank.get(right.output.sourcePanel)
    || compareText(left.id, right.id);
}

/**
 * Translate six independently reviewed local batches into one deterministic
 * global-coordinate batch without touching the production atlas.
 */
export function compileMegaAtlasPanels(layoutValue, batchDocuments, options = {}) {
  const layoutPath = options.layoutPath ?? "<layout>";
  const layout = parseMegaAtlasPanelLayout(layoutValue, layoutPath);
  if (!Array.isArray(batchDocuments) || batchDocuments.length !== layout.panels.length) {
    throw new Error(
      `Expected exactly ${layout.panels.length} reviewed panel batches; received ${batchDocuments?.length ?? 0}`,
    );
  }
  const panelById = new Map(layout.panels.map((panel) => [panel.id, panel]));
  const documentByPanel = new Map();
  for (const [index, document] of batchDocuments.entries()) {
    const documentPath = document?.path || `<batch ${index + 1}>`;
    const panelId = requireText(document?.panelId, `${documentPath}.sourcePanel`);
    if (!panelById.has(panelId)) {
      fail(`${documentPath}.sourcePanel`, `references unknown layout panel ${JSON.stringify(panelId)}`);
    }
    const previous = documentByPanel.get(panelId);
    if (previous) {
      fail(`${documentPath}.sourcePanel`, `duplicate batch for panel ${JSON.stringify(panelId)}; first used at ${previous.path}`);
    }
    documentByPanel.set(panelId, { ...document, path: documentPath });
  }
  for (const panel of layout.panels) {
    if (!documentByPanel.has(panel.id)) {
      throw new Error(`Missing reviewed batch for panel ${JSON.stringify(panel.id)}`);
    }
  }

  const parsedBatches = layout.panels.map((panel) => (
    parsePanelBatch(documentByPanel.get(panel.id), panel)
  ));
  const zoneById = new Map();
  const anchorById = new Map();
  for (const batch of parsedBatches) {
    for (const zone of batch.zones) {
      const previous = zoneById.get(zone.id);
      if (previous) {
        fail(
          zone.authoredAt,
          `duplicate zone id ${JSON.stringify(zone.id)} across panels ${JSON.stringify(previous.output.sourcePanel)} and ${JSON.stringify(zone.output.sourcePanel)}; first used at ${previous.authoredAt}`,
        );
      }
      zoneById.set(zone.id, zone);
    }
    for (const anchor of batch.anchors) {
      const previous = anchorById.get(anchor.id);
      if (previous) {
        fail(
          anchor.authoredAt,
          `duplicate anchor id ${JSON.stringify(anchor.id)} across panels ${JSON.stringify(previous.output.sourcePanel)} and ${JSON.stringify(anchor.output.sourcePanel)}; first used at ${previous.authoredAt}`,
        );
      }
      anchorById.set(anchor.id, anchor);
    }
  }

  const panelRank = new Map(layout.panels.map((panel, index) => [panel.id, index]));
  const zones = parsedBatches
    .flatMap((batch) => batch.zones)
    .sort((left, right) => comparePanelEntity(panelRank, left, right))
    .map((zone) => zone.output);
  const parsedAnchors = parsedBatches
    .flatMap((batch) => batch.anchors)
    .sort((left, right) => comparePanelEntity(panelRank, left, right));
  const anchors = parsedAnchors.map((anchor) => anchor.output);
  const removedAmbiguous = parsedBatches
    .flatMap((batch) => batch.removedAmbiguous)
    .sort((left, right) => (
      panelRank.get(left.sourcePanel) - panelRank.get(right.sourcePanel)
        || compareText(left.candidate, right.candidate)
        || compareText(left.reason, right.reason)
    ));

  const anchorsByWord = new Map();
  for (const anchor of parsedAnchors) {
    const normalizedWord = normalizeWord(anchor.word);
    const duplicates = anchorsByWord.get(normalizedWord) ?? [];
    duplicates.push({
      id: anchor.id,
      word: anchor.word,
      sourcePanel: anchor.output.sourcePanel,
    });
    anchorsByWord.set(normalizedWord, duplicates);
  }
  const duplicateWords = [...anchorsByWord]
    .filter(([, entries]) => entries.length > 1)
    .sort(([left], [right]) => compareText(left, right))
    .map(([normalizedWord, entries]) => ({
      normalizedWord,
      count: entries.length,
      anchors: entries.sort((left, right) => (
        panelRank.get(left.sourcePanel) - panelRank.get(right.sourcePanel)
          || compareText(left.id, right.id)
      )),
    }));
  const duplicateWordAnchorCount = duplicateWords.reduce((sum, group) => sum + group.count, 0);
  const duplicateWordExcessCount = duplicateWords.reduce((sum, group) => sum + group.count - 1, 0);
  const counts = {
    panels: layout.panels.length,
    zones: zones.length,
    anchors: anchors.length,
    removedAmbiguous: removedAmbiguous.length,
    duplicateWordGroups: duplicateWords.length,
    duplicateWordAnchors: duplicateWordAnchorCount,
    duplicateWordExcess: duplicateWordExcessCount,
  };
  const batch = {
    schemaVersion: 1,
    layout,
    counts,
    zones,
    anchors,
    removedAmbiguous,
  };
  const serialized = serializeMegaAtlasPanelBatch(batch);
  return {
    batch,
    report: {
      counts,
      duplicateWords,
      output: {
        bytes: Buffer.byteLength(serialized),
        sha256: sha256(serialized),
      },
    },
  };
}

async function readJsonDocument(path, role) {
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new Error(`Cannot read ${role} ${path}: ${error.message}`, { cause: error });
  }
  try {
    return {
      bytes,
      data: JSON.parse(bytes.toString("utf8")),
      sha256: sha256(bytes),
    };
  } catch (error) {
    throw new Error(`Cannot parse ${role} ${path}: ${error.message}`, { cause: error });
  }
}

export async function runMegaAtlasPanelCompiler({
  layoutPath,
  output,
  force = false,
}) {
  if (!layoutPath) throw new Error("layoutPath is required");
  if (!output) throw new Error("output is required");
  const resolvedLayoutPath = resolve(layoutPath);
  const resolvedOutput = resolve(output);
  if (extname(resolvedOutput).toLocaleLowerCase("en-US") !== ".json") {
    throw new Error(`Output must use a .json extension; received ${resolvedOutput}`);
  }
  const layoutDocument = await readJsonDocument(resolvedLayoutPath, "panel layout");
  const layout = parseMegaAtlasPanelLayout(layoutDocument.data, resolvedLayoutPath);
  const panelDocuments = await Promise.all(layout.panels.map(async (panel) => {
    const path = resolve(dirname(resolvedLayoutPath), panel.file);
    const document = await readJsonDocument(path, `reviewed panel ${panel.id}`);
    return {
      panelId: panel.id,
      path,
      data: document.data,
      bytes: document.bytes,
      sha256: document.sha256,
    };
  }));
  const inputPaths = [resolvedLayoutPath, ...panelDocuments.map(({ path }) => path)];
  if (new Set(inputPaths).size !== inputPaths.length) {
    throw new Error("Layout and reviewed panel batch paths must all be distinct");
  }
  if (inputPaths.includes(resolvedOutput)) {
    throw new Error(`Output must not overwrite an input file ${resolvedOutput}`);
  }

  const compiled = compileMegaAtlasPanels(
    layoutDocument.data,
    panelDocuments,
    { layoutPath: resolvedLayoutPath },
  );
  const serialized = serializeMegaAtlasPanelBatch(compiled.batch);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  try {
    await writeFile(resolvedOutput, serialized, {
      encoding: "utf8",
      flag: force ? "w" : "wx",
    });
  } catch (error) {
    if (!force && error?.code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing output ${resolvedOutput}; pass --force explicitly`);
    }
    throw error;
  }
  const written = await readFile(resolvedOutput);
  const writtenSha256 = sha256(written);
  if (
    written.byteLength !== compiled.report.output.bytes
    || writtenSha256 !== compiled.report.output.sha256
  ) {
    throw new Error(`Written output verification failed for ${resolvedOutput}`);
  }
  return {
    status: "generated",
    outputPath: resolvedOutput,
    canvas: {
      width: compiled.batch.layout.width,
      height: compiled.batch.layout.height,
    },
    counts: compiled.report.counts,
    duplicateWords: compiled.report.duplicateWords,
    output: compiled.report.output,
    inputs: {
      layout: {
        path: resolvedLayoutPath,
        bytes: layoutDocument.bytes.byteLength,
        sha256: layoutDocument.sha256,
      },
      panels: panelDocuments.map((document) => ({
        id: document.panelId,
        path: document.path,
        bytes: document.bytes.byteLength,
        sha256: document.sha256,
      })),
    },
  };
}

function usage() {
  return `Usage:
  node scripts/compile-mega-atlas-panels.mjs <layout.json> --output <global-batch.json> [--force]

Layout schema:
  {"columns":3,"rows":2,"panelWidth":1672,"panelHeight":941,
   "gutters":{"horizontal":0,"vertical":0},
   "panels":[{"id":"school","file":"01-school.json","row":0,"col":0}, ...]}

Each referenced reviewed batch must contain local-coordinate zones, anchors and removedAmbiguous arrays. Existing output is never overwritten unless --force is explicit.`;
}

export function parseMegaAtlasPanelCompilerArguments(argv) {
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
      if (output !== undefined) throw new Error("--output may be specified only once");
      output = argv[index + 1];
      if (!output || output.startsWith("--")) throw new Error("--output requires a path");
      index += 1;
      continue;
    }
    if (argument.startsWith("--output=")) {
      if (output !== undefined) throw new Error("--output may be specified only once");
      output = argument.slice("--output=".length);
      if (!output) throw new Error("--output requires a path");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    positional.push(argument);
  }
  if (positional.length !== 1) {
    throw new Error(`Expected exactly one layout JSON path; received ${positional.length}`);
  }
  if (!output) throw new Error("--output is required; this tool has no implicit destination");
  return { help: false, layoutPath: positional[0], output, force };
}

async function main() {
  const arguments_ = parseMegaAtlasPanelCompilerArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(usage());
    return;
  }
  console.log(JSON.stringify(await runMegaAtlasPanelCompiler(arguments_)));
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`compile-mega-atlas-panels: ${error.message}`);
    process.exitCode = 1;
  });
}
