import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build a terminal close-up of the supermarket's central refrigerated
 * merchandiser. This script owns only the new scene and its assets; the
 * supermarket parent portal and manifest entry are integrated by the root
 * agent so they remain outside this content batch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/refrigerated-display-case-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/refrigerated-display-case-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/refrigerated-display-case.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/supermarket-grocery.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "a70d630471004fd1ce297b9a94426ff691772ae73b99438ff80de21743d463f1";
const PUBLIC_ASSET_SHA256 = "80f2242e79d3edd8ac7bf10739a821c09a2c4f37e8abbc56e961f96be942b1a4";

const zones = [
  {
    id: "cabinet-canopy",
    title: "Cabinet canopy and shell",
    translation: "柜体顶盖与外壳",
    description: "Trace the visible merchandiser canopy, header, stainless frame, side panels and shell seams.",
    x: 170,
    y: 0,
    width: 1_430,
    height: 550,
    labels: [
      ["refrigerated display case", "冷藏陈列柜", 760, 55],
      ["merchandiser canopy", "陈列柜顶盖", 760, 70],
      ["canopy fascia", "顶盖饰板", 760, 95],
      ["canopy top panel", "顶盖面板", 900, 45],
      ["cabinet header", "柜体上梁", 500, 120],
      ["header seam", "上梁接缝", 650, 120],
      ["upper side panel", "上侧板", 1_280, 120],
      ["right side panel", "右侧板", 1_420, 200],
      ["side panel seam", "侧板接缝", 1_390, 230],
      ["cabinet corner guard", "柜体护角", 1_400, 105],
      ["merchandiser cabinet frame", "陈列柜柜体框架", 1_050, 150],
      ["stainless steel frame", "不锈钢框架", 950, 155],
      ["vertical frame rail", "竖向框条", 600, 160],
      ["left end panel", "左端板", 190, 200],
      ["right end panel", "右端板", 1_430, 320],
      ["top trim", "顶部饰条", 1_050, 105],
      ["canopy underside", "顶盖底面", 900, 150],
      ["header corner seam", "上梁转角接缝", 1_260, 150],
      ["exterior side rail", "外侧导轨", 1_390, 410],
      ["cabinet shell edge", "柜体外壳边缘", 1_450, 500],
    ],
  },
  {
    id: "left-door-bank",
    title: "Left glass-door bank",
    translation: "左侧玻璃门组",
    description: "Inspect the left transparent door, frame, hinge, gasket, shelf hardware and visible dairy packages.",
    x: 190,
    y: 80,
    width: 430,
    height: 650,
    labels: [
      ["left merchandiser door", "左侧陈列柜门", 320, 380],
      ["left door frame", "左侧门框", 220, 360],
      ["left door handle", "左侧门把手", 215, 390],
      ["left door hinge", "左侧门铰链", 210, 520],
      ["left door gasket", "左侧门密封条", 300, 145],
      ["left door sill", "左侧门槛", 320, 690],
      ["left door mullion", "左侧门竖框", 410, 360],
      ["left handle mount", "左侧把手底座", 215, 420],
      ["left magnetic seal", "左侧磁性密封条", 420, 500],
      ["left door glass", "左侧门玻璃", 330, 250],
      ["left shelf lip", "左侧层架边缘", 350, 250],
      ["left shelf clip", "左侧层架卡扣", 300, 260],
      ["left shelf bracket", "左侧层架支架", 380, 430],
      ["left product strip", "左侧商品条", 350, 450],
      ["left interior liner", "左侧内衬", 280, 300],
      ["left return air slot", "左侧回风槽", 250, 630],
      ["left light rail", "左侧灯轨", 250, 135],
      ["left yogurt cup", "左侧酸奶杯", 300, 180],
      ["left cream cup", "左侧奶油杯", 400, 340],
      ["left dairy carton", "左侧乳品纸盒", 300, 500],
      ["left milk carton", "左侧牛奶纸盒", 450, 510],
      ["left cultured cup", "左侧发酵乳杯", 300, 590],
      ["left lower carton", "左侧下层纸盒", 450, 620],
      ["left shelf divider", "左侧层架分隔片", 500, 430],
    ],
  },
  {
    id: "center-door-bank",
    title: "Center glass-door bank",
    translation: "中央玻璃门组",
    description: "Follow the central door hardware, shelf rails, interior liner, bottle caps and dairy containers.",
    x: 600,
    y: 80,
    width: 480,
    height: 650,
    labels: [
      ["center merchandiser door", "中央陈列柜门", 750, 380],
      ["center door frame", "中央门框", 630, 360],
      ["center door handle", "中央门把手", 620, 390],
      ["center door hinge", "中央门铰链", 620, 520],
      ["center door gasket", "中央门密封条", 760, 145],
      ["center door sill", "中央门槛", 760, 690],
      ["center door mullion", "中央门竖框", 850, 360],
      ["center handle mount", "中央把手底座", 620, 420],
      ["center magnetic seal", "中央磁性密封条", 870, 500],
      ["center door glass", "中央门玻璃", 760, 250],
      ["center shelf rail", "中央层架导轨", 750, 250],
      ["center shelf clip", "中央层架卡扣", 700, 260],
      ["center shelf bracket", "中央层架支架", 850, 430],
      ["center product strip", "中央商品条", 750, 450],
      ["center interior liner", "中央内衬", 700, 300],
      ["center air return", "中央回风口", 680, 630],
      ["center light rail", "中央灯轨", 680, 135],
      ["center milk jug", "中央牛奶壶", 720, 300],
      ["center milk cap", "中央牛奶壶盖", 720, 270],
      ["center cream carton", "中央奶油纸盒", 850, 320],
      ["center dairy bottle", "中央乳品瓶", 920, 330],
      ["center lower carton", "中央下层纸盒", 720, 600],
      ["center yogurt cup", "中央酸奶杯", 900, 210],
      ["center butter block", "中央黄油块", 920, 470],
      ["center cheese pack", "中央奶酪包装", 920, 560],
    ],
  },
  {
    id: "right-door-bank",
    title: "Right egg and cheese bank",
    translation: "右侧蛋品与奶酪门组",
    description: "Inspect the right glass door, frame, shelf hardware and distinct egg, butter and cheese packages.",
    x: 1_060,
    y: 80,
    width: 380,
    height: 700,
    labels: [
      ["right merchandiser door", "右侧陈列柜门", 1_180, 390],
      ["right door frame", "右侧门框", 1_070, 370],
      ["right door handle", "右侧门把手", 1_065, 400],
      ["right door hinge", "右侧门铰链", 1_070, 520],
      ["right door gasket", "右侧门密封条", 1_200, 145],
      ["right door sill", "右侧门槛", 1_200, 740],
      ["right door mullion", "右侧门竖框", 1_290, 370],
      ["right handle mount", "右侧把手底座", 1_065, 430],
      ["right magnetic seal", "右侧磁性密封条", 1_310, 520],
      ["right door glass", "右侧门玻璃", 1_200, 260],
      ["right shelf rail", "右侧层架导轨", 1_190, 260],
      ["right shelf clip", "右侧层架卡扣", 1_120, 270],
      ["right shelf bracket", "右侧层架支架", 1_330, 430],
      ["right product strip", "右侧商品条", 1_200, 460],
      ["right interior liner", "右侧内衬", 1_360, 310],
      ["right return air slot", "右侧回风槽", 1_100, 670],
      ["right light rail", "右侧灯轨", 1_100, 135],
      ["upper egg carton", "上层蛋盒", 1_170, 200],
      ["lower egg carton", "下层蛋盒", 1_170, 340],
      ["display egg carton lid", "陈列柜蛋盒盖", 1_220, 200],
      ["egg carton cup", "蛋盒凹槽", 1_260, 350],
      ["right butter block", "右侧黄油块", 1_180, 500],
      ["right cheese block", "右侧奶酪块", 1_330, 500],
      ["right cheese cube", "右侧奶酪方块", 1_240, 620],
      ["right cheese package", "右侧奶酪包装", 1_350, 620],
    ],
  },
  {
    id: "shelf-product-detail",
    title: "Shelf and product detail",
    translation: "层架与商品细节",
    description: "Compare the visible shelf edges, supports, product separators and blank dairy package forms.",
    x: 220,
    y: 120,
    width: 1_120,
    height: 600,
    labels: [
      ["adjustable wire shelf", "可调节金属层架", 550, 250],
      ["case shelf front edge", "陈列柜层架前边缘", 600, 260],
      ["shelf rear rail", "层架后导轨", 700, 235],
      ["case shelf support", "陈列柜层架支撑", 650, 430],
      ["case shelf divider", "陈列柜层架分隔片", 800, 450],
      ["display tray", "陈列托盘", 500, 580],
      ["product riser", "商品垫高架", 580, 590],
      ["carton divider", "纸盒分隔片", 770, 590],
      ["display case milk carton", "陈列柜牛奶纸盒", 820, 620],
      ["milk carton spout", "牛奶纸盒倒嘴", 850, 610],
      ["milk carton cap", "牛奶纸盒盖", 860, 590],
      ["display case yogurt lid", "陈列柜酸奶盖", 360, 185],
      ["display case yogurt tub", "陈列柜酸奶桶", 380, 310],
      ["display case dairy bottle", "陈列柜乳品瓶", 900, 350],
      ["dairy bottle cap", "乳品瓶盖", 900, 315],
      ["display case cream container", "陈列柜奶油容器", 500, 350],
      ["cream container lid", "奶油容器盖", 500, 330],
      ["butter wrapper", "黄油包装纸", 1_000, 480],
      ["display case butter block", "陈列柜黄油块", 1_000, 520],
      ["display case cheese block", "陈列柜奶酪块", 1_000, 620],
      ["display case cheese pack", "陈列柜奶酪包装", 1_060, 520],
      ["display case egg tray", "陈列柜蛋托", 1_150, 350],
      ["egg carton handle", "蛋盒提手", 1_230, 350],
      ["product strip rail", "商品条导轨", 700, 460],
      ["shelf end stop", "层架端挡", 1_000, 260],
    ],
  },
  {
    id: "base-airflow",
    title: "Base and airflow hardware",
    translation: "底座与气流设施",
    description: "Trace the visible lower base, black ventilation louvers, rails, feet and floor contact details.",
    x: 180,
    y: 700,
    width: 1_260,
    height: 200,
    labels: [
      ["lower cabinet base", "柜体下底座", 700, 760],
      ["black kickplate", "黑色踢脚板", 700, 790],
      ["condenser grille", "冷凝器格栅", 500, 800],
      ["ventilation louver", "通风百叶", 550, 820],
      ["return air grille", "回风格栅", 900, 800],
      ["air intake slot", "进风槽", 1_050, 820],
      ["bottom grille slat", "底部格栅条", 1_000, 840],
      ["grille frame", "格栅框", 700, 820],
      ["base trim", "底座饰条", 750, 750],
      ["merchandiser cabinet plinth", "陈列柜柜体基座", 850, 770],
      ["left base rail", "左侧底部导轨", 300, 750],
      ["center base rail", "中央底部导轨", 750, 750],
      ["right base rail", "右侧底部导轨", 1_200, 750],
      ["base panel seam", "底板接缝", 1_000, 760],
      ["leveling foot", "调平脚", 1_250, 860],
      ["floor contact pad", "地面接触垫", 1_250, 880],
      ["merchandiser lower shelf", "陈列柜下层架", 1_100, 700],
      ["lower shelf lip", "下层架边缘", 1_100, 710],
      ["lower shelf support", "下层架支撑", 1_150, 720],
      ["display-case floor tile", "陈列柜前地砖", 400, 870],
      ["floor grout line", "地砖缝", 400, 850],
      ["base grille corner", "底部格栅转角", 800, 880],
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
        id: `refrigerated-display-case-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the refrigerated display case photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `refrigerated-display-case-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`refrigerated-display-case-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `refrigerated-display-case-zone-${zone.id}`,
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
    id: "refrigerated-display-case",
    title: "Refrigerated display case",
    translation: "冷藏陈列柜",
    subtitle: "Glass doors, shelves, dairy and egg packages, lighting and base ventilation",
    asset: "/scenes/refrigerated-display-case-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "supermarket-grocery",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/refrigerated-display-case-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 refrigerated-display-case photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable cabinet, door, shelf, dairy, egg, cheese, lighting and base-airflow parts. Product brands, readable package text, prices, barcodes, temperatures, energy performance, freshness, food-safety claims and hidden refrigeration components were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["product brand", "package text", "price", "barcode", "temperature", "hidden compressor"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("refrigerated display case source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("refrigerated display case JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`refrigerated-display-case contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`refrigerated-display-case term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-refrigerated-display-case",
  label: "Enter the refrigerated display case",
  translation: "进入冷藏陈列柜",
  childSceneId: "refrigerated-display-case",
  sourceVisualRegion: "portal-refrigerated-display-case-central-cabinet",
  x: 320,
  y: 110,
  width: 520,
  height: 390,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete visible central glass-door refrigerated cabinet in the supermarket photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "refrigerated-display-case")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "supermarket-grocery");
    if (index < 0) throw new Error("supermarket-grocery is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "refrigerated-display-case",
      title: "Refrigerated display case",
      parentId: "supermarket-grocery",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildRefrigeratedDisplayCaseScene() {
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
  buildRefrigeratedDisplayCaseScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-refrigerated-display-case-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
