#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const GRID_COLUMNS = 3;
const GRID_ROWS = 2;
const TILE_COUNT = GRID_COLUMNS * GRID_ROWS;
const STONE_JOINT_INTERVAL = 48;
const STONE_EDGE_SHADOW_RADIUS = 10;
const STONE_RGB = Object.freeze({ r: 151, g: 147, b: 138 });
const SUPPORTED_INPUT_FORMATS = new Set(["avif", "heif", "jpeg", "png", "tiff", "webp"]);
const PNG_OPTIONS = Object.freeze({
  adaptiveFiltering: false,
  compressionLevel: 9,
  effort: 10,
  palette: false,
});
const JPEG_HIGH_OPTIONS = Object.freeze({
  quality: 85,
  chromaSubsampling: "4:4:4",
  progressive: true,
  mozjpeg: true,
});
const JPEG_BASE_OPTIONS = Object.freeze({
  quality: 88,
  chromaSubsampling: "4:4:4",
  progressive: true,
  mozjpeg: false,
});

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer; received ${value}`);
  }
  return value;
}

export function createMegaAtlasRasterContract(tileWidth, tileHeight, gutter = 0) {
  const checkedTileWidth = requirePositiveInteger(tileWidth, "tileWidth");
  const checkedTileHeight = requirePositiveInteger(tileHeight, "tileHeight");
  if (!Number.isSafeInteger(gutter) || gutter < 0) {
    throw new Error(`gutter must be a non-negative safe integer; received ${gutter}`);
  }
  const highWidth = checkedTileWidth * GRID_COLUMNS + gutter * (GRID_COLUMNS - 1);
  const highHeight = checkedTileHeight * GRID_ROWS + gutter * (GRID_ROWS - 1);
  if (highWidth % 2 !== 0 || highHeight % 2 !== 0) {
    throw new Error(
      `The assembled ${highWidth} x ${highHeight} raster cannot be downsampled exactly by 2`,
    );
  }
  return Object.freeze({
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    tileCount: TILE_COUNT,
    tileWidth: checkedTileWidth,
    tileHeight: checkedTileHeight,
    gutter,
    highWidth,
    highHeight,
    baseWidth: highWidth / 2,
    baseHeight: highHeight / 2,
  });
}

export const MEGA_ATLAS_RASTER_CONTRACT = createMegaAtlasRasterContract(1_672, 941, 96);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function outputFormat(path, role) {
  const extension = extname(path).toLocaleLowerCase("en-US");
  if (extension === ".png") return "png";
  if (extension === ".jpg" || extension === ".jpeg") return "jpeg";
  throw new Error(`${role} output must use a .png, .jpg or .jpeg extension; received ${path}`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function decodeTile(path, contract, index) {
  let source;
  try {
    source = await readFile(path);
  } catch (error) {
    throw new Error(`Cannot read input tile ${path}: ${error.message}`, { cause: error });
  }

  let metadata;
  try {
    metadata = await sharp(source, { failOn: "error", sequentialRead: true }).metadata();
  } catch (error) {
    throw new Error(`Cannot decode input tile ${path}: ${error.message}`, { cause: error });
  }
  if (!metadata.format || !SUPPORTED_INPUT_FORMATS.has(metadata.format)) {
    fail(path, `unsupported raster format ${JSON.stringify(metadata.format ?? null)}`);
  }
  if (metadata.width !== contract.tileWidth || metadata.height !== contract.tileHeight) {
    fail(
      path,
      `expected exactly ${contract.tileWidth} x ${contract.tileHeight}; received ${metadata.width ?? "unknown"} x ${metadata.height ?? "unknown"}`,
    );
  }
  if (metadata.depth !== "uchar") {
    fail(path, `expected 8-bit pixels; received depth=${metadata.depth ?? "unknown"}`);
  }
  if (metadata.space !== "srgb" || (metadata.channels !== 3 && metadata.channels !== 4)) {
    fail(
      path,
      `expected RGB or RGBA pixels; received space=${metadata.space ?? "unknown"}, channels=${metadata.channels ?? "unknown"}`,
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    fail(path, `expected one still raster frame; received ${metadata.pages} frames/pages`);
  }
  if (metadata.orientation !== undefined && metadata.orientation !== 1) {
    fail(path, `orientation metadata must be absent or 1; received ${metadata.orientation}`);
  }

  const { data, info } = await sharp(source, { failOn: "error", sequentialRead: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    info.width !== contract.tileWidth
    || info.height !== contract.tileHeight
    || (info.channels !== 3 && info.channels !== 4)
  ) {
    fail(
      path,
      `decoded pixels violate the validated raster contract (${info.width} x ${info.height} x ${info.channels})`,
    );
  }

  return {
    path,
    index,
    row: Math.floor(index / GRID_COLUMNS),
    column: index % GRID_COLUMNS,
    x: (index % GRID_COLUMNS) * (contract.tileWidth + contract.gutter),
    y: Math.floor(index / GRID_COLUMNS) * (contract.tileHeight + contract.gutter),
    sourceBytes: source.byteLength,
    sourceSha256: sha256(source),
    format: metadata.format,
    channels: info.channels,
    pixels: data,
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function gutterOffset(value, tileSize, gutter, itemCount) {
  if (gutter === 0) return null;
  const stride = tileSize + gutter;
  const itemIndex = Math.floor(value / stride);
  const local = value - itemIndex * stride;
  return itemIndex < itemCount - 1 && local >= tileSize ? local - tileSize : null;
}

function distanceToStoneJoint(value) {
  const position = value % STONE_JOINT_INTERVAL;
  return Math.min(position, STONE_JOINT_INTERVAL - position);
}

function stonePixel(x, y, contract) {
  const gutterX = gutterOffset(x, contract.tileWidth, contract.gutter, GRID_COLUMNS);
  const gutterY = gutterOffset(y, contract.tileHeight, contract.gutter, GRID_ROWS);
  const jointX = distanceToStoneJoint(gutterX ?? x);
  const jointY = distanceToStoneJoint(gutterY ?? y);
  const jointDistance = Math.min(jointX, jointY);
  const jointShade = jointDistance === 0 ? -18 : jointDistance === 1 ? -7 : 0;

  let edgeDistance = Number.POSITIVE_INFINITY;
  if (gutterX !== null) {
    edgeDistance = Math.min(edgeDistance, gutterX, contract.gutter - 1 - gutterX);
  }
  if (gutterY !== null) {
    edgeDistance = Math.min(edgeDistance, gutterY, contract.gutter - 1 - gutterY);
  }
  const edgeShade = edgeDistance < STONE_EDGE_SHADOW_RADIUS
    ? -Math.round((STONE_EDGE_SHADOW_RADIUS - edgeDistance) * 1.1)
    : 0;

  const hash = (
    Math.imul(x + 1, 73_856_093)
    ^ Math.imul(y + 1, 19_349_663)
    ^ Math.imul(x + y + 1, 83_492_791)
  ) >>> 0;
  const grain = (hash & 7) - 3;
  const fleck = ((hash >>> 8) & 63) === 0 ? 7 : 0;
  const slabX = Math.floor((gutterX ?? x) / STONE_JOINT_INTERVAL);
  const slabY = Math.floor((gutterY ?? y) / STONE_JOINT_INTERVAL);
  const slabTone = ((slabX + slabY) % 3 - 1) * 2;
  const tone = grain + fleck + slabTone + jointShade + edgeShade;
  return [
    clampByte(STONE_RGB.r + tone),
    clampByte(STONE_RGB.g + tone),
    clampByte(STONE_RGB.b + Math.round(tone * 0.8)),
  ];
}

function fillStoneBackground(pixels, contract, channels) {
  if (contract.gutter === 0) return;
  const writeStonePixel = (x, y) => {
    const [red, green, blue] = stonePixel(x, y, contract);
    const offset = (y * contract.highWidth + x) * channels;
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    if (channels === 4) pixels[offset + 3] = 255;
  };
  for (let column = 0; column < GRID_COLUMNS - 1; column += 1) {
    const startX = (column + 1) * contract.tileWidth + column * contract.gutter;
    for (let y = 0; y < contract.highHeight; y += 1) {
      for (let x = startX; x < startX + contract.gutter; x += 1) {
        writeStonePixel(x, y);
      }
    }
  }
  for (let row = 0; row < GRID_ROWS - 1; row += 1) {
    const startY = (row + 1) * contract.tileHeight + row * contract.gutter;
    for (let y = startY; y < startY + contract.gutter; y += 1) {
      for (let x = 0; x < contract.highWidth; x += 1) {
        writeStonePixel(x, y);
      }
    }
  }
}

function assembleHighPixels(tiles, contract) {
  const channels = tiles.some((tile) => tile.channels === 4) ? 4 : 3;
  const pixels = Buffer.alloc(contract.highWidth * contract.highHeight * channels);
  fillStoneBackground(pixels, contract, channels);

  for (const tile of tiles) {
    const xOffset = tile.x;
    const yOffset = tile.y;
    for (let y = 0; y < contract.tileHeight; y += 1) {
      const sourceStart = y * contract.tileWidth * tile.channels;
      const targetStart = (
        (yOffset + y) * contract.highWidth + xOffset
      ) * channels;
      if (tile.channels === channels) {
        tile.pixels.copy(
          pixels,
          targetStart,
          sourceStart,
          sourceStart + contract.tileWidth * channels,
        );
        continue;
      }
      for (let x = 0; x < contract.tileWidth; x += 1) {
        const sourceOffset = sourceStart + x * 3;
        const targetOffset = targetStart + x * 4;
        pixels[targetOffset] = tile.pixels[sourceOffset];
        pixels[targetOffset + 1] = tile.pixels[sourceOffset + 1];
        pixels[targetOffset + 2] = tile.pixels[sourceOffset + 2];
        pixels[targetOffset + 3] = 255;
      }
    }
  }
  return { channels, pixels };
}

function imagePipeline(frame) {
  return sharp(frame.pixels, {
    raw: {
      width: frame.width,
      height: frame.height,
      channels: frame.channels,
    },
  });
}

async function encodeFrame(frame, format, role) {
  const pipeline = imagePipeline(frame);
  if (format === "png") return pipeline.png(PNG_OPTIONS).toBuffer();
  if (frame.channels === 4) pipeline.flatten({ background: STONE_RGB });
  return pipeline
    .jpeg(role === "high" ? JPEG_HIGH_OPTIONS : JPEG_BASE_OPTIONS)
    .toBuffer();
}

async function encodeOutputs(tiles, contract, highFormat, baseFormat) {
  const highPixels = assembleHighPixels(tiles, contract);
  const highFrame = {
    ...highPixels,
    width: contract.highWidth,
    height: contract.highHeight,
  };
  const { data: basePixels, info: baseInfo } = await imagePipeline(highFrame)
    .resize({
      width: contract.baseWidth,
      height: contract.baseHeight,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const baseFrame = {
    pixels: basePixels,
    width: baseInfo.width,
    height: baseInfo.height,
    channels: baseInfo.channels,
  };
  const [high, base] = await Promise.all([
    encodeFrame(highFrame, highFormat, "high"),
    encodeFrame(baseFrame, baseFormat, "base"),
  ]);
  return { high, base, highFrame, baseFrame };
}

async function validateOutput(bytes, role, format, width, height, channels) {
  const metadata = await sharp(bytes, { failOn: "error", sequentialRead: true }).metadata();
  const expectedChannels = format === "jpeg" ? 3 : channels;
  if (
    metadata.format !== format
    || metadata.width !== width
    || metadata.height !== height
    || metadata.channels !== expectedChannels
    || (format === "jpeg" && metadata.isProgressive !== true)
    || (format === "jpeg" && metadata.chromaSubsampling !== "4:4:4")
  ) {
    throw new Error(
      `${role} output validation failed: expected ${format} ${width} x ${height} x ${expectedChannels}; received ${metadata.format ?? "unknown"} ${metadata.width ?? "unknown"} x ${metadata.height ?? "unknown"} x ${metadata.channels ?? "unknown"}`,
    );
  }
  return metadata;
}

function outputSummary(path, bytes, metadata) {
  return {
    path,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

export async function runMegaAtlasRasterAssembler({
  inputPaths,
  highOutput,
  baseOutput,
  force = false,
  contract = MEGA_ATLAS_RASTER_CONTRACT,
}) {
  const checkedContract = createMegaAtlasRasterContract(
    contract?.tileWidth,
    contract?.tileHeight,
    contract?.gutter,
  );
  if (!Array.isArray(inputPaths) || inputPaths.length !== TILE_COUNT) {
    throw new Error(`Expected exactly ${TILE_COUNT} input tiles; received ${inputPaths?.length ?? 0}`);
  }
  const resolvedInputs = inputPaths.map((path) => resolve(path));
  if (new Set(resolvedInputs).size !== resolvedInputs.length) {
    throw new Error("Each of the six input tile paths must be unique");
  }
  if (!highOutput || !baseOutput) {
    throw new Error("Both highOutput and baseOutput paths are required");
  }
  const resolvedHighOutput = resolve(highOutput);
  const resolvedBaseOutput = resolve(baseOutput);
  const highFormat = outputFormat(resolvedHighOutput, "High");
  const baseFormat = outputFormat(resolvedBaseOutput, "Base");
  if (resolvedHighOutput === resolvedBaseOutput) {
    throw new Error("High and base outputs must use different paths");
  }
  if (resolvedInputs.includes(resolvedHighOutput) || resolvedInputs.includes(resolvedBaseOutput)) {
    throw new Error("An output path must not overwrite an input tile");
  }
  if (!force) {
    for (const output of [resolvedHighOutput, resolvedBaseOutput]) {
      if (await pathExists(output)) {
        throw new Error(`Refusing to overwrite existing output ${output}; pass --force explicitly`);
      }
    }
  }

  const tiles = await Promise.all(
    resolvedInputs.map((path, index) => decodeTile(path, checkedContract, index)),
  );
  const encoded = await encodeOutputs(tiles, checkedContract, highFormat, baseFormat);
  await Promise.all([
    mkdir(dirname(resolvedHighOutput), { recursive: true }),
    mkdir(dirname(resolvedBaseOutput), { recursive: true }),
  ]);
  const writeFlag = force ? "w" : "wx";
  await writeFile(resolvedHighOutput, encoded.high, { flag: writeFlag });
  await writeFile(resolvedBaseOutput, encoded.base, { flag: writeFlag });

  const [writtenHigh, writtenBase] = await Promise.all([
    readFile(resolvedHighOutput),
    readFile(resolvedBaseOutput),
  ]);
  const [highMetadata, baseMetadata] = await Promise.all([
    validateOutput(
      writtenHigh,
      "High",
      highFormat,
      checkedContract.highWidth,
      checkedContract.highHeight,
      encoded.highFrame.channels,
    ),
    validateOutput(
      writtenBase,
      "Base",
      baseFormat,
      checkedContract.baseWidth,
      checkedContract.baseHeight,
      encoded.baseFrame.channels,
    ),
  ]);

  return {
    status: "generated",
    layout: checkedContract,
    inputs: tiles.map((tile) => ({
      path: tile.path,
      row: tile.row,
      column: tile.column,
      x: tile.x,
      y: tile.y,
      format: tile.format,
      width: checkedContract.tileWidth,
      height: checkedContract.tileHeight,
      channels: tile.channels,
      bytes: tile.sourceBytes,
      sha256: tile.sourceSha256,
    })),
    high: outputSummary(resolvedHighOutput, writtenHigh, highMetadata),
    base: outputSummary(resolvedBaseOutput, writtenBase, baseMetadata),
  };
}

function usage() {
  return `Usage:
  node scripts/assemble-mega-atlas-raster.mjs <top-left> <top-centre> <top-right> <bottom-left> <bottom-centre> <bottom-right> --high <5208x1978.png|jpg> --base <2604x989.png|jpg> [--force]

Inputs must be six distinct, still 1672 x 941 8-bit RGB/RGBA PNG, JPEG, WebP, AVIF or TIFF rasters. Tiles are copied without resizing or cropping around deterministic 96 px stone-path gutters. PNG is lossless; JPEG uses progressive 4:4:4 MozJPEG quality 85 for high and standard quality 88 for base. The base is an exact 1/2 Lanczos3 downsample of the original assembled pixels, never of the encoded high output.`;
}

export function parseMegaAtlasRasterArguments(argv) {
  const inputPaths = [];
  let highOutput;
  let baseOutput;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "--high" || argument === "--base") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path`);
      if (argument === "--high") {
        if (highOutput !== undefined) throw new Error("--high may be specified only once");
        highOutput = value;
      } else {
        if (baseOutput !== undefined) throw new Error("--base may be specified only once");
        baseOutput = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--high=")) {
      if (highOutput !== undefined) throw new Error("--high may be specified only once");
      highOutput = argument.slice("--high=".length);
      if (!highOutput) throw new Error("--high requires a path");
      continue;
    }
    if (argument.startsWith("--base=")) {
      if (baseOutput !== undefined) throw new Error("--base may be specified only once");
      baseOutput = argument.slice("--base=".length);
      if (!baseOutput) throw new Error("--base requires a path");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    inputPaths.push(argument);
  }
  if (inputPaths.length !== TILE_COUNT) {
    throw new Error(`Expected exactly ${TILE_COUNT} input tiles; received ${inputPaths.length}`);
  }
  if (!highOutput) throw new Error("--high is required");
  if (!baseOutput) throw new Error("--base is required");
  return { help: false, inputPaths, highOutput, baseOutput, force };
}

async function main() {
  const arguments_ = parseMegaAtlasRasterArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(usage());
    return;
  }
  const result = await runMegaAtlasRasterAssembler(arguments_);
  console.log(JSON.stringify(result));
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`assemble-mega-atlas-raster: ${error.message}`);
    process.exitCode = 1;
  });
}
