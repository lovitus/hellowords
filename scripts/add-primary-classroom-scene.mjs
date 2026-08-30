import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal primary-classroom scene from a reviewed school
 * photograph. Pass --integrate after review to connect the visible classroom
 * in the school campus and update the manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/primary-classroom-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/primary-classroom-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/primary-classroom.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "b6b06936f705177aa3fc109e7241d7ded99325c03ba51eb677f23c0411c2b76f";
const PUBLIC_ASSET_SHA256 = "20498cf9be8faf487b5945e9bc732c28afad79bacc4bad6b7dd3164d5af62071";

const zones = [
  {
    id: "teacher-area",
    title: "Teacher area",
    translation: "教师区",
    description: "Inspect the visible teacher desk, chair, monitor, keyboard, trays, organizer and cable details.",
    x: 180,
    y: 280,
    width: 500,
    height: 390,
    labels: [
      ["classroom teacher desk", "教师桌", 350, 530],
      ["desk worktop", "桌面", 350, 400],
      ["teacher workstation drawer", "教师工作桌抽屉", 520, 540],
      ["teacher drawer pull", "教师桌抽屉拉手", 520, 550],
      ["desk modesty panel", "桌下挡板", 350, 570],
      ["desk leg", "桌腿", 300, 610],
      ["desk foot", "桌脚", 300, 650],
      ["teacher work chair", "教师椅", 500, 430],
      ["teacher chair backrest", "教师椅背", 500, 400],
      ["teacher chair seat", "教师椅座", 500, 470],
      ["teacher chair armrest", "教师椅扶手", 550, 470],
      ["teacher chair caster", "教师椅脚轮", 500, 600],
      ["teacher desk monitor", "教师桌显示器", 300, 340],
      ["teacher monitor bezel", "教师显示器边框", 300, 340],
      ["teacher monitor stand", "教师显示器支架", 300, 410],
      ["teacher keyboard", "教师键盘", 360, 450],
      ["teacher mouse", "教师鼠标", 440, 450],
      ["teacher document tray", "教师文件托盘", 470, 390],
      ["teacher pen cup", "教师笔筒", 480, 430],
      ["teacher pencil", "教师铅笔", 480, 420],
      ["desk organizer", "桌面收纳架", 420, 390],
      ["teacher storage cabinet", "教师储物柜", 580, 520],
      ["teacher cabinet handle", "教师柜门把手", 590, 530],
      ["teacher desk cable", "教师桌面电缆", 450, 500],
      ["teacher desk lamp", "教师桌面灯", 220, 390],
    ],
  },
  {
    id: "pupil-desks",
    title: "Pupil desks and chairs",
    translation: "学生桌椅",
    description: "Compare the visible front, middle and rear pupil desks, chair parts, supports and floor glides.",
    x: 350,
    y: 450,
    width: 850,
    height: 450,
    labels: [
      ["front pupil desk", "前排学生桌", 500, 560],
      ["front desk top", "前排桌面", 500, 540],
      ["front desk edge", "前排桌边", 500, 590],
      ["front desk leg", "前排桌腿", 470, 700],
      ["front desk foot", "前排桌脚", 470, 800],
      ["front pupil chair", "前排学生椅", 500, 700],
      ["front chair back", "前排椅背", 500, 650],
      ["front chair seat", "前排椅座", 500, 720],
      ["front chair leg", "前排椅腿", 470, 820],
      ["front chair foot", "前排椅脚", 470, 860],
      ["middle pupil desk", "中排学生桌", 750, 550],
      ["middle desk top", "中排桌面", 750, 530],
      ["middle desk edge", "中排桌边", 750, 580],
      ["middle desk leg", "中排桌腿", 720, 700],
      ["middle pupil chair", "中排学生椅", 750, 690],
      ["middle chair back", "中排椅背", 750, 640],
      ["middle chair seat", "中排椅座", 750, 710],
      ["middle chair leg", "中排椅腿", 720, 820],
      ["rear pupil desk", "后排学生桌", 1_000, 520],
      ["rear desk top", "后排桌面", 1_000, 500],
      ["rear desk edge", "后排桌边", 1_000, 550],
      ["rear desk leg", "后排桌腿", 970, 670],
      ["rear pupil chair", "后排学生椅", 1_000, 650],
      ["rear chair back", "后排椅背", 1_000, 610],
      ["rear chair seat", "后排椅座", 1_000, 670],
      ["rear chair leg", "后排椅腿", 970, 760],
      ["desk floor glide", "桌脚地垫", 600, 860],
      ["chair floor glide", "椅脚地垫", 1_100, 850],
      ["desk support bar", "桌面支撑杆", 850, 700],
    ],
  },
  {
    id: "board-display",
    title: "Whiteboard and display wall",
    translation: "白板与展示墙",
    description: "Inspect the blank whiteboard, display boards, marker tray, rail, hooks and wall-panel details.",
    x: 250,
    y: 100,
    width: 750,
    height: 340,
    labels: [
      ["front classroom whiteboard", "教室白板", 650, 250],
      ["classroom board frame", "教室白板框", 650, 150],
      ["classroom board tray", "教室白板托盘", 650, 390],
      ["classroom board marker", "教室白板笔", 780, 380],
      ["classroom marker cup", "教室白板笔筒", 790, 380],
      ["board eraser", "白板擦", 730, 390],
      ["display board", "展示板", 370, 250],
      ["display board frame", "展示板框", 370, 150],
      ["classroom pinboard", "软木展示板", 900, 230],
      ["pinboard trim", "展示板饰条", 900, 160],
      ["display rail", "展示导轨", 450, 395],
      ["display ledge", "展示搁沿", 450, 410],
      ["wall display panel", "墙面展示板", 500, 210],
      ["wall display hook", "墙面展示挂钩", 470, 390],
      ["classroom front wall panel", "前墙面板", 300, 220],
      ["classroom front wall seam", "前墙面接缝", 850, 120],
      ["classroom webcam", "教室摄像头", 650, 100],
      ["webcam mount", "摄像头支架", 650, 115],
      ["webcam cable", "摄像头电缆", 670, 130],
      ["board corner", "白板转角", 940, 150],
      ["board fastener", "白板紧固件", 940, 160],
      ["display wall rail", "展示墙导轨", 850, 400],
    ],
  },
  {
    id: "storage-library",
    title: "Storage and bookcase",
    translation: "储物与书架",
    description: "Trace the visible cupboard, bookcase shelves, plain book spines, bins, trays and storage hardware.",
    x: 0,
    y: 80,
    width: 1_300,
    height: 520,
    labels: [
      ["classroom cupboard", "教室储物柜", 1_080, 300],
      ["classroom cupboard door", "储物柜门", 1_080, 280],
      ["cupboard handle", "储物柜把手", 1_120, 310],
      ["cupboard hinge", "储物柜铰链", 1_180, 300],
      ["cupboard shelf", "储物柜搁板", 1_100, 400],
      ["cupboard divider", "储物柜分隔板", 1_150, 400],
      ["bookcase", "书架", 100, 550],
      ["classroom bookcase shelf", "书架搁板", 100, 450],
      ["bookcase side panel", "书架侧板", 160, 500],
      ["classroom shelf lip", "搁板边缘", 120, 450],
      ["classroom shelf bracket", "搁板支架", 150, 450],
      ["classroom book spine", "书脊", 100, 500],
      ["plain notebook", "空白笔记本", 200, 500],
      ["binder", "文件夹", 1_000, 350],
      ["classroom storage bin", "储物箱", 1_080, 500],
      ["classroom blue storage bin", "蓝色储物箱", 1_100, 520],
      ["green storage bin", "绿色储物箱", 1_150, 520],
      ["classroom paper tray", "纸张托盘", 250, 530],
      ["classroom supply box", "用品盒", 260, 550],
      ["ruler", "尺子", 300, 520],
      ["pencil pot", "铅笔筒", 1_170, 520],
      ["coat bag cubby", "衣物书包格", 200, 300],
      ["classroom cubby shelf", "储物格搁板", 220, 350],
      ["classroom cubby divider", "储物格分隔片", 240, 350],
      ["classroom cabinet plinth", "柜体基座", 1_100, 560],
    ],
  },
  {
    id: "sink-cloakroom",
    title: "Sink and cloakroom",
    translation: "洗手池与衣帽区",
    description: "Inspect the visible sink, faucet, counter, coat hooks, backpacks, classroom door and threshold.",
    x: 1_100,
    y: 250,
    width: 400,
    height: 650,
    labels: [
      ["classroom sink", "教室洗手池", 1_450, 550],
      ["classroom sink basin", "洗手盆", 1_450, 590],
      ["classroom sink drain", "洗手池排水口", 1_450, 600],
      ["classroom faucet", "教室水龙头", 1_450, 500],
      ["classroom faucet spout", "水龙头出水口", 1_450, 520],
      ["classroom faucet handle", "水龙头把手", 1_420, 520],
      ["classroom sink counter", "洗手池台面", 1_400, 560],
      ["classroom counter edge", "台面边缘", 1_400, 620],
      ["classroom sink cabinet", "洗手池柜体", 1_450, 700],
      ["sink cabinet door", "洗手池柜门", 1_450, 720],
      ["sink cabinet pull", "洗手池柜门拉手", 1_450, 730],
      ["classroom coat hook", "衣帽钩", 1_450, 300],
      ["hook rail", "挂钩导轨", 1_450, 280],
      ["school backpack", "书包", 1_350, 400],
      ["green backpack", "绿色书包", 1_300, 420],
      ["blue backpack", "蓝色书包", 1_400, 420],
      ["classroom bag strap", "书包带", 1_350, 450],
      ["side classroom door", "教室门", 1_180, 350],
      ["classroom door window", "门窗", 1_200, 350],
      ["classroom door handle", "门把手", 1_180, 500],
      ["classroom door hinge", "门铰链", 1_220, 500],
      ["classroom doorway threshold", "门口门槛", 1_200, 780],
      ["classroom towel rail", "毛巾杆", 1_500, 650],
    ],
  },
  {
    id: "windows-lighting-floor",
    title: "Windows, lighting and floor",
    translation: "窗户、照明与地面",
    description: "Trace the visible windows, blinds, radiator, ceiling lights, air grille, skirting and floor finish.",
    x: 0,
    y: 0,
    width: 1_600,
    height: 900,
    labels: [
      ["front classroom window", "教室窗", 80, 200],
      ["classroom window frame", "窗框", 120, 200],
      ["classroom window sill", "窗台", 180, 280],
      ["classroom window blind", "窗百叶", 150, 120],
      ["classroom blind slat", "百叶片", 160, 130],
      ["classroom blind rail", "百叶导轨", 160, 80],
      ["classroom radiator", "教室暖气片", 250, 550],
      ["radiator grille", "暖气片格栅", 250, 570],
      ["radiator valve", "暖气片阀门", 260, 600],
      ["classroom ceiling panel", "教室顶板", 1_100, 50],
      ["classroom ceiling light", "教室顶灯", 1_000, 70],
      ["classroom light diffuser", "灯具扩散罩", 1_000, 80],
      ["classroom air grille", "教室通风格栅", 1_350, 60],
      ["classroom wall base trim", "墙根饰条", 1_300, 820],
      ["classroom floorboard", "教室地板", 800, 850],
      ["floorboard seam", "地板接缝", 850, 850],
      ["floor skirting", "地脚线", 1_200, 800],
      ["doorway trim", "门口饰条", 1_200, 260],
      ["classroom plant pot", "教室植物盆", 440, 300],
      ["classroom plant leaf", "教室植物叶片", 440, 280],
      ["classroom globe stand", "地球仪底座", 80, 360],
      ["classroom globe meridian", "地球仪经线架", 80, 330],
      ["floor threshold trim", "地面门槛饰条", 1_100, 880],
      ["wall color band", "墙面色带", 900, 430],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(value) {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function makeScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, labelTranslation, x, y] of zone.labels) {
      const idSuffix = slug(word);
      const region = {
        id: `primary-classroom-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the primary classroom photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `primary-classroom-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`primary-classroom-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `primary-classroom-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      targetScale: 3.15,
      labelIds,
    });
  }
  return {
    id: "primary-classroom",
    title: "Primary classroom",
    translation: "小学教室",
    subtitle: "Teacher area, pupil desks, whiteboard, storage, sink, cloakroom, windows and floor",
    asset: "/scenes/primary-classroom-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/primary-classroom-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 primary-classroom photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable teacher, pupil-desk, board, storage, sink, cloakroom, window, lighting and floor parts. People, identities, lesson content, readable writing, school branding and hidden building systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["people", "teacher identity", "pupil identity", "lesson content", "school branding", "hidden building system"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("primary classroom source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("primary classroom JPEG is not reproducible");
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
  const wordSources = new Map();
  for (const label of scene.labels) {
    const normalized = label.word.toLocaleLowerCase();
    const sources = wordSources.get(normalized) ?? [];
    sources.push(label.id);
    wordSources.set(normalized, sources);
  }
  const duplicateWords = [...wordSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([word, sources]) => `${word} (${sources.join(", ")})`);
  if (duplicateWords.length > 0) throw new Error(`primary-classroom contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  const existingDuplicates = [...wordSources.keys()].filter((word) => existingWords.has(word));
  if (existingDuplicates.length > 0) throw new Error(`primary-classroom term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-primary-classroom",
  label: "Enter the primary classroom",
  translation: "进入小学教室",
  childSceneId: "primary-classroom",
  sourceVisualRegion: "portal-primary-classroom",
  x: 450,
  y: 0,
  width: 400,
  height: 305,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete classroom visible through the upper-centre school windows",
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
  else parent.portals.unshift(parentPortal);
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion;
  else parent.visualRegions.push(parentRegion);
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "primary-classroom")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "school-campus");
    if (parentIndex < 0) throw new Error("school-campus is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "primary-classroom",
      title: "Primary classroom",
      parentId: "school-campus",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildPrimaryClassroomScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const result = {
    assetChanged,
    sceneChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildPrimaryClassroomScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-primary-classroom-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
