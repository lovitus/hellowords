import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Builds the standalone baggage-claim scene from a reviewed airport arrival
 * photograph. Coordinates are authored in the source raster and scaled only
 * after the final JPEG is generated, so the source audit remains reproducible.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/baggage-claim-premium-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/baggage-claim-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/baggage-claim.json");
const airportPath = resolve(projectRoot, "public/data/scenes/airport.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "a698d29446c8485bd4751dc6e6a4b430a6ce191b44bacd6c6b90645739e240ba";
const PUBLIC_ASSET_SHA256 = "867f17349b32d7c2802e2710a9b765117e50480301c30e0dea5ee7a4f10457c0";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "reclaim-carousel",
    title: "Reclaim carousel",
    translation: "行李提取转盘",
    description: "Follow the complete reclaim carousel, belt hardware, chute and transfer surfaces.",
    x: 60,
    y: 200,
    width: 1_500,
    height: 740,
    targetScale: 2.45,
    labels: [
      ["reclaim carousel", "行李提取转盘", 803, 857, 0],
      ["carousel rim", "转盘边缘", 1039, 807, 1],
      ["carousel slat", "转盘板条", 828, 714, 2],
      ["reclaim carousel hub", "提取转盘中心", 780, 500, 1],
      ["reclaim carousel rail", "提取转盘护栏", 820, 567, 2],
      ["reclaim carousel belt edge", "提取转盘皮带边缘", 883, 810, 3],
      ["reclaim chute", "行李提取滑道", 710, 281, 0],
      ["reclaim chute door", "提取滑道门帘", 715, 223, 2],
      ["carousel center cover", "转盘中心罩", 790, 500, 3],
      ["carousel guardrail", "转盘护栏", 891, 620, 2],
      ["carousel indicator light", "转盘指示灯", 689, 457, 4],
      ["reclaim conveyor", "行李提取输送带", 686, 297, 1],
      ["conveyor access panel", "输送带检修板", 129, 613, 4],
    ],
  },
  {
    id: "luggage-detail",
    title: "Luggage detail",
    translation: "行李细节",
    description: "Inspect distinct cases and bags on the carousel, including handles, wheels, tags and fasteners.",
    x: 100,
    y: 350,
    width: 1_450,
    height: 500,
    targetScale: 2.8,
    labels: [
      ["hard-shell suitcase", "硬壳行李箱", 414, 615, 0],
      ["fabric suitcase", "布面行李箱", 540, 693, 0],
      ["red suitcase", "红色行李箱", 327, 420, 1],
      ["blue suitcase", "蓝色行李箱", 1088, 750, 1],
      ["green suitcase", "绿色行李箱", 915, 731, 1],
      ["brown suitcase", "棕色行李箱", 1288, 511, 1],
      ["black suitcase", "黑色行李箱", 1381, 575, 1],
      ["luggage duffel", "行李旅行袋", 733, 738, 0],
      ["travel backpack", "旅行背包", 1232, 683, 0],
      ["garment bag", "衣物袋", 200, 660, 0],
      ["claim tag", "提取标签", 612, 740, 2],
      ["claim-tag loop", "提取标签环", 595, 730, 4],
      ["claim bag handle", "提取行李把手", 1337, 619, 2],
      ["case handle", "箱体把手", 1115, 775, 2],
      ["case wheel", "箱体轮", 506, 624, 3],
      ["luggage corner", "行李箱角", 1043, 736, 3],
      ["case shell", "箱体外壳", 259, 457, 2],
      ["fabric strap", "布面背带", 1315, 660, 3],
      ["duffel handle", "旅行袋提手", 722, 685, 2],
      ["luggage wheel housing", "行李轮罩", 935, 782, 4],
    ],
  },
  {
    id: "arrival-facilities",
    title: "Arrival facilities",
    translation: "到达厅设施",
    description: "Explore the arrivals foyer, service desk, doors, carts, seating, lighting and public fixtures.",
    x: 0,
    y: 0,
    width: SOURCE_WIDTH,
    height: 700,
    targetScale: 2.35,
    labels: [
      ["arrival foyer", "到达厅", 543, 358, 0],
      ["baggage services desk", "行李服务台", 105, 364, 0],
      ["service desk monitor", "服务台监视器", 138, 290, 2],
      ["cart bay", "行李车停放区", 1480, 374, 0],
      ["airport cart handlebar", "机场行李车把手", 1457, 330, 2],
      ["cart caster wheel", "行李车脚轮", 1415, 440, 4],
      ["cart rack", "行李车架", 1_450, 340, 1],
      ["drinking fountain basin", "饮水机水盆", 1566, 416, 2],
      ["arrivals door", "到达厅门", 1_350, 220, 0],
      ["glass entrance", "玻璃入口", 1_380, 180, 1],
      ["entrance transom", "入口上亮窗", 1361, 85, 2],
      ["arrival bench", "到达厅长椅", 1649, 553, 0],
      ["bench cushion", "长椅坐垫", 1627, 522, 2],
      ["arrival wall clock", "到达厅挂钟", 1592, 139, 1],
      ["arrival ceiling panel", "到达厅顶棚板", 800, 30, 2],
      ["security camera dome", "半球安防摄像机", 1545, 40, 3],
      ["arrival floor tile", "到达厅地砖", 1210, 415, 2],
      ["arrival wall panel", "到达厅墙板", 306, 60, 3],
      ["reclaim display screen", "行李提取显示屏", 200, 120, 1],
    ],
  },
  {
    id: "customs-inspection",
    title: "Customs and inspection",
    translation: "海关与检查区",
    description: "Inspect the customs booths, counters, dividers, queue rails and the service-side baggage equipment.",
    x: 400,
    y: 120,
    width: 1_200,
    height: 620,
    targetScale: 2.55,
    labels: [
      ["customs booth", "海关柜台间", 999, 272, 0],
      ["customs inspection desk", "海关检查台", 837, 286, 0],
      ["inspection tray", "检查托盘", 961, 295, 2],
      ["transparent divider", "透明隔板", 906, 224, 1],
      ["queue barrier rail", "排队隔离杆", 1257, 306, 2],
      ["border booth", "边检柜台间", 1168, 281, 1],
      ["booth window", "柜台窗", 1009, 210, 3],
      ["booth counter", "柜台台面", 1029, 255, 2],
      ["inspection counter", "检查柜台", 934, 340, 1],
      ["customs queue barrier", "海关排队隔栏", 1072, 348, 3],
      ["service corridor door", "服务走廊门", 465, 137, 1],
      ["baggage container", "行李集装箱", 465, 232, 0],
      ["container caster", "集装箱脚轮", 465, 260, 3],
      ["cargo case", "货运行李箱", 415, 224, 1],
      ["belt curtain", "输送带帘", 751, 203, 4],
    ],
  },
  {
    id: "reception-and-architecture",
    title: "Reception and architecture",
    translation: "接待与建筑细节",
    description: "Study the reception counter, monitor, wood panels, planter and public-room surface details.",
    x: 0,
    y: 80,
    width: 500,
    height: 420,
    targetScale: 2.45,
    labels: [
      ["arrivals reception counter", "到达厅接待柜台", 306, 327, 0],
      ["reception monitor", "接待台监视器", 165, 284, 2],
      ["desk counter", "柜台台面", 96, 325, 1],
      ["desk front panel", "柜台前板", 195, 357, 3],
      ["counter return", "柜台回转边", 332, 294, 2],
      ["arrival wall display", "到达厅墙面显示屏", 208, 131, 1],
      ["lobby planter", "大厅花盆", 17, 382, 0],
      ["lobby plant", "大厅植物", 28, 249, 2],
      ["counter monitor stand", "柜台监视器支架", 154, 305, 4],
    ],
  },
];

// These terms stay searchable. Their earlier points fall on the carousel
// casing, another object, or a surface that cannot identify their function.
const indexTerms = [
  ["carousel roller", "转盘滚轮"], ["reclaim carousel support leg", "提取转盘支腿"],
  ["reclaim carousel drive cover", "提取转盘驱动罩"], ["reclaim belt return roller", "提取皮带回程滚轮"],
  ["reclaim belt tensioner", "提取皮带张紧器"], ["luggage transfer tray", "行李转运托盘"],
  ["carousel baggage shelf", "转盘行李搁台"], ["oversize baggage belt", "超大行李输送带"],
  ["spinner wheel", "万向轮"], ["zipper tab", "拉链片"], ["suitcase latch", "行李箱扣锁"],
  ["oversize baggage counter", "超大行李柜台"], ["baggage service window", "行李服务窗口"],
  ["arrival floor joint", "到达厅地面接缝"], ["arrivals waste container", "到达厅废物容器"],
  ["baggage inspection table", "行李检查桌"], ["conveyor access door", "输送带通道门"],
  ["container handle", "集装箱把手"], ["sorting cart", "分拣推车"],
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function scenePoint(value, axis) {
  const scaled = value * (axis === "x" ? SCALE_X : SCALE_Y);
  return Number(scaled.toFixed(6));
}

function sceneRectangle(rectangle) {
  return {
    x: scenePoint(rectangle.x, "x"),
    y: scenePoint(rectangle.y, "y"),
    width: scenePoint(rectangle.width, "x"),
    height: scenePoint(rectangle.height, "y"),
  };
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `baggage-claim-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the baggage-claim photograph`,
    kind: "part",
    ...sceneRectangle({ x: left, y: top, width: size, height: size }),
  };
}

const serviceDeskPortal = {
  id: "enter-baggage-service-desk",
  label: "Visit the baggage service desk",
  translation: "进入行李服务柜台",
  childSceneId: "baggage-service-desk",
  sourceVisualRegion: "portal-baggage-service-desk",
  x: 238, y: 328, width: 48, height: 24, enterScale: 3.4,
};

function buildScene(previousScene) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `baggage-claim-${slugify(word)}`;
      const sourceVisualRegion = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: sourceVisualRegion.id,
        semanticRealmId: "objects-technology",
      });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `baggage-claim-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  // Other scene generators can attach their own entrances to this hall.
  const portals = (previousScene?.portals ?? []).filter(portal => portal.id !== serviceDeskPortal.id);
  const linkedRegions = new Set(portals.map(portal => portal.sourceVisualRegion));
  visualRegions.push(...(previousScene?.visualRegions ?? []).filter(region => linkedRegions.has(region.id)));
  const { x, y, width, height } = serviceDeskPortal;
  visualRegions.push({
    id: serviceDeskPortal.sourceVisualRegion, kind: "object",
    description: "Honey-colored curved front panel beneath the pale countertop of the left arrivals desk",
    x, y, width, height,
  });
  return {
    id: "baggage-claim",
    title: "Baggage claim",
    translation: "行李提取区",
    subtitle: "Carousel, arrivals and baggage services",
    asset: "/scenes/baggage-claim-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "airport",
    portraitOverviewLabelIds: ["baggage-services-desk", "reclaim-carousel", "hard-shell-suitcase", "travel-backpack"].map(word => `baggage-claim-${word}`),
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/baggage-claim-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The five zones retain the hall's original 95 terms. The visible counter, bags and handles, fountain, inspection booths, curtain, rails, and amber indicator are marked on the arrivals photograph. Hidden conveyor hardware, unidentifiable functions and uncertain small parts stay in the scene index.",
      previousLabelCount: 101,
      retainedLabelCount: labels.length,
      removedLabelCount: 6 + indexTerms.length,
      removedExamples: [
        "reclaim belt tensioner",
        "arrivals waste container",
        "passenger identity",
        "flight number",
        "customs outcome",
        "airline brand",
        "screen text",
        "baggage-processing state",
      ],
    },
    labels,
    relatedWords: indexTerms.map(([word, translation]) => ({ id: `baggage-claim-${slugify(word)}`, word, translation })),
    portals: [...portals, serviceDeskPortal],
  };
}

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, next) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path, next);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourceAsset);
  if (sha256(source) !== SOURCE_SHA256) {
    throw new Error("baggage-claim source bytes changed; rerun the pixel audit before rebuilding");
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) {
    throw new Error(`baggage-claim JPEG is not reproducible; got ${sha256(output)}`);
  }
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const baggagePortal = {
  id: "enter-baggage-claim",
  label: "Enter baggage claim",
  translation: "进入行李提取区",
  childSceneId: "baggage-claim",
  sourceVisualRegion: "baggage-claim",
  x: 950,
  y: 360,
  width: 600,
  height: 450,
  enterScale: 3.4,
};

const baggageParentVisualRegion = {
  id: "baggage-claim",
  description: "Arrival seating and the complete baggage carousel with suitcases at the right foreground",
  kind: "object",
  x: 940,
  y: 350,
  width: 660,
  height: 550,
};

async function updateAirport() {
  const airport = JSON.parse(await readFile(airportPath, "utf8"));
  const existingIndex = airport.portals.findIndex(({ id }) => id === baggagePortal.id);
  if (existingIndex >= 0) airport.portals[existingIndex] = baggagePortal;
  else airport.portals.push(baggagePortal);
  const regionIndex = airport.visualRegions.findIndex(({ id }) => id === baggageParentVisualRegion.id);
  if (regionIndex >= 0) airport.visualRegions[regionIndex] = baggageParentVisualRegion;
  else airport.visualRegions.push(baggageParentVisualRegion);
  return writeIfChanged(airportPath, airport);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "baggage-claim");
  if (!existing) {
    const airportIndex = manifest.scenes.findIndex(({ id }) => id === "airport");
    if (airportIndex < 0) throw new Error("airport is missing from the scene manifest");
    manifest.scenes.splice(airportIndex + 1, 0, {
      id: "baggage-claim",
      title: "Baggage claim",
      parentId: "airport",
    });
  } else if (existing.title !== "Baggage claim" || existing.parentId !== "airport") {
    throw new Error("baggage-claim already exists with a different title or parent");
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildBaggageClaimScene() {
  const assetChanged = await ensureAsset();
  let previousScene;
  try {
    previousScene = JSON.parse(await readFile(scenePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const scene = buildScene(previousScene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const airportChanged = await updateAirport();
  const manifestChanged = await updateManifest();
  return {
    assetChanged,
    sceneChanged,
    airportChanged,
    manifestChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildBaggageClaimScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-baggage-claim-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
