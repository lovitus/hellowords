import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal school-infirmary scene from a reviewed first-aid room
 * photograph. Parent portal and manifest integration remain with the root
 * agent; this script owns only the child scene, assets and term audit.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/school-infirmary-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/school-infirmary-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-infirmary.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "88a6b975fa12ddfa9de99c0d4626d17e6b939ad69d8f441f0f1f88728a7c3b7c";
const PUBLIC_ASSET_SHA256 = "085385245360991ea48a38cc9a14a2082d0f2b3a331c4b400e178711adb47105";

const zones = [
  {
    id: "examination-bed",
    title: "Examination bed",
    translation: "检查床",
    description: "Inspect the visible adjustable bed, pillow, mattress, rails, frame, tray and step stool.",
    x: 100,
    y: 280,
    width: 700,
    height: 620,
    labels: [
      ["examination bed", "检查床", 400, 550],
      ["adjustable bed frame", "可调床架", 400, 700],
      ["bed mattress", "床垫", 400, 480],
      ["bed pillow", "枕头", 250, 420],
      ["bed pillowcase", "枕套", 250, 400],
      ["examination sheet", "床单", 400, 520],
      ["examination headboard", "床头板", 650, 500],
      ["examination footboard", "床尾板", 650, 650],
      ["examination side rail", "床侧护栏", 500, 600],
      ["side rail latch", "护栏锁扣", 500, 620],
      ["side rail hinge", "护栏铰链", 520, 650],
      ["examination frame", "床架", 400, 720],
      ["bed caster", "床脚轮", 650, 760],
      ["bed caster brake", "脚轮刹车", 650, 780],
      ["bed wheel", "床轮", 700, 800],
      ["bed control handset", "床控手柄", 600, 550],
      ["bed control cable", "床控电缆", 610, 580],
      ["examination mattress seam", "床垫接缝", 400, 500],
      ["mattress corner", "床垫转角", 600, 500],
      ["footboard handle", "床尾板把手", 650, 620],
      ["bed underframe", "床下框架", 450, 800],
      ["bed lifting column", "床升降柱", 500, 760],
      ["bed tray", "床上托盘", 700, 450],
      ["bed tray support", "托盘支撑", 700, 470],
      ["examination step stool", "检查踏凳", 250, 800],
      ["stool tread", "踏凳踏面", 250, 780],
    ],
  },
  {
    id: "privacy-window",
    title: "Privacy and window area",
    translation: "隐私与窗边区域",
    description: "Trace the visible privacy curtain, ceiling track, window, blinds, radiator and wall rails.",
    x: 0,
    y: 0,
    width: 500,
    height: 700,
    labels: [
      ["bed privacy curtain", "隐私帘", 100, 300],
      ["privacy curtain track", "隐私帘轨道", 250, 70],
      ["track carrier", "帘轨滑轮", 260, 80],
      ["curtain hook", "帘钩", 150, 300],
      ["privacy curtain hem", "帘子下摆", 120, 650],
      ["blue privacy curtain", "蓝色隐私帘", 100, 400],
      ["curtain divider", "帘子隔断", 180, 350],
      ["infirmary window", "医务室窗户", 300, 180],
      ["infirmary window frame", "医务室窗框", 300, 180],
      ["infirmary window sill", "医务室窗台", 300, 340],
      ["infirmary window blind", "医务室窗百叶", 300, 100],
      ["infirmary blind slat", "医务室百叶片", 300, 120],
      ["infirmary blind rail", "医务室百叶导轨", 300, 80],
      ["infirmary blind cord", "百叶绳", 340, 220],
      ["infirmary window latch", "窗锁扣", 350, 220],
      ["infirmary radiator", "医务室暖气片", 300, 400],
      ["infirmary radiator grille", "医务室暖气片格栅", 300, 420],
      ["infirmary radiator valve", "医务室暖气片阀门", 350, 450],
      ["infirmary privacy screen", "隐私屏", 450, 350],
      ["medical wall rail", "医疗墙面导轨", 300, 250],
      ["wall supply rail", "墙面用品导轨", 350, 250],
      ["infirmary wall outlet", "医务室墙面插座", 400, 250],
      ["outlet cover", "插座盖", 420, 250],
      ["infirmary room wall panel", "医务室墙面板", 450, 200],
      ["infirmary wall panel seam", "医务室墙面接缝", 450, 240],
    ],
  },
  {
    id: "nurse-workstation",
    title: "Nurse workstation",
    translation: "护士工作台",
    description: "Inspect the visible desk, chair, blank monitor, keyboard, trays, chart rack and desk hardware.",
    x: 400,
    y: 280,
    width: 450,
    height: 370,
    labels: [
      ["nurse desk", "护士桌", 550, 450],
      ["nurse desk worktop", "桌面", 550, 400],
      ["workstation drawer", "工作台抽屉", 600, 540],
      ["workstation drawer handle", "工作台抽屉把手", 600, 550],
      ["nurse chair", "护士椅", 750, 430],
      ["nurse chair backrest", "护士椅背", 750, 390],
      ["nurse chair seat", "护士椅座", 750, 470],
      ["nurse chair caster", "护士椅脚轮", 750, 600],
      ["blank medical monitor", "空白医疗显示器", 550, 340],
      ["medical monitor bezel", "医疗显示器边框", 550, 340],
      ["medical monitor stand", "医疗显示器支架", 550, 400],
      ["nurse keyboard", "护士键盘", 580, 440],
      ["nurse mouse", "护士鼠标", 650, 440],
      ["nurse document tray", "护士文件托盘", 700, 400],
      ["nurse desk organizer", "桌面收纳架", 700, 450],
      ["nurse pen cup", "护士笔筒", 730, 450],
      ["blank chart folder", "空白病历夹", 720, 500],
      ["chart rack", "病历架", 730, 520],
      ["desk power strip", "桌面排插", 500, 480],
      ["nurse desk cable", "护士桌电缆", 500, 520],
      ["workstation foot", "工作台脚座", 550, 600],
      ["nurse desk lower panel", "桌下板", 550, 550],
      ["chart divider", "病历分隔片", 750, 520],
      ["desk side cabinet", "桌侧柜", 650, 560],
      ["desk side panel", "桌侧板", 650, 580],
    ],
  },
  {
    id: "treatment-cart-supplies",
    title: "Treatment cart and first-aid supplies",
    translation: "治疗推车与急救用品",
    description: "Compare the visible treatment cart, shelves, drawers, wheels, trays and blank first-aid tools.",
    x: 700,
    y: 400,
    width: 400,
    height: 500,
    labels: [
      ["treatment cart", "治疗推车", 850, 600],
      ["cart top shelf", "推车上层架", 850, 500],
      ["cart middle shelf", "推车中层架", 850, 650],
      ["cart lower shelf", "推车下层架", 850, 760],
      ["cart drawer", "推车抽屉", 850, 570],
      ["cart drawer handle", "推车抽屉把手", 850, 580],
      ["treatment cart side rail", "推车侧栏", 800, 550],
      ["cart push handle", "推车推手", 800, 500],
      ["treatment cart caster", "推车脚轮", 800, 820],
      ["treatment cart wheel", "推车轮", 820, 820],
      ["treatment cart brake", "推车刹车", 840, 830],
      ["first-aid supply tray", "急救用品托盘", 900, 500],
      ["blue supply tray", "蓝色用品托盘", 900, 520],
      ["white supply tray", "白色用品托盘", 980, 520],
      ["bandage roll", "绷带卷", 900, 480],
      ["sterile gauze pack", "无菌纱布包", 950, 480],
      ["medical tape roll", "医用胶带卷", 1_000, 480],
      ["instant ice pack", "即冷冰袋", 900, 680],
      ["treatment glove box", "手套盒", 980, 680],
      ["disposable glove", "一次性手套", 1_000, 700],
      ["eye-wash bottle", "洗眼瓶", 970, 450],
      ["infirmary clinical thermometer", "体温计", 1_020, 450],
      ["infirmary blood-pressure cuff", "血压袖带", 820, 460],
      ["infirmary pressure gauge", "压力表", 860, 460],
      ["infirmary stethoscope", "听诊器", 900, 450],
      ["cart bottle rack", "推车瓶架", 950, 550],
    ],
  },
  {
    id: "medical-storage-sink",
    title: "Medical storage and sink",
    translation: "医疗储物与洗手池",
    description: "Inspect the visible lockable cabinet, medicine refrigerator, generic packages, sink and wall fixtures.",
    x: 1_100,
    y: 0,
    width: 500,
    height: 900,
    labels: [
      ["lockable medicine cabinet", "可锁药品柜", 1_300, 250],
      ["medicine cabinet glass door", "柜体玻璃门", 1_300, 250],
      ["medicine cabinet handle", "药品柜把手", 1_330, 320],
      ["medicine cabinet hinge", "药品柜铰链", 1_200, 300],
      ["medicine cabinet lock", "药品柜锁", 1_300, 350],
      ["medicine cabinet shelf", "药品柜搁板", 1_300, 420],
      ["medicine shelf clip", "药品层架卡扣", 1_350, 420],
      ["school medicine refrigerator", "学校药品冰箱", 1_400, 550],
      ["medicine refrigerator glass door", "冰箱玻璃门", 1_400, 450],
      ["medicine refrigerator door handle", "冰箱门把手", 1_250, 450],
      ["medicine refrigerator door gasket", "冰箱门密封条", 1_250, 520],
      ["medicine refrigerator shelf", "冰箱搁板", 1_400, 400],
      ["medicine refrigerator shelf rail", "冰箱搁板导轨", 1_400, 400],
      ["medicine refrigerator LED strip", "冰箱 LED 灯带", 1_400, 180],
      ["refrigerator bottom vent", "冰箱底部通风口", 1_400, 750],
      ["refrigerator base", "冰箱底座", 1_400, 800],
      ["blank medicine carton", "空白药品纸盒", 1_200, 300],
      ["plain medicine bottle", "无标记药瓶", 1_350, 330],
      ["blue medicine box", "蓝色药品盒", 1_200, 450],
      ["white medicine box", "白色药品盒", 1_300, 450],
      ["medication storage bin", "药品储物箱", 1_250, 700],
      ["refrigerated supply box", "冷藏用品盒", 1_350, 650],
      ["clinical sink", "临床洗手池", 1_480, 500],
      ["clinical sink basin", "临床洗手盆", 1_480, 540],
      ["clinical sink faucet", "临床水龙头", 1_500, 430],
      ["clinical sink spout", "临床出水口", 1_500, 460],
      ["clinical sink handle", "临床水龙头把手", 1_520, 470],
      ["clinical sink drainer", "洗手池沥水板", 1_420, 520],
      ["clinical sink splashback", "洗手池挡水板", 1_450, 380],
    ],
  },
  {
    id: "mobility-room-fixtures",
    title: "Mobility aids and room fixtures",
    translation: "行动辅助器具与房间设施",
    description: "Trace the visible wheelchair, crutches, apron, waste bins, sharps container, vent and light.",
    x: 850,
    y: 0,
    width: 750,
    height: 900,
    labels: [
      ["infirmary wheelchair", "轮椅", 1_150, 560],
      ["wheelchair seat", "轮椅座椅", 1_150, 520],
      ["wheelchair backrest", "轮椅椅背", 1_150, 450],
      ["infirmary wheelchair armrest", "轮椅扶手", 1_100, 500],
      ["wheelchair footrest", "轮椅脚踏", 1_160, 650],
      ["infirmary wheelchair wheel", "轮椅大轮", 1_200, 680],
      ["wheelchair handrim", "轮椅手圈", 1_200, 650],
      ["wheelchair caster", "轮椅脚轮", 1_100, 700],
      ["crutch", "拐杖", 1_050, 350],
      ["crutch pad", "拐杖垫", 1_050, 300],
      ["crutch tip", "拐杖脚帽", 1_050, 500],
      ["crutch cuff", "拐杖腋托", 1_050, 320],
      ["PPE apron", "防护围裙", 1_200, 300],
      ["infirmary apron hook", "围裙挂钩", 1_200, 220],
      ["clinical waste bin", "临床废物箱", 1_500, 760],
      ["yellow waste bin", "黄色废物箱", 1_550, 760],
      ["waste lid", "废物箱盖", 1_500, 700],
      ["infirmary sharps container", "锐器盒", 1_450, 650],
      ["infirmary floor drain cover", "地漏盖", 1_200, 840],
      ["infirmary ventilation grille", "医务室通风格栅", 1_400, 70],
      ["infirmary ceiling light", "医务室顶灯", 1_100, 40],
      ["room door trim", "房门饰条", 1_000, 250],
      ["room floor trim", "房间地面饰条", 1_300, 850],
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
        id: `school-infirmary-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the school infirmary photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `school-infirmary-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`school-infirmary-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `school-infirmary-zone-${zone.id}`,
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
    id: "school-infirmary",
    title: "School infirmary",
    translation: "学校医务室",
    subtitle: "Examination bed, first-aid tools, nurse desk, storage, sink, mobility aids and room fixtures",
    asset: "/scenes/school-infirmary-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-infirmary-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 school-infirmary photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable bed, privacy, workstation, treatment-cart, storage, sink, mobility-aid and room-fixture parts. Patient identity, illness, diagnosis, treatment outcome, dosage, staff identity, readable packaging and hidden clinical systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["patient identity", "illness", "diagnosis", "treatment outcome", "dosage", "hidden clinical system"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("school infirmary source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("school infirmary JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`school-infirmary contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`school-infirmary term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-school-infirmary",
  label: "Enter the school infirmary",
  translation: "进入学校医务室",
  childSceneId: "school-infirmary",
  sourceVisualRegion: "portal-school-infirmary",
  x: 0,
  y: 545,
  width: 382,
  height: 220,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete infirmary visible in the lower-left school wing",
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
  if (!manifest.scenes.some(({ id }) => id === "school-infirmary")) {
    const gymIndex = manifest.scenes.findIndex(({ id }) => id === "school-gymnasium-equipment");
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "school-campus");
    if (parentIndex < 0) throw new Error("school-campus is missing from the scene manifest");
    manifest.scenes.splice(gymIndex >= 0 ? gymIndex + 1 : parentIndex + 1, 0, {
      id: "school-infirmary",
      title: "School infirmary",
      parentId: "school-campus",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSchoolInfirmaryScene() {
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
  buildSchoolInfirmaryScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-infirmary-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
