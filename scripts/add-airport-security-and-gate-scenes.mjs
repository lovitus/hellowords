import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the connected airport security -> boarding-gate batch from reviewed
 * source photographs. All labels are newly composed, pixel-audited component
 * terms; passenger actions, airline identity, flight status and hidden system
 * behaviour are intentionally excluded.
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
    description: "Follow the queue rails, tray stacks, floor stripes and accessible lane.",
    x: 0,
    y: 0,
    width: 500,
    height: 900,
    labels: [
      ["checkpoint queue", "安检队列", 120, 250],
      ["security queue rail", "安检排队栏杆", 160, 320],
      ["stanchion pole", "隔离柱杆", 120, 400],
      ["stanchion foot", "隔离柱底座", 120, 500],
      ["belt hook", "隔离带挂钩", 160, 350],
      ["queue belt buckle", "排队隔离带扣", 160, 450],
      ["queue sign panel", "排队牌面板", 80, 520],
      ["floor wayfinding stripe", "地面导向条", 300, 700],
      ["security document tray", "安检证件托盘", 300, 740],
      ["boarding pass holder", "登机牌夹", 260, 760],
      ["identity document tray", "身份证件托盘", 350, 780],
      ["passenger bin stack", "乘客置物箱堆", 100, 760],
      ["accessible queue lane", "无障碍排队通道", 420, 700],
      ["queue corner", "排队转角", 420, 400],
      ["barrier base", "隔离栏底座", 240, 350],
      ["checkpoint lane divider", "安检通道分隔栏", 350, 450],
      ["tray cart", "托盘车", 120, 700],
      ["tray cart wheel", "托盘车轮", 130, 820],
      ["queue rail cap", "排队栏杆帽", 170, 320],
      ["queue post collar", "隔离柱环", 120, 400],
    ],
  },
  {
    id: "document-check",
    title: "Document check podium",
    translation: "证件检查台",
    description: "Inspect the document podium, reader housings, glass partition and counter hardware.",
    x: 500,
    y: 0,
    width: 350,
    height: 900,
    labels: [
      ["identity-check podium", "身份检查台", 550, 350],
      ["checkpoint passport scanner", "安检护照扫描器", 610, 400],
      ["boarding-pass scanner", "登机牌扫描器", 670, 400],
      ["document scanner bed", "证件扫描台面", 590, 470],
      ["checkpoint scanner glass", "安检扫描玻璃", 590, 460],
      ["monitor housing", "显示器外壳", 550, 300],
      ["keyboard deck", "键盘台面", 560, 450],
      ["inspection counter shelf", "检查柜台搁板", 560, 500],
      ["privacy glass", "隐私玻璃", 700, 350],
      ["counter cable cover", "柜台电缆盖", 650, 500],
      ["check-in reader", "值机读卡器", 680, 430],
      ["document reader stand", "证件读卡器支架", 680, 450],
      ["checkpoint inspection tray", "安检检查托盘", 740, 450],
      ["document tray rim", "证件托盘边", 760, 480],
      ["inspection podium drawer", "检查台抽屉", 550, 520],
      ["inspection podium foot", "检查台脚座", 550, 580],
      ["scanner hood", "扫描器罩", 610, 300],
      ["scanner status light", "扫描器状态灯", 630, 300],
      ["checkpoint glass partition post", "安检玻璃隔断柱", 730, 300],
      ["desk stool", "检查台凳", 580, 600],
    ],
  },
  {
    id: "ct-screening",
    title: "CT and conveyor lanes",
    translation: "CT 与传送带通道",
    description: "Study the checkpoint scanners, conveyor rollers, trays and operator controls.",
    x: 850,
    y: 0,
    width: 300,
    height: 600,
    labels: [
      ["checkpoint ct scanner", "安检 CT 扫描器", 920, 220],
      ["ct scanner tunnel", "CT 扫描通道", 920, 300],
      ["ct conveyor roller", "CT 传送带滚筒", 1_000, 320],
      ["conveyor side guard", "传送带侧护板", 1_000, 350],
      ["operator console", "操作台", 870, 400],
      ["ct console monitor", "CT 操作台显示器", 890, 370],
      ["tunnel curtain", "通道软帘", 930, 300],
      ["exit conveyor", "出口传送带", 1_040, 420],
      ["entrance conveyor", "入口传送带", 860, 420],
      ["divestiture table", "置物台", 1_050, 500],
      ["gray tray", "灰色托盘", 1_000, 500],
      ["blue tray", "蓝色托盘", 950, 500],
      ["tray nest", "托盘嵌套架", 900, 520],
      ["tray return rack", "托盘回收架", 1_090, 500],
      ["x-ray unit housing", "X 光设备外壳", 1_000, 200],
      ["walk-through detector arch", "步行探测门框", 1_060, 260],
      ["walk-through detector mat", "探测门脚垫", 1_070, 380],
      ["security shoe tray", "安检鞋物托盘", 1_030, 520],
      ["laptop tray", "电脑托盘", 1_020, 550],
      ["bag inspection table", "行李检查台", 1_080, 550],
      ["scanner belt", "扫描传送带", 980, 400],
      ["scanner belt roller", "扫描传送带滚轮", 990, 410],
      ["ct scanner panel", "CT 扫描器面板", 940, 250],
      ["scanner vent", "扫描器通风口", 960, 200],
      ["scanner foot", "扫描器脚座", 930, 480],
    ],
  },
  {
    id: "secondary-inspection",
    title: "Secondary inspection",
    translation: "复检区",
    description: "Inspect the hand-search table, swab kit, inspection light and evidence containers.",
    x: 500,
    y: 600,
    width: 650,
    height: 300,
    labels: [
      ["secondary inspection table", "复检台", 900, 700],
      ["inspection task light", "复检工作灯", 940, 650],
      ["hand-search tray", "人工检查托盘", 900, 750],
      ["swab kit", "擦拭采样套件", 930, 760],
      ["swab holder", "采样棒支架", 940, 770],
      ["test-device housing", "检测设备外壳", 850, 700],
      ["privacy screen panel", "隐私屏风面板", 780, 650],
      ["evidence bin", "检查物品箱", 1_000, 750],
      ["secondary glove dispenser", "复检手套分配盒", 780, 740],
      ["secondary inspection counter", "复检柜台", 850, 820],
      ["inspection stool", "复检凳", 900, 850],
      ["camera dome", "摄像机穹顶", 1_050, 630],
      ["floor mat edge", "地垫边", 980, 870],
      ["inspection cabinet", "复检柜", 700, 700],
      ["tray support", "托盘支撑", 850, 760],
      ["secondary counter drawer", "复检柜台抽屉", 860, 840],
      ["bin liner", "箱内衬", 1_000, 780],
      ["search light", "检查灯", 950, 660],
    ],
  },
  {
    id: "sterile-exit",
    title: "Sterile departure exit",
    translation: "安检后出发区出口",
    description: "Follow the access pedestal, departure corridor, gate seating and boarding doorway.",
    x: 1_150,
    y: 0,
    width: 450,
    height: 600,
    labels: [
      ["access-control pedestal", "门禁立柱", 1_260, 420],
      ["boarding reader", "登机读卡器", 1_260, 400],
      ["glass swing gate", "玻璃摆闸", 1_330, 380],
      ["sterile gate latch", "洁净区闸门插销", 1_340, 400],
      ["exit barrier", "出口隔离栏", 1_430, 350],
      ["departure-side corridor", "出发侧走廊", 1_460, 220],
      ["jet-bridge doorway", "登机廊桥门", 1_520, 220],
      ["sterile gate podium", "洁净区登机台", 1_280, 500],
      ["gate seating", "登机区座椅", 1_400, 450],
      ["seating armrest", "座椅扶手", 1_430, 450],
      ["charging shelf", "充电搁板", 1_490, 500],
      ["checkpoint wall clock", "安检区挂钟", 1_550, 180],
      ["checkpoint ceiling light panel", "安检区顶面灯板", 1_400, 100],
      ["acoustic ceiling baffle", "吸音吊板", 1_300, 100],
      ["terrazzo floor tile", "水磨石地砖", 1_400, 550],
      ["tactile floor strip", "盲道条", 1_500, 550],
      ["checkpoint fire door", "安检区防火门", 1_200, 100],
      ["checkpoint emergency light", "安检区应急灯", 1_210, 120],
      ["extinguisher cabinet", "灭火器柜", 1_220, 220],
      ["sterile exit threshold", "洁净区出口门槛", 1_510, 400],
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
  x: 1_250,
  y: 140,
  width: 350,
  height: 380,
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

function makeScene(id, title, translation, subtitle, zones, asset, assetSha256, portal) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, labelTranslation, x, y] of zone.labels) {
      const idSuffix = slug(word);
      const region = {
        id: `${id}-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the airport photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `${id}-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`${id}-${idSuffix}`);
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
  if (portal?.region) visualRegions.push(portal.region);
  return {
    id,
    title,
    translation,
    subtitle,
    asset,
    width: WIDTH,
    height: HEIGHT,
    parentId: portal?.parentId,
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: asset,
      reviewedAssetSha256: assetSha256,
      rationale: portal?.rationale,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: portal?.removedExamples,
    },
    labels,
    portals: portal?.value ? [portal.value] : [],
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
      value: securityPortal,
      region: securityPortalRegion,
      rationale: "The final 1600 by 900 security-checkpoint photograph was inspected at source and output resolution. It retains 103 independently pointable queue, document, CT screening, secondary-inspection and sterile-exit parts. Passenger identity, screening outcomes, prohibited items, security performance, operational procedures and written signs were excluded.",
      removedExamples: ["passenger identity", "screening result", "prohibited item", "security procedure", "flight status", "airline brand"],
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
      value: boardingBridgePortal,
      region: boardingBridgePortalRegion,
      rationale: "The final 1600 by 900 boarding-gate photograph was inspected at source and output resolution. It retains 120 independently pointable lounge, podium, boarding-bridge, aircraft-cabin and airside service parts. The visible bridge corridor is the entry to the detailed passenger-boarding-bridge scene. Gate numbers, airline identity, passenger actions, flight status, hidden aircraft systems and operational claims were excluded.",
      removedExamples: ["gate number", "airline brand", "boarding action", "flight delay", "passenger identity", "aircraft control"],
    },
  );
  const newWordSources = new Map();
  for (const [sceneId, labels] of [[security.id, security.labels], [gate.id, gate.labels]]) {
    for (const label of labels) {
      const normalized = label.word.toLocaleLowerCase();
      const sources = newWordSources.get(normalized) ?? [];
      sources.push(`${sceneId}:${label.id}`);
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
