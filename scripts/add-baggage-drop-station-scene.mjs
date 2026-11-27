import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Author the baggage-drop scene against the final 1600 × 900 photograph.
 * The station has an onward entrance to the airport baggage conveyor.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/baggage-drop-station-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/baggage-drop-station-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/baggage-drop-station.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/check-in-counter.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "7a3bf4aa6080f44f5b701f0260d49542b4309be90d10ae99ac9406149aba6745";
const PUBLIC_ASSET_SHA256 = "ae99367a4eadff96cac480b88e6dcc41f585b2078615786283116bd8bd117e90";

// Label rows contain the English and Chinese terms, LOD, point, tight photo crop and visual cue.
const zones = [
  {
    id: "left-drop-module",
    title: "Left baggage-drop module",
    translation: "左侧托运工位",
    description: "Start at the left weighing platform, then follow the belt behind it past the display and paper roll.",
    x: 25,
    y: 50,
    width: 745,
    height: 807,
    labels: [
      ["left baggage scale", "左侧行李秤", 0, 363, 731, [292, 701, 160, 47], "Dark rectangular load-bearing face of the low scale in front of the left cabinet"],
      ["left bag-drop station", "左侧行李托运工位", 1, 183, 491, [159, 369, 302, 305], "Front frame of the left terminal below its tablet and scanner shelf"],
      ["left blank screen", "左侧空白屏幕", 1, 254, 171, [197, 109, 169, 127], "Blue blank display above the left counter"],
      ["left bag conveyor", "左侧行李传送带", 1, 593, 530, [514, 496, 165, 82], "Exposed black belt extending from underneath the ribbed suitcase"],
      ["left scale platform", "左侧秤台", 2, 422, 712, [299, 696, 146, 52], "Rear portion of the left scale platform inside the bright rim"],
      ["left scale edge", "左侧秤台边缘", 4, 443, 752, [431, 748, 20, 9], "Thin lower edge of the dark left weighing platform"],
      ["left belt surface", "左侧传送带表面", 3, 633, 565, [558, 538, 123, 47], "Textured black belt surface ahead of the suitcase"],
      ["left conveyor side rail", "左侧传送带侧导轨", 3, 755, 522, [746, 510, 21, 26], "Raised guide along the right side of the left black conveyor"],
      ["left belt end plate", "左侧传送带端板", 4, 699, 748, [647, 727, 90, 29], "Silver front end plate below the black transfer surface"],
      ["left cabinet housing", "左侧柜体外壳", 2, 104, 544, [81, 489, 75, 116], "Left terminal cabinet shell beneath the printer"],
      ["left cabinet door", "左侧柜门", 3, 251, 568, [220, 525, 73, 75], "Left hinged cabinet leaf directly behind the platform rail"],
      ["left scanner arch", "左侧扫描拱架", 2, 426, 154, [405, 64, 287, 342], "Tall pale arch over the ribbed suitcase conveyor"],
      ["left arch beam", "左侧拱架横梁", 3, 513, 76, [450, 70, 80, 12], "Upper horizontal beam of the left scanning arch"],
      ["left arch post", "左侧拱架立柱", 4, 674, 203, [661, 171, 23, 57], "Right upright of the left arch alongside the conveyor opening"],
      ["left scanner housing", "左侧扫描器外壳", 4, 556, 95, [534, 87, 47, 18], "Dark optical housing under the top beam of the left arch"],
      ["left tag printer", "左侧标签打印机", 2, 383, 323, [368, 302, 65, 55], "Left counter printer with an exposed white label feed"],
      ["left tag roll", "左侧标签卷", 3, 410, 329, [397, 309, 24, 34], "White strip curved over the label roll at the right end of the left counter"],
      ["left station plinth", "左侧工位基座", 4, 292, 833, [275, 810, 49, 27], "Silver plinth under the left weighing platform"],
    ],
  },
  {
    id: "center-conveyor-lane",
    title: "Center conveyor lane",
    translation: "中央传送带通道",
    description: "Compare the dark belt under the smooth suitcase with the bank of exposed silver rollers in front of it.",
    x: 746,
    y: 230,
    width: 549,
    height: 452,
    labels: [
      ["center conveyor roller", "中央传送带滚筒", 0, 1154, 582, [1141, 579, 26, 7], "Silver cylinder just behind the front roller of the center conveyor"],
      ["center conveyor belt", "中央传送带", 1, 1006, 482, [986, 472, 39, 17], "Black belt immediately beneath the smooth suitcase behind the silver rollers"],
      ["center divider panel", "中央分隔板", 1, 821, 559, [777, 490, 94, 99], "Central upright divider between the two luggage lanes"],
      ["center side rail", "中央侧导轨", 2, 903, 474, [895, 468, 16, 13], "Left guide rail with a yellow edge beside the dark center belt"],
      ["center belt end plate", "中央传送带端板", 3, 1132, 630, [1093, 614, 82, 22], "Vertical silver end plate below the leading rollers"],
      ["center belt guard", "中央传送带护板", 4, 1208, 510, [1194, 486, 24, 25], "Tall dark guard rising along the right side of the roller lane"],
    ],
  },
  {
    id: "right-drop-module",
    title: "Right baggage-drop module",
    translation: "右侧托运工位",
    description: "Find the low right-hand scale in front of its cabinet and compare its screen, printer and scanning arch.",
    x: 1086,
    y: 67,
    width: 480,
    height: 590,
    labels: [
      ["right baggage scale", "右侧行李秤", 0, 1426, 558, [1380, 537, 105, 30], "Dark load-bearing face of the scale at the front right"],
      ["right bag-drop station", "右侧行李托运工位", 1, 1317, 384, [1260, 294, 232, 208], "Front structure of the right terminal directly below its equipment shelf"],
      ["right blank screen", "右侧空白屏幕", 1, 1342, 158, [1306, 124, 70, 80], "Blue blank display beside the right-hand arch"],
      ["right scale platform", "右侧秤台", 2, 1484, 548, [1471, 539, 37, 16], "Top of the right scale platform near its outside corner"],
      ["right scale side rail", "右侧秤台侧导轨", 3, 1358, 486, [1347, 481, 24, 11], "Polished bar running along the back of the right weighing platform"],
      ["right platform edge", "右侧平台边缘", 4, 1430, 581, [1421, 577, 20, 8], "Thin rim under the dark right platform surface"],
      ["right cabinet housing", "右侧柜体外壳", 2, 1470, 444, [1426, 397, 50, 79], "Outside cabinet housing behind the right scale"],
      ["right cabinet door", "右侧柜门", 3, 1361, 429, [1332, 402, 57, 54], "Front door below the open paper-feed compartment"],
      ["right scanner arch", "右侧扫描拱架", 2, 1110, 158, [1095, 78, 190, 195], "White arch over the luggage lane beside the right display"],
      ["right arch beam", "右侧拱架横梁", 3, 1162, 88, [1144, 83, 38, 10], "Top horizontal beam of the right scanning arch"],
      ["right arch post", "右侧拱架立柱", 4, 1277, 162, [1264, 130, 22, 63], "Vertical post just left of the right display"],
      ["right scanner housing", "右侧扫描器外壳", 3, 1214, 246, [1201, 237, 30, 17], "Black scanner housing atop the tall counter stand"],
      ["right scanner lens", "右侧扫描器镜头", 4, 1203, 109, [1190, 103, 24, 9], "Dark optical lens visible under the right arch beam"],
      ["right tag printer", "右侧标签打印机", 2, 1346, 328, [1327, 315, 47, 54], "Printer tucked under the right-hand counter shelf"],
      ["right tag roll", "右侧标签卷", 3, 1362, 352, [1350, 337, 22, 27], "White label stock curving out of the open right-hand printer"],
      ["right station plinth", "右侧工位基座", 4, 1440, 616, [1429, 608, 40, 15], "Raised silver base beneath the right scale surface"],
    ],
  },
  {
    id: "scanner-tag-equipment",
    title: "Scanning and tag equipment",
    translation: "扫描与标签设备",
    description: "Find a handheld scanner and its stand, the visible paper outlet and both small counter displays.",
    x: 67,
    y: 77,
    width: 1445,
    height: 327,
    labels: [
      ["handheld tag scanner", "手持标签扫描器", 0, 315, 278, [300, 262, 35, 31], "Black handheld reader in its stand next to the left tablet"],
      ["drop control tablet", "托运控制平板", 1, 235, 308, [182, 264, 86, 84], "Small tilted tablet in front of the large left-hand display"],
      ["bag-drop scanner cradle", "托运扫描器托架", 2, 313, 345, [290, 338, 44, 12], "Flat black cradle supporting the handheld reader on the left counter"],
      ["scanner cable", "扫描器电缆", 4, 291, 324, [288, 316, 9, 16], "Thin curved black cable beside the handle of the left scanner"],
      ["bag-tag printer slot", "行李标签打印机插槽", 4, 408, 300, [394, 297, 30, 7], "Opening above the white paper feed on the left counter"],
      ["bag-drop printer cover", "托运打印机盖", 3, 122, 308, [89, 292, 67, 25], "Sloping silver cover of the small black desktop printer at far left"],
      ["drop blank control screen", "托运空白控制屏", 2, 1303, 270, [1294, 256, 26, 21], "Blue screen in the small angled control tablet on the right"],
      ["drop screen bezel", "托运屏幕边框", 3, 192, 170, [189, 153, 6, 32], "Narrow black border on the large left display"],
      ["equipment shelf", "设备搁板", 2, 1470, 348, [1448, 341, 48, 14], "Projecting equipment shelf at the far right of the station"],
      ["drop scan window", "托运扫描窗口", 4, 324, 296, [314, 291, 18, 10], "Small colored scan window at the nose of the handheld left scanner"],
    ],
  },
  {
    id: "baggage-containers",
    title: "Suitcases and visible parts",
    translation: "行李箱与可见部件",
    description: "Distinguish the ribbed case from the smooth case and locate their exposed carrying handles.",
    x: 446,
    y: 326,
    width: 624,
    height: 177,
    labels: [
      ["drop conveyor suitcase", "托运传送带行李箱", 0, 551, 394, [493, 371, 81, 44], "Ribbed suitcase riding on the left black conveyor"],
      ["second conveyor suitcase", "第二只传送带行李箱", 0, 1000, 407, [989, 393, 44, 23], "Smooth dark case on the conveyor behind the silver rollers"],
      ["drop suitcase shell", "托运行李箱外壳", 2, 534, 365, [516, 353, 39, 28], "Parallel molded ribs on the top shell of the left case"],
      ["drop suitcase handle", "托运行李箱把手", 1, 550, 437, [527, 433, 49, 11], "Horizontal carrying handle on the near face of the ribbed case"],
      ["drop suitcase wheel", "托运行李箱轮", 3, 492, 478, [485, 469, 17, 20], "Exposed black wheel under the left end of the ribbed case"],
      ["second suitcase shell", "第二只行李箱外壳", 2, 995, 366, [986, 359, 29, 14], "Smooth top shell of the right-hand suitcase"],
      ["second suitcase handle", "第二只行李箱把手", 3, 1009, 425, [992, 421, 35, 11], "Horizontal carrying handle on the near face of the smooth case"],
    ],
  },
  {
    id: "cabinet-service-panels",
    title: "Cabinet panels and fittings",
    translation: "柜体与面板配件",
    description: "Compare the upright panels with the low scale bases and find the recessed handle on the left cabinet door.",
    x: 35,
    y: 325,
    width: 1464,
    height: 530,
    labels: [
      ["bag-drop station cabinet", "托运工位柜体", 0, 145, 487, [91, 444, 61, 81], "Tall front cabinet beneath the printer at the far left"],
      ["bag-drop cabinet side panel", "托运柜体侧板", 2, 69, 566, [57, 531, 16, 63], "Narrow side panel visible on the left edge of the tall cabinet"],
      ["cabinet top panel", "柜体顶板", 2, 359, 361, [345, 356, 30, 11], "Top counter panel in front of the printer and handheld scanner"],
      ["cabinet front panel", "柜体前板", 1, 117, 594, [94, 565, 58, 63], "Flat front panel on the tall left-hand equipment cabinet"],
      ["access door handle", "检修门把手", 3, 350, 522, [343, 509, 15, 25], "Recessed rectangular handle on the cabinet behind the left weighing platform"],
      ["base kickplate", "底座踢脚板", 4, 420, 829, [411, 825, 24, 8], "Narrow dark kickplate along the bottom of the left scale base"],
      ["plinth corner", "基座转角", 3, 267, 836, [261, 818, 15, 24], "Rounded outer front corner of the left plinth"],
      ["panel seam", "面板接缝", 4, 332, 559, [329, 537, 6, 43], "Thin vertical joint separating the two cabinet leaves behind the platform"],
    ],
  },
  {
    id: "floor-safety-rails",
    title: "Floor and platform rails",
    translation: "地面与秤台护栏",
    description: "Follow a tile joint across the foreground and locate the short fixed rail and its foot on the scale.",
    x: 0,
    y: 470,
    width: 1600,
    height: 430,
    labels: [
      ["bag-drop floor", "行李托运区地面", 0, 924, 810, [874, 781, 94, 48], "Open speckled floor in front of the conveyor modules"],
      ["platform guardrail", "平台护栏", 1, 352, 632, [331, 628, 45, 10], "Short horizontal guardrail immediately behind the left scale surface"],
      ["bag-drop floor tile", "行李托运区地砖", 2, 1329, 752, [1292, 728, 71, 49], "Face of a foreground floor tile below the right side of the station"],
      ["bag-drop grout line", "行李托运区地砖缝", 4, 1454, 828, [1445, 825, 20, 9], "Narrow diagonal joint in the foreground between two floor tiles"],
      ["guardrail post", "护栏立柱", 2, 259, 668, [254, 651, 11, 33], "Left upright supporting the short platform guardrail"],
      ["guardrail base", "护栏底座", 4, 260, 691, [251, 685, 18, 10], "Small mounting flange at the base of the left rail post"],
    ],
  },
];

const relatedTerms = [
  ["bag-drop access lane", "行李托运通道"],
  ["bag-drop belt receiver", "行李托运隔离带接收扣"],
  ["bag-drop drawer front", "托运抽屉前板"],
  ["bag-drop drawer pull", "托运抽屉拉手"],
  ["bag-drop floor guide stripe", "行李托运地面导向条"],
  ["bag-drop lane divider", "行李托运通道分隔栏"],
  ["bag-drop queue belt", "行李托运隔离带"],
  ["bag-drop queue rail", "行李托运排队栏杆"],
  ["bag-drop scanner trigger", "托运扫描器扳机"],
  ["bag-drop stanchion foot", "行李托运隔离柱脚"],
  ["bag-drop stanchion post", "行李托运隔离柱"],
  ["bag-drop tag scanner", "托运行李标签扫描器"],
  ["bag-drop tray", "行李托运托盘"],
  ["bag-drop ventilation grille", "托运通风格栅"],
  ["bag-tag printer housing", "行李标签打印机外壳"],
  ["bag-tag roll", "行李标签卷"],
  ["baggage tray", "行李托盘"],
  ["belt luggage guide", "传送带行李导向板"],
  ["blank claim tag", "空白提取标签"],
  ["center arch beam", "中央拱架横梁"],
  ["center arch post", "中央拱架立柱"],
  ["center bag chute", "中央行李滑槽"],
  ["center bag-drop station", "中央行李托运工位"],
  ["center baggage scale", "中央行李秤"],
  ["center belt seam", "中央传送带接缝"],
  ["center belt surface", "中央传送带表面"],
  ["center blank screen", "中央空白屏幕"],
  ["center floor plate", "中央地板板"],
  ["center luggage case", "中央行李箱"],
  ["center roller axle", "中央滚筒轴"],
  ["center scale deck", "中央秤面板"],
  ["center scale display", "中央秤显示屏"],
  ["center scale platform", "中央秤台"],
  ["center scanner arch", "中央扫描拱架"],
  ["center scanner housing", "中央扫描器外壳"],
  ["center scanner lens", "中央扫描器镜头"],
  ["center spill plate", "中央溢出板"],
  ["center station plinth", "中央工位基座"],
  ["center suitcase handle", "中央行李箱把手"],
  ["center suitcase wheel", "中央行李箱轮"],
  ["claim-tag printer", "行李提取标签打印机"],
  ["claim-tag slot", "行李提取标签插槽"],
  ["drop cable cover", "托运电缆盖"],
  ["drop document scan bed", "托运证件扫描台"],
  ["drop document scan lid", "托运证件扫描盖"],
  ["equipment cable pass-through", "设备电缆穿线孔"],
  ["equipment vent", "设备通风口"],
  ["floor junction", "地面交界"],
  ["left bag chute", "左侧行李滑槽"],
  ["left document scanner", "左侧证件扫描器"],
  ["left drawer handle", "左侧抽屉把手"],
  ["left paper tray", "左侧纸张托盘"],
  ["left scale deck", "左侧秤面板"],
  ["left service drawer", "左侧服务抽屉"],
  ["left spill plate", "左侧溢出板"],
  ["lower service panel", "下部服务面板"],
  ["luggage side bumper", "行李侧缓冲条"],
  ["mounting fastener", "安装紧固件"],
  ["overhead tag scanner", "顶部标签扫描器"],
  ["paper guide", "纸张导向器"],
  ["platform safety edge", "平台安全边缘"],
  ["power inlet", "电源接口"],
  ["printer latch", "打印机锁扣"],
  ["right bag tray", "右侧行李托盘"],
  ["right cable cover", "右侧电缆盖"],
  ["right document scanner", "右侧证件扫描器"],
  ["right drawer pull", "右侧抽屉拉手"],
  ["right floor plate", "右侧地板板"],
  ["right label slot", "右侧标签插槽"],
  ["right receipt tray", "右侧收据托盘"],
  ["right scale deck", "右侧秤面板"],
  ["right scale display", "右侧秤显示屏"],
  ["right service drawer", "右侧服务抽屉"],
  ["second suitcase wheel", "第二只行李箱轮"],
  ["service access door", "服务检修门"],
  ["service drawer", "服务抽屉"],
  ["steel trim", "钢制饰条"],
  ["suitcase corner guard", "行李箱护角"],
  ["suitcase side grip", "行李箱侧提手"],
  ["suitcase zipper", "行李箱拉链"],
  ["tag feed roller", "标签进纸滚轮"],
  ["tag output tray", "标签出纸托盘"],
  ["tray sidewall", "托盘侧墙"],
  ["tray stop", "托盘止挡"],
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
    for (const [word, labelTranslation, minLevel, x, y, bounds, description] of zone.labels) {
      const idSuffix = slug(word);
      const region = {
        id: `baggage-drop-station-region-${idSuffix}`,
        description,
        kind: "part",
        x: bounds[0],
        y: bounds[1],
        width: bounds[2],
        height: bounds[3],
      };
      labels.push({
        id: `baggage-drop-station-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: 1 + minLevel + priority / 1000,
        minLevel,
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
  const conveyorBounds = { x: 1020, y: 535, width: 120, height: 32 };
  const conveyorRegion = "portal-airport-baggage-conveyor";
  visualRegions.push({
    id: conveyorRegion,
    description: "Exposed silver conveyor rollers in front of the suitcase on the right-hand belt.",
    kind: "object",
    ...conveyorBounds,
  });
  return {
    id: "baggage-drop-station",
    title: "Baggage-drop station",
    translation: "行李托运工位",
    subtitle: "Find the baggage scales, follow two suitcases, and inspect the scanners, paper rolls and conveyor rollers",
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
      rationale: "The two freestanding dark loading platforms in front of the cabinets identify the left and right baggage scales. The belts run behind and between them. The photograph also distinguishes two suitcases, the exposed front rollers, the handheld scanners, paper feeds, cabinet panels and fixed rails. Terms without a separate, visible referent in this image are available as related words.",
      previousLabelCount: 163,
      retainedLabelCount: labels.length,
      removedLabelCount: 163 - labels.length,
      removedExamples: ["passenger identity", "scan result", "baggage routing", "security outcome", "flight status", "hidden control"],
    },
    labels,
    relatedWords: relatedTerms.map(([word, translation]) => ({
      id: `baggage-drop-station-${slug(word)}`,
      word,
      translation,
    })),
    portals: [{
      id: "enter-airport-baggage-conveyor",
      label: "Explore the baggage conveyor",
      translation: "探索行李输送带",
      childSceneId: "airport-baggage-conveyor",
      sourceVisualRegion: conveyorRegion,
      ...conveyorBounds,
      enterScale: 3.25,
    }],
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
  for (const label of [...scene.labels, ...scene.relatedWords]) {
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
    for (const label of [...other.labels, ...(other.relatedWords ?? [])]) existingWords.add(label.word.toLocaleLowerCase());
  }
  const existingDuplicates = [...wordSources.keys()].filter((word) => existingWords.has(word));
  if (existingDuplicates.length > 0) throw new Error(`baggage-drop-station term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-baggage-drop-station",
  label: "Enter the baggage-drop station",
  translation: "进入行李托运工位",
  childSceneId: "baggage-drop-station",
  sourceVisualRegion: "portal-baggage-drop-station-conveyor-scale",
  x: 490,
  y: 448,
  width: 107,
  height: 39,
  enterScale: 3.35,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Exposed black weighing belt between the first two staffed check-in counters",
  kind: "object",
  x: parentPortal.x,
  y: parentPortal.y,
  width: parentPortal.width,
  height: parentPortal.height,
};

export { parentPortal as baggageDropPortal, parentRegion as baggageDropPortalRegion };

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
  if (!manifest.scenes.some(({ id }) => id === "baggage-drop-station")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "check-in-counter");
    if (index < 0) throw new Error("check-in-counter is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "baggage-drop-station",
      title: "Baggage-drop station",
      parentId: "check-in-counter",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildBaggageDropStationScene() {
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
  buildBaggageDropStationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-baggage-drop-station-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
