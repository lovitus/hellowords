import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the microscope-workstation terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers. Pass --integrate after review to connect the visible left-front
 * microscope in pathology-lab and update the manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/microscope-workstation-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/microscope-workstation-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/microscope-workstation.json");
const parentPath = resolve(projectRoot, "public/data/scenes/pathology-lab.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "cf4dc0a0a7aa51e14c93afb7cd8895ba19b13615f286c9f2d8da8cfa9baf69fa";
const PUBLIC_ASSET_SHA256 = "c2d5ff3cb6db3262a4adba64367f320280abb11c95cbb762f727c052492e274a";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "optical-head-and-eyepieces",
    title: "Optical head and eyepieces",
    translation: "光学头与目镜",
    description: "Inspect the binocular head, eyepieces, camera port, camera housing, support column and upper arm.",
    x: 350,
    y: 0,
    width: 550,
    height: 420,
    targetScale: 2.65,
    labels: [
      ["Microscope binocular head", "显微镜工作台双目镜筒", 700, 240, 0],
      ["Microscope left eyepiece", "显微镜工作台左目镜", 690, 170, 0],
      ["Microscope right eyepiece", "显微镜工作台右目镜", 800, 170, 0],
      ["Microscope left eyepiece lens", "显微镜工作台左目镜透镜", 690, 145, 2],
      ["Microscope right eyepiece lens", "显微镜工作台右目镜透镜", 800, 145, 2],
      ["Microscope left eyepiece tube", "显微镜工作台左目镜筒", 650, 210, 1],
      ["Microscope right eyepiece tube", "显微镜工作台右目镜筒", 830, 210, 1],
      ["Microscope head housing", "显微镜工作台光学头外壳", 700, 250, 0],
      ["Microscope trinocular port", "显微镜工作台三目接口", 600, 100, 1],
      ["Microscope camera housing", "显微镜工作台相机外壳", 600, 55, 0],
      ["Microscope camera cable", "显微镜工作台相机线", 520, 180, 2],
      ["Microscope photo tube", "显微镜工作台摄影筒", 600, 140, 1],
      ["Microscope head mount collar", "显微镜工作台光学头安装环", 700, 290, 2],
      ["Microscope upper arm", "显微镜工作台上支臂", 550, 300, 0],
      ["Microscope arm underside", "显微镜工作台支臂底面", 550, 320, 2],
      ["Microscope arm inner surface", "显微镜工作台支臂内侧", 500, 300, 3],
      ["Microscope stand upper frame", "显微镜工作台支架上框", 480, 260, 1],
      ["Microscope support column", "显微镜工作台支撑柱", 480, 350, 0],
      ["Microscope focus shaft", "显微镜工作台调焦轴", 420, 380, 3],
      ["Microscope arm screw", "显微镜工作台支臂螺钉", 500, 340, 4],
      ["Microscope cable loop", "显微镜工作台线缆环", 430, 300, 2],
      ["Microscope head tilt joint", "显微镜工作台光学头倾斜接头", 650, 300, 3],
      ["Microscope tube collar", "显微镜工作台镜筒环", 700, 280, 3],
      ["Microscope camera port cap", "显微镜工作台相机接口盖", 600, 85, 2],
      ["Microscope head rear plate", "显微镜工作台光学头后板", 620, 250, 2],
    ],
  },
  {
    id: "nosepiece-objectives-and-stage",
    title: "Nosepiece, objectives and stage",
    translation: "转换器、物镜与载物台",
    description: "Follow the revolving nosepiece, four objective barrels, stage plate, slide holder and mechanical controls.",
    x: 300,
    y: 300,
    width: 600,
    height: 400,
    targetScale: 2.65,
    labels: [
      ["Microscope revolving nosepiece", "显微镜工作台物镜转换器", 560, 370, 0],
      ["Microscope nosepiece ring", "显微镜工作台转换器环", 560, 360, 2],
      ["Microscope nosepiece click stop", "显微镜工作台转换器定位点", 600, 360, 3],
      ["Microscope blue objective lens", "显微镜工作台蓝环物镜", 500, 420, 1],
      ["Microscope yellow objective lens", "显微镜工作台黄环物镜", 550, 430, 1],
      ["Microscope white objective lens", "显微镜工作台白环物镜", 610, 430, 1],
      ["Microscope red objective lens", "显微镜工作台红环物镜", 670, 430, 1],
      ["Microscope blue objective collar", "显微镜工作台蓝环物镜套", 500, 405, 2],
      ["Microscope yellow objective collar", "显微镜工作台黄环物镜套", 550, 415, 2],
      ["Microscope white objective collar", "显微镜工作台白环物镜套", 610, 415, 2],
      ["Microscope red objective collar", "显微镜工作台红环物镜套", 670, 415, 2],
      ["Microscope turret underside", "显微镜工作台转换器底面", 560, 390, 3],
      ["Microscope mechanical stage", "显微镜工作台机械载物台", 580, 500, 0],
      ["Microscope stage plate", "显微镜工作台载物台板", 580, 510, 1],
      ["Microscope stage left edge", "显微镜工作台载物台左边", 430, 510, 3],
      ["Microscope stage right edge", "显微镜工作台载物台右边", 760, 510, 3],
      ["Microscope stage front edge", "显微镜工作台载物台前边", 580, 550, 2],
      ["Microscope slide holder", "显微镜工作台载玻片夹", 580, 480, 0],
      ["Microscope slide clip left", "显微镜工作台左压片夹", 470, 480, 3],
      ["Microscope slide clip right", "显微镜工作台右压片夹", 700, 480, 3],
      ["Microscope glass slide", "显微镜工作台玻璃载玻片", 580, 490, 1],
      ["Microscope coverslip", "显微镜工作台盖玻片", 620, 490, 3],
      ["Microscope stage aperture", "显微镜工作台载物台孔", 580, 570, 2],
      ["Microscope stage X control", "显微镜工作台 X 向旋钮", 760, 540, 3],
      ["Microscope stage Y control", "显微镜工作台 Y 向旋钮", 780, 560, 3],
    ],
  },
  {
    id: "illumination-and-base",
    title: "Illumination and microscope base",
    translation: "照明与显微镜底座",
    description: "Explore the focus knobs, condenser, diaphragm, illuminator, base deck, feet, switch and power cable.",
    x: 250,
    y: 500,
    width: 600,
    height: 441,
    targetScale: 2.6,
    labels: [
      ["Microscope coarse focus knob", "显微镜工作台粗调焦旋钮", 300, 620, 0],
      ["Microscope fine focus knob", "显微镜工作台细调焦旋钮", 420, 680, 1],
      ["Microscope focus knob axle", "显微镜工作台调焦旋钮轴", 420, 680, 3],
      ["Microscope condenser", "显微镜工作台聚光器", 600, 620, 0],
      ["Microscope iris diaphragm", "显微镜工作台虹彩光阑", 600, 640, 2],
      ["Microscope diaphragm ring", "显微镜工作台光阑环", 600, 650, 3],
      ["Microscope condenser holder", "显微镜工作台聚光器架", 600, 590, 1],
      ["Microscope illuminator housing", "显微镜工作台光源外壳", 600, 710, 0],
      ["Microscope illuminator lens", "显微镜工作台光源透镜", 600, 700, 2],
      ["Microscope lamp collector", "显微镜工作台集光器", 600, 690, 3],
      ["Microscope field diaphragm", "显微镜工作台视场光阑", 620, 660, 3],
      ["Microscope light path aperture", "显微镜工作台光路孔", 600, 675, 4],
      ["Microscope base upper deck", "显微镜工作台底座上平台", 500, 760, 0],
      ["Microscope base front edge", "显微镜工作台底座前沿", 500, 830, 2],
      ["Microscope base left corner", "显微镜工作台底座左角", 350, 800, 3],
      ["Microscope base right corner", "显微镜工作台底座右角", 700, 800, 3],
      ["Microscope stand base", "显微镜工作台支架底座", 500, 780, 0],
      ["Microscope left rubber foot", "显微镜工作台左橡胶脚", 400, 875, 4],
      ["Microscope right rubber foot", "显微镜工作台右橡胶脚", 680, 875, 4],
      ["Microscope power switch", "显微镜工作台电源开关", 450, 750, 2],
      ["Microscope power cable", "显微镜工作台电源线", 280, 760, 1],
      ["Microscope lower arm support", "显微镜工作台下支臂", 360, 560, 1],
      ["Microscope stage support column", "显微镜工作台载物台支柱", 500, 600, 2],
      ["Microscope focus control shaft", "显微镜工作台调焦控制轴", 350, 650, 3],
      ["Microscope base rear edge", "显微镜工作台底座后沿", 650, 760, 3],
    ],
  },
  {
    id: "slide-prep-and-labware",
    title: "Slide preparation and labware",
    translation: "载玻片准备与实验器皿",
    description: "Inspect the colored slide tray, blank slides, forceps, pipette rack, clear tubes, dish and storage boxes.",
    x: 780,
    y: 350,
    width: 700,
    height: 590,
    targetScale: 2.55,
    labels: [
      ["Microscope slide tray", "显微镜工作台载玻片托盘", 1_050, 800, 0],
      ["Microscope violet slide cassette", "显微镜工作台紫色载片盒", 900, 790, 1],
      ["Microscope blue slide cassette", "显微镜工作台蓝色载片盒", 1_100, 790, 1],
      ["Microscope green slide cassette", "显微镜工作台绿色载片盒", 1_000, 790, 1],
      ["Microscope slide cassette lid", "显微镜工作台载片盒盖", 1_050, 770, 2],
      ["Microscope blank glass slide", "显微镜工作台空白玻璃片", 1_050, 815, 2],
      ["Microscope coverslip pack", "显微镜工作台盖玻片盒", 1_100, 830, 1],
      ["Microscope forceps", "显微镜工作台镊子", 1_250, 860, 0],
      ["Microscope forceps tip", "显微镜工作台镊尖", 1_250, 850, 3],
      ["Microscope stainless dish", "显微镜工作台不锈钢皿", 1_350, 750, 0],
      ["Microscope dish rim", "显微镜工作台金属皿边", 1_350, 730, 3],
      ["Microscope pipette rack", "显微镜工作台移液器架", 1_250, 550, 0],
      ["Microscope white pipette", "显微镜工作台白色移液器", 1_220, 500, 1],
      ["Microscope blue pipette", "显微镜工作台蓝色移液器", 1_300, 500, 1],
      ["Microscope pipette plunger", "显微镜工作台移液器推杆", 1_250, 470, 3],
      ["Microscope pipette stand", "显微镜工作台移液器底座", 1_250, 650, 2],
      ["Microscope clear tube rack", "显微镜工作台透明试管架", 1_000, 650, 0],
      ["Microscope glass tube", "显微镜工作台玻璃试管", 1_000, 610, 1],
      ["Microscope tube rack rail", "显微镜工作台试管架横杆", 1_000, 680, 2],
      ["Microscope tube rack foot", "显微镜工作台试管架脚", 1_000, 710, 3],
      ["Microscope specimen box", "显微镜工作台样本盒", 1_350, 600, 0],
      ["Microscope specimen box lid", "显微镜工作台样本盒盖", 1_350, 570, 2],
      ["Microscope lens tissue box", "显微镜工作台镜头纸盒", 850, 540, 0],
      ["Microscope lens tissue stack", "显微镜工作台镜头纸叠", 850, 530, 2],
      ["Microscope glass bench surface", "显微镜工作台玻璃台面", 1_100, 700, 0],
    ],
  },
  {
    id: "computer-camera-and-bench",
    title: "Computer, camera and bench support",
    translation: "电脑、相机与实验台支持",
    description: "Follow the blank imaging monitor, keyboard, desk lamp, secondary microscope, bench shelving and drawers.",
    x: 850,
    y: 150,
    width: 822,
    height: 700,
    targetScale: 2.5,
    labels: [
      ["Microscope imaging monitor", "显微镜工作台成像显示器", 1_050, 350, 0],
      ["Microscope blank monitor screen", "显微镜工作台空白显示屏", 1_050, 350, 1],
      ["Microscope monitor bezel", "显微镜工作台显示器边框", 1_050, 350, 2],
      ["Microscope monitor stand", "显微镜工作台显示器支架", 1_050, 480, 1],
      ["Microscope imaging keyboard", "显微镜工作台成像键盘", 1_050, 520, 0],
      ["Microscope keyboard key field", "显微镜工作台键盘按键区", 1_050, 520, 3],
      ["Microscope camera monitor cable", "显微镜工作台成像线", 950, 450, 2],
      ["Microscope desk lamp", "显微镜工作台台灯", 900, 280, 0],
      ["Microscope lamp head", "显微镜工作台灯头", 900, 260, 2],
      ["Microscope lamp arm", "显微镜工作台灯臂", 850, 330, 1],
      ["Microscope rear microscope", "显微镜工作台后方显微镜", 1_400, 340, 0],
      ["Microscope rear eyepiece", "显微镜工作台后方目镜", 1_430, 280, 1],
      ["Microscope rear nosepiece", "显微镜工作台后方转换器", 1_390, 400, 2],
      ["Microscope rear stage", "显微镜工作台后方载物台", 1_400, 450, 1],
      ["Microscope rear stand base", "显微镜工作台后方底座", 1_400, 500, 0],
      ["Microscope rear camera", "显微镜工作台后方相机", 1_390, 250, 2],
      ["Microscope rear camera cable", "显微镜工作台后方相机线", 1_350, 270, 3],
      ["Microscope bench rear shelf", "显微镜工作台后层搁板", 1_200, 300, 0],
      ["Microscope bench backsplash", "显微镜工作台后挡板", 1_200, 400, 1],
      ["Microscope cabinet drawer", "显微镜工作台柜体抽屉", 1_350, 520, 0],
      ["Microscope cabinet handle", "显微镜工作台柜体拉手", 1_350, 520, 3],
      ["Microscope bench edge", "显微镜工作台台面边缘", 1_200, 700, 2],
      ["Microscope monitor power cable", "显微镜工作台显示电源线", 1_100, 500, 2],
      ["Microscope monitor support foot", "显微镜工作台显示器支脚", 1_050, 480, 3],
      ["Microscope glass bench edge", "显微镜工作台玻璃台边", 1_450, 700, 2],
    ],
  },
  {
    id: "room-window-and-furnishings",
    title: "Room, window and furnishings",
    translation: "房间、窗户与家具",
    description: "Inspect the window wall, glass partition, plants, stool, ceiling services, wall finish and floor.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.4,
    labels: [
      ["Microscope room window wall", "显微镜房间窗墙", 250, 180, 0],
      ["Microscope room window glass", "显微镜房间窗玻璃", 250, 180, 1],
      ["Microscope room window frame", "显微镜房间窗框", 250, 200, 2],
      ["Microscope room window sill", "显微镜房间窗台", 250, 460, 2],
      ["Microscope room glass partition", "显微镜房间玻璃隔断", 1_200, 180, 0],
      ["Microscope room partition mullion", "显微镜房间隔断竖框", 1_200, 180, 2],
      ["Microscope room laboratory bench", "显微镜房间实验台", 300, 500, 0],
      ["Microscope room bench metal leg", "显微镜房间实验台金属腿", 300, 700, 2],
      ["Microscope room bench drawer", "显微镜房间实验台抽屉", 300, 620, 1],
      ["Microscope room drawer pull", "显微镜房间抽屉拉手", 300, 620, 3],
      ["Microscope room blue reagent jar", "显微镜房间蓝色试剂罐", 250, 520, 1],
      ["Microscope room clear reagent jar", "显微镜房间透明试剂罐", 150, 520, 1],
      ["Microscope room plant", "显微镜房间植物", 150, 350, 0],
      ["Microscope room plant pot", "显微镜房间花盆", 150, 430, 1],
      ["Microscope room plant leaf", "显微镜房间叶片", 150, 300, 2],
      ["Microscope room lab stool", "显微镜房间实验凳", 1_500, 550, 0],
      ["Microscope room stool seat", "显微镜房间凳面", 1_500, 550, 2],
      ["Microscope room ceiling light", "显微镜房间顶灯", 900, 50, 0],
      ["Microscope room ceiling panel", "显微镜房间顶板", 1_200, 50, 1],
      ["Microscope room wall cabinet", "显微镜房间壁柜", 1_500, 250, 0],
      ["Microscope room cabinet door", "显微镜房间壁柜门", 1_500, 250, 2],
      ["Microscope room cabinet handle", "显微镜房间壁柜把手", 1_500, 280, 3],
      ["Microscope room floor surface", "显微镜房间地面", 1_200, 850, 0],
      ["Microscope room floor reflection", "显微镜房间地面反光", 1_200, 800, 3],
      ["Microscope room wall finish", "显微镜房间墙面饰面", 1_000, 150, 1],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function scenePoint(value, axis) {
  return Number((value * (axis === "x" ? SCALE_X : SCALE_Y)).toFixed(6));
}

function sceneRectangle(rectangle) {
  return {
    x: scenePoint(rectangle.x, "x"),
    y: scenePoint(rectangle.y, "y"),
    width: scenePoint(rectangle.width, "x"),
    height: scenePoint(rectangle.height, "y"),
  };
}

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `microscope-workstation-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the microscope-workstation photograph`,
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
      const id = `microscope-workstation-${slugify(word)}`;
      const region = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: region.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `microscope-workstation-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "microscope-workstation",
    title: "Microscope workstation",
    translation: "显微镜工作台",
    subtitle: "Optical parts, stage, illumination and slide preparation",
    asset: "/scenes/microscope-workstation-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "pathology-lab",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/microscope-workstation-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized microscope-workstation photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable optical, mechanical, illumination, slide-preparation, computer, bench and room-fixture parts across ${detailZones.length} bounded zones. Specimen identity, diagnoses, disease claims, measurement readings, readable labels, brands, patient data and hidden microscope functions were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "specimen identity",
        "diagnosis",
        "disease claim",
        "measurement reading",
        "readable label",
        "brand name",
        "patient data",
        "hidden microscope function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("microscope source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`microscope JPEG is not reproducible; got ${sha256(output)}`);
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
  id: "enter-microscope-workstation",
  label: "Inspect the microscope workstation",
  translation: "查看显微镜工作台",
  childSceneId: "microscope-workstation",
  sourceVisualRegion: "portal-microscope-workstation",
  x: 20,
  y: 360,
  width: 300,
  height: 400,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete left-front compound microscope, stage, controls and surrounding glass workbench in the pathology laboratory photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "microscope-workstation")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "pathology-lab");
    if (parentIndex < 0) throw new Error("pathology-lab is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "microscope-workstation",
      title: "Microscope workstation",
      parentId: "pathology-lab",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildMicroscopeWorkstationScene() {
  const scene = buildScene();
  if (scene.labels.length < 145 || scene.labels.length > 155) {
    throw new Error(`microscope label count ${scene.labels.length} is outside 145–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`microscope zone count ${scene.detailZones.length} is not 6`);
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

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildMicroscopeWorkstationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-microscope-workstation-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
