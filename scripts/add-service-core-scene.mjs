import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal office service-core scene from its reviewed source
 * photograph. The five crops remain disjoint, while the parts below are new
 * to the existing office-building vocabulary and are never inferred from
 * invisible systems or operational states.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/office-service-core-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/office-service-core-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/service-core.json");
const officePath = resolve(projectRoot, "public/data/scenes/office-building.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "d8a8dff7b1e550054a1c582de08cfc27c35adbe1c813e2a78c02033e6f77cd37";
const PUBLIC_ASSET_SHA256 = "13b85aad4abb80939e27cc018ac5af21c1b6cabbb3a21dafb5aa04a27b189c8f";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "electrical-distribution",
    title: "Electrical distribution",
    translation: "电气配电区",
    description: "Inspect switchboard doors, transformer fins, cable trays and grounding hardware.",
    x: 0,
    y: 0,
    width: 780,
    height: 500,
    labels: [
      ["switchboard door", "配电柜门", 350, 220, 0],
      ["breaker handle", "断路器手柄", 360, 285, 0],
      ["panel louver", "面板百叶", 490, 225, 1],
      ["transformer fin", "变压器散热片", 150, 420, 1],
      ["conduit elbow", "导管弯头", 120, 145, 4],
      ["busbar insulator", "母线绝缘子", 540, 145, 2],
      ["junction box cover", "接线盒盖", 585, 160, 3],
      ["meter face", "仪表表盘", 125, 258, 4],
      ["equipment plinth", "设备底座", 155, 475, 2],
      ["access floor panel", "架空地板板块", 450, 430, 3],
      ["rack blanking plate", "机架挡板", 650, 270, 4],
      ["rack power strip", "机架电源排", 650, 320, 2],
      ["conduit coupling", "导管接头", 585, 145, 3],
      ["switchgear hinge", "开关设备铰链", 300, 200, 4],
      ["panel warning plate", "面板警示牌", 320, 245, 2],
      ["transformer base", "变压器底座", 150, 480, 3],
      ["battery terminal", "电池端子", 620, 360, 4],
      ["fuse carrier", "熔断器座", 575, 160, 2],
      ["disconnect handle", "隔离开关手柄", 245, 275, 3],
      ["cable tray bracket", "电缆桥架支架", 410, 70, 4],
    ],
  },
  {
    id: "hvac-mechanical",
    title: "HVAC mechanical room",
    translation: "暖通机械区",
    description: "Follow the air handler, duct seams, pipe unions, gauges and service supports.",
    x: 780,
    y: 0,
    width: 892,
    height: 400,
    labels: [
      ["filter pleat", "过滤器褶片", 1190, 255, 0],
      ["filter access door", "过滤器检修门", 1075, 220, 0],
      ["access door latch", "检修门闩", 1080, 245, 1],
      ["condensate drain", "冷凝水排水管", 1270, 370, 1],
      ["pipe union", "管道活接", 990, 260, 4],
      ["flanged joint", "法兰接头", 940, 140, 2],
      ["pump coupling", "水泵联轴器", 1010, 340, 3],
      ["expansion tank base", "膨胀罐底座", 860, 365, 4],
      ["vibration pad", "减振垫", 1040, 395, 2],
      ["duct seam", "风管接缝", 885, 140, 3],
      ["duct hanger", "风管吊架", 840, 60, 4],
      ["duct support", "风管支撑", 920, 80, 2],
      ["damper linkage", "风阀连杆", 1515, 80, 3],
      ["air intake grille", "进风格栅", 1600, 90, 4],
      ["return grille blade", "回风格栅叶片", 1590, 275, 2],
      ["service gauge", "检修压力表", 1000, 310, 3],
      ["pipe insulation seam", "管道保温接缝", 980, 165, 4],
      ["valve stem", "阀杆", 1020, 315, 2],
      ["fan hub", "风机轮毂", 1370, 250, 3],
      ["coil fin", "盘管翅片", 1180, 255, 4],
      ["drain pan edge", "接水盘边缘", 1130, 350, 2],
      ["duct access handle", "风管检修把手", 870, 200, 3],
    ],
  },
  {
    id: "fire-riser",
    title: "Fire protection riser",
    translation: "消防立管区",
    description: "Inspect the sprinkler riser, gauges, alarm hardware, door and safety fittings.",
    x: 0,
    y: 500,
    width: 600,
    height: 441,
    labels: [
      ["valve wheel", "阀轮", 150, 760, 0],
      ["test drain", "测试排水口", 270, 850, 0],
      ["sight glass", "视镜", 340, 770, 1],
      ["alarm strobe", "报警频闪灯", 395, 640, 1],
      ["pull station cover", "手动报警按钮盖", 480, 670, 4],
      ["fire door closer", "防火门闭门器", 530, 600, 2],
      ["panic bar", "推杆式逃生杆", 550, 670, 3],
      ["standpipe cap", "立管端盖", 80, 735, 4],
      ["pressure gauge bezel", "压力表圈", 205, 660, 2],
      ["pipe hanger", "管道吊架", 110, 580, 3],
      ["flow switch housing", "水流指示器外壳", 320, 750, 4],
      ["fire pump coupling", "消防泵联轴器", 250, 820, 2],
      ["drain funnel", "排水漏斗", 340, 875, 3],
      ["sprinkler branch line", "喷淋支管", 100, 560, 4],
      ["valve tag plate", "阀门铭牌", 220, 775, 2],
      ["alarm panel hinge", "报警面板铰链", 390, 655, 3],
      ["fire cabinet latch", "消防柜闩", 405, 655, 4],
      ["sprinkler valve handle", "喷淋阀手柄", 150, 730, 2],
    ],
  },
  {
    id: "janitorial-service",
    title: "Janitorial service area",
    translation: "清洁后勤区",
    description: "Explore the utility sink, cleaning carts, supply shelves and protective storage.",
    x: 600,
    y: 500,
    width: 570,
    height: 441,
    labels: [
      ["utility sink basin", "后勤水槽盆", 790, 590, 0],
      ["utility shelf bracket", "后勤搁架支架", 900, 525, 0],
      ["paper towel roll", "纸巾卷", 800, 520, 1],
      ["cabinet latch", "柜门闩", 1040, 550, 1],
      ["mop wringer", "拖把拧干器", 930, 710, 4],
      ["broom bristles", "扫帚刷毛", 810, 760, 2],
      ["hard hat shelf", "安全帽搁板", 1080, 535, 3],
      ["cleaning bottle rack", "清洁瓶架", 960, 660, 4],
      ["bin pedal", "垃圾桶踏板", 1090, 640, 2],
      ["recycling lid", "回收桶盖", 1130, 640, 3],
      ["utility faucet handle", "后勤水龙头把手", 810, 570, 4],
      ["sink backsplash", "水槽挡水板", 790, 535, 2],
      ["cleaning cart tray", "清洁车托盘", 930, 670, 3],
      ["yellow cabinet hinge", "黄色柜铰链", 1040, 550, 4],
    ],
  },
  {
    id: "loading-service",
    title: "Loading and service corridor",
    translation: "装卸与服务走廊",
    description: "Inspect the loading dock, elevator, pallet equipment and protective barriers.",
    x: 1_170,
    y: 400,
    width: 502,
    height: 541,
    labels: [
      ["dock plate", "装卸平台板", 1460, 600, 0],
      ["dock bumper", "装卸平台防撞垫", 1480, 650, 0],
      ["dock guide", "装卸平台导向件", 1430, 640, 1],
      ["pallet slat", "托盘板条", 1280, 800, 1],
      ["pallet jack handle", "托盘车把手", 1300, 780, 4],
      ["hand truck toe plate", "手推车底板", 1230, 700, 2],
      ["freight door track", "货运门轨道", 1510, 520, 3],
      ["dock shelter", "装卸平台防护罩", 1530, 520, 4],
      ["loading bay threshold", "装卸口门槛", 1500, 600, 2],
      ["cart side rail", "推车侧栏", 1420, 760, 3],
      ["pallet jack wheel", "托盘车轮", 1300, 835, 4],
      ["hand truck wheel", "手推车轮", 1220, 760, 2],
      ["service corridor light", "服务走廊灯", 1280, 520, 3],
      ["freight elevator seam", "货梯门缝", 1260, 560, 4],
      ["safety bollard sleeve", "安全防撞柱套", 1420, 650, 2],
      ["dock leveler hinge", "登车桥铰链", 1500, 620, 3],
    ],
  },
];

const servicePortal = {
  id: "enter-service-core",
  label: "Enter the service core",
  translation: "进入设备核心",
  childSceneId: "service-core",
  sourceVisualRegion: "portal-service-core",
  x: 1_320,
  y: 200,
  width: 280,
  height: 350,
  enterScale: 3.4,
};

const servicePortalRegion = {
  id: servicePortal.sourceVisualRegion,
  description: "Bright visible elevator, stairwell and building-service core on the office atrium photograph",
  kind: "object",
  x: servicePortal.x,
  y: servicePortal.y,
  width: servicePortal.width,
  height: servicePortal.height,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function slug(value) {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `service-core-${slug(word)}`;
      const sourceVisualRegion = {
        id: `service-core-region-${slug(word)}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the office service-core photograph`,
        kind: "part",
        ...sceneRectangle({
          x: Math.max(0, Math.min(SOURCE_WIDTH - 40, x - 20)),
          y: Math.max(0, Math.min(SOURCE_HEIGHT - 40, y - 20)),
          width: 40,
          height: 40,
        }),
      };
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: sourceVisualRegion.id,
      });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `service-core-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: 3.15,
      labelIds,
    });
  }
  return {
    id: "service-core",
    title: "Office service core",
    translation: "写字楼设备核心",
    subtitle: "Power, air, fire safety and building logistics",
    asset: "/scenes/office-service-core-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "office-building",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/office-service-core-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The final 1600 by 900 service-core photograph was inspected at source and output resolution. It supports 90 independently pointable parts across electrical distribution, HVAC equipment, fire protection, janitorial service and loading logistics. New terms stay on visible doors, handles, gauges, seams, supports, carts and dock hardware; electrical states, airflow, pressure values, safety compliance, maintenance actions, people and hidden system functions are excluded.",
      previousLabelCount: 96,
      retainedLabelCount: 90,
      removedLabelCount: 6,
      removedExamples: [
        "live circuit",
        "air quality",
        "fire compliance",
        "maintenance task",
        "loading schedule",
        "building operator",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("office service-core source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`office service-core JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function updateOfficeBuilding() {
  const office = JSON.parse(await readFile(officePath, "utf8"));
  const existingPortalIndex = office.portals.findIndex(({ id }) => id === servicePortal.id);
  if (existingPortalIndex === -1) office.portals.push(servicePortal);
  else office.portals[existingPortalIndex] = servicePortal;
  const existingRegionIndex = office.visualRegions.findIndex(({ id }) => id === servicePortalRegion.id);
  if (existingRegionIndex === -1) office.visualRegions.push(servicePortalRegion);
  else office.visualRegions[existingRegionIndex] = servicePortalRegion;
  return writeIfChanged(officePath, office);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "service-core");
  if (!existing) manifest.scenes.push({ id: "service-core", title: "Office service core", parentId: "office-building" });
  else if (existing.title !== "Office service core" || existing.parentId !== "office-building") throw new Error("service-core manifest entry has a different parent or title");
  return writeIfChanged(manifestPath, manifest);
}

export async function buildServiceCoreScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const officeChanged = await updateOfficeBuilding();
  const manifestChanged = await updateManifest();
  return { assetChanged, sceneChanged, officeChanged, manifestChanged, labels: scene.labels.length, zones: scene.detailZones.length };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildServiceCoreScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-service-core-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
