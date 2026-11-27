import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Builds the radiology suite from a reviewed source photograph.
 * Coordinates are authored in the 1672 x 941 source space and scaled only
 * after the final JPEG has been created. The ultrasound cart portal bounds
 * below are measured on the final 1600 x 900 JPEG.
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
const ultrasoundCartPanelBounds = { x: 657, y: 710, width: 38, height: 52 };
const ultrasoundExamPortal = {
  id: "enter-ultrasound-exam-room",
  label: "Enter the ultrasound exam room",
  translation: "进入超声检查室",
  childSceneId: "ultrasound-exam-room",
  sourceVisualRegion: "portal-ultrasound-exam-room",
  ...ultrasoundCartPanelBounds,
  portraitMarker: { x: 676, y: 736, scaleToObject: true },
  enterScale: 3.4,
};
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

// Each anchor and its crop are measured on the original 1672 × 941 illustration.
// Rows hold the term, translation, point, first zoom level, crop and visible feature.
const sourceZones = [
  {
    id: "ct-bay",
    title: "CT bay",
    translation: "CT 检查区",
    description: "Inspect the CT gantry, aperture, couch, control details and the adjacent wash area.",
    x: 0,
    y: 80,
    width: 554,
    height: 430,
    targetScale: 2.35,
    labels: [
      ["CT gantry housing", "CT 机架外壳", 57, 228, 0, [23, 185, 68, 79], "White ring-shaped scanner housing at the far left"],
      ["CT patient couch", "CT 患者检查床", 327, 411, 1, [143, 285, 198, 167], "White sliding CT table carrying the long blue pad"],
      ["CT bay", "CT 检查区", 365, 367, 1, [12, 132, 401, 314], "Left imaging bay containing the ring scanner, couch and cabinet"],
      ["CT aperture", "CT 孔径", 164, 255, 2, [127, 228, 77, 59], "Round open bore through the center of the CT gantry"],
      ["CT couch cushion", "CT 床垫", 213, 344, 2, [195, 329, 44, 31], "Long blue cushion lying on the CT table"],
      ["CT couch base", "CT 床座", 248, 477, 3, [227, 466, 67, 20], "Low pedestal foot under the sliding CT table, visible through the glass"],
      ["CT scanner display", "CT 扫描器显示屏", 165, 187, 3, [151, 180, 30, 16], "Small dark rectangular display above the CT bore"],
      ["CT control panel", "CT 控制面板", 79, 270, 4, [66, 258, 26, 26], "Round cluster of controls on the left side of the gantry face"],
      ["CT room sink", "CT 室水槽", 305, 212, 3, [295, 208, 23, 10], "Small metal basin below the faucet behind the CT scanner"],
      ["CT room cabinet", "CT 室柜体", 357, 250, 2, [341, 224, 55, 51], "Wooden cupboard under the CT room countertop"],
      ["CT bay glass partition", "CT 区玻璃隔断", 490, 375, 4, [479, 348, 33, 61], "Blue-tinted glass running along the right side of the CT bay"],
    ],
  },
  {
    id: "mri-bay",
    title: "MRI bay",
    translation: "MRI 检查区",
    description: "Locate the magnet and head cradle, then follow the patient couch toward the separate console behind the glass.",
    x: 390,
    y: 40,
    width: 590,
    height: 430,
    targetScale: 2.4,
    labels: [
      ["MRI magnet housing", "MRI 磁体外壳", 550, 188, 0, [524, 155, 41, 66], "Outer white shell of the MRI magnet in the teal-walled bay"],
      ["MRI patient couch", "MRI 患者检查床", 788, 331, 1, [627, 245, 189, 110], "Sliding patient table projecting from the MRI bore"],
      ["MRI bay", "MRI 检查区", 833, 294, 1, [511, 80, 346, 327], "Central teal-walled imaging bay containing the MRI magnet and couch"],
      ["MRI tunnel", "MRI 隧道", 681, 198, 2, [633, 181, 58, 31], "Shadowed interior of the MRI bore behind the head cradle"],
      ["MRI couch pedestal", "MRI 床立柱", 733, 373, 2, [700, 360, 63, 27], "Stacked white pedestal supporting the MRI table"],
      ["MRI head cradle", "MRI 头部托架", 668, 221, 3, [643, 209, 49, 38], "Small arched white head support at the mouth of the MRI bore"],
      ["MRI cable loop", "MRI 电缆环", 662, 365, 4, [651, 343, 20, 31], "Dark hanging cable looping beside the MRI pedestal"],
      ["MRI control monitor", "MRI 控制监视器", 949, 320, 2, [918, 304, 52, 32], "Dark monitor on the separate desk behind the glass"],
      ["MRI equipment trolley", "MRI 设备推车", 797, 206, 3, [768, 140, 62, 113], "Open wheeled cart with shelves against the teal MRI wall"],
      ["MRI console desk", "MRI 控制台桌", 914, 374, 3, [895, 368, 37, 16], "Desktop beneath the MRI control monitor"],
      ["glass partition post", "玻璃隔断立柱", 895, 216, 4, [891, 181, 9, 76], "Upright blue metal post on the glass wall behind the MRI monitor"],
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
      ["mammography machine", "乳腺摄影机", 1070, 183, 0, [1002, 63, 88, 173], "Upright mammography unit in the small purple-walled room"],
      ["radiographic table", "放射摄影床", 1361, 321, 0, [1270, 226, 195, 131], "White X-ray examination table on a tiered pedestal"],
      ["X-ray tube arm", "X 光管支臂", 1294, 79, 1, [1253, 65, 80, 32], "Horizontal arm projecting from the wall to suspend the X-ray tube"],
      ["radiography room", "放射摄影室", 1442, 367, 1, [1142, 54, 519, 357], "Upper right room containing the suspended tube and the X-ray table"],
      ["mammography room", "乳腺摄影室", 1105, 157, 2, [950, 44, 170, 197], "Narrow purple-walled room around the mammography machine"],
      ["mammography compression paddle", "乳腺摄影压迫板", 1021, 136, 4, [1008, 131, 29, 10], "Thin upper paddle above the thicker black mammography support plate"],
      ["mammography detector plate", "乳腺摄影探测板", 1029, 164, 3, [1008, 157, 40, 15], "Lower black plate beneath the mammography compression paddle"],
      ["mammography support arm", "乳腺摄影支臂", 1046, 110, 3, [1039, 98, 14, 24], "Upright section of the moving arm just above its round pivot"],
      ["X-ray collimator", "X 光准直器", 1380, 169, 3, [1369, 160, 23, 18], "Small rectangular beam-limiting head under the suspended X-ray tube"],
      ["X-ray detector stand", "X 光探测器支架", 1512, 253, 2, [1495, 131, 32, 174], "Tall detector carrier on a wheeled column beside the X-ray table"],
      ["radiographic table pad", "放射摄影床垫", 1352, 257, 2, [1336, 248, 40, 17], "Pale top pad on the radiographic table"],
      ["detector stand base", "探测器支架底座", 1508, 317, 4, [1474, 311, 64, 13], "Low rectangular base supporting the detector column"],
      ["privacy screen caster", "隐私屏脚轮", 1583, 406, 4, [1577, 398, 12, 16], "Small front caster beneath the freestanding gray screen"],
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
      ["control workstation", "控制工作站", 138, 577, 0, [76, 499, 286, 124], "Foreground workstation with monitor, keyboard and white control console"],
      ["control room", "控制室", 392, 680, 1, [28, 465, 443, 285], "Glazed work area in front of the CT bay"],
      ["workstation monitor", "工作站监视器", 132, 540, 1, [82, 506, 91, 65], "Black monitor on the left side of the foreground desk"],
      ["control desk", "控制台桌", 321, 571, 2, [303, 562, 46, 17], "Exposed silver desktop at the right of the white console keypad"],
      ["console chair", "控制台椅", 196, 642, 2, [153, 607, 79, 62], "Black swivel chair in front of the control desk"],
      ["control keyboard", "控制键盘", 151, 593, 3, [126, 586, 49, 14], "Black computer keyboard in front of the workstation monitor"],
      ["console keypad", "控制台按键板", 238, 558, 4, [209, 550, 50, 15], "Separate white keypad on the desk to the right of the keyboard"],
      ["control-room glazing", "控制室玻璃窗", 413, 544, 2, [382, 511, 62, 77], "Blue-tinted glass beside the foreground desk"],
      ["glass partition frame", "玻璃隔断框", 465, 558, 3, [459, 511, 14, 93], "Right-hand upright of the frame surrounding the control-room glass"],
    ],
  },
  {
    id: "ultrasound-bay",
    title: "Ultrasound bay",
    translation: "超声检查区",
    description: "Find the blue-capped gel bottle next to the ultrasound controls, then compare the wheels under the cart and couch.",
    x: 500,
    y: 430,
    width: 620,
    height: 511,
    targetScale: 2.55,
    labels: [
      ["ultrasound machine", "超声机", 681, 640, 0, [615, 539, 158, 323], "Portable ultrasound unit with a raised monitor and an angled control console beside the blue couch"],
      ["exam couch cushion", "检查床垫", 918, 731, 0, [868, 694, 84, 64], "Middle blue upholstered section of the ultrasound examination couch"],
      ["ultrasound monitor", "超声监视器", 687, 571, 1, [645, 543, 90, 58], "Large upright black screen above the ultrasound console"],
      ["ultrasound bay", "超声检查区", 837, 855, 1, [544, 538, 535, 392], "Foreground examination area with a portable ultrasound unit, stool and blue couch"],
      ["ultrasound control panel", "超声控制面板", 711, 676, 2, [664, 654, 79, 32], "Angled keypad and circular trackball directly below the two screens"],
      ["ultrasound gel bottle", "超声耦合剂瓶", 758, 650, 3, [751, 627, 16, 38], "Upright white squeeze bottle with a blue nozzle in the console's right holder"],
      ["ultrasound cable loop", "超声电缆环", 761, 724, 4, [757, 701, 16, 29], "Hanging U-shaped cable immediately below the gel bottle"],
      ["ultrasound cart", "超声推车", 642, 757, 2, [627, 714, 51, 85], "Light gray mobile cart body supporting the ultrasound console"],
      ["ultrasound cart wheel", "超声推车脚轮", 668, 853, 4, [658, 840, 21, 26], "Near left caster directly attached to the ultrasound cart base"],
      ["exam couch wheel", "检查床脚轮", 900, 913, 4, [886, 893, 28, 36], "Large near caster under the white examination couch pedestal"],
      ["ultrasound machine base", "超声机底座", 703, 822, 3, [689, 816, 31, 12], "Dark bottom platform of the ultrasound unit above its casters"],
      ["floor guide stripe", "地面导向条", 780, 538, 3, [761, 531, 42, 16], "Broad blue floor stripe behind the ultrasound monitor"],
    ],
  },
  {
    id: "preparation-and-supplies",
    title: "Preparation and supplies",
    translation: "准备与物资区",
    description: "Find the hooked IV pole and supply cart, the garments on their rail and the sink in front of the cabinets.",
    x: 858,
    y: 370,
    width: 814,
    height: 571,
    targetScale: 2.6,
    labels: [
      ["supply cabinet", "物资柜", 1513, 615, 0, [1403, 578, 269, 326], "Gray, glass-fronted supply cabinet at the far right"],
      ["stainless sink", "不锈钢水槽", 1303, 870, 0, [1253, 837, 124, 70], "Rectangular steel washbasin in the foreground countertop"],
      ["IV pole", "输液杆", 1044, 462, 1, [1030, 426, 28, 89], "Thin vertical pole with two hooks above the preparation equipment"],
      ["wall clock face", "挂钟表盘", 1324, 522, 1, [1306, 499, 36, 48], "Round wall clock above the protective garments"],
      ["apron rack", "围裙架", 1269, 625, 1, [1237, 601, 74, 49], "Metal rail holding the row of hanging protective garments"],
      ["protective gown", "防护袍", 1297, 745, 2, [1289, 718, 20, 66], "Turquoise protective garment at the right end of the rack"],
      ["equipment cart drawer", "设备推车抽屉", 939, 519, 2, [914, 513, 44, 16], "Blue drawer front on the rolling equipment cabinet"],
      ["equipment cart caster", "设备推车脚轮", 909, 578, 4, [901, 570, 14, 16], "Near caster below the stack of blue drawers"],
      ["supply shelf", "物资搁板", 1454, 681, 3, [1445, 674, 20, 15], "Metal shelf under the top compartment of the glass supply cabinet"],
      ["sink mixer handle", "水槽混合龙头把手", 1367, 835, 4, [1362, 824, 11, 22], "Short upright lever next to the base of the curved faucet"],
      ["sink basin drain", "水槽盆排水口", 1316, 902, 4, [1303, 894, 23, 14], "Round drain at the lowest visible point of the steel basin"],
      ["sanitizer pump", "消毒液泵头", 1350, 670, 3, [1342, 661, 16, 18], "Blue push lever at the base of the white wall dispenser"],
      ["supply box", "物资盒", 1472, 669, 3, [1462, 657, 18, 24], "Small closed supply box visible in the cabinet's upper left compartment"],
      ["radiation indicator", "辐射指示灯", 1167, 393, 2, [1160, 384, 12, 17], "Red warning lamp on the dark indicator panel above the imaging room door"],
      ["radiology door handle", "影像科门把手", 1145, 596, 3, [1134, 586, 21, 19], "Silver lever on the left side of the gray imaging room door"],
      ["door vision panel", "门观察窗", 1180, 551, 2, [1169, 513, 23, 69], "Narrow glazed viewing panel set into the gray door"],
      ["imaging room wall", "影像室墙面", 1241, 502, 2, [1228, 481, 44, 53], "Off-white wall between the imaging room door and clock"],
      ["sink counter edge", "水槽台面边缘", 1230, 882, 4, [1224, 873, 16, 18], "Diagonal front edge of the white countertop to the left of the sink"],
    ],
  },
];

const relatedTerms = [
  ["ceiling light panel", "顶灯面板"],
  ["contrast injector tower", "造影剂注射塔"],
  ["contrast reservoir", "造影剂储液罐"],
  ["CT alignment light", "CT 定位灯"],
  ["CT couch handle", "CT 床把手"],
  ["injector control head", "注射器控制头"],
  ["injector hose", "注射器软管"],
  ["lead barrier", "防护屏"],
  ["ultrasound cart drawer", "超声推车抽屉"],
  ["ultrasound probe handle", "超声探头手柄"],
  ["ultrasound probe head", "超声探头头端"],
  ["X-ray detector cassette", "X 光探测器盒"],
  ["X-ray wall stand", "X 光壁挂支架"],
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

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel, crop, description] of zone.labels) {
      const id = `radiology-suite-${slugify(word)}`;
      const [left, top, width, height] = crop;
      const sourceVisualRegion = {
        id: `radiology-suite-region-${slugify(word)}`,
        description,
        kind: "part",
        ...sceneRectangle({ x: left, y: top, width, height }),
      };
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + minLevel + priorityIndex / 1000).toFixed(6)),
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
    visualRegions: [...visualRegions, {
      id: ultrasoundExamPortal.sourceVisualRegion,
      description: "Stack of four dark horizontal slots on the front of the ultrasound cart, below the keypad and above the base",
      kind: "part",
      ...ultrasoundCartPanelBounds,
    }],
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/radiology-suite-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The source illustration distinguishes the ultrasound monitor, console, squeeze bottle, hanging cable and two separate sets of casters. The CT, MRI, mammography and X-ray equipment, glazed control desk and foreground supplies have separate image regions. Vocabulary for parts and functions that the illustration cannot distinguish is kept in related words.",
      previousLabelCount: 93,
      retainedLabelCount: labels.length,
      removedLabelCount: 93 - labels.length,
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
    relatedWords: relatedTerms.map(([word, translation]) => ({
      id: `radiology-suite-${slugify(word)}`,
      word,
      translation,
    })),
    portals: [ultrasoundExamPortal],
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

const scannerBoreBounds = { x: 881, y: 417, width: 78, height: 83 };
const radiologyPortal = {
  id: "enter-radiology-suite",
  label: "Enter the radiology suite",
  translation: "进入放射影像科",
  childSceneId: "radiology-suite",
  sourceVisualRegion: "portal-radiology-scanner-bore",
  ...scannerBoreBounds,
  portraitMarker: { x: 954, y: 429 },
  enterScale: 3.4,
};

const scannerBoreRegion = {
  id: radiologyPortal.sourceVisualRegion,
  description: "Bore and upper-right housing of the blue-room scanner",
  kind: "part",
  ...scannerBoreBounds,
};

async function updateHospital() {
  const hospital = JSON.parse(await readFile(hospitalPath, "utf8"));
  const existingIndex = hospital.portals.findIndex(({ id }) => id === radiologyPortal.id);
  if (existingIndex >= 0) hospital.portals[existingIndex] = radiologyPortal;
  else {
    const pathologyIndex = hospital.portals.findIndex(({ childSceneId }) => childSceneId === "pathology-lab");
    const pharmacyIndex = hospital.portals.findIndex(({ childSceneId }) => childSceneId === "hospital-pharmacy");
    const insertionIndex = pathologyIndex >= 0 ? pathologyIndex + 1 : pharmacyIndex;
    hospital.portals.splice(insertionIndex >= 0 ? insertionIndex : hospital.portals.length, 0, radiologyPortal);
  }
  const regionIndex = hospital.visualRegions.findIndex(({ id }) => id === scannerBoreRegion.id);
  if (regionIndex >= 0) hospital.visualRegions[regionIndex] = scannerBoreRegion;
  else {
    const suiteIndex = hospital.visualRegions.findIndex(({ id }) => id === "radiology-suite");
    if (suiteIndex < 0) throw new Error("hospital is missing the radiology-suite image region");
    hospital.visualRegions.splice(suiteIndex + 1, 0, scannerBoreRegion);
  }
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
