import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the school-science-preparation-room terminal scene from its reviewed
 * source raster. The default command writes only this scene JSON and verifies
 * both image tiers; school-campus integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/school-science-preparation-room-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/school-science-preparation-room-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-science-preparation-room.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "8422fe16b9891f6ec4b6c3e9d0c1739e842e39188379cb8d65c2e94ff8db5601";
const PUBLIC_ASSET_SHA256 = "d779047bc8c5bdfc3ffcd4d0a638d55d2abdcf50ff78d6a14c1c2f19c9a2131c";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "bench-and-sink",
    title: "Preparation bench and sink",
    translation: "准备台与水槽",
    description: "Inspect the preparation bench, stainless sink, faucet, cabinets, drawers, refrigerator and counter edges.",
    x: 0,
    y: 350,
    width: 1_100,
    height: 591,
    targetScale: 2.55,
    labels: [
      ["Prep workbench", "准备实验台", 600, 600, 0],
      ["Prep countertop", "准备台面", 800, 650, 0],
      ["Prep stainless sink", "准备台不锈钢水槽", 1_050, 700, 0],
      ["Prep sink basin", "准备台水槽盆", 1_050, 700, 1],
      ["Prep faucet", "准备台水龙头", 1_060, 500, 1],
      ["Prep faucet handle", "准备台水龙头把手", 1_100, 550, 3],
      ["Prep drain", "准备台排水口", 1_050, 730, 3],
      ["Prep splashback", "准备台挡水板", 950, 500, 2],
      ["Science prep counter edge", "准备台面边缘", 800, 800, 2],
      ["Prep left cabinet", "准备台左柜", 300, 780, 0],
      ["Prep cabinet door", "准备台柜门", 300, 780, 2],
      ["Prep cabinet handle", "准备台柜门把手", 300, 820, 3],
      ["Prep drawer unit", "准备台抽屉柜", 600, 820, 0],
      ["Prep drawer front", "准备台抽屉面", 600, 830, 2],
      ["Prep drawer handle", "准备台抽屉拉手", 600, 830, 3],
      ["Prep underbench shelf", "准备台下层搁板", 350, 800, 0],
      ["Prep storage bin", "准备台储物箱", 420, 800, 1],
      ["Prep blue bin", "准备台蓝色箱", 450, 900, 1],
      ["Prep refrigerator", "准备台冰箱", 100, 800, 0],
      ["Prep refrigerator door", "准备台冰箱门", 100, 800, 2],
      ["Prep refrigerator handle", "准备台冰箱把手", 180, 800, 3],
      ["Prep bench corner", "准备台角", 500, 700, 3],
      ["Prep bench side", "准备台侧面", 100, 700, 1],
      ["Prep countertop seam", "准备台面接缝", 800, 700, 4],
      ["Prep sink drainer", "准备台沥水板", 900, 700, 2],
    ],
  },
  {
    id: "glassware-and-drying",
    title: "Glassware and drying rack",
    translation: "玻璃器皿与晾架",
    description: "Follow the drying rack, beakers, flasks, cylinders, tubes, funnels, droppers and glass bench tray.",
    x: 350,
    y: 350,
    width: 1_050,
    height: 400,
    targetScale: 2.55,
    labels: [
      ["Prep drying rack", "准备台玻璃器皿晾架", 1_150, 560, 0],
      ["Glassware drying frame", "晾架框架", 1_150, 560, 1],
      ["Glassware drying shelf", "晾架搁板", 1_150, 650, 2],
      ["Drying rack rail", "晾架横杆", 1_150, 600, 3],
      ["Prep glass beaker", "准备台玻璃烧杯", 520, 510, 0],
      ["Prep tall beaker", "准备台高玻璃烧杯", 600, 500, 1],
      ["Prep Erlenmeyer flask", "准备台锥形瓶", 500, 560, 0],
      ["Prep volumetric flask", "准备台容量瓶", 560, 560, 1],
      ["Prep graduated cylinder", "准备台量筒", 650, 500, 0],
      ["Prep measuring cylinder", "准备台测量量筒", 700, 520, 1],
      ["Prep test-tube row", "准备台试管列", 700, 600, 0],
      ["Prep test tube", "准备台试管", 720, 560, 2],
      ["Prep test-tube rack", "准备台试管架", 700, 630, 0],
      ["Test-tube rack rail", "试管架横杆", 700, 650, 3],
      ["Prep funnel", "准备台漏斗", 800, 520, 0],
      ["Glass funnel stem", "玻璃漏斗管", 800, 570, 3],
      ["Prep dropper", "准备台滴管", 880, 520, 1],
      ["Glass dropper", "玻璃滴管", 880, 560, 2],
      ["Prep pipette", "准备台移液管", 900, 600, 0],
      ["Prep glass stirring rod", "玻璃搅拌棒", 950, 600, 2],
      ["Stirring-rod bundle", "搅拌棒束", 950, 650, 3],
      ["Prep glassware tray", "准备台器皿托盘", 800, 680, 0],
      ["Glassware tray divider", "器皿托盘隔板", 820, 680, 3],
      ["Drying glassware shelf", "玻璃器皿搁板", 500, 450, 1],
      ["Prep flask neck", "准备台烧瓶瓶颈", 560, 520, 4],
    ],
  },
  {
    id: "microscope-and-instruments",
    title: "Microscope and bench instruments",
    translation: "显微镜与台面仪器",
    description: "Inspect the microscope, balances, hot plate, clamp stand, instrument cable and bench support.",
    x: 0,
    y: 350,
    width: 800,
    height: 450,
    targetScale: 2.6,
    labels: [
      ["Prep microscope", "准备台显微镜", 180, 500, 0],
      ["Prep microscope eyepiece", "显微镜目镜", 150, 420, 1],
      ["Prep microscope objective", "显微镜物镜", 190, 520, 2],
      ["Prep microscope nosepiece", "显微镜转换器", 190, 490, 2],
      ["Prep microscope stage", "显微镜载物台", 180, 540, 0],
      ["Prep stage clip", "载物台压片夹", 180, 540, 3],
      ["Prep focus knob", "调焦旋钮", 260, 560, 2],
      ["Prep microscope arm", "显微镜支臂", 140, 470, 1],
      ["Prep microscope base", "显微镜底座", 180, 600, 0],
      ["Microscope illuminator", "显微镜光源", 180, 580, 2],
      ["Digital balance", "电子天平", 350, 600, 0],
      ["Balance pan", "天平秤盘", 350, 570, 2],
      ["Prep balance display", "天平显示屏", 350, 620, 1],
      ["Balance housing", "天平外壳", 350, 640, 2],
      ["Prep hot plate", "加热板", 500, 600, 0],
      ["Hot-plate control knob", "加热板控制旋钮", 540, 620, 3],
      ["Hot-plate surface", "加热板表面", 500, 580, 1],
      ["Clamp stand", "夹具支架", 430, 430, 0],
      ["Stand rod", "支架立杆", 430, 400, 1],
      ["Bosshead clamp", "万向夹", 430, 470, 2],
      ["Utility clamp", "通用夹具", 430, 520, 2],
      ["Clamp base", "夹具底座", 430, 550, 0],
      ["Instrument power cable", "仪器电源线", 300, 680, 2],
      ["Bench instrument mat", "台面仪器垫", 300, 660, 1],
      ["Balance foot", "天平脚垫", 350, 670, 4],
    ],
  },
  {
    id: "storage-and-safety-wall",
    title: "Storage and safety wall",
    translation: "储藏与安全墙",
    description: "Follow the lockable cabinet, shelves, blank-label bottles, PPE, fire box, eyewash and dispensers.",
    x: 500,
    y: 0,
    width: 1_172,
    height: 600,
    targetScale: 2.55,
    labels: [
      ["Chemical cabinet", "化学品柜", 1_000, 250, 0],
      ["Chemical cabinet door", "化学品柜门", 1_000, 250, 1],
      ["Cabinet lock", "化学品柜锁", 1_000, 400, 3],
      ["Chemical cabinet handle", "化学品柜把手", 1_000, 380, 2],
      ["Prep upper storage shelf", "上层储物架", 700, 180, 0],
      ["Prep lower storage shelf", "下层储物架", 700, 320, 0],
      ["Prep glassware shelf", "器皿储物架", 700, 420, 1],
      ["Prep blue storage bin", "蓝色储物箱", 700, 210, 1],
      ["Prep green storage bin", "绿色储物箱", 700, 300, 1],
      ["Clear storage box", "透明储物盒", 700, 400, 0],
      ["Prep reagent bottle", "试剂瓶", 1_350, 450, 0],
      ["Prep reagent bottle cap", "试剂瓶盖", 1_350, 420, 2],
      ["Prep bottle shoulder", "试剂瓶肩", 1_350, 455, 3],
      ["Lab safety goggles", "护目镜", 1_520, 300, 0],
      ["Goggles lens", "护目镜镜片", 1_520, 300, 2],
      ["Nitrile gloves", "丁腈手套", 1_560, 400, 1],
      ["Lab coat", "实验服", 1_520, 520, 0],
      ["Lab apron hook", "围裙挂钩", 1_560, 220, 3],
      ["Fire blanket cabinet", "灭火毯柜", 1_350, 270, 0],
      ["Fire blanket latch", "灭火毯柜扣", 1_350, 320, 3],
      ["Prep eyewash station", "洗眼装置", 1_500, 450, 0],
      ["Prep eyewash bowl", "洗眼盆", 1_500, 450, 1],
      ["Eyewash spray head", "洗眼喷头", 1_500, 420, 2],
      ["Safety shower pull", "安全淋浴拉环", 1_480, 120, 2],
      ["Wall dispenser", "墙面分配器", 550, 270, 0],
    ],
  },
  {
    id: "utility-cart-and-cabinet",
    title: "Utility cart and cabinet",
    translation: "物资车与柜体",
    description: "Inspect the mobile cart, closed drawers, waste containers, utility sink, lower cabinet and shelves.",
    x: 1_130,
    y: 100,
    width: 542,
    height: 800,
    targetScale: 2.55,
    labels: [
      ["Mobile supply cart", "移动物资车", 1_260, 520, 0],
      ["Cart top", "物资车顶板", 1_260, 450, 1],
      ["Cart top tray", "物资车顶盘", 1_260, 450, 2],
      ["Cart upper drawer", "物资车上抽屉", 1_260, 520, 2],
      ["Cart middle drawer", "物资车中抽屉", 1_260, 590, 2],
      ["Cart lower drawer", "物资车下抽屉", 1_260, 660, 2],
      ["Science prep cart drawer handle", "科学准备车抽屉拉手", 1_260, 590, 4],
      ["Science prep cart side rail", "科学准备车侧护栏", 1_340, 470, 3],
      ["Cart front caster", "物资车前脚轮", 1_200, 720, 4],
      ["Cart rear caster", "物资车后脚轮", 1_330, 720, 4],
      ["Red waste bin", "红色废物桶", 1_420, 400, 0],
      ["Red bin lid", "红色废物桶盖", 1_420, 350, 2],
      ["White waste bin", "白色废物桶", 1_430, 610, 0],
      ["Waste-bin rim", "废物桶边缘", 1_430, 550, 2],
      ["Waste-bin liner", "废物桶内衬", 1_430, 610, 3],
      ["Utility sink counter", "物资水槽台面", 1_560, 520, 0],
      ["Utility sink faucet", "物资水槽龙头", 1_580, 370, 1],
      ["Science prep utility sink basin", "科学准备室物资水槽盆", 1_560, 450, 0],
      ["Utility sink drain", "物资水槽排水口", 1_560, 480, 4],
      ["Utility backsplash", "物资挡水板", 1_520, 350, 2],
      ["Lower utility cabinet", "物资下柜", 1_560, 700, 0],
      ["Utility cabinet door", "物资下柜门", 1_560, 700, 2],
      ["Utility cabinet handle", "物资下柜把手", 1_620, 690, 3],
      ["Science prep utility shelf", "科学准备室物资搁板", 1_410, 250, 1],
      ["Utility supply tray", "物资托盘", 1_350, 430, 2],
    ],
  },
  {
    id: "room-fittings-and-prep-supplies",
    title: "Room fittings and preparation supplies",
    translation: "房间设施与准备用品",
    description: "Follow the door, window, ceiling services, wall finish, floor, outlets, counter support and safety rail.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.4,
    labels: [
      ["Lab entry door", "实验室入口门", 350, 220, 0],
      ["Science room door window", "科学准备室门上窗", 350, 220, 1],
      ["Science room door handle", "科学准备室门把手", 350, 300, 3],
      ["Science room door closer", "科学准备室闭门器", 350, 150, 2],
      ["Science preparation window wall", "科学准备室窗墙", 150, 250, 0],
      ["Science preparation window frame", "科学准备室窗框", 150, 250, 2],
      ["Science preparation window sill", "科学准备室窗台", 150, 400, 1],
      ["Science preparation ceiling panel", "科学准备室顶板", 800, 50, 1],
      ["Science preparation ceiling light panel", "科学准备室顶灯面板", 600, 30, 0],
      ["Extraction grille", "排风格栅", 1_000, 100, 0],
      ["Ceiling air diffuser", "顶棚散流器", 1_350, 50, 2],
      ["Wall baseboard", "墙脚线", 900, 450, 2],
      ["Lab floor tile", "实验室地砖", 900, 850, 0],
      ["Lab floor seam", "实验室地面接缝", 900, 850, 3],
      ["Science preparation glass partition", "科学准备室玻璃隔断", 1_200, 250, 0],
      ["Partition frame", "隔断框", 1_200, 250, 2],
      ["Science preparation wall outlet", "科学准备室墙面插座", 500, 300, 1],
      ["Science preparation outlet faceplate", "科学准备室插座面板", 500, 300, 3],
      ["Prep counter support leg", "准备台支腿", 500, 800, 2],
      ["Prep counter front panel", "准备台前面板", 800, 800, 1],
      ["Prep bench backsplash", "准备台后挡板", 800, 450, 2],
      ["Storage alcove lintel", "储藏壁龛门楣", 1_300, 100, 1],
      ["Storage alcove threshold", "储藏壁龛门槛", 1_300, 500, 3],
      ["Emergency wall box", "墙面应急箱", 1_350, 270, 0],
      ["Wall-mounted rail", "墙面安装轨", 1_550, 250, 2],
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
    id: `school-science-preparation-room-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the school science preparation-room photograph`,
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
      const id = `school-science-preparation-room-${slugify(word)}`;
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
      id: `school-science-preparation-room-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "school-science-preparation-room",
    title: "School science preparation room",
    translation: "学校科学准备室",
    subtitle: "Bench, glassware, microscope, storage and safety equipment",
    asset: "/scenes/school-science-preparation-room-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-science-preparation-room-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized science-preparation-room photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable bench, glassware, microscope, instrument, storage, safety and room-fixture parts across ${detailZones.length} bounded zones. Student identity, experiments, reactions, hazardous contents, readable labels, measurements, brands and hidden equipment functions were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "student identity",
        "experiment",
        "chemical reaction",
        "hazardous contents",
        "readable label",
        "measurement reading",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("science-preparation source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`science-preparation JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function assertUniqueWords(scene) {
  const localWords = new Set();
  for (const label of scene.labels) {
    const word = label.word.toLocaleLowerCase();
    if (localWords.has(word)) throw new Error(`school-science-preparation-room contains duplicate display word: ${word}`);
    localWords.add(word);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Set();
  for (const entry of manifest.scenes) {
    if (entry.id === scene.id) continue;
    const otherPath = resolve(projectRoot, "public/data/scenes", `${entry.id}.json`);
    let other;
    try {
      other = JSON.parse(await readFile(otherPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  const duplicates = [...localWords].filter((word) => existingWords.has(word));
  if (duplicates.length > 0) throw new Error(`school-science-preparation-room term duplicates existing words: ${duplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-school-science-preparation-room",
  label: "Enter the science preparation room",
  translation: "进入学校科学准备室",
  childSceneId: "school-science-preparation-room",
  sourceVisualRegion: "portal-school-science-preparation-room",
  x: 1_050,
  y: 545,
  width: 500,
  height: 220,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete science preparation room visible in the lower-right school wing",
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
  if (!manifest.scenes.some(({ id }) => id === "school-science-preparation-room")) {
    const infirmaryIndex = manifest.scenes.findIndex(({ id }) => id === "school-infirmary");
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "school-campus");
    if (parentIndex < 0) throw new Error("school-campus is missing from the scene manifest");
    manifest.scenes.splice(infirmaryIndex >= 0 ? infirmaryIndex + 1 : parentIndex + 1, 0, {
      id: "school-science-preparation-room",
      title: "School science preparation room",
      parentId: "school-campus",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSchoolSciencePreparationRoomScene() {
  const scene = buildScene();
  if (scene.labels.length < 145 || scene.labels.length > 155) {
    throw new Error(`science-preparation label count ${scene.labels.length} is outside 145–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`science-preparation zone count ${scene.detailZones.length} is not 6`);
  await assertUniqueWords(scene);
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
  buildSchoolSciencePreparationRoomScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-science-preparation-room-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
