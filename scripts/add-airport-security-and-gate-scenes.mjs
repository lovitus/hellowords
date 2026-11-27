import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { scannerEntrance, scannerEntranceRegion } from "./add-carry-on-baggage-scanner-scene.mjs";

/**
 * Build the connected airport security -> boarding-gate batch from reviewed
 * source photographs. Rows without image coordinates remain in the searchable
 * scene vocabulary. Pointable terms may link to a matching 10k dictionary entry.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAssets = {
  security: resolve(projectRoot, "scripts/assets/airport-security-checkpoint-v1.png"),
  gate: resolve(projectRoot, "scripts/assets/airport-boarding-gate-v1.png"),
};
const publicAssets = {
  security: resolve(projectRoot, "public/scenes/airport-security-checkpoint-premium-v1.jpg"),
  gate: resolve(projectRoot, "public/scenes/airport-boarding-gate-premium-v1.jpg"),
};
const scenePaths = {
  security: resolve(projectRoot, "public/data/scenes/security-checkpoint.json"),
  gate: resolve(projectRoot, "public/data/scenes/boarding-gate.json"),
};
const airportPath = resolve(projectRoot, "public/data/scenes/airport.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = {
  security: "adaa3e827861232004337543ba3880a8c93dbcf3d474842876bcaa4abdf7f022",
  gate: "18fc652ba8bc9a697d9afa6ca85b21f0728d0e20286484fa5902925d3f85ffc8",
};
const PUBLIC_ASSET_SHA256 = {
  security: "8a12c6f335b1107d676112bf52033cc30d51aa352e9fbacf0bde609a3ef85e20",
  gate: "12c9298681df0b7fa1f282fab91ba9af5f05f5a9ddcc16a3b51a5b9e9765436b",
};

const securityZones = [
  {
    id: "queue-divestiture",
    title: "Checkpoint queue and divestiture",
    translation: "安检排队与置物区",
    description: "Follow the empty queuing lane alongside its belt barriers, sign stands and wheeled cart of trays.",
    x: 0,
    y: 0,
    width: 500,
    height: 900,
    labels: [
      ["stanchion pole", "隔离柱杆", 388, 803, 6, 32],
      ["queue lane", "排队通道", 235, 510, 28, 16],
      ["checkpoint queue", "安检队列"],
      ["security queue rail", "安检排队栏杆", 277, 415, 8, 10],
      ["stanchion foot", "隔离柱底座", 50, 558, 16, 6],
      ["belt hook", "隔离带挂钩"],
      ["queue belt buckle", "排队隔离带扣"],
      ["queue sign panel", "排队牌面板", 425, 604, 28, 34],
      ["floor wayfinding stripe", "地面导向条", 242, 479, 8, 2],
      ["security document tray", "安检证件托盘"],
      ["boarding pass holder", "登机牌夹"],
      ["identity document tray", "身份证件托盘"],
      ["passenger bin stack", "乘客置物箱堆", 84, 783, 24, 30],
      ["accessible queue lane", "无障碍排队通道"],
      ["queue corner", "排队转角", 35, 285, 8, 6],
      ["barrier base", "隔离栏底座", 284, 540, 14, 5],
      ["checkpoint lane divider", "安检通道分隔栏", 222, 386, 4, 3],
      ["tray cart", "托盘车", 201, 827, 8, 3],
      ["tray cart wheel", "托盘车轮", 288, 796, 4, 5],
      ["queue rail cap", "排队栏杆帽", 383, 707, 7, 4],
      ["queue post collar", "隔离柱环"],
      ["plastic bin", "塑料置物箱", 67, 693, 28, 18],
      ["retractable belt", "伸缩隔离带", 98, 474, 4, 3],
      ["stack", "一摞（叠放的托盘）", 215, 675, 12, 24, "en-6ee08e6eb3bc6f45"],
      ["yellow", "黄色", 462, 656, 10, 4, "en-c685a2c9bab235cc"],
    ],
  },
  {
    id: "document-check",
    title: "Document check podium",
    translation: "证件检查台",
    description: "Find the desk behind the clear screen, its keyboard shelf and the small trays beside it.",
    x: 280,
    y: 175,
    width: 340,
    height: 390,
    labels: [
      ["identity-check podium", "身份检查台", 398, 438, 22, 46],
      ["checkpoint passport scanner", "安检护照扫描器"],
      ["boarding-pass scanner", "登机牌扫描器"],
      ["document scanner bed", "证件扫描台面"],
      ["checkpoint scanner glass", "安检扫描玻璃"],
      ["monitor housing", "显示器外壳", 466, 340, 3, 16],
      ["keyboard deck", "键盘台面", 449, 412, 16, 3],
      ["inspection counter shelf", "检查柜台搁板", 486, 373, 15, 4],
      ["privacy glass", "隐私玻璃"],
      ["counter cable cover", "柜台电缆盖"],
      ["check-in reader", "值机读卡器"],
      ["document reader stand", "证件读卡器支架"],
      ["checkpoint inspection tray", "安检检查托盘", 566, 428, 21, 6],
      ["document tray rim", "证件托盘边"],
      ["inspection podium drawer", "检查台抽屉"],
      ["inspection podium foot", "检查台脚座"],
      ["podium base", "检查台底座", 451, 482, 12, 4],
      ["scanner hood", "扫描器罩"],
      ["scanner status light", "扫描器状态灯"],
      ["checkpoint glass partition post", "安检玻璃隔断柱", 337, 262, 3, 45],
      ["desk stool", "检查台凳"],
      ["computer monitor", "电脑显示器", 442, 341, 27, 20],
      ["glass screen", "玻璃挡板", 311, 310, 17, 46],
      ["empty tray", "空托盘", 580, 519, 17, 6],
      ["keyboard", "键盘", 451, 399, 17, 3, "en-91f060a9ad4b39eb"],
    ],
  },
  {
    id: "ct-screening",
    title: "Baggage screening and conveyors",
    translation: "行李安检与输送带",
    description: "Compare the enclosed baggage scanner with the open detector arch, roller bed and colored trays.",
    x: 430,
    y: 125,
    width: 750,
    height: 394,
    labels: [
      ["checkpoint ct scanner", "安检 CT 扫描器"],
      ["ct scanner tunnel", "CT 扫描通道"],
      ["ct conveyor roller", "CT 传送带滚筒"],
      ["conveyor side guard", "传送带侧护板", 650, 382, 8, 2],
      ["operator console", "操作台", 642, 352, 6, 3],
      ["ct console monitor", "CT 操作台显示器"],
      ["tunnel curtain", "通道软帘", 748, 278, 18, 11],
      ["exit conveyor", "出口传送带"],
      ["entrance conveyor", "入口传送带"],
      ["divestiture table", "置物台", 1140, 374, 21, 6],
      ["gray tray", "灰色托盘", 744, 372, 18, 5],
      ["blue tray", "蓝色托盘", 713, 357, 20, 6],
      ["tray nest", "托盘嵌套架"],
      ["tray return rack", "托盘回收架"],
      ["x-ray unit housing", "X 光设备外壳"],
      ["baggage scanner housing", "行李扫描仪外壳", 653, 265, 30, 24],
      ["walk-through detector arch", "步行探测门框", 925, 338, 15, 48],
      ["walk-through detector mat", "探测门脚垫"],
      ["detector threshold", "探测门门槛", 875, 436, 20, 7],
      ["security shoe tray", "安检鞋物托盘"],
      ["laptop tray", "电脑托盘"],
      ["bag inspection table", "行李检查台"],
      ["scanner belt", "扫描传送带", 611, 390, 20, 9],
      ["scanner belt roller", "扫描传送带滚轮", 625, 411, 2, 2],
      ["ct scanner panel", "CT 扫描器面板"],
      ["scanner vent", "扫描器通风口", 690, 239, 12, 4],
      ["scanner foot", "扫描器脚座"],
      ["baggage scanner", "行李扫描仪", 739, 238, 23, 8],
      ["roller track", "滚筒输送轨道", 801, 306, 18, 5],
    ],
  },
  {
    id: "secondary-inspection",
    title: "Secondary inspection",
    translation: "复检区",
    description: "Look across the inspection desk for the lamp, shallow trays, swivel stool, pump bottle and wastebasket.",
    x: 695,
    y: 418,
    width: 471,
    height: 398,
    labels: [
      ["secondary inspection table", "复检台", 847, 573, 16, 6],
      ["inspection task light", "复检工作灯"],
      ["magnifier arm", "放大镜支臂", 988, 529, 4, 16],
      ["hand-search tray", "人工检查托盘", 882, 557, 22, 7],
      ["swab kit", "擦拭采样套件"],
      ["swab holder", "采样棒支架"],
      ["test-device housing", "检测设备外壳"],
      ["privacy screen panel", "隐私屏风面板", 1090, 518, 65, 35],
      ["evidence bin", "检查物品箱"],
      ["secondary glove dispenser", "复检手套分配盒"],
      ["secondary inspection counter", "复检柜台"],
      ["inspection stool", "复检凳", 909, 686, 37, 14],
      ["floor mat edge", "地垫边", 757, 586, 4, 3],
      ["inspection cabinet", "复检柜", 838, 685, 18, 25],
      ["tray support", "托盘支撑"],
      ["secondary counter drawer", "复检柜台抽屉", 838, 644, 16, 6],
      ["bin liner", "箱内衬"],
      ["search light", "检查灯"],
      ["pump bottle", "按压瓶", 977, 583, 7, 13],
      ["magnifier", "放大镜", 961, 490, 18, 8],
      ["wastebasket", "废纸篓", 1008, 766, 21, 36],
      ["stool wheel", "凳轮", 918, 804, 5, 5],
      ["rubber mat", "橡胶垫", 770, 556, 34, 15],
      ["mat", "垫子", 782, 672, 18, 9, "en-0c1c541af9cc252a"],
      ["rim", "边沿", 1010, 727, 6, 2, "en-1569ec5b93084cc1"],
    ],
  },
  {
    id: "sterile-exit",
    title: "Sterile departure exit",
    translation: "安检后出发区出口",
    description: "Find the glass gate, seats, clock and exit in the waiting area beyond the inspection tables.",
    x: 1015,
    y: 65,
    width: 585,
    height: 825,
    labels: [
      ["access-control pedestal", "门禁立柱", 1203, 563, 18, 32],
      ["boarding reader", "登机读卡器"],
      ["glass swing gate", "玻璃摆闸", 1271, 520, 46, 36],
      ["sterile gate latch", "洁净区闸门插销"],
      ["exit barrier", "出口隔离栏", 1400, 561, 39, 24],
      ["departure-side corridor", "出发侧走廊", 1433, 325, 46, 18],
      ["jet-bridge doorway", "登机廊桥门"],
      ["sterile gate podium", "洁净区登机台"],
      ["gate seating", "登机区座椅", 1122, 310, 26, 17],
      ["seating armrest", "座椅扶手", 1161, 305, 9, 2],
      ["charging shelf", "充电搁板", 1563, 359, 17, 4],
      ["checkpoint wall clock", "安检区挂钟", 1563, 201, 20, 15],
      ["checkpoint ceiling light panel", "安检区顶面灯板"],
      ["acoustic ceiling baffle", "吸音吊板"],
      ["terrazzo floor tile", "水磨石地砖"],
      ["tactile floor strip", "盲道条", 1388, 793, 13, 23],
      ["checkpoint fire door", "安检区防火门"],
      ["checkpoint emergency light", "安检区应急灯"],
      ["extinguisher cabinet", "灭火器柜", 1038, 264, 13, 28],
      ["sterile exit threshold", "洁净区出口门槛"],
      ["camera dome", "摄像机穹顶", 1185, 117, 11, 8],
      ["power outlet", "电源插座", 1579, 349, 6, 5],
      ["row of seats", "一排座椅", 1273, 293, 22, 12],
      ["sliding glass door", "玻璃移门", 1309, 208, 25, 31],
      ["exit door", "出口门", 1102, 187, 39, 41],
      ["frame", "门框", 1505, 163, 3, 22, "en-9dff50df08c63581"],
      ["glass", "玻璃", 1381, 532, 23, 17, "en-132a1a391cce181c"],
      ["blue", "蓝色", 1530, 646, 12, 11, "en-16477688c0e00699"],
    ],
  },
];

const gateZones = [
  {
    id: "lounge",
    title: "Gate lounge",
    translation: "登机候机区",
    description: "Explore the lounge seats, charging shelf, blank display and finish details.",
    x: 0,
    y: 0,
    width: 500,
    height: 900,
    labels: [
      ["terminal gate lounge", "航站楼登机候机区", 200, 450],
      ["lounge seat", "候机座椅", 100, 550],
      ["lounge armrest", "候机座椅扶手", 150, 550],
      ["lounge seat leg", "候机座椅椅腿", 120, 620],
      ["lounge seat bracket", "候机座椅支架", 150, 620],
      ["lounge seat cushion", "候机座椅坐垫", 100, 500],
      ["overhead luggage shelf", "头顶行李搁板", 350, 120],
      ["lounge side table", "候机边桌", 260, 500],
      ["gate charging shelf", "登机区充电搁板", 300, 600],
      ["gate wall panel", "登机区墙板", 300, 250],
      ["gate acoustic baffle", "登机区吸音板", 300, 60],
      ["gate wall clock", "登机区挂钟", 180, 200],
      ["gate planter", "登机区花盆", 100, 400],
      ["gate waste bin", "登机区垃圾桶", 420, 430],
      ["gate water fountain", "登机区饮水机", 430, 300],
      ["blank gate display", "空白登机屏", 350, 250],
      ["gate display bezel", "登机屏边框", 350, 250],
      ["lounge window mullion", "候机窗竖框", 460, 180],
      ["lounge floor tile", "候机区地砖", 250, 800],
      ["carpet runner", "地毯通道", 200, 700],
      ["lounge floor seam", "候机区地面接缝", 300, 820],
      ["gate lighting strip", "登机区灯带", 350, 70],
      ["seating row", "座椅排", 150, 550],
      ["seat pedestal", "座椅底座", 140, 650],
      ["lounge seat frame", "候机座椅框架", 120, 600],
    ],
  },
  {
    id: "boarding-podium",
    title: "Boarding podium",
    translation: "登机台",
    description: "Inspect the boarding podium, reader stand, glass gate and queue hardware.",
    x: 500,
    y: 0,
    width: 350,
    height: 450,
    labels: [
      ["boarding gate podium", "登机闸台", 580, 300],
      ["gate boarding reader", "登机读卡器", 650, 300],
      ["reader stand", "读卡器支架", 650, 350],
      ["podium monitor housing", "登机台显示器外壳", 580, 250],
      ["podium keyboard deck", "登机台键盘台面", 580, 330],
      ["podium microphone", "登机台麦克风", 600, 220],
      ["podium shelf", "登机台搁板", 570, 380],
      ["gate stanchion", "登机区隔离柱", 800, 350],
      ["gate belt strap", "登机区隔离带", 760, 350],
      ["boarding gate barrier foot", "登机区栏杆底座", 800, 400],
      ["self-boarding gate", "自助登机闸机", 700, 300],
      ["gate glass panel", "登机闸机玻璃板", 740, 320],
      ["gate access pedestal", "登机门禁立柱", 780, 300],
      ["boarding reader bezel", "登机读卡器边框", 650, 300],
      ["gate latch plate", "登机闸机锁扣板", 740, 340],
      ["podium screen frame", "登机台屏幕框", 580, 250],
      ["gate queue post", "登机排队柱", 800, 350],
      ["boarding podium pass slot", "登机台登机牌插槽", 650, 320],
      ["podium cable cover", "登机台电缆盖", 600, 380],
      ["podium foot", "登机台脚座", 580, 410],
    ],
  },
  {
    id: "podium-floor",
    title: "Gate floor and access lane",
    translation: "登机区地面与通道",
    description: "Follow the access lane, mats, floor joints and podium base hardware.",
    x: 500,
    y: 450,
    width: 350,
    height: 450,
    labels: [
      ["gate floor stripe", "登机区地面条", 650, 600],
      ["gate queue mat", "登机排队垫", 600, 700],
      ["podium drawer", "登机台抽屉", 580, 500],
      ["podium wheel", "登机台轮", 580, 520],
      ["gate barrier rail", "登机区隔离栏杆", 780, 600],
      ["reader cable", "读卡器电缆", 660, 500],
      ["gate floor joint", "登机区地面接缝", 700, 800],
      ["boarding mat", "登机垫", 650, 700],
      ["gate footplate", "登机闸机脚板", 800, 700],
      ["podium side panel", "登机台侧板", 580, 550],
    ],
  },
  {
    id: "boarding-bridge",
    title: "Passenger boarding bridge",
    translation: "旅客登机廊桥",
    description: "Study the rotunda, bridge tunnel, bellows, rails, windows and service doors.",
    x: 850,
    y: 0,
    width: 350,
    height: 900,
    labels: [
      ["passenger boarding bridge", "旅客登机廊桥", 900, 300],
      ["terminal rotunda", "航站楼旋转厅", 910, 240],
      ["bridge support column", "廊桥支柱", 900, 500],
      ["bridge tunnel corridor", "廊桥通道", 1_030, 300],
      ["bridge floor joint", "廊桥地面接缝", 1_050, 700],
      ["boarding bridge handrail", "登机廊桥扶手", 1_000, 450],
      ["bridge sidewall", "廊桥侧墙", 1_050, 200],
      ["bridge ceiling light", "廊桥顶灯", 1_000, 100],
      ["bridge bellows", "廊桥伸缩罩", 1_170, 280],
      ["aircraft-end rotunda", "飞机端旋转厅", 1_180, 300],
      ["boarding bridge window", "登机廊桥窗", 1_000, 250],
      ["boarding bridge door", "登机廊桥门", 900, 220],
      ["bridge threshold", "廊桥门槛", 900, 420],
      ["bridge guide rail", "廊桥导轨", 1_050, 500],
      ["bridge support wheel", "廊桥支撑轮", 1_100, 650],
      ["bridge emergency door", "廊桥应急门", 880, 650],
      ["bridge floor mat", "廊桥地垫", 1_000, 600],
      ["bridge wall panel", "廊桥墙板", 1_080, 350],
      ["bridge window mullion", "廊桥窗竖框", 1_050, 250],
      ["bridge door hinge", "廊桥门铰链", 900, 230],
      ["passenger bridge door seal", "旅客廊桥门密封条", 900, 250],
      ["bridge ceiling baffle", "廊桥吸音板", 950, 100],
      ["bridge pivot cover", "廊桥转轴盖", 930, 220],
      ["rotunda handrail", "旋转厅扶手", 1_120, 400],
      ["bridge sill", "廊桥窗台", 1_000, 420],
    ],
  },
  {
    id: "aircraft-cabin",
    title: "Aircraft doorway and cabin",
    translation: "飞机舱门与客舱",
    description: "Inspect the aircraft doorway, cabin seats, overhead storage and service fittings.",
    x: 1_200,
    y: 0,
    width: 400,
    height: 550,
    labels: [
      ["aircraft doorway", "飞机舱门", 1_300, 300],
      ["aircraft door frame", "飞机舱门框", 1_300, 250],
      ["aircraft door handle", "飞机舱门把手", 1_280, 330],
      ["aircraft door sill", "飞机舱门槛", 1_300, 420],
      ["aircraft door seal", "飞机舱门密封条", 1_320, 250],
      ["aircraft handrail", "飞机舱门扶手", 1_270, 340],
      ["aircraft galley curtain", "飞机厨房帘", 1_450, 300],
      ["cabin aisle", "客舱过道", 1_470, 500],
      ["cabin seat row", "客舱座椅排", 1_500, 450],
      ["cabin seat shell", "客舱座椅外壳", 1_530, 450],
      ["cabin seat cushion", "客舱座椅坐垫", 1_530, 500],
      ["aircraft seatback pocket", "飞机座椅背袋", 1_530, 530],
      ["aircraft tray table", "飞机小桌板", 1_510, 520],
      ["aircraft armrest", "飞机座椅扶手", 1_540, 500],
      ["aircraft overhead bin", "飞机头顶行李舱", 1_500, 180],
      ["aircraft reading light", "飞机阅读灯", 1_480, 160],
      ["cabin air vent nozzle", "客舱通风口喷嘴", 1_460, 170],
      ["cabin window shade", "客舱窗遮板", 1_500, 250],
      ["cabin window", "客舱窗", 1_540, 250],
      ["cabin wall panel", "客舱墙板", 1_450, 260],
      ["aircraft lavatory door", "飞机洗手间门", 1_380, 550],
      ["cabin service cart", "客舱服务车", 1_400, 520],
      ["aircraft luggage compartment", "飞机行李舱", 1_250, 500],
      ["aircraft door latch", "飞机舱门插销", 1_310, 330],
      ["aircraft threshold strip", "飞机门槛条", 1_300, 430],
    ],
  },
  {
    id: "airside-service",
    title: "Airside service edge",
    translation: "机坪服务边缘",
    description: "Follow the apron paving, safety line, service carts, cable and ground equipment.",
    x: 1_200,
    y: 550,
    width: 400,
    height: 350,
    labels: [
      ["apron paving", "机坪铺面", 1_500, 800],
      ["airside safety line", "机坪安全线", 1_450, 700],
      ["airside wheel chock", "机坪轮挡", 1_320, 700],
      ["airside baggage cart", "机坪行李车", 1_450, 650],
      ["service stair", "服务梯", 1_220, 700],
      ["ground-power cable", "地面电源电缆", 1_350, 750],
      ["airside cone", "机坪锥桶", 1_450, 780],
      ["airside bollard", "机坪防撞柱", 1_550, 650],
      ["jet-bridge safety rail", "登机廊桥安全栏", 1_300, 700],
      ["airside drainage channel", "机坪排水沟", 1_500, 880],
      ["aircraft-side light", "机身侧灯", 1_250, 600],
      ["service cart wheel", "服务车轮", 1_400, 720],
      ["ground-unit wheel", "地面设备轮", 1_500, 700],
      ["aircraft step", "飞机踏步", 1_250, 650],
      ["aircraft fuselage panel", "飞机机身面板", 1_500, 600],
    ],
  },
];

const securityPortal = {
  id: "enter-boarding-gate",
  label: "Enter the boarding gate",
  translation: "进入登机口",
  childSceneId: "boarding-gate",
  sourceVisualRegion: "portal-boarding-gate",
  x: 1360,
  y: 156,
  width: 130,
  height: 131,
  enterScale: 3.4,
};

const boardingBridgePortal = {
  id: "enter-passenger-boarding-bridge",
  label: "Enter the passenger boarding bridge",
  translation: "进入旅客登机廊桥",
  childSceneId: "passenger-boarding-bridge",
  sourceVisualRegion: "portal-passenger-boarding-bridge",
  x: 795,
  y: 195,
  width: 218,
  height: 330,
  enterScale: 3.45,
};

const boardingBridgePortalRegion = {
  id: boardingBridgePortal.sourceVisualRegion,
  description: "Open boarding-bridge corridor entrance between the gate lounge and aircraft-side bridge",
  kind: "object",
  x: boardingBridgePortal.x,
  y: boardingBridgePortal.y,
  width: boardingBridgePortal.width,
  height: boardingBridgePortal.height,
};

const securityPortalRegion = {
  id: securityPortal.sourceVisualRegion,
  description: "Large unobstructed sterile departure doorway leading from checkpoint to the boarding gate",
  kind: "object",
  x: securityPortal.x,
  y: securityPortal.y,
  width: securityPortal.width,
  height: securityPortal.height,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(value) {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function makeScene(id, title, translation, subtitle, zones, asset, assetSha256, options) {
  const labels = [];
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y, width = 40, height = 40, lexemeId] of zone.labels) {
      const idSuffix = slug(word);
      const labelId = `${id}-${idSuffix}`;
      if (x === undefined) {
        relatedWords.push({ id: labelId, word, translation });
        continue;
      }
      const region = {
        id: `${id}-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the airport photograph`,
        kind: "part",
        x: Math.max(0, x - Math.floor(width / 2)),
        y: Math.max(0, y - Math.floor(height / 2)),
        width,
        height,
      };
      const localIndex = labelIds.length;
      labels.push({
        id: labelId,
        word,
        translation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
        ...(lexemeId && { lexemeId }),
      });
      visualRegions.push(region);
      labelIds.push(labelId);
      priority += 1;
    }
    detailZones.push({
      id: `${id}-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      targetScale: 3.15,
      labelIds,
    });
  }
  return {
    id,
    title,
    translation,
    subtitle,
    asset,
    width: WIDTH,
    height: HEIGHT,
    parentId: options.parentId,
    visualRegions: [...visualRegions, ...options.portalRegions],
    detailZones,
    anchorAudit: {
      status: options.reviewStatus,
      policy: "visible-object-or-part-only",
      reviewedAsset: asset,
      reviewedAssetSha256: assetSha256,
      rationale: options.rationale,
      previousLabelCount: labels.length + relatedWords.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: relatedWords.length + 8,
      removedExamples: options.removedExamples,
    },
    labels,
    ...(relatedWords.length > 0 ? { relatedWords } : {}),
    portals: options.portals,
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

async function ensureAsset(kind) {
  const source = await readFile(sourceAssets[kind]);
  if (sha256(source) !== SOURCE_SHA256[kind]) throw new Error(`${kind} airport source bytes changed; rerun the pixel audit`);
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256[kind]) throw new Error(`${kind} airport JPEG is not reproducible`);
  try {
    const current = await readFile(publicAssets[kind]);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAssets[kind], output);
  return true;
}

async function updateAirport() {
  const airport = JSON.parse(await readFile(airportPath, "utf8"));
  const securityPortal = {
    id: "enter-security-checkpoint",
    label: "Enter the security checkpoint",
    translation: "进入安检区",
    childSceneId: "security-checkpoint",
    sourceVisualRegion: "security-screening",
    x: 280,
    y: 250,
    width: 500,
    height: 430,
    enterScale: 3.4,
  };
  const index = airport.portals.findIndex(({ id }) => id === securityPortal.id);
  if (index === -1) airport.portals.push(securityPortal);
  else airport.portals[index] = securityPortal;
  return writeIfChanged(airportPath, airport);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [id, title, parentId] of [
    ["security-checkpoint", "Security checkpoint", "airport"],
    ["boarding-gate", "Boarding gate", "security-checkpoint"],
  ]) {
    const existing = manifest.scenes.find((entry) => entry.id === id);
    if (!existing) manifest.scenes.push({ id, title, parentId });
    else if (existing.title !== title || existing.parentId !== parentId) throw new Error(`${id} manifest entry has a different parent or title`);
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildAirportSecurityAndGateScenes() {
  const securityAssetChanged = await ensureAsset("security");
  const gateAssetChanged = await ensureAsset("gate");
  const security = makeScene(
    "security-checkpoint",
    "Security checkpoint",
    "机场安检区",
    "Queue, screening lanes, inspection and sterile departure exit",
    securityZones,
    "/scenes/airport-security-checkpoint-premium-v1.jpg",
    PUBLIC_ASSET_SHA256.security,
    {
      parentId: "airport",
      portals: [scannerEntrance, securityPortal],
      portalRegions: [scannerEntranceRegion, securityPortalRegion],
      reviewStatus: "image-reviewed",
      rationale: "The queue fittings, trays, desk furniture, scanner shell, inspection table and departure seats were matched to the final checkpoint photograph. The nearest post has a visible shaft and cap. An independent collar, document reader functions and scanner modality cannot be identified, so those words remain available in the index.",
      removedExamples: ["queue post collar", "checkpoint passport scanner", "boarding-pass scanner", "swab kit", "checkpoint ct scanner", "passenger identity"],
    },
  );
  const gate = makeScene(
    "boarding-gate",
    "Boarding gate",
    "登机口",
    "Gate lounge, boarding bridge, aircraft doorway and airside equipment",
    gateZones,
    "/scenes/airport-boarding-gate-premium-v1.jpg",
    PUBLIC_ASSET_SHA256.gate,
    {
      parentId: "security-checkpoint",
      portals: [boardingBridgePortal],
      portalRegions: [boardingBridgePortalRegion],
      reviewStatus: "human-verified",
      rationale: "The final 1600 by 900 boarding-gate photograph was inspected at source and output resolution. It retains 120 independently pointable lounge, podium, boarding-bridge, aircraft-cabin and airside service parts. Gate numbers, airline identity, passenger actions, flight status, hidden aircraft systems and operational claims were excluded.",
      removedExamples: ["gate number", "airline brand", "boarding action", "flight delay", "passenger identity", "aircraft control"],
    },
  );
  const newWordSources = new Map();
  for (const scene of [security, gate]) {
    for (const label of [...scene.labels, ...(scene.relatedWords ?? [])]) {
      const normalized = label.word.toLocaleLowerCase();
      const sources = newWordSources.get(normalized) ?? [];
      sources.push(`${scene.id}:${label.id}`);
      newWordSources.set(normalized, sources);
    }
  }
  const duplicateWords = [...newWordSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([word, sources]) => `${word} (${sources.join(", ")})`);
  if (duplicateWords.length > 0) {
    throw new Error(`airport security/gate batches contain duplicate display words: ${duplicateWords.join("; ")}`);
  }
  const allNewWords = new Set(newWordSources.keys());
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Set();
  for (const entry of manifest.scenes) {
    if (entry.id === security.id || entry.id === gate.id) continue;
    const other = JSON.parse(await readFile(resolve(projectRoot, "public/data/scenes", `${entry.id}.json`), "utf8"));
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  const existingDuplicates = [...allNewWords].filter((word) => existingWords.has(word));
  if (existingDuplicates.length > 0) {
    throw new Error(`airport security/gate term duplicates existing words: ${existingDuplicates.join(", ")}`);
  }
  await writeIfChanged(scenePaths.security, security);
  await writeIfChanged(scenePaths.gate, gate);
  const airportChanged = await updateAirport();
  const manifestChanged = await updateManifest();
  return {
    securityAssetChanged,
    gateAssetChanged,
    airportChanged,
    manifestChanged,
    securityLabels: security.labels.length,
    gateLabels: gate.labels.length,
    totalLabels: security.labels.length + gate.labels.length,
  };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildAirportSecurityAndGateScenes()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-airport-security-and-gate-scenes: ${error.message}`);
      process.exitCode = 1;
    });
}
