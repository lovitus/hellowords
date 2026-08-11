import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";
import {
  compareAnchorPatchBaseline,
  createAnchorPatchBaseline,
  measureCentralSeams,
  measureFoliageHueProxy,
  measureQuadrantLuminance,
  selectAnchorPatchSample,
  type AtlasAnchorPoint,
  type RgbFrame,
} from "../../scripts/lib/world-atlas-visual-contract";

const projectRoot = resolve(import.meta.dirname, "../..");
const worldMapPath = resolve(projectRoot, "public/data/scenes/world-map.json");
const acceptedAtlasAsset = "/scenes/world-atlas-master-1600-v2.jpg";
const atlasWidth = 1_600;
const atlasHeight = 900;
const auditedAnchorCount = 301;
const anchorPatchSampleSize = 48;

interface WorldMapDocument {
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly labels: readonly AtlasAnchorPoint[];
}

interface ImagePipeline {
  removeAlpha(): ImagePipeline;
  raw(): ImagePipeline;
  metadata(): Promise<{
    readonly format?: string;
    readonly width?: number;
    readonly height?: number;
  }>;
  toBuffer(options: { readonly resolveWithObject: true }): Promise<{
    readonly data: Buffer;
    readonly info: {
      readonly width: number;
      readonly height: number;
      readonly channels: number;
    };
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;

function rgb(red: number, green: number, blue: number): readonly [number, number, number] {
  return [red, green, blue];
}

function hsv(hue: number, saturation: number, value: number): readonly [number, number, number] {
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = value - chroma;
  const [r, g, b] = hue < 60 ? [chroma, secondary, 0]
    : hue < 120 ? [secondary, chroma, 0]
      : hue < 180 ? [0, chroma, secondary]
        : hue < 240 ? [0, secondary, chroma]
          : hue < 300 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return rgb(Math.round((r + match) * 255), Math.round((g + match) * 255), Math.round((b + match) * 255));
}

function frame(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number],
): RgbFrame {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const [red, green, blue] = pixel(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
    }
  }
  return { width, height, channels: 3, data };
}

function median(values: readonly number[]): number {
  assert.ok(values.length > 0, "median requires samples");
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.round((ordered.length - 1) * 0.5)];
}

test("central seam metric isolates an introduced x/y stitch from ordinary painted gradients", () => {
  const continuous = frame(96, 72, (x, y) => {
    const tone = 10 + x + y;
    return rgb(tone, tone, tone);
  });
  const stitched = frame(96, 72, (x, y) => {
    const tone = 10 + x + y + (x >= 48 ? 42 : 0) + (y >= 36 ? 35 : 0);
    return rgb(tone, tone, tone);
  });
  const continuousMetrics = measureCentralSeams(continuous);
  const stitchedMetrics = measureCentralSeams(stitched);
  assert.ok(continuousMetrics.worstGradientRatio <= 1.01);
  assert.ok(stitchedMetrics.vertical.gradientRatio >= 12);
  assert.ok(stitchedMetrics.horizontal.gradientRatio >= 10);
});

test("half-line seams and joins shifted two pixels from centre cannot be diluted by smooth pixels", () => {
  const shiftedHalfStitch = frame(96, 72, (x, y) => {
    // The join begins only in the left half and one pixel below the literal
    // middle. The old whole-centre median would not inspect this boundary.
    const tone = 10 + x + y + (x < 48 && y >= 37 ? 48 : 0);
    return rgb(tone, tone, tone);
  });
  const metrics = measureCentralSeams(shiftedHalfStitch);
  const literalLeft = metrics.horizontal.segments.find(
    (segment) => segment.segment === "left" && segment.centerOffset === 0,
  );
  const shiftedLeft = metrics.horizontal.segments.find(
    (segment) => segment.segment === "left" && segment.centerOffset === 1,
  );
  assert.ok(literalLeft, "the literal centre boundary is measured");
  assert.ok(shiftedLeft, "the +1 centre-adjacent boundary is measured");
  assert.ok(literalLeft.gradientRatio <= 1.01, "the literal centre itself remains smooth");
  assert.ok(shiftedLeft.gradientRatio >= 15, "the shifted half-line seam is exposed");
  assert.ok(metrics.horizontal.worstGradientRatio >= 15);
  assert.ok(metrics.worstGradientRatio >= 15);
});

test("quadrant luminance reports the exposure spread without hard-coding an atlas threshold", () => {
  const exposureSplit = frame(40, 32, (x, y) => {
    const tone = (y >= 16 ? 60 : 100) + (x >= 20 ? 20 : 0);
    return rgb(tone, tone, tone);
  });
  const metrics = measureQuadrantLuminance(exposureSplit);
  assert.deepEqual(
    [metrics.topLeft, metrics.topRight, metrics.bottomLeft, metrics.bottomRight].map((value) => Math.round(value)),
    [100, 120, 60, 80],
  );
  assert.equal(Math.round(metrics.range), 60);
});

test("green-dominant foliage proxy distinguishes one olive hue from a varied green palette", () => {
  const monotone = frame(90, 30, () => hsv(82, 0.62, 0.62));
  const varied = frame(90, 30, (x) => hsv(x < 30 ? 65 : x < 60 ? 100 : 130, 0.62, 0.62));
  const monotoneMetrics = measureFoliageHueProxy(monotone);
  const variedMetrics = measureFoliageHueProxy(varied);
  assert.ok(monotoneMetrics.hueSpread !== null && monotoneMetrics.hueSpread <= 1);
  assert.ok(monotoneMetrics.circularConcentration !== null && monotoneMetrics.circularConcentration >= 0.99);
  assert.ok(variedMetrics.hueSpread !== null && variedMetrics.hueSpread >= 60);
  assert.ok(variedMetrics.circularConcentration !== null && variedMetrics.circularConcentration < 0.9);
  assert.equal(variedMetrics.naturalGreenFraction, 1);
});

test("anchor patch baseline is stable by id and only reports local detail retention", () => {
  const anchors: readonly AtlasAnchorPoint[] = [
    { id: "oak-canopy", x: 14, y: 14 },
    { id: "river-ripple", x: 33, y: 21 },
    { id: "market-awning", x: 52, y: 38 },
    { id: "garden-path", x: 71, y: 56 },
  ];
  const painted = frame(88, 70, (x, y) => {
    const light = (x * 7 + y * 11) % 2 === 0 ? 208 : 48;
    return rgb(light, Math.min(255, light + 20), Math.max(0, light - 15));
  });
  const flattened = frame(88, 70, () => rgb(128, 128, 128));
  assert.deepEqual(
    selectAnchorPatchSample([...anchors].reverse(), 3).map(({ id }) => id),
    selectAnchorPatchSample(anchors, 3).map(({ id }) => id),
  );
  const baseline = createAnchorPatchBaseline(painted, anchors, { sampleSize: 4, radius: 8 });
  const candidate = createAnchorPatchBaseline(flattened, anchors, { sampleSize: 4, radius: 8 });
  const retained = compareAnchorPatchBaseline(baseline, candidate);
  assert.equal(retained.matchedCount, 4);
  assert.deepEqual(retained.missingIds, []);
  assert.ok(retained.luminanceRangeMedianRatio !== null && retained.luminanceRangeMedianRatio < 0.01);
  assert.ok(retained.gradientMedianRatio !== null && retained.gradientMedianRatio < 0.01);
});

test("accepted world atlas v2 locks its improved join, balanced exposure, varied foliage and local detail", async () => {
  const scene = JSON.parse(await readFile(worldMapPath, "utf8")) as WorldMapDocument;
  assert.equal(scene.asset, acceptedAtlasAsset, "the contract follows the asset published by world-map JSON");
  assert.equal(scene.width, atlasWidth);
  assert.equal(scene.height, atlasHeight);
  assert.equal(scene.labels.length, auditedAnchorCount, "all audited world-map anchors remain available");

  const assetFile = resolve(projectRoot, "public", scene.asset.replace(/^\//u, ""));
  const [metadata, decoded] = await Promise.all([
    decodeImage(assetFile).metadata(),
    decodeImage(assetFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, atlasWidth);
  assert.equal(metadata.height, atlasHeight);
  assert.equal(decoded.info.width, atlasWidth);
  assert.equal(decoded.info.height, atlasHeight);
  assert.equal(decoded.info.channels, 3, "the accepted atlas decodes to RGB pixels");
  const atlasFrame: RgbFrame = {
    width: decoded.info.width,
    height: decoded.info.height,
    channels: 3,
    data: decoded.data,
  };

  const luminance = measureQuadrantLuminance(atlasFrame);
  assert.ok(
    luminance.range <= 8,
    `atlas quadrant luminance range is ${luminance.range.toFixed(3)}, expected at most 8`,
  );

  const seams = measureCentralSeams(atlasFrame);
  assert.ok(
    seams.vertical.worstGradientRatio <= 1.3,
    `vertical centre seam ratio is ${seams.vertical.worstGradientRatio.toFixed(3)}, expected at most 1.3`,
  );
  // The accepted painting retains a small horizontal transition around its
  // central river. 1.65 is its explicit residual ceiling, not a claim that it
  // met the stricter 1.25 ideal used while selecting candidates.
  assert.ok(
    seams.horizontal.worstGradientRatio <= 1.65,
    `horizontal centre seam ratio is ${seams.horizontal.worstGradientRatio.toFixed(3)}, expected at most 1.65`,
  );

  const foliage = measureFoliageHueProxy(atlasFrame);
  assert.ok(foliage.sampleCount >= atlasWidth * atlasHeight * 0.1, "foliage proxy has a representative pixel sample");
  assert.ok(foliage.hueSpread !== null && foliage.hueSpread >= 55, `foliage hue spread is ${foliage.hueSpread}`);
  assert.ok(
    foliage.circularConcentration !== null && foliage.circularConcentration <= 0.92,
    `foliage hue concentration is ${foliage.circularConcentration}`,
  );
  assert.ok(
    foliage.naturalGreenFraction !== null && foliage.naturalGreenFraction >= 0.88,
    `natural-green foliage fraction is ${foliage.naturalGreenFraction}`,
  );

  const patches = createAnchorPatchBaseline(atlasFrame, scene.labels, {
    sampleSize: anchorPatchSampleSize,
    radius: 16,
  });
  assert.ok(patches.sampleSize >= 40, "the stable anchor sample covers at least forty audited points");
  const luminanceRangeMedian = median(patches.patches.map((patch) => patch.luminanceRange));
  const gradientMedian = median(patches.patches.map((patch) => patch.meanGradient));
  // Accepted v2 measures 129.863 and 19.449 respectively. These 20%-margin
  // floors catch whole-image softening without pretending to recognize objects.
  assert.ok(
    luminanceRangeMedian >= 104,
    `anchor-patch luminance-range median is ${luminanceRangeMedian.toFixed(3)}, expected at least 104`,
  );
  assert.ok(
    gradientMedian >= 15.5,
    `anchor-patch gradient median is ${gradientMedian.toFixed(3)}, expected at least 15.5`,
  );
});
