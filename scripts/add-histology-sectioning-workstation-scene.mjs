import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Build a terminal, pixel-audited microtomy workstation scene and optionally
 * connect it to the visible right-side sectioning equipment in pathology-lab.
 */
const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(projectRoot, "scripts/assets/histology-sectioning-workstation-v1.png");
const assetPath = resolve(projectRoot, "public/scenes/histology-sectioning-workstation-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/histology-sectioning-workstation.json");
const parentPath = resolve(projectRoot, "public/data/scenes/pathology-lab.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "e9c6440be9f18776133303b5e89269b74282f5e740f7d90e9b128e5bde4753cb";
const ASSET_SHA256 = "6d844355b38d760d56534ebd950bc2cff5f32e606f244005e5ffacf11a824292";
const OVERVIEW_LABELS = new Set([
  "Rotary microtome",
  "Rotary handwheel",
  "Section catch tray",
  "Slide water bath",
  "Sectioning tools",
  "Cassette basket",
]);

// Coordinates are on the final 1600x900 image after a human pixel review.
// Zone bounds may overlap; each anchor is still assigned to one visible object.
const zones = [
  {
    id: "microtome-body-and-handwheel",
    title: "Microtome body and handwheel",
    translation: "切片机机身与手轮",
    description: "Inspect the visible rotary microtome casing, upper fittings and handwheel.",
    x: 630, y: 0, width: 760, height: 535, targetScale: 2.45,
    labels: [
      ["Rotary microtome", "旋转式切片机", 835, 270],
      ["Microtome main housing", "切片机主体外壳", 700, 170, 1],
      ["Microtome upper cover", "切片机上盖", 816, 82],
      ["Microtome top surface", "切片机顶面", 921, 57],
      ["Microtome front casing", "切片机前壳", 760, 395],
      ["Microtome side casing", "切片机侧壳", 991, 352],
      ["Microtome curved housing", "切片机弧形外壳", 1042, 346],
      ["Microtome lower casing", "切片机下壳", 903, 478],
      ["Microtome base frame", "切片机底架", 928, 520],
      ["Microtome left top knob", "切片机左上旋钮", 798, 38],
      ["Microtome right top knob", "切片机右上旋钮", 1006, 32],
      ["Microtome upper seam", "切片机上沿接缝", 958, 91],
      ["Microtome front fastener", "切片机前部紧固件", 888, 119],
      ["Microtome lower edge", "切片机下缘", 954, 506],
      ["Rotary handwheel", "切片机转轮", 1115, 276],
      ["Handwheel outer rim", "转轮外缘", 1_270, 300],
      ["Handwheel central hub", "转轮中心轴毂", 1_225, 295],
      ["Handwheel face", "转轮表面", 1164, 364],
      ["Handwheel black grip", "转轮黑色握柄", 1_325, 195],
    ],
  },
  {
    id: "specimen-head-and-blade",
    title: "Specimen head and blade holder",
    translation: "标本头与刀架",
    description: "Explore the visible specimen clamp, embedded block, blade assembly and clear guard without inferring specimen identity.",
    x: 500, y: 155, width: 555, height: 350, targetScale: 2.8,
    labels: [
      ["Specimen holder", "标本夹持座", 813, 278, 1],
      ["Microtome specimen head", "切片机标本头", 829, 247],
      ["Mounted block", "已夹持方块", 810, 220],
      ["Block-holder jaw", "方块夹持爪", 839, 242],
      ["Holder upper jaw", "夹持座上夹爪", 817, 184],
      ["Holder lower jaw", "夹持座下夹爪", 817, 252],
      ["Holder locking screw", "夹持座锁紧螺钉", 760, 202],
      ["Holder orientation knob", "夹持座定位旋钮", 768, 155],
      ["Microtome side knob", "切片机侧旋钮", 562, 321],
      ["Specimen-head post", "标本头立柱", 830, 163],
      ["Blade assembly", "刀片组件", 682, 346, 1],
      ["Microtome blade holder", "切片机刀架", 650, 318],
      ["Blade clamp plate", "刀片压板", 678, 336],
      ["Visible cutting blade", "可见切片刀片", 736, 340],
      ["Clear blade guard", "透明刀片护罩", 623, 292],
      ["Blade-guard edge", "刀片护罩边缘", 600, 280],
      ["Blade-stage rail", "刀台导轨", 862, 322],
      ["Angled sectioning platform", "倾斜切片台面", 740, 312],
    ],
  },
  {
    id: "microtome-base-and-catch-tray",
    title: "Microtome base and catch tray",
    translation: "切片机底座与收集盘",
    description: "Identify the open tray, its visible sides and the instrument's lower mounting surfaces.",
    x: 445, y: 380, width: 795, height: 330, targetScale: 2.55,
    labels: [
      ["Section catch tray", "切片收集盘", 702, 503],
      ["Catch-tray front lip", "收集盘前沿", 750, 487],
      ["Catch-tray left wall", "收集盘左侧壁", 490, 455],
      ["Catch-tray right wall", "收集盘右侧壁", 870, 470],
      ["Catch-tray left corner", "收集盘左角", 485, 520],
      ["Catch-tray right corner", "收集盘右角", 870, 520],
      ["White tray fragments", "盘内白色碎片", 806, 485],
      ["Microtome mounting base", "切片机安装底座", 903, 558],
      ["Base plate front edge", "底板前缘", 904, 596],
      ["Base plate left edge", "底板左边缘", 678, 585],
      ["Base plate right edge", "底板右边缘", 1_085, 576],
      ["Lower support platform", "下部支撑台", 839, 573],
      ["Front mounting ledge", "前部安装台沿", 904, 608],
      ["Microtome lower fastener", "切片机下部紧固件", 1_085, 526],
      ["Microtome adjustment knob", "切片机调节旋钮", 920, 395],
      ["Grey support mat", "灰色支撑垫", 737, 634],
    ],
  },
  {
    id: "water-bath-and-slide-rack",
    title: "Slide water bath and transfer rack",
    translation: "载玻片水浴槽与转移架",
    description: "Explore the visible bath, its rim, slides and nearby slide-transfer rack.",
    x: 0, y: 250, width: 575, height: 455, targetScale: 2.55,
    labels: [
      ["Slide water bath", "载玻片水浴槽", 237, 451],
      ["Water-bath basin", "水浴内槽", 263, 449, 1],
      ["Bath front rim", "水浴槽前沿", 239, 462],
      ["Bath far rim", "水浴槽后沿", 276, 360],
      ["Bath left corner", "水浴槽左角", 24, 390],
      ["Bath right corner", "水浴槽右角", 530, 421],
      ["Bath side casing", "水浴槽侧壳", 75, 478],
      ["Bath front panel", "水浴槽前面板", 274, 530],
      ["Bath black control knob", "水浴槽黑色调节钮", 232, 530],
      ["Bath reflective surface", "水浴槽反光面", 259, 420],
      ["Left bath slide", "左侧水浴玻片", 215, 422],
      ["Centre bath slide", "中央水浴玻片", 292, 411],
      ["Right bath slide", "右侧水浴玻片", 352, 429],
      ["Slide transfer rack", "玻片转移架", 325, 615],
      ["Transfer-rack upright", "转移架立杆", 260, 570],
      ["Transfer-rack crossbar", "转移架横杆", 325, 640],
      ["Rack divider plate", "架体分隔片", 295, 602],
    ],
  },
  {
    id: "slide-tools-and-bench-tray",
    title: "Slide-handling tools and bench tray",
    translation: "玻片工具与台面托盘",
    description: "Identify the visible forceps, brush, cloth pad, glass pieces, slide racks and stainless tray.",
    x: 0, y: 570, width: 1_170, height: 330, targetScale: 2.45,
    labels: [
      ["Sectioning tools", "切片工具", 437, 730],
      ["Sectioning forceps", "切片镊子", 390, 717, 1],
      ["Forceps tips", "镊尖", 230, 716],
      ["Forceps left arm", "镊子左臂", 366, 710],
      ["Forceps right arm", "镊子右臂", 423, 710],
      ["Forceps rear end", "镊子后端", 500, 681],
      ["Black-handled section brush", "黑柄切片刷", 458, 746],
      ["Sectioning brush bristles", "切片刷刷毛", 650, 700],
      ["Brush ferrule", "刷毛金属箍", 620, 720],
      ["Sectioning brush handle", "切片刷手柄", 364, 751],
      ["White cloth pad", "白色布垫", 570, 786],
      ["Stainless parts tray", "不锈钢浅托盘", 842, 822],
      ["Parts-tray outer rim", "浅托盘外沿", 882, 759],
      ["Parts-tray interior", "浅托盘内侧", 836, 826],
      ["Parts-tray rounded corner", "浅托盘圆角", 1_103, 776],
      ["Parts-tray base", "浅托盘底面", 806, 858],
      ["White insert tray", "白色浅托盘", 875, 812],
      ["Stacked glass slides", "叠放的玻璃载片", 111, 620],
      ["Slide-stack edge", "载片叠边缘", 34, 627],
    ],
  },
  {
    id: "control-panel-and-cassettes",
    title: "Control panel and cassette storage",
    translation: "控制面板与包埋盒收纳",
    description: "Inspect the blank control display and visible cassette basket and blocks without inferring screen data or contents.",
    x: 1_200, y: 55, width: 400, height: 810, targetScale: 2.35,
    labels: [
      ["Cassette basket", "包埋盒篮", 1_433, 672],
      ["Basket upper rail", "篮筐上沿", 1_450, 570],
      ["Basket front mesh", "篮筐前侧网格", 1_408, 700],
      ["Basket side mesh", "篮筐侧面网格", 1_586, 678],
      ["Basket grid base", "篮筐网格底板", 1_460, 825],
      ["Basket front corner", "篮筐前角", 1_223, 766],
      ["White cassette stack", "白色包埋盒叠", 1_465, 666, 1],
      ["Front cassette face", "前侧包埋盒正面", 1_416, 675],
      ["Cassette perforations", "包埋盒通孔", 1_458, 650],
      ["Cassette lid edge", "包埋盒盖边缘", 1_429, 634],
      ["Cassette end tab", "包埋盒端部凸片", 1_505, 660],
      ["Cassette side wall", "包埋盒侧壁", 1_503, 685],
      ["Stacked white sheets", "叠放的白色薄片", 1_516, 115],
      ["Top white sheet", "顶层白色薄片", 1_514, 92],
      ["Microtome control panel", "切片机控制面板", 1_378, 488],
      ["Control screen", "控制屏", 1_375, 415],
      ["Screen upper bezel", "屏幕上边框", 1_375, 375],
      ["Screen lower bezel", "屏幕下边框", 1_375, 455],
      ["Control-panel dial", "控制面板旋钮", 1_386, 503],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(value) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function levelFor(word) {
  if (OVERVIEW_LABELS.has(word)) return 0;
  const normalized = word.toLocaleLowerCase("en-US");
  if (/\b(edge|rim|corner|seam|screw|fastener|grip|hub|cap|jaw|tip|hinge|ferrule|perforation|tab|knob|dial|bezel|divider|crossbar|mesh)\b/u.test(normalized)) return 4;
  if (/\b(cover|surface|casing|panel|frame|rail|base|plate|face|post|bracket|tray|rack|basket|bath|clamp|guard|holder|wheel|handle|screen|stack|platform|tool|forceps|brush|slide|block|mat)\b/u.test(normalized)) return 3;
  if (/\b(microtome|specimen|blade|cassette|water|control|section|handwheel|mounted|parts|support|orientation)\b/u.test(normalized)) return 2;
  return 1;
}

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function buildScene(assetSha256) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y, authoredLevel] of zone.labels) {
      if (x < zone.x || x > zone.x + zone.width || y < zone.y || y > zone.y + zone.height) {
        throw new Error(`${word} (${x}, ${y}) falls outside ${zone.id}`);
      }
      const id = `histology-sectioning-workstation-${slugify(word)}`;
      const size = 44;
      const region = {
        id: `${id}-region`,
        description: `${word} on the ${zone.title.toLowerCase()} in the histology sectioning-workstation photograph`,
        kind: "part",
        ...rect(Math.max(0, Math.min(WIDTH - size, x - size / 2)), Math.max(0, Math.min(HEIGHT - size, y - size / 2)), size, size),
      };
      labels.push({
        id,
        word,
        translation,
        x,
        y,
        priority: Number((1 + priority / 1_000).toFixed(6)),
        minLevel: authoredLevel ?? levelFor(word),
        sourceVisualRegion: region.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priority += 1;
    }
    detailZones.push({
      id: `histology-sectioning-workstation-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...rect(zone.x, zone.y, zone.width, zone.height),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  const uniqueWords = new Set(labels.map(({ word }) => word.toLocaleLowerCase("en-US")));
  const uniqueIds = new Set(labels.map(({ id }) => id));
  const zoneSizes = detailZones.map(({ labelIds }) => labelIds.length);
  const expectedZoneSizes = [19, 18, 16, 17, 19, 19];
  if (labels.length !== 108 || uniqueWords.size !== labels.length || uniqueIds.size !== labels.length) {
    throw new Error(`Expected 108 unique labels and IDs, got ${labels.length}/${uniqueWords.size}/${uniqueIds.size}`);
  }
  if (zoneSizes.some((size, index) => size !== expectedZoneSizes[index])) {
    throw new Error(`Expected zone sizes ${expectedZoneSizes.join("/")}, got ${zoneSizes.join("/")}`);
  }
  return {
    id: "histology-sectioning-workstation",
    title: "Histology sectioning workstation",
    translation: "组织切片工作台",
    subtitle: "A rotary microtome, slide bath, sectioning tools and tissue cassettes",
    asset: "/scenes/histology-sectioning-workstation-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "pathology-lab",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/histology-sectioning-workstation-premium-v1.jpg",
      reviewedAssetSha256: assetSha256,
      rationale: "The source and final-size histology-workstation photographs were inspected at original and resized pixels. Six zones cover the rotary microtome, visible clamp and guarded blade, catch tray and base, slide water bath and transfer rack, hand tools and bench tray, and control/cassette storage. The final review removed duplicate, unsupported and obscured labels; remaining terms are limited to visible equipment surfaces, slides, cassettes and supplies. No tissue identity, liquid composition, diagnostic finding, setting or result is inferred.",
      previousLabelCount: 120,
      retainedLabelCount: labels.length,
      removedLabelCount: 120 - labels.length,
      removedExamples: ["duplicate equipment surfaces", "duplicate slide labels", "duplicate screen-glass label", "unsupported mounting rail and brackets", "unsupported specimen-head collar", "unpictured bath corner post", "unlocatable catch-tray floor", "bath surface misidentified as a wall"],
    },
    labels,
    portals: [],
  };
}

async function writeIfChanged(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, bytes) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path, bytes);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourcePath);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("Source image bytes changed; repeat the pixel review first");
  const metadata = await sharp(source).metadata();
  if (metadata.width !== SOURCE_WIDTH || metadata.height !== SOURCE_HEIGHT) {
    throw new Error(`Expected ${SOURCE_WIDTH}×${SOURCE_HEIGHT}, got ${metadata.width}×${metadata.height}`);
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (ASSET_SHA256 !== "PENDING" && sha256(output) !== ASSET_SHA256) {
    throw new Error(`JPEG is not reproducible; got ${sha256(output)}`);
  }
  await writeFile(assetPath, output);
  return sha256(output);
}

async function assertUniqueSceneWords(scene) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Map();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const existing = JSON.parse(await readFile(resolve(projectRoot, `public/data/scenes/${entry.id}.json`), "utf8"));
    for (const label of existing.labels) existingWords.set(label.word.toLocaleLowerCase("en-US"), entry.id);
  }
  const duplicates = scene.labels
    .filter(({ word }) => existingWords.has(word.toLocaleLowerCase("en-US")))
    .map(({ word }) => `${word} (${existingWords.get(word.toLocaleLowerCase("en-US"))})`);
  if (duplicates.length) throw new Error(`Display words duplicate existing scenes: ${duplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-histology-sectioning-workstation",
  label: "Inspect the histology sectioning workstation",
  translation: "查看组织切片工作台",
  childSceneId: "histology-sectioning-workstation",
  sourceVisualRegion: "portal-histology-sectioning-workstation",
  x: 1_270,
  y: 520,
  width: 70,
  height: 70,
  enterScale: 3.35,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Visible right-side microtome and tissue-sectioning equipment in the pathology laboratory photograph",
  kind: "object",
  x: parentPortal.x,
  y: parentPortal.y,
  width: parentPortal.width,
  height: parentPortal.height,
};

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const labelOverlaps = parent.labels.filter(({ x, y }) => (
    x >= parentPortal.x && x <= parentPortal.x + parentPortal.width
    && y >= parentPortal.y && y <= parentPortal.y + parentPortal.height
  ));
  if (labelOverlaps.length) {
    throw new Error(`Portal would cover parent label anchors: ${labelOverlaps.map(({ word }) => word).join(", ")}`);
  }
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
  const expected = {
    id: "histology-sectioning-workstation",
    title: "Histology sectioning workstation",
    parentId: "pathology-lab",
  };
  const existing = manifest.scenes.find(({ id }) => id === expected.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(expected)) throw new Error("Existing manifest record has unexpected lineage");
    return false;
  }
  const parentIndex = manifest.scenes.findIndex(({ id }) => id === expected.parentId);
  if (parentIndex < 0) throw new Error("pathology-lab is missing from the scene manifest");
  const microscopeIndex = manifest.scenes.findIndex(({ id }) => id === "microscope-workstation");
  const insertAfter = microscopeIndex >= 0 ? microscopeIndex : parentIndex;
  manifest.scenes.splice(insertAfter + 1, 0, expected);
  return writeIfChanged(manifestPath, manifest);
}

export async function buildHistologySectioningWorkstationScene() {
  const assetSha256 = await ensureAsset();
  const scene = buildScene(assetSha256);
  await assertUniqueSceneWords(scene);
  const result = {
    id: scene.id,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    zoneSizes: scene.detailZones.map(({ labelIds }) => labelIds.length),
    assetSha256,
    sceneChanged: await writeIfChanged(scenePath, scene),
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildHistologySectioningWorkstationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-histology-sectioning-workstation-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
