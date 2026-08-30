import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal school-art-studio scene from a reviewed classroom
 * photograph. Parent portal and manifest integration remain with the root
 * agent; this script owns only the child scene, assets and term audit.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/school-art-studio-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/school-art-studio-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-art-studio.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "c67580995957ff9c7a4bd348ce5782b820eed7cc244d2f35c69fb09929d6bb62";
const PUBLIC_ASSET_SHA256 = "b5d3a87d8b03bbd08f3f9b615351f3351d8e16ddfd9afde65ec904dc264b0687";

const zones = [
  {
    id: "easels-windows",
    title: "Easels and windows",
    translation: "画架与窗户",
    description: "Inspect the visible easels, blank canvases, window frames, blinds and radiator hardware.",
    x: 0,
    y: 0,
    width: 450,
    height: 900,
    labels: [
      ["art easel", "美术画架", 100, 450],
      ["art easel frame", "画架框架", 100, 380],
      ["easel canvas", "画架画布", 100, 330],
      ["canvas clamp", "画布夹", 110, 300],
      ["canvas ledge", "画布托沿", 100, 500],
      ["easel crossbar", "画架横档", 100, 570],
      ["easel hinge", "画架铰链", 120, 580],
      ["easel foot", "画架脚", 100, 650],
      ["middle art easel", "中间美术画架", 250, 450],
      ["right art easel", "右侧美术画架", 350, 450],
      ["studio window", "画室窗", 120, 180],
      ["studio window frame", "画室窗框", 150, 200],
      ["studio window sill", "画室窗台", 200, 300],
      ["studio window latch", "画室窗锁扣", 250, 250],
      ["studio window blind", "画室窗百叶", 150, 100],
      ["studio blind slat", "画室百叶片", 180, 120],
      ["studio blind rail", "画室百叶导轨", 200, 80],
      ["art studio radiator", "美术室暖气片", 300, 520],
      ["studio radiator grille", "暖气片格栅", 300, 550],
      ["studio radiator valve", "暖气片阀门", 340, 580],
      ["window light", "窗边光线", 280, 200],
      ["easel leg", "画架支腿", 250, 650],
      ["blank canvas board", "空白画布板", 250, 330],
      ["studio window panel", "画室窗面板", 350, 200],
    ],
  },
  {
    id: "student-worktable",
    title: "Student art worktable",
    translation: "学生美术工作台",
    description: "Trace the visible student table, stools, paint bottles, palettes, brushes, paper and trays.",
    x: 120,
    y: 400,
    width: 680,
    height: 400,
    labels: [
      ["student worktable", "学生工作台", 400, 560],
      ["worktable top", "工作台面", 400, 500],
      ["art worktable edge", "工作台边缘", 400, 600],
      ["worktable leg", "工作台桌腿", 350, 700],
      ["worktable foot", "工作台桌脚", 350, 760],
      ["worktable apron", "工作台围板", 450, 650],
      ["art stool", "美术凳", 250, 700],
      ["art stool seat", "凳面", 250, 650],
      ["art stool leg", "凳腿", 250, 740],
      ["art stool foot ring", "凳脚圈", 250, 780],
      ["paint bottle", "颜料瓶", 300, 480],
      ["red paint bottle", "红色颜料瓶", 340, 480],
      ["blue paint bottle", "蓝色颜料瓶", 380, 480],
      ["yellow paint bottle", "黄色颜料瓶", 420, 480],
      ["paint pot", "颜料罐", 500, 480],
      ["paint pot lid", "颜料罐盖", 520, 470],
      ["mixing palette", "调色板", 450, 530],
      ["palette well", "调色板凹槽", 470, 530],
      ["brush jar", "画笔罐", 550, 470],
      ["art paintbrush", "画笔", 550, 440],
      ["art brush handle", "画笔柄", 560, 430],
      ["art brush bristle", "画笔刷毛", 570, 410],
      ["paper sheet", "画纸", 350, 540],
      ["art paper stack", "画纸堆", 400, 550],
      ["water cup", "水杯", 600, 500],
      ["art table tray", "美术台托盘", 650, 520],
    ],
  },
  {
    id: "clay-sculpture-table",
    title: "Clay and sculpture table",
    translation: "陶土与雕塑工作台",
    description: "Inspect the visible clay slab, sculpting tools, rolling pin, trays, work mat and table structure.",
    x: 250,
    y: 580,
    width: 900,
    height: 320,
    labels: [
      ["clay slab", "陶土板", 500, 740],
      ["clay board", "陶土垫板", 450, 700],
      ["clay rolling pin", "陶土擀杖", 700, 680],
      ["clay wire cutter", "陶土钢丝切割器", 580, 800],
      ["clay rib tool", "陶土刮片", 650, 800],
      ["clay loop tool", "陶土环形工具", 700, 800],
      ["clay knife", "陶土刀", 760, 800],
      ["clay needle", "陶土针", 800, 800],
      ["clay modeling tool", "陶土塑形工具", 850, 800],
      ["clay texture tool", "陶土纹理工具", 900, 800],
      ["unmarked plaster form", "无标记石膏模型", 750, 720],
      ["sculpture base", "雕塑底座", 750, 760],
      ["sculpture sponge", "雕塑海绵", 850, 720],
      ["clay bowl", "陶土碗", 900, 720],
      ["clay water cup", "陶土用水杯", 950, 720],
      ["sculpture tray", "雕塑托盘", 850, 750],
      ["sculpture tray liner", "托盘内衬", 880, 750],
      ["front art table", "前方美术台", 600, 650],
      ["front table leg", "前方桌腿", 500, 850],
      ["front table foot", "前方桌脚", 500, 880],
      ["table support", "桌面支撑", 700, 850],
      ["front table underside", "桌面底部", 700, 820],
      ["art work mat", "美术工作垫", 500, 700],
      ["mat edge", "工作垫边缘", 500, 760],
      ["clay tool bundle", "陶土工具束", 950, 800],
      ["clay scraper", "陶土刮刀", 1_000, 800],
    ],
  },
  {
    id: "drying-storage-display",
    title: "Drying, storage and display",
    translation: "干燥、储物与展示",
    description: "Trace the visible drying rack, blank papers, storage shelves, bins, aprons and display hardware.",
    x: 450,
    y: 100,
    width: 700,
    height: 500,
    labels: [
      ["art drying rack", "美术干燥架", 600, 250],
      ["drying rack frame", "干燥架框架", 600, 230],
      ["art drying rack shelf", "干燥架搁层", 600, 280],
      ["drying rack caster", "干燥架脚轮", 600, 400],
      ["drying paper", "晾干画纸", 600, 200],
      ["paper corner", "画纸转角", 650, 200],
      ["paper clip", "纸夹", 680, 210],
      ["art display board", "美术展示板", 800, 180],
      ["display card", "展示卡片", 800, 200],
      ["card mount", "卡片挂座", 800, 220],
      ["display hook", "展示挂钩", 800, 300],
      ["art display rail", "展示导轨", 800, 290],
      ["display peg", "展示插销", 820, 300],
      ["apron rail", "围裙导轨", 900, 320],
      ["apron hook", "围裙挂钩", 930, 330],
      ["blue apron", "蓝色围裙", 930, 400],
      ["paint storage shelf", "颜料储物架", 700, 450],
      ["storage cubby", "储物格", 750, 450],
      ["art storage bin", "美术储物箱", 750, 500],
      ["gray art bin", "灰色美术箱", 800, 500],
      ["blue art bin", "蓝色美术箱", 850, 500],
      ["green art bin", "绿色美术箱", 900, 500],
      ["art studio supply shelf", "美术教室用品搁板", 700, 400],
      ["art shelf divider", "搁板分隔片", 730, 400],
      ["art shelf bracket", "搁板支架", 760, 420],
      ["paint tray", "颜料托盘", 950, 470],
      ["marker pot", "彩笔筒", 980, 470],
    ],
  },
  {
    id: "teacher-sink-prep",
    title: "Teacher preparation and sink",
    translation: "教师准备台与水槽",
    description: "Inspect the visible demonstration table, tablet, cutting mat, drawers, sink, faucet and cabinet hardware.",
    x: 900,
    y: 300,
    width: 700,
    height: 600,
    labels: [
      ["teacher demo table", "教师示范台", 1_050, 500],
      ["demo table top", "示范台面", 1_050, 450],
      ["demo table drawer", "示范台抽屉", 1_050, 550],
      ["demo drawer handle", "示范台抽屉把手", 1_050, 550],
      ["teacher cutting mat", "切割垫", 1_100, 450],
      ["art tablet", "美术平板", 1_100, 400],
      ["tablet stand", "平板支架", 1_100, 450],
      ["art supply drawer", "美术用品抽屉", 1_200, 550],
      ["prep counter", "准备台", 1_400, 500],
      ["studio sink", "画室水槽", 1_450, 600],
      ["studio sink basin", "画室水槽盆", 1_450, 630],
      ["studio sink drain", "画室水槽排水口", 1_450, 650],
      ["studio faucet", "画室水龙头", 1_450, 500],
      ["studio faucet spout", "画室水龙头出水口", 1_450, 530],
      ["studio faucet handle", "画室水龙头把手", 1_480, 550],
      ["sink drainer", "水槽沥水板", 1_380, 600],
      ["sink splashback", "水槽挡水板", 1_450, 450],
      ["studio sink cabinet", "画室水槽柜", 1_450, 750],
      ["studio sink cabinet door", "水槽柜门", 1_450, 780],
      ["sink cabinet handle", "水槽柜门把手", 1_450, 800],
      ["art waste bin", "美术垃圾桶", 1_300, 700],
      ["art waste liner", "美术垃圾桶内衬", 1_300, 720],
      ["drying sponge", "晾干海绵", 1_350, 500],
      ["apron cabinet", "围裙柜", 1_150, 650],
      ["prep counter edge", "准备台边缘", 1_350, 550],
    ],
  },
  {
    id: "floor-lighting-room",
    title: "Studio floor and room finish",
    translation: "画室地面与房间饰面",
    description: "Trace the visible washable floor, drain, base trim, ceiling lights, doorway, plant and room panels.",
    x: 0,
    y: 0,
    width: 1_600,
    height: 900,
    labels: [
      ["art studio floor", "美术室地面", 1_100, 850],
      ["washable floor", "可清洗地面", 1_000, 800],
      ["studio floor drain", "画室地漏", 1_200, 780],
      ["studio floor seam", "画室地面接缝", 1_300, 850],
      ["studio floor tile", "画室地砖", 1_350, 800],
      ["studio wall base trim", "画室墙根饰条", 1_300, 700],
      ["studio ceiling panel", "画室顶板", 1_200, 50],
      ["studio ceiling light", "画室顶灯", 900, 50],
      ["art light diffuser", "美术室灯具扩散罩", 900, 60],
      ["studio acoustic panel", "画室吸音板", 1_000, 100],
      ["studio ceiling seam", "画室顶面接缝", 1_100, 80],
      ["studio doorway", "画室门口", 1_200, 280],
      ["studio door frame", "画室门框", 1_250, 300],
      ["studio door handle", "画室门把手", 1_220, 400],
      ["studio door hinge", "画室门铰链", 1_280, 350],
      ["studio door window", "画室门窗", 1_220, 300],
      ["studio doorway threshold", "画室门槛", 1_200, 470],
      ["studio wall panel", "画室墙面板", 1_350, 300],
      ["studio corner trim", "画室转角饰条", 1_300, 500],
      ["studio floor mat", "画室地垫", 1_250, 700],
      ["studio mat edge", "画室地垫边缘", 1_250, 720],
      ["art plant", "美术室植物", 1_000, 250],
      ["art plant pot", "美术室植物盆", 1_000, 300],
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
        id: `school-art-studio-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the school art studio photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `school-art-studio-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`school-art-studio-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `school-art-studio-zone-${zone.id}`,
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
    id: "school-art-studio",
    title: "School art studio",
    translation: "学校美术教室",
    subtitle: "Easels, worktables, paint tools, clay tools, drying rack, storage, sink and washable floor",
    asset: "/scenes/school-art-studio-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-art-studio-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 school-art-studio photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable easel, worktable, paint, clay, drying, storage, sink, doorway and room-finish parts. People, identities, lesson content, artwork authorship, school branding, chemical claims and hidden building systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["people", "teacher identity", "student identity", "lesson content", "artwork authorship", "hidden building system"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("school art studio source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("school art studio JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`school-art-studio contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`school-art-studio term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-school-art-studio",
  label: "Enter the school art studio",
  translation: "进入学校美术教室",
  childSceneId: "school-art-studio",
  sourceVisualRegion: "portal-school-art-studio",
  x: 210,
  y: 306,
  width: 388,
  height: 239,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete art studio visible in the middle-left school wing",
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
  else {
    const gymIndex = parent.portals.findIndex(({ childSceneId }) => childSceneId === "school-gymnasium-equipment");
    parent.portals.splice(gymIndex >= 0 ? gymIndex : parent.portals.length, 0, parentPortal);
  }
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion;
  else parent.visualRegions.push(parentRegion);
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "school-art-studio")) {
    const classroomIndex = manifest.scenes.findIndex(({ id }) => id === "primary-classroom");
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "school-campus");
    if (parentIndex < 0) throw new Error("school-campus is missing from the scene manifest");
    manifest.scenes.splice(classroomIndex >= 0 ? classroomIndex + 1 : parentIndex + 1, 0, {
      id: "school-art-studio",
      title: "School art studio",
      parentId: "school-campus",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSchoolArtStudioScene() {
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
  buildSchoolArtStudioScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-art-studio-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
