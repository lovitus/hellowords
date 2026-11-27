import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Author the hemodialysis-unit terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; hospital integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/hemodialysis-unit-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/hemodialysis-unit-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/hemodialysis-unit.json");

const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "1b92372dc704651b3e2e0c0f9e402d57f7fb44bd3fccf218e7b1c68341982b1f";
const PUBLIC_ASSET_SHA256 = "fd89f968c45ae3139c699fd4a333c5eb7b5c10bdd053df35c56a9a6b8af964dc";
// Keep original IDs when editing learner-facing words. Coordinates use the
// published JPEG. A row without coordinates is index-only.
const sourceZones = [
  {
    id: "dialysis-chair-and-monitor",
    title: "Dialysis chair and monitor",
    translation: "透析椅与监护器",
    description: "Inspect the unoccupied dialysis chair, bedside monitor, blood-pressure cuff, table and visible chair hardware.",
    x: 0,
    y: 210,
    width: 725,
    height: 680,
    targetScale: 2.55,
    labels: [
      ["dialysis-station-reclining-chair", "reclining dialysis chair", "透析躺椅", 344, 430, 0],
      ["dialysis-chair-backrest", "backrest", "靠背", 419, 454, 1],
      ["dialysis-chair-head-cushion", "head cushion", "头垫", 383, 277, 1],
      ["dialysis-chair-seat-cushion", "seat cushion", "座垫", 528, 554, 1],
      ["dialysis-chair-left-armrest", "left armrest", "扶手（画面左侧）", 278, 493, 2],
      ["dialysis-chair-right-armrest", "right armrest", "扶手（画面右侧）", 574, 455, 2],
      ["dialysis-chair-leg-rest", "leg rest", "腿托", 528, 719, 0],
      ["dialysis-leg-rest-hinge", "leg rest hinge", "腿托铰链", 399, 645, 3],
      ["dialysis-chair-side-panel", "chair side panel", "椅侧板", 330, 691, 2],
      ["dialysis-chair-base", "chair base", "椅子底座", 381, 786, 0],
      ["dialysis-chair-caster-left", "left chair caster", "椅子左脚轮（画面左侧）", 242, 712, 4],
      ["dialysis-chair-caster-right", "right chair caster", "椅子右脚轮（画面右侧）", 388, 841, 4],
      ["dialysis-chair-recline-lever", "recline lever", "靠背调节杆"],
      ["dialysis-chair-foot-pedal", "foot pedal", "脚踏板", 243, 846, 0],
      ["dialysis-foot-pedal-cable", "foot pedal cable", "脚踏板连接线", 329, 831, 3],
      ["dialysis-chair-seam", "upholstery seam", "椅面接缝", 449, 442, 4],
      ["dialysis-station-bedside-monitor", "bedside monitor", "床旁监视器", 126, 372, 0],
      ["dialysis-monitor-blank-screen", "blank monitor screen", "监视器空白屏幕", 145, 332, 1],
      ["dialysis-monitor-bezel", "monitor bezel", "监视器边框", 108, 323, 2],
      ["dialysis-monitor-rolling-pole", "monitor stand pole", "移动监视器支架立杆", 139, 724, 1],
      ["dialysis-blood-pressure-cuff", "blood pressure cuff", "血压袖带", 101, 457, 0],
      ["dialysis-cuff-hose", "cuff hose", "袖带软管"],
      ["dialysis-monitor-connector-cable", "monitor cable", "监视器连接线", 173, 430, 2],
      ["dialysis-bedside-table", "bedside table", "床旁桌", 198, 543, 0],
      ["dialysis-table-edge", "table edge", "桌边", 175, 573, 3],
    ],
  },
  {
    id: "delivery-console-and-controls",
    title: "Dialysis delivery console",
    translation: "透析输送主机",
    description: "Explore the blank console screen, control panel, pump modules, doors, lower cabinet and mobile base.",
    x: 680,
    y: 30,
    width: 375,
    height: 830,
    targetScale: 2.6,
    labels: [
      ["dialysis-delivery-console", "dialysis machine", "透析机", 907, 355, 0],
      ["dialysis-console-blank-screen", "blank machine screen", "透析机空白屏幕", 861, 143, 1],
      ["dialysis-console-screen-bezel", "machine screen bezel", "透析机屏幕边框", 744, 129, 2],
      ["dialysis-console-upper-housing", "upper housing", "主机上壳", 922, 107, 0],
      ["dialysis-console-control-panel", "control panel", "控制面板", 803, 257, 1],
      ["dialysis-console-button-cluster", "control buttons", "控制按钮组", 759, 256, 3],
      ["dialysis-console-left-control-knob", "left control knob", "左侧旋钮"],
      ["dialysis-console-right-control-knob", "right control knob", "右侧旋钮"],
      ["dialysis-left-pump-module", "left pump module", "左侧泵模块", 733, 359, 0],
      ["dialysis-center-pump-module", "center pump module", "中间泵模块", 780, 360, 0],
      ["dialysis-right-pump-module", "right pump module", "右侧泵模块", 825, 364, 0],
      ["dialysis-left-pump-rotor-window", "left pump window", "左侧泵转子观察窗", 750, 335, 2],
      ["dialysis-center-pump-rotor-window", "center pump window", "中间泵转子观察窗", 795, 336, 2],
      ["dialysis-right-pump-rotor-window", "right pump window", "右侧泵转子观察窗", 843, 341, 2],
      ["dialysis-left-pump-door", "left pump door", "左侧泵门", 752, 378, 3],
      ["dialysis-center-pump-door", "center pump door", "中间泵门", 795, 381, 3],
      ["dialysis-right-pump-door", "right pump door", "右侧泵门", 843, 383, 3],
      ["dialysis-console-side-handle", "machine side handle", "主机侧把手"],
      ["dialysis-console-side-panel", "machine side panel", "主机侧板", 958, 621, 1],
      ["dialysis-console-lower-cabinet", "lower machine cabinet", "主机下部柜体", 811, 644, 0],
      ["dialysis-console-lower-drawer", "machine drawer", "主机下抽屉"],
      ["dialysis-console-drawer-pull", "machine drawer pull", "主机抽屉拉手"],
      ["dialysis-console-base", "machine base", "主机底座", 855, 765, 0],
      ["dialysis-console-front-caster", "front machine caster", "主机前脚轮", 928, 827, 4],
      ["dialysis-console-rear-caster", "rear machine caster", "主机后脚轮", 1017, 749, 4],
    ],
  },
  {
    id: "dialyzer-and-bloodline-circuit",
    title: "Dialyzer and bloodline circuit",
    translation: "透析器与血路管线",
    description: "Follow the transparent dialyzer housing, end caps, tubing loop, clamp and colored connectors.",
    x: 905,
    y: 90,
    width: 200,
    height: 535,
    targetScale: 2.65,
    labels: [
      ["dialysis-station-dialyzer", "dialyzer", "透析器", 1024, 282, 0],
      ["dialyzer-transparent-housing", "clear dialyzer housing", "透析器透明外壳", 1042, 306, 1],
      ["dialyzer-top-cap", "top cap", "顶盖", 1028, 173, 2],
      ["dialyzer-bottom-cap", "bottom cap", "底盖", 1024, 402, 2],
      ["dialyzer-fluid-chamber", "fluid chamber", "流体腔"],
      ["dialysis-arterial-bloodline", "arterial bloodline", "动脉血路管"],
      ["dialysis-venous-bloodline", "venous bloodline", "静脉血路管"],
      ["dialysis-upper-bloodline-connector", "upper bloodline connector", "上方血路接头", 1027, 157, 2],
      ["dialysis-lower-bloodline-connector", "lower bloodline connector", "下方血路接头", 1021, 417, 2],
      ["dialysis-arterial-line-clamp", "arterial line clamp", "动脉管夹"],
      ["dialysis-venous-line-clamp", "venous line clamp", "静脉管夹"],
      ["dialysis-arterial-drip-chamber", "arterial drip chamber", "动脉滴壶"],
      ["dialysis-venous-drip-chamber", "venous drip chamber", "静脉滴壶"],
      ["dialysis-drip-chamber-holder", "drip chamber holder", "滴壶托架"],
      ["dialysis-bloodline-guide-clip", "bloodline guide clip", "血路导向夹"],
      ["dialysis-bloodline-support-arm", "bloodline support arm", "血路支臂"],
      ["dialysis-tubing-junction", "tubing junction", "管路连接处", 1027, 132, 2],
      ["dialysis-dialysate-outlet-tube", "dialysate outlet tube", "透析液出口管"],
      ["dialysis-dialysate-inlet-tube", "dialysate inlet tube", "透析液入口管"],
      ["dialysis-tubing-clamp", "tubing clamp", "管夹", 967, 411, 3],
      ["dialysis-clear-tubing-loop", "loop of clear tubing", "透明软管弯环", 948, 574, 1],
      ["dialysis-red-tubing-connector", "red tubing connector", "红色管路接头", 1057, 380, 3],
      ["dialysis-blue-tubing-connector", "blue tubing connector", "蓝色管路接头", 1071, 229, 3],
      ["dialyzer-mounting-bracket", "dialyzer mounting bracket", "透析器安装支架", 931, 228, 1],
      ["dialysis-circuit-support-hook", "tubing support hook", "管路支撑钩"],
    ],
  },
  {
    id: "wall-box-and-water-connections",
    title: "Dialysis wall box and connections",
    translation: "透析墙箱与接口",
    description: "Inspect the recessed wall box, its frame, colored connector hoses and the nearby wall dispenser.",
    x: 1135,
    y: 25,
    width: 465,
    height: 385,
    targetScale: 2.55,
    labels: [
      ["dialysis-station-wall-box", "dialysis wall box", "透析墙箱", 1219, 103, 0],
      ["dialysis-wall-box-recessed-frame", "recessed frame", "嵌入式边框", 1174, 91, 1],
      ["dialysis-treated-water-connector", "treated water connector", "处理水接口"],
      ["dialysis-acid-concentrate-connector", "acid concentrate connector", "酸性浓缩液接口"],
      ["dialysis-bicarbonate-connector", "bicarbonate connector", "碳酸氢盐接口"],
      ["dialysis-drain-connector", "drain connector", "排水接口"],
      ["dialysis-blue-connector-hose", "blue hose", "蓝色软管", 1304, 217, 2],
      ["dialysis-yellow-connector-hose", "yellow hose", "黄色软管", 1277, 225, 2],
      ["dialysis-red-connector-hose", "red hose", "红色软管", 1327, 222, 2],
      ["dialysis-gray-connector-hose", "gray hose", "灰色软管"],
      ["dialysis-wall-box-drain-hose", "drain hose", "排水软管"],
      ["dialysis-wall-box-back-panel", "back panel", "背板", 1345, 207, 0],
      ["dialysis-wall-box-lower-ledge", "lower ledge", "下沿平台", 1290, 273, 2],
      ["dialysis-wall-box-left-jamb", "left side of the frame", "左侧边框", 1162, 186, 3],
      ["dialysis-wall-box-right-jamb", "right side of the frame", "右侧边框", 1370, 187, 3],
      ["dialysis-wall-box-top-jamb", "top of the frame", "上边框", 1283, 60, 3],
      ["dialysis-wall-box-bottom-sill", "bottom of the frame", "底框", 1338, 284, 3],
      ["dialysis-wall-electrical-outlet", "electrical outlet", "电源插座"],
      ["dialysis-wall-dispenser", "wall-mounted dispenser", "壁挂式分配器", 1451, 248, 0],
      ["dialysis-dispenser-body", "dispenser housing", "分配器外壳", 1473, 229, 2],
      ["dialysis-dispenser-push-plate", "dispenser push plate", "分配器按压板"],
      ["dialysis-utility-splash-panel", "backsplash", "挡水板", 1551, 352, 1],
      ["dialysis-utility-wall-seam", "wall seam", "墙面接缝", 1454, 374, 3],
      ["dialysis-wall-pipe-clip", "pipe clip", "管夹卡扣"],
      ["dialysis-connector-backplate", "connector backplate", "接口背板", 1318, 129, 2],
    ],
  },
  {
    id: "utility-cart-and-disinfection",
    title: "Utility cart and disinfection area",
    translation: "物资车与清洁区",
    description: "Explore the supply cart, drawers, waste containers, utility sink, counter and cabinet.",
    x: 1105,
    y: 315,
    width: 495,
    height: 399,
    targetScale: 2.55,
    labels: [
      ["dialysis-station-supply-cart", "supply cart", "物资车", 1131, 516, 0],
      ["dialysis-cart-top", "cart top", "物资车顶板", 1147, 416, 1],
      ["dialysis-cart-top-tray", "cart tray", "物资车顶盘"],
      ["dialysis-cart-upper-drawer", "upper cart drawer", "物资车上抽屉", 1242, 452, 2],
      ["dialysis-cart-middle-drawer", "middle cart drawer", "物资车中抽屉", 1249, 504, 2],
      ["dialysis-cart-lower-drawer", "lower cart drawer", "物资车下抽屉", 1232, 584, 2],
      ["dialysis-cart-drawer-handle", "drawer handle", "抽屉拉手", 1198, 551, 4],
      ["dialysis-cart-side-rail", "trolley side rail", "物资车侧挂杆", 1307, 457, 3],
      ["dialysis-cart-front-caster", "front cart caster", "物资车前脚轮", 1275, 661, 4],
      ["dialysis-cart-rear-caster", "rear cart caster", "物资车后脚轮"],
      ["dialysis-red-waste-container", "red waste container", "红色废物桶", 1356, 444, 0],
      ["dialysis-red-container-lid", "red bin lid", "红色废物桶盖", 1352, 382, 2],
      ["dialysis-white-waste-bin", "white waste bin", "白色废物桶", 1351, 607, 0],
      ["dialysis-waste-bin-rim", "bin rim", "废物桶边缘", 1350, 545, 2],
      ["dialysis-waste-bin-liner", "bin liner", "垃圾袋", 1356, 526, 3],
      ["dialysis-utility-sink-basin", "sink basin", "水槽", 1498, 404, 0],
      ["dialysis-utility-faucet", "faucet", "水龙头", 1506, 343, 1],
      ["dialysis-utility-sink-drain", "sink drain", "水槽排水口"],
      ["dialysis-utility-counter", "countertop", "台面", 1581, 415, 0],
      ["dialysis-counter-front-edge", "counter edge", "台面前沿", 1548, 425, 3],
      ["dialysis-lower-cabinet-door", "lower cabinet door", "下柜门", 1493, 610, 0],
      ["dialysis-cabinet-handle", "cabinet handle", "柜门把手", 1576, 530, 3],
      ["dialysis-wipe-holder", "wipe holder", "清洁巾托架"],
      ["dialysis-folded-wipe-pack", "pack of folded wipes", "一包折叠清洁巾"],
      ["dialysis-clean-utility-shelf", "supply shelf", "清洁物资搁板"],
    ],
  },
  {
    id: "room-support-and-background",
    title: "Room support and background stations",
    translation: "房间设施与后方站位",
    description: "Look through the glass partition to the background chair, machine, curtains and supply cabinet.",
    x: 0,
    y: 0,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    targetScale: 2.4,
    labels: [
      ["dialysis-background-glass-partition", "glass partition", "玻璃隔断", 316, 146, 0],
      ["dialysis-partition-mullion", "glass partition mullion", "玻璃隔断竖框", 264, 136, 2],
      ["dialysis-background-chair", "background chair", "后方座椅", 29, 316, 0],
      ["dialysis-background-machine", "background dialysis machine", "后方透析机", 183, 266, 0],
      ["dialysis-background-monitor-screen", "background monitor screen", "后方监视器屏幕", 183, 215, 1],
      ["dialysis-privacy-curtain", "privacy curtain", "隐私帘", 519, 257, 0],
      ["dialysis-curtain-track", "curtain track", "帘轨"],
      ["dialysis-ceiling-air-diffuser", "ceiling air diffuser", "顶棚送风散流器", 139, 12, 2],
      ["dialysis-ceiling-light-panel", "rectangular ceiling light", "矩形顶灯", 49, 94, 0],
      ["dialysis-glass-door-handle", "glass door handle", "玻璃门把手"],
      ["dialysis-glass-door-frame", "glass door frame", "玻璃门框"],
      ["dialysis-treatment-room-window", "treatment room window", "治疗室窗户", 349, 202, 0],
      ["dialysis-window-mullion", "window mullion", "窗竖框"],
      ["dialysis-background-side-table", "side table", "边桌", 494, 315, 1],
      ["dialysis-background-supply-cabinet", "supply cupboard", "物资柜", 658, 243, 0],
      ["dialysis-background-cabinet-door", "supply cabinet door", "物资柜门", 661, 345, 2],
      ["dialysis-corridor-floor", "corridor floor", "走廊地面", 614, 402, 0],
      ["dialysis-floor-transition-line", "floor transition line", "地面交界线"],
      ["dialysis-floor-tile", "floor tile", "地砖"],
      ["dialysis-wall-handrail", "wall handrail", "墙面扶手"],
      ["dialysis-ceiling-panel", "ceiling panel", "顶板", 339, 21, 1],
      ["dialysis-room-privacy-screen", "privacy screen", "隐私屏风"],
      ["dialysis-background-iv-pole", "IV stand", "输液架", 558, 151, 2],
      ["dialysis-background-machine-cart", "equipment cart", "设备车"],
      ["dialysis-room-baseboard", "baseboard", "踢脚线", 1084, 568, 3],
    ],
  },
];

const visitVocabulary = [
  ["chronic kidney disease", "慢性肾脏病"],
  ["diabetic kidney disease", "糖尿病肾病"],
  ["acute kidney injury", "急性肾损伤"],
  ["kidney failure", "肾衰竭"],
  ["anemia", "贫血"],
  ["fluid overload", "液体超负荷"],
  ["hyperkalemia", "高钾血症"],
  ["hypertension", "高血压"],
  ["nephrology", "肾脏科"],
  ["nephrologist", "肾脏科医生"],
  ["dialysis nurse", "透析护士"],
  ["dialysis technician", "透析技师"],
  ["renal dietitian", "肾病营养师"],
  ["phosphate binder", "磷结合剂"],
  ["sevelamer", "司维拉姆"],
  ["calcitriol", "骨化三醇"],
  ["calcium acetate", "醋酸钙"],
  ["iron sucrose", "蔗糖铁"],
  ["hemodialysis", "血液透析"],
  ["dialysis session", "一次透析治疗"],
  ["dialysis schedule", "透析时间安排"],
  ["referral", "转诊"],
  ["follow-up appointment", "复诊预约"],
  ["blood test", "验血"],
  ["vascular access", "血管通路"],
  ["arteriovenous fistula", "动静脉内瘘"],
  ["arteriovenous graft", "动静脉人工血管"],
  ["dialysis catheter", "透析导管"],
  ["dry weight", "干体重"],
  ["transplant evaluation", "移植评估"],
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function visualRegionFor(key, word, x, y, zoneTitle) {
  const size = 20;
  return {
    id: `hemodialysis-unit-region-${key}`,
    description: `Visible point for “${word}” in the ${zoneTitle} area`,
    kind: "part",
    x: Math.max(0, Math.min(SCENE_WIDTH - size, x - size / 2)),
    y: Math.max(0, Math.min(SCENE_HEIGHT - size, y - size / 2)),
    width: size,
    height: size,
  };
}

function buildScene() {
  const labels = [];
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [key, word, translation, x, y, minLevel] of zone.labels) {
      const id = `hemodialysis-unit-${key}`;
      const priority = Number((1 + priorityIndex++ / 1000).toFixed(6));
      if (x === undefined) {
        relatedWords.push({ id, word, translation, semanticRealmId: "body-daily-life" });
        continue;
      }
      const region = visualRegionFor(key, word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x,
        y,
        priority,
        minLevel,
        sourceVisualRegion: region.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
    }
    detailZones.push({
      id: `hemodialysis-unit-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  const previousLabelCount = labels.length + relatedWords.length;
  const removedLabelCount = relatedWords.length;
  for (const [word, translation] of visitVocabulary) {
    relatedWords.push({ id: `hemodialysis-unit-${slugify(word)}`, word, translation, semanticRealmId: "body-daily-life" });
  }
  return {
    id: "hemodialysis-unit",
    title: "Hemodialysis unit",
    translation: "血液透析室",
    subtitle: "Dialysis chair, delivery console, dialyzer and station support",
    asset: "/scenes/hemodialysis-unit-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "hospital-reception",
    portraitOverviewLabelIds: ["hemodialysis-unit-dialysis-station-reclining-chair"],
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/hemodialysis-unit-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The published image shows separate points for the chair cushions and foot pedal, three pump windows, the dialyzer end caps and the blue, yellow and red wall-box hoses. ${removedLabelCount} original terms remain in the index because their objects or functions cannot be distinguished. The index also contains ${visitVocabulary.length} terms for a kidney care visit, including conditions, staff and generic medicines.`,
      previousLabelCount,
      retainedLabelCount: labels.length,
      removedLabelCount,
      removedExamples: [
        "arterial bloodline",
        "acid concentrate connector",
        "sink drain",
        "wall handrail",
      ],
    },
    labels,
    relatedWords,
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
  try {
    if (sha256(await readFile(publicAsset)) === PUBLIC_ASSET_SHA256) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { default: sharp } = await import("sharp");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`hemodialysis JPEG is not reproducible; got ${sha256(output)}`);
  await writeFile(publicAsset, output);
  return true;
}

export async function buildHemodialysisUnitScene() {
  const scene = buildScene();
  if (scene.labels.length + scene.relatedWords.length !== 150 + visitVocabulary.length) {
    throw new Error("Hemodialysis must retain the 150 original terms and the kidney care visit vocabulary");
  }
  if (scene.detailZones.length !== 6) throw new Error(`hemodialysis zone count ${scene.detailZones.length} is not 6`);
  return {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    relatedWords: scene.relatedWords.length,
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
