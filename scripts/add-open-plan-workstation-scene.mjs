import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Author the open-plan workstation and its entrance to the desktop close-up.
 * Object coordinates and outlines use the final 1600 by 900 photograph.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/open-plan-workstation-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/open-plan-workstation-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/open-plan-workstation.json");
const parentPath = resolve(projectRoot, "public/data/scenes/office-building.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "88fb49dacb4baf57134d1bf8e9f8c68253949939df87579091462fbc8f78d10f";
const PUBLIC_ASSET_SHA256 = "9acbbe66dd5fb56faa58562c07219f723bb39d12d535648fa7be6e3abcd7f1df";
const desktopBounds = { x: 823, y: 477, width: 121, height: 23 };
export const desktopWorkstationPortal = {
  id: "enter-desktop-workstation-equipment",
  label: "Inspect the centre desktop workstation",
  translation: "查看中央桌面工位",
  childSceneId: "desktop-workstation-equipment",
  sourceVisualRegion: "portal-centre-desktop-workstation",
  ...desktopBounds,
  enterScale: 3.2,
};
export const desktopWorkstationPortalRegion = {
  id: desktopWorkstationPortal.sourceVisualRegion,
  description: "Exposed keyboard and mouse on the centre desktop, immediately to the right of the chair back.",
  kind: "object",
  ...desktopBounds,
};

const sourceZones = [
  {
    id: "left-workstation-island",
    title: "Left workstation island",
    translation: "左侧工位岛",
    description: "Inspect the left open-plan desk, blank monitor, keyboard, mouse, headset, lamp, pedestal and chair.",
    x: 0,
    y: 285,
    width: 498,
    height: 538,
    targetScale: 2.55,
    labels: [
      ["Open-plan left workstation", "左侧开放工位", 214, 502, 0, [203, 499, 21, 6]],
      ["Open-plan left desk top", "左侧工位桌面", 310, 505, 0, [288, 501, 39, 7]],
      ["Open-plan left desk edge", "左侧工位桌沿", 330, 511, 2, [320, 510, 19, 3]],
      ["Open-plan left monitor", "左侧工位显示器", 298, 339, 0, [279, 319, 41, 37]],
      ["Open-plan left blank screen", "左侧工位空白屏幕", 379, 360, 1, [361, 346, 31, 22]],
      ["Open-plan left monitor bezel", "左侧工位显示器边框", 308, 387, 2, [298, 385, 20, 4]],
      ["Open-plan left monitor arm", "左侧工位显示器支臂", 317, 424, 1, [315, 422, 4, 4]],
      ["Open-plan left arm joint", "左侧工位支臂接头", 340, 405, 3, [337, 402, 5, 5]],
      ["Open-plan left keyboard", "左侧工位键盘", 207, 490, 0, [197, 488, 17, 4]],
      ["Open-plan left key field", "左侧工位按键区", 252, 487, 3, [244, 485, 15, 3]],
      ["Open-plan left mouse", "左侧工位鼠标", 314, 489, 2, [308, 487, 11, 4]],
      ["Open-plan left mouse pad", "左侧工位鼠标垫", 330, 490, 3, [328, 489, 4, 2]],
      ["Open-plan left desk phone", "左侧工位电话", 252, 464, 0, [246, 455, 13, 15]],
      ["Open-plan left phone handset", "左侧工位电话听筒", 233, 453, 2, [231, 450, 4, 6]],
      ["Open-plan left headset", "左侧工位耳机", 426, 391, 1, [424, 390, 4, 2]],
      ["Open-plan left headset earcup", "左侧工位耳机罩", 416, 426, 3, [413, 423, 5, 6]],
      ["Open-plan left headset cable", "左侧工位耳机线"],
      ["Open-plan left pencil cup", "左侧工位笔筒", 376, 467, 1, [370, 460, 12, 12]],
      ["Open-plan left desk lamp", "左侧工位台灯", 146, 362, 0, [142, 361, 8, 2]],
      ["Open-plan left lamp shade", "左侧工位灯罩"],
      ["Open-plan left document stack", "左侧工位文件叠", 398, 492, 1, [388, 489, 19, 6]],
      ["Open-plan left drawer pedestal", "左侧工位抽屉柜", 457, 630, 0, [448, 610, 17, 38]],
      ["Open-plan left drawer front", "左侧工位抽屉面", 407, 638, 2, [401, 635, 13, 8]],
      ["Open-plan left drawer handle", "左侧工位抽屉拉手", 379, 585, 3, [368, 584, 19, 3]],
      ["Open-plan left task chair", "左侧工位办公椅", 100, 489, 0, [75, 458, 42, 48]],
    ],
  },
  {
    id: "center-workstation-island",
    title: "Center workstation island",
    translation: "中央工位岛",
    description: "Follow the central desk surface, blank monitor, keyboard, mouse, lamp, document holder, cable route and pedestal.",
    x: 478,
    y: 285,
    width: 622,
    height: 538,
    targetScale: 2.55,
    labels: [
      ["Open-plan center workstation", "中央开放工位", 681, 489, 0, [670, 480, 15, 16]],
      ["Open-plan center desk surface", "中央工位桌面", 927, 502, 0, [910, 498, 30, 7]],
      ["Open-plan center desk edge", "中央工位桌沿", 909, 508, 2, [897, 507, 23, 3]],
      ["Open-plan center monitor", "中央工位显示器", 769, 336, 0, [748, 318, 43, 34]],
      ["Open-plan center blank display", "中央工位空白屏幕", 847, 361, 1, [831, 349, 29, 23]],
      ["Open-plan center display bezel", "中央工位显示器边框", 845, 387, 2, [837, 385, 17, 4]],
      ["Open-plan center monitor arm", "中央工位显示器支臂", 834, 422, 1, [831, 419, 5, 5]],
      ["Center monitor arm joint", "中央工位显示器支臂关节", 849, 441, 3, [846, 438, 6, 5], "open-plan-center-arm-elbow"],
      ["Open-plan center support post", "中央工位支架立柱", 848, 462, 2, [846, 455, 5, 13]],
      ["Open-plan center keyboard", "中央工位键盘", 878, 490, 0, [868, 489, 19, 3]],
      ["Open-plan center key field", "中央工位按键区", 853, 486, 3, [845, 484, 16, 4]],
      ["Open-plan center mouse", "中央工位鼠标", 927, 486, 2, [922, 484, 9, 4]],
      ["Open-plan center mouse pad", "中央工位鼠标垫", 941, 490, 3, [939, 489, 4, 2]],
      ["Open-plan center desk lamp", "中央工位台灯", 646, 453, 0, [645, 445, 2, 17]],
      ["Open-plan center lamp shade", "中央工位灯罩"],
      ["Open-plan center document holder", "中央工位文件架", 983, 469, 0, [977, 461, 11, 13]],
      ["Open-plan center document folder", "中央工位文件夹", 995, 424, 2, [994, 421, 3, 6]],
      ["Open-plan center cable grommet", "中央工位穿线孔"],
      ["Open-plan center cable tray", "中央工位线缆托盘"],
      ["Center desk cable spine", "中央桌下理线链", 662, 574, 2, [660, 571, 4, 6], "open-plan-center-vertical-cable-riser"],
      ["Open-plan center desk leg", "中央工位桌腿", 615, 639, 1, [610, 619, 10, 36]],
      ["Open-plan center drawer pedestal", "中央工位抽屉柜", 952, 624, 0, [948, 611, 7, 24]],
      ["Open-plan center upper drawer", "中央工位上抽屉", 991, 592, 2, [979, 587, 21, 11]],
      ["Open-plan center drawer handle", "中央工位抽屉拉手", 1020, 583, 3, [1007, 581, 25, 4]],
      ["Open-plan center task chair", "中央工位办公椅", 765, 533, 0, [742, 515, 41, 34]],
    ],
  },
  {
    id: "right-workstation-island",
    title: "Right workstation island",
    translation: "右侧工位岛",
    description: "Inspect the right desk, blank monitor, input devices, telephone, headset, lamp, pedestal and task chair.",
    x: 1_062,
    y: 285,
    width: 538,
    height: 538,
    targetScale: 2.55,
    labels: [
      ["Open-plan right workstation", "右侧开放工位", 1284, 489, 0, [1275, 482, 18, 12]],
      ["Open-plan right desk top", "右侧工位桌面", 1258, 497, 0, [1240, 493, 34, 6]],
      ["Open-plan right desk edge", "右侧工位桌沿", 1252, 505, 2, [1236, 503, 33, 4]],
      ["Open-plan right monitor", "右侧工位显示器", 1306, 344, 0, [1288, 327, 36, 32]],
      ["Open-plan right blank screen", "右侧工位空白屏幕", 1375, 357, 1, [1359, 344, 31, 25]],
      ["Open-plan right monitor bezel", "右侧工位显示器边框", 1357, 388, 2, [1348, 386, 17, 4]],
      ["Open-plan right monitor arm", "右侧工位显示器支臂", 1361, 423, 1, [1359, 421, 4, 4]],
      ["Open-plan right arm joint", "右侧工位支臂接头", 1381, 442, 3, [1378, 440, 5, 4]],
      ["Open-plan right keyboard", "右侧工位键盘", 1318, 483, 0, [1314, 481, 8, 4]],
      ["Open-plan right key field", "右侧工位按键区", 1366, 483, 3, [1357, 481, 18, 3]],
      ["Open-plan right mouse", "右侧工位鼠标", 1455, 485, 2, [1450, 482, 9, 5]],
      ["Open-plan right mouse pad", "右侧工位鼠标垫", 1472, 489, 3, [1469, 488, 5, 2]],
      ["Open-plan right desk phone", "右侧工位电话", 1244, 461, 0, [1236, 454, 14, 13]],
      ["Open-plan right phone handset", "右侧工位电话听筒", 1217, 452, 2, [1214, 448, 5, 9]],
      ["Open-plan right headset", "右侧工位耳机", 1483, 397, 1, [1482, 396, 2, 3]],
      ["Open-plan right headset earcup", "右侧工位耳机罩", 1502, 426, 3, [1499, 423, 5, 5]],
      ["Open-plan right headset cable", "右侧工位耳机线"],
      ["Open-plan right desk lamp", "右侧工位台灯", 1186, 370, 0, [1183, 369, 7, 2]],
      ["Open-plan right lamp shade", "右侧工位灯罩"],
      ["Open-plan right drawer pedestal", "右侧工位抽屉柜", 1534, 668, 0, [1526, 657, 15, 21]],
      ["Open-plan right drawer front", "右侧工位抽屉面", 1575, 617, 2, [1568, 612, 14, 10]],
      ["Open-plan right drawer handle", "右侧工位抽屉拉手", 1594, 624, 3, [1591, 622, 7, 4]],
      ["Open-plan right task chair", "右侧工位办公椅", 1450, 446, 0, [1448, 444, 6, 4]],
      ["Open-plan right chair armrest", "右侧工位椅扶手", 1368, 539, 2, [1363, 537, 9, 4]],
      ["Open-plan right chair caster", "右侧工位椅脚轮", 1556, 741, 4, [1551, 736, 9, 9]],
    ],
  },
  {
    id: "shared-office-fittings",
    title: "Shared office fittings",
    translation: "共享办公设施",
    description: "Explore the printer in its wooden cubby, the desk partitions, the coat stand and the window wall.",
    x: 0,
    y: 0,
    width: SCENE_WIDTH,
    height: 861,
    targetScale: 2.5,
    labels: [
      ["Shared open-plan printer", "共享办公打印机", 541, 448, 0, [524, 439, 32, 15]],
      ["Shared printer paper tray", "共享打印机纸盘", 521, 463, 2, [510, 460, 20, 7]],
      ["Shared printer output tray", "共享打印机出纸盘"],
      ["Shared printer control panel", "共享打印机控制面板"],
      ["Shared printer shelf", "共享打印机搁板", 566, 477, 0, [556, 476, 19, 3]],
      ["Shared shelf cubby", "共享搁架格位", 492, 432, 0, [488, 423, 8, 22]],
      ["Shared storage bin", "共享储物箱", 541, 539, 1, [522, 529, 34, 19]],
      ["Shared paper stack", "共享纸张叠"],
      ["Shared planter box", "共享种植箱"],
      ["Shared planter leaf cluster", "共享种植箱叶簇", 1003, 277, 1, [992, 264, 21, 24]],
      ["Shared left privacy screen", "共享左侧隐私屏", 202, 410, 0, [184, 389, 36, 32]],
      ["Shared center privacy screen", "共享中央隐私屏", 921, 424, 0, [904, 403, 35, 40]],
      ["Shared right privacy screen", "共享右侧隐私屏", 1435, 406, 0, [1416, 389, 35, 31]],
      ["Shared left modesty panel", "共享左侧挡板"],
      ["Shared center modesty panel", "共享中央挡板"],
      ["Shared right modesty panel", "共享右侧挡板", 1282, 605, 1, [1254, 585, 54, 40]],
      ["Shared office coat stand", "共享办公衣帽架", 1230, 269, 0, [1228, 266, 4, 6]],
      ["Shared coat hook", "共享衣帽钩", 1249, 260, 2, [1248, 259, 3, 3]],
      ["Shared coat fabric", "共享外套衣料", 1228, 327, 2, [1221, 311, 13, 29]],
      ["Shared window wall", "共享窗墙", 1479, 182, 0, [1452, 147, 60, 64]],
      ["Shared window mullion", "共享窗竖框", 1512, 186, 2, [1511, 168, 3, 36]],
      ["Shared floor outlet", "共享地面插座"],
      ["Shared floor outlet cover", "共享地面插座盖"],
      ["Shared wall panel", "共享墙面板", 332, 190, 2, [307, 159, 47, 61]],
      ["Shared storage shelf edge", "共享储物搁板边", 538, 559, 3, [522, 557, 33, 4]],
    ],
  },
  {
    id: "cable-management-and-seating",
    title: "Cable management and seating",
    translation: "线缆管理与座椅",
    description: "Follow the flexible cable spines under the desks and inspect the chairs, their arms, bases and casters.",
    x: 0,
    y: 430,
    width: 1_436,
    height: 470,
    targetScale: 2.55,
    labels: [
      ["Underdesk left cable tray", "左侧桌下线缆托盘"],
      ["Underdesk center cable tray", "中央桌下线缆托盘"],
      ["Underdesk right cable tray", "右侧桌下线缆托盘"],
      ["Left desk cable spine", "左侧桌下理线链", 298, 584, 1, [295, 577, 5, 13], "underdesk-left-cable-riser"],
      ["Underdesk center cable riser", "中央桌下线缆槽"],
      ["Right desk cable spine", "右侧桌下理线链", 1235, 573, 1, [1232, 565, 5, 15], "underdesk-right-cable-riser"],
      ["Underdesk left cable basket", "左侧桌下线缆篮"],
      ["Underdesk center cable basket", "中央桌下线缆篮"],
      ["Underdesk right cable basket", "右侧桌下线缆篮"],
      ["Underdesk left power strip", "左侧桌下电源排"],
      ["Underdesk center power strip", "中央桌下电源排"],
      ["Underdesk right power strip", "右侧桌下电源排", 1302, 548, 2, [1284, 544, 31, 10]],
      ["Underdesk left cable grommet", "左侧桌下穿线孔"],
      ["Underdesk center cable grommet", "中央桌下穿线孔"],
      ["Underdesk right cable grommet", "右侧桌下穿线孔"],
      ["Underdesk left cable clip", "左侧桌下线缆夹"],
      ["Underdesk center cable clip", "中央桌下线缆夹"],
      ["Underdesk right cable clip", "右侧桌下线缆夹"],
      ["Open-plan left chair back", "左侧工位椅背", 103, 537, 1, [95, 529, 14, 15]],
      ["Open-plan left chair seat", "左侧工位座面", 247, 581, 1, [237, 575, 19, 9]],
      ["Open-plan left chair armrest", "左侧工位椅扶手", 232, 538, 2, [227, 537, 9, 3]],
      ["Open-plan left chair five-star base", "左侧工位五星椅脚", 155, 701, 0, [149, 696, 11, 10]],
      ["Open-plan left chair caster", "左侧工位椅脚轮", 66, 781, 4, [61, 775, 10, 11]],
      ["Open-plan center chair back", "中央工位椅背", 755, 605, 1, [745, 590, 19, 28]],
      ["Open-plan center chair caster", "中央工位椅脚轮", 850, 794, 4, [845, 789, 10, 10]],
    ],
  },
  {
    id: "lighting-plants-and-floor",
    title: "Lighting, plants and floor",
    translation: "照明、植物与地面",
    description: "Inspect the ceiling slats, lighting, windows, planter foliage, glass partition and polished floor.",
    x: 0,
    y: 0,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    targetScale: 2.45,
    labels: [
      ["Open-plan linear ceiling light", "开放办公线性顶灯", 445, 48, 0, [429, 46, 31, 4]],
      ["Open-plan wood ceiling slat", "开放办公木质顶格栅", 678, 20, 1, [670, 19, 16, 2]],
      ["Open-plan acoustic ceiling panel", "开放办公吸音顶板"],
      ["Open-plan return-air grille", "开放办公回风格栅"],
      ["Open-plan window glass", "开放办公窗玻璃", 1555, 168, 0, [1535, 142, 36, 50]],
      ["Open-plan window mullion", "开放办公窗竖框"],
      ["Open-plan planter trough", "开放办公种植槽", 695, 333, 0, [679, 324, 31, 16]],
      ["Open-plan broadleaf plant", "开放办公阔叶植物", 695, 197, 1, [693, 195, 4, 4]],
      ["Open-plan fern frond", "开放办公蕨叶", 462, 263, 2, [458, 260, 7, 6]],
      ["Open-plan upright plant", "开放办公直立植物", 784, 271, 1, [782, 266, 4, 9]],
      ["Open-plan trailing leaf", "开放办公垂叶", 469, 332, 2, [466, 329, 5, 5]],
      ["Open-plan planter soil", "开放办公种植土"],
      ["Open-plan plant stem", "开放办公植物茎", 617, 259, 3, [616, 255, 2, 6]],
      ["Open-plan polished floor", "开放办公磨光地面", 840, 842, 0, [813, 829, 51, 25]],
      ["Open-plan floor seam", "开放办公地面接缝"],
      ["Open-plan floor reflection", "开放办公地面反光"],
      ["Open-plan wall baseboard", "开放办公墙脚线"],
      ["Open-plan wall finish", "开放办公墙面饰面", 865, 179, 1, [843, 159, 43, 39]],
      ["Open-plan glass partition", "开放办公玻璃隔断", 106, 248, 0, [88, 225, 36, 44]],
      ["Open-plan partition frame", "开放办公隔断框", 171, 203, 2, [169, 189, 4, 29]],
      ["Open-plan desk task light", "开放办公桌面工作灯"],
      ["Open-plan task-light stem", "开放办公工作灯杆", 1166, 450, 3, [1165, 444, 2, 13]],
      ["Open-plan ceiling light diffuser", "开放办公顶灯扩散罩", 1008, 54, 2, [997, 53, 22, 2]],
      ["Open-plan window sill", "开放办公窗台"],
      ["Open-plan floor box cover", "开放办公地面线盒盖", 477, 771, 4, [466, 766, 21, 9]],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function buildScene() {
  const labels = [];
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel, bounds, stableSlug = slugify(word)] of zone.labels) {
      const id = `open-plan-workstation-${stableSlug}`;
      const priority = Number((1 + priorityIndex++ / 1000).toFixed(6));
      if (x === undefined) {
        relatedWords.push({ id, word, translation });
        continue;
      }
      const [left, top, width, height] = bounds;
      const region = {
        id: `open-plan-workstation-region-${stableSlug}`,
        description: `Visible ${word.toLowerCase()} in the ${zone.title.toLowerCase()} area of the office photograph`,
        kind: "part",
        x: left, y: top, width, height,
      };
      labels.push({
        id,
        word,
        translation,
        x, y, priority,
        minLevel,
        sourceVisualRegion: region.id,
        semanticRealmId: "people-society",
      });
      visualRegions.push(region);
      labelIds.push(id);
    }
    detailZones.push({
      id: `open-plan-workstation-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "open-plan-workstation",
    title: "Open-plan workstation",
    translation: "开放式办公工位",
    subtitle: "Desks, monitors, input devices, seating and cable management",
    asset: "/scenes/open-plan-workstation-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "office-building",
    visualRegions: [...visualRegions, desktopWorkstationPortalRegion],
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/open-plan-workstation-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "Agents matched the visible desk equipment, chairs, cabinet fittings, and shared office fixtures to the final photograph. Parts whose identity or outline cannot be resolved remain searchable in this scene.",
      previousLabelCount: labels.length + relatedWords.length,
      retainedLabelCount: labels.length,
      removedLabelCount: relatedWords.length,
      removedExamples: relatedWords.slice(0, 6).map(({ word }) => word),
    },
    labels,
    relatedWords,
    portals: [desktopWorkstationPortal],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("open-plan source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`open-plan JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const parentPortal = {
  id: "enter-open-plan-workstation",
  label: "Enter the open-plan workstation",
  translation: "进入开放式办公工位",
  childSceneId: "open-plan-workstation",
  sourceVisualRegion: "portal-open-plan-left-workstations",
  x: 460,
  y: 476,
  width: 138,
  height: 69,
  enterScale: 3.5,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Rear workstation screens, desktops and chair backs behind the reception counter.",
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
  if (!manifest.scenes.some(({ id }) => id === "open-plan-workstation")) {
    const officeIndex = manifest.scenes.findIndex(({ id }) => id === "office-building");
    if (officeIndex < 0) throw new Error("office-building is missing from the scene manifest");
    manifest.scenes.splice(officeIndex + 1, 0, {
      id: "open-plan-workstation",
      title: "Open-plan workstation",
      parentId: "office-building",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildOpenPlanWorkstationScene() {
  const scene = buildScene();
  if (scene.labels.length + scene.relatedWords.length !== 150) {
    throw new Error("Open-plan workstation must retain its 150 scene words");
  }
  if (scene.detailZones.length !== 6) throw new Error(`open-plan zone count ${scene.detailZones.length} is not 6`);
  const result = {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  buildOpenPlanWorkstationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-open-plan-workstation-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
