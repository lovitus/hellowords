import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the infusion-pump-rack terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; bedside-monitor-station integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/infusion-pump-rack-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/infusion-pump-rack-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/infusion-pump-rack.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "58e10b6cf62ecfd358804fb61d0f96be73f3e74e69a376e73e77e46834847f80";
const PUBLIC_ASSET_SHA256 = "5396395e45e4a1721f5bfa949e68bd9d3289d59cbb87941deae54e5b408ec724";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "upper-pump-modules",
    title: "Upper pump modules",
    translation: "上层输液泵模块",
    description: "Inspect the upper four generic pumps, blank displays, access doors, controls and rack hardware.",
    x: 620,
    y: 20,
    width: 330,
    height: 500,
    targetScale: 2.65,
    labels: [
      ["Pump rack upper frame", "泵架上部框架", 780, 50, 0],
      ["Top infusion pump", "顶部输液泵", 770, 90, 0],
      ["Top pump blank display", "顶部泵空白显示屏", 760, 90, 1],
      ["Top pump display bezel", "顶部泵显示屏边框", 760, 90, 2],
      ["Top pump control-button cluster", "顶部泵控制按钮组", 820, 90, 3],
      ["Top pump access door", "顶部泵门", 850, 110, 2],
      ["Second infusion pump", "第二层输液泵", 770, 210, 0],
      ["Second pump blank display", "第二层泵空白显示屏", 760, 210, 1],
      ["Second pump display bezel", "第二层泵显示屏边框", 760, 210, 2],
      ["Second pump control-button cluster", "第二层泵控制按钮组", 820, 210, 3],
      ["Second pump access door", "第二层泵门", 850, 225, 2],
      ["Third infusion pump", "第三层输液泵", 770, 320, 0],
      ["Third pump blank display", "第三层泵空白显示屏", 760, 320, 1],
      ["Third pump display bezel", "第三层泵显示屏边框", 760, 320, 2],
      ["Third pump control-button cluster", "第三层泵控制按钮组", 820, 320, 3],
      ["Third pump access door", "第三层泵门", 850, 340, 2],
      ["Fourth infusion pump", "第四层输液泵", 770, 430, 0],
      ["Fourth pump blank display", "第四层泵空白显示屏", 760, 430, 1],
      ["Fourth pump display bezel", "第四层泵显示屏边框", 760, 430, 2],
      ["Fourth pump control-button cluster", "第四层泵控制按钮组", 820, 430, 3],
      ["Fourth pump access door", "第四层泵门", 850, 450, 2],
      ["Pump carrier rail", "输液泵承载轨", 660, 260, 1],
      ["Pump-rack vertical rail", "输液泵架竖轨", 655, 200, 2],
      ["Pump-rack horizontal crossbar", "输液泵架横杆", 700, 150, 2],
      ["Pump mounting clamp", "输液泵安装夹", 650, 220, 3],
    ],
  },
  {
    id: "lower-pump-and-carrier",
    title: "Lower pump and carrier",
    translation: "下层输液泵与底架",
    description: "Follow the lower pumps, syringe cradle, carrier plates, cables, base platform and casters.",
    x: 580,
    y: 380,
    width: 370,
    height: 561,
    targetScale: 2.6,
    labels: [
      ["Fifth pump module", "第五层泵模块", 770, 550, 0],
      ["Fifth pump display", "第五层泵显示屏", 760, 550, 1],
      ["Fifth pump display bezel", "第五层泵显示屏边框", 760, 550, 2],
      ["Fifth pump button cluster", "第五层泵按钮组", 820, 550, 3],
      ["Fifth pump access door", "第五层泵门", 850, 550, 2],
      ["Syringe pump barrel cradle", "注射泵针筒托架", 760, 640, 0],
      ["Syringe pump barrel roller", "注射泵针筒滚轮", 770, 650, 3],
      ["Syringe pump front rail", "注射泵前护条", 830, 650, 2],
      ["Sixth pump module", "第六层泵模块", 770, 760, 0],
      ["Sixth pump display", "第六层泵显示屏", 760, 760, 1],
      ["Sixth pump display bezel", "第六层泵显示屏边框", 760, 760, 2],
      ["Sixth pump button cluster", "第六层泵按钮组", 820, 760, 3],
      ["Sixth pump access door", "第六层泵门", 850, 770, 2],
      ["Lower pump carrier plate", "下层泵承载板", 740, 820, 1],
      ["Lower rack vertical rail", "下层泵架竖轨", 655, 650, 2],
      ["Lower rack crossbar", "下层泵架横杆", 700, 700, 2],
      ["Rack base left caster", "泵架底座左脚轮", 600, 900, 4],
      ["Rack base right caster", "泵架底座右脚轮", 880, 900, 4],
      ["Rack base platform", "泵架底座平台", 760, 850, 0],
      ["Rack base front edge", "泵架底座前沿", 760, 880, 2],
      ["Rack base side brace", "泵架底座侧撑", 700, 850, 3],
      ["Pump power socket", "输液泵电源插口", 850, 540, 2],
      ["Pump power cable", "输液泵电源线", 880, 550, 2],
      ["Lower pump cable loop", "下层泵线缆环", 880, 700, 3],
      ["Lower pump rack clamp", "下层泵架夹具", 650, 650, 3],
    ],
  },
  {
    id: "carrier-and-tubing",
    title: "Carrier and tubing support",
    translation: "承载杆与管路支撑",
    description: "Explore the auxiliary carrier pole, clear shelves, collars, tubing guides, cable loops and wheeled base.",
    x: 780,
    y: 40,
    width: 450,
    height: 861,
    targetScale: 2.55,
    labels: [
      ["Auxiliary carrier pole", "辅助承载杆", 1_000, 300, 0],
      ["Carrier pole hook", "承载杆挂钩", 1_000, 70, 2],
      ["Carrier pole clamp", "承载杆夹具", 1_000, 360, 2],
      ["Top clear supply shelf", "顶部透明物资架", 1_000, 180, 0],
      ["Middle clear supply shelf", "中部透明物资架", 1_000, 320, 0],
      ["Lower clear supply shelf", "下部透明物资架", 1_000, 470, 0],
      ["Bottom clear supply shelf", "底部透明物资架", 1_000, 650, 0],
      ["Top shelf support collar", "顶部搁板支环", 1_000, 190, 3],
      ["Middle shelf support collar", "中部搁板支环", 1_000, 330, 3],
      ["Lower shelf support collar", "下部搁板支环", 1_000, 480, 3],
      ["Carrier pole base", "承载杆底座", 1_000, 850, 0],
      ["Carrier base caster left", "承载底座左脚轮", 940, 900, 4],
      ["Carrier base caster right", "承载底座右脚轮", 1_080, 900, 4],
      ["Pump tubing guide", "输液泵管路导向", 900, 430, 1],
      ["Clear infusion tube", "透明输液管", 920, 520, 2],
      ["Black power cable bundle", "黑色电源线束", 900, 350, 1],
      ["Power lead connector", "电源线连接头", 900, 350, 3],
      ["Cable hook", "线缆挂钩", 880, 300, 3],
      ["Tube support clip", "管路支撑夹", 1_030, 520, 3],
      ["Airway tube hanger", "气道管挂架", 1_100, 520, 2],
      ["Service pole crossbar", "服务杆横杆", 1_050, 400, 1],
      ["Service pole clamp knob", "服务杆夹具旋钮", 1_050, 400, 4],
      ["Tube guide ring", "管路导向环", 1_000, 570, 3],
      ["Cable tray loop", "线缆托环", 930, 420, 3],
      ["Carrier base front brace", "承载底座前撑", 1_000, 870, 2],
    ],
  },
  {
    id: "headwall-and-bedside",
    title: "Headwall and bedside bay",
    translation: "床头墙与床旁区",
    description: "Inspect the visible service rails, gas outlets, sockets, bedside monitor, bed controls and curtain.",
    x: 0,
    y: 120,
    width: 620,
    height: 821,
    targetScale: 2.55,
    labels: [
      ["Monitor station headwall panel", "监护台床头墙面板", 150, 250, 0],
      ["Upper wall service rail", "上层墙面服务轨", 180, 190, 1],
      ["Lower wall service rail", "下层墙面服务轨", 180, 300, 1],
      ["Headwall oxygen outlet", "床头墙氧气接口", 40, 210, 2],
      ["Headwall green gas outlet", "床头墙绿色气体接口", 80, 210, 2],
      ["Headwall yellow gas outlet", "床头墙黄色气体接口", 130, 210, 2],
      ["Headwall red outlet", "床头墙红色接口", 470, 250, 2],
      ["Headwall electrical socket row", "床头墙电源插座列", 180, 300, 0],
      ["Headwall left socket faceplate", "床头墙左插座面板", 180, 300, 3],
      ["Headwall center socket faceplate", "床头墙中插座面板", 220, 300, 3],
      ["Headwall right socket faceplate", "床头墙右插座面板", 260, 300, 3],
      ["Bedside small monitor", "床旁小监视器", 350, 180, 0],
      ["Bedside small blank screen", "床旁小空白屏幕", 350, 180, 1],
      ["Bedside small monitor bezel", "床旁小监视器边框", 350, 180, 2],
      ["Bedside monitor handle", "床旁监视器把手", 350, 260, 3],
      ["Bedside monitor support arm", "床旁监视器支臂", 320, 280, 1],
      ["Bedside monitor cable", "床旁监视器线缆", 330, 360, 2],
      ["Pump rack bedside bed headboard", "泵架旁病床头板", 450, 520, 0],
      ["Pump rack bedside bed mattress", "泵架旁病床床垫", 150, 600, 1],
      ["Monitor station bed side rail", "监护台病床护栏", 400, 560, 2],
      ["Pump rack bedside bed control handset", "泵架旁病床控制器", 260, 560, 0],
      ["Handset button panel", "控制器按钮面板", 260, 560, 3],
      ["Bed handset coiled cable", "病床控制器螺旋线", 300, 700, 3],
      ["Monitor station privacy curtain", "监护台隐私帘", 550, 300, 0],
      ["Monitor station curtain hem", "监护台隐私帘下摆", 550, 700, 3],
    ],
  },
  {
    id: "airway-and-suction",
    title: "Airway and suction equipment",
    translation: "气道与吸引设备",
    description: "Follow the blank-screen ventilator, corrugated airway tubing, humidifier chamber, suction canister and wheeled base.",
    x: 550,
    y: 430,
    width: 700,
    height: 511,
    targetScale: 2.6,
    labels: [
      ["Pump rack bedside ventilator", "泵架旁床旁呼吸机", 930, 520, 0],
      ["Ventilator blank screen", "呼吸机空白屏幕", 930, 520, 1],
      ["Ventilator screen bezel", "呼吸机屏幕边框", 930, 520, 2],
      ["Ventilator green control panel", "呼吸机绿色控制面板", 1_030, 500, 1],
      ["Ventilator side handle", "呼吸机侧把手", 1_050, 500, 3],
      ["Ventilator lower housing", "呼吸机下壳", 930, 600, 0],
      ["Left corrugated breathing tube", "左侧波纹呼吸管", 900, 650, 1],
      ["Right corrugated breathing tube", "右侧波纹呼吸管", 1_000, 650, 1],
      ["Blue airway tube", "蓝色气道管", 1_020, 700, 2],
      ["White airway tube", "白色气道管", 900, 700, 2],
      ["Left airway connector", "左侧气道接头", 900, 590, 3],
      ["Right airway connector", "右侧气道接头", 1_000, 590, 3],
      ["Humidifier chamber", "加湿罐", 990, 620, 0],
      ["Humidifier chamber lid", "加湿罐盖", 990, 600, 2],
      ["Humidifier water reservoir", "加湿罐水仓", 990, 650, 1],
      ["Transparent suction canister", "透明吸引罐", 620, 630, 0],
      ["Suction canister lid", "吸引罐盖", 620, 580, 2],
      ["Suction canister outlet", "吸引罐接口", 650, 630, 3],
      ["Pump rack suction tubing", "泵架旁吸引管路", 660, 660, 2],
      ["Suction canister hanger", "吸引罐挂架", 620, 550, 1],
      ["Ventilator wheel base", "呼吸机轮座", 930, 850, 0],
      ["Ventilator caster left", "呼吸机左脚轮", 870, 880, 4],
      ["Ventilator caster right", "呼吸机右脚轮", 1_050, 880, 4],
      ["Ventilator base front", "呼吸机底座前沿", 930, 800, 2],
      ["Ventilator power cable", "呼吸机电源线", 850, 730, 3],
    ],
  },
  {
    id: "rear-bay-and-clinical-cart",
    title: "Rear bay and clinical cart",
    translation: "后方病区与临床设备车",
    description: "Inspect the glazed rear bay, rear bed and monitor, ceiling services, corridor floor and drawer cart.",
    x: 1_050,
    y: 0,
    width: 622,
    height: 941,
    targetScale: 2.45,
    labels: [
      ["Pump rack rear glass partition", "泵架后方玻璃隔断", 1_300, 300, 0],
      ["Pump rack partition mullion", "泵架隔断竖框", 1_300, 300, 2],
      ["Pump rack rear ICU bed", "泵架后方 ICU 病床", 1_450, 600, 0],
      ["Pump rack rear bed headboard", "泵架后方病床头板", 1_450, 500, 1],
      ["Pump rack rear bed mattress", "泵架后方床垫", 1_450, 650, 1],
      ["Pump rack rear bed side rail", "泵架后方床护栏", 1_450, 700, 2],
      ["Pump rack rear bedside monitor", "泵架后方床旁监视器", 1_530, 300, 0],
      ["Pump rack rear monitor screen", "泵架后方监视器屏幕", 1_530, 300, 1],
      ["Pump rack rear monitor mount", "泵架后方监视器支架", 1_500, 320, 3],
      ["Pump rack rear service column", "泵架后方服务柱", 1_600, 350, 0],
      ["Pump rack rear oxygen outlet", "泵架后方氧气接口", 1_600, 380, 3],
      ["Pump rack rear ceiling boom", "泵架后方顶部吊臂", 1_550, 230, 0],
      ["Pump rack rear boom light", "泵架后方吊臂灯", 1_450, 220, 2],
      ["Pump rack rear ceiling light", "泵架后方顶灯", 1_400, 120, 2],
      ["Pump rack rear air diffuser", "泵架后方送风散流器", 1_200, 30, 3],
      ["Pump rack rear corridor floor", "泵架后方走廊地面", 1_300, 800, 2],
      ["Pump rack clinical drawer cart", "泵架临床抽屉车", 1_530, 650, 0],
      ["Pump rack cart top tray", "泵架设备车顶盘", 1_530, 520, 1],
      ["Pump rack cart upper drawer", "泵架设备车上抽屉", 1_530, 590, 2],
      ["Pump rack cart middle drawer", "泵架设备车中抽屉", 1_530, 670, 2],
      ["Pump rack cart lower drawer", "泵架设备车下抽屉", 1_530, 750, 2],
      ["Pump rack cart drawer handle", "泵架设备车抽屉把手", 1_530, 670, 4],
      ["Pump rack cart side rail", "泵架设备车侧护栏", 1_600, 500, 3],
      ["Pump rack cart front caster", "泵架设备车前脚轮", 1_500, 850, 4],
      ["Pump rack cart bumper", "泵架设备车防撞条", 1_600, 800, 3],
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
    id: `infusion-pump-rack-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the infusion-pump-rack photograph`,
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
      const id = `infusion-pump-rack-${slugify(word)}`;
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
      id: `infusion-pump-rack-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "infusion-pump-rack",
    title: "Infusion pump rack",
    translation: "输液泵架",
    subtitle: "Pump modules, carrier rails, tubing and bedside support",
    asset: "/scenes/infusion-pump-rack-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "bedside-monitor-station",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/infusion-pump-rack-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized infusion-pump photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable pump housings, blank displays, control surfaces, carrier rails, tubing supports, bed hardware and room fixtures across ${detailZones.length} bounded zones. Medication names, doses, flow rates, readings, alarm states, treatment advice, hidden functions, brands, readable screen content and patient identity were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "medication name",
        "dose",
        "flow rate",
        "physiological reading",
        "alarm state",
        "treatment advice",
        "brand name",
        "hidden pump function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("infusion-pump source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`infusion-pump JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

export async function buildInfusionPumpRackScene() {
  const scene = buildScene();
  if (scene.labels.length < 140 || scene.labels.length > 155) {
    throw new Error(`infusion-pump label count ${scene.labels.length} is outside 140–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`infusion-pump zone count ${scene.detailZones.length} is not 6`);
  return {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildInfusionPumpRackScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-infusion-pump-rack-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
