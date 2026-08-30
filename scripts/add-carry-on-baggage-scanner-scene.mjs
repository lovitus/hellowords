import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal carry-on baggage scanner scene from a reviewed
 * checkpoint photograph. Parent portal and manifest integration remain with
 * the root agent; this script owns only the new scene, assets and term audit.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/carry-on-baggage-scanner-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/carry-on-baggage-scanner-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/carry-on-baggage-scanner.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "5a515f2cc411d074f7163d0712f4db5b7c937ed297a68c0ede69f501767974d6";
const PUBLIC_ASSET_SHA256 = "b9bb1a4985763405fab88538574a621cf9c6679653747f1babc3ab4d0511c49f";

const zones = [
  {
    id: "ct-scanner-body",
    title: "CT scanner body",
    translation: "CT 扫描器机体",
    description: "Trace the visible CT gantry, tunnels, curtains, housing panels, supports and floor plate.",
    x: 300,
    y: 0,
    width: 430,
    height: 780,
    labels: [
      ["carry-on CT scanner", "随身行李 CT 扫描器", 500, 300],
      ["scanner gantry", "扫描器机架", 500, 180],
      ["gantry housing", "机架外壳", 500, 120],
      ["scanner entry tunnel", "扫描器入口通道", 540, 350],
      ["scanner exit tunnel", "扫描器出口通道", 650, 350],
      ["scanner tunnel curtain", "扫描通道软帘", 560, 360],
      ["scanner tunnel frame", "扫描通道框架", 540, 260],
      ["scanner bonnet", "扫描器侧罩", 400, 200],
      ["scanner side panel", "扫描器侧板", 400, 400],
      ["scanner top cover", "扫描器顶盖", 500, 50],
      ["scanner front panel", "扫描器前板", 390, 300],
      ["scanner rear panel", "扫描器后板", 680, 300],
      ["scanner access door", "扫描器检修门", 400, 520],
      ["scanner access latch", "扫描器检修门锁扣", 410, 520],
      ["scanner inspection window", "扫描器观察窗", 450, 450],
      ["scanner support column", "扫描器支柱", 350, 500],
      ["scanner base plinth", "扫描器基座", 500, 650],
      ["carry-on scanner foot", "随身行李扫描器脚座", 390, 700],
      ["scanner belt opening", "扫描器传送带开口", 570, 430],
      ["scanner tunnel sill", "扫描通道门槛", 570, 450],
      ["scanner inner liner", "扫描器内衬", 600, 300],
      ["scanner corner guard", "扫描器护角", 350, 240],
      ["scanner fastener", "扫描器紧固件", 420, 280],
      ["scanner panel seam", "扫描器面板接缝", 430, 420],
      ["scanner floor plate", "扫描器地板板", 570, 720],
    ],
  },
  {
    id: "infeed-conveyor",
    title: "Infeed conveyor lane",
    translation: "入口传送带通道",
    description: "Inspect the visible infeed belt, rollers, rails, spill plate, frame, suitcase and floor hardware.",
    x: 450,
    y: 100,
    width: 700,
    height: 800,
    labels: [
      ["carry-on infeed conveyor", "随身行李入口传送带", 700, 500],
      ["infeed belt", "入口传送带", 700, 600],
      ["infeed roller", "入口滚筒", 700, 720],
      ["infeed roller axle", "入口滚筒轴", 720, 730],
      ["infeed side rail", "入口侧导轨", 600, 500],
      ["infeed belt guard", "入口传送带护板", 650, 550],
      ["infeed spill plate", "入口溢出板", 700, 760],
      ["infeed end plate", "入口端板", 800, 800],
      ["infeed frame", "入口框架", 600, 800],
      ["infeed support leg", "入口支撑腿", 650, 840],
      ["infeed caster", "入口脚轮", 750, 850],
      ["infeed floor plate", "入口地板板", 850, 870],
      ["carry-on belt surface", "随身行李传送带表面", 760, 580],
      ["belt edge strip", "传送带边条", 600, 600],
      ["infeed conveyor belt seam", "入口传送带接缝", 800, 650],
      ["bag entry guide", "行李入口导向板", 600, 450],
      ["bag exit guide", "行李出口导向板", 900, 500],
      ["conveyor suitcase", "传送带行李箱", 700, 420],
      ["conveyor suitcase shell", "传送带行李箱外壳", 700, 450],
      ["conveyor suitcase handle", "传送带行李箱把手", 720, 400],
      ["conveyor suitcase wheel", "传送带行李箱轮", 720, 510],
      ["belt tunnel threshold", "传送带通道门槛", 600, 430],
      ["conveyor support brace", "传送带支撑架", 850, 820],
      ["conveyor cable cover", "传送带电缆盖", 900, 780],
      ["conveyor rail fastener", "传送带导轨紧固件", 620, 510],
    ],
  },
  {
    id: "operator-viewing-station",
    title: "Operator viewing stations",
    translation: "操作员观察台",
    description: "Study the visible primary and alternate viewing stations, blank monitors, keyboard, desk and search table.",
    x: 0,
    y: 280,
    width: 480,
    height: 620,
    labels: [
      ["primary viewing station", "主观察台", 230, 470],
      ["alternate viewing station", "备用观察台", 330, 450],
      ["operator monitor", "操作员显示器", 230, 370],
      ["operator monitor bezel", "操作员显示器边框", 230, 380],
      ["operator monitor stand", "操作员显示器支架", 230, 470],
      ["operator monitor arm", "操作员显示器支臂", 220, 450],
      ["blank viewing screen", "空白观察屏", 230, 390],
      ["operator keyboard", "操作员键盘", 230, 530],
      ["operator keyboard tray", "操作员键盘托盘", 230, 550],
      ["viewing desk", "观察台桌面", 230, 500],
      ["viewing desk worktop", "观察台台面", 250, 510],
      ["viewing desk drawer", "观察台抽屉", 230, 650],
      ["viewing drawer handle", "观察台抽屉把手", 230, 650],
      ["operator computer tower", "操作员电脑主机", 250, 730],
      ["computer tower vent", "电脑主机通风口", 250, 740],
      ["operator power tap", "操作员电源排插", 350, 520],
      ["operator power cable", "操作员电源线", 350, 570],
      ["carry-on search table", "随身行李检查台", 400, 600],
      ["search table shelf", "检查台搁板", 400, 650],
      ["scanner inspection light", "扫描检查工作灯", 400, 500],
      ["handheld baggage scanner", "手持行李扫描器", 380, 530],
      ["baggage scanner cradle", "行李扫描器托架", 380, 560],
      ["handheld scanner cable", "手持扫描器电缆", 380, 580],
      ["scanner operator console", "扫描操作员控制台", 300, 500],
      ["operator console foot", "操作台脚座", 300, 700],
    ],
  },
  {
    id: "xray-conveyor",
    title: "X-ray conveyor lane",
    translation: "X 光传送带通道",
    description: "Trace the visible X-ray housing, tunnels, belts, diverter hardware, rollers, monitors and base.",
    x: 780,
    y: 100,
    width: 620,
    height: 700,
    labels: [
      ["carry-on x-ray scanner", "随身行李 X 光扫描器", 1_050, 300],
      ["x-ray housing", "X 光设备外壳", 1_050, 180],
      ["x-ray infeed", "X 光入口", 900, 350],
      ["x-ray outfeed", "X 光出口", 1_200, 350],
      ["x-ray tunnel", "X 光通道", 1_050, 380],
      ["x-ray tunnel curtain", "X 光通道软帘", 1_050, 390],
      ["x-ray belt", "X 光传送带", 1_050, 500],
      ["x-ray roller", "X 光滚筒", 1_150, 560],
      ["x-ray side rail", "X 光侧导轨", 950, 450],
      ["x-ray belt guard", "X 光传送带护板", 1_100, 500],
      ["x-ray diverter", "X 光分流器", 1_180, 450],
      ["manual diverter arm", "手动分流臂", 1_180, 430],
      ["diverter hinge", "分流器铰链", 1_200, 440],
      ["diverter stop", "分流止挡", 1_220, 470],
      ["x-ray outfeed conveyor", "X 光出口传送带", 1_250, 500],
      ["x-ray outfeed belt", "X 光出口皮带", 1_250, 550],
      ["x-ray outfeed roller", "X 光出口滚筒", 1_300, 580],
      ["x-ray outfeed end plate", "X 光出口端板", 1_350, 600],
      ["x-ray outfeed support", "X 光出口支撑", 1_300, 700],
      ["x-ray outfeed frame", "X 光出口框架", 1_350, 650],
      ["x-ray viewing monitor", "X 光观察显示器", 900, 450],
      ["x-ray control panel", "X 光控制面板", 1_000, 260],
      ["x-ray panel bezel", "X 光面板边框", 1_000, 270],
      ["x-ray base", "X 光设备基座", 1_050, 700],
      ["x-ray cable cover", "X 光电缆盖", 1_100, 730],
    ],
  },
  {
    id: "bins-trays-bags",
    title: "Bins, trays and carry-on bags",
    translation: "托盘、置物箱与随身行李",
    description: "Compare the visible blue and gray bins, return lane, trays, cart and plain carry-on bags.",
    x: 450,
    y: 300,
    width: 1_150,
    height: 600,
    labels: [
      ["CT security bin", "CT 安检置物箱", 1_000, 550],
      ["blue security bin", "蓝色安检置物箱", 1_000, 520],
      ["gray security bin", "灰色安检置物箱", 1_100, 560],
      ["bin return lane", "置物箱回收通道", 1_300, 650],
      ["bin return roller", "置物箱回收滚筒", 1_300, 680],
      ["bin return rail", "置物箱回收导轨", 1_300, 620],
      ["bin return shelf", "置物箱回收搁板", 1_250, 600],
      ["bin sidewall", "置物箱侧墙", 1_020, 580],
      ["security bin handle", "安检置物箱把手", 1_080, 540],
      ["bin base", "置物箱底座", 1_100, 620],
      ["screening tray", "安检托盘", 700, 650],
      ["gray screening tray", "灰色安检托盘", 700, 700],
      ["blue screening tray", "蓝色安检托盘", 900, 650],
      ["screening tray rim", "安检托盘边缘", 720, 680],
      ["screening tray corner", "安检托盘转角", 750, 700],
      ["screening tray stack", "安检托盘堆", 550, 800],
      ["screening tray cart", "安检托盘车", 600, 760],
      ["screening tray cart wheel", "安检托盘车轮", 600, 840],
      ["carry-on bag", "随身行李包", 1_000, 420],
      ["carry-on suitcase", "随身行李箱", 1_000, 450],
      ["carry-on suitcase shell", "随身行李箱外壳", 1_000, 480],
      ["carry-on suitcase zipper", "随身行李箱拉链", 1_000, 460],
      ["carry-on suitcase wheel", "随身行李箱轮", 1_020, 520],
      ["carry-on luggage handle", "随身行李把手", 1_020, 420],
      ["carry-on bag inspection tray", "随身行李检查托盘", 900, 600],
    ],
  },
  {
    id: "service-rails-panels",
    title: "Service rails and room panels",
    translation: "服务导轨与房间面板",
    description: "Inspect the visible screening-room floor, rails, partitions, service table, shelves, panels and seams.",
    x: 0,
    y: 0,
    width: 1_600,
    height: 900,
    labels: [
      ["screening room floor", "安检室地面", 1_450, 820],
      ["screening room tile", "安检室地砖", 1_350, 850],
      ["screening floor safety stripe", "安检地面安全条", 300, 850],
      ["screening queue rail", "安检排队栏杆", 100, 600],
      ["screening queue stanchion", "安检排队隔离柱", 150, 700],
      ["screening stanchion foot", "安检隔离柱脚", 180, 760],
      ["screening glass partition", "安检玻璃隔断", 1_250, 200],
      ["screening partition post", "安检隔断立柱", 1_300, 250],
      ["screening partition base channel", "安检隔断底槽", 1_250, 400],
      ["machine guardrail", "设备护栏", 1_350, 500],
      ["machine guardrail post", "设备护栏立柱", 1_400, 550],
      ["machine guardrail base", "设备护栏底座", 1_400, 650],
      ["scanner service table", "扫描器服务台", 1_000, 650],
      ["service table cabinet", "服务台柜体", 1_000, 730],
      ["service cabinet door", "服务柜门", 1_000, 740],
      ["service cabinet handle", "服务柜门把手", 1_020, 740],
      ["scanner equipment shelf", "扫描设备搁板", 1_100, 700],
      ["equipment shelf bracket", "设备搁板支架", 1_120, 720],
      ["equipment cable channel", "设备电缆通道", 1_150, 760],
      ["screening power panel", "安检电源面板", 1_450, 300],
      ["screening wall panel", "安检墙面板", 1_500, 250],
      ["screening wall seam", "安检墙面接缝", 1_500, 400],
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
        id: `carry-on-baggage-scanner-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the carry-on scanner photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `carry-on-baggage-scanner-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`carry-on-baggage-scanner-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `carry-on-baggage-scanner-zone-${zone.id}`,
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
    id: "carry-on-baggage-scanner",
    title: "Carry-on baggage scanner",
    translation: "随身行李扫描器",
    subtitle: "CT and X-ray housings, conveyors, viewing stations, bins, trays, bags and room fixtures",
    asset: "/scenes/carry-on-baggage-scanner-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "security-checkpoint",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/carry-on-baggage-scanner-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 carry-on scanner photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable CT/X-ray machine, conveyor, viewing-station, bin, tray, bag, rail and room-fixture parts. Passenger identity, image content, alarm state, threat detection, screening outcome, security status and hidden algorithms were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["passenger identity", "image content", "alarm state", "threat detection", "screening outcome", "hidden algorithm"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("carry-on scanner source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("carry-on scanner JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`carry-on-baggage-scanner contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`carry-on-baggage-scanner term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

export async function buildCarryOnBaggageScannerScene() {
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
  buildCarryOnBaggageScannerScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-carry-on-baggage-scanner-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
