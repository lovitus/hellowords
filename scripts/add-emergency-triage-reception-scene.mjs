import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(projectRoot, "scripts/assets/emergency-triage-reception-v1.png");
const assetPath = resolve(projectRoot, "public/scenes/emergency-triage-reception-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/emergency-triage-reception.json");
const emergencyPath = resolve(projectRoot, "public/data/scenes/emergency-department.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "0b58f34f842e8e72b89e4bbb30dfb82ce0ebacabffdc46639d2cddffdb8cded0";
const ASSET_SHA256 = "0b4a4f85f57c172fdac61cfa99be5f762b8953ac366094f71422740572d373b8";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;
const EXPECTED_LABEL_COUNT = 302;
const OVERVIEW_LABELS = new Set([
  "Triage-left registration desk",
  "Centre triage workstation",
  "Triage records wall",
  "Patient check-in station",
  "Triage assessment bay",
  "Accessible waiting area",
  "Triage-room interior",
]);
const FINE_PART_WORDS = new Set([
  "joint", "elbow", "clamp", "clip", "slot", "edge", "corner", "lip", "rim", "seam",
  "hinge", "latch", "caster", "spoke", "hub", "grout", "hem", "pleat", "carrier", "port",
  "cable", "cord", "lead", "connector", "outlet", "threshold", "stitch", "rib", "gasket", "pivot",
]);
const COMPONENT_WORDS = new Set([
  "screen", "display", "bezel", "casing", "case", "support", "arm", "stand", "mount",
  "handle", "cover", "panel", "frame", "base", "leg", "backrest", "headrest", "seat",
  "armrest", "sling", "piping", "wheel", "tyre", "footplate", "footrest", "hanger",
  "worktop", "sill", "mullion", "rail", "leaves", "leaf", "cluster", "stem", "drawer", "shelf", "tray",
  "fascia", "trim", "pull", "key", "bar", "knob", "switch", "button", "pane", "body", "cradle",
  "pump", "foot", "post", "divider", "return", "sheet",
]);
const COMPONENT_PHRASES = new Set([
  "counter side return",
  "cabinet left side",
  "cabinet right side",
]);
const MID_OBJECT_WORDS = new Set([
  "mouse", "scanner", "cup", "pen", "plant", "pot", "sorter", "printer", "container", "tub",
  "tablet", "gel", "camera", "reader", "bottle", "stool", "trolley", "paper", "stack",
]);
const MAJOR_OBJECT_WORDS = new Set([
  "desk", "workstation", "monitor", "keyboard", "wall", "cabinet", "cupboard", "window",
  "terminal", "counter", "device", "picture", "chair", "cart", "table", "door", "light",
  "floor", "curtain", "dispenser", "area", "bay", "station",
  "supply", "folder", "clock", "bin", "wheelchair", "spotlight",
]);

const zones = [
  {
    id: "left-registration-desk",
    title: "Left registration workstation",
    translation: "左侧登记工作台",
    description: "Explore the left check-in monitor, keyboard, scanner, document tray and curved reception counter.",
    x: 0, y: 190, width: 550, height: 370, targetScale: 2.85,
    labels: [
      ["Triage-left registration desk", "分诊左侧登记台", 175, 385],
      ["Triage-left registration monitor", "分诊左侧登记显示器", 240, 300],
      ["Triage-left monitor screen", "分诊左侧显示屏", 242, 300],
      ["Triage-left monitor bezel", "分诊左侧显示器边框", 170, 300],
      ["Triage-left monitor lower bezel", "分诊左侧显示器下边框", 240, 343],
      ["Triage-left monitor casing", "分诊左侧显示器外壳", 307, 302],
      ["Triage-left monitor support arm", "分诊左侧显示器支臂", 285, 330],
      ["Triage-left monitor arm joint", "分诊左侧显示器支臂关节", 284, 312],
      ["Triage-left monitor mount", "分诊左侧显示器固定座", 286, 360],
      ["Triage-left monitor cable", "分诊左侧显示器电缆", 247, 365],
      ["Triage-left computer keyboard", "分诊左侧电脑键盘", 211, 420],
      ["Triage-left keyboard case", "分诊左侧键盘外壳", 211, 426],
      ["Triage-left keyboard key field", "分诊左侧键区", 207, 414],
      ["Triage-left keyboard cable", "分诊左侧键盘线", 225, 438],
      ["Triage-left computer mouse", "分诊左侧电脑鼠标", 301, 420],
      ["Triage-left mouse body", "分诊左侧鼠标外壳", 300, 420],
      ["Triage-left mouse wheel", "分诊左侧鼠标滚轮", 302, 414],
      ["Triage-left document scanner", "分诊左侧文件扫描器", 375, 351],
      ["Triage-left scanner handle", "分诊左侧扫描器手柄", 371, 347],
      ["Triage-left scanner window", "分诊左侧扫描器窗口", 380, 340],
      ["Triage-left scanner cradle", "分诊左侧扫描器底座", 378, 366],
      ["Triage-left pen cup", "分诊左侧笔筒", 350, 382],
      ["Triage-left blue pen", "分诊左侧蓝色笔", 344, 366],
      ["Triage-left red pen", "分诊左侧红色笔", 353, 365],
      ["Triage-left black pen", "分诊左侧黑色笔", 361, 367],
      ["Triage-left document tray", "分诊左侧文件托盘", 408, 399],
      ["Triage-left tray upper lip", "分诊左侧托盘上沿", 405, 387],
      ["Triage-left blank paper stack", "分诊左侧空白纸叠", 415, 394],
      ["Triage-left paper top sheet", "分诊左侧最上层纸张", 418, 389],
      ["Triage-left paper edge", "分诊左侧纸边", 430, 397],
      ["Triage-left acrylic screen", "分诊左侧亚克力隔屏", 126, 290],
      ["Triage-left screen edge", "分诊左侧隔屏边缘", 110, 280],
      ["Triage-left screen support clip", "分诊左侧隔屏固定夹", 151, 296],
      ["Triage-left counter worktop", "分诊左侧柜台台面", 160, 405],
      ["Triage-left counter front edge", "分诊左侧柜台前沿", 180, 423],
      ["Triage-left counter rounded corner", "分诊左侧柜台圆角", 20, 417],
      ["Triage-left counter fascia", "分诊左侧柜台饰面", 180, 470],
      ["Triage-left counter lower seam", "分诊左侧柜台下部接缝", 140, 490],
      ["Triage-left counter base trim", "分诊左侧柜台底边饰条", 120, 510],
      ["Triage-left hand-sanitizer bottle", "分诊左侧洗手液瓶", 45, 380],
      ["Triage-left sanitizer pump", "分诊左侧洗手液泵头", 46, 368],
      ["Triage-left sanitizer neck", "分诊左侧洗手液瓶颈", 45, 374],
      ["Triage-left counter plant leaves", "分诊左侧柜台植物叶片", 15, 356],
      ["Triage-left counter plant pot", "分诊左侧柜台植物花盆", 16, 395],
    ],
  },
  {
    id: "centre-registration-desk",
    title: "Centre registration workstations",
    translation: "中间登记工作台",
    description: "Inspect the paired central monitors, their input devices, desk accessories and counter panels.",
    x: 500, y: 185, width: 515, height: 365, targetScale: 2.9,
    labels: [
      ["Centre triage workstation", "中间分诊工作站", 760, 385],
      ["Centre-left registration monitor", "中间左侧登记显示器", 594, 300],
      ["Centre-left monitor screen", "中间左侧显示屏", 592, 300],
      ["Centre-left monitor bezel", "中间左侧显示器边框", 560, 301],
      ["Centre-left monitor chin", "中间左侧显示器下沿", 592, 340],
      ["Centre-left monitor stand", "中间左侧显示器支架", 592, 357],
      ["Centre-left monitor arm", "中间左侧显示器支臂", 628, 328],
      ["Centre-left arm elbow", "中间左侧支臂肘节", 631, 309],
      ["Centre-left arm clamp", "中间左侧支臂夹座", 633, 365],
      ["Centre-left monitor cable", "中间左侧显示器线缆", 613, 365],
      ["Centre-right registration monitor", "中间右侧登记显示器", 815, 299],
      ["Centre-right monitor screen", "中间右侧显示屏", 814, 299],
      ["Centre-right monitor bezel", "中间右侧显示器边框", 778, 300],
      ["Centre-right monitor lower bezel", "中间右侧显示器下边框", 814, 337],
      ["Centre-right monitor arm", "中间右侧显示器支臂", 847, 331],
      ["Centre-right arm joint", "中间右侧显示器支臂关节", 850, 315],
      ["Centre-right monitor mount", "中间右侧显示器固定座", 851, 363],
      ["Centre-right display cable", "中间右侧显示器线缆", 831, 363],
      ["Centre workstation keyboard", "中间工作站键盘", 690, 420],
      ["Centre keyboard case", "中间键盘外壳", 691, 424],
      ["Centre keyboard key field", "中间键盘键区", 690, 414],
      ["Centre keyboard space bar", "中间键盘空格键", 692, 429],
      ["Centre keyboard cable", "中间键盘线", 702, 434],
      ["Centre workstation mouse", "中间工作站鼠标", 746, 418],
      ["Centre mouse wheel", "中间鼠标滚轮", 747, 414],
      ["Centre mouse cable", "中间鼠标线", 756, 425],
      ["Centre desk card reader", "中间柜台读卡器", 886, 354],
      ["Centre card-reader screen", "中间读卡器屏幕", 886, 346],
      ["Centre card-reader body", "中间读卡器机身", 886, 356],
      ["Centre card slot", "中间读卡槽", 891, 362],
      ["Centre document camera", "中间文件摄像头", 928, 356],
      ["Centre camera head", "中间文件摄像头头部", 929, 348],
      ["Centre camera support", "中间文件摄像头支架", 930, 369],
      ["Centre acrylic privacy panel", "中间亚克力隐私屏", 737, 287],
      ["Centre privacy-panel edge", "中间隐私屏边缘", 757, 286],
      ["Centre counter worktop", "中间柜台台面", 756, 401],
      ["Centre countertop front lip", "中间台面前唇", 755, 425],
      ["Centre curved counter end", "中间弧形柜台端部", 952, 414],
      ["Centre counter end panel", "中间柜台端板", 954, 465],
      ["Centre counter wood fascia", "中间柜台木饰面", 850, 475],
      ["Centre counter lower trim", "中间柜台下沿饰条", 830, 510],
      ["Centre counter side return", "中间柜台侧回边", 967, 443],
      ["Centre desk mat", "中间桌垫", 720, 405],
      ["Centre worktop corner", "中间台面转角", 980, 410],
    ],
  },
  {
    id: "records-and-supply-wall",
    title: "Records and supply wall",
    translation: "病历与物资墙柜",
    description: "Explore the wall cabinets, open file sorter, compact printer, plant, window fittings and stored supplies.",
    x: 0, y: 0, width: 810, height: 430, targetScale: 2.85,
    labels: [
      ["Triage records wall", "分诊病历墙柜", 440, 145],
      ["Upper records cabinet", "上方病历柜", 430, 91],
      ["Records cabinet left door", "病历柜左门", 366, 90],
      ["Records cabinet right door", "病历柜右门", 484, 90],
      ["Records cabinet centre seam", "病历柜中缝", 430, 92],
      ["Records cabinet top rail", "病历柜上横档", 430, 51],
      ["Records cabinet bottom rail", "病历柜下横档", 430, 139],
      ["Records cabinet left pull", "病历柜左拉手", 404, 102],
      ["Records cabinet right pull", "病历柜右拉手", 461, 102],
      ["Records cabinet glass panel", "病历柜玻璃面板", 434, 89],
      ["Open records sorter", "开放式病历分拣架", 339, 274],
      ["Records sorter top slot", "分拣架上层格", 339, 249],
      ["Records sorter middle slot", "分拣架中层格", 339, 271],
      ["Records sorter lower slot", "分拣架下层格", 339, 294],
      ["Records sorter left divider", "分拣架左隔板", 322, 277],
      ["Records sorter right divider", "分拣架右隔板", 358, 277],
      ["Records sorter shelf lip", "分拣架搁板前沿", 339, 299],
      ["Records sorter side panel", "分拣架侧板", 365, 275],
      ["Compact triage printer", "分诊小型打印机", 455, 271],
      ["Printer top cover", "打印机顶盖", 455, 256],
      ["Printer paper outlet", "打印机出纸口", 455, 279],
      ["Triage printer front panel", "分诊打印机前面板", 456, 283],
      ["Printer lower base", "打印机底座", 455, 293],
      ["Printer side wall", "打印机侧面", 475, 276],
      ["Printer cable", "打印机线缆", 468, 301],
      ["Back-counter shelf", "后方柜台搁板", 495, 202],
      ["Back-counter shelf edge", "后方柜台搁板边", 495, 211],
      ["Small supply container", "小型物资盒", 536, 174],
      ["Blue supply tub", "蓝色物资盒", 537, 163],
      ["Supply tub rim", "物资盒口沿", 537, 157],
      ["Supply cupboard bay", "物资柜格", 529, 111],
      ["Cupboard side frame", "物资柜侧框", 549, 111],
      ["Triage-side window", "分诊侧窗", 112, 179],
      ["Window glass pane", "窗玻璃", 104, 172],
      ["Window vertical mullion", "窗竖框", 118, 174],
      ["Window horizontal rail", "窗横档", 127, 144],
      ["Window-side plant", "窗边盆栽", 14, 374],
      ["Window plant leaf cluster", "窗边植物叶簇", 15, 346],
      ["Window plant stem", "窗边植物茎", 16, 365],
      ["Window plant pot rim", "窗边花盆口沿", 16, 393],
      ["Window plant pot body", "窗边花盆盆身", 17, 402],
      ["Back-wall paint band", "后墙涂层分界", 598, 205],
      ["Back-wall corner trim", "后墙墙角饰条", 569, 206],
    ],
  },
  {
    id: "self-checkin-station",
    title: "Patient check-in station",
    translation: "患者自助登记台",
    description: "Inspect the separate check-in tablet, document reader, counter surface and nearby privacy fixtures.",
    x: 920, y: 145, width: 300, height: 330, targetScale: 3.0,
    labels: [
      ["Patient check-in station", "患者自助登记台", 1_035, 302],
      ["Check-in touch display", "自助登记触控屏", 1_012, 280],
      ["Check-in display glass", "登记屏玻璃面", 1_012, 281],
      ["Check-in display bezel", "登记屏边框", 991, 280],
      ["Check-in display top edge", "登记屏上沿", 1_012, 264],
      ["Check-in display lower edge", "登记屏下沿", 1_012, 299],
      ["Check-in display side frame", "登记屏侧框", 1_026, 281],
      ["Check-in tablet rear case", "登记平板背壳", 1_036, 280],
      ["Check-in tablet pivot", "登记平板转轴", 1_027, 313],
      ["Check-in tablet support", "登记平板支架", 1_019, 322],
      ["Check-in tablet foot", "登记平板底脚", 1_016, 331],
      ["Check-in tablet cable", "登记平板线缆", 1_039, 328],
      ["Check-in countertop terminal", "登记台终端设备", 1_078, 292],
      ["Countertop-terminal housing", "登记台终端外壳", 1_080, 294],
      ["Countertop-terminal top surface", "登记台终端顶面", 1_079, 288],
      ["Countertop-terminal front panel", "登记台终端前面板", 1_079, 290],
      ["Countertop-terminal lower edge", "登记台终端下沿", 1_080, 301],
      ["Countertop-terminal support", "登记台终端支撑座", 1_082, 307],
      ["Triage check-in counter", "分诊登记柜台", 1_046, 358],
      ["Check-in counter worktop", "自助登记台面", 1_045, 332],
      ["Check-in counter front panel", "自助登记柜台前板", 1_048, 379],
      ["Check-in counter side panel", "自助登记柜台侧板", 1_106, 367],
      ["Check-in counter base", "自助登记柜台底座", 1_062, 399],
      ["Check-in counter corner", "自助登记柜台转角", 1_122, 339],
      ["Check-in counter cable port", "自助登记柜台理线孔", 1_093, 336],
      ["Check-in side device", "登记台侧边设备", 1_051, 308],
      ["Side-device top surface", "侧边设备顶面", 1_052, 300],
      ["Side-device front panel", "侧边设备前面板", 1_053, 311],
      ["Side-device casing", "侧边设备外壳", 1_061, 309],
      ["Side-device support foot", "侧边设备支脚", 1_066, 320],
      ["Counter privacy screen", "柜台隐私隔屏", 974, 230],
      ["Privacy-screen clear panel", "隐私隔屏透明板", 973, 231],
      ["Privacy-screen upright", "隐私隔屏立柱", 981, 238],
      ["Privacy-screen base clip", "隐私隔屏底部夹", 983, 258],
      ["Check-in station hand gel", "登记台免洗洗手液", 1_104, 322],
      ["Hand-gel bottle body", "免洗洗手液瓶身", 1_104, 323],
      ["Hand-gel pump head", "免洗洗手液泵头", 1_104, 314],
      ["Check-in counter floor gap", "登记台下方地面空隙", 1_130, 414],
      ["Check-in counter front edge", "登记台前沿", 1_040, 338],
      ["Check-in counter end cap", "登记台端盖", 1_133, 357],
      ["Check-in station side return", "登记台侧回边", 1_126, 379],
      ["Triage-wall landscape picture", "分诊墙面风景画", 997, 205],
      ["Landscape picture frame", "风景画画框", 997, 198],
    ],
  },
  {
    id: "triage-assessment-bay",
    title: "Triage assessment bay",
    translation: "分诊评估位",
    description: "Explore the patient chair, mobile observations monitor, vital-sign cart, wall connections and curtain rail.",
    x: 1_110, y: 125, width: 455, height: 430, targetScale: 2.95,
    labels: [
      ["Triage assessment bay", "分诊评估位", 1_330, 352],
      ["Triage patient chair", "分诊患者椅", 1_322, 326],
      ["Assessment-chair backrest", "评估椅靠背", 1_324, 277],
      ["Assessment-chair headrest", "评估椅头枕", 1_323, 248],
      ["Assessment-chair seat", "评估椅座面", 1_325, 350],
      ["Assessment-chair armrest", "评估椅扶手", 1_300, 343],
      ["Assessment-chair side frame", "评估椅侧架", 1_292, 372],
      ["Assessment-chair front leg", "评估椅前腿", 1_294, 393],
      ["Assessment-chair rear leg", "评估椅后腿", 1_351, 393],
      ["Assessment-chair foot cap", "评估椅脚套", 1_293, 399],
      ["Triage observations monitor", "分诊生命体征监视器", 1_204, 270],
      ["Observations monitor screen", "生命体征显示屏", 1_203, 267],
      ["Observations monitor bezel", "生命体征显示器边框", 1_203, 270],
      ["Observations monitor side keys", "生命体征显示器侧键", 1_217, 270],
      ["Observations monitor handle", "生命体征显示器提手", 1_204, 247],
      ["Observations monitor mounting plate", "生命体征显示器固定板", 1_204, 300],
      ["Mobile monitor post", "移动监视器立杆", 1_203, 340],
      ["Mobile monitor post clamp", "移动监视器立杆夹", 1_203, 327],
      ["Mobile monitor cable", "移动监视器线缆", 1_189, 322],
      ["Triage equipment cart", "分诊设备推车", 1_207, 378],
      ["Triage cart top tray", "分诊推车上层托盘", 1_208, 334],
      ["Triage cart handle", "分诊推车把手", 1_178, 346],
      ["Triage cart drawer", "分诊推车抽屉", 1_205, 369],
      ["Triage cart lower shelf", "分诊推车下层架", 1_207, 394],
      ["Triage cart front caster", "分诊推车前脚轮", 1_190, 410],
      ["Triage cart rear caster", "分诊推车后脚轮", 1_221, 410],
      ["Right-bay wall equipment unit", "右侧诊疗位墙面设备", 1_437, 273],
      ["Right-bay equipment display", "右侧诊疗位设备显示屏", 1_436, 268],
      ["Right-bay equipment bezel", "右侧诊疗位设备边框", 1_439, 281],
      ["Right-bay hanging cord", "右侧诊疗位悬挂线缆", 1_456, 311],
      ["Right-bay cord loop", "右侧诊疗位线缆环", 1_456, 313],
      ["Right-bay device lead", "右侧诊疗位设备引线", 1_448, 324],
      ["Right-bay wall connector", "右侧诊疗位墙面接头", 1_413, 259],
      ["Right-bay connector face", "右侧诊疗位接头面板", 1_412, 261],
      ["Right-bay panel cover", "右侧诊疗位面板盖", 1_468, 260],
      ["Triage wall diagnostic panel", "分诊墙面诊断面板", 1_326, 196],
      ["Wall utility outlet", "墙面设备接口", 1_319, 203],
      ["Wall-panel connector", "墙面板连接口", 1_344, 203],
      ["Diagnostic panel cover", "诊断面板盖", 1_354, 191],
      ["Triage privacy curtain", "分诊隐私帘", 1_142, 240],
      ["Privacy-curtain track", "隐私帘轨道", 1_150, 161],
      ["Privacy-curtain pleat", "隐私帘褶", 1_142, 321],
      ["Privacy-curtain carrier", "隐私帘滑轮", 1_155, 161],
      ["Clinical wall dispenser", "临床墙面分配器", 1_503, 320],
      ["Wall dispenser cover", "墙面分配器盖", 1_503, 315],
    ],
  },
  {
    id: "accessible-waiting-area",
    title: "Accessible waiting area",
    translation: "无障碍候诊区",
    description: "Identify the wheelchair, waiting chair, bin, plant, side table and the distinct frame and seating parts.",
    x: 1_250, y: 420, width: 422, height: 521, targetScale: 2.9,
    labels: [
      ["Accessible waiting area", "无障碍候诊区", 1_490, 653],
      ["Triage-reception wheelchair", "分诊接待区轮椅", 1_516, 620],
      ["Wheelchair push handles", "轮椅推手", 1_500, 500],
      ["Triage wheelchair backrest", "分诊轮椅靠背", 1_509, 553],
      ["Wheelchair seat sling", "轮椅座面", 1_512, 608],
      ["Wheelchair armrest left", "轮椅左扶手", 1_485, 571],
      ["Wheelchair armrest right", "轮椅右扶手", 1_543, 572],
      ["Wheelchair side frame", "轮椅侧架", 1_508, 646],
      ["Wheelchair cross brace", "轮椅交叉撑杆", 1_514, 664],
      ["Wheelchair large wheel", "轮椅大车轮", 1_510, 611],
      ["Wheelchair tyre", "轮椅轮胎", 1_495, 625],
      ["Wheelchair hand rim", "轮椅手推圈", 1_525, 611],
      ["Wheelchair wheel hub", "轮椅轮毂", 1_514, 611],
      ["Wheelchair wheel spoke", "轮椅轮辐", 1_510, 593],
      ["Wheelchair front caster", "轮椅前脚轮", 1_486, 683],
      ["Wheelchair footplate", "轮椅脚踏板", 1_478, 648],
      ["Wheelchair footrest hanger", "轮椅脚踏连接架", 1_477, 635],
      ["Wheelchair brake lever", "轮椅刹车杆", 1_488, 615],
      ["Wheelchair frame joint", "轮椅车架接头", 1_489, 642],
      ["Wheelchair upholstery seam", "轮椅布面接缝", 1_510, 588],
      ["Foreground waiting chair", "前景候诊椅", 1_421, 778],
      ["Waiting-chair back cushion", "候诊椅靠背垫", 1_427, 731],
      ["Waiting-chair seat cushion", "候诊椅座垫", 1_430, 828],
      ["Waiting-chair left armrest", "候诊椅左扶手", 1_368, 792],
      ["Waiting-chair right armrest", "候诊椅右扶手", 1_486, 789],
      ["Waiting-chair steel frame", "候诊椅钢架", 1_426, 871],
      ["Waiting-chair front leg", "候诊椅前腿", 1_382, 903],
      ["Waiting-chair rear leg", "候诊椅后腿", 1_484, 898],
      ["Waiting-chair seat piping", "候诊椅座面滚边", 1_433, 824],
      ["Right-side visitor chair", "右侧访客椅", 1_620, 611],
      ["Visitor-chair back", "访客椅椅背", 1_627, 567],
      ["Visitor-chair seat", "访客椅座面", 1_624, 644],
      ["Visitor-chair arm", "访客椅扶手", 1_599, 634],
      ["Visitor-chair tubular frame", "访客椅管状椅架", 1_624, 695],
      ["Waiting-room side table", "候诊区边桌", 1_616, 879],
      ["Side-table round top", "边桌圆形桌面", 1_614, 860],
      ["Side-table pedestal", "边桌支柱", 1_616, 891],
      ["Side-table foot", "边桌底脚", 1_616, 903],
      ["Waiting-area plant", "候诊区植物", 1_649, 820],
      ["Waiting-area plant leaves", "候诊区植物叶片", 1_651, 783],
      ["Waiting-area plant stem", "候诊区植物茎", 1_650, 817],
      ["Waiting-area plant pot", "候诊区植物花盆", 1_648, 887],
      ["Waiting-area pot rim", "候诊区花盆口沿", 1_649, 872],
      ["Waiting-area tiled floor", "候诊区地砖", 1_420, 533],
    ],
  },
  {
    id: "room-access-and-lighting",
    title: "Room access and lighting",
    translation: "房间入口与照明",
    description: "Inspect the intake-room door, windows, ceiling lights, cabinet fronts, wall trim and circulation floor.",
    x: 0, y: 0, width: 1_672, height: 430, targetScale: 2.8,
    labels: [
      ["Triage-room interior", "分诊室内空间", 812, 408],
      ["Right intake-room door", "右侧分诊室门", 1_621, 255],
      ["Right door leaf", "右侧门扇", 1_618, 240],
      ["Right door wood panel", "右侧门木面板", 1_617, 242],
      ["Right door glazing", "右侧门玻璃窗", 1_619, 203],
      ["Right door glass frame", "右侧门玻璃窗框", 1_618, 202],
      ["Triage-room door handle", "分诊室门把手", 1_595, 310],
      ["Triage-room door frame", "分诊室门框", 1_572, 212],
      ["Door head jamb", "门上框", 1_617, 83],
      ["Door-side wall bumper", "门旁墙面防撞条", 1_553, 339],
      ["Back-window group", "后方窗组", 840, 158],
      ["Back-window left pane", "后窗左窗格", 802, 156],
      ["Back-window centre pane", "后窗中间窗格", 841, 153],
      ["Back-window right pane", "后窗右窗格", 877, 156],
      ["Back-window vertical mullion", "后窗竖框", 840, 153],
      ["Back-window sill", "后窗窗台", 840, 209],
      ["Reception-side privacy curtain", "接待区旁隐私帘", 1_120, 265],
      ["Privacy-curtain fabric fold", "隐私帘布褶", 1_110, 215],
      ["Privacy-curtain lower hem", "隐私帘下摆", 1_110, 398],
      ["Ceiling light above desk", "柜台上方顶灯", 686, 28],
      ["Ceiling light at check-in", "登记台顶灯", 958, 25],
      ["Ceiling light over waiting", "候诊区上方顶灯", 1_304, 26],
      ["Triage-room ceiling panel seam", "分诊室天花板板缝", 1_232, 51],
      ["Ceiling recessed spotlight", "嵌入式顶灯", 909, 34],
      ["Rear cabinet upper edge", "后柜顶边", 428, 48],
      ["Rear cabinet left side", "后柜左侧板", 324, 156],
      ["Rear cabinet right side", "后柜右侧板", 528, 152],
      ["Rear cabinet lower shelf", "后柜下层搁板", 423, 154],
      ["Rear cabinet drawer front", "后柜抽屉前板", 438, 184],
      ["Rear cabinet drawer pull", "后柜抽屉拉手", 451, 183],
      ["Rear cabinet toe kick", "后柜踢脚板", 428, 217],
      ["Wall corner at window", "窗边墙角", 278, 157],
      ["Wall horizontal colour band", "墙面横向色带", 260, 209],
      ["Wall-base protection strip", "墙脚防护条", 327, 230],
      ["Open circulation floor", "开放通行地面", 1_134, 411],
      ["Floor tile field", "地砖面", 1_293, 398],
      ["Triage-room floor tile joint", "分诊室地砖接缝", 1_310, 402],
      ["Door threshold strip", "门槛条", 1_585, 430],
      ["Reception counter aisle", "接待柜台通道", 1_107, 420],
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

function slugify(value) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function minLevel(word) {
  if (OVERVIEW_LABELS.has(word)) return 0;
  const normalized = word.toLocaleLowerCase("en-US");
  const tokens = new Set(normalized.split(/[^a-z]+/u).filter(Boolean));
  if ([...tokens].some((token) => FINE_PART_WORDS.has(token))) return 4;
  if ([...COMPONENT_PHRASES].some((phrase) => normalized.includes(phrase))) return 3;
  if ([...tokens].some((token) => COMPONENT_WORDS.has(token))) return 3;
  if ([...tokens].some((token) => MID_OBJECT_WORDS.has(token))) return 2;
  if ([...tokens].some((token) => MAJOR_OBJECT_WORDS.has(token))) return 1;
  return 2;
}

function visualRegion(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `emergency-triage-reception-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” in the ${zoneTitle} crop of the emergency triage reception photograph`,
    kind: "part",
    ...sceneRectangle({ x: left, y: top, width: size, height: size }),
  };
}

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    zone.labels.forEach(([word, translation, x, y]) => {
      const id = `emergency-triage-reception-${slugify(word)}`;
      const region = visualRegion(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priority / 1_000).toFixed(6)),
        minLevel: minLevel(word),
        sourceVisualRegion: region.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priority += 1;
    });
    detailZones.push({
      id: `emergency-triage-reception-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  const uniqueWords = new Set(labels.map(({ word }) => word.toLocaleLowerCase("en-US")));
  const uniqueIds = new Set(labels.map(({ id }) => id));
  if (labels.length !== EXPECTED_LABEL_COUNT || uniqueWords.size !== labels.length || uniqueIds.size !== labels.length) {
    throw new Error(`Expected ${EXPECTED_LABEL_COUNT} unique labels and IDs, got ${labels.length}/${uniqueWords.size}/${uniqueIds.size}`);
  }
  const assessmentPortal = {
    id: "enter-emergency-assessment-bay",
    label: "Explore the curtained assessment bay",
    translation: "探索帘幕分诊评估区",
    childSceneId: "emergency-assessment-bay",
    sourceVisualRegion: "portal-emergency-assessment-bay",
    x: 1_150,
    y: 120,
    width: 65,
    height: 65,
    enterScale: 3.25,
  };
  const portalRegion = {
    id: assessmentPortal.sourceVisualRegion,
    description: "The open, curtained entrance to the visible triage assessment bed and wall equipment",
    kind: "object",
    x: assessmentPortal.x,
    y: assessmentPortal.y,
    width: assessmentPortal.width,
    height: assessmentPortal.height,
  };
  const intersects = (first, second) => (
    first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
  );
  if (labels.some(({ x, y }) => (
    x >= assessmentPortal.x && x <= assessmentPortal.x + assessmentPortal.width
    && y >= assessmentPortal.y && y <= assessmentPortal.y + assessmentPortal.height
  ))) {
    throw new Error("Emergency assessment portal would cover an existing triage anchor");
  }
  if (visualRegions.some((region) => intersects(region, assessmentPortal))) {
    throw new Error("Emergency assessment portal would cover an existing triage anchor region");
  }
  visualRegions.push(portalRegion);
  return {
    id: "emergency-triage-reception",
    title: "Emergency triage reception",
    translation: "急诊分诊接待区",
    subtitle: "Patient check-in, triage questions, vital-sign equipment and accessible waiting",
    asset: "/scenes/emergency-triage-reception-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "emergency-department",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/emergency-triage-reception-premium-v1.jpg",
      reviewedAssetSha256: ASSET_SHA256 ?? "pending-asset-sha256",
      rationale: "The generated triage-reception photograph was inspected at its original and final pixels. Seven bounded zones cover the registration desks, records wall, self-check-in station, assessment bay, accessible waiting area and room hardware. Zone counts vary with distinct visible objects, while zoom bands follow overview, whole object, component and fine-part granularity. Only independently visible equipment, furniture, surfaces and clearly identifiable parts are retained.",
      previousLabelCount: 327,
      retainedLabelCount: labels.length,
      removedLabelCount: 327 - labels.length,
      removedExamples: [
        "patient identity",
        "appointment status",
        "diagnosis",
        "waiting time",
        "medication list",
        "insurance coverage",
        "triage outcome",
        "device reading",
        "registration result",
        "staff action",
        "spoken instruction",
        "brand name",
        "check-in station wall backdrop",
        "check-in station wall trim",
        "Triage records cupboard shelf",
        "Waiting-area floor grout",
        "Right door latch plate",
        "Triage-room door hinge",
        "Triage room window sill",
      ],
    },
    labels,
    portals: [assessmentPortal],
  };
}

async function assertUniqueSceneWords(scene) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Set();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const existing = JSON.parse(await readFile(resolve(projectRoot, `public/data/scenes/${entry.id}.json`), "utf8"));
    for (const label of existing.labels) existingWords.add(label.word.toLocaleLowerCase("en-US"));
  }
  for (const label of scene.labels) {
    const word = label.word.toLocaleLowerCase("en-US");
    if (existingWords.has(word)) throw new Error(`Scene word duplicates ${label.word} from another scene`);
  }
}

async function writeIfChanged(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, bytes) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path, bytes);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourcePath);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("Source image bytes changed; repeat visual review first");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (ASSET_SHA256 && sha256(output) !== ASSET_SHA256) throw new Error(`JPEG is not reproducible; got ${sha256(output)}`);
  await writeFile(assetPath, output);
  return sha256(output);
}

async function updateEmergencyParent() {
  const parent = JSON.parse(await readFile(emergencyPath, "utf8"));
  const portal = {
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
  };
  const coveredAnchors = parent.labels.filter(({ x, y }) => (
    x >= portal.x && x <= portal.x + portal.width && y >= portal.y && y <= portal.y + portal.height
  ));
  if (coveredAnchors.length) throw new Error(`Portal would cover parent anchors: ${coveredAnchors.map(({ word }) => word).join(", ")}`);
  const region = {
    id: portal.sourceVisualRegion,
    description: "The clear, lower front face of the visible emergency triage registration counter",
    kind: "object",
    x: portal.x,
    y: portal.y,
    width: portal.width,
    height: portal.height,
  };
  const portalIndex = parent.portals.findIndex(({ id }) => id === portal.id);
  if (portalIndex < 0) parent.portals.push(portal);
  else parent.portals[portalIndex] = portal;
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === region.id);
  if (regionIndex < 0) parent.visualRegions.push(region);
  else parent.visualRegions[regionIndex] = region;
  return writeIfChanged(emergencyPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "emergency-triage-reception");
  const expected = { id: "emergency-triage-reception", title: "Emergency triage reception", parentId: "emergency-department" };
  if (existing && JSON.stringify(existing) !== JSON.stringify(expected)) {
    throw new Error("Emergency triage reception already exists with a different manifest record");
  }
  if (!existing) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === expected.parentId);
    if (parentIndex < 0) throw new Error("emergency-department is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, expected);
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildEmergencyTriageReceptionScene() {
  const assetSha256 = await ensureAsset();
  const scene = buildScene();
  await assertUniqueSceneWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const result = { id: scene.id, labels: scene.labels.length, zones: scene.detailZones.length, assetSha256, sceneChanged };
  if (integrate) {
    result.parentChanged = await updateEmergencyParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildEmergencyTriageReceptionScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-emergency-triage-reception-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
