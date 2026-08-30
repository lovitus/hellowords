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
  "check-in-counter": {
    asset: "/scenes/check-in-counter-premium-v1.jpg",
    sha256: "f3089bcc3e56bdb5805cfe3a7208e06a56a683d05297ecbb54efea73d5be2414",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 145,
      maxDarkFraction: 0.25,
      maxDeepDarkFraction: 0.11,
      minMeanChroma: 0.07,
      maxMeanChroma: 0.15,
      maxChannelMeanSpread: 20,
    },
  },
  "baggage-drop-station": {
    asset: "/scenes/baggage-drop-station-premium-v1.jpg",
    sha256: "ae99367a4eadff96cac480b88e6dcc41f585b2078615786283116bd8bd117e90",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 145,
      maxDarkFraction: 0.25,
      maxDeepDarkFraction: 0.13,
      minMeanChroma: 0.045,
      maxMeanChroma: 0.12,
      maxChannelMeanSpread: 15,
    },
  },
  "conference-room": {
    asset: "/scenes/conference-room-premium-v1.jpg",
    sha256: "d12438f3e95d9d580d0beb21b18baa7547d921ce18f205a61b279219a82533e1",
    quality: {
      minMeanLuminance: 90,
      maxMeanLuminance: 135,
      maxDarkFraction: 0.34,
      maxDeepDarkFraction: 0.18,
      minMeanChroma: 0.07,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 30,
    },
  },
  "open-plan-workstation": {
    asset: "/scenes/open-plan-workstation-premium-v1.jpg",
    sha256: "9acbbe66dd5fb56faa58562c07219f723bb39d12d535648fa7be6e3abcd7f1df",
    quality: {
      minMeanLuminance: 115,
      maxMeanLuminance: 155,
      maxDarkFraction: 0.29,
      maxDeepDarkFraction: 0.17,
      minMeanChroma: 0.09,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 35,
    },
  },
  "aircraft-galley-equipment": {
    asset: "/scenes/aircraft-galley-equipment-premium-v1.jpg",
    sha256: "ad4302dc7a0b87d7ae7bc6f596aec9a1c264ca29774d8c5ea0f024c91c3c0bbe",
    quality: {
      minMeanLuminance: 105,
      maxMeanLuminance: 130,
      maxDarkFraction: 0.34,
      maxDeepDarkFraction: 0.17,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.09,
      maxChannelMeanSpread: 15,
    },
  },
  "hemodialysis-unit": {
    asset: "/scenes/hemodialysis-unit-premium-v1.jpg",
    sha256: "fd89f968c45ae3139c699fd4a333c5eb7b5c10bdd053df35c56a9a6b8af964dc",
    quality: {
      minMeanLuminance: 140,
      maxMeanLuminance: 160,
      maxDarkFraction: 0.08,
      maxDeepDarkFraction: 0.04,
      minMeanChroma: 0.06,
      maxMeanChroma: 0.09,
      maxChannelMeanSpread: 8,
    },
  },
  "video-conferencing-console": {
    asset: "/scenes/video-conferencing-console-premium-v1.jpg",
    sha256: "191dcac69bbc53f5ec57497dc078f00d48c06104051886102b4fbf1ab0e863a5",
    quality: {
      minMeanLuminance: 90,
      maxMeanLuminance: 135,
      maxDarkFraction: 0.36,
      maxDeepDarkFraction: 0.19,
      minMeanChroma: 0.09,
      maxMeanChroma: 0.18,
      maxChannelMeanSpread: 40,
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
  "supermarket-walk-in-cooler": {
    asset: "/scenes/supermarket-walk-in-cooler-premium-v1.jpg",
    sha256: "efa6b81519ae88ad40713303792d610212c6b3faa5b4bc61fa7bea3fe9b2d34a",
    quality: {
      minMeanLuminance: 100,
      maxMeanLuminance: 175,
      maxDarkFraction: 0.32,
      maxDeepDarkFraction: 0.17,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.18,
      maxChannelMeanSpread: 25,
    },
  },
  "aircraft-cabin": {
    asset: "/scenes/aircraft-cabin-premium-v1.jpg",
    sha256: "43bc4ae1927274df211288acce769e17f16975ddfea8e0c57d8ce5349f697dbc",
    quality: {
      minMeanLuminance: 110,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.28,
      maxDeepDarkFraction: 0.1,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.18,
      maxChannelMeanSpread: 25,
    },
  },
  "post-anesthesia-care-unit": {
    asset: "/scenes/post-anesthesia-care-unit-premium-v1.jpg",
    sha256: "e3329b44269fbd08545a2a1adf3e0f9929696fde864fd4ff42537366cb2cedef",
    quality: {
      minMeanLuminance: 135,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.1,
      maxDeepDarkFraction: 0.05,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.18,
      maxChannelMeanSpread: 25,
    },
  },
  "supermarket-checkout-station": {
    asset: "/scenes/supermarket-checkout-station-premium-v1.jpg",
    sha256: "44d9ef20a386aa57eeddebbd51419a8353131a9aeb4759d6bbc0b95bfc61fe81",
    quality: {
      minMeanLuminance: 95,
      maxMeanLuminance: 175,
      maxDarkFraction: 0.38,
      maxDeepDarkFraction: 0.24,
      minMeanChroma: 0.09,
      maxMeanChroma: 0.22,
      maxChannelMeanSpread: 35,
    },
  },
  "aircraft-lavatory": {
    asset: "/scenes/aircraft-lavatory-premium-v1.jpg",
    sha256: "656375726949d55919bcef32f468b24d9cf454bcfc731882871b4ba6c7de4f60",
    quality: {
      minMeanLuminance: 130,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.18,
      maxDeepDarkFraction: 0.08,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 25,
    },
  },
  "intensive-care-unit": {
    asset: "/scenes/intensive-care-unit-premium-v1.jpg",
    sha256: "f4d6d18c09196271ed0a08ca433ddad3dcf8790a21aab662ae32883f49ef2e7d",
    quality: {
      minMeanLuminance: 130,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.11,
      maxDeepDarkFraction: 0.05,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 20,
    },
  },
  "bedside-monitor-station": {
    asset: "/scenes/bedside-monitor-station-premium-v1.jpg",
    sha256: "f9af7efbe82d4e050bfc1b52210eb370ac1eeb08aec54f63d87676a9f96e03e6",
    quality: {
      minMeanLuminance: 130,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.11,
      maxDeepDarkFraction: 0.05,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 20,
    },
  },
  "infusion-pump-rack": {
    asset: "/scenes/infusion-pump-rack-premium-v1.jpg",
    sha256: "5396395e45e4a1721f5bfa949e68bd9d3289d59cbb87941deae54e5b408ec724",
    quality: {
      minMeanLuminance: 130,
      maxMeanLuminance: 180,
      maxDarkFraction: 0.12,
      maxDeepDarkFraction: 0.05,
      minMeanChroma: 0.05,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 20,
    },
  },
  "refrigerated-display-case": {
    asset: "/scenes/refrigerated-display-case-premium-v1.jpg",
    sha256: "80f2242e79d3edd8ac7bf10739a821c09a2c4f37e8abbc56e961f96be942b1a4",
    quality: {
      minMeanLuminance: 100,
      maxMeanLuminance: 145,
      maxDarkFraction: 0.3,
      maxDeepDarkFraction: 0.14,
      minMeanChroma: 0.08,
      maxMeanChroma: 0.16,
      maxChannelMeanSpread: 30,
    },
  },
  "supermarket-produce-department": {
    asset: "/scenes/supermarket-produce-department-premium-v1.jpg",
    sha256: "c09efe1e2eccde845e097be6000e691d63e7baa934f2c0aa1eda524725803475",
    quality: {
      minMeanLuminance: 88,
      maxMeanLuminance: 145,
      maxDarkFraction: 0.4,
      maxDeepDarkFraction: 0.19,
      minMeanChroma: 0.18,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 65,
    },
  },
  "produce-weighing-station": {
    asset: "/scenes/produce-weighing-station-premium-v1.jpg",
    sha256: "c09efe1e2eccde845e097be6000e691d63e7baa934f2c0aa1eda524725803475",
    quality: {
      minMeanLuminance: 88,
      maxMeanLuminance: 145,
      maxDarkFraction: 0.4,
      maxDeepDarkFraction: 0.19,
      minMeanChroma: 0.18,
      maxMeanChroma: 0.3,
      maxChannelMeanSpread: 65,
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
