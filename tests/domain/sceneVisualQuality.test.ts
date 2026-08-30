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
  readonly width?: number;
  readonly height?: number;
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
      maxDeepDarkFraction: 0.04,
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
    asset: "/scenes/city-street-bright-v4.jpg",
    sha256: "e280b0047e7bf0dbcf7f1ff392c38d5b88f06e11bb6304f3d998f47f37438fdf",
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
    asset: "/scenes/world-mega-atlas-2604-v21.jpg",
    sha256: "1f604a7727b9d18cf4d4447eaf88b5883eb3720f6d4540bdd1af6c86654bd54d",
    width: 2604,
    height: 989,
    quality: {
      minMeanLuminance: 90,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.28,
      maxDeepDarkFraction: 0.075,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 45,
    },
  },
  "school-campus": {
    asset: "/scenes/school-campus-premium-v1.jpg",
    sha256: "ba3863de7141714144a7c1fc91327fdfb021bdc9f53087027d7c32adb6d766a3",
    quality: {
      minMeanLuminance: 95,
      maxMeanLuminance: 175,
      maxDarkFraction: 0.34,
      maxDeepDarkFraction: 0.14,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 50,
    },
  },
  "radiology-suite": {
    asset: "/scenes/radiology-suite-premium-v1.jpg",
    sha256: "b61a9331f765812aabc429d86ea935ba00e947fb86b45e487743a410c01cecc5",
    quality: {
      minMeanLuminance: 120,
      maxMeanLuminance: 190,
      maxDarkFraction: 0.2,
      maxDeepDarkFraction: 0.05,
      minMeanChroma: 0.03,
      maxMeanChroma: 0.2,
      maxChannelMeanSpread: 30,
    },
  },
  "emergency-department": {
    asset: "/scenes/emergency-department-premium-v1.jpg",
    sha256: "0d5878b4fa27bb1cff5c82d21e8e28aa4e22c8d1885160bd9f2dc3191d94ec47",
    quality: {
      minMeanLuminance: 120,
      maxMeanLuminance: 185,
      maxDarkFraction: 0.16,
      maxDeepDarkFraction: 0.06,
      minMeanChroma: 0.06,
      maxMeanChroma: 0.2,
      maxChannelMeanSpread: 25,
    },
  },
  "operating-theatre": {
    asset: "/scenes/operating-theatre-premium-v1.jpg",
    sha256: "97083eb3798a19d4faf518ba03e8863530c3e60038d782a75ae2dd40516df07e",
    quality: {
      minMeanLuminance: 120,
      maxMeanLuminance: 185,
      maxDarkFraction: 0.14,
      maxDeepDarkFraction: 0.05,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.22,
      maxChannelMeanSpread: 30,
    },
  },
  "baggage-claim": {
    asset: "/scenes/baggage-claim-premium-v1.jpg",
    sha256: "867f17349b32d7c2802e2710a9b765117e50480301c30e0dea5ee7a4f10457c0",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 205,
      maxDarkFraction: 0.2,
      maxDeepDarkFraction: 0.06,
      minMeanChroma: 0.07,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 50,
    },
  },
  "security-checkpoint": {
    asset: "/scenes/airport-security-checkpoint-premium-v1.jpg",
    sha256: "8a12c6f335b1107d676112bf52033cc30d51aa352e9fbacf0bde609a3ef85e20",
    quality: {
      minMeanLuminance: 125,
      maxMeanLuminance: 190,
      maxDarkFraction: 0.16,
      maxDeepDarkFraction: 0.06,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.22,
      maxChannelMeanSpread: 35,
    },
  },
  "boarding-gate": {
    asset: "/scenes/airport-boarding-gate-premium-v1.jpg",
    sha256: "12c9298681df0b7fa1f282fab91ba9af5f05f5a9ddcc16a3b51a5b9e9765436b",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 175,
      maxDarkFraction: 0.22,
      maxDeepDarkFraction: 0.07,
      minMeanChroma: 0.04,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 20,
    },
  },
  "service-core": {
    asset: "/scenes/office-service-core-premium-v1.jpg",
    sha256: "13b85aad4abb80939e27cc018ac5af21c1b6cabbb3a21dafb5aa04a27b189c8f",
    quality: {
      minMeanLuminance: 90,
      maxMeanLuminance: 165,
      maxDarkFraction: 0.4,
      maxDeepDarkFraction: 0.16,
      minMeanChroma: 0.04,
      maxMeanChroma: 0.22,
      maxChannelMeanSpread: 45,
    },
  },
  "warehouse-loading-dock": {
    asset: "/scenes/warehouse-loading-dock-premium-v1.jpg",
    sha256: "4ea669efc86bdf8b77aad57dc2b2054622501c57f45ef132503db0089de8350f",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 205,
      maxDarkFraction: 0.3,
      maxDeepDarkFraction: 0.16,
      minMeanChroma: 0.04,
      maxMeanChroma: 0.25,
      maxChannelMeanSpread: 45,
    },
  },
  "library-reading-room": {
    asset: "/scenes/library-reading-room-premium-v1.jpg",
    sha256: "229653feffda532fe9f55e846829364d4cf1f6648acf9381ffdab65ac2d2e713",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 215,
      maxDarkFraction: 0.3,
      maxDeepDarkFraction: 0.14,
      minMeanChroma: 0.04,
      maxMeanChroma: 0.28,
      maxChannelMeanSpread: 50,
    },
  },
  "hotel-exterior": {
    asset: "/scenes/hotel-exterior-premium-v1.jpg",
    sha256: "5d8658256347fe839abbca9c2d81f71a4dab5262b96c2c74a8b5547103707464",
    quality: {
      minMeanLuminance: 100,
      maxMeanLuminance: 190,
      maxDarkFraction: 0.36,
      maxDeepDarkFraction: 0.12,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.25,
      maxChannelMeanSpread: 45,
    },
  },
  "hotel-lobby-rooms": {
    asset: "/scenes/hotel-lobby-rooms-premium-v1.jpg",
    sha256: "7e3052ac5f4d31577fada2dd3d4bdeb863e467c8d3d8ae65243a2cd311225b49",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 195,
      maxDarkFraction: 0.3,
      maxDeepDarkFraction: 0.12,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.25,
      maxChannelMeanSpread: 50,
    },
  },
  "supermarket-backroom": {
    asset: "/scenes/supermarket-backroom-premium-v1.jpg",
    sha256: "d04f6dd8280bb1581a865a543d3ed7d954c060c8c98676dbc651619a464fad31",
    quality: {
      minMeanLuminance: 110,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.25,
      maxDeepDarkFraction: 0.12,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.18,
      maxChannelMeanSpread: 30,
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
    maxDeepDarkFraction: 0.075,
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

test("the replacement scenes keep their reviewed versioned JPEGs and authored dimensions", async () => {
  for (const [sceneId, contract] of Object.entries(replacementContracts)) {
    const scene = await readScene(sceneId);
    const width = contract.width ?? expectedWidth;
    const height = contract.height ?? expectedHeight;
    assert.equal(scene.id, sceneId);
    assert.equal(scene.asset, contract.asset, `${sceneId} keeps its versioned final asset`);
    assert.equal(scene.width, width, `${sceneId} authored width`);
    assert.equal(scene.height, height, `${sceneId} authored height`);
    assert.equal(scene.anchorAudit.reviewedAsset, scene.asset, `${sceneId} audit asset`);
    assert.equal(scene.anchorAudit.reviewedAssetSha256, contract.sha256, `${sceneId} audit digest`);

    const file = assetFile(scene.asset);
    const bytes = await readFile(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, contract.sha256, `${sceneId} file digest`);
    const metadata = await decodeImage(bytes).metadata();
    assert.equal(metadata.format, "jpeg", `${sceneId} encoded format`);
    assert.equal(metadata.width, width, `${sceneId} decoded width`);
    assert.equal(metadata.height, height, `${sceneId} decoded height`);

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
      assert.ok(portal.x >= 0 && portal.x + portal.width <= scene.width, `${sceneId}/${portal.id} x bounds`);
      assert.ok(portal.y >= 0 && portal.y + portal.height <= scene.height, `${sceneId}/${portal.id} y bounds`);
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
