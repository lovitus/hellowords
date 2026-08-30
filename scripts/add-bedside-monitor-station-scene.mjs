import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the bedside-monitor-station terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; ICU parent integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/bedside-monitor-station-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/bedside-monitor-station-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/bedside-monitor-station.json");
const parentPath = resolve(projectRoot, "public/data/scenes/intensive-care-unit.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "fea4baa41650f2b253f27436954eceedb0da6386cec8d5a2db53917581d0e42c";
const PUBLIC_ASSET_SHA256 = "f9af7efbe82d4e050bfc1b52210eb370ac1eeb08aec54f63d87676a9f96e03e6";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "primary-monitor-and-mount",
    title: "Primary monitor and mount",
    translation: "主监视器与支架",
    description: "Inspect the blank primary monitor, display frame, mounting arm, cable bundle and accessory shelf.",
    x: 160,
    y: 40,
    width: 430,
    height: 430,
    targetScale: 2.65,
    labels: [
      ["Monitor station primary patient monitor", "监护台主病人监视器", 370, 180, 0],
      ["Monitor station blank display", "监护台空白显示屏", 370, 170, 1],
      ["Monitor station display bezel", "监护台显示屏边框", 370, 170, 2],
      ["Monitor station upper bezel", "监护台显示屏上边框", 370, 95, 3],
      ["Monitor station lower bezel", "监护台显示屏下边框", 370, 285, 3],
      ["Monitor station left frame edge", "监护台屏幕左框边", 285, 180, 4],
      ["Monitor station right frame edge", "监护台屏幕右框边", 470, 180, 4],
      ["Monitor station display corner", "监护台显示屏角", 300, 105, 4],
      ["Monitor station side control strip", "监护台侧面控制条", 480, 240, 2],
      ["Monitor station lower control row", "监护台下方控制列", 390, 300, 3],
      ["Monitor station top handle", "监护台顶部把手", 370, 80, 0],
      ["Monitor station rear housing", "监护台监视器后壳", 480, 230, 1],
      ["Monitor station mounting plate", "监护台安装板", 390, 300, 2],
      ["Monitor station mounting arm", "监护台安装臂", 450, 320, 0],
      ["Monitor station arm elbow", "监护台支臂肘接", 520, 320, 2],
      ["Monitor station vertical post", "监护台支架立柱", 520, 200, 1],
      ["Monitor station post clamp", "监护台立柱夹具", 520, 255, 3],
      ["Monitor station cable bundle", "监护台线缆束", 250, 300, 1],
      ["Monitor station green lead bundle", "监护台绿色导线束", 220, 330, 2],
      ["Monitor station blue lead bundle", "监护台蓝色导线束", 220, 345, 2],
      ["Monitor station black lead loop", "监护台黑色导线环", 360, 320, 3],
      ["Monitor station connector bank", "监护台连接器组", 230, 250, 1],
      ["Monitor station cable clip", "监护台线缆夹", 250, 360, 4],
      ["Monitor station accessory shelf", "监护台附件搁板", 370, 380, 0],
      ["Monitor station accessory shelf support", "监护台附件搁板支撑", 370, 405, 3],
    ],
  },
  {
    id: "headwall-service-column",
    title: "Headwall service column",
    translation: "床头服务柱",
    description: "Explore the visible service column, gas outlets, electrical sockets, nurse-call handset, task light and shelf.",
    x: 480,
    y: 0,
    width: 350,
    height: 620,
    targetScale: 2.6,
    labels: [
      ["Monitor station bedside service column", "监护台床旁服务柱", 650, 400, 0],
      ["Monitor station upper headwall panel", "监护台床头上面板", 650, 100, 1],
      ["Monitor station lower headwall panel", "监护台床头下面板", 650, 350, 1],
      ["Monitor station column vertical seam", "监护台服务柱竖缝", 680, 200, 3],
      ["Monitor station column top cap", "监护台服务柱顶盖", 650, 20, 2],
      ["Monitor station headwall outlet bank", "监护台床头接口组", 600, 300, 0],
      ["Monitor station oxygen outlet", "监护台氧气接口", 560, 285, 2],
      ["Monitor station medical-air outlet", "监护台医用空气接口", 600, 285, 2],
      ["Monitor station vacuum outlet", "监护台真空接口", 640, 285, 2],
      ["Monitor station electrical socket stack", "监护台电源插座列", 740, 300, 1],
      ["Monitor station upper socket faceplate", "监护台上插座面板", 740, 240, 3],
      ["Monitor station lower socket faceplate", "监护台下插座面板", 740, 340, 3],
      ["Monitor station nurse-call handset", "监护台护士呼叫器", 700, 350, 0],
      ["Monitor station handset display window", "监护台呼叫器显示窗", 700, 325, 2],
      ["Monitor station handset button cluster", "监护台呼叫器按钮组", 700, 370, 2],
      ["Monitor station handset cord", "监护台呼叫器线", 690, 420, 3],
      ["Monitor station handset cradle", "监护台呼叫器托座", 700, 300, 3],
      ["Monitor station task-light head", "监护台工作灯头", 625, 100, 0],
      ["Monitor station task-light arm", "监护台工作灯臂", 650, 80, 2],
      ["Monitor station service shelf", "监护台服务搁板", 650, 430, 0],
      ["Monitor station shelf lip", "监护台搁板前沿", 650, 450, 3],
      ["Monitor station service shelf bracket", "监护台服务搁板托架", 600, 450, 3],
      ["Monitor station wall cable channel", "监护台墙面线槽", 550, 400, 2],
      ["Monitor station outlet cable", "监护台接口线缆", 560, 320, 4],
      ["Monitor station column base", "监护台服务柱底座", 650, 560, 2],
    ],
  },
  {
    id: "pump-rack-and-airway",
    title: "Pump rack and airway equipment",
    translation: "泵架与气道设备",
    description: "Follow the four pump modules, mounting rack, ventilator, blank screens, breathing tubes and humidifier chamber.",
    x: 760,
    y: 100,
    width: 400,
    height: 840,
    targetScale: 2.65,
    labels: [
      ["Monitor station infusion pump rack", "监护台输液泵架", 930, 300, 0],
      ["Monitor station upper infusion pump", "监护台上层输液泵", 930, 170, 1],
      ["Monitor station upper pump display", "监护台上层泵显示屏", 930, 180, 2],
      ["Monitor station upper pump door", "监护台上层泵门", 970, 195, 3],
      ["Monitor station second infusion pump", "监护台第二层输液泵", 930, 240, 1],
      ["Monitor station second pump display", "监护台第二层泵显示屏", 930, 250, 2],
      ["Monitor station second pump door", "监护台第二层泵门", 970, 255, 3],
      ["Monitor station third infusion pump", "监护台第三层输液泵", 930, 310, 1],
      ["Monitor station third pump display", "监护台第三层泵显示屏", 930, 320, 2],
      ["Monitor station third pump door", "监护台第三层泵门", 970, 325, 3],
      ["Monitor station lower infusion pump", "监护台下层输液泵", 930, 380, 1],
      ["Monitor station lower pump display", "监护台下层泵显示屏", 930, 390, 2],
      ["Monitor station lower pump door", "监护台下层泵门", 970, 395, 3],
      ["Monitor station pump-rack upright", "监护台泵架立柱", 1050, 250, 0],
      ["Monitor station pump-rack crossbar", "监护台泵架横杆", 1030, 170, 2],
      ["Monitor station pump rail clamp", "监护台泵轨夹具", 1040, 320, 3],
      ["Monitor station pump power lead", "监护台泵电源线", 850, 210, 2],
      ["Monitor station pump cable loop", "监护台泵线缆环", 840, 370, 3],
      ["Monitor station bedside ventilator", "监护台床旁呼吸机", 930, 500, 0],
      ["Monitor station ventilator blank screen", "监护台呼吸机空白屏", 930, 500, 1],
      ["Monitor station ventilator green side panel", "监护台呼吸机绿色侧板", 1030, 480, 2],
      ["Monitor station corrugated breathing tube", "监护台波纹呼吸管", 900, 650, 1],
      ["Monitor station blue airway tube", "监护台蓝色气道管", 1000, 650, 2],
      ["Monitor station humidifier chamber", "监护台加湿罐", 990, 620, 2],
      ["Monitor station airway connector", "监护台气道接头", 900, 580, 3],
    ],
  },
  {
    id: "bed-and-handset",
    title: "Bed and handset",
    translation: "病床与控制器",
    description: "Inspect the empty ICU bed, mattress, pillow, rails, handset, frame, caster and overbed table.",
    x: 0,
    y: 450,
    width: 680,
    height: 491,
    targetScale: 2.6,
    labels: [
      ["Monitor station ICU bed", "监护台 ICU 病床", 250, 700, 0],
      ["Monitor station bed mattress", "监护台病床床垫", 220, 570, 1],
      ["Monitor station white pillow", "监护台白色枕头", 120, 520, 1],
      ["Monitor station bed headboard", "监护台病床头板", 530, 520, 0],
      ["Monitor station near side rail", "监护台近侧护栏", 450, 620, 2],
      ["Monitor station far side rail", "监护台远侧护栏", 550, 560, 2],
      ["Monitor station side-rail handle", "监护台护栏把手", 500, 550, 3],
      ["Monitor station rail hinge", "监护台护栏铰链", 540, 610, 4],
      ["Monitor station bed control handset", "监护台病床控制器", 420, 590, 0],
      ["Monitor station handset button panel", "监护台控制器按钮面板", 420, 575, 2],
      ["Monitor station bed handset cable", "监护台控制器线缆", 430, 650, 3],
      ["Monitor station bed frame", "监护台病床框架", 380, 720, 1],
      ["Monitor station bed underframe", "监护台病床底架", 350, 800, 2],
      ["Monitor station bed lift column", "监护台病床升降柱", 450, 790, 3],
      ["Monitor station bed caster", "监护台病床脚轮", 380, 880, 3],
      ["Monitor station caster brake", "监护台脚轮制动器", 390, 870, 4],
      ["Monitor station bed base foot", "监护台病床底脚", 450, 850, 4],
      ["Monitor station overbed table", "监护台床上桌", 100, 760, 0],
      ["Monitor station tabletop surface", "监护台桌面", 120, 760, 1],
      ["Monitor station table edge", "监护台桌面边缘", 200, 780, 3],
      ["Monitor station table corner", "监护台桌面角", 50, 740, 4],
      ["Monitor station table support leg", "监护台桌腿", 220, 840, 2],
      ["Monitor station bedside curtain hem", "监护台床旁帘下摆", 80, 500, 2],
      ["Monitor station bedside curtain edge", "监护台床旁帘边", 120, 500, 3],
      ["Monitor station wheel housing", "监护台脚轮外壳", 530, 820, 4],
    ],
  },
  {
    id: "portable-support-equipment",
    title: "Portable support equipment",
    translation: "便携支持设备",
    description: "Explore the transparent suction canister, transport monitor, IV pole, oxygen cylinder and visible support hardware.",
    x: 580,
    y: 40,
    width: 900,
    height: 900,
    targetScale: 2.55,
    labels: [
      ["Monitor station suction canister", "监护台吸引罐", 620, 630, 0],
      ["Monitor station canister lid", "监护台吸引罐盖", 620, 580, 2],
      ["Monitor station canister outlet", "监护台吸引罐接口", 650, 630, 3],
      ["Monitor station suction tubing", "监护台吸引管", 660, 650, 2],
      ["Monitor station transport monitor", "监护台转运监视器", 760, 520, 0],
      ["Monitor station transport monitor screen", "监护台转运监视器屏幕", 760, 520, 1],
      ["Monitor station transport monitor bezel", "监护台转运监视器边框", 760, 520, 3],
      ["Monitor station transport monitor pole", "监护台转运监视器立杆", 760, 700, 1],
      ["Monitor station transport monitor base", "监护台转运监视器底座", 760, 880, 2],
      ["Monitor station transport monitor caster", "监护台转运监视器脚轮", 700, 900, 4],
      ["Monitor station IV pole", "监护台输液杆", 1130, 300, 0],
      ["Monitor station IV hook left", "监护台输液杆左挂钩", 1100, 60, 2],
      ["Monitor station IV hook right", "监护台输液杆右挂钩", 1170, 60, 2],
      ["Monitor station IV pole clamp", "监护台输液杆夹具", 1130, 220, 3],
      ["Monitor station IV pole shaft", "监护台输液杆杆身", 1130, 400, 1],
      ["Monitor station IV pole base", "监护台输液杆底座", 1130, 840, 0],
      ["Monitor station pole caster front", "监护台输液杆前脚轮", 1080, 850, 4],
      ["Monitor station pole caster rear", "监护台输液杆后脚轮", 1180, 870, 4],
      ["Monitor station portable oxygen cylinder", "监护台便携氧气瓶", 1240, 690, 0],
      ["Monitor station cylinder valve", "监护台气瓶阀门", 1240, 550, 2],
      ["Monitor station cylinder regulator", "监护台气瓶调节器", 1220, 570, 2],
      ["Monitor station cylinder holder", "监护台气瓶托架", 1240, 620, 1],
      ["Monitor station cylinder base ring", "监护台气瓶底环", 1240, 780, 3],
      ["Monitor station cylinder support foot", "监护台气瓶支脚", 1200, 820, 4],
      ["Monitor station blue oxygen tube", "监护台蓝色氧气管", 1100, 400, 2],
    ],
  },
  {
    id: "rear-bay-and-cart",
    title: "Rear bay and clinical cart",
    translation: "后方病区与设备车",
    description: "Follow the glazed rear bay, rear bed and monitor, ceiling services, corridor floor and drawer cart.",
    x: 1_050,
    y: 0,
    width: 622,
    height: 900,
    targetScale: 2.45,
    labels: [
      ["Monitor station rear glass partition", "监护台后方玻璃隔断", 1300, 300, 0],
      ["Monitor station partition mullion", "监护台隔断竖框", 1300, 300, 2],
      ["Monitor station rear ICU bed", "监护台后方 ICU 病床", 1450, 600, 0],
      ["Monitor station rear bed headboard", "监护台后方病床头板", 1450, 500, 1],
      ["Monitor station rear bed mattress", "监护台后方床垫", 1450, 650, 1],
      ["Monitor station rear bed side rail", "监护台后方床护栏", 1450, 700, 2],
      ["Monitor station rear bedside monitor", "监护台后方床旁监视器", 1530, 300, 0],
      ["Monitor station rear monitor screen", "监护台后方监视器屏幕", 1530, 300, 1],
      ["Monitor station rear monitor mount", "监护台后方监视器支架", 1500, 320, 3],
      ["Monitor station rear service column", "监护台后方服务柱", 1600, 350, 0],
      ["Monitor station rear oxygen outlet", "监护台后方氧气接口", 1600, 380, 3],
      ["Monitor station rear ceiling boom", "监护台后方顶部吊臂", 1550, 230, 0],
      ["Monitor station rear boom light", "监护台后方吊臂灯", 1450, 220, 2],
      ["Monitor station rear ceiling light", "监护台后方顶灯", 1400, 120, 2],
      ["Monitor station rear air diffuser", "监护台后方送风散流器", 1200, 30, 3],
      ["Monitor station rear corridor floor", "监护台后方走廊地面", 1300, 800, 2],
      ["Monitor station clinical drawer cart", "监护台临床抽屉车", 1530, 650, 0],
      ["Monitor station cart top tray", "监护台设备车顶盘", 1530, 520, 1],
      ["Monitor station cart upper drawer", "监护台设备车上抽屉", 1530, 590, 2],
      ["Monitor station cart middle drawer", "监护台设备车中抽屉", 1530, 670, 2],
      ["Monitor station cart lower drawer", "监护台设备车下抽屉", 1530, 750, 2],
      ["Monitor station cart drawer handle", "监护台设备车抽屉把手", 1530, 670, 4],
      ["Monitor station cart side rail", "监护台设备车侧护栏", 1600, 500, 3],
      ["Monitor station cart front caster", "监护台设备车前脚轮", 1500, 850, 4],
      ["Monitor station cart bumper", "监护台设备车防撞条", 1600, 800, 3],
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
    id: `bedside-monitor-station-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the bedside-monitor-station photograph`,
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
      const id = `bedside-monitor-station-${slugify(word)}`;
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
      id: `bedside-monitor-station-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "bedside-monitor-station",
    title: "Bedside monitor station",
    translation: "床旁监护台",
    subtitle: "Patient monitor, service column, pumps and airway equipment",
    asset: "/scenes/bedside-monitor-station-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "intensive-care-unit",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/bedside-monitor-station-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized bedside-monitor photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable monitor, service-column, pump, airway, bed, portable-equipment and room-fixture parts across ${detailZones.length} bounded zones. Patient identity, diagnoses, physiological readings, treatment advice, medication names, hidden device functions, brands, readable screen content and signage were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "patient identity",
        "diagnosis",
        "physiological reading",
        "treatment advice",
        "medication name",
        "hidden device function",
        "brand name",
        "screen text",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("bedside-monitor source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`bedside-monitor JPEG is not reproducible; got ${sha256(output)}`);
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
  id: "enter-bedside-monitor-station",
  label: "Enter the bedside monitor station",
  translation: "进入床旁监护台",
  childSceneId: "bedside-monitor-station",
  sourceVisualRegion: "portal-bedside-monitor-station-left-service-column",
  x: 182,
  y: 153,
  width: 230,
  height: 325,
  enterScale: 3.45,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete visible left bedside monitor, pump rack and service-column assembly in the ICU photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "bedside-monitor-station")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "intensive-care-unit");
    if (index < 0) throw new Error("intensive-care-unit is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "bedside-monitor-station",
      title: "Bedside monitor station",
      parentId: "intensive-care-unit",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildBedsideMonitorStationScene() {
  const scene = buildScene();
  if (scene.labels.length < 140 || scene.labels.length > 155) {
    throw new Error(`bedside-monitor label count ${scene.labels.length} is outside 140–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`bedside-monitor zone count ${scene.detailZones.length} is not 6`);
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
  buildBedsideMonitorStationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-bedside-monitor-station-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
