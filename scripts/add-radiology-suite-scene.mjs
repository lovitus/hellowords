import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Builds one standalone radiology scene from a reviewed source photograph.
 * Coordinates are authored in the 1672 x 941 source space and scaled only
 * after the final JPEG has been created. The scene is terminal for now: the
 * hospital portal enters it, while zooming remains inside this imaging study.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/radiology-suite-premium-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/radiology-suite-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/radiology-suite.json");
const hospitalPath = resolve(projectRoot, "public/data/scenes/hospital.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "367e11bf895045aae69a7f224d035fb1d082e5f4869afdc0dbc055fb86ea2dfe";
const PUBLIC_ASSET_SHA256 = "b61a9331f765812aabc429d86ea935ba00e947fb86b45e487743a410c01cecc5";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "ct-bay",
    title: "CT bay",
    translation: "CT 检查区",
    description: "Inspect the CT gantry, aperture, couch, control details and the adjacent wash area.",
    x: 0,
    y: 80,
    width: 480,
    height: 430,
    targetScale: 2.35,
    labels: [
      ["CT bay", "CT 检查区", 190, 270, 0],
      ["CT gantry housing", "CT 机架外壳", 185, 230, 0],
      ["CT aperture", "CT 孔径", 185, 285, 1],
      ["CT patient couch", "CT 患者检查床", 235, 370, 1],
      ["CT couch cushion", "CT 床垫", 265, 350, 2],
      ["CT couch base", "CT 床座", 260, 430, 2],
      ["CT couch handle", "CT 床把手", 285, 380, 3],
      ["CT alignment light", "CT 定位灯", 185, 195, 3],
      ["CT scanner display", "CT 扫描器显示屏", 185, 178, 4],
      ["CT control panel", "CT 控制面板", 300, 255, 3],
      ["CT room sink", "CT 室水槽", 360, 205, 0],
      ["CT room cabinet", "CT 室柜体", 400, 270, 1],
      ["CT bay glass partition", "CT 区玻璃隔断", 420, 440, 2],
    ],
  },
  {
    id: "mri-bay",
    title: "MRI bay",
    translation: "MRI 检查区",
    description: "Follow the MRI magnet, tunnel, patient couch, head cradle, trolley and console desk.",
    x: 390,
    y: 40,
    width: 590,
    height: 430,
    targetScale: 2.4,
    labels: [
      ["MRI bay", "MRI 检查区", 650, 200, 0],
      ["MRI magnet housing", "MRI 磁体外壳", 650, 180, 0],
      ["MRI tunnel", "MRI 隧道", 650, 260, 1],
      ["MRI patient couch", "MRI 患者检查床", 760, 335, 1],
      ["MRI couch pedestal", "MRI 床立柱", 760, 405, 2],
      ["MRI head cradle", "MRI 头部托架", 680, 300, 2],
      ["MRI cable loop", "MRI 电缆环", 700, 365, 3],
      ["MRI control monitor", "MRI 控制监视器", 900, 300, 3],
      ["MRI equipment trolley", "MRI 设备推车", 830, 220, 2],
      ["MRI console desk", "MRI 控制台桌", 895, 350, 4],
      ["ceiling light panel", "顶灯面板", 800, 55, 0],
      ["glass partition post", "玻璃隔断立柱", 800, 420, 3],
    ],
  },
  {
    id: "xray-mammography",
    title: "X-ray and mammography",
    translation: "X 光与乳腺摄影",
    description: "Inspect the radiography room, mammography assembly, X-ray tube and detector hardware.",
    x: 930,
    y: 30,
    width: 742,
    height: 420,
    targetScale: 2.45,
    labels: [
      ["radiography room", "放射摄影室", 1350, 250, 0],
      ["mammography room", "乳腺摄影室", 1015, 170, 0],
      ["mammography machine", "乳腺摄影机", 1015, 165, 1],
      ["mammography compression paddle", "乳腺摄影压迫板", 1015, 200, 2],
      ["mammography detector plate", "乳腺摄影探测板", 1015, 225, 3],
      ["mammography support arm", "乳腺摄影支臂", 1020, 125, 2],
      ["X-ray tube arm", "X 光管支臂", 1260, 140, 1],
      ["X-ray collimator", "X 光准直器", 1275, 165, 2],
      ["X-ray detector stand", "X 光探测器支架", 1470, 220, 1],
      ["X-ray detector cassette", "X 光探测器盒", 1470, 235, 3],
      ["X-ray wall stand", "X 光壁挂支架", 1230, 225, 2],
      ["radiographic table", "放射摄影床", 1350, 325, 0],
      ["radiographic table pad", "放射摄影床垫", 1350, 300, 2],
      ["lead barrier", "防护屏", 1550, 300, 1],
      ["detector stand base", "探测器支架底座", 1470, 390, 4],
      ["privacy screen caster", "隐私屏脚轮", 1550, 370, 4],
    ],
  },
  {
    id: "control-room",
    title: "Control room",
    translation: "控制室",
    description: "Study the workstation, desk, monitor, chair, console keypad and glass control partition.",
    x: 0,
    y: 430,
    width: 550,
    height: 430,
    targetScale: 2.45,
    labels: [
      ["control room", "控制室", 220, 560, 0],
      ["control workstation", "控制工作站", 160, 550, 0],
      ["control desk", "控制台桌", 240, 565, 1],
      ["workstation monitor", "工作站监视器", 140, 540, 1],
      ["console chair", "控制台椅", 180, 670, 2],
      ["control keyboard", "控制键盘", 160, 620, 3],
      ["console keypad", "控制台按键板", 250, 555, 4],
      ["control-room glazing", "控制室玻璃窗", 430, 500, 2],
      ["glass partition frame", "玻璃隔断框", 430, 520, 3],
    ],
  },
  {
    id: "ultrasound-bay",
    title: "Ultrasound bay",
    translation: "超声检查区",
    description: "Follow the portable ultrasound machine, probe, gel bottle, cart and examination couch.",
    x: 500,
    y: 430,
    width: 620,
    height: 511,
    targetScale: 2.55,
    labels: [
      ["ultrasound bay", "超声检查区", 750, 700, 0],
      ["ultrasound machine", "超声机", 680, 700, 0],
      ["ultrasound monitor", "超声监视器", 660, 580, 1],
      ["ultrasound control panel", "超声控制面板", 680, 650, 2],
      ["ultrasound probe handle", "超声探头手柄", 730, 660, 2],
      ["ultrasound probe head", "超声探头头端", 730, 700, 3],
      ["ultrasound gel bottle", "超声耦合剂瓶", 760, 635, 3],
      ["ultrasound cable loop", "超声电缆环", 720, 720, 4],
      ["ultrasound cart", "超声推车", 680, 760, 1],
      ["ultrasound cart drawer", "超声推车抽屉", 680, 790, 3],
      ["ultrasound cart wheel", "超声推车脚轮", 640, 825, 4],
      ["exam couch wheel", "检查床脚轮", 900, 835, 4],
      ["exam couch cushion", "检查床垫", 900, 700, 2],
      ["ultrasound machine base", "超声机底座", 680, 815, 3],
      ["floor guide stripe", "地面导向条", 850, 460, 4],
    ],
  },
  {
    id: "preparation-and-supplies",
    title: "Preparation and supplies",
    translation: "准备与物资区",
    description: "Inspect contrast preparation, protective garments, storage, handwashing and room hardware.",
    x: 900,
    y: 400,
    width: 772,
    height: 541,
    targetScale: 2.6,
    labels: [
      ["contrast injector tower", "造影剂注射塔", 1015, 550, 0],
      ["injector control head", "注射器控制头", 1015, 500, 2],
      ["contrast reservoir", "造影剂储液罐", 1040, 550, 1],
      ["injector hose", "注射器软管", 1035, 580, 3],
      ["IV pole", "输液杆", 1000, 480, 1],
      ["equipment cart drawer", "设备推车抽屉", 930, 520, 2],
      ["equipment cart caster", "设备推车脚轮", 950, 580, 4],
      ["supply cabinet", "物资柜", 1500, 700, 0],
      ["supply shelf", "物资搁板", 1500, 750, 2],
      ["apron rack", "围裙架", 1260, 720, 1],
      ["protective gown", "防护袍", 1280, 740, 3],
      ["stainless sink", "不锈钢水槽", 1300, 840, 0],
      ["sink mixer handle", "水槽混合龙头把手", 1330, 790, 3],
      ["sink basin drain", "水槽盆排水口", 1310, 850, 4],
      ["sanitizer pump", "消毒液泵头", 1400, 650, 2],
      ["supply box", "物资盒", 1550, 750, 3],
      ["wall clock face", "挂钟表盘", 1320, 500, 0],
      ["radiation indicator", "辐射指示灯", 1150, 420, 1],
      ["radiology door handle", "影像科门把手", 1170, 630, 3],
      ["door vision panel", "门观察窗", 1180, 570, 2],
      ["imaging room wall", "影像室墙面", 1100, 450, 1],
      ["sink counter edge", "水槽台面边缘", 1300, 790, 2],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function scenePoint(value, axis) {
  const scaled = value * (axis === "x" ? SCALE_X : SCALE_Y);
  return Number(scaled.toFixed(6));
}

function sceneRectangle(rectangle) {
  return {
    x: scenePoint(rectangle.x, "x"),
    y: scenePoint(rectangle.y, "y"),
    width: scenePoint(rectangle.width, "x"),
    height: scenePoint(rectangle.height, "y"),
  };
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 48;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `radiology-suite-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the radiology-suite photograph`,
    kind: "part",
    ...sceneRectangle({ x: left, y: top, width: size, height: size }),
  };
}

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `radiology-suite-${slugify(word)}`;
      const sourceVisualRegion = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: sourceVisualRegion.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `radiology-suite-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "radiology-suite",
    title: "Radiology suite",
    translation: "放射影像科",
    subtitle: "CT, MRI, X-ray and ultrasound imaging",
    asset: "/scenes/radiology-suite-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "hospital",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/radiology-suite-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The source and resized radiology-suite photographs were inspected at native and final pixels. This batch retains 87 independently pointable imaging-room fixtures and equipment parts across CT, MRI, X-ray, mammography, control, ultrasound and preparation areas. Patient procedures, diagnoses, radiation dose, staff roles, brands, unreadable screen content and hidden machine functions were excluded.",
      previousLabelCount: 93,
      retainedLabelCount: 87,
      removedLabelCount: 6,
      removedExamples: [
        "patient procedure",
        "diagnostic result",
        "radiation dose",
        "treatment plan",
        "staff role",
        "brand name",
      ],
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
  if (sha256(source) !== SOURCE_SHA256) {
    throw new Error("radiology source bytes changed; rerun the pixel audit before rebuilding");
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) {
    throw new Error(`radiology-suite JPEG is not reproducible; got ${sha256(output)}`);
  }
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const radiologyPortal = {
  id: "enter-radiology-suite",
  label: "Enter the radiology suite",
  translation: "进入放射影像科",
  childSceneId: "radiology-suite",
  sourceVisualRegion: "radiology-suite",
  x: 700,
  y: 280,
  width: 310,
  height: 300,
  enterScale: 3.4,
};

async function updateHospital() {
  const hospital = JSON.parse(await readFile(hospitalPath, "utf8"));
  const existingIndex = hospital.portals.findIndex(({ id }) => id === radiologyPortal.id);
  if (existingIndex >= 0) hospital.portals[existingIndex] = radiologyPortal;
  else hospital.portals.splice(1, 0, radiologyPortal);
  return writeIfChanged(hospitalPath, hospital);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "radiology-suite");
  if (!existing) {
    const hospitalIndex = manifest.scenes.findIndex(({ id }) => id === "hospital");
    if (hospitalIndex < 0) throw new Error("hospital is missing from the scene manifest");
    manifest.scenes.splice(hospitalIndex + 1, 0, {
      id: "radiology-suite",
      title: "Radiology suite",
      parentId: "hospital",
    });
  } else if (existing.title !== "Radiology suite" || existing.parentId !== "hospital") {
    throw new Error("radiology-suite already exists with a different title or parent");
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildRadiologySuiteScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const hospitalChanged = await updateHospital();
  const manifestChanged = await updateManifest();
  return {
    assetChanged,
    sceneChanged,
    hospitalChanged,
    manifestChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildRadiologySuiteScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-radiology-suite-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
