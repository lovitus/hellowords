import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal baggage-drop scene from a reviewed airport equipment
 * photograph. Parent portal and manifest integration remain with the root
 * agent; this script owns only the child scene, assets and term audit.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/baggage-drop-station-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/baggage-drop-station-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/baggage-drop-station.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "7a3bf4aa6080f44f5b701f0260d49542b4309be90d10ae99ac9406149aba6745";
const PUBLIC_ASSET_SHA256 = "ae99367a4eadff96cac480b88e6dcc41f585b2078615786283116bd8bd117e90";

const zones = [
  {
    id: "left-drop-module",
    title: "Left baggage-drop module",
    translation: "左侧行李托运模块",
    description: "Inspect the visible left drop station, scale, conveyor, scanner arch, printer and plinth.",
    x: 0,
    y: 0,
    width: 500,
    height: 900,
    labels: [
      ["left bag-drop station", "左侧行李托运工位", 350, 450],
      ["left baggage scale", "左侧行李秤", 300, 580],
      ["left scale platform", "左侧秤台", 300, 620],
      ["left scale deck", "左侧秤面板", 300, 650],
      ["left scale edge", "左侧秤台边缘", 300, 690],
      ["left bag conveyor", "左侧行李传送带", 430, 520],
      ["left belt surface", "左侧传送带表面", 430, 600],
      ["left conveyor side rail", "左侧传送带侧导轨", 450, 500],
      ["left spill plate", "左侧溢出板", 420, 740],
      ["left belt end plate", "左侧传送带端板", 460, 800],
      ["left bag chute", "左侧行李滑槽", 470, 760],
      ["left cabinet housing", "左侧柜体外壳", 220, 500],
      ["left cabinet door", "左侧柜门", 220, 600],
      ["left service drawer", "左侧服务抽屉", 220, 680],
      ["left drawer handle", "左侧抽屉把手", 220, 680],
      ["left scanner arch", "左侧扫描拱架", 420, 230],
      ["left arch beam", "左侧拱架横梁", 420, 120],
      ["left arch post", "左侧拱架立柱", 400, 300],
      ["left scanner housing", "左侧扫描器外壳", 350, 340],
      ["left blank screen", "左侧空白屏幕", 250, 180],
      ["left document scanner", "左侧证件扫描器", 320, 360],
      ["left tag printer", "左侧标签打印机", 130, 420],
      ["left tag roll", "左侧标签卷", 135, 450],
      ["left paper tray", "左侧纸张托盘", 160, 500],
      ["left station plinth", "左侧工位基座", 300, 820],
    ],
  },
  {
    id: "center-conveyor-lane",
    title: "Center conveyor lane",
    translation: "中央传送带通道",
    description: "Follow the center belt, roller hardware, scanner arch, luggage and station floor plate.",
    x: 450,
    y: 100,
    width: 700,
    height: 800,
    labels: [
      ["center bag-drop station", "中央行李托运工位", 750, 450],
      ["center baggage scale", "中央行李秤", 750, 560],
      ["center scale platform", "中央秤台", 750, 600],
      ["center scale display", "中央秤显示屏", 750, 520],
      ["center scale deck", "中央秤面板", 750, 630],
      ["center conveyor belt", "中央传送带", 700, 500],
      ["center belt surface", "中央传送带表面", 700, 580],
      ["center conveyor roller", "中央传送带滚筒", 800, 720],
      ["center roller axle", "中央滚筒轴", 820, 730],
      ["center side rail", "中央侧导轨", 600, 520],
      ["center spill plate", "中央溢出板", 700, 760],
      ["center belt end plate", "中央传送带端板", 850, 800],
      ["center bag chute", "中央行李滑槽", 900, 760],
      ["center divider panel", "中央分隔板", 600, 430],
      ["center belt guard", "中央传送带护板", 900, 500],
      ["center scanner arch", "中央扫描拱架", 600, 250],
      ["center arch beam", "中央拱架横梁", 600, 120],
      ["center arch post", "中央拱架立柱", 580, 300],
      ["center scanner housing", "中央扫描器外壳", 620, 330],
      ["center scanner lens", "中央扫描器镜头", 620, 340],
      ["center blank screen", "中央空白屏幕", 700, 250],
      ["center luggage case", "中央行李箱", 780, 400],
      ["center suitcase handle", "中央行李箱把手", 800, 390],
      ["center suitcase wheel", "中央行李箱轮", 800, 510],
      ["center belt seam", "中央传送带接缝", 900, 650],
      ["center station plinth", "中央工位基座", 900, 840],
      ["center floor plate", "中央地板板", 900, 870],
    ],
  },
  {
    id: "right-drop-module",
    title: "Right baggage-drop module",
    translation: "右侧行李托运模块",
    description: "Inspect the right scale platform, cabinet, scanner, tag printer, tray and floor plate.",
    x: 1_100,
    y: 0,
    width: 500,
    height: 900,
    labels: [
      ["right bag-drop station", "右侧行李托运工位", 1_300, 450],
      ["right baggage scale", "右侧行李秤", 1_350, 580],
      ["right scale platform", "右侧秤台", 1_350, 620],
      ["right scale display", "右侧秤显示屏", 1_280, 380],
      ["right scale deck", "右侧秤面板", 1_350, 650],
      ["right scale side rail", "右侧秤台侧导轨", 1_250, 600],
      ["right platform edge", "右侧平台边缘", 1_450, 680],
      ["right bag tray", "右侧行李托盘", 1_450, 730],
      ["right cabinet housing", "右侧柜体外壳", 1_270, 500],
      ["right cabinet door", "右侧柜门", 1_270, 580],
      ["right service drawer", "右侧服务抽屉", 1_300, 680],
      ["right drawer pull", "右侧抽屉拉手", 1_300, 680],
      ["right scanner arch", "右侧扫描拱架", 1_250, 220],
      ["right arch beam", "右侧拱架横梁", 1_250, 110],
      ["right arch post", "右侧拱架立柱", 1_200, 300],
      ["right scanner housing", "右侧扫描器外壳", 1_300, 330],
      ["right scanner lens", "右侧扫描器镜头", 1_300, 340],
      ["right blank screen", "右侧空白屏幕", 1_400, 170],
      ["right document scanner", "右侧证件扫描器", 1_320, 390],
      ["right tag printer", "右侧标签打印机", 1_450, 390],
      ["right tag roll", "右侧标签卷", 1_450, 420],
      ["right receipt tray", "右侧收据托盘", 1_420, 450],
      ["right label slot", "右侧标签插槽", 1_450, 470],
      ["right station plinth", "右侧工位基座", 1_300, 820],
      ["right floor plate", "右侧地板板", 1_400, 850],
      ["right cable cover", "右侧电缆盖", 1_250, 730],
    ],
  },
  {
    id: "scanner-tag-equipment",
    title: "Scanning and tag equipment",
    translation: "扫描与标签设备",
    description: "Compare the visible handheld and mounted scanners, printers, tag feeds, trays and blank controls.",
    x: 0,
    y: 100,
    width: 1_600,
    height: 500,
    labels: [
      ["bag-drop tag scanner", "托运行李标签扫描器", 330, 360],
      ["handheld tag scanner", "手持标签扫描器", 340, 380],
      ["overhead tag scanner", "顶部标签扫描器", 620, 320],
      ["bag-drop scanner cradle", "托运扫描器托架", 350, 410],
      ["bag-drop scanner trigger", "托运扫描器扳机", 340, 400],
      ["scanner cable", "扫描器电缆", 360, 430],
      ["drop document scan bed", "托运证件扫描台", 320, 450],
      ["drop document scan lid", "托运证件扫描盖", 320, 430],
      ["bag-tag printer housing", "行李标签打印机外壳", 140, 400],
      ["bag-tag printer slot", "行李标签打印机插槽", 140, 440],
      ["claim-tag printer", "行李提取标签打印机", 1_450, 400],
      ["claim-tag slot", "行李提取标签插槽", 1_450, 450],
      ["bag-tag roll", "行李标签卷", 170, 450],
      ["blank claim tag", "空白提取标签", 1_420, 470],
      ["tag feed roller", "标签进纸滚轮", 160, 480],
      ["paper guide", "纸张导向器", 200, 500],
      ["tag output tray", "标签出纸托盘", 150, 520],
      ["bag-drop printer cover", "托运打印机盖", 220, 390],
      ["printer latch", "打印机锁扣", 220, 430],
      ["drop control tablet", "托运控制平板", 1_330, 360],
      ["drop blank control screen", "托运空白控制屏", 1_330, 330],
      ["drop screen bezel", "托运屏幕边框", 1_330, 320],
      ["equipment shelf", "设备搁板", 1_200, 430],
      ["equipment cable pass-through", "设备电缆穿线孔", 1_250, 470],
      ["drop scan window", "托运扫描窗口", 1_300, 400],
    ],
  },
  {
    id: "baggage-containers",
    title: "Baggage and tray details",
    translation: "行李与托盘细节",
    description: "Inspect the visible plain suitcases, shells, handles, wheels, trays and belt guides.",
    x: 450,
    y: 300,
    width: 700,
    height: 350,
    labels: [
      ["drop conveyor suitcase", "托运传送带行李箱", 780, 400],
      ["drop suitcase shell", "托运行李箱外壳", 780, 440],
      ["drop suitcase handle", "托运行李箱把手", 800, 390],
      ["drop suitcase wheel", "托运行李箱轮", 800, 510],
      ["suitcase corner guard", "行李箱护角", 750, 460],
      ["suitcase zipper", "行李箱拉链", 760, 450],
      ["suitcase side grip", "行李箱侧提手", 730, 430],
      ["second conveyor suitcase", "第二只传送带行李箱", 980, 460],
      ["second suitcase shell", "第二只行李箱外壳", 980, 500],
      ["second suitcase handle", "第二只行李箱把手", 1_000, 450],
      ["second suitcase wheel", "第二只行李箱轮", 1_000, 560],
      ["baggage tray", "行李托盘", 900, 600],
      ["bag-drop tray", "行李托运托盘", 600, 600],
      ["tray sidewall", "托盘侧墙", 620, 580],
      ["tray stop", "托盘止挡", 650, 600],
      ["belt luggage guide", "传送带行李导向板", 850, 550],
      ["luggage side bumper", "行李侧缓冲条", 900, 540],
    ],
  },
  {
    id: "cabinet-service-panels",
    title: "Cabinet and service panels",
    translation: "柜体与服务面板",
    description: "Trace the visible station cabinets, access panels, vents, plinths, seams and fasteners.",
    x: 0,
    y: 450,
    width: 1_600,
    height: 450,
    labels: [
      ["bag-drop station cabinet", "托运工位柜体", 500, 560],
      ["bag-drop cabinet side panel", "托运柜体侧板", 520, 620],
      ["cabinet top panel", "柜体顶板", 550, 500],
      ["cabinet front panel", "柜体前板", 550, 650],
      ["service access door", "服务检修门", 600, 700],
      ["access door handle", "检修门把手", 620, 700],
      ["service drawer", "服务抽屉", 700, 700],
      ["bag-drop drawer front", "托运抽屉前板", 700, 720],
      ["bag-drop drawer pull", "托运抽屉拉手", 700, 700],
      ["drop cable cover", "托运电缆盖", 750, 750],
      ["power inlet", "电源接口", 800, 760],
      ["equipment vent", "设备通风口", 900, 730],
      ["bag-drop ventilation grille", "托运通风格栅", 1_000, 760],
      ["base kickplate", "底座踢脚板", 900, 820],
      ["plinth corner", "基座转角", 1_050, 840],
      ["floor junction", "地面交界", 1_100, 850],
      ["steel trim", "钢制饰条", 1_200, 700],
      ["panel seam", "面板接缝", 1_250, 750],
      ["mounting fastener", "安装紧固件", 1_300, 780],
      ["lower service panel", "下部服务面板", 1_350, 720],
    ],
  },
  {
    id: "floor-safety-rails",
    title: "Floor and queue rails",
    translation: "地面与排队隔离设施",
    description: "Follow the visible floor finish, queue posts, belts, access lanes and platform rails.",
    x: 0,
    y: 450,
    width: 1_600,
    height: 450,
    labels: [
      ["bag-drop floor", "行李托运区地面", 1_100, 820],
      ["bag-drop floor tile", "行李托运区地砖", 1_200, 850],
      ["bag-drop grout line", "行李托运区地砖缝", 1_250, 870],
      ["bag-drop queue rail", "行李托运排队栏杆", 1_450, 500],
      ["bag-drop stanchion post", "行李托运隔离柱", 1_400, 550],
      ["bag-drop stanchion foot", "行李托运隔离柱脚", 1_400, 620],
      ["bag-drop queue belt", "行李托运隔离带", 1_450, 530],
      ["bag-drop belt receiver", "行李托运隔离带接收扣", 1_500, 530],
      ["bag-drop lane divider", "行李托运通道分隔栏", 1_300, 600],
      ["bag-drop access lane", "行李托运通道", 1_200, 700],
      ["bag-drop floor guide stripe", "行李托运地面导向条", 1_250, 750],
      ["platform safety edge", "平台安全边缘", 1_350, 700],
      ["platform guardrail", "平台护栏", 1_500, 650],
      ["guardrail post", "护栏立柱", 1_520, 700],
      ["guardrail base", "护栏底座", 1_520, 760],
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
        id: `baggage-drop-station-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the baggage-drop photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `baggage-drop-station-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`baggage-drop-station-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `baggage-drop-station-zone-${zone.id}`,
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
    id: "baggage-drop-station",
    title: "Baggage-drop station",
    translation: "行李托运工位",
    subtitle: "Scales, conveyors, scanners, tag printers, luggage trays and queue fixtures",
    asset: "/scenes/baggage-drop-station-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "check-in-counter",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/baggage-drop-station-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 baggage-drop photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable drop modules, scales, conveyors, scanner and tag equipment, luggage, cabinet panels and floor-rail parts. Passenger identity, scan results, baggage routing, security outcomes, flight status, readable labels and hidden controls were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["passenger identity", "scan result", "baggage routing", "security outcome", "flight status", "hidden control"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("baggage-drop source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("baggage-drop JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`baggage-drop-station contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`baggage-drop-station term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

export async function buildBaggageDropStationScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  return {
    assetChanged,
    sceneChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildBaggageDropStationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-baggage-drop-station-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
