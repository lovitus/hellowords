import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the ICU terminal scene from its reviewed source raster. The default
 * command writes only the owned scene JSON and verifies both image tiers.
 * Parent-portal and manifest integration is intentionally left to the main
 * branch; pass --integrate only from an integration branch when ready.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/intensive-care-unit-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/intensive-care-unit-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/intensive-care-unit.json");
const parentPath = resolve(projectRoot, "public/data/scenes/emergency-department.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "b5d7282ddde1f1f8bbe7b77f806ea0d3ffbb37af2e488ccf961b4fd7b3f226d8";
const PUBLIC_ASSET_SHA256 = "f4d6d18c09196271ed0a08ca433ddad3dcf8790a21aab662ae32883f49ef2e7d";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "foreground-critical-care-bay",
    title: "Foreground critical-care bay",
    translation: "前排重症监护床位",
    description: "Inspect the large foreground critical-care bed, bedside table, cabinet and visible bed hardware.",
    x: 0,
    y: 430,
    width: 700,
    height: 511,
    targetScale: 2.55,
    labels: [
      ["ICU foreground hospital bed", "ICU 前排病床", 250, 700, 0],
      ["ICU bed mattress", "ICU 病床床垫", 240, 570, 1],
      ["ICU mattress seam", "ICU 床垫缝线", 170, 600, 3],
      ["ICU bed headboard", "ICU 病床头板", 70, 500, 0],
      ["ICU bed footboard", "ICU 病床尾板", 510, 680, 0],
      ["ICU near side rail", "ICU 近侧护栏", 90, 570, 2],
      ["ICU far side rail", "ICU 远侧护栏", 430, 600, 2],
      ["ICU rail release handle", "ICU 护栏释放把手", 470, 600, 4],
      ["ICU bed frame", "ICU 病床框架", 420, 730, 2],
      ["ICU bed base", "ICU 病床底座", 360, 790, 2],
      ["ICU front caster", "ICU 前脚轮", 350, 850, 3],
      ["ICU rear caster", "ICU 后脚轮", 580, 780, 4],
      ["ICU caster fork", "ICU 脚轮叉架", 350, 820, 4],
      ["ICU wheel brake", "ICU 车轮制动器", 370, 850, 4],
      ["ICU overbed table", "ICU 床上桌", 390, 500, 0],
      ["ICU tabletop edge", "ICU 桌面边缘", 430, 490, 3],
      ["ICU table support column", "ICU 桌面支柱", 520, 530, 2],
      ["ICU bedside cabinet", "ICU 床旁柜", 130, 760, 0],
      ["ICU cabinet top", "ICU 床旁柜顶板", 130, 690, 2],
      ["ICU cabinet top drawer", "ICU 床旁柜上抽屉", 130, 750, 2],
      ["ICU cabinet drawer pull", "ICU 床旁柜抽屉拉手", 130, 760, 4],
      ["ICU cabinet lower drawer", "ICU 床旁柜下抽屉", 130, 820, 2],
      ["ICU lower drawer handle", "ICU 下抽屉把手", 130, 820, 4],
      ["ICU bed lift column", "ICU 病床升降柱", 420, 790, 3],
    ],
  },
  {
    id: "rear-critical-care-bays",
    title: "Rear critical-care bays",
    translation: "后排重症监护床位",
    description: "Follow the three glazed rear bed bays, their monitors, bed parts, privacy curtain and service boom.",
    x: 390,
    y: 160,
    width: 520,
    height: 430,
    targetScale: 2.6,
    labels: [
      ["ICU rear-left bed", "ICU 后排左侧病床", 430, 335, 0],
      ["ICU rear-left mattress", "ICU 后排左侧床垫", 420, 345, 1],
      ["ICU rear-left headboard", "ICU 后排左侧头板", 450, 330, 2],
      ["ICU rear-left footboard", "ICU 后排左侧尾板", 395, 360, 2],
      ["ICU rear-left bed rail", "ICU 后排左侧护栏", 445, 320, 3],
      ["ICU rear-left bed caster", "ICU 后排左侧脚轮", 450, 395, 4],
      ["ICU rear-left bedside monitor", "ICU 后排左侧床旁监视器", 405, 285, 1],
      ["ICU rear-left monitor screen", "ICU 后排左侧监视器屏幕", 405, 285, 3],
      ["ICU rear-left monitor stand", "ICU 后排左侧监视器支架", 405, 310, 4],
      ["ICU rear-center bed", "ICU 后排中间病床", 535, 335, 0],
      ["ICU rear-center mattress", "ICU 后排中间床垫", 540, 345, 1],
      ["ICU rear-center headboard", "ICU 后排中间头板", 585, 330, 2],
      ["ICU rear-center footboard", "ICU 后排中间尾板", 480, 360, 2],
      ["ICU rear-center bed rail", "ICU 后排中间护栏", 540, 320, 3],
      ["ICU rear-center bed caster", "ICU 后排中间脚轮", 535, 390, 4],
      ["ICU rear-center bedside monitor", "ICU 后排中间床旁监视器", 510, 285, 1],
      ["ICU rear-center monitor screen", "ICU 后排中间监视器屏幕", 510, 285, 3],
      ["ICU rear-center monitor arm", "ICU 后排中间监视器支臂", 510, 310, 4],
      ["ICU rear-right bed", "ICU 后排右侧病床", 760, 340, 0],
      ["ICU rear-right mattress", "ICU 后排右侧床垫", 760, 350, 1],
      ["ICU rear-right headboard", "ICU 后排右侧头板", 820, 335, 2],
      ["ICU rear-right footboard", "ICU 后排右侧尾板", 700, 365, 2],
      ["ICU rear-right bed rail", "ICU 后排右侧护栏", 770, 325, 3],
      ["ICU rear-right bed caster", "ICU 后排右侧脚轮", 760, 395, 4],
      ["ICU rear-right bedside monitor", "ICU 后排右侧床旁监视器", 725, 285, 1],
      ["ICU rear-right monitor screen", "ICU 后排右侧监视器屏幕", 725, 285, 3],
      ["ICU rear-right monitor stand", "ICU 后排右侧监视器支架", 725, 310, 4],
      ["ICU rear privacy curtain", "ICU 后排隐私帘", 560, 245, 1],
      ["ICU rear curtain track", "ICU 后排帘轨", 530, 180, 3],
      ["ICU rear glass partition", "ICU 后排玻璃隔断", 650, 250, 0],
    ],
  },
  {
    id: "headwall-and-airway",
    title: "Headwall and airway equipment",
    translation: "床头设备与气道器械",
    description: "Explore the visible headwall outlets, bedside monitor, infusion pumps, tubing and ceiling boom.",
    x: 0,
    y: 70,
    width: 500,
    height: 430,
    targetScale: 2.65,
    labels: [
      ["ICU headwall service rail", "ICU 床头设备轨", 210, 315, 0],
      ["ICU headwall oxygen outlet", "ICU 床头氧气接口", 45, 360, 2],
      ["ICU headwall medical-air outlet", "ICU 床头医用空气接口", 90, 360, 2],
      ["ICU headwall vacuum outlet", "ICU 床头真空接口", 135, 360, 2],
      ["ICU headwall electrical outlet", "ICU 床头电源插座", 190, 360, 2],
      ["ICU headwall nurse-call socket", "ICU 床头呼叫插口", 250, 360, 3],
      ["ICU headwall task light", "ICU 床头工作灯", 80, 240, 0],
      ["ICU airway equipment panel", "ICU 气道设备面板", 240, 255, 1],
      ["ICU airway equipment hook", "ICU 气道设备挂钩", 250, 205, 3],
      ["ICU airway equipment pole", "ICU 气道设备立杆", 250, 210, 1],
      ["ICU central vital monitor", "ICU 中央生命体征监视器", 250, 330, 0],
      ["ICU vital monitor screen", "ICU 生命体征监视器屏幕", 315, 300, 2],
      ["ICU monitor frame", "ICU 监视器外框", 315, 300, 3],
      ["ICU monitor cable", "ICU 监视器线缆", 275, 390, 4],
      ["ICU monitor stand", "ICU 监视器支架", 250, 420, 3],
      ["ICU infusion pump stack", "ICU 输液泵组", 370, 425, 0],
      ["ICU upper infusion pump", "ICU 上层输液泵", 370, 390, 2],
      ["ICU middle infusion pump", "ICU 中层输液泵", 370, 425, 2],
      ["ICU lower infusion pump", "ICU 下层输液泵", 370, 460, 2],
      ["ICU pump display", "ICU 输液泵显示屏", 385, 425, 3],
      ["ICU pump mounting rail", "ICU 输液泵安装轨", 350, 410, 3],
      ["ICU pump power cable", "ICU 输液泵电源线", 335, 475, 4],
      ["ICU ceiling service boom", "ICU 顶部服务吊臂", 320, 120, 0],
      ["ICU boom swivel", "ICU 吊臂旋转接头", 270, 100, 3],
      ["ICU wall handrail", "ICU 墙面扶手", 100, 420, 1],
      ["ICU bedside gas hose", "ICU 床旁气体软管", 150, 380, 4],
      ["ICU bedside suction tube", "ICU 床旁吸引管", 260, 380, 4],
    ],
  },
  {
    id: "central-nurse-base",
    title: "Central nurse base",
    translation: "中央护士工作站",
    description: "Inspect the central workstation, blank screens, drawers, chairs, clock, glazing and ceiling services.",
    x: 680,
    y: 0,
    width: 500,
    height: 560,
    targetScale: 2.55,
    labels: [
      ["ICU central nurse station", "ICU 中央护士站", 850, 400, 0],
      ["ICU nurse counter", "ICU 护士站柜台", 850, 470, 1],
      ["ICU counter edge", "ICU 柜台边缘", 900, 450, 3],
      ["ICU left workstation monitor", "ICU 左侧工作站监视器", 780, 320, 0],
      ["ICU left workstation screen", "ICU 左侧工作站屏幕", 780, 320, 2],
      ["ICU left workstation keyboard", "ICU 左侧工作站键盘", 800, 360, 3],
      ["ICU left workstation mouse", "ICU 左侧工作站鼠标", 820, 360, 4],
      ["ICU right workstation monitor", "ICU 右侧工作站监视器", 900, 350, 0],
      ["ICU right workstation screen", "ICU 右侧工作站屏幕", 900, 350, 2],
      ["ICU right workstation keyboard", "ICU 右侧工作站键盘", 920, 390, 3],
      ["ICU right workstation mouse", "ICU 右侧工作站鼠标", 940, 390, 4],
      ["ICU monitor divider", "ICU 监视器隔板", 950, 330, 1],
      ["ICU left workstation chair", "ICU 左侧工作站椅", 790, 450, 0],
      ["ICU left chair back", "ICU 左侧椅背", 790, 420, 2],
      ["ICU left chair caster", "ICU 左侧椅脚轮", 780, 500, 4],
      ["ICU right workstation chair", "ICU 右侧工作站椅", 880, 470, 0],
      ["ICU right chair back", "ICU 右侧椅背", 880, 440, 2],
      ["ICU right chair caster", "ICU 右侧椅脚轮", 900, 520, 4],
      ["ICU base drawer unit", "ICU 工作站抽屉柜", 740, 430, 0],
      ["ICU base drawer front", "ICU 工作站抽屉面", 740, 460, 2],
      ["ICU base drawer pull", "ICU 工作站抽屉拉手", 740, 460, 4],
      ["ICU central cabinet", "ICU 中央柜体", 980, 500, 0],
      ["ICU cabinet handle", "ICU 柜体把手", 1_000, 480, 4],
      ["ICU workstation cable grommet", "ICU 工作站穿线孔", 850, 430, 4],
      ["ICU wall clock", "ICU 墙上时钟", 920, 220, 0],
      ["ICU clock face", "ICU 时钟表盘", 920, 220, 2],
    ],
  },
  {
    id: "corridor-transfer-equipment",
    title: "Corridor and transfer equipment",
    translation: "走廊与转运设备",
    description: "Follow the glazed corridor, transfer stretcher, transport monitor, equipment cart, wheelchair and suction unit.",
    x: 1_050,
    y: 100,
    width: 350,
    height: 700,
    targetScale: 2.6,
    labels: [
      ["ICU glass corridor", "ICU 玻璃走廊", 1_120, 300, 0],
      ["ICU corridor door", "ICU 走廊门", 1_090, 260, 0],
      ["ICU corridor door handle", "ICU 走廊门把手", 1_100, 320, 4],
      ["ICU corridor mullion", "ICU 走廊窗竖框", 1_130, 250, 2],
      ["ICU corridor handrail", "ICU 走廊扶手", 1_120, 440, 1],
      ["ICU corridor floor", "ICU 走廊地面", 1_120, 550, 2],
      ["ICU transport stretcher", "ICU 转运担架", 1_230, 430, 0],
      ["ICU stretcher mattress", "ICU 担架床垫", 1_230, 380, 1],
      ["ICU stretcher side rail", "ICU 担架床侧栏", 1_210, 400, 2],
      ["ICU stretcher headboard", "ICU 担架床头板", 1_230, 345, 2],
      ["ICU stretcher caster", "ICU 担架脚轮", 1_260, 500, 4],
      ["ICU transport monitor", "ICU 转运监视器", 1_260, 300, 0],
      ["ICU transport monitor screen", "ICU 转运监视器屏幕", 1_260, 300, 2],
      ["ICU transport monitor stand", "ICU 转运监视器支架", 1_260, 340, 4],
      ["ICU equipment cart", "ICU 设备车", 1_340, 410, 0],
      ["ICU cart top shelf", "ICU 设备车上层搁板", 1_340, 360, 1],
      ["ICU cart drawer", "ICU 设备车抽屉", 1_340, 430, 2],
      ["ICU cart caster", "ICU 设备车脚轮", 1_340, 520, 4],
      ["ICU wheelchair", "ICU 轮椅", 1_330, 600, 0],
      ["ICU wheelchair seat", "ICU 轮椅座面", 1_330, 550, 2],
      ["ICU wheelchair armrest", "ICU 轮椅扶手", 1_320, 560, 3],
      ["ICU wheelchair footrest", "ICU 轮椅脚踏", 1_320, 650, 3],
      ["ICU wheelchair wheel", "ICU 轮椅车轮", 1_360, 640, 4],
      ["ICU portable suction unit", "ICU 便携吸引机", 1_240, 720, 0],
      ["ICU suction canister", "ICU 吸引罐", 1_240, 690, 2],
      ["ICU suction tubing", "ICU 吸引管路", 1_260, 680, 4],
    ],
  },
  {
    id: "clean-utility-support",
    title: "Clean utility and support alcove",
    translation: "清洁物资与支持区",
    description: "Explore the utility sink, hand dispensers, visible supplies, linen shelf, hamper and mobile drawer cabinet.",
    x: 1_370,
    y: 90,
    width: 302,
    height: 851,
    targetScale: 2.65,
    labels: [
      ["ICU clean utility alcove", "ICU 清洁物资壁龛", 1_530, 500, 0],
      ["ICU utility sink", "ICU 物资区水槽", 1_510, 510, 0],
      ["ICU sink basin", "ICU 水槽盆", 1_510, 545, 2],
      ["ICU sink faucet", "ICU 水槽龙头", 1_525, 410, 1],
      ["ICU faucet handle", "ICU 水龙头把手", 1_550, 440, 4],
      ["ICU sink drain", "ICU 水槽排水口", 1_510, 540, 4],
      ["ICU sink backsplash", "ICU 水槽挡水板", 1_510, 370, 2],
      ["ICU utility counter", "ICU 物资台面", 1_510, 600, 1],
      ["ICU paper-towel dispenser", "ICU 纸巾分配器", 1_500, 315, 0],
      ["ICU liquid soap dispenser", "ICU 液体皂液器", 1_555, 430, 2],
      ["ICU hand-rub dispenser", "ICU 手部消毒液器", 1_590, 430, 2],
      ["ICU utility wall outlet", "ICU 物资区墙面插座", 1_600, 410, 3],
      ["ICU open supply shelf", "ICU 开放物资架", 1_580, 250, 0],
      ["ICU supply shelf upright", "ICU 物资架立板", 1_470, 180, 2],
      ["ICU folded linen stack", "ICU 折叠布草堆", 1_530, 230, 1],
      ["ICU sealed supply tote", "ICU 密封物资箱", 1_600, 350, 1],
      ["ICU supply packet", "ICU 物资包", 1_560, 370, 3],
      ["ICU tall supply cabinet", "ICU 高位物资柜", 1_410, 400, 0],
      ["ICU cabinet glass door", "ICU 物资柜玻璃门", 1_410, 350, 2],
      ["ICU cabinet shelf", "ICU 物资柜搁板", 1_410, 450, 3],
      ["ICU laundry hamper", "ICU 布草筐", 1_430, 650, 0],
      ["ICU hamper liner", "ICU 布草筐内衬", 1_430, 600, 2],
      ["ICU hamper caster", "ICU 布草筐脚轮", 1_420, 760, 4],
      ["ICU teal drawer cabinet", "ICU 蓝绿色抽屉柜", 1_580, 720, 0],
      ["ICU drawer pull", "ICU 抽屉拉手", 1_580, 700, 3],
      ["ICU lower cabinet wheel", "ICU 下柜脚轮", 1_550, 850, 4],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
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

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `intensive-care-unit-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the ICU photograph`,
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
      const id = `intensive-care-unit-${slugify(word)}`;
      const region = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: region.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `intensive-care-unit-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "intensive-care-unit",
    title: "Intensive care unit",
    translation: "重症监护室",
    subtitle: "Critical-care beds, monitoring and clinical support",
    asset: "/scenes/intensive-care-unit-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "emergency-department",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/intensive-care-unit-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized ICU photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable bed parts, monitors, service outlets, transfer equipment, room fixtures and support objects across ${detailZones.length} bounded zones. Patient identity, diagnoses, medication names, clinical readings, treatment actions, hidden functions, sterility claims, brands, readable screen content and signage were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "patient identity",
        "diagnosis",
        "medication name",
        "clinical reading",
        "treatment action",
        "sterility claim",
        "brand name",
        "hidden equipment function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("ICU source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`ICU JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const parentPortal = {
  id: "enter-intensive-care-unit",
  label: "Enter the intensive care unit",
  translation: "进入重症监护室",
  childSceneId: "intensive-care-unit",
  sourceVisualRegion: "portal-intensive-care-unit-critical-care-bay",
  x: 400,
  y: 280,
  width: 450,
  height: 430,
  enterScale: 3.2,
};
const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete visible monitored critical-care bay in the emergency-department photograph",
  kind: "object",
  x: parentPortal.x,
  y: parentPortal.y,
  width: parentPortal.width,
  height: parentPortal.height,
};

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === parentPortal.id);
  if (portalIndex >= 0) parent.portals[portalIndex] = parentPortal;
  else parent.portals.push(parentPortal);
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion;
  else parent.visualRegions.push(parentRegion);
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "intensive-care-unit")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "emergency-department");
    if (index < 0) throw new Error("emergency-department is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, { id: "intensive-care-unit", title: "Intensive care unit", parentId: "emergency-department" });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildIntensiveCareUnitScene() {
  const scene = buildScene();
  if (scene.labels.length < 135 || scene.labels.length > 160) {
    throw new Error(`ICU label count ${scene.labels.length} is outside 135–160`);
  }
  if (scene.detailZones.length < 6 || scene.detailZones.length > 7) {
    throw new Error(`ICU zone count ${scene.detailZones.length} is outside 6–7`);
  }
  const result = {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildIntensiveCareUnitScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-intensive-care-unit-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
