import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the hemodialysis-unit terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; hospital integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/hemodialysis-unit-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/hemodialysis-unit-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/hemodialysis-unit.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "1b92372dc704651b3e2e0c0f9e402d57f7fb44bd3fccf218e7b1c68341982b1f";
const PUBLIC_ASSET_SHA256 = "fd89f968c45ae3139c699fd4a333c5eb7b5c10bdd053df35c56a9a6b8af964dc";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "dialysis-chair-and-monitor",
    title: "Dialysis chair and monitor",
    translation: "透析椅与监护器",
    description: "Inspect the unoccupied dialysis chair, bedside monitor, blood-pressure cuff, table and visible chair hardware.",
    x: 0,
    y: 220,
    width: 700,
    height: 700,
    targetScale: 2.55,
    labels: [
      ["Dialysis station reclining chair", "透析台躺椅", 360, 450, 0],
      ["Dialysis chair backrest", "透析椅靠背", 420, 350, 1],
      ["Dialysis chair head cushion", "透析椅头垫", 400, 290, 1],
      ["Dialysis chair seat cushion", "透析椅座垫", 420, 500, 1],
      ["Dialysis chair left armrest", "透析椅左扶手", 280, 470, 2],
      ["Dialysis chair right armrest", "透析椅右扶手", 600, 470, 2],
      ["Dialysis chair leg rest", "透析椅腿托", 510, 760, 0],
      ["Dialysis leg-rest hinge", "透析椅腿托铰链", 500, 700, 3],
      ["Dialysis chair side panel", "透析椅侧板", 250, 600, 2],
      ["Dialysis chair base", "透析椅底座", 420, 820, 0],
      ["Dialysis chair caster left", "透析椅左脚轮", 260, 820, 4],
      ["Dialysis chair caster right", "透析椅右脚轮", 550, 850, 4],
      ["Dialysis chair recline lever", "透析椅调节杆", 520, 650, 3],
      ["Dialysis chair foot pedal", "透析椅脚踏板", 250, 875, 0],
      ["Dialysis foot-pedal cable", "透析椅脚踏线", 230, 800, 3],
      ["Dialysis chair seam", "透析椅缝线", 420, 550, 4],
      ["Dialysis station bedside monitor", "透析台床旁监视器", 130, 350, 0],
      ["Dialysis monitor blank screen", "透析监视器空白屏幕", 130, 350, 1],
      ["Dialysis monitor bezel", "透析监视器边框", 130, 350, 2],
      ["Dialysis monitor rolling pole", "透析监视器滚轮杆", 120, 500, 1],
      ["Dialysis blood-pressure cuff", "透析血压袖带", 110, 450, 0],
      ["Dialysis cuff hose", "透析袖带软管", 160, 520, 3],
      ["Dialysis monitor connector cable", "透析监视器连接线", 180, 370, 2],
      ["Dialysis bedside table", "透析床旁桌", 180, 600, 0],
      ["Dialysis table edge", "透析床旁桌边缘", 180, 650, 3],
    ],
  },
  {
    id: "delivery-console-and-controls",
    title: "Dialysis delivery console",
    translation: "透析输送主机",
    description: "Explore the blank console screen, control panel, pump modules, doors, lower cabinet and mobile base.",
    x: 700,
    y: 0,
    width: 430,
    height: 900,
    targetScale: 2.6,
    labels: [
      ["Dialysis delivery console", "透析输送主机", 900, 400, 0],
      ["Dialysis console blank screen", "透析主机空白屏幕", 900, 150, 1],
      ["Dialysis console screen bezel", "透析主机屏幕边框", 900, 150, 2],
      ["Dialysis console upper housing", "透析主机上壳", 900, 250, 0],
      ["Dialysis console control panel", "透析主机控制面板", 900, 300, 1],
      ["Dialysis console button cluster", "透析主机按钮组", 820, 300, 3],
      ["Dialysis console left control knob", "透析主机左旋钮", 850, 280, 4],
      ["Dialysis console right control knob", "透析主机右旋钮", 1_000, 280, 4],
      ["Dialysis left pump module", "透析左泵模块", 820, 390, 0],
      ["Dialysis center pump module", "透析中泵模块", 900, 390, 0],
      ["Dialysis right pump module", "透析右泵模块", 980, 390, 0],
      ["Dialysis left pump rotor window", "透析左泵转子窗", 820, 390, 2],
      ["Dialysis center pump rotor window", "透析中泵转子窗", 900, 390, 2],
      ["Dialysis right pump rotor window", "透析右泵转子窗", 980, 390, 2],
      ["Dialysis left pump door", "透析左泵门", 820, 370, 3],
      ["Dialysis center pump door", "透析中泵门", 900, 370, 3],
      ["Dialysis right pump door", "透析右泵门", 980, 370, 3],
      ["Dialysis console side handle", "透析主机侧把手", 1_030, 260, 2],
      ["Dialysis console side panel", "透析主机侧板", 1_050, 500, 1],
      ["Dialysis console lower cabinet", "透析主机下柜", 900, 680, 0],
      ["Dialysis console lower drawer", "透析主机下抽屉", 900, 740, 2],
      ["Dialysis console drawer pull", "透析主机抽屉拉手", 900, 740, 4],
      ["Dialysis console base", "透析主机底座", 900, 820, 0],
      ["Dialysis console front caster", "透析主机前脚轮", 800, 860, 4],
      ["Dialysis console rear caster", "透析主机后脚轮", 1_050, 860, 4],
    ],
  },
  {
    id: "dialyzer-and-bloodline-circuit",
    title: "Dialyzer and bloodline circuit",
    translation: "透析器与血路管线",
    description: "Follow the clear dialyzer housing, caps, bloodline tubes, drip chambers, clamps, connectors and supports.",
    x: 950,
    y: 80,
    width: 300,
    height: 680,
    targetScale: 2.65,
    labels: [
      ["Dialysis station dialyzer", "透析台透析器", 1_060, 250, 0],
      ["Dialyzer transparent housing", "透析器透明壳", 1_060, 250, 1],
      ["Dialyzer top cap", "透析器顶盖", 1_060, 150, 2],
      ["Dialyzer bottom cap", "透析器底盖", 1_060, 360, 2],
      ["Dialyzer fluid chamber", "透析器流体腔", 1_060, 260, 3],
      ["Dialysis arterial bloodline", "透析动脉血路管", 1_010, 410, 0],
      ["Dialysis venous bloodline", "透析静脉血路管", 1_120, 410, 0],
      ["Dialysis upper bloodline connector", "透析上方血路接头", 1_020, 210, 2],
      ["Dialysis lower bloodline connector", "透析下方血路接头", 1_110, 500, 2],
      ["Dialysis arterial line clamp", "透析动脉管夹", 1_020, 450, 3],
      ["Dialysis venous line clamp", "透析静脉管夹", 1_110, 450, 3],
      ["Dialysis arterial drip chamber", "透析动脉滴壶", 1_010, 330, 1],
      ["Dialysis venous drip chamber", "透析静脉滴壶", 1_120, 330, 1],
      ["Dialysis drip-chamber holder", "透析滴壶托架", 1_060, 330, 2],
      ["Dialysis bloodline guide clip", "透析血路导向夹", 1_020, 550, 3],
      ["Dialysis bloodline support arm", "透析血路支臂", 1_150, 300, 1],
      ["Dialysis tubing junction", "透析管路接点", 1_060, 470, 2],
      ["Dialysis dialysate outlet tube", "透析液出口管", 1_160, 220, 2],
      ["Dialysis dialysate inlet tube", "透析液入口管", 1_120, 240, 2],
      ["Dialysis tubing clamp", "透析管路夹", 1_150, 520, 3],
      ["Dialysis clear tubing loop", "透析透明管路环", 1_100, 570, 1],
      ["Dialysis red tubing connector", "透析红色管路接头", 1_110, 470, 3],
      ["Dialysis blue tubing connector", "透析蓝色管路接头", 1_020, 470, 3],
      ["Dialyzer mounting bracket", "透析器安装支架", 1_100, 180, 1],
      ["Dialysis circuit support hook", "透析回路支撑钩", 1_150, 180, 4],
    ],
  },
  {
    id: "wall-box-and-water-connections",
    title: "Dialysis wall box and connections",
    translation: "透析墙箱与接口",
    description: "Inspect the recessed dialysis wall box, treated-water, concentrate, drain and electrical connections.",
    x: 1_150,
    y: 50,
    width: 450,
    height: 500,
    targetScale: 2.55,
    labels: [
      ["Dialysis station wall box", "透析台墙箱", 1_340, 200, 0],
      ["Dialysis wall-box recessed frame", "透析墙箱嵌入框", 1_340, 180, 1],
      ["Dialysis treated-water connector", "透析处理水接口", 1_260, 150, 1],
      ["Dialysis acid-concentrate connector", "透析酸浓缩液接口", 1_310, 150, 1],
      ["Dialysis bicarbonate connector", "透析碳酸氢盐接口", 1_360, 150, 1],
      ["Dialysis drain connector", "透析排水接口", 1_410, 150, 1],
      ["Dialysis blue connector hose", "透析蓝色接口软管", 1_260, 260, 2],
      ["Dialysis yellow connector hose", "透析黄色接口软管", 1_310, 260, 2],
      ["Dialysis red connector hose", "透析红色接口软管", 1_360, 260, 2],
      ["Dialysis gray connector hose", "透析灰色接口软管", 1_410, 260, 2],
      ["Dialysis wall-box drain hose", "透析墙箱排水软管", 1_420, 300, 3],
      ["Dialysis wall-box back panel", "透析墙箱背板", 1_340, 210, 0],
      ["Dialysis wall-box lower ledge", "透析墙箱下沿", 1_340, 330, 2],
      ["Dialysis wall-box left jamb", "透析墙箱左门框", 1_210, 200, 3],
      ["Dialysis wall-box right jamb", "透析墙箱右门框", 1_460, 200, 3],
      ["Dialysis wall-box top jamb", "透析墙箱上门框", 1_340, 80, 3],
      ["Dialysis wall-box bottom sill", "透析墙箱下门槛", 1_340, 330, 3],
      ["Dialysis wall electrical outlet", "透析墙面电源插座", 1_500, 350, 1],
      ["Dialysis wall dispenser", "透析墙面分配器", 1_530, 270, 0],
      ["Dialysis dispenser body", "透析分配器外壳", 1_530, 270, 2],
      ["Dialysis dispenser push plate", "透析分配器按压板", 1_530, 310, 3],
      ["Dialysis utility splash panel", "透析物资区挡水板", 1_500, 380, 1],
      ["Dialysis utility wall seam", "透析物资区墙缝", 1_520, 430, 3],
      ["Dialysis wall pipe clip", "透析墙管夹", 1_440, 300, 4],
      ["Dialysis connector backplate", "透析接口背板", 1_340, 300, 2],
    ],
  },
  {
    id: "utility-cart-and-disinfection",
    title: "Utility cart and disinfection area",
    translation: "物资车与清洁区",
    description: "Explore the closed-drawer supply cart, waste containers, sink, counter, cabinet and visible cleaning supplies.",
    x: 1_130,
    y: 100,
    width: 542,
    height: 800,
    targetScale: 2.55,
    labels: [
      ["Dialysis station supply cart", "透析台物资车", 1_260, 520, 0],
      ["Dialysis cart top", "透析物资车顶板", 1_260, 450, 1],
      ["Dialysis cart top tray", "透析物资车顶盘", 1_260, 450, 2],
      ["Dialysis cart upper drawer", "透析物资车上抽屉", 1_260, 520, 2],
      ["Dialysis cart middle drawer", "透析物资车中抽屉", 1_260, 590, 2],
      ["Dialysis cart lower drawer", "透析物资车下抽屉", 1_260, 660, 2],
      ["Dialysis cart drawer handle", "透析物资车抽屉拉手", 1_260, 590, 4],
      ["Dialysis cart side rail", "透析物资车侧护栏", 1_340, 470, 3],
      ["Dialysis cart front caster", "透析物资车前脚轮", 1_200, 720, 4],
      ["Dialysis cart rear caster", "透析物资车后脚轮", 1_330, 720, 4],
      ["Dialysis red waste container", "透析红色废物桶", 1_420, 400, 0],
      ["Dialysis red container lid", "透析红色废物桶盖", 1_420, 350, 2],
      ["Dialysis white waste bin", "透析白色废物桶", 1_430, 610, 0],
      ["Dialysis waste-bin rim", "透析废物桶边缘", 1_430, 550, 2],
      ["Dialysis waste-bin liner", "透析废物桶内衬", 1_430, 610, 3],
      ["Dialysis utility sink basin", "透析物资水槽盆", 1_560, 450, 0],
      ["Dialysis utility faucet", "透析物资水槽龙头", 1_580, 370, 1],
      ["Dialysis utility sink drain", "透析物资水槽排水口", 1_560, 480, 4],
      ["Dialysis utility counter", "透析物资台面", 1_560, 520, 0],
      ["Dialysis counter front edge", "透析物资台面前沿", 1_560, 570, 3],
      ["Dialysis lower cabinet door", "透析物资下柜门", 1_560, 680, 0],
      ["Dialysis cabinet handle", "透析物资柜把手", 1_620, 690, 3],
      ["Dialysis wipe holder", "透析清洁巾托架", 1_390, 450, 1],
      ["Dialysis folded wipe pack", "透析折叠清洁巾包", 1_350, 430, 2],
      ["Dialysis clean utility shelf", "透析清洁物资搁板", 1_560, 220, 1],
    ],
  },
  {
    id: "room-support-and-background",
    title: "Room support and background stations",
    translation: "房间设施与后方站位",
    description: "Follow the glass partition, background dialysis stations, privacy curtains, ceiling services, door hardware and floor.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.4,
    labels: [
      ["Dialysis background glass partition", "透析后方玻璃隔断", 500, 250, 0],
      ["Dialysis partition mullion", "透析隔断竖框", 500, 250, 2],
      ["Dialysis background chair", "透析后方椅", 60, 300, 0],
      ["Dialysis background machine", "透析后方机器", 240, 280, 0],
      ["Dialysis background monitor screen", "透析后方监视器屏幕", 240, 280, 1],
      ["Dialysis privacy curtain", "透析隐私帘", 450, 180, 0],
      ["Dialysis curtain track", "透析隐私帘轨", 450, 80, 2],
      ["Dialysis ceiling air diffuser", "透析室送风散流器", 200, 50, 2],
      ["Dialysis ceiling light panel", "透析室顶灯面板", 550, 40, 0],
      ["Dialysis glass door handle", "透析玻璃门把手", 650, 300, 3],
      ["Dialysis glass door frame", "透析玻璃门框", 650, 200, 1],
      ["Dialysis treatment-room window", "透析治疗室窗", 400, 200, 0],
      ["Dialysis window mullion", "透析室窗竖框", 400, 200, 2],
      ["Dialysis background side table", "透析后方床旁桌", 600, 400, 1],
      ["Dialysis background supply cabinet", "透析后方物资柜", 700, 220, 0],
      ["Dialysis background cabinet door", "透析后方物资柜门", 700, 220, 2],
      ["Dialysis corridor floor", "透析走廊地面", 500, 800, 0],
      ["Dialysis floor transition line", "透析地面过渡线", 500, 850, 3],
      ["Dialysis floor tile", "透析室地砖", 700, 800, 2],
      ["Dialysis wall handrail", "透析室墙面扶手", 600, 450, 1],
      ["Dialysis ceiling panel", "透析室顶板", 800, 20, 1],
      ["Dialysis room privacy screen", "透析室隐私屏", 520, 330, 0],
      ["Dialysis background IV pole", "透析后方输液杆", 550, 130, 2],
      ["Dialysis background machine cart", "透析后方设备车", 600, 330, 0],
      ["Dialysis room baseboard", "透析室墙脚线", 700, 480, 3],
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
    id: `hemodialysis-unit-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the hemodialysis-unit photograph`,
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
      const id = `hemodialysis-unit-${slugify(word)}`;
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
      id: `hemodialysis-unit-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "hemodialysis-unit",
    title: "Hemodialysis unit",
    translation: "血液透析室",
    subtitle: "Dialysis chair, delivery console, dialyzer and station support",
    asset: "/scenes/hemodialysis-unit-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "hospital",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/hemodialysis-unit-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized hemodialysis photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable dialysis-chair, console, dialyzer, bloodline, wall-box, utility, cleaning and room-support parts across ${detailZones.length} bounded zones. Patient identity, diagnoses, medication names, doses, readings, alarm states, treatment steps, blood or fluid claims, hidden functions, brands, readable screen content and signage were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "patient identity",
        "diagnosis",
        "medication name",
        "dose",
        "physiological reading",
        "alarm state",
        "treatment step",
        "hidden machine function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("hemodialysis source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`hemodialysis JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

export async function buildHemodialysisUnitScene() {
  const scene = buildScene();
  if (scene.labels.length < 145 || scene.labels.length > 155) {
    throw new Error(`hemodialysis label count ${scene.labels.length} is outside 145–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`hemodialysis zone count ${scene.detailZones.length} is not 6`);
  return {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildHemodialysisUnitScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-hemodialysis-unit-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
