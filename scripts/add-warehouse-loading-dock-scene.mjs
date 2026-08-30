import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the warehouse/loading-dock branch from one reviewed source image.
 * Labels describe only visible objects or visible parts; operations, hazards,
 * inventory states and implied logistics concepts stay out of the anchor set.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/warehouse-loading-dock-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/warehouse-loading-dock-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/warehouse-loading-dock.json");
const parentPath = resolve(projectRoot, "public/data/scenes/service-core.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "66b7d7b21ce273a0043ce6d1709246b7f27c5e4f9da4959f6fc2062cca71fe16";
const PUBLIC_ASSET_SHA256 = "4ea669efc86bdf8b77aad57dc2b2054622501c57f45ef132503db0089de8350f";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "forklift",
    title: "Counterbalance forklift",
    translation: "平衡重式叉车",
    description: "Inspect the complete forklift, its lifting assembly, operator area, wheels and rear body.",
    x: 80,
    y: 300,
    width: 590,
    height: 560,
    labels: [
      ["warehouse forklift", "仓库叉车", 430, 560, 0],
      ["forklift overhead guard", "叉车护顶架", 455, 400, 0],
      ["warehouse forklift mast", "仓库叉车门架", 255, 455, 1],
      ["outer mast rail", "外门架导轨", 220, 455, 2],
      ["inner mast rail", "内门架导轨", 285, 465, 3],
      ["lift chain", "起升链条", 300, 520, 1],
      ["fork carriage", "货叉架", 240, 650, 2],
      ["load backrest", "挡货架", 215, 590, 1],
      ["forklift fork tine", "叉车货叉臂", 150, 785, 0],
      ["fork heel", "货叉根部", 235, 710, 3],
      ["hydraulic hose", "液压软管", 325, 520, 4],
      ["tilt cylinder", "倾斜油缸", 350, 585, 3],
      ["forklift headlamp", "叉车前灯", 385, 395, 2],
      ["forklift warning beacon", "叉车警示灯", 500, 335, 1],
      ["propane cylinder", "丙烷气瓶", 585, 455, 0],
      ["cylinder clamp", "气瓶夹具", 585, 480, 4],
      ["forklift operator seat", "叉车驾驶座椅", 485, 470, 0],
      ["forklift seat back", "叉车座椅靠背", 490, 430, 2],
      ["forklift steering wheel", "叉车方向盘", 400, 440, 1],
      ["instrument panel", "仪表台", 415, 475, 3],
      ["counterweight", "平衡重", 575, 585, 0],
      ["drive wheel", "驱动轮", 480, 680, 1],
      ["steer wheel", "转向轮", 620, 650, 2],
      ["forklift tire tread", "叉车轮胎花纹", 480, 670, 4],
      ["engine hood", "发动机罩", 545, 520, 3],
      ["operator step", "登车踏步", 420, 635, 2],
    ],
  },
  {
    id: "rack-storage",
    title: "Pallet rack storage",
    translation: "托盘货架存储区",
    description: "Follow the rack structure, pallets, containers and secured loads along the storage aisle.",
    x: 0,
    y: 0,
    width: 960,
    height: 430,
    labels: [
      ["pallet rack", "托盘货架", 620, 180, 0],
      ["rack upright", "货架立柱", 520, 250, 0],
      ["rack beam", "货架横梁", 650, 160, 1],
      ["diagonal brace", "斜撑", 485, 260, 2],
      ["wire decking", "钢丝层板", 680, 215, 4],
      ["upright guard", "立柱护脚", 560, 385, 2],
      ["rack base plate", "货架底板", 530, 405, 3],
      ["warehouse pallet", "仓储托盘", 640, 115, 0],
      ["deck board", "托盘面板", 655, 113, 2],
      ["pallet block", "托盘垫块", 650, 130, 3],
      ["pallet stringer", "托盘纵梁", 675, 138, 4],
      ["rack bay", "货架跨", 720, 280, 1],
      ["storage aisle", "存储通道", 165, 350, 0],
      ["stacked load", "堆叠货载", 760, 100, 1],
      ["shipping case", "运输箱", 690, 80, 0],
      ["carton stack", "纸箱垛", 850, 210, 1],
      ["blue storage tote", "蓝色周转箱", 630, 190, 0],
      ["grey storage tote", "灰色周转箱", 720, 195, 2],
      ["warehouse wooden crate", "仓库木制板条箱", 760, 340, 0],
      ["stretch wrap", "缠绕膜", 855, 125, 1],
      ["corner board", "护角板", 820, 110, 3],
      ["plastic strapping", "塑料捆扎带", 760, 165, 2],
      ["beam lock", "横梁锁片", 640, 175, 4],
      ["location plate", "库位牌", 665, 175, 3],
      ["stretch-wrapped pallet", "缠绕膜托盘货载", 820, 250, 1],
    ],
  },
  {
    id: "material-handling",
    title: "Material-handling equipment",
    translation: "物料搬运设备区",
    description: "Inspect manual and powered pallet trucks, the rolling ladder and protective barriers.",
    x: 550,
    y: 160,
    width: 710,
    height: 470,
    labels: [
      ["manual pallet jack", "手动托盘车", 780, 515, 0],
      ["tiller handle", "操纵手柄", 735, 475, 0],
      ["jack hydraulic unit", "托盘车液压装置", 760, 525, 2],
      ["jack fork arm", "托盘车叉臂", 835, 555, 1],
      ["jack load wheel", "托盘车承载轮", 885, 560, 3],
      ["jack steer caster", "托盘车转向轮", 755, 565, 4],
      ["electric pallet truck", "电动托盘车", 950, 475, 0],
      ["powered control handle", "电动控制手柄", 905, 420, 1],
      ["pallet-truck battery cover", "托盘车电池盖", 935, 470, 2],
      ["powered fork", "电动托盘车货叉", 1_000, 510, 3],
      ["drive unit", "驱动单元", 915, 500, 4],
      ["rolling warehouse ladder", "仓库滚轮梯", 980, 290, 0],
      ["ladder tread", "梯子踏板", 990, 310, 1],
      ["ladder handrail", "梯子扶手", 1_000, 210, 2],
      ["ladder caster", "梯子脚轮", 940, 430, 3],
      ["ladder platform", "梯子平台", 1_030, 230, 4],
      ["dock guardrail", "月台防护栏", 1_100, 385, 0],
      ["rack end barrier", "货架端部护栏", 570, 385, 1],
    ],
  },
  {
    id: "packing-station",
    title: "Packing and dispatch station",
    translation: "包装发运工作站",
    description: "Explore the packing bench, conveyor, scales, scanners, containers and hand truck.",
    x: 880,
    y: 520,
    width: 792,
    height: 421,
    labels: [
      ["packing bench", "包装工作台", 1_240, 720, 0],
      ["packing worktop", "包装台面", 1_230, 650, 1],
      ["packing roller conveyor", "包装滚筒输送机", 1_440, 630, 0],
      ["conveyor roller", "输送机滚筒", 1_450, 620, 1],
      ["conveyor frame", "输送机机架", 1_500, 700, 2],
      ["packing bench scale", "包装台秤", 1_060, 640, 0],
      ["packing scale platform", "包装秤台", 1_050, 615, 2],
      ["handheld barcode scanner", "手持条码扫描器", 1_360, 650, 0],
      ["scanner trigger", "扫描器扳机", 1_360, 655, 4],
      ["shipping label printer", "运输标签打印机", 1_405, 700, 0],
      ["label liner", "标签底纸", 1_415, 750, 3],
      ["tape dispenser", "胶带座", 1_170, 680, 0],
      ["packing tape roll", "包装胶带卷", 1_160, 675, 2],
      ["box cutter", "开箱刀", 1_090, 655, 1],
      ["kraft paper roll", "牛皮纸卷", 1_030, 560, 0],
      ["cushioning paper", "缓冲纸", 1_160, 590, 1],
      ["open shipping carton", "打开的运输纸箱", 1_190, 590, 0],
      ["grey picking tote", "灰色拣货箱", 1_030, 820, 1],
      ["blue picking tote", "蓝色拣货箱", 1_170, 820, 1],
      ["flattened carton", "折平纸箱", 1_300, 850, 2],
      ["platform hand truck", "平板手推车", 1_530, 760, 0],
      ["hand-truck frame", "手推车车架", 1_535, 720, 2],
      ["hand-truck toe plate", "手推车底板", 1_500, 870, 3],
      ["hand-truck wheel", "手推车轮", 1_580, 880, 4],
      ["blue waste bin", "蓝色废物桶", 1_570, 600, 1],
      ["grey waste bin", "灰色废物桶", 1_490, 630, 3],
    ],
  },
  {
    id: "loading-dock",
    title: "Truck loading dock",
    translation: "卡车装卸月台",
    description: "Inspect the dock door, trailer threshold, safety fixtures, access stair and emergency equipment.",
    x: 1_090,
    y: 0,
    width: 582,
    height: 580,
    labels: [
      ["overhead dock door", "上翻式月台门", 1_400, 110, 0],
      ["sectional door panel", "分节门板", 1_400, 100, 1],
      ["sectional door hinge", "分节门板铰链", 1_370, 180, 3],
      ["vertical door track", "垂直门轨", 1_280, 100, 2],
      ["loading-dock shelter", "装卸月台门封", 1_330, 280, 0],
      ["truck trailer", "卡车挂车", 1_420, 330, 0],
      ["trailer opening", "挂车开口", 1_400, 300, 1],
      ["trailer floor", "挂车地板", 1_400, 450, 2],
      ["dock leveler", "登车桥", 1_400, 480, 0],
      ["dock lip", "登车桥唇板", 1_370, 500, 3],
      ["loading-dock bumper", "装卸月台防撞垫", 1_310, 470, 2],
      ["dock threshold", "月台门槛", 1_350, 470, 1],
      ["dock light", "月台照明灯", 1_530, 260, 0],
      ["safety bollard", "安全防撞柱", 1_570, 420, 0],
      ["safety bollard cap", "安全防撞柱帽", 1_568, 395, 4],
      ["dock stair", "月台楼梯", 1_540, 470, 0],
      ["dock stair tread", "月台楼梯踏板", 1_560, 500, 2],
      ["dock stair handrail", "月台楼梯扶手", 1_540, 400, 1],
      ["dock curb", "月台路缘", 1_510, 500, 3],
      ["pedestrian lane", "人行通道", 1_460, 540, 0],
      ["convex safety mirror", "凸面安全镜", 1_585, 90, 0],
      ["dock fire extinguisher", "月台灭火器", 1_200, 330, 0],
      ["first-aid cabinet", "急救柜", 1_140, 310, 1],
      ["eyewash station", "洗眼器", 1_580, 340, 0],
      ["eyewash bowl", "洗眼盆", 1_585, 345, 3],
      ["dock control box", "月台控制箱", 1_530, 330, 2],
    ],
  },
];

const warehousePortal = {
  id: "enter-warehouse-loading-dock",
  label: "Enter the warehouse loading dock",
  translation: "进入仓库装卸区",
  childSceneId: "warehouse-loading-dock",
  sourceVisualRegion: "portal-warehouse-loading-dock",
  x: 1_385,
  y: 405,
  width: 215,
  height: 300,
  enterScale: 3.4,
};

const warehousePortalRegion = {
  id: warehousePortal.sourceVisualRegion,
  description: "Visible freight door, dock plate and pallet-handling area on the office service-core photograph",
  kind: "object",
  x: warehousePortal.x,
  y: warehousePortal.y,
  width: warehousePortal.width,
  height: warehousePortal.height,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function scenePoint(value, axis) {
  return Number((value * (axis === "x" ? SCALE_X : SCALE_Y)).toFixed(6));
}

function sceneRectangle(rectangle) {
  return {
    x: scenePoint(rectangle.x, "x"),
    y: scenePoint(rectangle.y, "y"),
    width: scenePoint(rectangle.width, "x"),
    height: scenePoint(rectangle.height, "y"),
  };
}

function slug(value) {
  return value.replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `warehouse-${slug(word)}`;
      const sourceVisualRegion = {
        id: `warehouse-region-${slug(word)}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the warehouse photograph`,
        kind: "part",
        ...sceneRectangle({
          x: Math.max(0, Math.min(SOURCE_WIDTH - 40, x - 20)),
          y: Math.max(0, Math.min(SOURCE_HEIGHT - 40, y - 20)),
          width: 40,
          height: 40,
        }),
      };
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: sourceVisualRegion.id,
      });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `warehouse-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: 3.15,
      labelIds,
    });
  }
  return {
    id: "warehouse-loading-dock",
    title: "Warehouse loading dock",
    translation: "仓库装卸中心",
    subtitle: "Storage, material handling, packing and truck dispatch",
    asset: "/scenes/warehouse-loading-dock-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "service-core",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/warehouse-loading-dock-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The final 1600 by 900 warehouse photograph was inspected at source and output resolution. It supports independently pointable forklift parts, rack structure, pallets and containers, manual and powered handling equipment, packing hardware, dock components and emergency fixtures. Hidden inventory data, shipping operations, hazards, compliance claims, movements and worker roles are excluded.",
      previousLabelCount: sourceZones.reduce((count, zone) => count + zone.labels.length, 0) + 7,
      retainedLabelCount: sourceZones.reduce((count, zone) => count + zone.labels.length, 0),
      removedLabelCount: 7,
      removedExamples: [
        "inventory level",
        "delivery schedule",
        "forklift operator",
        "safe load",
        "dispatch process",
        "stock rotation",
        "warehouse hazard",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("warehouse source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`warehouse JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === warehousePortal.id);
  if (portalIndex === -1) parent.portals.push(warehousePortal);
  else parent.portals[portalIndex] = warehousePortal;
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === warehousePortalRegion.id);
  if (regionIndex === -1) parent.visualRegions.push(warehousePortalRegion);
  else parent.visualRegions[regionIndex] = warehousePortalRegion;
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "warehouse-loading-dock");
  if (!existing) manifest.scenes.push({ id: "warehouse-loading-dock", title: "Warehouse loading dock", parentId: "service-core" });
  else if (existing.title !== "Warehouse loading dock" || existing.parentId !== "service-core") throw new Error("warehouse manifest entry has a different parent or title");
  return writeIfChanged(manifestPath, manifest);
}

export async function buildWarehouseLoadingDockScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const parentChanged = await updateParent();
  const manifestChanged = await updateManifest();
  return { assetChanged, sceneChanged, parentChanged, manifestChanged, labels: scene.labels.length, zones: scene.detailZones.length };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildWarehouseLoadingDockScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-warehouse-loading-dock-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
