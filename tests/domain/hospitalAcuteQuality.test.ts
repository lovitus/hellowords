import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");

interface Pipeline {
  removeAlpha(): Pipeline;
  extract(region: { left: number; top: number; width: number; height: number }): Pipeline;
  raw(): Pipeline;
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Buffer;
    info: { width: number; height: number; channels: number };
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => Pipeline;

async function measure(file: string, crop?: { left: number; top: number; width: number; height: number }) {
  let image = decodeImage(file).removeAlpha();
  if (crop) image = image.extract(crop);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  const pixels = info.width * info.height;
  const channelSums = [0, 0, 0];
  let luminance = 0;
  let dark = 0;
  let deepDark = 0;
  let chroma = 0;
  for (let index = 0; index < data.length; index += 3) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminance += y;
    if (y < 64) dark += 1;
    if (y < 32) deepDark += 1;
    chroma += (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
    channelSums[0] += red;
    channelSums[1] += green;
    channelSums[2] += blue;
  }
  const channelMeans = channelSums.map((sum) => sum / pixels);
  return {
    meanLuminance: luminance / pixels,
    darkFraction: dark / pixels,
    deepDarkFraction: deepDark / pixels,
    meanChroma: chroma / pixels,
    channelMeanSpread: Math.max(...channelMeans) - Math.min(...channelMeans),
  };
}

test("acute hospital rasters stay bright enough for dense labels", async () => {
  const contracts = [
    {
      id: "emergency-department",
      minLuminance: 105,
      maxDark: 0.25,
      maxDeepDark: 0.08,
      minChroma: 0.05,
      maxChroma: 0.25,
      maxSpread: 45,
      portalCrop: { left: 1_128, top: 28, width: 430, height: 287 },
    },
    {
      id: "operating-theatre",
      minLuminance: 105,
      maxDark: 0.25,
      maxDeepDark: 0.08,
      minChroma: 0.08,
      maxChroma: 0.3,
      maxSpread: 45,
    },
    {
      id: "emergency-triage-reception",
      minLuminance: 105,
      maxDark: 0.25,
      maxDeepDark: 0.08,
      minChroma: 0.05,
      maxChroma: 0.25,
      maxSpread: 45,
    },
    {
      id: "emergency-assessment-bay",
      minLuminance: 105,
      maxDark: 0.25,
      maxDeepDark: 0.08,
      minChroma: 0.04,
      maxChroma: 0.32,
      maxSpread: 50,
    },
  ] as const;
  for (const contract of contracts) {
    const file = resolve(projectRoot, `public/scenes/${contract.id}-premium-v1.jpg`);
    const metrics = await measure(file);
    assert.ok(metrics.meanLuminance >= contract.minLuminance, `${contract.id} is too dim`);
    assert.ok(metrics.meanLuminance <= 190, `${contract.id} is clipped too bright`);
    assert.ok(metrics.darkFraction <= contract.maxDark, `${contract.id} has too much dark area`);
    assert.ok(metrics.deepDarkFraction <= contract.maxDeepDark, `${contract.id} has blocked shadow`);
    assert.ok(metrics.meanChroma >= contract.minChroma, `${contract.id} is too desaturated`);
    assert.ok(metrics.meanChroma <= contract.maxChroma, `${contract.id} is oversaturated`);
    assert.ok(metrics.channelMeanSpread <= contract.maxSpread, `${contract.id} has a color cast`);
    if ("portalCrop" in contract) {
      const portal = await measure(file, contract.portalCrop);
      assert.ok(portal.meanLuminance >= 95, "the operating-theatre doorway remains readable");
      assert.ok(portal.deepDarkFraction <= 0.12, "the operating-theatre doorway is not blocked by shadow");
    }
  }
});

test("the source rasters remain valid RGB 1672 by 941 audit images", async () => {
  for (const id of ["emergency-department", "operating-theatre", "emergency-triage-reception", "emergency-assessment-bay"]) {
    const file = resolve(projectRoot, `scripts/assets/${id}-v1.png`);
    const bytes = await readFile(file);
    const metadata = await decodeImage(bytes).metadata();
    assert.deepEqual(
      { format: metadata.format, width: metadata.width, height: metadata.height },
      { format: "png", width: 1_672, height: 941 },
    );
  }
});
