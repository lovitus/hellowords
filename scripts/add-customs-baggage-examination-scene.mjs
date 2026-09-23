import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal customs baggage-examination scene from the reviewed
 * image. Coordinates are authored against the 1672x941 source and translated
 * to the final 1600x900 JPEG so the image and anchor audit share one transform.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/customs-baggage-examination-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/customs-baggage-examination-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/customs-baggage-examination.json");
const parentPath = resolve(projectRoot, "public/data/scenes/airport-customs-hall.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "3756ff420c338f76d80300a106b74309d18f76bc203bf8ea464a007e4636f1e2";
const PUBLIC_ASSET_SHA256 = "14415cb0597bdd93dcda2448a9c05b2aaf41e341a466a2f238ecdc0a9e611688";
const SCALE_X = WIDTH / SOURCE_WIDTH;
const SCALE_Y = HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "tool-bench",
    title: "Inspection tool bench",
    translation: "检查工具台",
    description: "Inspect the visible pegboard, adjustable lamp, parts tray, tool cup and drawer bench.",
    x: 0,
    y: 70,
    width: 450,
    height: 520,
    targetScale: 2.65,
    labels: [
      ["Customs inspection workbench", "海关检查工作台", 210, 335],
      ["Perforated tool board", "多孔工具板", 150, 220],
      ["Tool-board peg", "工具板挂钩", 306, 270],
      ["Articulated task lamp", "可调节工作灯", 160, 140],
      ["Task-lamp shade", "工作灯灯罩", 265, 152],
      ["Task-lamp arm", "工作灯灯臂", 190, 130],
      ["Task-lamp pivot", "工作灯转轴", 225, 124],
      ["Lamp base clamp", "灯座夹具", 17, 299],
      ["Gray parts tray", "灰色零件托盘", 112, 310],
      ["Parts-tray lip", "零件托盘边沿", 156, 306],
      ["Underbench storage tub", "工作台下储物箱", 290, 453],
      ["Bench tool cup", "工作台工具杯", 264, 279],
      ["Upright inspection tool", "竖放的检查工具", 277, 267],
      ["Yellow-handled marker", "黄色笔杆记号笔", 306, 279],
      ["Black work mat", "黑色工作垫", 210, 321],
      ["Workbench front rail", "工作台前横梁", 205, 351],
      ["Workbench left edge", "工作台左边缘", 4, 335],
      ["Workbench right support", "工作台右支撑", 420, 418],
      ["Drawer cabinet body", "抽屉柜体", 75, 433],
      ["Upper tool drawer", "上层工具抽屉", 70, 397],
      ["Middle tool drawer", "中层工具抽屉", 70, 441],
      ["Lower tool drawer", "下层工具抽屉", 70, 487],
      ["Upper drawer pull", "上层抽屉拉手", 80, 400],
      ["Middle drawer pull", "中层抽屉拉手", 80, 445],
      ["Lower drawer pull", "下层抽屉拉手", 80, 490],
    ],
  },
  {
    id: "scanner-conveyor",
    title: "Baggage X-ray conveyor",
    translation: "行李 X 光传送带",
    description: "Trace the scanner housing, curtain-lined tunnel, conveyor rollers and adjacent operator display.",
    x: 430,
    y: 35,
    width: 610,
    height: 520,
    targetScale: 2.65,
    labels: [
      ["Baggage examination X-ray unit", "行李检查 X 光设备", 740, 150],
      ["X-ray scanner gantry", "X 光扫描器机架", 740, 180],
      ["Upper scanner housing", "扫描器上部外壳", 740, 88],
      ["Scanner side shell", "扫描器侧面外壳", 570, 190],
      ["Curtain-lined scanner tunnel", "带软帘的扫描通道", 720, 228],
      ["Baggage-unit tunnel curtain", "行李设备通道软帘", 700, 230],
      ["Tunnel-curtain fold", "通道软帘褶皱", 742, 230],
      ["Lower curtain hem", "软帘下摆", 700, 285],
      ["X-ray conveyor roller lane", "X 光传送滚筒通道", 800, 315],
      ["Outfeed conveyor roller", "出口传送滚筒", 910, 323],
      ["Scanner conveyor belt", "扫描器传送带", 820, 302],
      ["Conveyor side guide", "传送带侧导向条", 600, 300],
      ["Outfeed belt guard", "出口传送带护板", 950, 320],
      ["Roller transition plate", "滚筒过渡板", 835, 315],
      ["Scanner frame crosspiece", "扫描器框架横梁", 830, 360],
      ["Conveyor support leg", "传送带支腿", 857, 396],
      ["Scanner-side yellow button", "扫描器侧黄色按钮", 654, 155],
      ["Opposite scanner pushbutton", "扫描器另一侧按钮", 900, 155],
      ["Operator display screen", "操作员显示屏", 466, 226],
      ["Baggage-kiosk display bezel", "行李操作台显示屏边框", 470, 222],
      ["Display kiosk column", "显示器立柱", 470, 354],
      ["Display kiosk floor base", "显示器落地底座", 477, 485],
      ["Lower scanner plinth", "扫描器下底座", 740, 388],
      ["Conveyor leg foot", "传送带支脚", 858, 430],
      ["Scanner housing seam", "扫描器外壳接缝", 580, 330],
    ],
  },
  {
    id: "open-case-table",
    title: "Open baggage and examination table",
    translation: "打开的行李与检查台",
    description: "Explore the open carry-on case and distinct surfaces, supports and storage beneath its examination table.",
    x: 430,
    y: 320,
    width: 970,
    height: 600,
    targetScale: 2.8,
    labels: [
      ["Open carry-on case", "打开的随身行李箱", 730, 480],
      ["Raised suitcase lid", "抬起的行李箱盖", 683, 405],
      ["Lid fabric lining", "箱盖织物内衬", 650, 390],
      ["Lining edge seam", "内衬边缘缝线", 750, 414],
      ["Case zipper track", "箱体拉链轨", 606, 450],
      ["Zipper slider", "拉链滑块", 645, 458],
      ["Open-case sidewall", "打开箱体侧壁", 856, 494],
      ["Molded case shell", "模压箱壳", 740, 526],
      ["Front carry handle", "前侧提手", 790, 520],
      ["Case-corner bumper", "箱角护块", 598, 529],
      ["Left swivel caster", "左侧万向脚轮", 587, 538],
      ["Left caster hub", "左侧脚轮轮毂", 601, 538],
      ["Right swivel caster", "右侧万向脚轮", 690, 548],
      ["Manual examination table", "人工检查台", 850, 620],
      ["Stainless tabletop surface", "不锈钢台面", 1_040, 600],
      ["Rolled tabletop edge", "卷边台面边缘", 880, 711],
      ["Table front apron", "检查台前裙板", 825, 724],
      ["Left square-tube table leg", "左侧方管桌腿", 480, 830],
      ["Right square-tube table leg", "右侧方管桌腿", 1_240, 830],
      ["Examination-table crossbar", "检查台横撑", 480, 790],
      ["Adjustable table glide", "可调桌脚垫", 478, 866],
      ["Workbench lower shelf", "工作台下层搁板", 858, 790],
      ["Under-table gray bin", "台下灰色储物箱", 580, 741],
      ["Black equipment case", "黑色设备箱", 750, 800],
      ["Equipment-case latch", "设备箱搭扣", 700, 780],
    ],
  },
  {
    id: "closed-bag-table",
    title: "Closed baggage and tray table",
    translation: "封闭行李与托盘台",
    description: "Inspect the navy wheeled case, empty gray tray, second steel table and its visible frame.",
    x: 970,
    y: 335,
    width: 702,
    height: 580,
    targetScale: 2.7,
    labels: [
      ["Navy roller carry-on", "海军蓝滚轮随身箱", 1_280, 405],
      ["Carry-on top shell", "随身箱上部外壳", 1_290, 385],
      ["Carry-on side panel", "随身箱侧面板", 1_240, 438],
      ["Case zipper seam", "箱体拉链缝", 1_245, 400],
      ["Zipper slider tab", "拉链滑片", 1_315, 400],
      ["Side carry grip", "侧面提手", 1_250, 446],
      ["Rear wheel housing", "后侧轮罩", 1_170, 428],
      ["Left spinner wheel", "左侧万向轮", 1_163, 445],
      ["Right spinner wheel", "右侧万向轮", 1_198, 453],
      ["Lower corner bumper", "下角护块", 1_385, 444],
      ["Top-mounted case handle", "箱体顶部提手", 1_290, 370],
      ["Empty gray inspection tub", "空灰色检查箱", 1_460, 435],
      ["Inspection-tub basin", "检查箱内盆", 1_435, 429],
      ["Tub front wall", "储物箱前壁", 1_460, 457],
      ["Tub far rim", "储物箱后沿", 1_510, 411],
      ["Secondary examination table", "第二张检查台", 1_320, 475],
      ["Secondary-table worktop", "第二检查台台面", 1_330, 500],
      ["Right worktop edge", "右侧台面边缘", 1_630, 500],
      ["Front table edge", "前侧桌沿", 1_450, 520],
      ["Near tubular table leg", "近侧管状桌腿", 1_550, 600],
      ["Far tubular table leg", "远侧管状桌腿", 1_145, 600],
      ["Table lower stretcher", "桌腿下横档", 1_470, 650],
      ["Table leg end cap", "桌腿端盖", 1_550, 740],
      ["Right-side floor tile", "右侧地砖", 1_320, 800],
      ["Floor-tile grout line", "地砖填缝线", 1_500, 800],
    ],
  },
  {
    id: "staff-workstation",
    title: "Inspection staff workstation",
    translation: "检查工作人员操作台",
    description: "Identify the blank monitor, telephone, keyboard, desk, drawer pedestal and office chair.",
    x: 1_170,
    y: 70,
    width: 480,
    height: 360,
    targetScale: 2.65,
    labels: [
      ["Baggage-inspection workstation", "行李检查工作站", 1_390, 280],
      ["Blank staff monitor", "未显示内容的工作人员显示器", 1_380, 208],
      ["Monitor display panel", "显示器面板", 1_370, 215],
      ["Monitor outer bezel", "显示器外框", 1_420, 210],
      ["Monitor stand neck", "显示器支架颈部", 1_376, 260],
      ["Monitor stand base", "显示器支架底座", 1_380, 267],
      ["Desk keyboard", "桌面键盘", 1_328, 293],
      ["Keyboard key field", "键盘按键区", 1_333, 291],
      ["Workstation telephone", "工作站电话", 1_450, 274],
      ["Telephone handset", "电话听筒", 1_468, 257],
      ["Handset cradle", "听筒座", 1_454, 274],
      ["Telephone base keypad", "电话底座按键", 1_452, 282],
      ["Staff desk worktop", "工作人员桌面", 1_360, 282],
      ["Staff desk front panel", "工作人员桌前挡板", 1_370, 341],
      ["Drawer pedestal", "抽屉柜", 1_410, 320],
      ["Upper pedestal drawer", "抽屉柜上层抽屉", 1_410, 311],
      ["Lower pedestal drawer", "抽屉柜下层抽屉", 1_410, 338],
      ["Upper pedestal-drawer pull", "抽屉柜上层拉手", 1_400, 311],
      ["Lower pedestal-drawer pull", "抽屉柜下层拉手", 1_400, 340],
      ["Adjustable desk chair", "可调节办公椅", 1_260, 274],
      ["Staff-chair backrest", "工作人员椅背", 1_260, 243],
      ["Staff-chair seat", "工作人员椅座", 1_260, 279],
      ["Staff-chair armrest", "工作人员椅扶手", 1_225, 271],
      ["Chair gas-lift column", "椅子气压升降柱", 1_260, 333],
      ["Five-star chair base", "五星椅脚", 1_257, 349],
    ],
  },
  {
    id: "tray-storage-room",
    title: "Tray storage and room fittings",
    translation: "托盘储存与房间设施",
    description: "Explore the tray rack, storage bins, glazed partition, door hardware, ceiling fittings and nearby floor.",
    x: 1_050,
    y: 0,
    width: 622,
    height: 520,
    targetScale: 2.55,
    labels: [
      ["Customs tray-storage rack", "海关托盘储物架", 1_590, 180],
      ["Upper rack shelf", "储物架上层", 1_570, 128],
      ["Middle rack shelf", "储物架中层", 1_570, 278],
      ["Lower rack shelf", "储物架下层", 1_570, 400],
      ["Left rack upright", "储物架左立柱", 1_516, 150],
      ["Right rack upright", "储物架右立柱", 1_640, 130],
      ["Shelf support crossbar", "搁板支撑横梁", 1_570, 145],
      ["Stacked gray inspection trays", "叠放的灰色检查托盘", 1_580, 170],
      ["Tray stack upper rim", "托盘堆上沿", 1_560, 150],
      ["Tray stack side edge", "托盘堆侧边", 1_620, 180],
      ["Top tray interior", "顶层托盘内部", 1_590, 155],
      ["Lower tray stack", "下层托盘堆", 1_570, 300],
      ["Rack base shelf", "储物架底层搁板", 1_570, 420],
      ["Storage-rack foot", "储物架支脚", 1_525, 442],
      ["Glazed room partition", "玻璃隔断", 1_260, 190],
      ["Partition glass pane", "隔断玻璃板", 1_300, 176],
      ["Aluminum vertical stile", "铝制竖框", 1_247, 220],
      ["Partition horizontal rail", "隔断横梁", 1_330, 194],
      ["Door pull handle", "门拉手", 1_105, 224],
      ["Overhead door closer", "顶部闭门器", 1_145, 52],
      ["Door-frame header", "门框上横档", 1_170, 58],
      ["Inspection-room ceiling light panel", "检查室天花照明板", 1_450, 50],
      ["Room recessed light", "房间嵌入式顶灯", 1_520, 15],
      ["Inspection-room wall panel", "检查室墙板", 1_060, 160],
      ["Partition doorway transition strip", "隔断门口地面过渡条", 1_100, 345],
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

function slugify(value) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function makeScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;

  for (const zone of sourceZones) {
    if (zone.labels.length !== 25) throw new Error(`${zone.id} must contain 25 pixel-audited labels`);
    const labelIds = [];
    for (const [word, translation, x, y] of zone.labels) {
      if (x < zone.x || x > zone.x + zone.width || y < zone.y || y > zone.y + zone.height) {
        throw new Error(`${zone.id}/${word} anchor falls outside its focus zone`);
      }
      const idSuffix = slugify(word);
      const regionSize = 48;
      const left = Math.max(0, Math.min(SOURCE_WIDTH - regionSize, x - regionSize / 2));
      const top = Math.max(0, Math.min(SOURCE_HEIGHT - regionSize, y - regionSize / 2));
      const region = {
        id: `customs-baggage-examination-region-${idSuffix}`,
        description: `Pixel-audited “${word}” in the ${zone.title} area of the final examination-room photograph`,
        kind: "part",
        ...sceneRectangle({ x: left, y: top, width: regionSize, height: regionSize }),
      };
      const localIndex = zone.labels.findIndex(([candidate]) => candidate === word);
      const labelId = `customs-baggage-examination-${idSuffix}`;
      labels.push({
        id: labelId,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priorityIndex + 1) % 3),
        sourceVisualRegion: region.id,
        semanticRealmId: "objects-technology",
      });
      visualRegions.push(region);
      labelIds.push(labelId);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `customs-baggage-examination-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }

  if (labels.length !== 150 || detailZones.length !== 6) {
    throw new Error(`expected 150 labels across 6 zones, got ${labels.length}/${detailZones.length}`);
  }

  return {
    id: "customs-baggage-examination",
    title: "Customs baggage examination",
    translation: "海关行李检查",
    subtitle: "Baggage scanner, inspection benches, luggage, trays, staff desk and room fixtures",
    asset: "/scenes/customs-baggage-examination-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "airport-customs-hall",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/customs-baggage-examination-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The final 1600 by 900 JPEG was reviewed at native size. The 150 anchors identify visible scanner, bench, luggage, tray, workstation and room-fixture objects or parts within 6 focus zones. Hidden contents, personal identity, document contents, inspection outcomes, legal status, security threats, brands and inferred actions were excluded.",
      previousLabelCount: 158,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["traveler identity", "document contents", "bag contents", "inspection outcome", "legal status", "security threat", "screen text", "brand"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("examination-room source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("examination-room JPEG is not reproducible");
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
    const word = label.word.toLocaleLowerCase("en-US");
    const sources = wordSources.get(word) ?? [];
    sources.push(label.id);
    wordSources.set(word, sources);
  }
  const duplicates = [...wordSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([word, sources]) => `${word} (${sources.join(", ")})`);
  if (duplicates.length > 0) throw new Error(`scene contains repeated display words: ${duplicates.join("; ")}`);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Set();
  for (const entry of manifest.scenes) {
    if (entry.id === scene.id) continue;
    const otherPath = resolve(projectRoot, "public/data/scenes", `${entry.id}.json`);
    let other;
    try {
      other = JSON.parse(await readFile(otherPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      continue;
    }
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase("en-US"));
  }
  const collisions = [...wordSources.keys()].filter((word) => existingWords.has(word));
  if (collisions.length > 0) throw new Error(`scene duplicates existing display words: ${collisions.join(", ")}`);
}

const parentPortal = {
  id: "enter-customs-baggage-examination",
  label: "Explore baggage examination",
  translation: "探索行李检查区",
  childSceneId: "customs-baggage-examination",
  sourceVisualRegion: "portal-customs-baggage-examination",
  x: 285,
  y: 230,
  width: 350,
  height: 300,
  enterScale: 3.15,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Visible customs X-ray scanner housing, curtain-lined opening and attached conveyor rollers",
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
  if (!manifest.scenes.some(({ id }) => id === "customs-baggage-examination")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "airport-customs-hall");
    if (parentIndex < 0) throw new Error("airport-customs-hall is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "customs-baggage-examination",
      title: "Customs baggage examination",
      parentId: "airport-customs-hall",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildCustomsBaggageExaminationScene() {
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
  buildCustomsBaggageExaminationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-customs-baggage-examination-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
