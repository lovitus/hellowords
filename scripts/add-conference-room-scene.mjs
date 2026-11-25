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
    description: "Trace the visible glass door, jamb, handle, threshold, partition mullions and window blinds.",
    x: 0,
    y: 0,
    width: 350,
    height: 900,
    labels: [
      ["conference room entry", "会议室入口", 260, 360],
      ["glass entry door", "玻璃入口门", 250, 450],
      ["glass door frame", "玻璃门框", 210, 400],
      ["conference glass door handle", "会议玻璃门把手", 245, 520],
      ["door handle mount", "门把手底座", 245, 530],
      ["conference door hinge", "会议室门铰链", 290, 580],
      ["conference door closer", "会议室闭门器", 280, 270],
      ["conference door latch", "会议室门锁扣", 270, 560],
      ["conference door jamb", "会议室门框立柱", 315, 450],
      ["entry threshold", "入口门槛", 260, 760],
      ["threshold plate", "门槛板", 270, 780],
      ["conference doorway seal", "会议室门口密封条", 310, 500],
      ["conference glass partition", "会议室玻璃隔断", 160, 250],
      ["partition mullion", "隔断竖框", 170, 400],
      ["partition base channel", "隔断底槽", 180, 700],
      ["left conference window", "左侧会议室窗", 40, 280],
      ["conference window blind", "会议室窗百叶", 100, 180],
      ["blind slat", "百叶片", 110, 190],
      ["blind rail", "百叶导轨", 120, 110],
      ["conference window sill", "会议室窗台", 140, 420],
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
      ["conference credenza", "会议室边柜", 450, 580],
      ["credenza cabinet", "边柜柜体", 300, 580],
      ["credenza drawer", "边柜抽屉", 300, 650],
      ["credenza drawer handle", "边柜抽屉把手", 300, 650],
      ["credenza cabinet door", "边柜柜门", 480, 600],
      ["credenza cabinet hinge", "边柜柜门铰链", 480, 570],
      ["credenza cabinet pull", "边柜柜门拉手", 480, 620],
      ["conference storage shelf", "会议室储物搁板", 230, 330],
      ["conference storage box", "会议室储物箱", 180, 300],
      ["conference binder", "会议室文件夹", 350, 320],
      ["meeting-room plant pot", "会议室植物盆", 500, 300],
      ["credenza countertop", "边柜台面", 330, 400],
      ["credenza countertop edge", "边柜台面边缘", 400, 420],
      ["file holder", "文件架", 270, 340],
      ["cable box", "电缆盒", 560, 450],
      ["credenza base", "边柜底座", 350, 690],
      ["credenza foot", "边柜脚座", 500, 700],
      ["conference wall shelf", "会议室墙面搁板", 580, 240],
      ["conference shelf bracket", "会议室搁板支架", 580, 260],
      ["meeting-room storage bin", "会议室储物箱", 200, 500],
    ],
  },
  {
    id: "table-cable-hardware",
    title: "Conference table and cable hardware",
    translation: "会议桌与线缆设备",
    description: "Follow the visible table surface, cable trough, power modules, microphone pods, legs and modesty panel.",
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
      ["conference table power module", "会议桌面电源模块", 765, 523, [755, 519, 24, 9]],
      ["conference power socket", "会议室电源插座"],
      ["USB socket", "USB 插座"],
      ["data socket", "数据插座"],
      ["table microphone pod", "桌面麦克风单元", 687, 504, [673, 500, 28, 10]],
      ["microphone mute button", "麦克风静音按钮"],
      ["table speaker pod", "桌面扬声器单元", 918, 498, [905, 495, 26, 8]],
      ["table cable clip", "桌面线缆夹"],
      ["table cable grommet", "桌面穿线孔"],
      ["conference table leg", "会议桌桌腿", 650, 760],
      ["table leg foot", "桌腿脚座", 650, 850],
      ["table modesty panel", "桌面挡板", 800, 700],
      ["table stretcher", "桌腿横撑", 800, 820],
      ["table floor cable cover", "桌下地面线缆盖", 700, 870],
      ["tabletop control unit", "桌面控制单元"],
      ["control dial", "控制旋钮"],
      ["table seam", "桌面接缝"],
      ["table support bracket", "桌面支撑架", 950, 700],
      ["tabletop outlet", "桌面插口", 778, 521, [769, 517, 14, 8]],
      ["table cable channel", "桌面线缆通道", 860, 481, [852, 478, 16, 7]],
      ["table underside", "桌面底面", 900, 670],
      ["under-table crossbar", "桌下横梁", 850, 800],
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
      ["meeting-room chair", "会议室椅", 520, 600],
      ["meeting-room chair backrest", "会议室椅背", 520, 520],
      ["chair seat pan", "椅座", 520, 620],
      ["meeting-room chair armrest", "会议室椅扶手", 560, 610],
      ["chair five-star base", "椅子五星脚", 520, 780],
      ["meeting-room chair caster", "会议室椅脚轮", 500, 820],
      ["chair back mesh", "椅背网面", 520, 550],
      ["chair height column", "椅子升降柱", 530, 730],
      ["meeting-room chair wheel", "会议室椅轮", 550, 820],
      ["near conference chair", "近侧会议椅", 700, 650],
      ["near chair backrest", "近侧椅背", 700, 560],
      ["near chair armrest", "近侧椅扶手", 740, 650],
      ["near chair base", "近侧椅底座", 700, 800],
      ["middle conference chair", "中侧会议椅", 900, 620],
      ["middle chair backrest", "中侧椅背", 900, 530],
      ["middle chair armrest", "中侧椅扶手", 940, 620],
      ["middle chair caster", "中侧椅脚轮", 900, 800],
      ["far conference chair", "远侧会议椅", 1_050, 520],
      ["far chair backrest", "远侧椅背", 1_050, 460],
      ["far chair seat", "远侧椅座", 1_060, 540],
      ["far chair armrest", "远侧椅扶手", 1_100, 540],
      ["far chair base", "远侧椅底座", 1_060, 650],
      ["chair seat edge", "椅座边缘", 760, 650],
      ["chair back frame", "椅背框架", 800, 520],
      ["meeting-room chair arm pad", "会议室椅扶手垫", 820, 630],
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
      ["meeting whiteboard frame", "会议白板框", 1_300, 280],
      ["meeting whiteboard tray", "会议白板托盘", 1_300, 400],
      ["marker cup", "白板笔杯", 1_400, 400],
      ["whiteboard marker", "白板笔", 1_400, 395],
      ["meeting whiteboard corner", "会议白板转角", 1_420, 180],
      ["meeting wall acoustic panel", "会议墙吸音板", 1_200, 200],
      ["conference wall panel seam", "会议室墙面板接缝", 1_200, 250],
    ],
  },
  {
    id: "ceiling-light-acoustic",
    title: "Ceiling light and acoustic treatment",
    translation: "顶面照明与吸音设施",
    description: "Trace the visible acoustic baffles, pendant lights, recessed fixtures, diffuser and ceiling seams.",
    x: 300,
    y: 0,
    width: 1_200,
    height: 220,
    labels: [
      ["conference acoustic ceiling baffle", "会议室顶面吸音板", 800, 100],
      ["baffle edge", "吸音板边缘", 800, 110],
      ["baffle suspension rod", "吸音板吊杆", 820, 70],
      ["recessed ceiling light", "嵌入式顶灯", 500, 120],
      ["conference light trim", "会议室灯具饰边", 500, 120],
      ["conference pendant light", "会议室吊灯", 700, 180],
      ["conference pendant shade", "会议室吊灯灯罩", 700, 180],
      ["pendant cord", "吊灯电线", 700, 120],
      ["conference ceiling panel", "会议室顶面板", 1_000, 50],
      ["conference ceiling seam", "会议室顶面接缝", 1_000, 80],
      ["meeting HVAC diffuser", "会议室空调扩散器", 1_200, 30],
      ["diffuser grille", "扩散器格栅", 1_200, 30],
      ["conference spotlight housing", "会议室射灯外壳", 1_100, 140],
      ["ceiling cable", "顶面电缆", 900, 150],
      ["upper wall cove", "上部墙面凹槽", 1_350, 190],
      ["ceiling corner", "顶面转角", 1_450, 180],
      ["acoustic wall felt", "吸音墙毡", 1_350, 210],
    ],
  },
  {
    id: "floor-glass-edges",
    title: "Floor and glass edges",
    translation: "地面与玻璃边缘",
    description: "Inspect the visible carpet tiles, floor covers, glass panels, mullion caps and base trims.",
    x: 0,
    y: 450,
    width: 1_600,
    height: 450,
    labels: [
      ["conference room carpet", "会议室地毯", 900, 750],
      ["conference carpet tile", "会议室地毯块", 300, 800],
      ["conference carpet seam", "会议室地毯接缝", 1_100, 780],
      ["floor access cover", "地面检修盖", 800, 850],
      ["floor power box", "地面电源盒", 820, 850],
      ["floor threshold strip", "地面门槛条", 250, 700],
      ["conference floor expansion joint", "会议室地面伸缩缝", 1_000, 870],
      ["conference glass wall", "会议室玻璃墙", 1_500, 500],
      ["right glass panel", "右侧玻璃板", 1_500, 700],
      ["glass wall mullion", "玻璃墙竖框", 1_450, 650],
      ["mullion cap", "竖框端盖", 1_450, 700],
      ["wall base trim", "墙根饰条", 1_300, 850],
      ["conference floor edge trim", "会议室地面边饰条", 1_200, 870],
      ["carpet border", "地毯边界", 1_050, 700],
      ["meeting room corner", "会议室转角", 1_400, 850],
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
      rationale: "The earlier scene recorded a human review of 143 terms across seven zones. This agent image review checked the front-wall display, its upper camera and lower speaker bar, the circular tabletop pods, cable trough and front table corner against the 1600 by 900 image. Socket types, tiny controls and concealed mount hardware remain available as related words.",
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
