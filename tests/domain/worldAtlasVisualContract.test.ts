import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const panelWidth = 1_672;
const panelHeight = 941;
const roadWidth = 96;
const highWidth = 5_208;
const highHeight = 1_978;
const baseWidth = 2_604;
const baseHeight = 989;
// The production high tier is progressive 4:4:4 MozJPEG q85. Keep this
// fidelity floor intentionally narrow: it accommodates encoder quantisation
// without relaxing the independent MAE, gradient-retention, entropy, or
// brightness/colour checks below.
const highPanelMaeCeiling = 4.75;
const highPanelPsnrFloorDb = 32.5;
const stoneRoadGradientFloor = 1.25;
const stoneRoadCrossingGradientFloor = 1.1;

interface ImageContract {
  readonly path: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly format: "jpeg" | "png";
}

interface PanelContract extends ImageContract {
  readonly id: string;
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
}

interface RgbFrame {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly channels: 3;
}

interface ImagePipeline {
  metadata(): Promise<{
    readonly format?: string;
    readonly width?: number;
    readonly height?: number;
  }>;
  removeAlpha(): ImagePipeline;
  raw(): ImagePipeline;
  resize(width: number, height: number, options: { readonly kernel: "lanczos3" }): ImagePipeline;
  toBuffer(options: { readonly resolveWithObject: true }): Promise<{
    readonly data: Buffer;
    readonly info: {
      readonly width: number;
      readonly height: number;
      readonly channels: number;
    };
  }>;
  toColourspace(colourspace: "srgb"): ImagePipeline;
}

interface TextureMetrics {
  readonly meanGradient: number;
  readonly entropy: number;
  readonly luminanceSpan: number;
  readonly meanRgb: readonly [number, number, number];
  readonly meanChroma: number;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;

const panels: readonly PanelContract[] = [
  {
    id: "school-classroom",
    path: "scripts/assets/mega-atlas-v21/01-school-classroom-v1.png",
    sha256: "d0a04bebd7b4c43b5d1f426dc91d584cd89275365f760b0507337b50f23af9d1",
    width: panelWidth,
    height: panelHeight,
    format: "png",
    row: 0,
    col: 0,
    x: 0,
    y: 0,
  },
  {
    id: "science-maker",
    path: "scripts/assets/mega-atlas-v21/02-science-maker-v1.png",
    sha256: "f2f0a67e23ced774e050573af837f84b8644113c170a3a01b5a260bc80a6cb50",
    width: panelWidth,
    height: panelHeight,
    format: "png",
    row: 0,
    col: 1,
    x: 1_768,
    y: 0,
  },
  {
    id: "transport-mobility",
    path: "scripts/assets/mega-atlas-v21/04-transport-mobility-v2.png",
    sha256: "2c270045c73aa2102a8438cf9bdb39f20ab310999c54f2f33cc798a6c24453bd",
    width: panelWidth,
    height: panelHeight,
    format: "png",
    row: 0,
    col: 2,
    x: 3_536,
    y: 0,
  },
  {
    id: "farm-food-production",
    path: "scripts/assets/mega-atlas-v21/05-farm-food-production-v1.png",
    sha256: "9da4fa76b2c841aec11abfc95d4175126cce2764d7b458f52e968c04f36fc5f3",
    width: panelWidth,
    height: panelHeight,
    format: "png",
    row: 1,
    col: 0,
    x: 0,
    y: 1_037,
  },
  {
    id: "market-kitchen-bakery",
    path: "scripts/assets/mega-atlas-v21/03-market-kitchen-bakery-v1.png",
    sha256: "0d895b631174ef09ed2107dedcd89c1a87bcca03578694273706e5bca70c40f3",
    width: panelWidth,
    height: panelHeight,
    format: "png",
    row: 1,
    col: 1,
    x: 1_768,
    y: 1_037,
  },
  {
    id: "wetland-coast",
    path: "scripts/assets/mega-atlas-v21/06-wetland-coast-v2.png",
    sha256: "bb19380921a473143f80c1676d904a163a93199e8b8b1f65abd30f3fd2f28745",
    width: panelWidth,
    height: panelHeight,
    format: "png",
    row: 1,
    col: 2,
    x: 3_536,
    y: 1_037,
  },
];

const compiledAssets: readonly ImageContract[] = [
  {
    path: "public/scenes/world-mega-atlas-2604-v21.jpg",
    sha256: "1f604a7727b9d18cf4d4447eaf88b5883eb3720f6d4540bdd1af6c86654bd54d",
    width: baseWidth,
    height: baseHeight,
    format: "jpeg",
  },
  {
    path: "public/scenes/world-mega-atlas-5208-v21.jpg",
    sha256: "8761e582e58bfb2aa46443c0eb9000a1a87b6582d23718a1be71c609258dc9a4",
    width: highWidth,
    height: highHeight,
    format: "jpeg",
  },
];

function absolutePath(relativePath: string): string {
  return resolve(projectRoot, relativePath);
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function decodeRgb(filePath: string): Promise<RgbFrame> {
  const decoded = await decodeImage(filePath)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.channels, 3, `${filePath} must decode to RGB`);
  return {
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: 3,
  };
}

function cropFrame(
  frame: RgbFrame,
  left: number,
  top: number,
  width: number,
  height: number,
): RgbFrame {
  assert.ok(left >= 0 && top >= 0 && width > 0 && height > 0);
  assert.ok(left + width <= frame.width && top + height <= frame.height);
  const data = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = ((top + row) * frame.width + left) * 3;
    const targetOffset = row * width * 3;
    data.set(frame.data.subarray(sourceOffset, sourceOffset + width * 3), targetOffset);
  }
  return { data, width, height, channels: 3 };
}

function compareFrames(
  reference: RgbFrame,
  candidate: RgbFrame,
): { readonly mae: number; readonly psnr: number } {
  assert.equal(candidate.width, reference.width);
  assert.equal(candidate.height, reference.height);
  assert.equal(candidate.data.length, reference.data.length);
  let absoluteError = 0;
  let squaredError = 0;
  for (let index = 0; index < reference.data.length; index += 1) {
    const delta = (candidate.data[index] ?? 0) - (reference.data[index] ?? 0);
    absoluteError += Math.abs(delta);
    squaredError += delta * delta;
  }
  const mae = absoluteError / reference.data.length;
  const mse = squaredError / reference.data.length;
  return {
    mae,
    psnr: mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse),
  };
}

function histogramPercentile(histogram: Uint32Array, sampleCount: number, percentile: number): number {
  const target = Math.max(1, Math.ceil(sampleCount * percentile));
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    cumulative += histogram[value] ?? 0;
    if (cumulative >= target) return value;
  }
  return histogram.length - 1;
}

function measureTexture(frame: RgbFrame): TextureMetrics {
  const histogram = new Uint32Array(256);
  const luminance = new Float64Array(frame.width * frame.height);
  const channelTotals = [0, 0, 0];
  let gradientTotal = 0;
  let gradientCount = 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const pixel = y * frame.width + x;
      const offset = pixel * 3;
      const red = frame.data[offset] ?? 0;
      const green = frame.data[offset + 1] ?? 0;
      const blue = frame.data[offset + 2] ?? 0;
      channelTotals[0] += red;
      channelTotals[1] += green;
      channelTotals[2] += blue;
      const light = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      luminance[pixel] = light;
      const bin = Math.min(255, Math.max(0, Math.round(light)));
      histogram[bin] = (histogram[bin] ?? 0) + 1;
      if (x > 0) {
        gradientTotal += Math.abs(light - (luminance[pixel - 1] ?? light));
        gradientCount += 1;
      }
      if (y > 0) {
        gradientTotal += Math.abs(light - (luminance[pixel - frame.width] ?? light));
        gradientCount += 1;
      }
    }
  }

  const sampleCount = frame.width * frame.height;
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const probability = count / sampleCount;
    entropy -= probability * Math.log2(probability);
  }
  const meanRgb = channelTotals.map((total) => total / sampleCount) as [number, number, number];
  return {
    meanGradient: gradientTotal / gradientCount,
    entropy,
    luminanceSpan:
      histogramPercentile(histogram, sampleCount, 0.95)
      - histogramPercentile(histogram, sampleCount, 0.05),
    meanRgb,
    meanChroma: Math.max(...meanRgb) - Math.min(...meanRgb),
  };
}

test("v21 source panels and compiled variants keep immutable paths, hashes, and dimensions", async () => {
  for (const asset of [...panels, ...compiledAssets]) {
    const filePath = absolutePath(asset.path);
    const [digest, metadata] = await Promise.all([
      sha256File(filePath),
      decodeImage(filePath).metadata(),
    ]);
    assert.equal(digest, asset.sha256, `${asset.path} SHA-256 changed`);
    assert.equal(metadata.format, asset.format, `${asset.path} format changed`);
    assert.equal(metadata.width, asset.width, `${asset.path} width changed`);
    assert.equal(metadata.height, asset.height, `${asset.path} height changed`);
  }
});

test("high atlas keeps all six panels at their reviewed 3 by 2 composition origins", async () => {
  const highAtlas = await decodeRgb(absolutePath(compiledAssets[1].path));
  assert.equal(highAtlas.width, highWidth);
  assert.equal(highAtlas.height, highHeight);

  for (const panel of panels) {
    assert.equal(panel.x, panel.col * (panelWidth + roadWidth), `${panel.id} column origin changed`);
    assert.equal(panel.y, panel.row * (panelHeight + roadWidth), `${panel.id} row origin changed`);
    const [source, sourceMetrics] = await (async () => {
      const decoded = await decodeRgb(absolutePath(panel.path));
      return [decoded, measureTexture(decoded)] as const;
    })();
    const atlasCrop = cropFrame(highAtlas, panel.x, panel.y, panelWidth, panelHeight);
    const atlasMetrics = measureTexture(atlasCrop);
    const fidelity = compareFrames(source, atlasCrop);
    const gradientRetention = atlasMetrics.meanGradient / sourceMetrics.meanGradient;

    assert.ok(
      fidelity.mae <= highPanelMaeCeiling,
      `${panel.id} mean absolute JPEG error is ${fidelity.mae.toFixed(3)}, expected at most ${highPanelMaeCeiling}`,
    );
    assert.ok(
      fidelity.psnr >= highPanelPsnrFloorDb,
      `${panel.id} PSNR is ${fidelity.psnr.toFixed(3)} dB, expected at least ${highPanelPsnrFloorDb} dB`,
    );
    assert.ok(
      gradientRetention >= 0.94 && gradientRetention <= 1.08,
      `${panel.id} local-gradient retention is ${gradientRetention.toFixed(3)}`,
    );
    assert.ok(
      atlasMetrics.meanGradient >= 10,
      `${panel.id} mean local gradient is ${atlasMetrics.meanGradient.toFixed(3)}, indicating overall blur`,
    );
    assert.ok(
      atlasMetrics.entropy >= 7.35,
      `${panel.id} luminance entropy is ${atlasMetrics.entropy.toFixed(3)}, indicating flattened texture`,
    );
  }

  assert.equal(highWidth, panelWidth * 3 + roadWidth * 2);
  assert.equal(highHeight, panelHeight * 2 + roadWidth);
});

test("base atlas remains a faithful half-scale rendition of the reviewed high atlas", async () => {
  const baseAtlas = await decodeRgb(absolutePath(compiledAssets[0].path));
  const downsampled = await decodeImage(absolutePath(compiledAssets[1].path))
    .resize(baseWidth, baseHeight, { kernel: "lanczos3" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(downsampled.info.channels, 3);
  const downsampledFrame: RgbFrame = {
    data: downsampled.data,
    width: downsampled.info.width,
    height: downsampled.info.height,
    channels: 3,
  };
  const fidelity = compareFrames(downsampledFrame, baseAtlas);
  const texture = measureTexture(baseAtlas);

  assert.ok(fidelity.mae <= 4.5, `base/high-half MAE is ${fidelity.mae.toFixed(3)}`);
  assert.ok(fidelity.psnr >= 33, `base/high-half PSNR is ${fidelity.psnr.toFixed(3)} dB`);
  assert.ok(texture.meanGradient >= 15, `base mean gradient is ${texture.meanGradient.toFixed(3)}`);
  assert.ok(texture.entropy >= 7.4, `base luminance entropy is ${texture.entropy.toFixed(3)}`);
});

test("96px neutral stone roads stay visible, coherent, and locally textured", async () => {
  const highAtlas = await decodeRgb(absolutePath(compiledAssets[1].path));
  const roadSamples = [
    { id: "left vertical road", left: panelWidth + 8, top: 100, width: roadWidth - 16, height: 760 },
    {
      id: "right vertical road",
      left: panelWidth * 2 + roadWidth + 8,
      top: 100,
      width: roadWidth - 16,
      height: 760,
    },
    {
      id: "horizontal road",
      left: 100,
      top: panelHeight + 8,
      width: highWidth - 200,
      height: roadWidth - 16,
    },
    {
      id: "road crossing",
      left: panelWidth + 8,
      top: panelHeight + 8,
      width: roadWidth - 16,
      height: roadWidth - 16,
    },
  ] as const;

  const metrics = roadSamples.map((sample) => ({
    id: sample.id,
    metrics: measureTexture(cropFrame(highAtlas, sample.left, sample.top, sample.width, sample.height)),
  }));
  for (const sample of metrics) {
    const { meanGradient, entropy, luminanceSpan, meanRgb, meanChroma } = sample.metrics;
    const gradientFloor = sample.id === "road crossing"
      ? stoneRoadCrossingGradientFloor
      : stoneRoadGradientFloor;
    assert.ok(
      meanGradient >= gradientFloor && meanGradient <= 3.5,
      `${sample.id} mean gradient ${meanGradient.toFixed(3)} is not stone-like`,
    );
    assert.ok(entropy >= 3.35, `${sample.id} entropy ${entropy.toFixed(3)} is too flat`);
    assert.ok(luminanceSpan >= 9, `${sample.id} p05-p95 span ${luminanceSpan} is too flat`);
    assert.ok(meanRgb[0] >= 147 && meanRgb[0] <= 154, `${sample.id} red mean changed`);
    assert.ok(meanRgb[1] >= 143 && meanRgb[1] <= 151, `${sample.id} green mean changed`);
    assert.ok(meanRgb[2] >= 133 && meanRgb[2] <= 142, `${sample.id} blue mean changed`);
    assert.ok(
      meanChroma >= 10 && meanChroma <= 17,
      `${sample.id} mean chroma ${meanChroma.toFixed(3)} is no longer neutral stone`,
    );
  }

  const roadRedMeans = metrics.map(({ metrics: sample }) => sample.meanRgb[0]);
  assert.ok(
    Math.max(...roadRedMeans) - Math.min(...roadRedMeans) <= 1.5,
    "stone road colour is inconsistent across routes",
  );
});
