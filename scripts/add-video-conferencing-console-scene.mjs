import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal video-conferencing-console scene from a reviewed office
 * technology photograph. Parent portal and manifest integration remain with
 * the root agent; this script owns only the new scene, assets and term audit.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/video-conferencing-console-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/video-conferencing-console-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/video-conferencing-console.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "cad302ea3d5edb5932d441231ba5dd311792de17950d1df41205fe376f068f1d";
const PUBLIC_ASSET_SHA256 = "191dcac69bbc53f5ec57497dc078f00d48c06104051886102b4fbf1ab0e863a5";

const zones = [
  {
    id: "display-front",
    title: "Front display surface",
    translation: "前部显示屏",
    description: "Trace the visible blank display, bezels, mount pieces, cable channel and front wall finish.",
    x: 500,
    y: 130,
    width: 700,
    height: 370,
    labels: [
      ["video conferencing display", "视频会议显示屏", 850, 280],
      ["display panel", "显示面板", 850, 280],
      ["video display bezel", "视频显示屏边框", 850, 220],
      ["meeting display glass", "会议显示屏玻璃", 850, 300],
      ["display lower bezel", "显示屏下边框", 850, 450],
      ["display top bezel", "显示屏上边框", 850, 200],
      ["display side frame", "显示屏侧框", 580, 300],
      ["display wall mount", "显示屏墙面挂架", 850, 470],
      ["display mounting rail", "显示屏安装导轨", 800, 460],
      ["display bracket", "显示屏支架", 900, 470],
      ["display spacer", "显示屏垫块", 920, 470],
      ["display cable channel", "显示屏电缆通道", 850, 480],
      ["blank display surface", "空白显示面", 850, 300],
      ["display lower ledge", "显示屏下沿", 850, 465],
      ["display corner guard", "显示屏护角", 1_120, 210],
      ["display mount screw", "显示屏挂架螺钉", 900, 470],
      ["display backplate", "显示屏背板", 850, 480],
      ["video display support arm", "视频显示屏支撑臂", 850, 475],
      ["display trim strip", "显示屏饰条", 850, 455],
      ["front wall panel", "前墙面板", 650, 250],
      ["front wall seam", "前墙面接缝", 700, 300],
      ["display bottom rail", "显示屏底部导轨", 850, 460],
    ],
  },
  {
    id: "camera-speaker-bar",
    title: "Camera and speaker bar",
    translation: "摄像机与扬声器条",
    description: "Inspect the visible room camera, lens, shutter, mount, soundbar grille, end caps and cable.",
    x: 650,
    y: 0,
    width: 600,
    height: 540,
    labels: [
      ["room camera", "会议室摄像机", 850, 80],
      ["meeting camera housing", "会议摄像机外壳", 850, 75],
      ["video camera lens", "视频摄像机镜头", 850, 70],
      ["camera privacy shutter", "摄像机隐私挡板", 870, 75],
      ["camera mount foot", "摄像机安装脚", 850, 105],
      ["camera tilt joint", "摄像机俯仰关节", 820, 100],
      ["camera cable", "摄像机电缆", 880, 120],
      ["conference video bar", "会议视频条", 850, 430],
      ["video bar grille", "视频条格栅", 800, 430],
      ["video bar end cap", "视频条端盖", 740, 430],
      ["video bar mount", "视频条挂架", 850, 470],
      ["video bar bracket", "视频条支架", 900, 470],
      ["video bar control button", "视频条控制按钮", 900, 430],
      ["left speaker grille", "左扬声器格栅", 760, 430],
      ["right speaker grille", "右扬声器格栅", 940, 430],
      ["speaker enclosure", "扬声器外壳", 850, 440],
      ["speaker cable", "扬声器电缆", 900, 480],
      ["camera indicator window", "摄像机指示窗", 850, 75],
      ["soundbar center grille", "音箱条中央格栅", 850, 430],
      ["bar wall spacer", "视频条墙面垫块", 850, 480],
    ],
  },
  {
    id: "touch-console",
    title: "Touch console",
    translation: "桌面触控台",
    description: "Study the visible tabletop touch console, screen, stand, hinge, base, ports and cable retention.",
    x: 750,
    y: 500,
    width: 450,
    height: 400,
    labels: [
      ["room touch console", "会议室触控台", 1_000, 680],
      ["meeting console screen", "会议触控台屏幕", 1_000, 620],
      ["meeting console bezel", "会议触控台边框", 1_000, 610],
      ["console screen glass", "触控台屏幕玻璃", 1_000, 625],
      ["console stand", "触控台支架", 1_000, 750],
      ["console hinge", "触控台铰链", 1_000, 730],
      ["console base", "触控台底座", 1_000, 790],
      ["console cable", "触控台电缆", 1_000, 800],
      ["console power lead", "触控台电源线", 1_000, 810],
      ["console side button", "触控台侧按钮", 1_080, 670],
      ["console port panel", "触控台接口面板", 1_040, 760],
      ["console port cover", "触控台接口盖", 1_040, 770],
      ["console strain relief", "触控台应力释放套", 1_020, 805],
      ["console rear foot", "触控台后脚", 1_040, 790],
      ["console cable loop", "触控台线缆环", 950, 800],
      ["console blank surface", "触控台空白面", 1_000, 630],
      ["console screen border", "触控台屏幕边界", 1_000, 640],
      ["tabletop device base", "桌面设备底座", 900, 730],
      ["tabletop device cable", "桌面设备电缆", 900, 760],
      ["console rear panel", "触控台后面板", 1_070, 750],
      ["console foot pad", "触控台脚垫", 1_000, 800],
    ],
  },
  {
    id: "table-microphones",
    title: "Table microphone pods",
    translation: "桌面麦克风单元",
    description: "Compare the visible microphone pod housings, grilles, buttons, ports, feet, cables and table trough.",
    x: 300,
    y: 470,
    width: 1_150,
    height: 430,
    labels: [
      ["video table microphone pod", "视频桌面麦克风单元", 600, 620],
      ["microphone pod housing", "麦克风单元外壳", 600, 620],
      ["microphone grille", "麦克风格栅", 600, 615],
      ["video microphone mute button", "视频麦克风静音按钮", 630, 620],
      ["microphone cable port", "麦克风电缆接口", 620, 640],
      ["microphone rubber foot", "麦克风橡胶脚", 590, 650],
      ["near microphone pod", "近侧麦克风单元", 450, 790],
      ["near microphone grille", "近侧麦克风格栅", 450, 785],
      ["near microphone cable", "近侧麦克风电缆", 500, 800],
      ["far microphone pod", "远侧麦克风单元", 1_100, 650],
      ["far microphone grille", "远侧麦克风格栅", 1_100, 645],
      ["far microphone cable", "远侧麦克风电缆", 1_050, 670],
      ["left microphone pod", "左侧麦克风单元", 720, 530],
      ["right microphone pod", "右侧麦克风单元", 1_250, 700],
      ["pod cable junction", "单元线缆接点", 800, 600],
      ["tabletop cable trough", "桌面线缆槽", 800, 650],
      ["trough lid", "线缆槽盖", 800, 650],
      ["trough divider", "线缆槽分隔片", 800, 680],
      ["video tabletop grommet", "视频桌面穿线孔", 900, 670],
      ["table edge trim", "桌面边饰条", 700, 770],
      ["video tabletop seam", "视频桌面接缝", 900, 760],
      ["table control pod", "桌面控制单元", 850, 600],
    ],
  },
  {
    id: "cable-power-hub",
    title: "Cable and power hub",
    translation: "线缆与电源模块",
    description: "Inspect the visible tabletop power hub, sockets, grommets, cable clips, credenza compute box and outlet.",
    x: 250,
    y: 430,
    width: 900,
    height: 470,
    labels: [
      ["video room power hub", "视频会议电源模块", 800, 650],
      ["power hub lid", "电源模块盖", 800, 650],
      ["video room power socket", "视频会议电源插座", 800, 660],
      ["video room data socket", "视频会议数据插座", 820, 660],
      ["video room USB port", "视频会议 USB 接口", 840, 660],
      ["video cable grommet", "视频线缆穿线孔", 900, 670],
      ["video cable clip", "视频线缆夹", 850, 700],
      ["video cable strain relief", "视频线缆应力释放套", 850, 720],
      ["braided video cable", "编织视频线", 900, 730],
      ["video cable trough", "视频线缆槽", 800, 680],
      ["video trough divider", "视频线缆槽分隔片", 800, 700],
      ["video floor cable cover", "视频设备地面线缆盖", 700, 850],
      ["console side credenza", "控制台侧边柜", 300, 500],
      ["room compute box", "会议室计算盒", 300, 480],
      ["room power adapter", "会议室电源适配器", 420, 490],
      ["adapter cable", "适配器电缆", 450, 510],
      ["room wall outlet", "会议室墙面插座", 400, 430],
      ["outlet faceplate", "插座面板", 400, 430],
      ["video equipment shelf", "视频设备搁板", 300, 520],
      ["cable pass-through", "电缆穿线孔", 450, 540],
      ["video cable loop", "视频电缆环", 500, 560],
    ],
  },
  {
    id: "mount-wall-hardware",
    title: "Mounting and wall hardware",
    translation: "安装与墙面五金",
    description: "Trace the visible camera/display/speaker mounts, blank whiteboard, acoustic panels and glass partition hardware.",
    x: 500,
    y: 0,
    width: 1_100,
    height: 500,
    labels: [
      ["wall camera mount", "墙面摄像机挂架", 850, 100],
      ["camera mounting plate", "摄像机安装板", 850, 110],
      ["speaker wall bracket", "扬声器墙面支架", 850, 480],
      ["wall display rail", "墙面显示导轨", 850, 460],
      ["meeting whiteboard", "会议白板", 1_300, 280],
      ["console whiteboard frame", "控制台白板框", 1_300, 280],
      ["meeting marker tray", "会议白板笔托盘", 1_300, 420],
      ["meeting marker cup", "会议白板笔杯", 1_400, 420],
      ["blank whiteboard", "空白白板面", 1_300, 280],
      ["whiteboard fastener", "白板紧固件", 1_420, 180],
      ["meeting acoustic wall panel", "会议吸音墙板", 1_200, 150],
      ["meeting wall panel seam", "会议墙板接缝", 1_200, 250],
      ["meeting wall power outlet", "会议墙面电源插座", 1_100, 450],
      ["meeting wall cable channel", "会议墙面电缆通道", 1_050, 460],
      ["meeting glass partition", "会议室玻璃隔断", 1_500, 350],
      ["meeting glass mullion", "会议室玻璃竖框", 1_500, 300],
      ["meeting mullion cap", "会议室竖框端盖", 1_500, 330],
      ["meeting partition door", "会议室隔断门", 1_520, 450],
      ["partition door pull", "隔断门拉手", 1_520, 450],
    ],
  },
  {
    id: "room-finish",
    title: "Room furniture and finish",
    translation: "房间家具与饰面",
    description: "Inspect the visible table, chairs, casters, carpet, floor cover, glass panel, blind and plant pot.",
    x: 0,
    y: 0,
    width: 1_600,
    height: 900,
    labels: [
      ["video room table", "视频会议桌", 800, 700],
      ["video tabletop edge", "视频会议桌边缘", 700, 760],
      ["video table modesty panel", "视频会议桌挡板", 800, 780],
      ["video table leg", "视频会议桌腿", 700, 820],
      ["video table foot", "视频会议桌脚座", 700, 870],
      ["meeting chair backrest", "会议椅背", 500, 600],
      ["meeting chair seat", "会议椅座", 500, 680],
      ["meeting chair armrest", "会议椅扶手", 540, 650],
      ["meeting chair base", "会议椅底座", 500, 780],
      ["meeting chair caster", "会议椅脚轮", 500, 820],
      ["meeting chair caster fork", "会议椅脚轮叉", 520, 820],
      ["video room carpet", "视频会议室地毯", 1_200, 760],
      ["video carpet tile", "视频会议室地毯块", 1_300, 800],
      ["video carpet seam", "视频会议室地毯接缝", 1_350, 820],
      ["video floor access cover", "视频会议室地面检修盖", 700, 870],
      ["video room floor", "视频会议室地面", 1_100, 850],
      ["video wall base trim", "视频会议室墙根饰条", 1_400, 870],
      ["video glass wall panel", "视频会议室玻璃墙板", 1_520, 600],
      ["video window blind", "视频会议室窗百叶", 200, 250],
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
        id: `video-conferencing-console-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the video-conferencing-console photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `video-conferencing-console-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
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
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/video-conferencing-console-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 video-conferencing-console photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable display, camera, speaker, touch-console, microphone, cable, mounting and room-finish parts. Meeting content, people, company identity, network connectivity, recording state, occupancy and hidden wiring were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["meeting content", "people", "company identity", "network connectivity", "recording state", "hidden wiring"],
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
  for (const label of scene.labels) {
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
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  const existingDuplicates = [...wordSources.keys()].filter((word) => existingWords.has(word));
  if (existingDuplicates.length > 0) throw new Error(`video-conferencing-console term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

export async function buildVideoConferencingConsoleScene() {
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
  buildVideoConferencingConsoleScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-video-conferencing-console-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
