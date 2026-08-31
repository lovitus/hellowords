import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const manifestPath = resolve(sceneRoot, "manifest.json");
const integrate = process.argv.includes("--integrate");
const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const scenes = [
  {
    id: "school-corridor",
    title: "School corridor",
    translation: "学校走廊",
    subtitle: "Lockers, doors, displays, circulation and shared facilities",
    parentId: "school-campus",
    source: "scripts/assets/school-corridor-v1.png",
    asset: "/scenes/school-corridor-premium-v1.jpg",
    sourceSha256: "b986ebd63302b210748c0ea05998e7198a9be556a8ff9a1ebdc0a1e9b848b1d8",
    assetSha256: "bfee1ecd5f13dd2ca1a8a6860cb16582bd1d9c4a5c456702e37966261f9be13b",
    removedExamples: ["student identity", "class schedule", "room name", "school rule", "locker contents", "alarm state", "camera recording", "written notice"],
    zones: [
      {
        id: "daylight-and-left-services", title: "Daylight and left services", translation: "采光与左侧设施",
        description: "Inspect the corridor window, planting, radiator, drinking station, waste sorting and fire cabinet.",
        x: 0, y: 0, width: 520, height: 941, targetScale: 2.55,
        labels: [
          ["Corridor picture window", "走廊景观窗", 55, 260, 0], ["Corridor window frame", "走廊窗框", 45, 265, 2],
          ["Corridor glazing pane", "走廊玻璃窗格", 85, 230, 1], ["Corridor window mullion", "走廊窗竖梃", 90, 245, 3],
          ["Corridor window sill", "走廊窗台", 75, 415, 1], ["Corridor radiator", "走廊散热器", 88, 665, 0],
          ["Radiator top grille", "散热器顶部格栅", 86, 640, 3], ["Corridor indoor palm", "走廊室内棕榈", 165, 405, 0],
          ["Palm frond", "棕榈叶片", 165, 330, 2], ["Palm leaf stem", "棕榈叶柄", 170, 425, 3],
          ["Corridor palm planter", "走廊棕榈花盆", 160, 620, 1], ["Plant-pot rim", "花盆边沿", 160, 575, 3],
          ["Corridor drinking fountain", "走廊饮水台", 285, 490, 0], ["Drinking-fountain basin", "饮水台盆", 286, 515, 1],
          ["Fountain bubbler", "饮水喷嘴", 276, 495, 3], ["Fountain push control", "饮水台按钮", 296, 475, 3],
          ["Fountain splashback", "饮水台挡水板", 285, 450, 2], ["Corridor recycling bin", "走廊回收桶", 330, 635, 0],
          ["Recycling-bin lid", "回收桶盖", 330, 565, 2], ["Corridor general-waste bin", "走廊普通垃圾桶", 385, 630, 0],
          ["General-bin rim", "普通垃圾桶边沿", 385, 570, 3], ["Corridor compost bin", "走廊堆肥桶", 430, 620, 1],
          ["Compost-bin lid", "堆肥桶盖", 430, 560, 3], ["Corridor fire cabinet", "走廊灭火器柜", 430, 400, 0],
          ["Fire-cabinet glazing", "灭火器柜玻璃", 430, 405, 2],
        ],
      },
      {
        id: "lockers-and-classroom-doors", title: "Lockers and classroom doors", translation: "储物柜与教室门",
        description: "Follow the locker banks, doors, frames, hinges, locks, handles, kick plates and thresholds.",
        x: 470, y: 80, width: 1_202, height: 780, targetScale: 2.65,
        labels: [
          ["Left corridor locker bank", "左侧走廊储物柜组", 670, 430, 0], ["Left tall locker door", "左侧高储物柜门", 665, 390, 1],
          ["Left locker vent row", "左柜通风孔列", 660, 320, 3], ["Left locker latch", "左柜锁扣", 675, 410, 3],
          ["Left combination lock", "左柜密码锁", 675, 400, 2], ["Left locker hinge", "左柜铰链", 650, 430, 4],
          ["Left locker end panel", "左柜端板", 720, 435, 2], ["Left locker plinth", "左柜底座", 685, 575, 2],
          ["Right corridor locker bank", "右侧走廊储物柜组", 1_570, 420, 0], ["Right upper locker door", "右侧上层储物柜门", 1_540, 245, 1],
          ["Right lower locker door", "右侧下层储物柜门", 1_540, 610, 1], ["Right locker vent", "右柜通风孔", 1_565, 205, 3],
          ["Right combination lock", "右柜密码锁", 1_525, 320, 2], ["Right locker recessed handle", "右柜嵌入式把手", 1_525, 318, 3],
          ["Right locker hinge", "右柜铰链", 1_505, 360, 4], ["Right locker divider", "右柜分隔条", 1_585, 430, 3],
          ["Right locker base rail", "右柜底部导轨", 1_555, 815, 2], ["Near classroom door", "近处教室门", 1_445, 440, 0],
          ["Near door vision panel", "近门观察窗", 1_440, 290, 1], ["Near door lever handle", "近门执手", 1_422, 455, 2],
          ["Near door closer", "近门闭门器", 1_430, 180, 3], ["Near door kick plate", "近门踢脚板", 1_438, 710, 2],
          ["Near doorway frame", "近门门框", 1_470, 400, 1], ["Near door hinge", "近门铰链", 1_484, 470, 4],
          ["Near doorway threshold", "近门门槛", 1_445, 760, 3],
        ],
      },
      {
        id: "ceiling-and-floor-route", title: "Ceiling and floor route", translation: "天花与地面动线",
        description: "Trace the ceiling grid, lights, vents, detectors, wall guards, skirting and tiled circulation route.",
        x: 250, y: 0, width: 1_200, height: 941, targetScale: 2.35,
        labels: [
          ["Corridor suspended ceiling", "走廊吊顶", 850, 90, 0], ["Ceiling acoustic tile", "吸声天花板", 760, 75, 1],
          ["Ceiling support grid", "天花支撑网格", 820, 120, 2], ["Long ceiling light", "长条天花灯", 680, 25, 0],
          ["Square ceiling light", "方形天花灯", 1_110, 75, 1], ["Ceiling light diffuser", "天花灯扩散罩", 1_110, 75, 3],
          ["Corridor ventilation grille", "走廊通风格栅", 840, 45, 0], ["Vent grille louvre", "通风格栅叶片", 840, 45, 4],
          ["Corridor smoke detector", "走廊烟雾探测器", 775, 170, 1], ["Ceiling sprinkler head", "天花喷淋头", 970, 180, 2],
          ["Corridor alarm beacon", "走廊报警灯", 1_370, 85, 1], ["Corridor security camera", "走廊监控摄像头", 315, 100, 0],
          ["Camera wall bracket", "摄像头墙架", 315, 100, 3], ["School-corridor handrail", "学校走廊扶手", 585, 520, 0],
          ["Handrail wall bracket", "扶手墙托", 585, 520, 3], ["Corridor wall guard", "走廊护墙带", 1_025, 475, 0],
          ["Wall-guard end cap", "护墙带端盖", 1_025, 475, 3], ["Corridor skirting board", "走廊踢脚线", 970, 650, 1],
          ["Main corridor floor", "主走廊地面", 850, 760, 0], ["Corridor floor tile", "走廊地砖", 820, 760, 1],
          ["Corridor tile seam", "走廊地砖接缝", 850, 790, 3], ["Floor border strip", "地面边条", 570, 735, 2],
          ["Accessible circulation lane", "无障碍通行带", 850, 680, 0], ["Doorway floor transition", "门口地面过渡条", 1_440, 760, 3],
          ["Corridor wall corner guard", "走廊墙角护条", 560, 520, 2],
        ],
      },
      {
        id: "central-double-doorway", title: "Central double doorway", translation: "中央双开门",
        description: "Inspect the open double doorway and the bright dining furniture visible beyond it.",
        x: 690, y: 230, width: 410, height: 430, targetScale: 2.85,
        labels: [
          ["Central double doorway", "中央双开门口", 850, 415, 0], ["Left open door leaf", "左侧开启门扇", 790, 420, 0],
          ["Right open door leaf", "右侧开启门扇", 940, 420, 0], ["Left doorway glazing strip", "左门玻璃条", 795, 390, 2],
          ["Right doorway glazing strip", "右门玻璃条", 930, 390, 2], ["Left doorway lever", "左门执手", 810, 485, 2],
          ["Right doorway lever", "右门执手", 925, 485, 2], ["Left doorway closer arm", "左门闭门器臂", 800, 335, 3],
          ["Right doorway closer arm", "右门闭门器臂", 930, 335, 3], ["Double-door head frame", "双开门上框", 860, 310, 1],
          ["Double-door side jamb", "双开门侧框", 750, 440, 2], ["Double-door threshold", "双开门门槛", 860, 605, 1],
          ["Left door kick plate", "左门踢脚板", 795, 540, 3], ["Right door kick plate", "右门踢脚板", 935, 540, 3],
          ["Door hinge barrel", "门铰链轴套", 960, 450, 4], ["Dining-hall glimpse", "餐厅内景", 860, 405, 0],
          ["Distant dining table", "远处餐桌", 865, 440, 1], ["Distant dining tabletop", "远处餐桌面", 865, 430, 3],
          ["Distant dining bench", "远处餐厅长凳", 850, 470, 2], ["Distant chair back", "远处椅背", 910, 445, 3],
          ["Distant table leg", "远处餐桌腿", 875, 465, 4], ["Dining-hall window wall", "餐厅窗墙", 860, 370, 1],
          ["Far doorway floor", "远门内地面", 860, 520, 2], ["Doorway reveal", "门洞内侧", 760, 390, 3],
          ["Double-door meeting stile", "双门合缝条", 860, 420, 4],
        ],
      },
      {
        id: "artwork-and-trophy-display", title: "Artwork and trophy display", translation: "作品与奖杯展示",
        description: "Explore the covered artwork board, display cabinet, trophies, cups, shelves and wall fittings.",
        x: 1_000, y: 150, width: 450, height: 520, targetScale: 2.75,
        labels: [
          ["Corridor artwork board", "走廊作品展板", 1_285, 315, 0], ["Artwork-board frame", "作品展板框", 1_285, 315, 2],
          ["Artwork-board glazing", "作品展板玻璃", 1_285, 315, 3], ["Artwork-board backing", "作品展板底板", 1_285, 315, 3],
          ["Blue student painting", "蓝色学生画作", 1_355, 300, 1], ["Purple student painting", "紫色学生画作", 1_315, 270, 1],
          ["Yellow student painting", "黄色学生画作", 1_240, 300, 1], ["Artwork mounting clip", "画作固定夹", 1_270, 260, 4],
          ["Artwork display pane", "作品展示窗格", 1_235, 325, 2], ["Corridor trophy cabinet", "走廊奖杯柜", 1_070, 440, 0],
          ["Trophy-cabinet frame", "奖杯柜框架", 1_070, 440, 2], ["Trophy-cabinet glass door", "奖杯柜玻璃门", 1_070, 430, 1],
          ["Trophy-cabinet handle", "奖杯柜把手", 1_095, 445, 3], ["Upper trophy shelf", "奖杯柜上层板", 1_070, 355, 2],
          ["Lower trophy shelf", "奖杯柜下层板", 1_070, 485, 2], ["Gold presentation cup", "金色奖杯", 1_075, 345, 0],
          ["Presentation-cup handle", "奖杯把手", 1_075, 345, 3], ["Presentation-cup stem", "奖杯杯茎", 1_075, 375, 3],
          ["Silver presentation cup", "银色奖杯", 1_070, 450, 1], ["Small award trophy", "小型奖杯", 1_085, 505, 1],
          ["Trophy pedestal", "奖杯底座", 1_080, 520, 3], ["Display-cabinet plinth", "展示柜底座", 1_070, 590, 2],
          ["Display-cabinet side panel", "展示柜侧板", 1_030, 445, 3], ["Wall display spacer", "墙面展板垫块", 1_190, 315, 4],
          ["Artwork-board lower rail", "作品展板下横杆", 1_285, 410, 3],
        ],
      },
      {
        id: "bench-and-lost-property", title: "Bench and shared storage", translation: "长凳与共享存放",
        description: "Inspect the corridor bench, cushion, cubbies, bags, umbrella stand and nearby door fittings.",
        x: 1_100, y: 350, width: 572, height: 591, targetScale: 2.65,
        labels: [
          ["Corridor wooden bench", "走廊木长凳", 1_285, 585, 0], ["Bench seat cushion", "长凳坐垫", 1_285, 560, 1],
          ["Bench cushion seam", "坐垫接缝", 1_285, 560, 3], ["Bench side panel", "长凳侧板", 1_345, 610, 2],
          ["Bench front rail", "长凳前横档", 1_285, 635, 2], ["Bench support foot", "长凳支脚", 1_330, 650, 4],
          ["Corridor cubby unit", "走廊格柜", 1_190, 555, 0], ["Upper storage cubby", "上层储物格", 1_190, 530, 1],
          ["Lower storage cubby", "下层储物格", 1_190, 590, 1], ["Cubby shelf edge", "格柜搁板边", 1_190, 565, 3],
          ["Lost-property backpack", "失物背包", 1_205, 550, 0], ["Backpack shoulder strap", "背包肩带", 1_205, 550, 3],
          ["Lost-property satchel", "失物挎包", 1_170, 595, 1], ["Satchel flap", "挎包翻盖", 1_170, 590, 3],
          ["Corridor umbrella stand", "走廊伞架", 1_390, 625, 0], ["Umbrella-stand rim", "伞架上沿", 1_390, 570, 3],
          ["Closed blue umbrella", "收起的蓝伞", 1_390, 560, 1], ["Umbrella curved handle", "雨伞弯柄", 1_390, 510, 2],
          ["Umbrella ferrule", "雨伞尖头", 1_390, 660, 4], ["Corridor classroom-door frame", "走廊教室门框", 1_475, 470, 1],
          ["Classroom door stop", "教室门挡", 1_490, 710, 3], ["Corridor wall outlet", "走廊墙面插座", 1_455, 620, 2],
          ["Wall outlet faceplate", "墙面插座面板", 1_455, 620, 4], ["Corridor baseboard corner", "走廊踢脚线转角", 1_455, 740, 3],
          ["Bench-wall clearance", "长凳墙间隙", 1_350, 620, 4],
        ],
      },
    ],
  },
  {
    id: "school-science-laboratory",
    title: "School science laboratory",
    translation: "学校科学实验室",
    subtitle: "Teaching benches, glassware, models, microscopy and safety equipment",
    parentId: "school-science-preparation-room",
    source: "scripts/assets/school-science-laboratory-v1.png",
    asset: "/scenes/school-science-laboratory-premium-v1.jpg",
    sourceSha256: "92452c117ff36eca2ef48ba08670a608d80706c305a702f2b0c1e7fd25b89bf6",
    assetSha256: "baafd0b221a587705b595a40553582af48216c1ccdceb9657fc90a8f06bc6a36",
    removedExamples: ["chemical reaction", "experiment result", "student identity", "hazardous contents", "measurement reading", "written label", "brand name", "hidden utility"],
    zones: [
      {
        id: "preparation-doorway-and-eyewash", title: "Preparation doorway and eyewash", translation: "准备室门口与洗眼设施",
        description: "Inspect the preparation doorway, glass cabinet, emergency eyewash and nearby storage.",
        x: 0, y: 0, width: 460, height: 941, targetScale: 2.65,
        labels: [
          ["Laboratory preparation doorway", "实验室准备室门口", 250, 470, 0], ["Preparation-door frame", "准备室门框", 250, 430, 1],
          ["Preparation-door jamb", "准备室门梃", 245, 470, 3], ["Preparation-door hinge", "准备室门铰链", 235, 510, 4],
          ["Preparation-door threshold", "准备室门槛", 260, 820, 2], ["Preparation-room counter", "准备室台面", 90, 610, 0],
          ["Preparation counter edge", "准备台边缘", 95, 610, 3], ["Preparation sink basin", "准备室水槽盆", 90, 640, 1],
          ["Preparation sink drain", "准备室水槽排水口", 90, 650, 4], ["Emergency eyewash unit", "紧急洗眼装置", 105, 535, 0],
          ["Eyewash green bowl", "洗眼绿色盆", 105, 555, 1], ["Eyewash spray nozzle", "洗眼喷嘴", 95, 530, 3],
          ["Eyewash activation handle", "洗眼启动手柄", 110, 500, 3], ["Eyewash drain pipe", "洗眼排水管", 105, 590, 2],
          ["Preparation glass cabinet", "准备室玻璃柜", 90, 220, 0], ["Glass-cabinet shelf", "玻璃柜搁板", 90, 250, 2],
          ["Glass-cabinet door", "玻璃柜门", 90, 230, 1], ["Glass-cabinet handle", "玻璃柜把手", 130, 260, 3],
          ["Cabinet reagent jar", "柜内试剂罐", 105, 260, 1], ["Reagent-jar cap", "试剂罐盖", 105, 245, 3],
          ["Preparation light switch", "准备室灯开关", 205, 445, 2], ["Light-switch faceplate", "灯开关面板", 205, 445, 4],
          ["Preparation lower shelf", "准备室下层搁板", 95, 850, 1], ["Preparation storage tray", "准备室储物盘", 95, 850, 2],
          ["Doorway wall corner", "门口墙角", 330, 430, 3],
        ],
      },
      {
        id: "student-benches-and-glassware", title: "Student benches and glassware", translation: "学生实验台与玻璃器皿",
        description: "Explore the fixed student benches, sinks, stools, outlets, glassware and support fittings.",
        x: 330, y: 250, width: 760, height: 691, targetScale: 2.55,
        labels: [
          ["Front student laboratory bench", "前排学生实验台", 650, 650, 0], ["Student bench countertop", "学生实验台面", 650, 560, 1],
          ["Student bench cabinet", "学生实验台柜", 650, 690, 0], ["Student cabinet door", "学生实验台柜门", 650, 700, 2],
          ["Student cabinet handle", "学生柜门把手", 650, 660, 3], ["Student bench end panel", "学生实验台端板", 790, 700, 2],
          ["Student bench plinth", "学生实验台底座", 650, 800, 2], ["Student bench outlet", "学生实验台插座", 760, 560, 1],
          ["Student outlet faceplate", "学生插座面板", 760, 560, 4], ["Student laboratory stool", "学生实验凳", 470, 680, 0],
          ["Stool round seat", "实验凳圆座", 470, 650, 1], ["Stool tubular leg", "实验凳管腿", 470, 730, 3],
          ["Student bench sink", "学生实验台水槽", 400, 575, 0], ["Student sink rim", "学生水槽边沿", 400, 570, 3],
          ["Student gooseneck faucet", "学生台鹅颈水龙头", 415, 520, 1], ["Student faucet handle", "学生水龙头把手", 425, 540, 3],
          ["Laboratory beaker group", "实验室烧杯组", 545, 430, 0], ["Tall laboratory beaker", "高型实验室烧杯", 570, 420, 1],
          ["Laboratory conical flask", "实验室锥形瓶", 640, 420, 0], ["Conical-flask neck", "锥形瓶瓶颈", 640, 390, 3],
          ["Laboratory graduated cylinder", "实验室量筒", 725, 390, 0], ["Cylinder base foot", "量筒底座", 725, 440, 3],
          ["Blue laboratory tray", "蓝色实验托盘", 610, 440, 1], ["Laboratory wash bottle", "实验室洗瓶", 770, 440, 1],
          ["Wash-bottle nozzle", "洗瓶喷嘴", 770, 420, 3],
        ],
      },
      {
        id: "teacher-demonstration-bench", title: "Teacher demonstration bench", translation: "教师演示台",
        description: "Inspect the teacher bench, sink, computer equipment, storage, presentation arm and safety fittings.",
        x: 1_000, y: 180, width: 672, height: 560, targetScale: 2.65,
        labels: [
          ["Teacher demonstration bench", "教师演示台", 1_300, 470, 0], ["Demonstration countertop", "演示台面", 1_300, 430, 1],
          ["Demonstration front panel", "演示台前板", 1_300, 540, 2], ["Demonstration cabinet door", "演示台柜门", 1_250, 540, 2],
          ["Demonstration cabinet handle", "演示台柜门把手", 1_250, 500, 3], ["Demonstration bench plinth", "演示台底座", 1_300, 610, 3],
          ["Teacher bench sink", "教师台水槽", 1_430, 420, 0], ["Teacher sink basin", "教师水槽盆", 1_430, 420, 2],
          ["Teacher sink faucet", "教师台水龙头", 1_445, 350, 1], ["Teacher faucet lever", "教师水龙头手柄", 1_460, 380, 3],
          ["Teacher workstation monitor", "教师工作站显示器", 1_280, 340, 0], ["Monitor support stand", "显示器支架", 1_280, 385, 2],
          ["Teacher workstation keyboard", "教师工作站键盘", 1_300, 410, 1], ["Teacher pointing device", "教师指点设备", 1_350, 410, 2],
          ["Document-camera arm", "实物展台支臂", 1_200, 330, 0], ["Document-camera head", "实物展台镜头", 1_200, 320, 2],
          ["Teacher specimen tray", "教师标本盘", 1_365, 410, 1], ["Demonstration gas tap", "演示台燃气嘴", 1_155, 410, 1],
          ["Gas-tap control knob", "燃气嘴控制旋钮", 1_155, 410, 3], ["Teacher bench outlet strip", "教师台插座条", 1_100, 425, 2],
          ["Teacher laboratory stool", "教师实验凳", 1_030, 505, 1], ["Teacher stool footrest", "教师凳脚踏", 1_030, 560, 3],
          ["Teacher bench end cap", "教师台端盖", 1_050, 500, 3], ["Demonstration splashback", "演示台挡水板", 1_420, 330, 2],
          ["Bench cable grommet", "实验台穿线孔", 1_250, 420, 4],
        ],
      },
      {
        id: "fume-cupboard-and-instruments", title: "Fume cupboard and instruments", translation: "通风柜与实验仪器",
        description: "Inspect the complete fume cupboard, extraction path, stands, clamps, balance and heating equipment.",
        x: 700, y: 40, width: 430, height: 560, targetScale: 2.75,
        labels: [
          ["School laboratory fume cupboard", "学校实验室通风柜", 930, 255, 0], ["Fume-cupboard sash", "通风柜视窗", 930, 280, 1],
          ["Sash lifting frame", "视窗升降框", 930, 260, 3], ["Fume-cupboard work surface", "通风柜工作面", 930, 405, 1],
          ["Fume-cupboard side panel", "通风柜侧板", 850, 300, 2], ["Fume-cupboard lower cabinet", "通风柜下柜", 930, 470, 1],
          ["Fume-cupboard cabinet handle", "通风柜柜把手", 930, 455, 3], ["Fume-cupboard extraction hood", "通风柜排风罩", 930, 175, 1],
          ["Fume extraction duct", "通风柜排风管", 930, 80, 0], ["Extraction-duct collar", "排风管套环", 930, 120, 3],
          ["Laboratory retort stand", "实验室铁架台", 820, 390, 0], ["Retort stand rod", "铁架台立杆", 820, 330, 2],
          ["Retort bosshead", "铁架台万向夹", 820, 350, 3], ["Retort utility clamp", "铁架台通用夹", 820, 380, 2],
          ["Retort stand base", "铁架台底座", 820, 430, 1], ["Laboratory digital balance", "实验室电子天平", 760, 410, 0],
          ["Laboratory balance pan", "实验室天平秤盘", 760, 395, 2], ["Laboratory balance display", "实验室天平显示屏", 760, 425, 3],
          ["Laboratory hot plate", "实验室加热板", 1_040, 410, 0], ["Hot-plate ceramic top", "加热板陶瓷面", 1_040, 400, 2],
          ["Hot-plate control dial", "加热板控制旋钮", 1_070, 420, 3], ["Laboratory tripod", "实验室三脚架", 885, 390, 1],
          ["Tripod wire gauze", "三脚架石棉网", 885, 375, 2], ["Laboratory thermometer", "实验室温度计", 1_000, 350, 1],
          ["Thermometer support clip", "温度计固定夹", 1_000, 365, 4],
        ],
      },
      {
        id: "models-windows-and-safety", title: "Models, windows and safety wall", translation: "模型、窗户与安全墙",
        description: "Explore the anatomy and molecular models, window planting, display board, safety boxes and protective clothing.",
        x: 360, y: 60, width: 1_312, height: 470, targetScale: 2.6,
        labels: [
          ["Laboratory skeleton model", "实验室骨骼模型", 1_080, 290, 0], ["Skeleton model skull", "骨骼模型颅骨", 1_080, 200, 1],
          ["Skeleton model rib cage", "骨骼模型胸廓", 1_080, 280, 2], ["Skeleton model pelvis", "骨骼模型骨盆", 1_080, 370, 2],
          ["Laboratory torso model", "实验室躯干模型", 580, 300, 0], ["Torso-model head", "躯干模型头部", 580, 235, 1],
          ["Torso-model chest panel", "躯干模型胸腔板", 580, 320, 2], ["Laboratory molecular model", "实验室分子模型", 690, 330, 0],
          ["Molecular-model atom sphere", "分子模型原子球", 690, 330, 2], ["Molecular-model bond rod", "分子模型键杆", 690, 330, 3],
          ["Laboratory globe", "实验室地球仪", 520, 280, 0], ["Globe meridian ring", "地球仪经线圈", 520, 280, 3],
          ["Laboratory potted specimen", "实验室盆栽标本", 470, 250, 1], ["Specimen plant leaf", "标本植物叶片", 470, 220, 3],
          ["Laboratory broad window", "实验室大窗", 430, 190, 0], ["Laboratory window mullion", "实验室窗竖梃", 430, 190, 3],
          ["Laboratory display board", "实验室展示板", 1_260, 200, 0], ["Display-board frame", "展示板框", 1_260, 200, 2],
          ["Laboratory wall clock", "实验室挂钟", 1_465, 145, 1], ["Laboratory clock rim", "挂钟外圈", 1_465, 145, 3],
          ["Laboratory fire blanket box", "实验室灭火毯盒", 1_480, 235, 1], ["Laboratory first-aid box", "实验室急救箱", 1_535, 235, 1],
          ["Laboratory extinguisher", "实验室灭火器", 1_505, 335, 0], ["Laboratory coat hook rail", "实验服挂钩条", 1_575, 245, 2],
          ["White laboratory coat", "白色实验服", 1_600, 315, 0],
        ],
      },
      {
        id: "microscope-workstation", title: "Microscope workstation", translation: "显微镜工作台",
        description: "Inspect the foreground microscope, its optical and mechanical parts, slides, test tubes and workstation furniture.",
        x: 980, y: 430, width: 692, height: 511, targetScale: 2.85,
        labels: [
          ["School microscope workstation", "学校显微镜工作台", 1_350, 690, 0], ["School laboratory microscope", "学校实验室显微镜", 1_300, 600, 0],
          ["Binocular microscope eyepiece", "双目显微镜目镜", 1_285, 505, 1], ["Microscope eyepiece tube", "显微镜目镜筒", 1_290, 530, 3],
          ["School microscope nosepiece", "学校显微镜转换器", 1_300, 575, 2], ["Microscope objective lens", "显微镜物镜", 1_300, 590, 2],
          ["Microscope specimen stage", "显微镜载物台", 1_305, 620, 0], ["Microscope stage clip", "显微镜载物台夹", 1_305, 620, 3],
          ["School microscope condenser", "学校显微镜聚光器", 1_305, 640, 2], ["Microscope coarse-focus knob", "显微镜粗调旋钮", 1_380, 610, 2],
          ["Microscope fine-focus knob", "显微镜微调旋钮", 1_382, 625, 3], ["Microscope curved arm", "显微镜弯臂", 1_350, 570, 1],
          ["School microscope illuminator", "学校显微镜照明器外壳", 1_310, 660, 2], ["Microscope weighted base", "显微镜加重底座", 1_320, 675, 0],
          ["Microscope power lead", "显微镜电源线", 1_360, 690, 3], ["Laboratory slide box", "实验室载玻片盒", 1_180, 635, 1],
          ["Slide-box lid", "载玻片盒盖", 1_180, 630, 3], ["Prepared microscope slide", "显微镜预制玻片", 1_215, 645, 1],
          ["Microscope bench surface", "显微镜台面", 1_360, 715, 1], ["School microscope bench edge", "学校显微镜台面边缘", 1_360, 730, 3],
          ["Microscope bench leg", "显微镜台腿", 1_480, 815, 2], ["Microscope workstation stool", "显微镜工作凳", 1_250, 820, 0],
          ["Microscope stool seat", "显微镜凳座面", 1_250, 750, 2], ["Microscope test-tube rack", "显微镜台试管架", 1_510, 610, 0],
          ["Microscope rack test tube", "显微镜台试管", 1_520, 570, 2],
        ],
      },
    ],
  },
];

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function slugify(value) { return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function scenePoint(value, axis) { return Number((value * (axis === "x" ? SCALE_X : SCALE_Y)).toFixed(6)); }
function sceneRectangle(value) {
  return { x: scenePoint(value.x, "x"), y: scenePoint(value.y, "y"), width: scenePoint(value.width, "x"), height: scenePoint(value.height, "y") };
}
function buildScene(config) {
  const labels = []; const visualRegions = []; const detailZones = []; let priorityIndex = 0;
  for (const zone of config.zones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `${config.id}-${slugify(word)}`;
      const sourceX = Math.max(0, Math.min(SOURCE_WIDTH - 44, x - 22));
      const sourceY = Math.max(0, Math.min(SOURCE_HEIGHT - 44, y - 22));
      const regionId = `${config.id}-region-${slugify(word)}`;
      labels.push({ id, word, translation, x: scenePoint(x, "x"), y: scenePoint(y, "y"), priority: Number((1 + priorityIndex / 1000).toFixed(6)), minLevel, sourceVisualRegion: regionId, semanticRealmId: "body-daily-life" });
      visualRegions.push({ id: regionId, description: `${word} visible in ${zone.title}`, kind: "object", x: scenePoint(sourceX, "x"), y: scenePoint(sourceY, "y"), width: scenePoint(44, "x"), height: scenePoint(44, "y") });
      labelIds.push(id); priorityIndex += 1;
    }
    detailZones.push({ id: `${config.id}-zone-${zone.id}`, title: zone.title, translation: zone.translation, description: zone.description, ...sceneRectangle(zone), targetScale: zone.targetScale, labelIds });
  }
  return {
    id: config.id, title: config.title, translation: config.translation, subtitle: config.subtitle, asset: config.asset,
    width: SCENE_WIDTH, height: SCENE_HEIGHT, parentId: config.parentId, visualRegions, detailZones,
    anchorAudit: {
      status: "human-verified", policy: "visible-object-or-part-only", reviewedAsset: config.asset, reviewedAssetSha256: config.assetSha256,
      rationale: `The generated source and final JPEG were inspected at native and final pixels. This scene retains ${labels.length} independently pointable objects and visible parts across ${detailZones.length} bounded zones. People, identity, readable text, brands, hidden contents, inferred processes and unsupported states were excluded.`,
      previousLabelCount: labels.length + config.removedExamples.length, retainedLabelCount: labels.length,
      removedLabelCount: config.removedExamples.length, removedExamples: config.removedExamples,
    },
    labels, portals: [],
  };
}

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try { if (Buffer.compare(await readFile(path), next) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, next); return true;
}
async function ensureAsset(config) {
  const source = await readFile(resolve(projectRoot, config.source));
  if (sha256(source) !== config.sourceSha256) throw new Error(`${config.id} source bytes changed; rerun the pixel audit`);
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true }).toBuffer();
  if (sha256(output) !== config.assetSha256) throw new Error(`${config.id} JPEG is not reproducible; got ${sha256(output)}`);
  const path = resolve(projectRoot, `public${config.asset}`);
  try { if (Buffer.compare(await readFile(path), output) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, output); return true;
}
async function assertUniqueWords(builtScenes) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")); const words = new Map(); const duplicates = [];
  for (const entry of manifest.scenes) {
    if (builtScenes.some(({ id }) => id === entry.id)) continue;
    const scene = JSON.parse(await readFile(resolve(sceneRoot, `${entry.id}.json`), "utf8"));
    for (const label of scene.labels) words.set(label.word.toLocaleLowerCase(), entry.id);
  }
  for (const scene of builtScenes) for (const label of scene.labels) {
    const key = label.word.toLocaleLowerCase(); const owner = words.get(key);
    if (owner) duplicates.push(`${scene.id} duplicates ${owner}: ${label.word}`);
    words.set(key, scene.id);
  }
  if (duplicates.length > 0) throw new Error(`display-word collisions:\n${duplicates.join("\n")}`);
}

const integrations = [
  {
    parentId: "school-campus", childId: "school-corridor", title: "School corridor",
    portal: { id: "enter-school-corridor", label: "Enter the school corridor", translation: "进入学校走廊", childSceneId: "school-corridor", sourceVisualRegion: "portal-school-corridor", x: 382, y: 545, width: 668, height: 220, enterScale: 3.15 },
    description: "Complete central locker corridor visible between the lower school rooms",
  },
  {
    parentId: "school-science-preparation-room", childId: "school-science-laboratory", title: "School science laboratory",
    portal: { id: "enter-school-science-laboratory", label: "Enter the science laboratory", translation: "进入学校科学实验室", childSceneId: "school-science-laboratory", sourceVisualRegion: "portal-school-science-laboratory", x: 285, y: 110, width: 155, height: 330, enterScale: 3.2 },
    description: "Complete glazed preparation-room doorway leading into the teaching laboratory",
  },
];
async function integrateScenes() {
  const changes = {};
  for (const item of integrations) {
    const path = resolve(sceneRoot, `${item.parentId}.json`); const parent = JSON.parse(await readFile(path, "utf8"));
    const region = { id: item.portal.sourceVisualRegion, description: item.description, kind: "object", x: item.portal.x, y: item.portal.y, width: item.portal.width, height: item.portal.height };
    const pi = parent.portals.findIndex(({ id }) => id === item.portal.id); if (pi >= 0) parent.portals[pi] = item.portal; else parent.portals.push(item.portal);
    const ri = parent.visualRegions.findIndex(({ id }) => id === region.id); if (ri >= 0) parent.visualRegions[ri] = region; else parent.visualRegions.push(region);
    changes[`${item.parentId}Changed`] = await writeIfChanged(path, parent);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const item of integrations) if (!manifest.scenes.some(({ id }) => id === item.childId)) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === item.parentId);
    if (parentIndex < 0) throw new Error(`${item.parentId} missing from manifest`);
    let insertion = parentIndex + 1; while (insertion < manifest.scenes.length && manifest.scenes[insertion].parentId === item.parentId) insertion += 1;
    manifest.scenes.splice(insertion, 0, { id: item.childId, title: item.title, parentId: item.parentId });
  }
  changes.manifestChanged = await writeIfChanged(manifestPath, manifest); return changes;
}

export async function buildSchoolCorridorAndLaboratoryScenes() {
  const builtScenes = scenes.map(buildScene);
  for (const scene of builtScenes) {
    if (scene.labels.length !== 150) throw new Error(`${scene.id} must contain exactly 150 labels; got ${scene.labels.length}`);
    if (scene.detailZones.length !== 6 || scene.detailZones.some(({ labelIds }) => labelIds.length !== 25)) throw new Error(`${scene.id} must contain six 25-word zones`);
  }
  await assertUniqueWords(builtScenes);
  const result = { scenes: [] };
  for (let index = 0; index < scenes.length; index += 1) result.scenes.push({ id: scenes[index].id, labels: 150, assetChanged: await ensureAsset(scenes[index]), sceneChanged: await writeIfChanged(resolve(sceneRoot, `${scenes[index].id}.json`), builtScenes[index]) });
  if (integrate) Object.assign(result, await integrateScenes());
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildSchoolCorridorAndLaboratoryScenes().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(`add-school-corridor-and-laboratory-scenes: ${error.message}`); process.exitCode = 1; });
}
