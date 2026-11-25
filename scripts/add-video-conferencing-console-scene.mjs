import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { videoConsolePortal, videoConsolePortalRegion } from "./add-conference-room-scene.mjs";

/**
 * Build the terminal equipment scene from the office photograph. With
 * --integrate, install the conference room's display portal and manifest entry.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/video-conferencing-console-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/video-conferencing-console-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/video-conferencing-console.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/conference-room.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "cad302ea3d5edb5932d441231ba5dd311792de17950d1df41205fe376f068f1d";
const PUBLIC_ASSET_SHA256 = "191dcac69bbc53f5ec57497dc078f00d48c06104051886102b4fbf1ab0e863a5";

// Label rows specify the term, translation, first zoom level, image point, crop and visible cue.
const zones = [
  {
    id: "display-front",
    title: "Front display surface",
    translation: "前部显示屏",
    description: "Compare the screen face with the thin outer frame and the wall panels around the display.",
    x: 289,
    y: 0,
    width: 858,
    height: 554,
    labels: [
      ["video conferencing display", "视频会议显示屏", 0, 835, 269, [535, 97, 600, 345], "Large wall display above the video bar", "object"],
      ["display panel", "显示面板", 1, 662, 238, [553, 112, 560, 314], "Single uninterrupted dark screen surface inside the narrow frame"],
      ["video display bezel", "视频显示屏边框", 3, 1129, 311, [1126, 269, 7, 80], "Black vertical bezel on the right side of the display"],
      ["display lower bezel", "显示屏下边框", 3, 1070, 437, [1033, 435, 76, 5], "Dark lower frame directly beneath the screen face"],
      ["display top bezel", "显示屏上边框", 3, 938, 102, [898, 99, 81, 7], "Black top edge of the display to the right of the camera"],
      ["display side frame", "显示屏侧框", 4, 539, 285, [536, 245, 7, 81], "Narrow left-hand frame beside the gray wall"],
      ["display trim strip", "显示屏饰条", 4, 663, 434, [637, 433, 53, 3], "Fine gray horizontal strip across the lower display frame"],
      ["front wall panel", "前墙面板", 2, 479, 317, [429, 273, 97, 85], "Textured wall panel immediately to the left of the display"],
      ["front wall seam", "前墙面接缝", 4, 634, 47, [632, 15, 5, 69], "Straight vertical joint over the left half of the display"],
    ],
  },
  {
    id: "camera-speaker-bar",
    title: "Camera and speaker bar",
    translation: "摄像机与扬声器条",
    description: "Locate the camera above the display and the separate video bar with two grille sections below it.",
    x: 678,
    y: 45,
    width: 299,
    height: 463,
    labels: [
      ["room camera", "会议室摄像机", 0, 821, 74, [805, 54, 62, 32], "Small rectangular camera centered on the top edge of the wall display", "object"],
      ["conference video bar", "会议视频条", 0, 784, 480, [693, 452, 271, 47], "Wide black unit with a central lens below the wall screen", "object"],
      ["meeting camera housing", "会议摄像机外壳", 2, 858, 68, [851, 58, 13, 22], "Rectangular black camera casing beside the top camera lens"],
      ["video camera lens", "视频摄像机镜头", 2, 828, 475, [811, 457, 34, 37], "Round glass camera lens in the center of the video bar below the display"],
      ["camera mount foot", "摄像机安装脚", 4, 835, 85, [826, 83, 18, 5], "Short central foot joining the small camera body to its longer plate"],
      ["left speaker grille", "左扬声器格栅", 2, 748, 474, [706, 461, 99, 27], "Textured grille on the left side of the video bar"],
      ["right speaker grille", "右扬声器格栅", 2, 906, 474, [864, 461, 84, 27], "Textured grille on the right side of the video bar"],
      ["video bar end cap", "视频条端盖", 4, 960, 479, [956, 458, 8, 36], "Rounded black end of the video bar on the right"],
      ["speaker enclosure", "扬声器外壳", 3, 732, 495, [708, 492, 53, 6], "Lower black casing beneath the left speaker grille"],
    ],
  },
  {
    id: "touch-console",
    title: "Touch console",
    translation: "桌面触控台",
    description: "Find the tilted touchscreen, its exposed wedge support and base, and the separate connected device at the back of the table.",
    x: 758,
    y: 557,
    width: 376,
    height: 294,
    labels: [
      ["room touch console", "会议室触控台", 0, 1005, 725, [884, 626, 241, 213], "Angled black touch console on the tabletop to the left of the right microphone", "object"],
      ["meeting console screen", "会议触控台屏幕", 1, 979, 685, [949, 663, 90, 63], "Inset dark screen face on the tilted console"],
      ["meeting console bezel", "会议触控台边框", 3, 1044, 795, [1038, 787, 14, 17], "Wide black bezel between the inset screen and its silver outer edge"],
      ["console stand", "触控台支架", 2, 1086, 786, [1078, 773, 16, 22], "Exposed triangular support behind the lower right side of the screen"],
      ["console base", "触控台底座", 2, 1007, 825, [989, 817, 38, 15], "Flat black base on the table below the tilted screen"],
      ["console cable", "触控台电缆", 3, 878, 787, [862, 784, 41, 8], "Black lead running from the foreground hub under the left side of the console"],
      ["tabletop device base", "桌面设备底座", 4, 853, 600, [845, 597, 14, 7], "Low rectangular foot beneath the small black device at the back of the table"],
      ["tabletop device cable", "桌面设备电缆", 4, 819, 604, [815, 598, 10, 13], "Short lead exiting the near side of the small rear tabletop device"],
    ],
  },
  {
    id: "table-microphones",
    title: "Table microphone pods",
    translation: "桌面麦克风单元",
    description: "Compare the four round microphones, then follow the leads from their grilles and housings to the center of the table.",
    x: 340,
    y: 577,
    width: 1020,
    height: 323,
    labels: [
      ["right microphone pod", "右侧麦克风单元", 0, 1270, 801, [1194, 761, 153, 81], "Front right round microphone beside the touch console", "object"],
      ["near microphone pod", "近侧麦克风单元", 0, 437, 779, [366, 741, 142, 76], "Large round microphone in the front left of the table", "object"],
      ["left microphone pod", "左侧麦克风单元", 1, 614, 605, [577, 588, 75, 31], "Small rear left microphone near the far edge of the table", "object"],
      ["far microphone pod", "远侧麦克风单元", 1, 1027, 607, [989, 591, 76, 31], "Small rear right microphone behind the angled console", "object"],
      ["microphone pod housing", "麦克风单元外壳", 2, 1306, 817, [1278, 812, 55, 13], "Smooth black sidewall around the front right microphone"],
      ["microphone grille", "麦克风格栅", 3, 1290, 781, [1266, 770, 54, 20], "Perforated top of the front right microphone"],
      ["near microphone grille", "近侧麦克风格栅", 3, 425, 761, [400, 752, 52, 17], "Round mesh insert on the foreground left microphone"],
      ["near microphone cable", "近侧麦克风电缆", 2, 598, 750, [579, 747, 44, 9], "Black cable arching rightward from the foreground left microphone"],
      ["far microphone grille", "远侧麦克风格栅", 4, 1030, 598, [1014, 594, 32, 9], "Small top grille on the rear right microphone"],
      ["far microphone cable", "远侧麦克风电缆", 3, 937, 600, [916, 595, 42, 10], "Lead running left from the rear right pod toward the table channel"],
      ["microphone cable port", "麦克风电缆接口", 4, 507, 773, [501, 764, 15, 13], "Plug entering the right side of the foreground left microphone housing"],
      ["tabletop cable trough", "桌面线缆槽", 1, 731, 786, [711, 734, 29, 87], "Recessed cable space along the left of the foreground outlet module"],
      ["trough lid", "线缆槽盖", 2, 771, 865, [725, 838, 122, 55], "Closed foreground cover continuing forward from the recessed outlet module"],
    ],
  },
  {
    id: "cable-power-hub",
    title: "Cable and power hub",
    translation: "线缆与电源模块",
    description: "Inspect the central outlet module and cable openings, then trace the visible adapter lead between the cabinet and the wall.",
    x: 0,
    y: 399,
    width: 870,
    height: 439,
    labels: [
      ["video room power hub", "视频会议电源模块", 1, 765, 790, [730, 731, 100, 89], "Recessed rectangular outlet module in the foreground table channel", "object"],
      ["video room power socket", "视频会议电源插座", 2, 786, 775, [770, 766, 33, 19], "Multihole power receptacle in the center of the foreground module"],
      ["power hub lid", "电源模块盖", 3, 783, 664, [778, 650, 31, 37], "Flat sliding cover beside the opening in the middle tabletop module"],
      ["console side credenza", "控制台侧边柜", 0, 74, 572, [0, 479, 419, 261], "Low wooden cabinet to the left of the wall display", "object"],
      ["room compute box", "会议室计算盒", 1, 217, 467, [176, 448, 90, 36], "Larger rectangular equipment box on top of the wooden credenza", "object"],
      ["room power adapter", "会议室电源适配器", 2, 327, 475, [299, 465, 51, 19], "Small black adapter beside the equipment box under the wall outlet", "object"],
      ["adapter cable", "适配器电缆", 3, 316, 452, [310, 440, 13, 26], "Short black lead rising from the adapter to the wall outlet"],
      ["room wall outlet", "会议室墙面插座", 2, 320, 426, [312, 418, 15, 17], "Left receptacle in the black wall plate above the credenza"],
      ["outlet faceplate", "插座面板", 4, 352, 436, [349, 413, 8, 28], "Right-hand border of the two-socket black wall plate"],
      ["cable pass-through", "电缆穿线孔", 3, 837, 788, [824, 781, 24, 16], "Open slot through which the console lead enters the near hub"],
      ["video cable loop", "视频电缆环", 4, 768, 597, [764, 588, 18, 15], "Short curved loop at the left connector of the small rear tabletop device"],
    ],
  },
  {
    id: "mount-wall-hardware",
    title: "Mounting and wall hardware",
    translation: "安装与墙面五金",
    description: "Locate the whiteboard frame and tray, the acoustic wall panels, the glass partition and the door pull seen through it.",
    x: 300,
    y: 0,
    width: 1300,
    height: 567,
    labels: [
      ["meeting whiteboard", "会议白板", 0, 1246, 223, [1170, 125, 197, 324], "Tall whiteboard immediately to the right of the wall display", "object"],
      ["meeting glass partition", "会议室玻璃隔断", 1, 1382, 172, [1365, 9, 222, 518], "Full-height glazing to the right of the whiteboard", "object"],
      ["camera mounting plate", "摄像机安装板", 3, 786, 92, [773, 87, 127, 11], "Long black mounting plate between the small camera and the top of the display"],
      ["console whiteboard frame", "控制台白板框", 3, 1175, 304, [1171, 269, 8, 70], "Thin metal edging along the left side of the whiteboard"],
      ["meeting marker tray", "会议白板笔托盘", 3, 1290, 444, [1243, 440, 113, 7], "Shallow lower ledge supporting the board markers"],
      ["blank whiteboard", "空白白板面", 2, 1302, 337, [1265, 301, 75, 73], "Blank white writing surface inside the board frame"],
      ["whiteboard fastener", "白板紧固件", 4, 1189, 140, [1184, 135, 11, 11], "Dark circular fastener near the board’s upper left corner"],
      ["meeting acoustic wall panel", "会议吸音墙板", 1, 1201, 68, [1142, 27, 159, 75], "Textured gray wall panel above the whiteboard"],
      ["meeting wall panel seam", "会议墙板接缝", 4, 1049, 525, [1046, 501, 5, 50], "Vertical wall-panel joint to the right of the video bar"],
      ["meeting wall power outlet", "会议墙面电源插座", 3, 340, 426, [332, 417, 16, 17], "Right receptacle in the two-socket plate above the wood cabinet"],
      ["meeting wall cable channel", "会议墙面电缆通道", 2, 829, 532, [821, 498, 16, 64], "Vertical cable channel running from the video bar down to the table"],
      ["meeting glass mullion", "会议室玻璃竖框", 2, 1457, 281, [1443, 232, 30, 98], "Thick black vertical mullion in the foreground glass partition"],
      ["meeting partition door", "会议室隔断门", 3, 1409, 352, [1367, 214, 67, 351], "Framed glass door visible beyond the foreground glazing"],
      ["partition door pull", "隔断门拉手", 4, 1424, 422, [1419, 402, 9, 34], "Slender dark vertical door pull visible through the right-side glass"],
    ],
  },
  {
    id: "room-finish",
    title: "Room furniture and finish",
    translation: "房间家具与饰面",
    description: "Follow the wooden conference tabletop to its far edge, and compare the mesh chair backs with the large glass wall pane.",
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    labels: [
      ["video room table", "视频会议桌", 0, 544, 666, [353, 641, 278, 81], "Wood-grain conference tabletop surrounding the central equipment channel", "object"],
      ["meeting chair backrest", "会议椅背", 1, 185, 599, [143, 566, 87, 85], "Black mesh backrest of the chair in front of the left credenza"],
      ["video tabletop edge", "视频会议桌边缘", 3, 923, 563, [887, 560, 62, 6], "Far edge of the wooden table where it meets the gray front wall"],
      ["video glass wall panel", "视频会议室玻璃墙板", 2, 1522, 117, [1480, 54, 111, 129], "Clear pane to the right of the heavy black foreground mullion"],
    ],
  },
];

const relatedTerms = [
  ["bar wall spacer", "视频条墙面垫块"],
  ["blank display surface", "空白显示面"],
  ["braided video cable", "编织视频线"],
  ["camera cable", "摄像机电缆"],
  ["camera indicator window", "摄像机指示窗"],
  ["camera privacy shutter", "摄像机隐私挡板"],
  ["camera tilt joint", "摄像机俯仰关节"],
  ["console blank surface", "触控台空白面"],
  ["console cable loop", "触控台线缆环"],
  ["console foot pad", "触控台脚垫"],
  ["console hinge", "触控台铰链"],
  ["console port cover", "触控台接口盖"],
  ["console port panel", "触控台接口面板"],
  ["console power lead", "触控台电源线"],
  ["console rear foot", "触控台后脚"],
  ["console rear panel", "触控台后面板"],
  ["console screen border", "触控台屏幕边界"],
  ["console screen glass", "触控台屏幕玻璃"],
  ["console side button", "触控台侧按钮"],
  ["console strain relief", "触控台应力释放套"],
  ["display backplate", "显示屏背板"],
  ["display bottom rail", "显示屏底部导轨"],
  ["display bracket", "显示屏支架"],
  ["display cable channel", "显示屏电缆通道"],
  ["display corner guard", "显示屏护角"],
  ["display lower ledge", "显示屏下沿"],
  ["display mount screw", "显示屏挂架螺钉"],
  ["display mounting rail", "显示屏安装导轨"],
  ["display spacer", "显示屏垫块"],
  ["display wall mount", "显示屏墙面挂架"],
  ["meeting chair armrest", "会议椅扶手"],
  ["meeting chair base", "会议椅底座"],
  ["meeting chair caster", "会议椅脚轮"],
  ["meeting chair caster fork", "会议椅脚轮叉"],
  ["meeting chair seat", "会议椅座"],
  ["meeting display glass", "会议显示屏玻璃"],
  ["meeting marker cup", "会议白板笔杯"],
  ["meeting mullion cap", "会议室竖框端盖"],
  ["microphone rubber foot", "麦克风橡胶脚"],
  ["pod cable junction", "单元线缆接点"],
  ["soundbar center grille", "音箱条中央格栅"],
  ["speaker cable", "扬声器电缆"],
  ["speaker wall bracket", "扬声器墙面支架"],
  ["table control pod", "桌面控制单元"],
  ["table edge trim", "桌面边饰条"],
  ["trough divider", "线缆槽分隔片"],
  ["video bar bracket", "视频条支架"],
  ["video bar control button", "视频条控制按钮"],
  ["video bar grille", "视频条格栅"],
  ["video bar mount", "视频条挂架"],
  ["video cable clip", "视频线缆夹"],
  ["video cable grommet", "视频线缆穿线孔"],
  ["video cable strain relief", "视频线缆应力释放套"],
  ["video cable trough", "视频线缆槽"],
  ["video carpet seam", "视频会议室地毯接缝"],
  ["video carpet tile", "视频会议室地毯块"],
  ["video display support arm", "视频显示屏支撑臂"],
  ["video equipment shelf", "视频设备搁板"],
  ["video floor access cover", "视频会议室地面检修盖"],
  ["video floor cable cover", "视频设备地面线缆盖"],
  ["video microphone mute button", "视频麦克风静音按钮"],
  ["video room carpet", "视频会议室地毯"],
  ["video room data socket", "视频会议数据插座"],
  ["video room floor", "视频会议室地面"],
  ["video room USB port", "视频会议 USB 接口"],
  ["video table foot", "视频会议桌脚座"],
  ["video table leg", "视频会议桌腿"],
  ["video table microphone pod", "视频桌面麦克风单元"],
  ["video table modesty panel", "视频会议桌挡板"],
  ["video tabletop grommet", "视频桌面穿线孔"],
  ["video tabletop seam", "视频桌面接缝"],
  ["video trough divider", "视频线缆槽分隔片"],
  ["video wall base trim", "视频会议室墙根饰条"],
  ["video window blind", "视频会议室窗百叶"],
  ["wall camera mount", "墙面摄像机挂架"],
  ["wall display rail", "墙面显示导轨"],
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
    for (const [word, labelTranslation, minLevel, x, y, bounds, description, kind = "part"] of zone.labels) {
      const idSuffix = slug(word);
      const [left, top, width, height] = bounds;
      const region = {
        id: `video-conferencing-console-region-${idSuffix}`,
        description,
        kind,
        x: left,
        y: top,
        width,
        height,
      };
      labels.push({
        id: `video-conferencing-console-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + minLevel + priority / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`video-conferencing-console-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `video-conferencing-console-zone-${zone.id}`,
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
    id: "video-conferencing-console",
    title: "Video-conferencing console",
    translation: "视频会议控制台",
    subtitle: "Display, camera, speaker bar, touch console, microphone pods, cables and room hardware",
    asset: "/scenes/video-conferencing-console-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "conference-room",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/video-conferencing-console-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The 1600 by 900 image shows four round microphones in two rows, a tilted touch console and an inset table outlet. Each mapped word has an image crop for its visible object or part. Related words preserve names for concealed fittings, indistinguishable device features and alternate names for the same surface.",
      previousLabelCount: 152,
      retainedLabelCount: labels.length,
      removedLabelCount: 152 - labels.length,
      removedExamples: ["meeting content", "people", "company identity", "network connectivity", "recording state", "hidden wiring"],
    },
    labels,
    relatedWords: relatedTerms.map(([word, translation]) => ({
      id: `video-conferencing-console-${slug(word)}`,
      word,
      translation,
    })),
    portals: [],
  };
}

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, next) === 0) return false;
    if (path === scenePath) {
      const existing = JSON.parse(current.toString("utf8"));
      if (existing.anchorAudit?.status === "human-verified") {
        // Preserve a subsequent sign-off when the reviewed content still matches.
        existing.anchorAudit.status = value.anchorAudit.status;
        existing.anchorAudit.rationale = value.anchorAudit.rationale;
        if (isDeepStrictEqual(existing, value)) return false;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path, next);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourceAsset);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("video conferencing console source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("video conferencing console JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`video-conferencing-console contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`video-conferencing-console term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

export function integrateVideoConsolePortal(parent) {
  const legacyRegionId = "portal-video-conferencing-console-device-group";
  const consolePortals = parent.portals.filter(({ id }) => id === videoConsolePortal.id);
  const consoleRegions = parent.visualRegions.filter(({ id }) => (
    id === legacyRegionId || id === videoConsolePortalRegion.id
  ));
  if (isDeepStrictEqual(consolePortals, [videoConsolePortal]) &&
      isDeepStrictEqual(consoleRegions, [videoConsolePortalRegion])) return parent;

  const reviewNote = "An image review updated the video-console entrance and its image region to the front-wall display above the speaker bar.";
  const previousRationale = parent.anchorAudit.rationale;
  return {
    ...parent,
    visualRegions: [
      ...parent.visualRegions.filter(({ id }) => id !== legacyRegionId && id !== videoConsolePortalRegion.id),
      videoConsolePortalRegion,
    ],
    portals: [...parent.portals.filter(({ id }) => id !== videoConsolePortal.id), videoConsolePortal],
    anchorAudit: {
      ...parent.anchorAudit,
      status: "image-reviewed",
      rationale: previousRationale.includes(reviewNote) ? previousRationale : `${previousRationale} ${reviewNote}`,
    },
  };
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "video-conferencing-console")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "conference-room");
    if (index < 0) throw new Error("conference-room is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "video-conferencing-console",
      title: "Video-conferencing console",
      parentId: "conference-room",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildVideoConferencingConsoleScene() {
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
    const parent = JSON.parse(await readFile(parentPath, "utf8"));
    result.parentChanged = await writeIfChanged(parentPath, integrateVideoConsolePortal(parent));
    result.manifestChanged = await updateManifest();
  }
  return result;
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildVideoConferencingConsoleScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-video-conferencing-console-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
