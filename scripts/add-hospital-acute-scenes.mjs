import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author two connected hospital scenes from reviewed source photographs.
 * By default this writes only the new scene JSON and validates the two image
 * pipelines. Pass --integrate when the main branch is ready to update the
 * shared hospital parent and scene manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const hospitalPath = resolve(projectRoot, "public/data/scenes/hospital.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const sourceRoot = resolve(projectRoot, "scripts/assets");
const publicRoot = resolve(projectRoot, "public/scenes");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sceneDefinitions = [
  {
    id: "emergency-department",
    title: "Emergency department",
    translation: "急诊科",
    subtitle: "Triage, resuscitation and examination bays",
    sourceFile: "emergency-department-v1.png",
    publicFile: "emergency-department-premium-v1.jpg",
    sourceSha256: "154a830df6496a766b628b87031e3a56e226b9feda147a07010dc331d1eac3a5",
    publicSha256: "0d5878b4fa27bb1cff5c82d21e8e28aa4e22c8d1885160bd9f2dc3191d94ec47",
    zones: [
      {
        id: "triage-and-reception",
        title: "Triage and reception",
        translation: "分诊与接待",
        description: "Inspect the triage counter, reception workstation, wheelchair and waiting-room fixtures.",
        x: 0,
        y: 0,
        width: 440,
        height: 900,
        targetScale: 2.35,
        labels: [
          ["triage bay", "分诊区", 220, 330, 0],
          ["triage counter", "分诊柜台", 190, 310, 0],
          ["triage workstation", "分诊工作站", 145, 350, 1],
          ["triage monitor", "分诊监视器", 145, 300, 2],
          ["triage keyboard", "分诊键盘", 145, 390, 3],
          ["triage desk lamp", "分诊台灯", 265, 300, 3],
          ["triage counter edge", "分诊柜台边缘", 330, 350, 2],
          ["reception display", "接待显示屏", 220, 110, 1],
          ["reception display frame", "接待显示屏框", 220, 110, 3],
          ["waiting wheelchair", "候诊轮椅", 90, 560, 0],
          ["wheelchair armrest", "轮椅扶手", 90, 530, 2],
          ["wheelchair wheel", "轮椅车轮", 60, 640, 3],
          ["ED waiting chair", "急诊候诊椅", 230, 760, 0],
          ["ED chair cushion", "急诊椅坐垫", 230, 730, 2],
          ["ED lobby plant", "急诊大厅植物", 30, 780, 1],
          ["ED plant pot", "急诊植物盆", 30, 840, 3],
          ["hand sanitizer dispenser", "洗手液分配器", 270, 220, 1],
          ["triage wall outlet", "分诊墙面插座", 385, 240, 3],
          ["triage doorway", "分诊门口", 350, 100, 0],
          ["triage floor threshold", "分诊地面门槛", 350, 430, 4],
        ],
      },
      {
        id: "resuscitation-bay",
        title: "Resuscitation bay",
        translation: "复苏单元",
        description: "Follow the resuscitation stretcher, monitors, carts, oxygen, suction and bedside equipment.",
        x: 430,
        y: 270,
        width: 640,
        height: 590,
        targetScale: 2.55,
        labels: [
          ["ED resuscitation bay", "急诊复苏单元", 700, 510, 0],
          ["resuscitation stretcher", "复苏担架床", 660, 570, 0],
          ["stretcher mattress", "担架床垫", 660, 520, 1],
          ["stretcher side rail", "担架床侧栏", 590, 540, 2],
          ["stretcher caster", "担架床脚轮", 600, 700, 3],
          ["stretcher footboard", "担架床尾板", 740, 650, 2],
          ["resuscitation monitor", "复苏监视器", 520, 380, 1],
          ["resuscitation monitor screen", "复苏监视器屏幕", 520, 380, 3],
          ["resuscitation monitor cable", "复苏监视器电缆", 550, 450, 4],
          ["defibrillator cart", "除颤器推车", 470, 520, 0],
          ["defibrillator display", "除颤器显示屏", 470, 475, 2],
          ["defibrillator paddle", "除颤器电极板", 500, 520, 4],
          ["airway cart", "气道设备车", 820, 430, 1],
          ["airway drawer", "气道设备抽屉", 820, 500, 3],
          ["ventilator console", "呼吸机控制台", 840, 580, 1],
          ["ventilator screen", "呼吸机屏幕", 840, 550, 3],
          ["ventilator tubing", "呼吸机管路", 800, 630, 4],
          ["ED suction canister", "急诊吸引罐", 900, 570, 2],
          ["ED suction tubing", "急诊吸引管路", 900, 630, 4],
          ["oxygen flowmeter", "氧气流量计", 610, 360, 2],
          ["ED oxygen outlet", "急诊氧气接口", 650, 360, 3],
          ["ED IV pole", "急诊输液杆", 970, 380, 0],
          ["infusion pump", "输液泵", 960, 440, 2],
          ["infusion tubing", "输液管路", 950, 500, 4],
          ["ED crash cart", "急诊急救车", 480, 690, 0],
          ["crash cart drawer", "急救车抽屉", 480, 650, 2],
          ["crash cart caster", "急救车脚轮", 450, 750, 4],
          ["bedside tray", "床旁托盘", 760, 700, 2],
          ["bedside tray rail", "床旁托盘栏", 760, 675, 3],
          ["resuscitation floor mat", "复苏区地垫", 700, 800, 1],
        ],
      },
      {
        id: "examination-bays",
        title: "Examination bays",
        translation: "检查诊室",
        description: "Inspect the examination couches, curtains, wall panels, sinks, probes and waste fixtures.",
        x: 950,
        y: 250,
        width: 722,
        height: 650,
        targetScale: 2.6,
        labels: [
          ["examination bay", "检查诊室", 1_350, 600, 0],
          ["ED examination couch", "急诊检查床", 1_150, 600, 0],
          ["couch mattress", "检查床垫", 1_150, 570, 1],
          ["couch drawer", "检查床抽屉", 1_150, 700, 2],
          ["couch caster", "检查床脚轮", 1_150, 760, 4],
          ["ED privacy curtain", "急诊隐私帘", 1_050, 500, 1],
          ["ED curtain track", "急诊隐私帘轨道", 1_100, 400, 2],
          ["ED curtain ring", "急诊隐私帘环", 1_070, 480, 4],
          ["ED examination light", "急诊检查灯", 1_300, 390, 1],
          ["blood-pressure cuff", "血压袖带", 1_330, 500, 2],
          ["pulse-oximeter probe", "脉搏血氧仪探头", 1_330, 530, 3],
          ["thermometer probe", "体温计探头", 1_500, 500, 4],
          ["stethoscope head", "听诊器头", 1_430, 520, 3],
          ["stethoscope tubing", "听诊器管", 1_430, 550, 4],
          ["wall diagnostic panel", "墙面诊疗面板", 1_250, 450, 1],
          ["exam oxygen port", "检查区氧气接口", 1_250, 460, 3],
          ["exam suction port", "检查区吸引接口", 1_250, 480, 4],
          ["ED sharps container", "急诊锐器盒", 1_350, 520, 2],
          ["ED glove dispenser", "急诊手套分配器", 1_100, 470, 2],
          ["exam sink", "检查区水槽", 1_180, 700, 0],
          ["exam faucet", "检查区水龙头", 1_180, 670, 2],
          ["ED soap dispenser", "急诊皂液分配器", 1_220, 530, 2],
          ["exam waste bin", "检查区废物桶", 1_500, 650, 1],
          ["bedside stool", "床旁凳", 1_550, 600, 0],
          ["exam tray", "检查托盘", 1_400, 560, 2],
          ["exam tray rail", "检查托盘栏", 1_400, 540, 4],
          ["exam wall shelf", "检查区墙搁板", 1_600, 500, 1],
          ["exam monitor", "检查区监视器", 1_520, 430, 1],
          ["exam power outlet", "检查区电源插座", 1_580, 470, 3],
          ["exam floor guide stripe", "检查区地面导向条", 1_330, 820, 4],
        ],
      },
      {
        id: "clinical-support",
        title: "Clinical support",
        translation: "临床支持区",
        description: "Explore the nurse station, clean utility storage, pass-through and corridor hardware.",
        x: 250,
        y: 0,
        width: 900,
        height: 430,
        targetScale: 2.4,
        labels: [
          ["ED nurse station", "急诊护士站", 760, 170, 0],
          ["nurse station counter", "护士站柜台", 760, 220, 1],
          ["clean utility cabinet", "清洁物资柜", 620, 90, 0],
          ["clean utility shelf", "清洁物资搁板", 620, 130, 2],
          ["ED linen cart", "急诊布草车", 430, 170, 0],
          ["linen cart cover", "布草车罩", 430, 170, 2],
          ["supply cart", "物资推车", 500, 220, 1],
          ["supply cart drawer", "物资推车抽屉", 500, 260, 3],
          ["waste cart", "废物车", 380, 230, 1],
          ["waste cart lid", "废物车盖", 380, 190, 3],
          ["clinical pass-through", "临床传递窗", 1_000, 200, 0],
          ["pass-through shelf", "传递窗搁板", 1_000, 250, 2],
          ["clinical wall clock", "临床挂钟", 650, 50, 1],
          ["staff doorway", "工作人员门口", 350, 80, 0],
          ["corridor handrail", "走廊扶手", 1_050, 300, 2],
          ["corridor light", "走廊灯", 900, 30, 3],
          ["clinical cabinet door", "临床柜门", 620, 90, 2],
          ["support supply bin", "支持物资箱", 570, 160, 3],
          ["support utility sink", "支持区水槽", 850, 120, 1],
          ["support utility faucet", "支持区水龙头", 850, 100, 3],
        ],
      },
      {
        id: "operating-entrance",
        title: "Operating theatre entrance",
        translation: "手术室入口",
        description: "Inspect the visible operating-theatre doorway and the equipment glimpsed beyond it.",
        x: 1_100,
        y: 0,
        width: 572,
        height: 400,
        targetScale: 2.45,
        labels: [
          ["operating theatre doorway", "手术室门口", 1_350, 150, 0],
          ["surgical suite door", "手术单元门", 1_350, 120, 1],
          ["ED door vision panel", "急诊门观察窗", 1_280, 180, 2],
          ["theatre operating bed", "手术室手术床", 1_500, 220, 0],
          ["ED theatre surgical light", "急诊手术室手术灯", 1_500, 90, 1],
          ["ED theatre equipment cart", "急诊手术室设备车", 1_470, 260, 2],
          ["theatre wall panel", "手术室墙面板", 1_600, 180, 3],
          ["theatre entry threshold", "手术室入口门槛", 1_350, 300, 4],
        ],
      },
    ],
    portal: {
      id: "enter-operating-theatre",
      label: "Enter the operating theatre",
      translation: "进入手术室",
      childSceneId: "operating-theatre",
      sourceVisualRegion: "operating-theatre-door",
      x: 1_390,
      y: 162,
      width: 84,
      height: 84,
      enterScale: 3.4,
    },
    additionalPortals: [
      {
        id: "enter-intensive-care-unit",
        label: "Enter the intensive care unit",
        translation: "进入重症监护室",
        childSceneId: "intensive-care-unit",
        sourceVisualRegion: "portal-intensive-care-unit-critical-care-bay",
        x: 625,
        y: 555,
        width: 70,
        height: 70,
        enterScale: 3.2,
        sceneCoordinates: true,
      },
      {
        id: "enter-hospital-inpatient-bedspace",
        label: "Explore the inpatient bedspace",
        translation: "探索住院床位区",
        childSceneId: "hospital-inpatient-bedspace",
        sourceVisualRegion: "portal-hospital-inpatient-bedspace",
        x: 1_220,
        y: 660,
        width: 70,
        height: 70,
        enterScale: 3.35,
        sceneCoordinates: true,
      },
      {
        id: "enter-emergency-triage-reception",
        label: "Explore the triage registration desk",
        translation: "探索分诊登记台",
        childSceneId: "emergency-triage-reception",
        sourceVisualRegion: "portal-emergency-triage-reception-counter-face",
        x: 0,
        y: 420,
        width: 280,
        height: 80,
        enterScale: 3.15,
        sceneCoordinates: true,
      },
    ],
  },
  {
    id: "operating-theatre",
    title: "Operating theatre",
    translation: "手术室",
    subtitle: "Operating room, sterile store and recovery ward",
    sourceFile: "operating-theatre-v1.png",
    publicFile: "operating-theatre-premium-v1.jpg",
    sourceSha256: "dc848c9957e3095e390478367ffe5ed80800e246aca34c5094ecf591900a06d9",
    publicSha256: "97083eb3798a19d4faf518ba03e8863530c3e60038d782a75ae2dd40516df07e",
    zones: [
      {
        id: "operating-room",
        title: "Operating room",
        translation: "手术间",
        description: "Follow the operating table, surgical light, anesthesia, monitoring and instrument hardware.",
        x: 400,
        y: 0,
        width: 800,
        height: 850,
        targetScale: 2.5,
        labels: [
          ["operating room", "手术间", 850, 450, 0],
          ["theatre operating table", "手术室手术台", 780, 520, 0],
          ["table mattress", "手术台垫", 780, 480, 1],
          ["theatre table base", "手术室手术台底座", 780, 680, 1],
          ["table headrest", "手术台头枕", 650, 430, 2],
          ["table armboard", "手术台臂板", 700, 520, 3],
          ["table leg support", "手术台腿托", 900, 530, 3],
          ["table foot pedal", "手术台脚踏", 800, 700, 4],
          ["theatre sterile drape", "手术室无菌铺单", 780, 500, 2],
          ["theatre overhead surgical light", "手术室顶置手术灯", 900, 170, 0],
          ["theatre light handle", "手术室灯把手", 900, 220, 3],
          ["theatre light arm", "手术室灯支臂", 1_000, 140, 2],
          ["theatre light housing", "手术室灯外壳", 900, 150, 1],
          ["theatre ceiling boom", "手术室顶置吊臂", 700, 80, 0],
          ["theatre boom mount", "手术室吊臂底座", 700, 40, 3],
          ["theatre patient monitor", "手术室患者监视器", 1_000, 350, 1],
          ["theatre monitor screen", "手术室监视器屏幕", 1_000, 350, 3],
          ["theatre monitor stand", "手术室监视器支架", 1_000, 420, 4],
          ["theatre anesthesia machine", "手术室麻醉机", 1_020, 450, 0],
          ["theatre anesthesia screen", "手术室麻醉机屏幕", 1_020, 400, 2],
          ["anesthesia breathing circuit", "麻醉呼吸回路", 1_000, 500, 3],
          ["anesthesia reservoir bag", "麻醉储气囊", 950, 480, 4],
          ["anesthesia hose", "麻醉软管", 980, 560, 4],
          ["theatre suction canister", "手术室吸引罐", 1_100, 520, 2],
          ["theatre suction tubing", "手术室吸引管", 1_100, 590, 4],
          ["electrosurgical unit", "电外科设备", 1_030, 650, 1],
          ["electrosurgical cable", "电外科电缆", 1_000, 700, 3],
          ["theatre equipment cart", "手术室设备车", 1_120, 700, 0],
          ["theatre cart drawer", "手术室设备车抽屉", 1_120, 730, 2],
          ["theatre cart caster", "手术室设备车脚轮", 1_100, 800, 4],
          ["theatre Mayo stand", "手术室梅奥台", 550, 600, 0],
          ["Mayo tray", "梅奥台托盘", 550, 570, 2],
          ["theatre instrument tray", "手术室器械托盘", 470, 620, 1],
          ["instrument table", "器械桌", 470, 680, 0],
          ["theatre floor mat", "手术室地垫", 800, 800, 1],
          ["operating room clock", "手术室挂钟", 1_150, 100, 2],
        ],
      },
      {
        id: "scrub-and-gowning",
        title: "Scrub and gowning",
        translation: "洗手与穿戴区",
        description: "Inspect scrub sinks, faucets, protective clothing, glove storage and clean-room cabinets.",
        x: 0,
        y: 0,
        width: 500,
        height: 600,
        targetScale: 2.45,
        labels: [
          ["scrub bay", "刷手区", 180, 350, 0],
          ["theatre scrub sink", "手术室刷手水槽", 150, 350, 0],
          ["hands-free faucet", "免手触水龙头", 150, 300, 2],
          ["scrub soap dispenser", "刷手皂液分配器", 60, 250, 1],
          ["surgical cap rack", "手术帽架", 100, 100, 0],
          ["theatre surgical cap", "手术室手术帽", 100, 150, 3],
          ["gown rack", "手术袍架", 300, 150, 0],
          ["theatre surgical gown", "手术室手术袍", 300, 230, 2],
          ["sterile glove dispenser", "无菌手套分配器", 250, 280, 1],
          ["theatre glove box", "手术室手套盒", 250, 330, 3],
          ["clean supply cabinet", "清洁物资柜", 300, 450, 0],
          ["clean cabinet shelf", "清洁柜搁板", 300, 500, 2],
          ["wrapped pack", "包装器械包", 300, 520, 3],
          ["theatre sterile pack", "手术室无菌包", 350, 520, 4],
          ["scrub waste bin", "刷手区废物桶", 250, 450, 1],
          ["scrub waste lid", "刷手区废物桶盖", 250, 430, 3],
          ["theatre sink backsplash", "手术室水槽挡水板", 150, 260, 2],
          ["theatre sink drain", "手术室水槽排水口", 150, 390, 4],
          ["scrub mirror", "刷手区镜子", 80, 220, 1],
          ["scrub wall panel", "刷手区墙面板", 420, 300, 2],
          ["scrub door handle", "刷手区门把手", 420, 120, 3],
          ["scrub door vision panel", "刷手区门观察窗", 420, 90, 4],
        ],
      },
      {
        id: "sterile-storage",
        title: "Sterile storage",
        translation: "无菌储藏区",
        description: "Explore the instrument cabinet, sealed trays, pass-through window and clean corridor fixtures.",
        x: 350,
        y: 80,
        width: 600,
        height: 420,
        targetScale: 2.55,
        labels: [
          ["sterile storage", "无菌储藏室", 650, 250, 0],
          ["instrument cabinet", "器械柜", 650, 200, 0],
          ["theatre storage shelf", "手术室储藏搁板", 650, 150, 1],
          ["theatre shelf rail", "手术室搁板导轨", 650, 175, 3],
          ["sealed tray", "密封托盘", 650, 280, 2],
          ["tray lid", "托盘盖", 650, 260, 4],
          ["pass-through window", "传递窗", 850, 180, 0],
          ["pass-through sill", "传递窗台", 850, 240, 2],
          ["storage cart", "储藏推车", 900, 330, 1],
          ["storage cart handle", "储藏推车把手", 900, 300, 3],
          ["storage cart caster", "储藏推车脚轮", 900, 390, 4],
          ["sterile corridor door", "无菌走廊门", 500, 160, 0],
          ["sterile corridor light", "无菌走廊灯", 500, 90, 2],
          ["air diffuser", "送风散流器", 800, 90, 3],
          ["sterile ceiling panel", "无菌区顶棚板", 750, 100, 1],
          ["sterile wall clock", "无菌区挂钟", 900, 120, 2],
          ["sterile supply bin", "无菌物资箱", 700, 320, 1],
          ["sterile wrapper", "无菌包装纸", 720, 300, 3],
          ["instrument cabinet door", "器械柜门", 650, 210, 2],
          ["instrument cabinet latch", "器械柜门闩", 690, 210, 4],
        ],
      },
      {
        id: "recovery-ward",
        title: "Recovery ward",
        translation: "恢复病房",
        description: "Inspect recovery beds, monitoring, privacy, outlets, bedside storage and the glazed partition.",
        x: 1_050,
        y: 0,
        width: 622,
        height: 650,
        targetScale: 2.55,
        labels: [
          ["recovery ward", "恢复病房", 1_400, 350, 0],
          ["recovery bed", "恢复床", 1_350, 450, 0],
          ["recovery mattress", "恢复床垫", 1_350, 410, 1],
          ["recovery bedrail", "恢复床护栏", 1_270, 430, 2],
          ["recovery bed caster", "恢复床脚轮", 1_300, 560, 4],
          ["theatre bedside monitor", "手术室床旁监视器", 1_250, 250, 1],
          ["bedside monitor screen", "床旁监视器屏幕", 1_250, 250, 3],
          ["bedside IV pole", "床旁输液杆", 1_500, 250, 0],
          ["bedside infusion pump", "床旁输液泵", 1_500, 320, 2],
          ["recovery privacy curtain", "恢复区隐私帘", 1_550, 300, 1],
          ["recovery curtain track", "恢复区帘轨", 1_550, 180, 3],
          ["recovery oxygen outlet", "恢复区氧气接口", 1_450, 230, 2],
          ["recovery vacuum outlet", "恢复区真空接口", 1_500, 230, 3],
          ["recovery bedside table", "恢复区床旁桌", 1_570, 450, 0],
          ["recovery bedside drawer", "恢复区床旁抽屉", 1_570, 500, 2],
          ["recovery cabinet", "恢复区柜体", 1_600, 580, 0],
          ["recovery shelf", "恢复区搁板", 1_600, 520, 2],
          ["recovery chair", "恢复区椅子", 1_500, 600, 1],
          ["recovery wall clock", "恢复区挂钟", 1_450, 100, 1],
          ["glass ward partition", "玻璃病房隔断", 1_100, 200, 0],
          ["recovery floor tile", "恢复区地砖", 1_400, 620, 4],
        ],
      },
      {
        id: "theatre-equipment",
        title: "Theatre equipment",
        translation: "手术室设备细节",
        description: "Study the mobile tray, equipment casters, tabletop surfaces and connected room hardware.",
        x: 0,
        y: 550,
        width: 1_200,
        height: 391,
        targetScale: 2.7,
        labels: [
          ["mobile instrument tray", "移动器械托盘", 300, 700, 0],
          ["tray instrument bowl", "托盘器械碗", 300, 670, 2],
          ["tray instrument handle", "托盘器械柄", 400, 670, 3],
          ["tray lower shelf", "托盘下层搁板", 300, 800, 1],
          ["tray caster", "托盘脚轮", 430, 850, 4],
          ["table support column", "手术台支撑柱", 780, 720, 2],
          ["table base wheel", "手术台底座轮", 900, 780, 4],
          ["boom cable", "吊臂电缆", 1_000, 650, 3],
          ["equipment power lead", "设备电源线", 1_050, 700, 4],
          ["floor cable cover", "地面电缆罩", 1_050, 780, 2],
        ],
      },
    ],
    portal: null,
    additionalPortals: [
      {
        id: "enter-post-anesthesia-care-unit",
        label: "Enter the post-anesthesia care unit",
        translation: "进入麻醉后恢复室",
        childSceneId: "post-anesthesia-care-unit",
        sourceVisualRegion: "recovery-ward",
        x: 1_440,
        y: 335,
        width: 80,
        height: 80,
        enterScale: 3.4,
        sceneCoordinates: true,
      },
    ],
  },
];

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

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function visualRegionFor(sceneId, word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `${sceneId}-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the ${sceneId} photograph`,
    kind: "part",
    ...sceneRectangle({ x: left, y: top, width: size, height: size }),
  };
}

function buildScene(definition) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of definition.zones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `${definition.id}-${slugify(word)}`;
      const region = visualRegionFor(definition.id, word, x, y, zone.title);
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
      id: `${definition.id}-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  const portalDefinitions = [
    ...(definition.portal ? [definition.portal] : []),
    ...(definition.additionalPortals ?? []),
  ];
  const portals = portalDefinitions.map((portal) => {
    const {
      sceneCoordinates = false,
      ...portalFields
    } = portal;
    const point = (value, axis) => sceneCoordinates ? value : scenePoint(value, axis);
    const normalizedPortal = {
      ...portalFields,
      x: point(portal.x, "x"),
      y: point(portal.y, "y"),
      width: point(portal.width, "x"),
      height: point(portal.height, "y"),
    };
    const portalDescriptions = {
      "operating-theatre": "A clear patch over the visible operating-theatre table beyond the doorway",
      "intensive-care-unit": "A clear patch over the visible resuscitation stretcher in the central emergency-department bay",
      "hospital-inpatient-bedspace": "A clear patch over the visible examination couch in the right-hand emergency-department bay",
      "emergency-triage-reception": "The clear, lower front face of the visible emergency triage registration counter",
      "post-anesthesia-care-unit": "A clear patch over the visible recovery bed beyond the glazed opening in the operating-theatre photograph",
    };
    visualRegions.push({
      id: portal.sourceVisualRegion,
      description: portalDescriptions[portal.childSceneId] ?? `Visible ${portal.childSceneId} entrance in the emergency-department photograph`,
      kind: "object",
      x: normalizedPortal.x,
      y: normalizedPortal.y,
      width: normalizedPortal.width,
      height: normalizedPortal.height,
    });
    return normalizedPortal;
  });
  return {
    id: definition.id,
    title: definition.title,
    translation: definition.translation,
    subtitle: definition.subtitle,
    asset: `/scenes/${definition.publicFile}`,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: definition.id === "emergency-department" ? "hospital" : "emergency-department",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: `/scenes/${definition.publicFile}`,
      reviewedAssetSha256: definition.publicSha256,
      rationale: `The source and resized ${definition.id} photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable room, equipment, fixture and visible part anchors across ${detailZones.length} bounded zones. Patient identity, diagnosis, medication names, procedure steps, outcomes, sterile-state claims, brands, readable screen content and hidden functions were excluded.`,
      previousLabelCount: labels.length + 6,
      retainedLabelCount: labels.length,
      removedLabelCount: 6,
      removedExamples: [
        "patient identity",
        "diagnosis",
        "medication name",
        "procedure step",
        "readable screen content",
        "hidden equipment function",
      ],
    },
    labels,
    portals,
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

async function ensureAsset(definition) {
  const source = await readFile(resolve(sourceRoot, definition.sourceFile));
  if (sha256(source) !== definition.sourceSha256) {
    throw new Error(`${definition.id} source bytes changed; rerun the pixel audit before rebuilding`);
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== definition.publicSha256) {
    throw new Error(`${definition.id} JPEG is not reproducible; got ${sha256(output)}`);
  }
  const target = resolve(publicRoot, definition.publicFile);
  try {
    const current = await readFile(target);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(target, output);
  return true;
}

const hospitalPortal = {
  id: "enter-emergency-department",
  label: "Enter the emergency department",
  translation: "进入急诊科",
  childSceneId: "emergency-department",
  sourceVisualRegion: "emergency-department",
  x: 20,
  y: 280,
  width: 320,
  height: 360,
  enterScale: 3.4,
};

async function updateHospital() {
  const hospital = JSON.parse(await readFile(hospitalPath, "utf8"));
  const existingIndex = hospital.portals.findIndex(({ id }) => id === hospitalPortal.id);
  if (existingIndex >= 0) hospital.portals[existingIndex] = hospitalPortal;
  else hospital.portals.unshift(hospitalPortal);
  return writeIfChanged(hospitalPath, hospital);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entries = [
    { id: "emergency-department", title: "Emergency department", parentId: "hospital" },
    { id: "operating-theatre", title: "Operating theatre", parentId: "emergency-department" },
  ];
  for (const entry of entries) {
    const existing = manifest.scenes.find(({ id }) => id === entry.id);
    if (!existing) {
      const parentIndex = manifest.scenes.findIndex(({ id }) => id === entry.parentId);
      if (parentIndex < 0) throw new Error(`${entry.parentId} is missing from the scene manifest`);
      manifest.scenes.splice(parentIndex + 1, 0, entry);
    } else if (existing.title !== entry.title || existing.parentId !== entry.parentId) {
      throw new Error(`${entry.id} already exists with a different title or parent`);
    }
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildHospitalAcuteScenes() {
  const results = [];
  for (const definition of sceneDefinitions) {
    const assetChanged = await ensureAsset(definition);
    const sceneChanged = await writeIfChanged(
      resolve(sceneRoot, `${definition.id}.json`),
      buildScene(definition),
    );
    results.push({ id: definition.id, assetChanged, sceneChanged, labels: buildScene(definition).labels.length, zones: definition.zones.length });
  }
  if (integrate) {
    results.push({ hospitalChanged: await updateHospital(), manifestChanged: await updateManifest() });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildHospitalAcuteScenes()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-hospital-acute-scenes: ${error.message}`);
      process.exitCode = 1;
    });
}
