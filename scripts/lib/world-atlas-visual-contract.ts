/**
 * Deterministic, pixel-only checks for the master world atlas.
 *
 * These metrics deliberately do not claim that an anchor still depicts the
 * same semantic object. They catch visual regressions (stitch seams, uneven
 * exposure, monochrome foliage proxies, and flattened local detail) while a
 * human anchor audit remains responsible for semantic grounding.
 */

export interface RgbFrame {
  readonly width: number;
  readonly height: number;
  /** RGB or RGBA interleaved bytes. Alpha is deliberately ignored. */
  readonly channels: 3 | 4;
  readonly data: Uint8Array;
}

export interface AtlasAnchorPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface SeamGradientMetric {
  readonly sampleCount: number;
  readonly seamMedianGradient: number;
  readonly localMedianGradient: number;
  /** A value close to 1 means the central join is no harsher than nearby pixels. */
  readonly gradientRatio: number;
}

export type SeamSegment = "top" | "bottom" | "left" | "right";

export interface SeamSegmentGradientMetric extends SeamGradientMetric {
  /** The half of the centre line measured independently. */
  readonly segment: SeamSegment;
  /** Pixel-boundary displacement from the mathematical centre, from -2 to 2. */
  readonly centerOffset: number;
}

export interface SeamAxisMetric extends SeamGradientMetric {
  /** The whole literal centre line, retained for diagnostics. */
  readonly center: SeamGradientMetric;
  /** Each half and each centre-adjacent line. */
  readonly segments: readonly SeamSegmentGradientMetric[];
  /** Highest half-line/adjacent-line ratio. Mirrors gradientRatio for convenience. */
  readonly worstGradientRatio: number;
}

export interface CentralSeamMetrics {
  readonly vertical: SeamAxisMetric;
  readonly horizontal: SeamAxisMetric;
  readonly worstGradientRatio: number;
}

export interface QuadrantLuminanceMetrics {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomLeft: number;
  readonly bottomRight: number;
  readonly range: number;
}

export interface FoliageHueProxyMetrics {
  /**
   * Pixels selected by a chromatic, green-dominant rule. This is a foliage
   * proxy, not image segmentation and must never be used as semantic proof.
   */
  readonly sampleCount: number;
  readonly hueP10: number | null;
  readonly hueP90: number | null;
  readonly hueSpread: number | null;
  /** Circular resultant-vector concentration: 1 means one hue dominates. */
  readonly circularConcentration: number | null;
  /** Fraction of proxy pixels inside the natural-green 45°–145° interval. */
  readonly naturalGreenFraction: number | null;
}

export interface AnchorPatchMetric {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly sampledPixels: number;
  readonly luminanceP10: number;
  readonly luminanceP90: number;
  readonly luminanceRange: number;
  /** Mean RGB neighbour distance; it captures local painted structure only. */
  readonly meanGradient: number;
}

export interface AnchorPatchBaseline {
  readonly sampleSize: number;
  readonly radius: number;
  readonly patches: readonly AnchorPatchMetric[];
}

export interface AnchorPatchRetention {
  readonly matchedCount: number;
  readonly missingIds: readonly string[];
  readonly luminanceRangeMedianRatio: number | null;
  readonly gradientMedianRatio: number | null;
  readonly worstLuminanceRangeRatio: number | null;
  readonly worstGradientRatio: number | null;
}

export interface ContractSamplingOptions {
  /** Use every Nth pixel. Defaults to one for an exact deterministic metric. */
  readonly sampleStride?: number;
}

export interface AnchorPatchOptions {
  readonly sampleSize?: number;
  readonly radius?: number;
}

const EPSILON = 1e-6;

function assertFrame(frame: RgbFrame): void {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 2 || frame.height < 2)
    throw new RangeError("frame dimensions must be integers of at least 2 by 2");
  if (frame.channels !== 3 && frame.channels !== 4) throw new RangeError("frame channels must be RGB or RGBA");
  if (frame.data.length !== frame.width * frame.height * frame.channels)
    throw new RangeError("frame data length does not match dimensions and channels");
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) throw new RangeError(`${name} must be a positive integer`);
  return resolved;
}

function pixelOffset(frame: RgbFrame, x: number, y: number): number {
  return (y * frame.width + x) * frame.channels;
}

function rgbDistance(frame: RgbFrame, leftX: number, leftY: number, rightX: number, rightY: number): number {
  const left = pixelOffset(frame, leftX, leftY);
  const right = pixelOffset(frame, rightX, rightY);
  const red = frame.data[left] - frame.data[right];
  const green = frame.data[left + 1] - frame.data[right + 1];
  const blue = frame.data[left + 2] - frame.data[right + 2];
  return Math.sqrt((red * red + green * green + blue * blue) / 3);
}

function luminance(frame: RgbFrame, x: number, y: number): number {
  const offset = pixelOffset(frame, x, y);
  return 0.2126 * frame.data[offset] + 0.7152 * frame.data[offset + 1] + 0.0722 * frame.data[offset + 2];
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new RangeError("cannot calculate a percentile of no values");
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * fraction)));
  return ordered[index];
}

function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

function seamOffsets(length: number): readonly number[] {
  const maxOffset = Math.max(2, Math.floor(length / 4));
  const targetOffsets = [8, 16, 24, 32, 48, 64, 80, 96];
  const offsets = targetOffsets.filter((offset) => offset < maxOffset);
  return offsets.length > 0 ? offsets : [1];
}

function seamMetric(
  frame: RgbFrame,
  axis: "vertical" | "horizontal",
  sampleStride: number,
  boundary: number,
  start: number,
  end: number,
): SeamGradientMetric {
  const across = axis === "vertical" ? frame.width : frame.height;
  const offsets = seamOffsets(across);
  const seamGradients: number[] = [];
  const localGradients: number[] = [];

  for (let position = start; position < end; position += sampleStride) {
    const seamGradient = axis === "vertical"
      ? rgbDistance(frame, boundary - 1, position, boundary, position)
      : rgbDistance(frame, position, boundary - 1, position, boundary);
    seamGradients.push(seamGradient);

    for (const offset of offsets) {
      for (const sign of [-1, 1] as const) {
        const localBoundary = boundary + sign * offset;
        if (localBoundary < 1 || localBoundary >= across) continue;
        localGradients.push(axis === "vertical"
          ? rgbDistance(frame, localBoundary - 1, position, localBoundary, position)
          : rgbDistance(frame, position, localBoundary - 1, position, localBoundary));
      }
    }
  }

  const seamMedianGradient = median(seamGradients);
  const localMedianGradient = median(localGradients);
  return {
    sampleCount: seamGradients.length,
    seamMedianGradient,
    localMedianGradient,
    gradientRatio: seamMedianGradient / Math.max(localMedianGradient, EPSILON),
  };
}

function axisSeamMetric(
  frame: RgbFrame,
  axis: "vertical" | "horizontal",
  sampleStride: number,
): SeamAxisMetric {
  const across = axis === "vertical" ? frame.width : frame.height;
  const along = axis === "vertical" ? frame.height : frame.width;
  const center = Math.floor(across / 2);
  const halfway = Math.floor(along / 2);
  const halves: readonly [SeamSegment, number, number][] = axis === "vertical"
    ? [["top", 0, halfway], ["bottom", halfway, along]]
    : [["left", 0, halfway], ["right", halfway, along]];
  const segments: SeamSegmentGradientMetric[] = [];
  for (const [segment, start, end] of halves) {
    for (const centerOffset of [-2, -1, 0, 1, 2]) {
      const boundary = center + centerOffset;
      if (boundary < 1 || boundary >= across) continue;
      segments.push({
        ...seamMetric(frame, axis, sampleStride, boundary, start, end),
        segment,
        centerOffset,
      });
    }
  }
  const centerMetric = seamMetric(frame, axis, sampleStride, center, 0, along);
  const worst = segments.reduce((current, candidate) => (
    candidate.gradientRatio > current.gradientRatio ? candidate : current
  ));
  return {
    ...worst,
    center: centerMetric,
    segments,
    worstGradientRatio: worst.gradientRatio,
  };
}

/**
 * Measures centre x/y joins against nearby ordinary pixel gradients.
 *
 * Every half-line is evaluated independently at the literal centre and at
 * centre-adjacent pixel boundaries (-2 through +2), so a join confined to one
 * half of an atlas cannot be hidden by a smooth opposite half.
 */
export function measureCentralSeams(
  frame: RgbFrame,
  options: ContractSamplingOptions = {},
): CentralSeamMetrics {
  assertFrame(frame);
  if (frame.width < 4 || frame.height < 4)
    throw new RangeError("central seam metrics require a frame of at least 4 by 4");
  const sampleStride = positiveInteger(options.sampleStride, 1, "sampleStride");
  const vertical = axisSeamMetric(frame, "vertical", sampleStride);
  const horizontal = axisSeamMetric(frame, "horizontal", sampleStride);
  return {
    vertical,
    horizontal,
    worstGradientRatio: Math.max(vertical.gradientRatio, horizontal.gradientRatio),
  };
}

/** Returns mean perceived luminance for four equal image quadrants. */
export function measureQuadrantLuminance(
  frame: RgbFrame,
  options: ContractSamplingOptions = {},
): QuadrantLuminanceMetrics {
  assertFrame(frame);
  const sampleStride = positiveInteger(options.sampleStride, 1, "sampleStride");
  const sums = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  const centerX = Math.floor(frame.width / 2);
  const centerY = Math.floor(frame.height / 2);
  for (let y = 0; y < frame.height; y += sampleStride) {
    for (let x = 0; x < frame.width; x += sampleStride) {
      const quadrant = (y >= centerY ? 2 : 0) + (x >= centerX ? 1 : 0);
      sums[quadrant] += luminance(frame, x, y);
      counts[quadrant] += 1;
    }
  }
  const values = sums.map((sum, index) => sum / counts[index]);
  return {
    topLeft: values[0],
    topRight: values[1],
    bottomLeft: values[2],
    bottomRight: values[3],
    range: Math.max(...values) - Math.min(...values),
  };
}

function rgbToHsv(red: number, green: number, blue: number): { readonly hue: number; readonly saturation: number; readonly value: number } {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  if (delta < EPSILON) return { hue: 0, saturation: 0, value: maximum };
  let hue = maximum === r
    ? ((g - b) / delta) % 6
    : maximum === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, saturation: delta / maximum, value: maximum };
}

/**
 * Measures colour variety in a conservative green-dominant pixel proxy.
 * It intentionally does not infer plants, objects, or anchor correctness.
 */
export function measureFoliageHueProxy(
  frame: RgbFrame,
  options: ContractSamplingOptions = {},
): FoliageHueProxyMetrics {
  assertFrame(frame);
  const sampleStride = positiveInteger(options.sampleStride, 1, "sampleStride");
  const hues: number[] = [];
  let naturalGreenCount = 0;
  let cosine = 0;
  let sine = 0;
  for (let y = 0; y < frame.height; y += sampleStride) {
    for (let x = 0; x < frame.width; x += sampleStride) {
      const offset = pixelOffset(frame, x, y);
      const red = frame.data[offset];
      const green = frame.data[offset + 1];
      const blue = frame.data[offset + 2];
      const hsv = rgbToHsv(red, green, blue);
      // Green must be dominant, with enough chroma and brightness for a
      // stable hue. This deliberately excludes grey roads, buildings, and sky.
      if (green < red * 1.03 || green < blue * 1.03 || hsv.saturation < 0.16 || hsv.value < 0.14) continue;
      hues.push(hsv.hue);
      if (hsv.hue >= 45 && hsv.hue <= 145) naturalGreenCount += 1;
      const radians = hsv.hue * Math.PI / 180;
      cosine += Math.cos(radians);
      sine += Math.sin(radians);
    }
  }
  if (hues.length === 0) {
    return {
      sampleCount: 0,
      hueP10: null,
      hueP90: null,
      hueSpread: null,
      circularConcentration: null,
      naturalGreenFraction: null,
    };
  }
  const hueP10 = percentile(hues, 0.1);
  const hueP90 = percentile(hues, 0.9);
  return {
    sampleCount: hues.length,
    hueP10,
    hueP90,
    hueSpread: hueP90 - hueP10,
    circularConcentration: Math.hypot(cosine, sine) / hues.length,
    naturalGreenFraction: naturalGreenCount / hues.length,
  };
}

function hashAnchorId(id: string): number {
  let hash = 2_166_136_261;
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Stable order lets a checked-in baseline survive source JSON reformatting. */
export function selectAnchorPatchSample(
  anchors: readonly AtlasAnchorPoint[],
  sampleSize = 40,
): readonly AtlasAnchorPoint[] {
  const limit = positiveInteger(sampleSize, 40, "sampleSize");
  const ids = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.id.trim()) throw new RangeError("anchor id must not be empty");
    if (ids.has(anchor.id)) throw new RangeError(`anchor ids must be unique: ${anchor.id}`);
    ids.add(anchor.id);
  }
  return [...anchors]
    .sort((left, right) => hashAnchorId(left.id) - hashAnchorId(right.id) || left.id.localeCompare(right.id, "en"))
    .slice(0, limit);
}

function patchMetric(frame: RgbFrame, anchor: AtlasAnchorPoint, radius: number): AnchorPatchMetric {
  const centerX = Math.round(anchor.x);
  const centerY = Math.round(anchor.y);
  const left = Math.max(0, centerX - radius);
  const right = Math.min(frame.width - 1, centerX + radius);
  const top = Math.max(0, centerY - radius);
  const bottom = Math.min(frame.height - 1, centerY + radius);
  if (left > right || top > bottom) throw new RangeError(`anchor lies outside frame: ${anchor.id}`);
  const luminances: number[] = [];
  let gradientSum = 0;
  let gradientCount = 0;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      luminances.push(luminance(frame, x, y));
      if (x < right) {
        gradientSum += rgbDistance(frame, x, y, x + 1, y);
        gradientCount += 1;
      }
      if (y < bottom) {
        gradientSum += rgbDistance(frame, x, y, x, y + 1);
        gradientCount += 1;
      }
    }
  }
  const luminanceP10 = percentile(luminances, 0.1);
  const luminanceP90 = percentile(luminances, 0.9);
  return {
    id: anchor.id,
    x: anchor.x,
    y: anchor.y,
    sampledPixels: luminances.length,
    luminanceP10,
    luminanceP90,
    luminanceRange: luminanceP90 - luminanceP10,
    meanGradient: gradientSum / Math.max(gradientCount, 1),
  };
}

/**
 * Creates a local-detail baseline around a deterministic anchor sample.
 * It is intentionally a structural proxy, not an automated semantic audit.
 */
export function createAnchorPatchBaseline(
  frame: RgbFrame,
  anchors: readonly AtlasAnchorPoint[],
  options: AnchorPatchOptions = {},
): AnchorPatchBaseline {
  assertFrame(frame);
  const sampleSize = positiveInteger(options.sampleSize, 40, "sampleSize");
  const radius = positiveInteger(options.radius, 16, "radius");
  const sample = selectAnchorPatchSample(anchors, sampleSize);
  return {
    sampleSize: sample.length,
    radius,
    patches: sample.map((anchor) => patchMetric(frame, anchor, radius)),
  };
}

function retainedRatio(candidate: number, baseline: number): number {
  if (baseline <= EPSILON) return candidate <= EPSILON ? 1 : Number.POSITIVE_INFINITY;
  return candidate / baseline;
}

/**
 * Compares only local contrast/detail retention. A passing result must still
 * be paired with a human check that every anchor points at the same object.
 */
export function compareAnchorPatchBaseline(
  baseline: AnchorPatchBaseline,
  candidate: AnchorPatchBaseline,
): AnchorPatchRetention {
  const candidateById = new Map(candidate.patches.map((patch) => [patch.id, patch]));
  const luminanceRangeRatios: number[] = [];
  const gradientRatios: number[] = [];
  const missingIds: string[] = [];
  for (const reference of baseline.patches) {
    const current = candidateById.get(reference.id);
    if (!current) {
      missingIds.push(reference.id);
      continue;
    }
    luminanceRangeRatios.push(retainedRatio(current.luminanceRange, reference.luminanceRange));
    gradientRatios.push(retainedRatio(current.meanGradient, reference.meanGradient));
  }
  return {
    matchedCount: luminanceRangeRatios.length,
    missingIds,
    luminanceRangeMedianRatio: luminanceRangeRatios.length > 0 ? median(luminanceRangeRatios) : null,
    gradientMedianRatio: gradientRatios.length > 0 ? median(gradientRatios) : null,
    worstLuminanceRangeRatio: luminanceRangeRatios.length > 0 ? Math.min(...luminanceRangeRatios) : null,
    worstGradientRatio: gradientRatios.length > 0 ? Math.min(...gradientRatios) : null,
  };
}
