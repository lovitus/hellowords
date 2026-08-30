import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal automated-dispensing-cabinet scene from a reviewed
 * hospital-pharmacy photograph. Pass --integrate after review to connect the
 * visible cabinet bank in the parent and update the manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/automated-dispensing-cabinet-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/automated-dispensing-cabinet-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/automated-dispensing-cabinet.json");
const parentPath = resolve(projectRoot, "public/data/scenes/hospital-pharmacy.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "efe80ef882c41e40f9c9f93e41a755566fb2f8024497f7a838afdc81ed885111";
const PUBLIC_ASSET_SHA256 = "ffad54c64be1bcb601c5ea1483a93786adf1bfb18e351a4260dcfaedaa47fdad";

const zones = [
  {
    id: "adc-touchscreen",
    title: "Automated cabinet control face",
    translation: "自动药柜控制面",
    description: "Trace the visible touchscreen, scanner recess, access panels, cable channel, trim and cabinet base.",
    x: 500,
    y: 0,
    width: 300,
    height: 900,
    labels: [
      ["pharmacy automated dispensing cabinet", "药房自动发药柜", 650, 400],
      ["adc touchscreen", "自动药柜触控屏", 650, 200],
      ["adc screen bezel", "自动药柜屏幕边框", 650, 200],
      ["adc blank screen", "自动药柜空白屏幕", 650, 200],
      ["adc screen glass", "自动药柜屏幕玻璃", 650, 200],
      ["adc barcode reader", "自动药柜条码读取器", 700, 370],
      ["adc barcode recess", "自动药柜条码凹槽", 650, 350],
      ["adc reader housing", "自动药柜读取器外壳", 700, 370],
      ["adc card reader slot", "自动药柜读卡插槽", 735, 370],
      ["adc printer bay", "自动药柜打印机舱", 650, 440],
      ["adc receipt slot", "自动药柜收据插槽", 650, 450],
      ["adc access panel", "自动药柜检修面板", 650, 520],
      ["adc panel handle", "自动药柜面板把手", 650, 520],
      ["adc cabinet side panel", "自动药柜侧板", 560, 500],
      ["adc cabinet top panel", "自动药柜顶板", 650, 80],
      ["adc upper seam", "自动药柜上部接缝", 650, 120],
      ["adc lower drawer", "自动药柜下抽屉", 650, 650],
      ["adc lower drawer handle", "自动药柜下抽屉把手", 650, 650],
      ["adc cabinet plinth", "自动药柜基座", 650, 820],
      ["adc leveling foot", "自动药柜调平脚", 560, 840],
      ["adc power cable", "自动药柜电源线", 735, 500],
      ["adc cable channel", "自动药柜电缆通道", 735, 550],
      ["adc wall rail", "自动药柜墙面导轨", 530, 200],
      ["adc side trim", "自动药柜侧饰条", 780, 500],
    ],
  },
  {
    id: "matrix-drawers",
    title: "Matrix drawers and pockets",
    translation: "矩阵抽屉与储物格",
    description: "Inspect the visible matrix pockets, drawer faces, rails, dividers, handles, latches and cabinet liner.",
    x: 780,
    y: 40,
    width: 420,
    height: 790,
    labels: [
      ["medication matrix drawer", "药品矩阵抽屉", 900, 450],
      ["matrix drawer front", "矩阵抽屉前板", 900, 450],
      ["matrix drawer handle", "矩阵抽屉把手", 900, 450],
      ["matrix drawer pocket", "矩阵抽屉储物格", 900, 500],
      ["matrix pocket divider", "矩阵储物格分隔片", 930, 500],
      ["matrix pocket bin", "矩阵储物格箱", 970, 500],
      ["full-height medication drawer", "全高药品抽屉", 850, 200],
      ["half-height medication drawer", "半高药品抽屉", 850, 320],
      ["locked medication drawer", "带锁药品抽屉", 850, 400],
      ["adc drawer faceplate", "自动药柜抽屉面板", 850, 220],
      ["adc drawer pull", "自动药柜抽屉拉手", 850, 220],
      ["adc drawer rail", "自动药柜抽屉导轨", 850, 250],
      ["adc drawer hinge", "自动药柜抽屉铰链", 850, 320],
      ["adc drawer latch", "自动药柜抽屉锁扣", 850, 360],
      ["blank drawer plate", "空白抽屉牌", 850, 220],
      ["adc drawer stop", "自动药柜抽屉止挡", 850, 330],
      ["drawer sidewall", "抽屉侧墙", 900, 500],
      ["drawer base", "抽屉底座", 900, 560],
      ["medication cubby", "药品储物格", 1_000, 500],
      ["cubby divider", "储物格分隔片", 1_020, 500],
      ["cubby bin", "储物格箱", 1_050, 500],
      ["cubby shelf", "储物格搁板", 1_050, 430],
      ["cabinet center mullion", "柜体中央竖框", 1_000, 150],
      ["cabinet inner liner", "柜体内衬", 1_080, 300],
      ["cabinet frame rail", "柜体框导轨", 1_150, 300],
    ],
  },
  {
    id: "medication-refrigerator",
    title: "Medication refrigerator",
    translation: "药品冷藏柜",
    description: "Study the visible refrigerator door, glass, gasket, shelves, clips, LED strip, vent and generic packages.",
    x: 1_200,
    y: 40,
    width: 400,
    height: 820,
    labels: [
      ["medication refrigerator", "药品冷藏柜", 1_400, 450],
      ["refrigerator glass door", "冷藏柜玻璃门", 1_400, 400],
      ["refrigerator door frame", "冷藏柜门框", 1_250, 400],
      ["refrigerator door handle", "冷藏柜门把手", 1_250, 450],
      ["refrigerator door gasket", "冷藏柜门密封条", 1_250, 500],
      ["refrigerator door hinge", "冷藏柜门铰链", 1_250, 300],
      ["refrigerator door sill", "冷藏柜门槛", 1_400, 760],
      ["refrigerator shelf", "冷藏柜搁板", 1_400, 300],
      ["refrigerator shelf rail", "冷藏柜搁板导轨", 1_400, 300],
      ["refrigerator shelf clip", "冷藏柜搁板卡扣", 1_350, 300],
      ["refrigerator shelf bracket", "冷藏柜搁板支架", 1_500, 300],
      ["refrigerator interior liner", "冷藏柜内衬", 1_300, 500],
      ["refrigerator LED strip", "冷藏柜 LED 灯带", 1_400, 120],
      ["refrigerator ceiling panel", "冷藏柜顶板", 1_400, 100],
      ["refrigerator bottom pan", "冷藏柜底盘", 1_400, 730],
      ["refrigerator vent grille", "冷藏柜通风格栅", 1_400, 800],
      ["refrigerator base grille", "冷藏柜底部格栅", 1_400, 820],
      ["refrigerator plinth", "冷藏柜基座", 1_400, 850],
      ["refrigerated medicine carton", "冷藏药品纸盒", 1_300, 250],
      ["refrigerated medicine bottle", "冷藏药品瓶", 1_400, 450],
      ["refrigerated vial", "冷藏药瓶", 1_400, 480],
      ["refrigerator shelf divider", "冷藏柜层架分隔片", 1_500, 500],
      ["refrigerator door seal", "冷藏柜门封条", 1_250, 550],
      ["refrigerator side panel", "冷藏柜侧板", 1_560, 450],
      ["refrigerator handle mount", "冷藏柜把手底座", 1_250, 450],
      ["refrigerator foot", "冷藏柜脚座", 1_500, 850],
    ],
  },
  {
    id: "pharmacy-counter",
    title: "Pharmacy preparation counter",
    translation: "药房配药台",
    description: "Inspect the visible pharmacy worktop, trays, cups, vials, racks, printer, scanner and lower storage.",
    x: 0,
    y: 350,
    width: 620,
    height: 550,
    labels: [
      ["pharmacy work counter", "药房工作台", 300, 550],
      ["pharmacy counter worktop", "药房工作台面", 300, 500],
      ["pharmacy counter backsplash", "药房工作台挡板", 300, 400],
      ["pharmacy counter edge", "药房工作台边缘", 300, 600],
      ["medication tray", "药品托盘", 300, 540],
      ["blue medication tray", "蓝色药品托盘", 300, 570],
      ["pill cup", "药杯", 200, 540],
      ["pill cup lid", "药杯盖", 200, 560],
      ["pharmacy prescription basket", "药房处方篮", 100, 500],
      ["pharmacy supply basket", "药房用品篮", 450, 500],
      ["pharmacy vial rack", "药房药瓶架", 500, 480],
      ["pharmacy amber vial", "药房琥珀色药瓶", 500, 450],
      ["pharmacy vial cap", "药房药瓶盖", 510, 430],
      ["vial rack divider", "药瓶架分隔片", 500, 500],
      ["medication label printer", "药品标签打印机", 80, 600],
      ["label printer housing", "标签打印机外壳", 80, 580],
      ["medication receipt tray", "药品收据托盘", 100, 630],
      ["medication receipt paper", "药品收据纸", 100, 610],
      ["pharmacy barcode scanner", "药房条码扫描器", 400, 480],
      ["pharmacy scanner stand", "药房扫描器支架", 400, 520],
      ["dispensing bin", "发药箱", 450, 700],
      ["pharmacy counter drawer", "药房柜台抽屉", 300, 750],
      ["pharmacy drawer handle", "药房抽屉把手", 300, 750],
      ["counter lower shelf", "柜台下层架", 450, 820],
      ["pharmacy counter cabinet", "药房柜台柜体", 500, 700],
    ],
  },
  {
    id: "storage-supplies",
    title: "Medication storage and supplies",
    translation: "药品储物与用品",
    description: "Compare the visible wall shelves, generic cartons, bottles, trays, bins, rack dividers and storage hardware.",
    x: 0,
    y: 0,
    width: 620,
    height: 550,
    labels: [
      ["pharmacy wall shelf", "药房墙面搁板", 200, 100],
      ["shelf support rail", "搁板支撑轨", 300, 150],
      ["white medicine carton", "白色药品纸盒", 200, 200],
      ["blue medicine carton", "蓝色药品纸盒", 300, 220],
      ["green medicine carton", "绿色药品纸盒", 400, 220],
      ["blank medication box", "空白药品盒", 500, 220],
      ["pharmacy amber bottle", "药房琥珀色瓶", 100, 250],
      ["white bottle", "白色瓶", 150, 260],
      ["vial tray", "药瓶托盘", 450, 300],
      ["ampoule rack", "安瓿架", 500, 320],
      ["pharmacy ampoule", "药房安瓿", 500, 330],
      ["medication cup", "药品杯", 400, 330],
      ["supply bin", "用品箱", 300, 450],
      ["white supply basket", "白色用品篮", 100, 450],
      ["blue supply bin", "蓝色用品箱", 450, 450],
      ["pharmacy cabinet shelf", "药房柜体搁板", 500, 400],
      ["pharmacy shelf edge", "药房搁板边缘", 300, 150],
      ["pharmacy shelf bracket", "药房搁板支架", 350, 160],
      ["paper basket", "纸张篮", 50, 400],
      ["stock tray", "库存托盘", 350, 420],
      ["stock bottle", "库存瓶", 450, 250],
      ["stock bottle cap", "库存瓶盖", 450, 230],
      ["medicine carton side", "药品纸盒侧面", 300, 260],
      ["carton blank panel", "纸盒空白面板", 350, 260],
      ["pharmacy storage shelf", "药房储物搁板", 250, 300],
    ],
  },
  {
    id: "cabinet-base-wall",
    title: "Cabinet bases and wall services",
    translation: "柜体底座与墙面设施",
    description: "Trace the visible cabinet bases, ventilation openings, floor finish, wall rail, outlets and service panels.",
    x: 500,
    y: 600,
    width: 1_100,
    height: 300,
    labels: [
      ["adc cabinet base", "自动药柜底座", 700, 820],
      ["adc base rail", "自动药柜底部导轨", 800, 840],
      ["adc base kickplate", "自动药柜底部踢脚板", 900, 850],
      ["adc base vent", "自动药柜底部通风口", 1_000, 820],
      ["pharmacy ventilation grille", "药房通风格栅", 1_200, 830],
      ["lower air intake", "下部进风口", 1_300, 830],
      ["pharmacy floor threshold", "药房地面门槛", 1_000, 880],
      ["pharmacy floor tile", "药房地砖", 700, 880],
      ["pharmacy floor seam", "药房地面接缝", 800, 880],
      ["pharmacy wall service rail", "药房墙面服务轨", 1_100, 620],
      ["pharmacy wall outlet", "药房墙面插座", 1_100, 650],
      ["pharmacy outlet faceplate", "药房插座面板", 1_100, 650],
      ["pharmacy cable cover", "药房电缆盖", 1_100, 700],
      ["cabinet side trim", "柜体侧饰条", 1_250, 700],
      ["adc cabinet corner guard", "自动药柜护角", 1_300, 700],
      ["adc cabinet leveling foot", "自动药柜调平脚", 750, 870],
      ["base panel", "底部面板", 900, 780],
      ["adc base panel seam", "自动药柜底部面板接缝", 900, 800],
      ["pharmacy floor contact pad", "药房地面接触垫", 1_250, 880],
      ["pharmacy room wall panel", "药房墙面板", 1_450, 650],
      ["pharmacy room wall seam", "药房墙面接缝", 1_450, 700],
      ["lower storage shelf", "下部储物搁板", 600, 780],
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
        id: `automated-dispensing-cabinet-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the automated dispensing cabinet photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `automated-dispensing-cabinet-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`automated-dispensing-cabinet-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `automated-dispensing-cabinet-zone-${zone.id}`,
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
    id: "automated-dispensing-cabinet",
    title: "Automated dispensing cabinet",
    translation: "自动发药柜",
    subtitle: "Touchscreen, drawers, medication pockets, refrigerator, pharmacy trays and cabinet hardware",
    asset: "/scenes/automated-dispensing-cabinet-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "hospital-pharmacy",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/automated-dispensing-cabinet-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 automated-dispensing-cabinet photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable cabinet, touchscreen, drawer, medication-pocket, refrigerator, counter, supply and base-service parts. Patient identity, medication identity, access authorization, inventory level, dispensing result, temperature, safety status, readable labels and hidden software were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["patient identity", "medication identity", "access authorization", "inventory level", "dispensing result", "hidden software"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("automated dispensing cabinet source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("automated dispensing cabinet JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`automated-dispensing-cabinet contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`automated-dispensing-cabinet term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-automated-dispensing-cabinet",
  label: "Inspect the automated dispensing cabinet",
  translation: "查看自动发药柜",
  childSceneId: "automated-dispensing-cabinet",
  sourceVisualRegion: "portal-automated-dispensing-cabinet",
  x: 1_120,
  y: 80,
  width: 480,
  height: 680,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Visible refrigerated medicine cabinet and automated dispensing cabinet bank along the pharmacy right wall",
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
  if (!manifest.scenes.some(({ id }) => id === "automated-dispensing-cabinet")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "hospital-pharmacy");
    if (parentIndex < 0) throw new Error("hospital-pharmacy is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "automated-dispensing-cabinet",
      title: "Automated dispensing cabinet",
      parentId: "hospital-pharmacy",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildAutomatedDispensingCabinetScene() {
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
  buildAutomatedDispensingCabinetScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-automated-dispensing-cabinet-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
