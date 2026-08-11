import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const sceneDataRoot = resolve(projectRoot, "public/data/scenes");
const publicRoot = resolve(projectRoot, "public");
const expectedWidth = 1600;
const expectedHeight = 900;

interface ScenePortal {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ReviewedScene {
  readonly id: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly portals: readonly ScenePortal[];
  readonly anchorAudit: {
    readonly reviewedAsset: string;
    readonly reviewedAssetSha256?: string;
  };
}

interface PixelMetrics {
  readonly meanLuminance: number;
  readonly darkFraction: number;
  readonly deepDarkFraction: number;
  readonly meanChroma: number;
  readonly channelMeanSpread: number;
}

interface QualityLimits {
  readonly minMeanLuminance: number;
  readonly maxMeanLuminance: number;
  readonly maxDarkFraction: number;
  readonly maxDeepDarkFraction: number;
  readonly minMeanChroma: number;
  readonly maxMeanChroma: number;
  readonly maxChannelMeanSpread: number;
}

interface ReplacementContract {
  readonly asset: string;
  readonly sha256: string;
  readonly quality: QualityLimits;
}

interface ImagePipeline {
  removeAlpha(): ImagePipeline;
  extract(region: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): ImagePipeline;
  raw(): ImagePipeline;
  metadata(): Promise<{ readonly format?: string; readonly width?: number; readonly height?: number }>;
  toBuffer(options: { readonly resolveWithObject: true }): Promise<{
    readonly data: Buffer;
    readonly info: { readonly width: number; readonly height: number; readonly channels: number };
  }>;
}

const decodeImage = sharpModule as unknown as (input: string | Buffer) => ImagePipeline;

const replacementContracts: Readonly<Record<string, ReplacementContract>> = {
  apartment: {
    asset: "/scenes/apartment-bright-v2.jpg",
    sha256: "90b90990ed24ec4324aa0b9345a0db650baf1a8bd03267ab6f53d5984d8c5ff2",
    quality: {
      minMeanLuminance: 110,
      maxMeanLuminance: 195,
      maxDarkFraction: 0.22,
      maxDeepDarkFraction: 0.08,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 50,
    },
  },
  "city-park": {
    asset: "/scenes/city-park-bright-v2.jpg",
    sha256: "1c55bb1f7b24f1854d1de7507d903d6e730cfc6b9742078f327a3492b8e94782",
    quality: {
      minMeanLuminance: 90,
      maxMeanLuminance: 185,
      maxDarkFraction: 0.36,
      maxDeepDarkFraction: 0.13,
      minMeanChroma: 0.12,
      maxMeanChroma: 0.34,
      maxChannelMeanSpread: 50,
    },
  },
  "city-street": {
    asset: "/scenes/city-street-bright-v3.jpg",
    sha256: "f615acf6a5751f9d6033e3ebcb96d1d7f768566db3acaa9170d363d53fb1fd08",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 195,
      maxDarkFraction: 0.28,
      maxDeepDarkFraction: 0.11,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 35,
    },
  },
  leaf: {
    asset: "/scenes/leaf-natural-v3.jpg",
    sha256: "3047a8ee8f00fa78ac31d8b328034b52a62d414a20c7c4bdcc02c82a23ff9e13",
    quality: {
      minMeanLuminance: 75,
      maxMeanLuminance: 175,
      maxDarkFraction: 0.36,
      maxDeepDarkFraction: 0.09,
      minMeanChroma: 0.1,
      maxMeanChroma: 0.34,
      maxChannelMeanSpread: 55,
    },
  },
  "oak-tree": {
    asset: "/scenes/oak-tree-natural-v3.jpg",
    sha256: "d331191e5c63ff460c3208cc32b4e9d977981749a9f5ddb6a3850d373623fe3b",
    quality: {
      minMeanLuminance: 80,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.39,
      maxDeepDarkFraction: 0.14,
      minMeanChroma: 0.1,
      maxMeanChroma: 0.34,
      maxChannelMeanSpread: 50,
    },
  },
  "world-map": {
    asset: "/scenes/world-map-bright-v4.jpg",
    sha256: "73536e8b31807e9e98300b8ceba03975210b881aabaf3f3e3718308fdfd82157",
    quality: {
      minMeanLuminance: 100,
      maxMeanLuminance: 190,
      maxDarkFraction: 0.3,
      maxDeepDarkFraction: 0.09,
      minMeanChroma: 0.1,
      maxMeanChroma: 0.34,
      maxChannelMeanSpread: 50,
    },
  },
};

const portalQualityLimits: Readonly<Record<string, Pick<
  QualityLimits,
  "minMeanLuminance" | "maxDarkFraction" | "maxDeepDarkFraction"
>>> = {
  apartment: {
    minMeanLuminance: 100,
    maxDarkFraction: 0.28,
    maxDeepDarkFraction: 0.09,
  },
  "city-street": {
    minMeanLuminance: 85,
    maxDarkFraction: 0.4,
    maxDeepDarkFraction: 0.17,
  },
  "world-map": {
    minMeanLuminance: 88,
    maxDarkFraction: 0.34,
    maxDeepDarkFraction: 0.1,
  },
};

async function readScene(sceneId: string): Promise<ReviewedScene> {
  return JSON.parse(
    await readFile(resolve(sceneDataRoot, `${sceneId}.json`), "utf8"),
  ) as ReviewedScene;
}

function assetFile(asset: string): string {
  assert.match(asset, /^\/scenes\/[a-z0-9-]+\.jpg$/);
  return resolve(publicRoot, asset.slice(1));
}

async function measurePixels(
  file: string,
  crop?: ScenePortal,
): Promise<PixelMetrics> {
  let pipeline = decodeImage(file).removeAlpha();
  if (crop) {
    pipeline = pipeline.extract({
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height,
    });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3, `${file} must decode to RGB pixels`);

  const pixelCount = info.width * info.height;
  const channelSums = [0, 0, 0];
  let luminanceSum = 0;
  let darkCount = 0;
  let deepDarkCount = 0;
  let chromaSum = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    channelSums[0] += red;
    channelSums[1] += green;
    channelSums[2] += blue;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminanceSum += luminance;
    if (luminance < 64) darkCount += 1;
    if (luminance < 32) deepDarkCount += 1;
    chromaSum += (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
  }
  const channelMeans = channelSums.map((sum) => sum / pixelCount);
  return {
    meanLuminance: luminanceSum / pixelCount,
    darkFraction: darkCount / pixelCount,
    deepDarkFraction: deepDarkCount / pixelCount,
    meanChroma: chromaSum / pixelCount,
    channelMeanSpread: Math.max(...channelMeans) - Math.min(...channelMeans),
  };
}

function assertWholeImageQuality(
  sceneId: string,
  metrics: PixelMetrics,
  limits: QualityLimits,
): void {
  assert.ok(
    metrics.meanLuminance >= limits.minMeanLuminance,
    `${sceneId} is too dark: mean luminance ${metrics.meanLuminance.toFixed(2)}`,
  );
  assert.ok(
    metrics.meanLuminance <= limits.maxMeanLuminance,
    `${sceneId} is washed out: mean luminance ${metrics.meanLuminance.toFixed(2)}`,
  );
  assert.ok(
    metrics.darkFraction <= limits.maxDarkFraction,
    `${sceneId} has too many dark pixels: ${(metrics.darkFraction * 100).toFixed(2)}%`,
  );
  assert.ok(
    metrics.deepDarkFraction <= limits.maxDeepDarkFraction,
    `${sceneId} has too many near-black pixels: ${(metrics.deepDarkFraction * 100).toFixed(2)}%`,
  );
  assert.ok(
    metrics.meanChroma >= limits.minMeanChroma,
    `${sceneId} is too desaturated: mean chroma ${metrics.meanChroma.toFixed(3)}`,
  );
  assert.ok(
    metrics.meanChroma <= limits.maxMeanChroma,
    `${sceneId} is oversaturated: mean chroma ${metrics.meanChroma.toFixed(3)}`,
  );
  assert.ok(
    metrics.channelMeanSpread <= limits.maxChannelMeanSpread,
    `${sceneId} has an excessive whole-image color cast: channel spread ${metrics.channelMeanSpread.toFixed(2)}`,
  );
}

test("the six replacement scenes keep their reviewed bright 1600 by 900 JPEGs", async () => {
  for (const [sceneId, contract] of Object.entries(replacementContracts)) {
    const scene = await readScene(sceneId);
    assert.equal(scene.id, sceneId);
    assert.equal(scene.asset, contract.asset, `${sceneId} keeps its versioned final asset`);
    assert.equal(scene.width, expectedWidth, `${sceneId} authored width`);
    assert.equal(scene.height, expectedHeight, `${sceneId} authored height`);
    assert.equal(scene.anchorAudit.reviewedAsset, scene.asset, `${sceneId} audit asset`);
    assert.equal(scene.anchorAudit.reviewedAssetSha256, contract.sha256, `${sceneId} audit digest`);

    const file = assetFile(scene.asset);
    const bytes = await readFile(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, contract.sha256, `${sceneId} file digest`);
    const metadata = await decodeImage(bytes).metadata();
    assert.equal(metadata.format, "jpeg", `${sceneId} encoded format`);
    assert.equal(metadata.width, expectedWidth, `${sceneId} decoded width`);
    assert.equal(metadata.height, expectedHeight, `${sceneId} decoded height`);

    assertWholeImageQuality(sceneId, await measurePixels(file), contract.quality);
  }
});

test("apartment, city street and world map portal crops remain readable daylight entrances", async () => {
  for (const [sceneId, limits] of Object.entries(portalQualityLimits)) {
    const scene = await readScene(sceneId);
    assert.ok(scene.portals.length >= 3, `${sceneId} exposes multiple reviewed entrances`);
    const file = assetFile(scene.asset);
    for (const portal of scene.portals) {
      assert.ok(portal.width > 0 && portal.height > 0, `${sceneId}/${portal.id} has a crop area`);
      assert.ok(portal.x >= 0 && portal.x + portal.width <= expectedWidth, `${sceneId}/${portal.id} x bounds`);
      assert.ok(portal.y >= 0 && portal.y + portal.height <= expectedHeight, `${sceneId}/${portal.id} y bounds`);
      const metrics = await measurePixels(file, portal);
      assert.ok(
        metrics.meanLuminance >= limits.minMeanLuminance,
        `${sceneId}/${portal.id} crop is too dark: mean luminance ${metrics.meanLuminance.toFixed(2)}`,
      );
      assert.ok(
        metrics.darkFraction <= limits.maxDarkFraction,
        `${sceneId}/${portal.id} crop has too much shadow: ${(metrics.darkFraction * 100).toFixed(2)}%`,
      );
      assert.ok(
        metrics.deepDarkFraction <= limits.maxDeepDarkFraction,
        `${sceneId}/${portal.id} crop has too much near-black area: ${(metrics.deepDarkFraction * 100).toFixed(2)}%`,
      );
    }
  }
});
