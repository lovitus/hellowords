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

const officeConferenceRect = { x: 610, y: 300, width: 320, height: 340 };

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
    for (const [term, translation, x, y, minLevel] of zone.labels) {
      const word = `${config.wordPrefix} ${term}`;
      const id = `${config.id}-${slugify(term)}`;
      const sourceX = Math.max(0, Math.min(SOURCE_WIDTH - 44, x - 22));
      const sourceY = Math.max(0, Math.min(SOURCE_HEIGHT - 44, y - 22));
      const regionId = `${config.id}-region-${slugify(term)}`;
      labels.push({ id, word, translation: `${config.translationPrefix}${translation}`, x: scenePoint(x, "x"), y: scenePoint(y, "y"), priority: Number((1 + priorityIndex / 1000).toFixed(6)), minLevel, sourceVisualRegion: regionId });
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
