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
      ["reclaim carousel", "行李提取转盘", 780, 600, 0],
      ["carousel rim", "转盘边缘", 780, 460, 1],
      ["carousel slat", "转盘板条", 780, 690, 2],
      ["carousel roller", "转盘滚轮", 780, 620, 3],
      ["reclaim carousel hub", "提取转盘中心", 780, 500, 1],
      ["reclaim carousel rail", "提取转盘护栏", 780, 560, 2],
      ["reclaim carousel support leg", "提取转盘支腿", 850, 580, 3],
      ["reclaim carousel drive cover", "提取转盘驱动罩", 260, 650, 4],
      ["reclaim carousel belt edge", "提取转盘皮带边缘", 500, 780, 3],
      ["reclaim belt return roller", "提取皮带回程滚轮", 550, 800, 4],
      ["reclaim belt tensioner", "提取皮带张紧器", 220, 650, 4],
      ["reclaim chute", "行李提取滑道", 780, 320, 0],
      ["reclaim chute door", "提取滑道门帘", 720, 255, 2],
      ["luggage transfer tray", "行李转运托盘", 780, 350, 2],
      ["carousel center cover", "转盘中心罩", 790, 500, 3],
      ["carousel guardrail", "转盘护栏", 850, 560, 2],
      ["carousel baggage shelf", "转盘行李搁台", 500, 460, 1],
      ["carousel indicator light", "转盘指示灯", 780, 520, 4],
      ["reclaim conveyor", "行李提取输送带", 720, 320, 1],
      ["conveyor access panel", "输送带检修板", 600, 350, 4],
      ["oversize baggage belt", "超大行李输送带", 650, 325, 0],
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
      ["hard-shell suitcase", "硬壳行李箱", 300, 500, 0],
      ["fabric suitcase", "布面行李箱", 370, 430, 0],
      ["red suitcase", "红色行李箱", 340, 405, 1],
      ["blue suitcase", "蓝色行李箱", 480, 420, 1],
      ["green suitcase", "绿色行李箱", 1_150, 520, 1],
      ["brown suitcase", "棕色行李箱", 1_320, 560, 1],
      ["black suitcase", "黑色行李箱", 1_320, 650, 1],
      ["luggage duffel", "行李旅行袋", 1_050, 520, 0],
      ["travel backpack", "旅行背包", 1_150, 700, 0],
      ["garment bag", "衣物袋", 200, 660, 0],
      ["claim tag", "提取标签", 590, 740, 2],
      ["claim-tag loop", "提取标签环", 600, 745, 4],
      ["claim bag handle", "提取行李把手", 1_050, 530, 2],
      ["case handle", "箱体把手", 300, 510, 2],
      ["case wheel", "箱体轮", 305, 560, 3],
      ["spinner wheel", "万向轮", 355, 565, 4],
      ["zipper tab", "拉链片", 1_070, 520, 4],
      ["luggage corner", "行李箱角", 1_300, 600, 3],
      ["case shell", "箱体外壳", 310, 500, 2],
      ["fabric strap", "布面背带", 1_050, 540, 3],
      ["duffel handle", "旅行袋提手", 1_060, 500, 2],
      ["suitcase latch", "行李箱扣锁", 300, 480, 3],
      ["luggage wheel housing", "行李轮罩", 350, 550, 4],
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
      ["arrival foyer", "到达厅", 850, 200, 0],
      ["baggage services desk", "行李服务台", 820, 300, 0],
      ["service desk monitor", "服务台监视器", 820, 270, 2],
      ["oversize baggage counter", "超大行李柜台", 800, 300, 1],
      ["baggage service window", "行李服务窗口", 915, 230, 2],
      ["cart bay", "行李车停放区", 1_450, 360, 0],
      ["airport cart handlebar", "机场行李车把手", 1_450, 320, 2],
      ["cart caster wheel", "行李车脚轮", 1_450, 420, 4],
      ["cart rack", "行李车架", 1_450, 340, 1],
      ["drinking fountain basin", "饮水机水盆", 1_550, 460, 2],
      ["arrivals door", "到达厅门", 1_350, 220, 0],
      ["glass entrance", "玻璃入口", 1_380, 180, 1],
      ["entrance transom", "入口上亮窗", 1_350, 120, 2],
      ["arrival bench", "到达厅长椅", 1_600, 600, 0],
      ["bench cushion", "长椅坐垫", 1_600, 600, 2],
      ["arrival wall clock", "到达厅挂钟", 1_580, 100, 1],
      ["arrival ceiling panel", "到达厅顶棚板", 800, 30, 2],
      ["security camera dome", "半球安防摄像机", 1_520, 20, 3],
      ["arrival floor tile", "到达厅地砖", 1_150, 450, 2],
      ["arrival floor joint", "到达厅地面接缝", 1_200, 450, 4],
      ["arrival wall panel", "到达厅墙板", 250, 170, 3],
      ["reclaim display screen", "行李提取显示屏", 200, 120, 1],
      ["arrivals waste container", "到达厅废物容器", 1_590, 500, 2],
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
      ["customs booth", "海关柜台间", 950, 240, 0],
      ["customs inspection desk", "海关检查台", 800, 280, 0],
      ["inspection tray", "检查托盘", 970, 300, 2],
      ["transparent divider", "透明隔板", 840, 240, 1],
      ["queue barrier rail", "排队隔离杆", 1_250, 360, 2],
      ["border booth", "边检柜台间", 1_050, 240, 1],
      ["booth window", "柜台窗", 1_050, 230, 3],
      ["booth counter", "柜台台面", 1_050, 300, 2],
      ["inspection counter", "检查柜台", 800, 320, 1],
      ["baggage inspection table", "行李检查桌", 760, 330, 0],
      ["customs queue barrier", "海关排队隔栏", 1_250, 350, 3],
      ["service corridor door", "服务走廊门", 470, 180, 1],
      ["conveyor access door", "输送带通道门", 480, 230, 2],
      ["baggage container", "行李集装箱", 500, 200, 0],
      ["container caster", "集装箱脚轮", 510, 260, 3],
      ["cargo case", "货运行李箱", 500, 220, 1],
      ["container handle", "集装箱把手", 520, 190, 4],
      ["sorting cart", "分拣推车", 500, 300, 2],
      ["belt curtain", "输送带帘", 700, 260, 4],
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
      ["arrivals reception counter", "到达厅接待柜台", 180, 300, 0],
      ["reception monitor", "接待台监视器", 180, 280, 2],
      ["desk counter", "柜台台面", 200, 300, 1],
      ["desk front panel", "柜台前板", 180, 340, 3],
      ["counter return", "柜台回转边", 350, 300, 2],
      ["arrival wall display", "到达厅墙面显示屏", 210, 120, 1],
      ["lobby planter", "大厅花盆", 20, 200, 0],
      ["lobby plant", "大厅植物", 20, 240, 2],
      ["counter monitor stand", "柜台监视器支架", 180, 290, 4],
    ],
  },
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

function buildScene() {
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
  return {
    id: "baggage-claim",
    title: "Baggage claim",
    translation: "行李提取区",
    subtitle: "Carousel, arrivals and baggage services",
    asset: "/scenes/baggage-claim-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "airport",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/baggage-claim-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The source and resized baggage-claim photographs were inspected at native and final pixels. This batch retains 95 independently pointable carousel, luggage, arrivals, customs, service and reception objects or parts across five bounded exploration zones. Passenger identities, flight numbers, customs outcomes, airline brands, written screen content and inferred baggage-processing states were excluded.",
      previousLabelCount: 101,
      retainedLabelCount: 95,
      removedLabelCount: 6,
      removedExamples: [
        "passenger identity",
        "flight number",
        "customs outcome",
        "airline brand",
        "screen text",
        "baggage-processing state",
      ],
    },
    labels,
    portals: [],
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
  x: 1_010,
  y: 470,
  width: 430,
  height: 360,
  enterScale: 3.4,
};

async function updateAirport() {
  const airport = JSON.parse(await readFile(airportPath, "utf8"));
  const existingIndex = airport.portals.findIndex(({ id }) => id === baggagePortal.id);
  if (existingIndex >= 0) airport.portals[existingIndex] = baggagePortal;
  else airport.portals.push(baggagePortal);
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
  const scene = buildScene();
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
