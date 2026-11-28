import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal carry-on baggage scanner scene from a reviewed
 * checkpoint photograph. Pass --integrate after review to connect the visible
 * scanner bank in the security-checkpoint parent and update the manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/carry-on-baggage-scanner-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/carry-on-baggage-scanner-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/carry-on-baggage-scanner.json");
const parentPath = resolve(projectRoot, "public/data/scenes/security-checkpoint.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "5a515f2cc411d074f7163d0712f4db5b7c937ed297a68c0ede69f501767974d6";
const PUBLIC_ASSET_SHA256 = "b9bb1a4985763405fab88538574a621cf9c6679653747f1babc3ab4d0511c49f";

const zones = [
  {
    id: "ct-scanner-body",
    title: "Scanner housing and opening",
    translation: "扫描器外壳与开口",
    description: "Follow the white housing down to the black curtain and the suitcase in its opening.",
    x: 300,
    y: 0,
    width: 430,
    height: 780,
    labels: [
      ["scanner tunnel curtain", "扫描通道软帘", 613, 263, 53, 112],
      ["gantry housing", "机架外壳", 583, 86, 100, 18],
      ["scanner gantry", "扫描器机架", 706, 232, 24, 84],
      ["scanner tunnel frame", "扫描通道框架", 500, 282, 8, 40],
      ["scanner top cover", "扫描器顶盖", 544, 45, 90, 14],
      ["scanner front panel", "扫描器前板", 454, 228, 39, 48],
      ["scanner panel seam", "扫描器面板接缝", 451, 319, 30, 2],
      ["carry-on CT scanner", "随身行李 CT 扫描器"],
      ["scanner entry tunnel", "扫描器入口通道"],
      ["scanner exit tunnel", "扫描器出口通道"],
      ["scanner rear panel", "扫描器后板"],
      ["scanner access door", "扫描器检修门"],
      ["scanner access latch", "扫描器检修门锁扣"],
      ["scanner inspection window", "扫描器观察窗"],
      ["scanner support column", "扫描器支柱"],
      ["scanner base plinth", "扫描器基座"],
      ["carry-on scanner foot", "随身行李扫描器脚座"],
      ["scanner belt opening", "扫描器传送带开口"],
      ["scanner tunnel sill", "扫描通道门槛"],
      ["scanner inner liner", "扫描器内衬"],
      ["scanner corner guard", "扫描器护角"],
      ["scanner fastener", "扫描器紧固件"],
      ["scanner floor plate", "扫描器地板板"],
    ],
  },
  {
    id: "infeed-conveyor",
    title: "Infeed conveyor lane",
    translation: "入口传送带通道",
    description: "Trace the flat black belt, the adjacent silver rollers and the black suitcase resting on them.",
    x: 390,
    y: 370,
    width: 550,
    height: 530,
    labels: [
      ["conveyor suitcase", "传送带行李箱", 627, 587, 80, 25],
      ["carry-on belt surface", "随身行李传送带表面", 786, 590, 42, 18],
      ["conveyor suitcase handle", "传送带行李箱把手", 666, 635, 26, 5],
      ["infeed roller", "入口滚筒", 687, 696, 12, 4],
      ["infeed belt", "入口传送带", 619, 484, 32, 14],
      ["infeed side rail", "入口侧导轨", 726, 499, 10, 4],
      ["infeed end plate", "入口端板", 837, 637, 40, 12],
      ["infeed support leg", "入口支撑腿", 907, 735, 6, 32],
      ["infeed caster", "入口脚轮", 906, 855, 8, 11],
      ["infeed conveyor belt seam", "入口传送带接缝", 720, 546, 8, 2],
      ["conveyor suitcase wheel", "传送带行李箱轮", 608, 666, 5, 8],
      ["conveyor support brace", "传送带支撑架", 843, 818, 20, 5],
      ["carry-on infeed conveyor", "随身行李入口传送带", 685, 513, 30, 16],
      ["infeed roller axle", "入口滚筒轴"],
      ["infeed belt guard", "入口传送带护板"],
      ["infeed spill plate", "入口溢出板"],
      ["infeed frame", "入口框架"],
      ["infeed floor plate", "入口地板板"],
      ["belt edge strip", "传送带边条"],
      ["bag entry guide", "行李入口导向板"],
      ["bag exit guide", "行李出口导向板"],
      ["conveyor suitcase shell", "传送带行李箱外壳"],
      ["belt tunnel threshold", "传送带通道门槛"],
      ["conveyor cable cover", "传送带电缆盖"],
      ["conveyor rail fastener", "传送带导轨紧固件"],
    ],
  },
  {
    id: "operator-viewing-station",
    title: "Operator viewing stations",
    translation: "操作员观察台",
    description: "Find the monitor on the left desk and follow its stand down to the keyboard, mouse and open shelf.",
    x: 0,
    y: 280,
    width: 480,
    height: 620,
    labels: [
      ["operator monitor", "操作员显示器", 232, 438, 58, 34],
      ["operator keyboard", "操作员键盘", 270, 535, 45, 8],
      ["viewing desk mouse", "观察台鼠标", 383, 525, 16, 10],
      ["operator monitor bezel", "操作员显示器边框", 336, 448, 3, 26],
      ["operator monitor stand", "操作员显示器支架", 256, 512, 22, 8],
      ["viewing desk worktop", "观察台台面", 167, 557, 22, 12],
      ["operator console foot", "操作台脚座", 165, 858, 9, 6],
      ["desktop reader", "桌面读取器", 365, 448, 8, 20],
      ["desktop reader stand", "桌面读取器支架", 365, 486, 5, 11],
      ["viewing desk shelf", "观察台搁板", 321, 645, 30, 7],
      ["primary viewing station", "主观察台"],
      ["alternate viewing station", "备用观察台"],
      ["operator monitor arm", "操作员显示器支臂"],
      ["blank viewing screen", "空白观察屏"],
      ["operator keyboard tray", "操作员键盘托盘"],
      ["viewing desk", "观察台桌面"],
      ["viewing desk drawer", "观察台抽屉"],
      ["viewing drawer handle", "观察台抽屉把手"],
      ["operator computer tower", "操作员电脑主机"],
      ["computer tower vent", "电脑主机通风口"],
      ["operator power tap", "操作员电源排插"],
      ["operator power cable", "操作员电源线"],
      ["carry-on search table", "随身行李检查台"],
      ["search table shelf", "检查台搁板"],
      ["scanner inspection light", "扫描检查工作灯"],
      ["handheld baggage scanner", "手持行李扫描器"],
      ["baggage scanner cradle", "行李扫描器托架"],
      ["handheld scanner cable", "手持扫描器电缆"],
      ["scanner operator console", "扫描操作员控制台"],
    ],
  },
  {
    id: "xray-conveyor",
    title: "Right-hand scanner and rollers",
    translation: "右侧扫描器与滚筒",
    description: "Follow the smaller scanner from its silver hood to the ribbed rollers beneath the suitcase.",
    x: 735,
    y: 100,
    width: 655,
    height: 700,
    labels: [
      ["baggage roller conveyor", "行李滚筒输送机", 1268, 454, 20, 6],
      ["scanner side panel", "扫描器侧板", 855, 274, 50, 53],
      ["screening monitor", "安检显示器", 855, 385, 39, 43],
      ["scanner bonnet", "扫描器侧罩", 1060, 202, 65, 24],
      ["roller conveyor guard", "滚筒输送机护板", 1163, 465, 16, 10],
      ["roller conveyor leg", "滚筒输送机支腿", 1219, 581, 5, 47],
      ["roller conveyor caster", "滚筒输送机脚轮", 1217, 672, 6, 9],
      ["carry-on x-ray scanner", "随身行李 X 光扫描器"],
      ["x-ray housing", "X 光设备外壳"],
      ["x-ray infeed", "X 光入口"],
      ["x-ray outfeed", "X 光出口"],
      ["x-ray tunnel", "X 光通道"],
      ["x-ray tunnel curtain", "X 光通道软帘"],
      ["x-ray belt", "X 光传送带"],
      ["x-ray roller", "X 光滚筒"],
      ["x-ray side rail", "X 光侧导轨"],
      ["x-ray belt guard", "X 光传送带护板"],
      ["x-ray diverter", "X 光分流器"],
      ["manual diverter arm", "手动分流臂"],
      ["diverter hinge", "分流器铰链"],
      ["diverter stop", "分流止挡"],
      ["x-ray outfeed conveyor", "X 光出口传送带"],
      ["x-ray outfeed belt", "X 光出口皮带"],
      ["x-ray outfeed roller", "X 光出口滚筒"],
      ["x-ray outfeed end plate", "X 光出口端板"],
      ["x-ray outfeed support", "X 光出口支撑"],
      ["x-ray outfeed frame", "X 光出口框架"],
      ["x-ray viewing monitor", "X 光观察显示器"],
      ["x-ray control panel", "X 光控制面板"],
      ["x-ray panel bezel", "X 光面板边框"],
      ["x-ray base", "X 光设备基座"],
      ["x-ray cable cover", "X 光电缆盖"],
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
      ["blue security bin", "蓝色安检置物箱", 937, 486, 42, 14],
      ["carry-on suitcase", "随身行李箱", 548, 401, 42, 18],
      ["gray security bin", "灰色安检置物箱", 646, 852, 52, 16],
      ["bin sidewall", "置物箱侧墙", 898, 510, 15, 8],
      ["screening tray", "安检托盘", 1373, 484, 29, 8],
      ["gray screening tray", "灰色安检托盘", 1027, 528, 28, 8],
      ["blue screening tray", "蓝色安检托盘", 1452, 681, 36, 16],
      ["screening tray rim", "安检托盘边缘", 1503, 513, 6, 2],
      ["screening tray corner", "安检托盘转角", 1014, 540, 5, 4],
      ["screening tray cart wheel", "安检托盘车轮", 1470, 781, 8, 12],
      ["carry-on suitcase shell", "随身行李箱外壳", 1080, 363, 33, 9],
      ["carry-on suitcase wheel", "随身行李箱轮", 1088, 398, 5, 6],
      ["CT security bin", "CT 安检置物箱"],
      ["bin return lane", "置物箱回收通道"],
      ["bin return roller", "置物箱回收滚筒"],
      ["bin return rail", "置物箱回收导轨"],
      ["bin return shelf", "置物箱回收搁板"],
      ["security bin handle", "安检置物箱把手"],
      ["bin base", "置物箱底座"],
      ["screening tray stack", "安检托盘堆"],
      ["screening tray cart", "安检托盘车"],
      ["carry-on bag", "随身行李包"],
      ["carry-on suitcase zipper", "随身行李箱拉链"],
      ["carry-on luggage handle", "随身行李把手"],
      ["carry-on bag inspection tray", "随身行李检查托盘"],
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
      ["screening room floor", "安检室地面", 1273, 820, 52, 31],
      ["service cabinet handle", "服务柜门把手", 1140, 671, 5, 14],
      ["screening room tile", "安检室地砖", 273, 845, 42, 15],
      ["screening glass partition", "安检玻璃隔断", 180, 225, 15, 38],
      ["screening partition post", "安检隔断立柱", 205, 219, 6, 44],
      ["screening queue rail", "安检排队栏杆", 96, 266, 22, 4],
      ["screening queue stanchion", "安检排队隔离柱", 69, 411, 6, 33],
      ["screening stanchion foot", "安检隔离柱脚", 70, 518, 13, 4],
      ["scanner service table", "扫描器服务台", 1123, 555, 34, 11],
      ["service table cabinet", "服务台柜体", 989, 660, 28, 30],
      ["service cabinet door", "服务柜门", 1085, 703, 37, 36],
      ["service door pull", "服务门拉手", 1512, 245, 8, 3],
      ["screening floor safety stripe", "安检地面安全条"],
      ["screening partition base channel", "安检隔断底槽"],
      ["machine guardrail", "设备护栏"],
      ["machine guardrail post", "设备护栏立柱"],
      ["machine guardrail base", "设备护栏底座"],
      ["scanner equipment shelf", "扫描设备搁板"],
      ["equipment shelf bracket", "设备搁板支架"],
      ["equipment cable channel", "设备电缆通道"],
      ["screening power panel", "安检电源面板"],
      ["screening wall panel", "安检墙面板"],
      ["screening wall seam", "安检墙面接缝"],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(value) {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

export function makeCarryOnBaggageScannerScene() {
  const labels = [];
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y, width, height] of zone.labels) {
      const idSuffix = slug(word);
      const entry = { id: `carry-on-baggage-scanner-${idSuffix}`, word, translation };
      if (x === undefined) {
        relatedWords.push(entry);
        continue;
      }
      const region = {
        id: `carry-on-baggage-scanner-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the carry-on scanner photograph`,
        kind: "part",
        x: x - Math.floor(width / 2),
        y: y - Math.floor(height / 2),
        width,
        height,
      };
      const localIndex = labelIds.length;
      labels.push({
        ...entry,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(entry.id);
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
    subtitle: "Follow the bags through the scanner and explore the rollers, trays and operator desk",
    asset: "/scenes/carry-on-baggage-scanner-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "security-checkpoint",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/carry-on-baggage-scanner-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "Locations were checked against the finished photograph, including the black monitor, foreground suitcase, silver roller bed and open desk shelf. Scanner modality, belt direction on the right, internal fittings and the absent desk drawer are available in the index.",
      previousLabelCount: labels.length + relatedWords.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: relatedWords.length + 8,
      removedExamples: ["viewing drawer handle", "scanner access latch", "screening tray stack", "manual diverter arm"],
    },
    labels,
    relatedWords,
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
  for (const label of [...scene.labels, ...scene.relatedWords]) {
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

const parentPortal = {
  id: "enter-carry-on-baggage-scanner",
  label: "Inspect the carry-on baggage scanner",
  translation: "查看随身行李扫描器",
  childSceneId: "carry-on-baggage-scanner",
  sourceVisualRegion: "portal-carry-on-baggage-scanner",
  x: 667,
  y: 263,
  width: 38,
  height: 32,
  portraitMarker: { x: 704, y: 284 },
  enterScale: 3.35,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Dark side panel of the baggage scanner between the two tall screening arches",
  kind: "object",
  x: parentPortal.x,
  y: parentPortal.y,
  width: parentPortal.width,
  height: parentPortal.height,
};

export { parentPortal as scannerEntrance, parentRegion as scannerEntranceRegion };

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
  if (!manifest.scenes.some(({ id }) => id === "carry-on-baggage-scanner")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "security-checkpoint");
    if (parentIndex < 0) throw new Error("security-checkpoint is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "carry-on-baggage-scanner",
      title: "Carry-on baggage scanner",
      parentId: "security-checkpoint",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildCarryOnBaggageScannerScene() {
  const assetChanged = await ensureAsset();
  const scene = makeCarryOnBaggageScannerScene();
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
  buildCarryOnBaggageScannerScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-carry-on-baggage-scanner-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
