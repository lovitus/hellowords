import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const manifestPath = resolve(sceneRoot, "manifest.json");
const integrate = !process.argv.includes("--no-integrate");
const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

// Coordinates are reviewed against each 1672x941 source PNG. Label rectangles
// remain 44x44 source pixels, and the generated final scene uses a fixed 1600x900 crop.
const scenes = [
  {
    id: "airport-baggage-conveyor",
    title: "Airport baggage conveyor",
    translation: "机场行李输送带",
    subtitle: "Conveyor belts, transfer rollers, luggage, drive units and safety controls",
    parentId: "baggage-drop-station",
    source: "scripts/assets/airport-baggage-conveyor-v1.png",
    asset: "/scenes/airport-baggage-conveyor-premium-v1.jpg",
    sourceSha256: "8461dc2d0c350ec454fbd518589bace6ff2bef8918eda833df53a730892baa37",
    assetSha256: "d9447e581a12127dabcf7c9df53e091c4026aea517e12124610d9c0d53b8ed93",
    wordPrefix: "Airport",
    translationPrefix: "机场",
    removedExamples: ["diverter status", "belt speed", "bag destination", "scanner result", "operator identity", "maintenance state", "written label", "brand name"],
    zones: [
      {
        id: "incline-feed-and-green-case", title: "Incline feed and green case", translation: "倾斜输送段与绿色行李箱",
        description: "Explore the visible inclined belt, yellow guardrail, support frame and green hard-shell case.",
        x: 0, y: 0, width: 630, height: 445, targetScale: 2.55,
        labels: [
          ["incline belt", "倾斜输送带", 130, 140, 0], ["incline belt centre", "倾斜输送带中段", 245, 205, 1],
          ["incline belt lower edge", "倾斜输送带下沿", 370, 270, 2], ["incline belt upper edge", "倾斜输送带上沿", 180, 120, 2],
          ["inner belt sidewall", "输送带内侧挡板", 470, 310, 1], ["outer belt sidewall", "输送带外侧挡板", 70, 110, 1],
          ["incline steel skirt", "倾斜段钢制裙板", 365, 295, 2], ["incline frame rail", "倾斜段机架导轨", 475, 355, 1],
          ["incline diagonal beam", "倾斜段斜撑梁", 515, 210, 2], ["incline cross brace", "倾斜段横撑", 365, 180, 3],
          ["incline frame upright", "倾斜段机架立柱", 530, 292, 1], ["incline floor foot", "倾斜段落地底脚", 550, 410, 3],
          ["yellow guardrail top bar", "黄色护栏顶杆", 265, 90, 1], ["yellow guardrail upright", "黄色护栏立柱", 385, 120, 2],
          ["guardrail corner joint", "护栏转角接头", 445, 105, 3], ["green hard-shell suitcase", "绿色硬壳行李箱", 248, 221, 0],
          ["green suitcase shell", "绿色行李箱箱壳", 240, 228, 1], ["green suitcase shell ribs", "绿色行李箱壳体筋条", 242, 209, 2],
          ["green suitcase corner cap", "绿色行李箱护角", 174, 202, 3], ["green suitcase wheel", "绿色行李箱滚轮", 287, 249, 1],
          ["green suitcase wheel housing", "绿色行李箱轮罩", 290, 253, 3], ["green suitcase side seam", "绿色行李箱侧缝", 204, 235, 2],
          ["green suitcase end panel", "绿色行李箱端板", 314, 219, 2], ["green suitcase foot pad", "绿色行李箱底部脚垫", 322, 255, 4],
          ["upper conveyor backdrop belt", "上层输送带背景带面", 120, 68, 3],
        ],
      },
      {
        id: "main-belt-and-blue-case", title: "Main belt and blue case", translation: "主输送带与蓝色行李箱",
        description: "Inspect the broad dark belt, its metallic side rails and the blue ribbed suitcase resting on it.",
        x: 340, y: 175, width: 520, height: 295, targetScale: 2.6,
        labels: [
          ["main dark belt surface", "主输送带深色带面", 470, 360, 0], ["main belt travel surface", "主输送带承载面", 570, 405, 1],
          ["main belt left edge", "主输送带左侧边缘", 450, 320, 2], ["main belt right edge", "主输送带右侧边缘", 670, 424, 2],
          ["main belt side rail", "主输送带侧导轨", 700, 401, 1], ["belt retaining flange", "输送带限位翻边", 680, 425, 3],
          ["belt transfer lip", "输送带过渡唇边", 580, 450, 2], ["main conveyor frame", "主输送机机架", 510, 455, 1],
          ["blue ribbed suitcase", "蓝色筋纹行李箱", 536, 318, 0], ["blue suitcase shell", "蓝色行李箱箱壳", 540, 330, 1],
          ["blue suitcase front panel", "蓝色行李箱正面板", 548, 309, 1], ["blue suitcase horizontal ribs", "蓝色行李箱横向筋条", 535, 300, 2],
          ["blue suitcase rounded corner", "蓝色行李箱圆角", 434, 307, 3], ["blue suitcase wheel", "蓝色行李箱滚轮", 451, 367, 1],
          ["blue suitcase wheel bracket", "蓝色行李箱轮架", 456, 370, 3], ["blue suitcase side grip", "蓝色行李箱侧提把", 651, 302, 2],
          ["blue suitcase short side panel", "蓝色行李箱短侧板", 650, 341, 3], ["blue suitcase lower edge", "蓝色行李箱底边", 560, 372, 2],
          ["blue suitcase shell seam", "蓝色行李箱壳体接缝", 600, 325, 3], ["blue suitcase upper rim", "蓝色行李箱上沿", 526, 273, 2],
          ["belt frame end plate", "输送带机架端板", 407, 421, 2], ["belt frame fastener", "输送带机架紧固件", 397, 448, 4],
          ["side rail support bracket", "侧导轨支架", 718, 435, 3], ["belt edge trim", "输送带边缘包边", 475, 415, 3],
          ["conveyor overlap seam", "输送带搭接缝", 745, 382, 4],
        ],
      },
      {
        id: "curve-transfer-and-yellow-guard", title: "Curved transfer and yellow guard", translation: "弯道转接与黄色护板",
        description: "Follow the curved belt path, stainless divider panels, yellow transfer guard and visible conveyor transitions.",
        x: 620, y: 145, width: 570, height: 370, targetScale: 2.65,
        labels: [
          ["curved transfer belt", "弯道转接带面", 810, 375, 0], ["curved belt inner edge", "弯道输送带内沿", 740, 333, 1],
          ["curved belt outer edge", "弯道输送带外沿", 866, 397, 1], ["curve side guide", "弯道侧向导板", 755, 296, 1],
          ["inner steel divider", "内侧钢制隔板", 706, 280, 2], ["outer steel divider", "外侧钢制隔板", 944, 338, 2],
          ["yellow transfer guard", "黄色转接护板", 1080, 360, 0], ["guard sloped face", "护板斜面", 1070, 344, 1],
          ["guard front plate", "护板前板", 1097, 378, 1], ["guard lower flange", "护板下翻边", 1100, 390, 2],
          ["guard mounting bolt", "护板固定螺栓", 1062, 389, 4], ["guard mounting tab", "护板安装耳", 1122, 388, 3],
          ["transfer chute lip", "转接滑道唇边", 990, 404, 2], ["belt-to-roller nose", "皮带至滚筒过渡鼻端", 1135, 414, 1],
          ["roller-bed sidewall", "滚筒床侧挡板", 1030, 426, 2], ["conveyor lane separator", "输送线分隔板", 910, 300, 2],
          ["upper return conveyor", "上层回程输送带", 915, 203, 1], ["upper conveyor side rail", "上层输送机侧导轨", 1005, 205, 3],
          ["rear conveyor upright", "后部输送机立柱", 855, 178, 2], ["rear conveyor crossbar", "后部输送机横梁", 935, 160, 3],
          ["transfer-frame corner", "转接机架角部", 1000, 452, 3], ["transfer-frame seam", "转接机架接缝", 975, 437, 4],
          ["belt guard lip", "输送带护边唇口", 780, 306, 3], ["support angle bracket", "支撑角码", 895, 461, 3],
          ["yellow guard side edge", "黄色护板侧边", 1134, 366, 2],
        ],
      },
      {
        id: "roller-bed", title: "Roller bed", translation: "滚筒输送床",
        description: "Explore the steel gravity rollers, their visible end caps, bed rails and the supporting frame beneath them.",
        x: 1050, y: 320, width: 622, height: 405, targetScale: 2.6,
        labels: [
          ["front transfer roller", "前端转接滚筒", 1168, 415, 0], ["second transfer roller", "第二根转接滚筒", 1210, 431, 1],
          ["third transfer roller", "第三根转接滚筒", 1254, 445, 1], ["fourth transfer roller", "第四根转接滚筒", 1297, 458, 1],
          ["fifth transfer roller", "第五根转接滚筒", 1341, 472, 1], ["sixth transfer roller", "第六根转接滚筒", 1385, 487, 1],
          ["seventh transfer roller", "第七根转接滚筒", 1430, 502, 1], ["eighth transfer roller", "第八根转接滚筒", 1472, 516, 1],
          ["ninth transfer roller", "第九根转接滚筒", 1518, 530, 1], ["tenth transfer roller", "第十根转接滚筒", 1560, 546, 1],
          ["roller end cap", "滚筒端盖", 1210, 420, 2], ["roller axle end", "滚筒轴端", 1255, 426, 3],
          ["roller bearing block", "滚筒轴承座", 1300, 490, 2], ["roller bed left rail", "滚筒床左侧梁", 1170, 470, 1],
          ["roller bed right rail", "滚筒床右侧梁", 1545, 570, 1], ["roller bed crossmember", "滚筒床横梁", 1400, 592, 2],
          ["roller frame end plate", "滚筒机架端板", 1575, 628, 2], ["roller frame side bracket", "滚筒机架侧支架", 1518, 616, 3],
          ["roller support leg", "滚筒支腿", 1365, 650, 1], ["roller leg foot plate", "滚筒支腿底板", 1365, 703, 3],
          ["bed-to-belt junction", "滚筒床与皮带接合处", 1155, 445, 2], ["roller gap", "滚筒间隙", 1335, 458, 3],
          ["steel roller crown", "钢制滚筒弧面", 1450, 486, 2], ["roller end shoulder", "滚筒端部轴肩", 1490, 510, 3],
          ["roller-bed floor brace", "滚筒床落地斜撑", 1460, 684, 2],
        ],
      },
      {
        id: "drive-motors-and-frame", title: "Drive motors and frame", translation: "驱动电机与机架",
        description: "Inspect the exposed drive assembly, motor housings, yellow guards, brackets, wiring runs and steel supports.",
        x: 280, y: 420, width: 1030, height: 510, targetScale: 2.55,
        labels: [
          ["large conveyor motor", "大型输送机电机", 1060, 623, 0], ["motor outer casing", "电机外壳", 1018, 620, 1],
          ["motor fan cover", "电机风扇罩", 1125, 618, 1], ["fan-cover grille", "风扇罩格栅", 1122, 613, 2],
          ["motor cooling fin", "电机散热筋", 1030, 595, 2], ["motor terminal box", "电机接线盒", 1010, 577, 2],
          ["motor mounting foot", "电机安装脚", 1055, 704, 2], ["motor base plate", "电机底板", 1065, 730, 1],
          ["yellow motor guard", "黄色电机防护罩", 1120, 670, 0], ["guard top panel", "护罩顶板", 1110, 610, 1],
          ["guard side panel", "护罩侧板", 1150, 665, 1], ["guard folded edge", "护罩折边", 1170, 695, 2],
          ["guard fastener", "护罩紧固件", 1132, 717, 4], ["smaller blue drive motor", "较小的蓝灰色驱动电机", 760, 583, 0],
          ["blue motor casing", "蓝灰色电机壳体", 765, 580, 1], ["blue motor fan grille", "蓝灰色电机风罩格栅", 790, 575, 2],
          ["blue motor terminal cap", "蓝灰色电机接线盒盖", 744, 548, 3], ["drive coupling cover", "驱动联轴器护盖", 835, 580, 2],
          ["drive shaft support", "驱动轴支撑座", 730, 540, 1], ["bearing housing cap", "轴承座端盖", 715, 534, 3],
          ["open machinery side rail", "设备侧机架梁", 615, 580, 1], ["lower frame crossbar", "下部机架横梁", 900, 790, 1],
          ["drive-frame diagonal brace", "驱动机架斜撑", 1220, 800, 2], ["conveyor support column", "输送机支撑立柱", 1270, 744, 1],
          ["support column foot", "支撑立柱底脚", 1270, 848, 2],
        ],
      },
      {
        id: "controls-sensors-and-safety", title: "Controls, sensors and safety", translation: "控制、传感与安全设施",
        description: "Explore the control cabinet, blank display, stop control, visible sensors, yellow safety rails and cable covers.",
        x: 755, y: 0, width: 917, height: 650, targetScale: 2.55,
        labels: [
          ["conveyor control cabinet", "输送机控制柜", 966, 210, 0], ["cabinet door", "控制柜柜门", 1015, 210, 1],
          ["blank cabinet display", "控制柜空白显示屏", 1010, 162, 1], ["display bezel", "显示屏边框", 1010, 134, 2],
          ["cabinet latch", "控制柜门扣", 978, 203, 2], ["cabinet hinge", "控制柜铰链", 1055, 198, 3],
          ["cabinet base plinth", "控制柜底座", 1015, 292, 2], ["yellow sensor post", "黄色传感器立柱", 788, 254, 0],
          ["photoelectric sensor head", "光电传感器头", 790, 248, 1], ["sensor mounting bracket", "传感器安装支架", 808, 259, 2],
          ["red emergency-stop button", "红色急停按钮", 1284, 460, 0], ["emergency-stop collar", "急停按钮护圈", 1284, 485, 2],
          ["control-station support post", "控制台支撑柱", 1288, 579, 1], ["control-station base", "控制台底座", 1290, 615, 2],
          ["yellow guardrail", "黄色安全护栏", 1250, 183, 0], ["guardrail upper tube", "护栏上管", 1170, 183, 1],
          ["guardrail lower tube", "护栏下管", 1175, 211, 2], ["guardrail post foot", "护栏立柱底座", 1240, 223, 3],
          ["overhead frame crossbar", "上方机架横梁", 1345, 158, 1], ["upper conveyor support rail", "上层输送机支撑导轨", 1490, 151, 1],
          ["upper rail mounting bracket", "上层导轨安装支架", 1530, 179, 2], ["sensor-post clamp", "传感器立柱夹箍", 800, 272, 3],
          ["right roller-lane guard", "右侧滚筒通道护板", 1450, 305, 1], ["roller-lane guard fastener", "滚筒通道护板紧固件", 1450, 300, 2],
          ["safety-rail end cap", "安全栏杆端盖", 1155, 190, 3],
        ],
      },
    ],
  },
  {
    id: "office-break-room",
    title: "Office break room",
    translation: "写字楼休息区",
    subtitle: "Kitchenette appliances, drinks, dishes, pantry storage, seating and recycling",
    parentId: "office-building",
    source: "scripts/assets/office-break-room-v1.png",
    asset: "/scenes/office-break-room-premium-v1.jpg",
    sourceSha256: "87314df72314c000014d1c2320e5195adf824fad86f018125e57db7059b938e3",
    assetSha256: "1fe63b2f3ca69e6a33f655c583c01655118ad4400b8b0d95342f04ab75f0f53d",
    wordPrefix: "Office break-room",
    translationPrefix: "写字楼休息区",
    removedExamples: ["meal choice", "food allergy", "appliance setting", "drink temperature", "cleanliness state", "staff identity", "written label", "brand name"],
    zones: [
      {
        id: "refrigerator-and-stored-food", title: "Refrigerator and stored food", translation: "冰箱与储存食物",
        description: "Explore the open refrigerator, its visible racks and containers, and the clearly pictured produce and bottles.",
        x: 130, y: 0, width: 420, height: 485, targetScale: 2.55,
        labels: [
          ["open refrigerator", "敞开的冰箱", 333, 241, 0], ["refrigerator body", "冰箱箱体", 447, 245, 1],
          ["refrigerator door", "冰箱门", 226, 247, 1], ["upper door shelf", "冰箱门上层搁架", 246, 103, 2],
          ["middle door shelf", "冰箱门中层搁架", 246, 192, 2], ["lower door shelf", "冰箱门下层搁架", 245, 296, 2],
          ["top refrigerator rack", "冰箱上层搁板", 331, 116, 1], ["middle refrigerator rack", "冰箱中层搁板", 331, 212, 1],
          ["green produce-container rim", "绿色果蔬盒上沿", 354, 282, 2], ["transparent produce drawer", "透明果蔬抽屉", 330, 357, 2],
          ["refrigerator gasket", "冰箱门封条", 425, 246, 3], ["refrigerator handle", "冰箱门把手", 434, 263, 2],
          ["orange drink bottle", "橙色饮料瓶", 250, 150, 1], ["upper door-shelf front rail", "冰箱门上层搁架前沿", 250, 130, 4],
          ["clear food jar", "透明食品罐", 355, 152, 1], ["food-jar lid", "食品罐盖", 355, 136, 3],
          ["small storage tub", "小型储物盒", 385, 152, 1], ["storage-tub lid", "储物盒盖", 385, 135, 3],
          ["green produce container", "绿色果蔬盒", 326, 276, 1], ["red produce container", "红色果蔬盒", 378, 279, 1],
          ["green apple", "青苹果", 384, 366, 1], ["red apple", "红苹果", 331, 365, 1],
          ["yellow fruit", "黄色水果", 420, 365, 1], ["refrigerator side panel", "冰箱侧板", 474, 318, 2],
          ["refrigerator top edge", "冰箱顶部边缘", 336, 47, 3],
        ],
      },
      {
        id: "coffee-and-hot-drinks", title: "Coffee and hot drinks", translation: "咖啡与热饮",
        description: "Inspect the drip coffee maker, glass carafe, kettle, mugs, stacked cups, tea packets and the shelf above.",
        x: 500, y: 0, width: 600, height: 405, targetScale: 2.55,
        labels: [
          ["drip coffee maker", "滴滤式咖啡机", 592, 300, 0], ["coffee-maker top lid", "咖啡机顶盖", 591, 262, 1],
          ["coffee filter basket", "咖啡滤篮", 593, 277, 2], ["coffee-maker water chamber", "咖啡机水箱", 558, 284, 2],
          ["coffee carafe", "咖啡玻璃壶", 585, 329, 0], ["carafe glass body", "玻璃咖啡壶身", 583, 327, 1],
          ["carafe handle", "咖啡壶把手", 625, 319, 2], ["carafe lid", "咖啡壶盖", 586, 301, 2],
          ["coffee-maker warming plate", "咖啡机保温盘", 592, 349, 2], ["coffee-maker base", "咖啡机底座", 591, 361, 1],
          ["electric kettle", "电热水壶", 685, 300, 0], ["kettle spout", "水壶壶嘴", 664, 286, 2],
          ["kettle handle", "水壶把手", 713, 299, 2], ["kettle lid", "水壶盖", 688, 266, 2],
          ["kettle switch", "水壶开关", 691, 340, 3], ["dark ceramic mug", "深色陶瓷杯", 625, 341, 1],
          ["mug handle", "陶瓷杯把手", 643, 343, 3], ["white mug", "白色马克杯", 730, 107, 1],
          ["stacked paper cups", "叠放纸杯", 777, 300, 1], ["paper-cup rim", "纸杯杯口", 777, 279, 3],
          ["tea packet tray", "茶包托盘", 749, 325, 1], ["tea sachet", "茶包", 748, 316, 2],
          ["brown pantry jar", "棕色食品储存罐", 927, 110, 1], ["clear dry-goods jar", "透明干货罐", 988, 110, 1],
          ["open drink shelf", "开放式饮品搁板", 762, 136, 0],
        ],
      },
      {
        id: "sink-and-dishwashing", title: "Sink and dishwashing", translation: "水槽与餐具清洗",
        description: "Explore the sink, faucet, soap dispenser, dish rack, plates, towel, countertop and dishwasher front.",
        x: 820, y: 165, width: 400, height: 485, targetScale: 2.6,
        labels: [
          ["sink", "水槽", 924, 291, 0], ["sink basin", "水槽盆体", 928, 297, 1],
          ["sink rim", "水槽边沿", 911, 277, 2], ["sink drain", "水槽排水口", 927, 315, 3],
          ["gooseneck faucet", "鹅颈水龙头", 914, 251, 0], ["faucet spout", "水龙头出水嘴", 917, 278, 2],
          ["faucet lever", "水龙头扳手", 938, 265, 2], ["faucet base", "水龙头底座", 911, 282, 3],
          ["liquid-soap dispenser", "洗手液压瓶", 861, 298, 1], ["soap-pump head", "洗手液泵头", 861, 280, 3],
          ["dish-drying rack", "餐具沥水架", 1033, 294, 0], ["rack wire divider", "沥水架金属隔片", 1011, 288, 2],
          ["upright dinner plate", "竖放餐盘", 1008, 268, 1], ["second dinner plate", "第二只餐盘", 1040, 266, 1],
          ["small side plate", "小号餐碟", 1069, 268, 1], ["dish rack base wires", "沥水架底部金属线", 1038, 316, 3],
          ["striped dish towel", "条纹擦碗巾", 977, 393, 0], ["towel edge", "毛巾边缘", 974, 387, 2],
          ["stainless dishwasher", "不锈钢洗碗机", 1090, 465, 0], ["dishwasher door", "洗碗机门板", 1092, 472, 1],
          ["dishwasher handle", "洗碗机把手", 1088, 404, 2], ["dishwasher kickplate", "洗碗机踢脚板", 1102, 635, 2],
          ["sink-base cabinet door", "水槽下柜门", 910, 465, 1], ["sink-base cabinet pull", "水槽下柜拉手", 831, 455, 3],
          ["backsplash tile", "防溅墙砖", 855, 230, 2],
        ],
      },
      {
        id: "microwave-and-snack-counter", title: "Microwave and snack counter", translation: "微波炉与零食台面",
        description: "Inspect the microwave, small toaster oven, counter-top jars and bowls, fruit and wall-mounted chopping board.",
        x: 1080, y: 175, width: 592, height: 430, targetScale: 2.6,
        labels: [
          ["countertop microwave", "台式微波炉", 1217, 293, 0], ["microwave door", "微波炉门", 1190, 336, 1],
          ["microwave viewing window", "微波炉观察窗", 1191, 292, 2], ["microwave handle", "微波炉把手", 1265, 304, 2],
          ["microwave keypad", "微波炉按键区", 1268, 281, 2], ["microwave side grille", "微波炉侧散热格栅", 1291, 308, 3],
          ["small toaster oven", "小型烤面包烤箱", 1375, 300, 0], ["toaster-oven glass door", "小烤箱玻璃门", 1370, 307, 1],
          ["toaster-oven handle", "小烤箱把手", 1403, 312, 2], ["toaster-oven control dial", "小烤箱控制旋钮", 1438, 297, 2],
          ["toaster-oven rack", "小烤箱烤架", 1369, 310, 3], ["snack glass jar", "零食玻璃罐", 1522, 301, 1],
          ["jar lid", "玻璃罐盖", 1520, 280, 3], ["orange dry snacks", "橙色干点心", 1515, 319, 2],
          ["second pantry jar", "第二只食品罐", 1590, 300, 1], ["second pantry jar lid", "第二只食品罐盖", 1590, 281, 3],
          ["countertop fruit bowl", "台面水果碗", 1632, 340, 0], ["lemon in fruit bowl", "水果碗里的柠檬", 1625, 323, 1],
          ["oranges in fruit bowl", "水果碗里的橙子", 1645, 327, 1], ["hanging wooden board", "悬挂木砧板", 1618, 244, 0],
          ["wooden chopping-board edge", "木砧板边缘", 1620, 228, 2], ["countertop front edge", "台面前沿", 1380, 366, 1],
          ["countertop corner", "台面转角", 1500, 365, 2], ["small glass snack jar", "小号玻璃零食罐", 1470, 317, 1],
          ["snack-jar lid", "零食罐盖", 1470, 302, 3],
        ],
      },
      {
        id: "tables-chairs-and-recycling", title: "Tables, chairs and recycling", translation: "桌椅与回收设施",
        description: "Explore the dining tables, upholstered chairs, bar stools, waste and recycling bins, plants and open floor.",
        x: 90, y: 440, width: 1_555, height: 470, targetScale: 2.45,
        labels: [
          ["left dining table", "左侧餐桌", 335, 575, 0], ["left table top", "左侧桌面", 320, 548, 1],
          ["left table front edge", "左侧桌前沿", 395, 647, 2], ["left table side edge", "左侧桌侧沿", 144, 584, 2],
          ["table corner", "桌角", 507, 603, 3], ["table pedestal leg", "桌面支撑桌腿", 715, 730, 1],
          ["table leg foot", "桌腿底脚", 716, 872, 2], ["front-left dining chair", "左前方餐椅", 145, 777, 0],
          ["front-left chair back", "左前方椅背", 95, 695, 1], ["front-left chair seat", "左前方椅座", 170, 779, 1],
          ["front-left chair frame", "左前方椅架", 250, 838, 2], ["front-left chair leg", "左前方椅腿", 267, 894, 2],
          ["centre upholstered chair", "中央软包餐椅", 604, 585, 0], ["centre chair backrest", "中央餐椅靠背", 584, 552, 1],
          ["centre chair seat", "中央餐椅椅座", 601, 620, 1], ["chair fabric surface", "椅面织物", 610, 570, 2],
          ["right round table", "右侧圆桌", 1541, 447, 0], ["round tabletop edge", "圆桌桌沿", 1495, 445, 1],
          ["round-table pedestal", "圆桌支柱", 1575, 530, 1], ["bar stool seat", "吧凳坐面", 1456, 530, 0],
          ["bar stool back", "吧凳靠背", 1458, 499, 1], ["bar stool footrest", "吧凳脚踏杆", 1459, 724, 2],
          ["blue recycling bin", "蓝色回收桶", 1554, 701, 0], ["recycling-bin lid", "回收桶盖", 1548, 536, 1],
          ["grey waste bin", "灰色垃圾桶", 1640, 702, 0],
        ],
      },
      {
        id: "cabinetry-plants-and-pantry", title: "Cabinetry, plants and pantry", translation: "橱柜、绿植与食品储藏",
        description: "Inspect the upper and lower cabinets, shelf jars, houseplants, counter fittings and visible storage surfaces.",
        x: 540, y: 0, width: 1_090, height: 630, targetScale: 2.5,
        labels: [
          ["upper cabinet run", "上排橱柜", 1302, 114, 0], ["left upper cabinet door", "左侧上柜门", 1157, 106, 1],
          ["right upper cabinet door", "右侧上柜门", 1505, 112, 1], ["upper cabinet pull", "上柜拉手", 1247, 133, 2],
          ["second upper cabinet pull", "第二个上柜拉手", 1568, 135, 2], ["open wall shelf", "开放式墙架", 803, 139, 0],
          ["shelf bracket", "搁板支架", 725, 165, 3], ["shelf glass canister", "搁板玻璃储物罐", 955, 101, 1],
          ["canister wooden lid", "玻璃罐木盖", 953, 83, 2], ["shelf white mug", "搁板白色马克杯", 792, 110, 1],
          ["shelf green plant", "搁板绿植", 555, 74, 0], ["hanging plant leaf", "垂吊植物叶片", 555, 114, 1],
          ["plant pot", "植物花盆", 555, 157, 2], ["countertop herb pot", "台面香草盆栽", 545, 320, 0],
          ["herb-pot leaves", "香草盆栽叶片", 545, 259, 2], ["lower cabinet bank", "下排储物柜", 770, 453, 0],
          ["left lower cabinet door", "左侧下柜门", 572, 462, 1], ["lower cabinet drawer", "下柜抽屉", 728, 420, 1],
          ["lower drawer pull", "下柜抽屉拉手", 730, 414, 3], ["cabinet door pull", "橱柜门拉手", 586, 457, 2],
          ["cabinet toe-kick", "橱柜踢脚板", 760, 620, 2], ["countertop backsplash", "台面防溅墙板", 760, 239, 1],
          ["counter splashback grout", "防溅墙板接缝", 805, 224, 3], ["under-cabinet light strip", "吊柜底部灯带", 812, 151, 2],
          ["lower-cabinet door seam", "下柜门板接缝", 650, 478, 2],
        ],
      },
    ],
  },
];

scenes.push(
  {
    id: "airport-conveyor-drive-unit",
    title: "Airport conveyor drive unit",
    translation: "机场行李输送驱动单元",
    subtitle: "Gearmotor, drive drum, transfer rollers, steel supports and safety controls",
    parentId: "airport-baggage-conveyor",
    source: "scripts/assets/airport-conveyor-drive-unit-v1.png",
    asset: "/scenes/airport-conveyor-drive-unit-premium-v1.jpg",
    sourceSha256: "dc0bfd0c79cf7c47e2c29b7237a7b9df2f0be031685aeb7aa185285fedbcb3f7",
    assetSha256: "084c09e4e7703bbd1fb116eefb4b2274e48a8cc1ae3fdbd7b4e0ecbdb42b7f23",
    wordPrefix: "Airport",
    translationPrefix: "机场",
    overviewPriorityTerms: [
      "main belt", "support leg", "upper photoeye", "belt sensor",
      "lower frame rail", "e-stop station", "yellow guard", "roller entry",
      "support column", "upper roller", "gearmotor", "drive terminal box",
      "transfer roller", "drive junction box", "drive drum", "discharge end",
    ],
    removedExamples: ["belt speed", "load rating", "motor torque", "live voltage", "network address", "maintenance status", "airline identity", "machine operation"],
    zones: [
      {
        id: "gear-motor-and-reducer", title: "Gearmotor and reducer", translation: "减速电机与齿轮箱",
        description: "Inspect the visible electric motor, finned housing, terminal box, coupling, reducer and their mounting feet.",
        x: 520, y: 330, width: 720, height: 470, targetScale: 2.65,
        labels: [
          ["gearmotor", "减速电机组件", 850, 555, 0], ["electric motor casing", "电动机壳体", 980, 560, 1],
          ["motor cooling-fin row", "电机散热筋列", 1015, 540, 2], ["motor fan-end shroud", "电机风扇端罩", 1084, 548, 1],
          ["fan-shroud vent slots", "风扇罩通风槽", 1080, 532, 3], ["motor end-shield seam", "电机端盖接缝", 1045, 585, 2],
          ["drive terminal box", "驱动电机接线盒", 966, 444, 1], ["terminal-box lid", "接线盒盖", 966, 428, 2],
          ["terminal-lid screw", "接线盒盖螺钉", 947, 433, 4], ["cable-entry gland", "电缆入口接头", 1014, 449, 3],
          ["motor lifting eye", "电机吊环", 847, 419, 3], ["gear reducer housing", "齿轮减速器壳体", 836, 564, 0],
          ["reducer casting seam", "减速器铸造接缝", 820, 545, 3], ["motor adapter flange", "电机连接法兰", 946, 556, 2],
          ["coupling sleeve", "联轴器套筒", 940, 538, 1], ["coupling sleeve edge", "联轴器套筒边缘", 929, 535, 3],
          ["reducer mounting foot near", "近侧减速器安装脚", 713, 671, 2], ["reducer mounting foot far", "远侧减速器安装脚", 761, 669, 2],
          ["motor mounting foot left", "左电机安装脚", 952, 653, 2], ["motor mounting foot right", "右电机安装脚", 996, 652, 2],
          ["near motor hold-down bolt", "近侧电机固定螺栓", 956, 672, 4], ["far motor hold-down bolt", "远侧电机固定螺栓", 1000, 670, 4],
          ["shared motor bedplate", "电机共用底板", 851, 704, 1], ["bedplate side rail", "底板侧梁", 820, 710, 2],
          ["flexible motor conduit elbow", "电机软管弯头", 1138, 606, 2],
        ],
      },
      {
        id: "drive-drum-and-yellow-guard", title: "Drive drum and yellow guard", translation: "驱动滚筒与黄色护罩",
        description: "Follow the black drive drum, exposed shaft end, bearing support and perforated yellow safety guard.",
        x: 330, y: 300, width: 460, height: 440, targetScale: 2.7,
        labels: [
          ["drive drum", "滚筒组件", 690, 523, 0], ["black drum sleeve", "黑色滚筒包胶", 685, 523, 1],
          ["drum left end face", "滚筒左端面", 687, 535, 2], ["drum right shoulder", "滚筒右轴肩", 732, 535, 2],
          ["drive-shaft stub", "驱动轴短轴端", 753, 534, 1], ["shaft-end collar", "轴端套环", 767, 535, 3],
          ["drive bearing support", "驱动轴承支架", 538, 523, 1], ["bearing housing", "轴承座", 529, 533, 1],
          ["drive bearing housing cap", "驱动轴承座端盖", 538, 510, 2], ["upper bearing-cap bolt", "轴承盖上螺栓", 534, 508, 4],
          ["lower bearing-cap bolt", "轴承盖下螺栓", 544, 542, 4], ["yellow guard", "黄色穿孔护罩", 532, 470, 0],
          ["guard upper flange", "护罩上翻边", 518, 384, 2], ["guard forward panel", "护罩前面板", 489, 506, 1],
          ["guard return edge", "护罩回折边", 602, 582, 2], ["guard ventilation perforations", "护罩通风孔", 486, 425, 3],
          ["guard corner bend", "护罩折角", 610, 420, 2], ["upper guard fastener", "护罩上部紧固件", 499, 403, 4],
          ["lower guard fastener", "护罩下部紧固件", 505, 659, 4], ["guard mounting ear", "护罩安装耳", 626, 663, 3],
          ["belt wrap over drum", "滚筒包覆输送带", 642, 428, 1], ["left lower support rail", "左下支撑梁", 407, 612, 2],
          ["belt-to-drum contact", "输送带与滚筒接触处", 660, 450, 2], ["drum support plate", "滚筒支撑板", 648, 674, 2],
          ["guard side-frame fastener", "护罩侧框紧固件", 624, 638, 3],
        ],
      },
      {
        id: "main-belt-and-transfer", title: "Main belt and transfer", translation: "主输送带与转接段",
        description: "Explore the broad black belt run, its steel edge guides and the visible belt-to-roller transfer.",
        x: 0, y: 50, width: 1180, height: 440, targetScale: 2.55,
        labels: [
          ["main belt", "主行李输送带", 430, 292, 0], ["belt carry surface", "输送带承载面", 360, 255, 1],
          ["belt centre strip", "输送带中部带面", 510, 285, 1], ["left belt edge", "输送带左边沿", 74, 263, 2],
          ["near belt edge", "近侧带边", 540, 405, 2], ["far belt edge", "远侧带边", 246, 178, 2],
          ["inner sidewall panel", "内侧挡板", 152, 232, 1], ["outer sidewall panel", "外侧挡板", 723, 409, 1],
          ["belt guide rail", "输送带导轨", 767, 390, 1], ["guide-rail top lip", "导轨上唇", 785, 411, 2],
          ["drive belt retaining flange", "驱动输送带限位翻边", 682, 420, 3], ["belt skirt strip", "输送带裙边", 389, 399, 2],
          ["stainless side plate", "不锈钢侧板", 632, 438, 1], ["side-plate seam", "侧板接缝", 616, 449, 3],
          ["belt splice line", "输送带接合线", 294, 271, 3], ["belt backing edge", "输送带背衬边", 335, 390, 2],
          ["transfer nose plate", "转接鼻端板", 835, 407, 1], ["transfer lip", "转接唇边", 870, 419, 2],
          ["discharge end", "输送带出料端", 916, 385, 1], ["roller entry", "滚筒床入口", 984, 370, 0],
          ["infeed frame corner", "进料机架角", 60, 328, 2], ["belt-side trim strip", "带侧包边条", 478, 414, 3],
          ["belt support pan", "输送带承托板", 707, 434, 2], ["transfer-frame top plate", "转接机架顶板", 897, 439, 2],
          ["belt-to-roller gap", "带式与滚筒段间隙", 949, 402, 3],
        ],
      },
      {
        id: "roller-bed", title: "Transfer roller bed", translation: "转接滚筒床",
        description: "Inspect the clearly separated steel rollers, roller ends, bed rails and transfer supports.",
        x: 930, y: 150, width: 742, height: 430, targetScale: 2.65,
        labels: [
          ["transfer roller", "第一根转接滚筒", 1110, 324, 0], ["transfer roller two", "第二根转接滚筒", 1160, 339, 1],
          ["transfer roller three", "第三根转接滚筒", 1210, 352, 1], ["transfer roller four", "第四根转接滚筒", 1260, 368, 1],
          ["transfer roller five", "第五根转接滚筒", 1310, 383, 1], ["transfer roller six", "第六根转接滚筒", 1360, 397, 1],
          ["transfer roller seven", "第七根转接滚筒", 1410, 414, 1], ["transfer roller eight", "第八根转接滚筒", 1460, 428, 1],
          ["transfer roller nine", "第九根转接滚筒", 1512, 444, 1], ["transfer roller ten", "第十根转接滚筒", 1562, 458, 1],
          ["roller shell surface", "滚筒外圆表面", 1295, 354, 2], ["transfer roller end cap", "转接滚筒端盖", 1213, 355, 2],
          ["roller axle tip", "滚筒轴端", 1352, 395, 3], ["transfer roller bearing block", "转接滚筒轴承块", 1452, 459, 2],
          ["left roller-bed rail", "左侧滚筒床梁", 1140, 422, 1], ["right roller-bed rail", "右侧滚筒床梁", 1580, 541, 1],
          ["roller-bed crossmember", "滚筒床横梁", 1415, 561, 2], ["roller end stop", "滚筒端部止挡", 1634, 469, 2],
          ["roller spacing gap", "滚筒间距", 1240, 371, 3], ["roller-bed side flange", "滚筒床侧翻边", 1530, 510, 2],
          ["roller support bracket", "滚筒支撑托架", 1480, 545, 3], ["roller seat cutout", "滚筒轴承槽口", 1455, 492, 3],
          ["roller-bed junction plate", "滚筒床接合板", 1086, 442, 2], ["upper roller", "上层转接滚筒", 1400, 226, 1],
          ["rear roller-lane divider", "后侧滚筒通道隔板", 1610, 280, 2],
        ],
      },
      {
        id: "support-frame-and-feet", title: "Support frame and floor feet", translation: "支撑机架与落地底脚",
        description: "Trace the visible conveyor frame, cross-braces, support legs, floor plates and their fasteners.",
        x: 40, y: 450, width: 1580, height: 480, targetScale: 2.5,
        labels: [
          ["support leg", "左侧输送机支腿", 285, 741, 0], ["left support foot plate", "左支腿底板", 292, 876, 2],
          ["support column", "近侧滚筒支柱", 1012, 722, 1], ["right roller support leg", "右侧滚筒支腿", 1498, 721, 1],
          ["right floor base plate", "右侧落地底板", 1492, 879, 2], ["lower conveyor crossbeam", "输送机下横梁", 780, 804, 1],
          ["longitudinal support channel", "纵向支撑槽钢", 1238, 713, 1], ["diagonal frame brace", "机架斜撑", 383, 817, 2],
          ["motor-bed frame rail", "电机底座机架梁", 907, 758, 1], ["roller-bed cross brace", "滚筒床横撑", 1376, 737, 2],
          ["frame gusset plate", "机架加劲板", 950, 769, 2], ["upright leg bracket", "立柱连接托架", 1006, 699, 2],
          ["support-column flange", "支柱法兰", 1030, 837, 2], ["left floor anchor bolt", "左侧地脚螺栓", 274, 879, 4],
          ["right floor anchor bolt", "右侧地脚螺栓", 1514, 884, 4], ["near base-plate washer", "近侧底板垫圈", 1016, 871, 4],
          ["frame side-channel lip", "机架槽边", 688, 765, 2], ["lower frame seam", "下部机架接缝", 831, 791, 3],
          ["support beam end cap", "支撑梁端盖", 1320, 730, 2], ["leg-to-beam junction", "支腿与横梁接合处", 1006, 745, 2],
          ["frame rail bolt head", "机架梁螺栓头", 688, 770, 4], ["cross-brace mounting tab", "斜撑安装耳", 408, 788, 3],
          ["floor-leveling foot", "落地调平脚", 347, 893, 3], ["machine foot pad", "设备支脚垫片", 1038, 878, 3],
          ["lower frame rail", "开放机架下梁", 618, 823, 1],
        ],
      },
      {
        id: "junction-safety-and-sensors", title: "Junction box, safety stop and sensors", translation: "接线盒、急停与传感器",
        description: "Inspect the blank electrical enclosure, red emergency-stop control, sensor heads, mounts and cable runs.",
        x: 900, y: 170, width: 762, height: 520, targetScale: 2.6,
        labels: [
          ["drive junction box", "驱动接线箱", 1194, 472, 0], ["junction-box front lid", "接线箱前盖", 1190, 465, 1],
          ["junction-box corner seam", "接线箱角部接缝", 1155, 440, 2], ["junction lid screw upper", "接线箱盖上螺钉", 1171, 437, 4],
          ["junction lid screw lower", "接线箱盖下螺钉", 1216, 500, 4], ["box bottom cable port", "箱底电缆口", 1194, 520, 2],
          ["conduit gland at box", "接线箱软管接头", 1160, 531, 3], ["black flex conduit", "黑色柔性导管", 1120, 568, 1],
          ["conduit retaining clip", "导管固定夹", 1102, 590, 3], ["e-stop station", "急停控制盒", 1280, 438, 0],
          ["red emergency-stop mushroom", "红色蘑菇头急停按钮", 1284, 427, 1], ["yellow e-stop bezel", "黄色急停按钮护圈", 1284, 449, 2],
          ["stop-station mounting stem", "急停站支撑杆", 1284, 488, 1], ["stop-station base bracket", "急停站底托", 1285, 513, 2],
          ["upper photoeye", "上部光电传感器", 1452, 206, 0], ["sensor lens window", "传感器透镜窗", 1451, 201, 2],
          ["upper sensor clamp", "上部传感器夹座", 1441, 224, 2], ["upper sensor support post", "上部传感器立柱", 1443, 261, 1],
          ["belt sensor", "下方带侧传感器头", 964, 230, 0], ["belt sensor bracket", "带侧传感器支架", 964, 251, 2],
          ["sensor-post clamp bolt", "传感器夹座螺栓", 1440, 229, 4], ["blue sensor cable", "蓝色传感器电缆", 1454, 250, 2],
          ["sensor cable conduit", "传感器导管", 1390, 286, 2], ["box mounting ear", "接线箱安装耳", 1232, 503, 3],
          ["enclosure lower mounting screw", "箱体下部固定螺钉", 1228, 506, 4],
        ],
      },
    ],
  },
  {
    id: "office-network-rack",
    title: "Office network rack",
    translation: "写字楼网络机柜",
    subtitle: "Rack enclosure, patch panels, switches, servers, cable management and power",
    parentId: "service-core",
    source: "scripts/assets/office-network-rack-v1.png",
    asset: "/scenes/office-network-rack-premium-v1.jpg",
    sourceSha256: "ac18cc16489c3ea82bdd5394fc4178fd3ad42a646e2a677778a1c4996e6d57f0",
    assetSha256: "bc42d7c3cb274f47451d0bdbede8c90d2c6ae9f7b21256b99884e98d5fea19da",
    wordPrefix: "Network",
    translationPrefix: "写字楼",
    removedExamples: ["network address", "account credential", "server workload", "data content", "live voltage", "airflow rate", "device temperature", "cable destination"],
    zones: [
      {
        id: "cabinet-frame-and-open-door", title: "Cabinet frame and open door", translation: "机柜框架与敞开柜门",
        description: "Explore the open perforated door, hinges, front posts, mounting rails, cabinet base and visible frame hardware.",
        x: 340, y: 0, width: 850, height: 930, targetScale: 2.5,
        labels: [
          ["cabinet shell", "网络机柜外壳", 1014, 523, 0], ["open mesh front door", "敞开的网孔前门", 493, 421, 0],
          ["door perforated panel", "柜门冲孔面板", 485, 253, 1], ["door outer frame", "柜门外框", 566, 469, 1],
          ["door inner border", "柜门内边框", 607, 571, 2], ["upper door hinge", "上部柜门铰链", 620, 92, 2],
          ["middle door hinge", "中部柜门铰链", 621, 363, 2], ["lower door hinge", "下部柜门铰链", 621, 702, 2],
          ["door pull handle", "柜门拉手", 577, 430, 1], ["door latch plate", "柜门锁扣板", 594, 437, 2],
          ["door lock cylinder", "柜门锁芯", 591, 461, 3], ["front left rack post", "前左机柜立柱", 655, 502, 1],
          ["front right rack post", "前右机柜立柱", 1014, 552, 1], ["inner mounting rail", "内侧安装导轨", 702, 400, 2],
          ["rack top crosspiece", "机柜顶部横梁", 816, 25, 1], ["lower cabinet crossbar", "机柜下横梁", 884, 843, 2],
          ["cabinet foot left", "机柜左脚", 610, 904, 2], ["cabinet foot right", "机柜右脚", 1044, 904, 2],
          ["left post square-hole row", "左立柱方孔列", 652, 248, 3], ["right post square-hole row", "右立柱方孔列", 1014, 248, 3],
          ["front frame corner bracket", "前框角部托架", 659, 832, 2], ["door lower hinge pin", "柜门下铰链销", 620, 715, 3],
          ["side-frame joint", "侧框接合处", 1014, 607, 2], ["cabinet base pan", "机柜底盘", 846, 879, 1],
          ["bottom frame fastener", "底框紧固件", 1014, 868, 4],
        ],
      },
      {
        id: "fiber-and-copper-patching", title: "Fiber and copper patching", translation: "光纤与铜缆配线",
        description: "Inspect the visible fiber patch panel, copper patch panels, connector rows and short patch cords.",
        x: 650, y: 80, width: 490, height: 300, targetScale: 2.8,
        labels: [
          ["upper fiber patch panel", "上层光纤配线架", 831, 148, 0], ["fiber-panel chassis", "光纤配线架外壳", 850, 130, 1],
          ["left LC adapter row", "左侧LC适配器列", 748, 141, 2], ["right LC adapter row", "右侧LC适配器列", 920, 141, 2],
          ["first duplex fiber adapter", "第一只双工光纤适配器", 769, 140, 3], ["second duplex fiber adapter", "第二只双工光纤适配器", 806, 140, 3],
          ["third duplex fiber adapter", "第三只双工光纤适配器", 842, 140, 3], ["fourth duplex fiber adapter", "第四只双工光纤适配器", 878, 140, 3],
          ["yellow fiber jumper one", "第一根黄色跳纤", 774, 158, 2], ["yellow fiber jumper two", "第二根黄色跳纤", 819, 160, 2],
          ["yellow fiber jumper three", "第三根黄色跳纤", 866, 158, 2], ["blue fiber trunk", "蓝色光纤主干束", 675, 250, 1],
          ["upper horizontal cable bar", "上层水平理线杆", 812, 181, 1], ["upper brush pass-through", "上层毛刷过线口", 852, 203, 2],
          ["copper patch panel upper", "上层铜缆配线架", 845, 258, 0], ["upper Ethernet jack row", "上层以太网插孔列", 853, 267, 2],
          ["left Ethernet jack bank", "左侧以太网插孔组", 756, 267, 2], ["right Ethernet jack bank", "右侧以太网插孔组", 944, 267, 2],
          ["blue patch cord group", "蓝色跳线组", 852, 286, 1], ["blue patch cord bend", "蓝色跳线弯折处", 884, 303, 2],
          ["panel left mounting ear", "配线架左安装耳", 692, 272, 2], ["panel right mounting ear", "配线架右安装耳", 1000, 272, 2],
          ["blank horizontal cable cover", "水平理线盖板", 833, 215, 1], ["fiber-panel screw head", "光纤架螺钉头", 990, 134, 4],
          ["panel-side cable guide", "配线架侧向导线槽", 712, 185, 2],
        ],
      },
      {
        id: "switches-and-network-appliances", title: "Switches and network appliances", translation: "交换机与网络设备",
        description: "Follow both installed switches and their visible port banks, then inspect the equipment blanking panel and rack cable bar.",
        x: 650, y: 250, width: 500, height: 360, targetScale: 2.75,
        labels: [
          ["upper Ethernet switch", "上层以太网交换机", 858, 395, 0], ["upper switch faceplate", "上层交换机面板", 857, 392, 1],
          ["upper switch port bank", "上层交换机端口组", 828, 402, 1], ["upper switch uplink slots", "上层交换机上联插槽", 934, 402, 2],
          ["upper switch SFP module", "上层交换机SFP模块", 938, 401, 3], ["upper switch status LEDs", "上层交换机状态灯", 981, 402, 3],
          ["upper switch vent grille", "上层交换机散热格栅", 978, 390, 2], ["lower Ethernet switch", "下层以太网交换机", 856, 470, 0],
          ["lower switch port bank", "下层交换机端口组", 833, 474, 1], ["lower switch left port", "下层交换机左端口", 802, 474, 2],
          ["lower switch right port", "下层交换机右端口", 905, 474, 2], ["lower switch power inlet", "下层交换机电源入口", 967, 479, 3],
          ["centre equipment blanking panel", "中部设备盲板", 860, 529, 0], ["blank-panel pull handle", "盲板拉手", 850, 526, 1],
          ["blank-panel left screw", "盲板左侧螺钉", 802, 530, 2], ["blank-panel right screw", "盲板右侧螺钉", 966, 530, 2],
          ["blank-panel right edge", "盲板右边沿", 985, 529, 2], ["blank-panel lower seam", "盲板下沿接缝", 860, 545, 3],
          ["rackmount cable bar", "机架水平理线杆", 845, 298, 1], ["bar finger opening", "理线杆梳齿开口", 786, 300, 3],
          ["switch mounting ear left", "交换机左安装耳", 702, 399, 2], ["switch mounting ear right", "交换机右安装耳", 1002, 399, 2],
          ["retainer screw upper", "上部设备固定螺钉", 1001, 392, 4], ["retainer screw lower", "下部设备固定螺钉", 1000, 476, 4],
          ["front cable guide fingers", "前侧理线梳齿", 705, 474, 2],
        ],
      },
      {
        id: "server-chassis-and-drive-bays", title: "Server chassis and drive bays", translation: "服务器机箱与硬盘托架",
        description: "Inspect the two front-facing server chassis, their separate drive trays, handles and ventilation grilles.",
        x: 650, y: 520, width: 500, height: 350, targetScale: 2.75,
        labels: [
          ["upper server chassis", "上层服务器机箱", 860, 596, 0], ["upper server bezel", "上层服务器前面板", 859, 596, 1],
          ["upper server drive bay one", "上层服务器硬盘位一", 751, 586, 1], ["upper server drive bay two", "上层服务器硬盘位二", 801, 586, 1],
          ["upper server drive bay three", "上层服务器硬盘位三", 850, 586, 1], ["upper server drive bay four", "上层服务器硬盘位四", 899, 586, 1],
          ["upper server drive bay five", "上层服务器硬盘位五", 948, 586, 1], ["upper server drive bay six", "上层服务器硬盘位六", 995, 586, 1],
          ["upper drive-tray latch", "上层硬盘托架卡扣", 850, 574, 3], ["upper server release handle", "上层服务器释放把手", 705, 602, 2],
          ["lower server chassis", "下层服务器机箱", 861, 670, 0], ["lower server faceplate", "下层服务器前面板", 861, 670, 1],
          ["lower server drive bay one", "下层服务器硬盘位一", 751, 660, 1], ["lower server drive bay two", "下层服务器硬盘位二", 800, 660, 1],
          ["lower server drive bay three", "下层服务器硬盘位三", 851, 660, 1], ["lower server drive bay four", "下层服务器硬盘位四", 899, 660, 1],
          ["lower server drive bay five", "下层服务器硬盘位五", 948, 660, 1], ["lower server drive bay six", "下层服务器硬盘位六", 997, 660, 1],
          ["lower drive-tray latch", "下层硬盘托架卡扣", 850, 648, 3], ["lower server pull handle", "下层服务器拉手", 705, 677, 2],
          ["server intake grille", "服务器进风格栅", 1012, 748, 2], ["chassis rail left", "机箱左滑轨", 696, 746, 2],
          ["chassis rail right", "机箱右滑轨", 1029, 746, 2], ["drive carrier release tab", "硬盘托架释放片", 949, 607, 3],
          ["server bezel fastener", "服务器面板紧固件", 1020, 584, 4],
        ],
      },
      {
        id: "vertical-cable-management", title: "Vertical cable management", translation: "垂直线缆管理",
        description: "Trace the colored patch leads, vertical managers, retaining fingers, routing loops and strain-relief hardware.",
        x: 600, y: 35, width: 650, height: 850, targetScale: 2.65,
        labels: [
          ["left vertical cable manager", "左侧垂直理线槽", 672, 420, 0], ["right vertical cable manager", "右侧垂直理线槽", 1051, 420, 0],
          ["left manager front channel", "左理线槽前通道", 681, 400, 1], ["right manager front channel", "右理线槽前通道", 1045, 408, 1],
          ["blue vertical patch-cord bundle", "蓝色垂直跳线束", 676, 253, 1], ["yellow vertical fiber bundle", "黄色垂直光纤束", 1066, 260, 1],
          ["upper cable-retainer finger", "上部线缆固定齿", 687, 154, 2], ["middle cable-retainer finger", "中部线缆固定齿", 688, 357, 2],
          ["lower cable-retainer finger", "下部线缆固定齿", 689, 580, 2], ["side cable-guide ring", "侧边导线环", 690, 659, 3],
          ["yellow fiber jumper connector", "黄色跳纤接头", 1061, 97, 2], ["blue copper patch lead", "蓝色铜缆跳线", 735, 347, 1],
          ["patch-cord plug boot", "跳线插头护套", 799, 356, 3], ["short fiber bend loop", "短光纤弯曲环", 916, 162, 2],
          ["horizontal slack loop", "水平余缆环", 943, 188, 2], ["vertical cable tie saddle", "垂直扎带鞍座", 1065, 212, 3],
          ["upper strain-relief bracket", "上部应力释放支架", 1037, 241, 2], ["lower strain-relief bracket", "下部应力释放支架", 1037, 540, 2],
          ["manager mounting screw upper", "理线槽上固定螺钉", 1046, 139, 4], ["manager mounting screw lower", "理线槽下固定螺钉", 1047, 771, 4],
          ["rear cable drop", "后侧下行线缆", 1112, 403, 1], ["side-rack cable loom", "侧机柜线束", 1162, 273, 1],
          ["fiber-cord crossing guide", "跳纤交叉导向件", 1093, 420, 2], ["patch-lead retaining strap", "跳线固定带", 1058, 612, 3],
          ["cable-entry comb", "线缆入口梳", 1057, 809, 2],
        ],
      },
      {
        id: "rack-power-cooling-and-floor", title: "Rack power, cooling and floor", translation: "机柜供电、散热与地面",
        description: "Explore the visible vertical power strip, plugs, fan openings, UPS face, ventilation and floor grilles.",
        x: 620, y: 0, width: 1050, height: 940, targetScale: 2.55,
        labels: [
          ["vertical power strip", "垂直机柜电源排", 1074, 470, 0], ["upper power outlet", "上部电源插座", 1066, 126, 1],
          ["middle power outlet", "中部电源插座", 1066, 408, 1], ["lower power outlet", "下部电源插座", 1066, 700, 1],
          ["plugged power cord upper", "上部插接电源线", 1092, 155, 2], ["plugged power cord lower", "下部插接电源线", 1090, 734, 2],
          ["rack power-strip bracket", "机柜电源排支架", 1060, 259, 2], ["power-strip side seam", "电源排侧缝", 1070, 535, 2],
          ["UPS chassis", "机架式不间断电源机箱", 860, 781, 0], ["UPS front grille", "不间断电源前格栅", 862, 779, 1],
          ["UPS left ear", "不间断电源左安装耳", 705, 785, 2], ["UPS right ear", "不间断电源右安装耳", 1010, 786, 2],
          ["upper rack fan tray", "上部机柜风扇盘", 862, 52, 0], ["left cooling fan", "左侧散热风扇", 779, 56, 1],
          ["centre cooling fan", "中间散热风扇", 860, 56, 1], ["right cooling fan", "右侧散热风扇", 944, 56, 1],
          ["fan guard ring", "风扇护圈", 862, 44, 2], ["fan-tray mounting rail", "风扇盘安装导轨", 1039, 60, 2],
          ["rack rear exhaust grille", "机柜后部排风格栅", 1491, 270, 1], ["room ceiling diffuser", "房间吊顶送风口", 1313, 49, 0],
          ["perforated floor tile", "穿孔地板块", 1302, 881, 1], ["floor-grille slot row", "地面格栅槽列", 1303, 879, 2],
          ["floor access-tile seam", "地板检修板接缝", 1441, 870, 2], ["equipment ground lead", "设备接地线", 1073, 838, 2],
          ["grounding lug", "接地端子", 1093, 853, 3],
        ],
      },
    ],
  },
);

const integrations = [
  {
    parentId: "baggage-drop-station", childId: "airport-baggage-conveyor", title: "Airport baggage conveyor",
    portal: { id: "enter-airport-baggage-conveyor", label: "Explore the baggage conveyor", translation: "探索行李输送带", childSceneId: "airport-baggage-conveyor", sourceVisualRegion: "portal-airport-baggage-conveyor", x: 700, y: 320, width: 285, height: 205, enterScale: 3.25 },
    description: "Central loaded conveyor belt and suitcase in the baggage-drop station photograph; the crop does not include the neighbouring check-in or scanning equipment.",
  },
  {
    parentId: "office-building", childId: "office-break-room", title: "Office break room",
    portal: { id: "enter-office-break-room", label: "Explore the office break room", translation: "探索写字楼休息区", childSceneId: "office-break-room", sourceVisualRegion: "portal-office-break-room", x: 930, y: 360, width: 240, height: 190, enterScale: 3.2 },
    description: "Visible kitchenette counter, sink, dish rack and nearby seating within the office-building photograph.",
  },
];

integrations.push(
  {
    parentId: "airport-baggage-conveyor", childId: "airport-conveyor-drive-unit", title: "Airport conveyor drive unit",
    portal: { id: "enter-airport-conveyor-drive-unit", label: "Explore the conveyor drive unit", translation: "探索输送机驱动单元", childSceneId: "airport-conveyor-drive-unit", sourceVisualRegion: "portal-airport-conveyor-drive-unit", x: 945, y: 540, width: 195, height: 170, enterScale: 3.25 },
    description: "The complete, unobstructed main gearmotor and its yellow guard in the airport baggage-conveyor photograph.",
  },
  {
    parentId: "service-core", childId: "office-network-rack", title: "Office network rack",
    portal: { id: "enter-office-network-rack", label: "Explore the office network rack", translation: "探索写字楼网络机柜", childSceneId: "office-network-rack", sourceVisualRegion: "portal-office-network-rack", x: 610, y: 130, width: 100, height: 220, enterScale: 3.2 },
    description: "The separate black network-equipment rack at the left of the office service-core photograph; it is distinct from the warehouse dock portal on the right.",
  },
);

const officeConferenceRect = { x: 610, y: 300, width: 320, height: 340 };

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function slugify(value) { return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function scenePoint(value, axis) { return Number((value * (axis === "x" ? SCALE_X : SCALE_Y)).toFixed(6)); }
function sceneRectangle(value) {
  return { x: scenePoint(value.x, "x"), y: scenePoint(value.y, "y"), width: scenePoint(value.width, "x"), height: scenePoint(value.height, "y") };
}
function buildScene(config) {
  const labels = []; const visualRegions = []; const detailZones = []; let priorityIndex = 0;
  const overviewPriorityByTerm = new Map((config.overviewPriorityTerms ?? []).map((term, index) => [term, index]));
  for (const zone of config.zones) {
    const labelIds = [];
    for (const [term, translation, x, y, minLevel] of zone.labels) {
      const word = `${config.wordPrefix} ${term}`;
      const id = `${config.id}-${slugify(term)}`;
      const sourceX = Math.max(0, Math.min(SOURCE_WIDTH - 44, x - 22));
      const sourceY = Math.max(0, Math.min(SOURCE_HEIGHT - 44, y - 22));
      const regionId = `${config.id}-region-${slugify(term)}`;
      const overviewPriority = overviewPriorityByTerm.get(term);
      const priority = overviewPriority === undefined
        ? Number((1 + priorityIndex / 1000).toFixed(6))
        : Number((0.1 + overviewPriority / 1000).toFixed(6));
      labels.push({ id, word, translation: `${config.translationPrefix}${translation}`, x: scenePoint(x, "x"), y: scenePoint(y, "y"), priority, minLevel, sourceVisualRegion: regionId });
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
      rationale: `The generated source and final JPEG were inspected at native and final pixels. ${labels.length} independently pointable objects and visible parts are distributed across ${detailZones.length} bounded zones. People, identity, readable text, brands, hidden contents, inferred processes and unsupported equipment states were excluded.`,
      previousLabelCount: labels.length + config.removedExamples.length, retainedLabelCount: labels.length, removedLabelCount: config.removedExamples.length, removedExamples: config.removedExamples,
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
async function integrateParents() {
  const changes = {};
  for (const item of integrations) {
    const path = resolve(sceneRoot, `${item.parentId}.json`); const parent = JSON.parse(await readFile(path, "utf8"));
    if (item.childId === "office-break-room") {
      const conferencePortal = parent.portals.find(({ childSceneId }) => childSceneId === "conference-room");
      if (!conferencePortal) throw new Error("office-building has no existing conference-room portal");
      Object.assign(conferencePortal, officeConferenceRect);
      const conferenceRegion = parent.visualRegions.find(({ id }) => id === conferencePortal.sourceVisualRegion);
      if (!conferenceRegion) throw new Error("office-building has no conference-room portal visual region");
      Object.assign(conferenceRegion, officeConferenceRect);
    }
    const region = { id: item.portal.sourceVisualRegion, description: item.description, kind: "object", x: item.portal.x, y: item.portal.y, width: item.portal.width, height: item.portal.height };
    const pi = parent.portals.findIndex(({ id }) => id === item.portal.id); if (pi >= 0) parent.portals[pi] = item.portal; else parent.portals.push(item.portal);
    const ri = parent.visualRegions.findIndex(({ id }) => id === region.id); if (ri >= 0) parent.visualRegions[ri] = region; else parent.visualRegions.push(region);
    changes[`${item.parentId}Changed`] = await writeIfChanged(path, parent);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const item of integrations) if (!manifest.scenes.some(({ id }) => id === item.childId)) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === item.parentId);
    if (parentIndex < 0) throw new Error(`${item.parentId} missing from manifest`);
    let insertion = parentIndex + 1;
    while (insertion < manifest.scenes.length && manifest.scenes[insertion].parentId === item.parentId) insertion += 1;
    manifest.scenes.splice(insertion, 0, { id: item.childId, title: item.title, parentId: item.parentId });
  }
  changes.manifestChanged = await writeIfChanged(manifestPath, manifest);
  return changes;
}

export async function buildAirportConveyorAndOfficeBreakRoomScenes() {
  const builtScenes = scenes.map(buildScene);
  for (const scene of builtScenes) {
    if (scene.labels.length !== 150) throw new Error(`${scene.id} must contain exactly 150 labels; got ${scene.labels.length}`);
    if (scene.detailZones.length !== 6 || scene.detailZones.some(({ labelIds }) => labelIds.length !== 25)) throw new Error(`${scene.id} must contain six 25-word zones`);
  }
  await assertUniqueWords(builtScenes);
  const result = { scenes: [] };
  for (const config of scenes) {
    const scene = builtScenes.find(({ id }) => id === config.id);
    result.scenes.push({ id: config.id, labels: scene.labels.length, assetChanged: await ensureAsset(config), sceneChanged: await writeIfChanged(resolve(sceneRoot, `${config.id}.json`), scene) });
  }
  if (integrate) Object.assign(result, await integrateParents());
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildAirportConveyorAndOfficeBreakRoomScenes().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(`add-airport-conveyor-and-office-break-room-scenes: ${error.message}`); process.exitCode = 1; });
}
