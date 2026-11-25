import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";

/**
 * Build the conference-room scene, including the display that leads to the
 * video-conferencing console. --integrate also registers the room in the office.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/conference-room-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/conference-room-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/conference-room.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/office-building.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "75295d1d3a58d08877dd49b1046b0cd00086899ba1fb68f5f89d3c350a1af2f6";
const PUBLIC_ASSET_SHA256 = "d12438f3e95d9d580d0beb21b18baa7547d921ce18f205a61b279219a82533e1";

const displayBounds = { x: 818, y: 219, width: 238, height: 132 };
export const videoConsolePortal = {
  id: "enter-video-conferencing-console",
  label: "Enter the video-conferencing console",
  translation: "进入视频会议设备台",
  childSceneId: "video-conferencing-console",
  sourceVisualRegion: "portal-video-conferencing-console-display",
  ...displayBounds,
  enterScale: 3.45,
};
export const videoConsolePortalRegion = {
  id: videoConsolePortal.sourceVisualRegion,
  description: "Black display face on the front wall between the wood paneling and the whiteboard, above the speaker bar.",
  kind: "object",
  ...displayBounds,
};

const zones = [
  {
    id: "glass-entry",
    title: "Glass entry and partition",
    translation: "玻璃入口与隔断",
    description: "Find the glass door and its handle, then follow the blinds along the windows to the left.",
    x: 0,
    y: 0,
    width: 350,
    height: 900,
    labels: [
      ["conference room entry", "会议室入口", 318, 512, [313, 507, 9, 11]],
      ["glass entry door", "玻璃入口门", 220, 298, [216, 286, 7, 22]],
      ["glass door frame", "玻璃门框", 253, 430, [250, 416, 6, 25]],
      ["conference glass door handle", "会议玻璃门把手", 220, 519, [215, 517, 10, 4]],
      ["door handle mount", "门把手底座", 289, 485, [288, 478, 9, 15]],
      ["conference door hinge", "会议室门铰链"],
      ["conference door closer", "会议室闭门器"],
      ["conference door latch", "会议室门锁扣"],
      ["conference door jamb", "会议室门框立柱"],
      ["entry threshold", "入口门槛"],
      ["threshold plate", "门槛板"],
      ["conference doorway seal", "会议室门口密封条"],
      ["conference glass partition", "会议室玻璃隔断"],
      ["partition mullion", "隔断竖框"],
      ["partition base channel", "隔断底槽"],
      ["left conference window", "左侧会议室窗", 58, 214, [46, 202, 21, 26]],
      ["conference window blind", "会议室窗百叶", 159, 68, [150, 62, 17, 13]],
      ["blind slat", "百叶片", 176, 105, [174, 104, 4, 2]],
      ["blind rail", "百叶导轨"],
      ["conference window sill", "会议室窗台"],
    ],
  },
  {
    id: "credenza-storage",
    title: "Credenza and storage",
    translation: "边柜与储物",
    description: "Inspect the visible credenza, cabinet doors, drawers, handles, shelves, boxes, binders and plant pot.",
    x: 100,
    y: 150,
    width: 550,
    height: 570,
    labels: [
      ["conference credenza", "会议室边柜", 398, 495, [385, 481, 23, 23]],
      ["credenza cabinet", "边柜柜体", 200, 480, [199, 474, 3, 12]],
      ["credenza drawer", "边柜抽屉", 139, 608, [130, 603, 16, 10]],
      ["credenza drawer handle", "边柜抽屉把手", 124, 570, [122, 569, 4, 2]],
      ["credenza cabinet door", "边柜柜门", 379, 546, [370, 536, 18, 20]],
      ["credenza cabinet hinge", "边柜柜门铰链"],
      ["credenza cabinet pull", "边柜柜门拉手", 363, 462, [362, 454, 2, 15]],
      ["conference storage shelf", "会议室储物搁板", 145, 537, [142, 536, 6, 2]],
      ["conference storage box", "会议室储物箱", 132, 390, [119, 379, 23, 19]],
      ["conference binder", "会议室文件夹", 352, 380, [349, 371, 5, 18]],
      ["meeting-room plant pot", "会议室植物盆", 492, 378, [482, 371, 16, 11]],
      ["credenza countertop", "边柜台面", 408, 407, [403, 405, 10, 4]],
      ["credenza countertop edge", "边柜台面边缘", 400, 417, [397, 416, 5, 2]],
      ["file holder", "文件架"],
      ["cable box", "电缆盒"],
      ["credenza base", "边柜底座", 155, 670, [152, 668, 6, 4]],
      ["credenza foot", "边柜脚座"],
      ["conference wall shelf", "会议室墙面搁板"],
      ["conference shelf bracket", "会议室搁板支架"],
      ["meeting-room storage bin", "会议室储物箱", 156, 514, [149, 507, 13, 13]],
    ],
  },
  {
    id: "table-cable-hardware",
    title: "Conference table and cable hardware",
    translation: "会议桌与线缆设备",
    description: "Follow the cable trough across the tabletop, then look underneath for the legs, feet and modesty panel.",
    x: 400,
    y: 380,
    width: 800,
    height: 520,
    labels: [
      ["conference table", "会议桌", 800, 560],
      ["conference tabletop", "会议桌面", 940, 554, [915, 535, 60, 35]],
      ["wood table edge", "木桌边缘", 700, 586, [687, 584, 26, 5]],
      ["table corner", "桌角", 942, 613, [937, 609, 10, 8]],
      ["cable trough", "线缆槽", 772, 522, [757, 518, 29, 9]],
      ["cable trough cover", "线缆槽盖", 716, 544, [703, 540, 28, 6]],
      ["conference table power module", "会议桌面电源模块"],
      ["conference power socket", "会议室电源插座"],
      ["USB socket", "USB 插座"],
      ["data socket", "数据插座"],
      ["table microphone pod", "桌面麦克风单元"],
      ["microphone mute button", "麦克风静音按钮"],
      ["table speaker pod", "桌面扬声器单元"],
      ["table cable clip", "桌面线缆夹"],
      ["table cable grommet", "桌面穿线孔"],
      ["conference table leg", "会议桌桌腿", 641, 744, [637, 733, 9, 24]],
      ["table leg foot", "桌腿脚座", 609, 774, [605, 772, 8, 4]],
      ["table modesty panel", "桌面挡板", 710, 645, [690, 628, 40, 35]],
      ["table stretcher", "桌腿横撑"],
      ["table floor cable cover", "桌下地面线缆盖"],
      ["tabletop control unit", "桌面控制单元"],
      ["control dial", "控制旋钮"],
      ["table seam", "桌面接缝"],
      ["table support bracket", "桌面支撑架"],
      ["tabletop outlet", "桌面插口"],
      ["table cable channel", "桌面线缆通道", 860, 481, [852, 478, 16, 7]],
      ["table underside", "桌面底面"],
      ["under-table crossbar", "桌下横梁", 850, 646, [846, 643, 9, 6]],
    ],
  },
  {
    id: "chair-seating",
    title: "Conference chair seating",
    translation: "会议椅座席",
    description: "Compare the visible office chairs, backrests, seat pans, armrests, bases, columns and casters.",
    x: 400,
    y: 350,
    width: 900,
    height: 550,
    labels: [
      ["meeting-room chair", "会议室椅", 494, 483, [486, 475, 16, 17]],
      ["meeting-room chair backrest", "会议室椅背", 574, 448, [568, 441, 13, 15]],
      ["chair seat pan", "椅座", 511, 594, [505, 588, 13, 12]],
      ["meeting-room chair armrest", "会议室椅扶手", 465, 609, [462, 601, 6, 16]],
      ["chair five-star base", "椅子五星脚", 484, 690, [480, 688, 8, 4]],
      ["meeting-room chair caster", "会议室椅脚轮", 405, 738, [402, 733, 7, 10]],
      ["chair back mesh", "椅背网面", 453, 466, [445, 459, 16, 15]],
      ["chair height column", "椅子升降柱", 521, 663, [518, 656, 6, 14]],
      ["meeting-room chair wheel", "会议室椅轮", 1174, 842, [1169, 837, 10, 10]],
      ["near conference chair", "近侧会议椅", 1060, 706, [1054, 701, 12, 10]],
      ["near chair backrest", "近侧椅背", 1095, 556, [1089, 548, 12, 16]],
      ["near chair armrest", "近侧椅扶手", 992, 633, [984, 630, 16, 6]],
      ["near chair base", "近侧椅底座", 1091, 798, [1086, 795, 11, 6]],
      ["middle conference chair", "中侧会议椅", 650, 423, [644, 416, 13, 14]],
      ["middle chair backrest", "中侧椅背", 674, 450, [669, 444, 10, 13]],
      ["middle chair armrest", "中侧椅扶手", 1060, 526, [1053, 525, 14, 3]],
      ["middle chair caster", "中侧椅脚轮", 1212, 647, [1208, 644, 8, 7]],
      ["far conference chair", "远侧会议椅", 786, 393, [782, 389, 8, 9]],
      ["far chair backrest", "远侧椅背", 798, 409, [790, 398, 15, 20]],
      ["far chair seat", "远侧椅座"],
      ["far chair armrest", "远侧椅扶手", 1110, 455, [1106, 454, 9, 3]],
      ["far chair base", "远侧椅底座"],
      ["chair seat edge", "椅座边缘", 544, 623, [541, 622, 6, 2]],
      ["chair back frame", "椅背框架", 1065, 646, [1063, 642, 4, 8]],
      ["meeting-room chair arm pad", "会议室椅扶手垫", 443, 532, [441, 530, 5, 3]],
    ],
  },
  {
    id: "display-whiteboard",
    title: "Display and whiteboard wall",
    translation: "显示屏与白板墙",
    description: "Inspect the blank wall display, camera, speaker bar, whiteboard, marker tray and wall panels.",
    x: 800,
    y: 150,
    width: 700,
    height: 300,
    labels: [
      ["meeting-room wall display", "会议室墙面显示屏", 1_000, 280, [818, 219, 238, 132]],
      ["meeting display bezel", "会议显示屏边框", 1_063, 285, [1061, 274, 4, 22]],
      ["meeting display mount", "会议显示屏挂架"],
      ["display mount arm", "显示屏挂架支臂"],
      ["display cable", "显示屏电缆"],
      ["conference camera", "会议摄像机", 927, 199, [919, 194, 15, 11]],
      ["meeting camera lens", "会议摄像机镜头", 925, 198, [922, 195, 7, 7]],
      ["camera housing", "摄像机外壳", 932, 200, [930, 197, 4, 6]],
      ["meeting speaker bar", "会议扬声器条", 948, 377, [881, 369, 98, 15]],
      ["speaker bar grille", "扬声器条格栅"],
      ["meeting-room whiteboard", "会议室白板", 1_300, 280],
      ["meeting whiteboard frame", "会议白板框", 1086, 295, [1085, 289, 3, 13]],
      ["meeting whiteboard tray", "会议白板托盘", 1296, 380, [1292, 379, 9, 2]],
      ["marker cup", "白板笔杯", 1327, 369, [1316, 363, 22, 12]],
      ["whiteboard marker", "白板笔", 1328, 355, [1327, 354, 3, 4]],
      ["meeting whiteboard corner", "会议白板转角", 1365, 192, [1364, 191, 3, 3]],
      ["meeting wall acoustic panel", "会议墙吸音板"],
      ["conference wall panel seam", "会议室墙面板接缝", 1263, 165, [1263, 157, 2, 16]],
    ],
  },
  {
    id: "ceiling-light-acoustic",
    title: "Ceiling light and acoustic treatment",
    translation: "顶面照明与吸音设施",
    description: "Trace the edges of the ceiling baffles, follow the pendant cords and locate the circular diffuser.",
    x: 300,
    y: 0,
    width: 1_200,
    height: 220,
    labels: [
      ["conference acoustic ceiling baffle", "会议室顶面吸音板", 1090, 49, [1080, 46, 20, 7]],
      ["baffle edge", "吸音板边缘", 1090, 59, [1088, 59, 4, 1]],
      ["baffle suspension rod", "吸音板吊杆"],
      ["recessed ceiling light", "嵌入式顶灯", 472, 57, [467, 56, 10, 3]],
      ["conference light trim", "会议室灯具饰边"],
      ["conference pendant light", "会议室吊灯", 845, 141, [837, 139, 16, 4]],
      ["conference pendant shade", "会议室吊灯灯罩", 691, 70, [681, 66, 20, 7]],
      ["pendant cord", "吊灯电线", 690, 18, [690, 14, 1, 8]],
      ["conference ceiling panel", "会议室顶面板"],
      ["conference ceiling seam", "会议室顶面接缝"],
      ["meeting HVAC diffuser", "会议室空调扩散器", 943, 28, [941, 27, 4, 2]],
      ["diffuser grille", "扩散器格栅", 918, 22, [916, 22, 4, 1]],
      ["conference spotlight housing", "会议室射灯外壳"],
      ["ceiling cable", "顶面电缆"],
      ["upper wall cove", "上部墙面凹槽"],
      ["ceiling corner", "顶面转角", 682, 145, [681, 144, 3, 3]],
      ["acoustic wall felt", "吸音墙毡"],
    ],
  },
  {
    id: "floor-glass-edges",
    title: "Floor and glass edges",
    translation: "地面与玻璃边缘",
    description: "Find the access cover in the carpet and follow the glass partition to the trim along the floor.",
    x: 0,
    y: 450,
    width: 1_600,
    height: 450,
    labels: [
      ["conference room carpet", "会议室地毯", 1295, 696, [1285, 687, 20, 18]],
      ["conference carpet tile", "会议室地毯块"],
      ["conference carpet seam", "会议室地毯接缝"],
      ["floor access cover", "地面检修盖", 626, 847, [618, 843, 15, 9]],
      ["floor power box", "地面电源盒"],
      ["floor threshold strip", "地面门槛条"],
      ["conference floor expansion joint", "会议室地面伸缩缝"],
      ["conference glass wall", "会议室玻璃墙", 1454, 517, [1447, 511, 14, 13]],
      ["right glass panel", "右侧玻璃板", 1572, 609, [1565, 602, 15, 15]],
      ["glass wall mullion", "玻璃墙竖框", 1534, 596, [1532, 586, 4, 20]],
      ["mullion cap", "竖框端盖"],
      ["wall base trim", "墙根饰条", 1320, 532, [1313, 530, 15, 5]],
      ["conference floor edge trim", "会议室地面边饰条", 1498, 643, [1495, 641, 6, 4]],
      ["carpet border", "地毯边界", 1544, 709, [1543, 709, 2, 2]],
      ["meeting room corner", "会议室转角", 1404, 543, [1403, 542, 3, 3]],
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
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [localIndex, [word, labelTranslation, x, y, bounds]] of zone.labels.entries()) {
      const idSuffix = slug(word);
      const id = `conference-room-${idSuffix}`;
      // Keep the original priority and level of neighbouring words when one
      // term moves to the searchable vocabulary without an image anchor.
      const index = priority++;
      if (x === undefined) {
        relatedWords.push({ id, word, translation: labelTranslation });
        continue;
      }
      const [left, top, width, height] = bounds ?? [Math.max(0, x - 20), Math.max(0, y - 20), 40, 40];
      const region = {
        id: `conference-room-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the conference-room photograph`,
        kind: "part",
        x: left,
        y: top,
        width,
        height,
      };
      labels.push({
        id,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + index / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((index + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(id);
    }
    detailZones.push({
      id: `conference-room-zone-${zone.id}`,
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
    id: "conference-room",
    title: "Conference room",
    translation: "会议室",
    subtitle: "Table, chairs, meeting hardware, display, whiteboard, storage and room finishes",
    asset: "/scenes/conference-room-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "office-building",
    visualRegions: [...visualRegions, videoConsolePortalRegion],
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/conference-room-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "Agents reviewed all seven zones on the 1600 by 900 photograph. Each spatial term points to a visible fixture or part, including the far chair backrest, cabinet handles, floor access cover and whiteboard frame. The searchable related vocabulary includes concealed fittings and device functions that cannot be distinguished from their appearance.",
      previousLabelCount: labels.length + relatedWords.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8 + relatedWords.length,
      removedExamples: ["people", "company identity", "meeting content", "readable screen", "network state", "hidden wiring"],
    },
    labels,
    relatedWords,
    portals: [videoConsolePortal],
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
        // A later reviewer can sign off on the same generated scene in their own words.
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("conference-room source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("conference-room JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`conference-room contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`conference-room term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-conference-room",
  label: "Enter the conference room",
  translation: "进入会议室",
  childSceneId: "conference-room",
  sourceVisualRegion: "portal-conference-room-central-glass-room",
  x: 674,
  y: 487,
  width: 196,
  height: 82,
  enterScale: 3.3,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Meeting table and chair backs inside the central glass enclosure on the ground floor of the office atrium. An agent reviewed this entrance against the atrium image.",
  kind: "object",
  x: parentPortal.x,
  y: parentPortal.y,
  width: parentPortal.width,
  height: parentPortal.height,
};

const parentReviewNote = "The earlier human review covered the atrium vocabulary. An agent reviewed the revised glass meeting-room entrance against the atrium image, identifying the meeting table and chair backs inside the glass and the coffee maker outside it.";

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === parentPortal.id);
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (isDeepStrictEqual(parent.portals[portalIndex], parentPortal)
      && isDeepStrictEqual(parent.visualRegions[regionIndex], parentRegion)) return false;

  if (portalIndex >= 0) parent.portals[portalIndex] = parentPortal;
  else parent.portals.push(parentPortal);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion;
  else parent.visualRegions.push(parentRegion);
  parent.anchorAudit.status = "image-reviewed";
  if (!parent.anchorAudit.rationale.includes(parentReviewNote)) {
    parent.anchorAudit.rationale += ` ${parentReviewNote}`;
  }
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "conference-room")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "office-building");
    if (index < 0) throw new Error("office-building is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "conference-room",
      title: "Conference room",
      parentId: "office-building",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildConferenceRoomScene() {
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
  buildConferenceRoomScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-conference-room-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
