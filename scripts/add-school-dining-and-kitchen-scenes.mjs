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

const scenes = [
  {
    id: "school-dining-hall",
    title: "School dining hall",
    translation: "学校餐厅",
    subtitle: "Serving, seating, queuing, drinking and self-clearing facilities",
    parentId: "school-corridor",
    source: "scripts/assets/school-dining-hall-v1.png",
    asset: "/scenes/school-dining-hall-premium-v1.jpg",
    sourceSha256: "518edab6a2d96b057dbf51beede6fbc0d56fab97842922db8575c63ca1dda1d1",
    assetSha256: "e29ef77ebb98d7e9c8aa1bee7717d84eb7bdf6b680248e16635d8a957bc70e8a",
    removedExamples: ["meal choice", "food temperature", "payment status", "student identity", "allergen claim", "cleaning state", "written menu", "brand name"],
    zones: [
      {
        id: "left-seating-area", title: "Left seating area", translation: "左侧就餐区",
        description: "Inspect the dining tables, moulded chairs, frames, legs, feet, tabletop edges and clear circulation space.",
        x: 0, y: 430, width: 620, height: 511, targetScale: 2.55,
        labels: [
          ["Dining-hall left table", "餐厅左侧餐桌", 105, 505, 0], ["Dining-hall left tabletop", "餐厅左侧桌面", 115, 495, 1],
          ["Dining-hall left table edge", "餐厅左侧桌边", 155, 525, 3], ["Dining-hall left table leg", "餐厅左侧桌腿", 145, 570, 2],
          ["Dining-hall left chair", "餐厅左侧椅子", 170, 555, 0], ["Dining-hall left chair back", "餐厅左侧椅背", 185, 480, 1],
          ["Dining-hall left chair seat", "餐厅左侧椅座", 175, 565, 2], ["Dining-hall left chair frame", "餐厅左侧椅架", 190, 615, 3],
          ["Foreground dining table", "餐厅前景餐桌", 325, 690, 0], ["Dining-hall foreground tabletop", "餐厅前景桌面", 320, 630, 1],
          ["Foreground table rim", "餐厅前景桌沿", 345, 675, 3], ["Foreground table support", "餐厅前景桌架", 360, 780, 2],
          ["Dining-hall foreground table foot", "餐厅前景桌脚", 270, 900, 4], ["Dining-hall front-left chair", "餐厅左前方椅子", 135, 730, 0],
          ["Dining-hall front-left backrest", "餐厅左前方靠背", 120, 655, 1], ["Dining-hall front-left seat", "餐厅左前方椅座", 150, 755, 2],
          ["Dining-hall front-left tubular leg", "餐厅左前方椅管腿", 95, 845, 3], ["Dining-hall centre-left chair", "餐厅中左椅子", 345, 745, 0],
          ["Dining-hall centre-left backrest", "餐厅中左椅背", 385, 610, 1], ["Dining-hall centre-left seat pan", "餐厅中左椅座板", 355, 745, 2],
          ["Centre-left chair foot", "餐厅中左椅脚", 405, 850, 4], ["Rear-left dining chair", "餐厅左后方椅子", 450, 540, 1],
          ["Dining-hall rear-left handhold", "餐厅左后椅提手", 450, 525, 3], ["Dining-hall seating aisle", "餐厅座位通道", 530, 740, 0],
          ["Seating floor tile", "餐厅座位区地砖", 520, 820, 2],
        ],
      },
      {
        id: "serving-counter", title: "Serving counter", translation: "供餐柜台",
        description: "Explore the serving counter, tray slide, sneeze guard, food pans, crockery, chilled case and service fittings.",
        x: 470, y: 220, width: 780, height: 390, targetScale: 2.65,
        labels: [
          ["School serving counter", "餐厅供餐柜台", 850, 455, 0], ["Dining-hall counter front", "餐厅柜台前板", 830, 500, 1],
          ["Dining-hall counter plinth", "餐厅柜台底座", 830, 560, 3], ["Tray slide rail", "餐厅托盘滑道", 690, 425, 0],
          ["Tray-slide end post", "餐厅托盘滑道端柱", 620, 428, 3], ["Dining-hall sneeze guard", "餐厅挡喷玻璃", 825, 355, 0],
          ["Dining-hall guard glass pane", "餐厅挡喷玻璃窗格", 780, 365, 1], ["Dining-hall guard upright", "餐厅挡喷玻璃立柱", 790, 350, 2],
          ["Dining-hall guard top rail", "餐厅挡喷玻璃顶轨", 790, 330, 3], ["Dining-hall hot-food pan", "餐厅热食盘", 965, 415, 0],
          ["Dining-hall green-vegetable pan", "餐厅绿色蔬菜盘", 885, 405, 1], ["Dining-hall orange-food pan", "餐厅橙色食物盘", 1045, 405, 1],
          ["Dining-hall shallow serving tray", "餐厅浅供餐盘", 735, 410, 2], ["Dining-hall serving bowl", "餐厅供餐碗", 740, 385, 1],
          ["Dining-hall bowl stack", "餐厅碗碟叠", 1130, 430, 0], ["Dining-hall plate stack", "餐厅餐盘叠", 1165, 425, 0],
          ["Dining-hall plate rim", "餐厅餐盘边沿", 1160, 410, 3], ["Dining-hall cup stack", "餐厅杯子叠", 985, 330, 1],
          ["Dining-hall chilled display case", "餐厅冷藏展示柜", 570, 370, 0], ["Dining-hall chilled-case shelf", "餐厅冷藏柜搁板", 570, 385, 2],
          ["Dining-hall chilled-case glass", "餐厅冷藏柜玻璃", 555, 360, 1], ["Dining-hall chilled-case base", "餐厅冷藏柜底座", 570, 430, 3],
          ["Service heat lamp", "餐厅供餐保温灯", 1040, 275, 1], ["Dining-hall heat-lamp shade", "餐厅保温灯灯罩", 1040, 245, 2],
          ["Dining-hall counter end panel", "餐厅柜台端板", 1200, 475, 3],
        ],
      },
      {
        id: "drinks-and-daylight", title: "Drinks and daylight wall", translation: "饮水与采光墙",
        description: "Inspect the windows, radiator, planting, drinks dispenser, cups, tray rack, clock and wall panels.",
        x: 0, y: 120, width: 700, height: 500, targetScale: 2.6,
        labels: [
          ["Dining-hall picture window", "餐厅景观窗", 65, 265, 0], ["Dining-hall window blind", "餐厅窗帘", 75, 175, 1],
          ["Dining-hall window glazing", "餐厅窗玻璃", 75, 300, 2], ["Dining-hall window sill", "餐厅窗台", 70, 395, 2],
          ["Dining-hall window plant", "餐厅窗边盆栽", 52, 355, 0], ["Dining-hall window-plant leaves", "餐厅窗边植物叶片", 52, 330, 3],
          ["Dining-hall wall radiator", "餐厅墙边散热器", 95, 445, 0], ["Dining-hall radiator top grille", "餐厅散热器顶部格栅", 95, 420, 3],
          ["Dining-hall tall indoor plant", "餐厅高大室内植物", 170, 355, 0], ["Dining-hall tall-plant foliage", "餐厅高大植物叶片", 175, 315, 2],
          ["Dining-hall tall-plant pot", "餐厅高大植物花盆", 175, 470, 1], ["Dining-hall beverage dispenser", "餐厅饮料分配机", 285, 375, 0],
          ["Dining-hall beverage nozzle", "餐厅饮料机出液嘴", 285, 365, 2], ["Dining-hall dispenser drip tray", "餐厅饮料机滴水盘", 285, 405, 3],
          ["Dining-hall clear cup stack", "餐厅透明杯叠", 350, 410, 1], ["Dining-hall clear cup rim", "餐厅透明杯口", 350, 390, 4],
          ["Dining-hall drinks cabinet", "餐厅饮水柜", 320, 440, 1], ["Dining-hall mobile tray rack", "餐厅移动托盘架", 430, 430, 0],
          ["Dining-hall tray-rack shelf", "餐厅托盘架搁板", 430, 420, 2], ["Dining-hall tray-rack caster", "餐厅托盘架脚轮", 435, 510, 4],
          ["Dining-hall fruit basket", "餐厅水果篮", 650, 305, 1], ["Dining-hall woven basket rim", "餐厅编织篮边", 650, 305, 3],
          ["Dining-hall wall clock", "餐厅挂钟", 435, 220, 0], ["Dining-hall clock rim", "餐厅挂钟外圈", 435, 220, 3],
          ["Dining-hall blank wall panel", "餐厅空白墙板", 275, 245, 2],
        ],
      },
      {
        id: "queue-and-payment", title: "Queue and payment route", translation: "排队与结算动线",
        description: "Follow the queue stanchions, retractable belts, payment pedestal and open tiled approach to the counter.",
        x: 430, y: 390, width: 760, height: 360, targetScale: 2.65,
        labels: [
          ["Dining-hall left queue post", "餐厅左侧排队柱", 620, 520, 0], ["Dining-hall left post cap", "餐厅左排队柱顶帽", 620, 440, 2],
          ["Dining-hall left post base", "餐厅左排队柱底座", 620, 585, 3], ["Dining-hall centre queue post", "餐厅中央排队柱", 790, 540, 0],
          ["Dining-hall centre post cap", "餐厅中央排队柱顶帽", 790, 450, 2], ["Dining-hall centre post base", "餐厅中央排队柱底座", 790, 615, 3],
          ["Dining-hall right queue post", "餐厅右侧排队柱", 1025, 555, 0], ["Dining-hall right post cap", "餐厅右排队柱顶帽", 1025, 465, 2],
          ["Dining-hall right post base", "餐厅右排队柱底座", 1025, 640, 3], ["Dining-hall front queue belt", "餐厅前排队带", 705, 445, 0],
          ["Dining-hall rear queue belt", "餐厅后排队带", 910, 458, 1], ["Dining-hall belt cassette", "餐厅排队带卷盒", 790, 452, 3],
          ["Dining-hall payment pedestal", "餐厅结算立柱", 1060, 495, 0], ["Dining-hall payment terminal", "餐厅结算终端", 1055, 420, 0],
          ["Dining-hall terminal screen", "餐厅终端屏幕", 1055, 412, 2], ["Dining-hall terminal housing", "餐厅终端外壳", 1055, 425, 3],
          ["Dining-hall terminal support", "餐厅终端支架", 1057, 505, 2], ["Dining-hall terminal base", "餐厅终端底座", 1055, 635, 3],
          ["Dining-hall queue entrance", "餐厅排队入口", 585, 625, 0], ["Dining-hall queue lane", "餐厅排队通道", 820, 560, 0],
          ["Dining-hall counter approach", "餐厅柜台接近区", 940, 520, 1], ["Dining-hall queue floor tile", "餐厅排队区地砖", 835, 680, 2],
          ["Dining-hall floor grout line", "餐厅地砖缝", 925, 660, 4], ["Queue-side open floor", "餐厅排队旁开阔地面", 560, 700, 1],
          ["Dining-hall counter-side aisle", "餐厅柜台侧通道", 1160, 575, 2],
        ],
      },
      {
        id: "kitchen-doorway", title: "Kitchen doorway", translation: "后厨门口",
        description: "Inspect the complete kitchen doorway and the ovens, worktables, sinks, shelving and service route visible beyond it.",
        x: 1_065, y: 185, width: 340, height: 410, targetScale: 2.8,
        labels: [
          ["Dining-hall kitchen doorway", "餐厅后厨门口", 1215, 340, 0], ["Dining-hall kitchen door frame", "餐厅后厨门框", 1205, 245, 1],
          ["Dining-hall kitchen head jamb", "餐厅后厨门上框", 1215, 220, 2], ["Dining-hall kitchen left jamb", "餐厅后厨左门梃", 1100, 350, 2],
          ["Dining-hall kitchen right jamb", "餐厅后厨右门梃", 1355, 350, 2], ["Dining-hall kitchen threshold", "餐厅后厨门槛", 1220, 520, 1],
          ["Dining-hall kitchen reveal", "餐厅后厨门洞内侧", 1125, 320, 3], ["Dining-hall kitchen floor route", "餐厅通往后厨的地面", 1230, 500, 0],
          ["Dining-hall distant deck oven", "餐厅可见远处层炉", 1200, 315, 0], ["Dining-hall distant oven door", "餐厅可见远处烤箱门", 1200, 310, 2],
          ["Dining-hall distant oven handle", "餐厅可见远处烤箱把手", 1200, 300, 3], ["Dining-hall distant oven stand", "餐厅可见远处烤箱架", 1200, 375, 2],
          ["Dining-hall distant worktable", "餐厅可见远处工作台", 1280, 390, 0], ["Dining-hall distant worktop", "餐厅可见远处台面", 1280, 375, 2],
          ["Dining-hall distant table leg", "餐厅可见远处台腿", 1295, 445, 4], ["Dining-hall distant wall shelf", "餐厅可见远处墙架", 1300, 300, 1],
          ["Dining-hall distant stockpot", "餐厅可见远处汤锅", 1320, 310, 1], ["Dining-hall distant pot rim", "餐厅可见远处锅沿", 1320, 300, 4],
          ["Dining-hall distant sink unit", "餐厅可见远处水槽", 1325, 390, 1], ["Dining-hall distant sink faucet", "餐厅可见远处水龙头", 1330, 350, 2],
          ["Dining-hall distant prep counter", "餐厅可见远处备餐台", 1150, 420, 1], ["Dining-hall distant counter shelf", "餐厅可见远处台架", 1150, 445, 3],
          ["Dining-hall kitchen ceiling light", "餐厅后厨天花灯", 1235, 245, 2], ["Dining-hall kitchen wall tile", "餐厅后厨墙砖", 1135, 265, 3],
          ["Dining-hall doorway side wall", "餐厅后厨门侧墙", 1380, 345, 2],
        ],
      },
      {
        id: "self-clearing-station", title: "Self-clearing station", translation: "自助清理区",
        description: "Explore the self-clearing counter, bottle station, crockery shelves, waste containers, planting and nearby table.",
        x: 1_240, y: 230, width: 432, height: 710, targetScale: 2.65,
        labels: [
          ["Dining-hall clearing station", "餐厅自助清理台", 1480, 500, 0], ["Dining-hall clearing countertop", "餐厅清理台面", 1480, 525, 1],
          ["Dining-hall clearing splashback", "餐厅清理台挡板", 1500, 405, 2], ["Dining-hall return aperture", "餐厅餐具回收口", 1530, 520, 0],
          ["Dining-hall return-aperture rim", "餐厅回收口边沿", 1530, 520, 3], ["Dining-hall upper crockery shelf", "餐厅上层餐具架", 1525, 455, 1],
          ["Dining-hall dark bowl stack", "餐厅深色碗叠", 1465, 475, 1], ["Dining-hall white bowl stack", "餐厅白色碗叠", 1585, 480, 1],
          ["Dining-hall bottle group", "餐厅瓶组", 1365, 475, 0], ["Dining-hall dark drinks bottle", "餐厅深色饮料瓶", 1335, 455, 1],
          ["Dining-hall amber drinks bottle", "餐厅琥珀色饮料瓶", 1375, 450, 1], ["Dining-hall clear drinks bottle", "餐厅透明饮料瓶", 1410, 455, 1],
          ["Dining-hall bottle pump", "餐厅瓶泵", 1375, 415, 3], ["Dining-hall black waste bin", "餐厅黑色废物桶", 1365, 640, 0],
          ["Dining-hall black-bin rim", "餐厅黑桶边沿", 1365, 565, 3], ["Dining-hall green recycling bin", "餐厅绿色回收桶", 1460, 650, 0],
          ["Dining-hall recycling-bin rim", "餐厅回收桶边沿", 1460, 565, 3], ["Dining-hall grey waste bin", "餐厅灰色废物桶", 1590, 655, 0],
          ["Dining-hall grey-bin rim", "餐厅灰桶边沿", 1590, 570, 3], ["Dining-hall clearing-station plant", "餐厅清理台旁植物", 1450, 320, 0],
          ["Dining-hall clearing-plant leaf", "餐厅清理台植物叶片", 1450, 285, 3], ["Dining-hall right foreground table", "餐厅右前景餐桌", 1290, 820, 0],
          ["Dining-hall right tabletop", "餐厅右前景桌面", 1300, 760, 1], ["Dining-hall right chair back", "餐厅右前景椅背", 1640, 815, 2],
          ["Dining-hall clearing aisle", "餐厅清理区通道", 1270, 650, 1],
        ],
      },
    ],
  },
  {
    id: "school-catering-kitchen",
    title: "School catering kitchen",
    translation: "学校餐饮后厨",
    subtitle: "Washing, preparation, cooking, cold storage and meal service equipment",
    parentId: "school-dining-hall",
    source: "scripts/assets/school-catering-kitchen-v1.png",
    asset: "/scenes/school-catering-kitchen-premium-v1.jpg",
    sourceSha256: "2dbd6ea7026eecb9f428a3c8cc92718171abf90c5e9d01ffdcc7be5f83971ab7",
    assetSha256: "9ceb221c31c96361341d496e4f199d0e31cb980027a9d8281e9c540079fcc733",
    removedExamples: ["food safety status", "surface cleanliness", "cooking temperature", "ingredient identity", "appliance setting", "staff action", "written label", "brand name"],
    zones: [
      {
        id: "washing-station", title: "Washing station", translation: "清洗区",
        description: "Inspect the pre-rinse spray, sink bowls, drainboards, faucets, splashbacks, dispensers and handwash basin.",
        x: 0, y: 100, width: 600, height: 841, targetScale: 2.6,
        labels: [
          ["Catering-kitchen wash station", "后厨清洗台", 210, 520, 0], ["Catering-kitchen twin sink", "后厨双槽水池", 225, 520, 0],
          ["Catering-kitchen left sink bowl", "后厨左水槽盆", 145, 520, 1], ["Catering-kitchen right sink bowl", "后厨右水槽盆", 285, 520, 1],
          ["Twin-sink rim", "后厨水槽边沿", 225, 500, 3], ["Kitchen drainboard", "后厨沥水板", 360, 520, 0],
          ["Drainboard rib", "后厨沥水板凸纹", 389, 520, 4], ["Pre-rinse spray", "后厨预冲洗喷枪", 120, 220, 0],
          ["Catering-kitchen spray hose", "后厨喷枪软管", 130, 200, 1], ["Catering-kitchen spray head", "后厨喷枪头", 120, 140, 2],
          ["Catering-kitchen spray spring", "后厨喷枪弹簧", 130, 190, 3], ["Catering-kitchen wall faucet", "后厨墙式水龙头", 130, 440, 0],
          ["Catering-kitchen faucet spout", "后厨水龙头出水嘴", 135, 430, 2], ["Catering-kitchen faucet cross handle", "后厨水龙头十字手柄", 105, 460, 3],
          ["Catering-kitchen sink splashback", "后厨水槽挡水板", 245, 420, 1], ["Wall soap dispenser", "后厨皂液器", 300, 285, 0],
          ["Catering-kitchen dispenser window", "后厨皂液器视窗", 300, 285, 3], ["Catering-kitchen wall utility box", "后厨墙面设备盒", 170, 335, 1],
          ["Catering-kitchen wash-table shelf", "后厨清洗台下层架", 245, 650, 1], ["Wash-table leg", "后厨清洗台支腿", 345, 660, 3],
          ["Handwash basin", "后厨洗手盆", 520, 815, 0], ["Catering-kitchen handwash faucet", "后厨洗手盆水龙头", 545, 710, 1],
          ["Catering-kitchen handwash drain", "后厨洗手盆排水口", 525, 805, 4], ["Catering-kitchen handwash splashback", "后厨洗手盆挡水板", 525, 740, 2],
          ["Catering-kitchen wash-zone floor", "后厨清洗区地面", 300, 820, 1],
        ],
      },
      {
        id: "cooking-line", title: "Cooking line", translation: "烹饪区",
        description: "Explore the extraction hood, range, oven, kettle, burner controls, flues, guards and mobile rack.",
        x: 250, y: 0, width: 520, height: 720, targetScale: 2.65,
        labels: [
          ["Commercial extraction hood", "后厨抽油烟罩", 430, 130, 0], ["Extraction canopy", "后厨烟罩顶篷", 430, 110, 1],
          ["Catering-kitchen hood baffle filter", "后厨烟罩挡板滤网", 420, 140, 2], ["Canopy side panel", "后厨烟罩侧板", 620, 145, 3],
          ["Catering-kitchen hood duct", "后厨排风管道", 550, 55, 2], ["Catering-kitchen gas range", "后厨燃气灶", 470, 470, 0],
          ["Catering-kitchen burner grate", "后厨炉头格栅", 455, 410, 1], ["Catering-kitchen burner ring", "后厨炉头环", 455, 405, 3],
          ["Catering-kitchen range control knob", "后厨灶台控制旋钮", 510, 480, 2], ["Catering-kitchen range oven", "后厨灶下烤箱", 470, 555, 0],
          ["Catering-kitchen oven door", "后厨烤箱门", 470, 560, 1], ["Catering-kitchen oven handle", "后厨烤箱把手", 470, 525, 3],
          ["Catering-kitchen range leg", "后厨灶台支腿", 510, 645, 4], ["Catering-kitchen tilting kettle", "后厨可倾式汤锅", 575, 350, 0],
          ["Catering-kitchen kettle lid", "后厨汤锅盖", 565, 315, 1], ["Catering-kitchen kettle handle", "后厨汤锅把手", 560, 300, 3],
          ["Catering-kitchen kettle pouring lip", "后厨汤锅倾倒口", 605, 340, 2], ["Catering-kitchen kettle pivot", "后厨汤锅转轴", 650, 390, 3],
          ["Catering-kitchen kettle drain valve", "后厨汤锅排放阀", 655, 405, 2], ["Catering-kitchen kettle cabinet", "后厨汤锅机柜", 595, 465, 1],
          ["Catering-kitchen tray rack", "后厨托盘车架", 695, 415, 0], ["Catering-kitchen tray-rack rail", "后厨托盘车导轨", 700, 385, 3],
          ["Catering-kitchen tray-rack caster", "后厨托盘车脚轮", 690, 520, 4], ["Catering-kitchen cooking splashguard", "后厨烹饪区防溅板", 360, 390, 2],
          ["Catering-kitchen cooking-line floor", "后厨烹饪区地面", 610, 625, 1],
        ],
      },
      {
        id: "preparation-islands", title: "Preparation islands", translation: "备餐岛台",
        description: "Inspect the preparation tables, colour-coded boards, produce trays, mixer, processor, scales and stored pans.",
        x: 430, y: 350, width: 720, height: 591, targetScale: 2.6,
        labels: [
          ["Catering-kitchen front prep table", "后厨前部备餐台", 730, 660, 0], ["Catering-kitchen front worktop", "后厨前部工作台面", 735, 600, 1],
          ["Catering-kitchen front table edge", "后厨前台面边缘", 735, 670, 3], ["Catering-kitchen wooden chopping board", "后厨木砧板", 650, 590, 0],
          ["Wooden-board front edge", "后厨木砧板前边缘", 650, 635, 3], ["Catering-kitchen green chopping board", "后厨绿色砧板", 815, 610, 0],
          ["Catering-kitchen green-board edge", "后厨绿色砧板边缘", 815, 620, 3], ["Catering-kitchen produce bowl", "后厨蔬果碗", 720, 500, 0],
          ["Catering-kitchen red pepper", "后厨红甜椒", 690, 495, 1], ["Catering-kitchen yellow pepper", "后厨黄甜椒", 720, 490, 1],
          ["Catering-kitchen green pepper", "后厨青甜椒", 740, 500, 1], ["Catering-kitchen leafy-produce tray", "后厨叶菜托盘", 850, 480, 0],
          ["Catering-kitchen lettuce head", "后厨生菜球", 805, 470, 2], ["Catering-kitchen herb bundle", "后厨香草束", 905, 480, 2],
          ["Prep-table under-shelf", "后厨前台下层架", 745, 790, 1], ["Catering-kitchen nested hotel pan", "后厨叠放份数盆", 735, 825, 0],
          ["Catering-kitchen hotel-pan rim", "后厨份数盆边沿", 735, 815, 3], ["Catering-kitchen perforated colander", "后厨带孔滤盆", 870, 800, 0],
          ["Catering-kitchen colander perforation", "后厨滤盆孔", 870, 800, 4], ["Catering-kitchen prep-table caster", "后厨备餐台脚轮", 925, 865, 4],
          ["Catering-kitchen rear prep table", "后厨后部备餐台", 930, 430, 0], ["Catering-kitchen stand mixer", "后厨立式搅拌机", 875, 370, 0],
          ["Catering-kitchen mixer bowl", "后厨搅拌机碗", 875, 415, 1], ["Catering-kitchen food processor", "后厨食物处理机", 960, 420, 1],
          ["Catering-kitchen digital scale", "后厨电子秤", 1080, 450, 0],
        ],
      },
      {
        id: "cold-storage-wall", title: "Cold storage and back wall", translation: "冷藏与后墙",
        description: "Explore the cold-room door, upright chiller, storage rack, containers, stockpots, microwave and cleaning tools.",
        x: 730, y: 120, width: 680, height: 520, targetScale: 2.65,
        labels: [
          ["Catering-kitchen cold-room door", "后厨冷库门", 855, 300, 0], ["Catering-kitchen cold-room frame", "后厨冷库门框", 850, 260, 1],
          ["Catering-kitchen cold-room vision panel", "后厨冷库门观察窗", 860, 270, 0], ["Cold-room window gasket", "冷库门窗密封胶条", 860, 270, 2],
          ["Catering-kitchen cold-room lever", "后厨冷库门执手", 810, 360, 2], ["Catering-kitchen cold-room threshold", "后厨冷库门槛", 855, 485, 3],
          ["Catering-kitchen cold-room jamb", "后厨冷库门梃", 930, 330, 3], ["Catering-kitchen cleaning-tool rail", "后厨清洁工具挂轨", 985, 330, 0],
          ["Catering-kitchen blue floor squeegee", "后厨蓝色刮水器", 980, 360, 1], ["Catering-kitchen yellow broom", "后厨黄色扫帚", 1010, 355, 1],
          ["Catering-kitchen tool hook", "后厨工具挂钩", 985, 285, 4], ["Catering-kitchen first-aid box", "后厨急救箱", 1020, 220, 0],
          ["Catering-kitchen storage rack", "后厨储物架", 1135, 320, 0], ["Catering-kitchen upper stockpot", "后厨上层汤锅", 1080, 225, 1],
          ["Catering-kitchen stockpot lid", "后厨汤锅盖", 1080, 215, 3], ["Catering-kitchen food-storage tub", "后厨食品储存盒", 1090, 300, 1],
          ["Catering-kitchen tub lid", "后厨储存盒盖", 1090, 285, 3], ["Catering-kitchen microwave oven", "后厨微波炉", 1185, 350, 0],
          ["Catering-kitchen microwave window", "后厨微波炉视窗", 1180, 350, 2], ["Catering-kitchen mixing-bowl stack", "后厨搅拌碗叠", 1180, 420, 1],
          ["Catering-kitchen upright chiller", "后厨立式冷藏柜", 1300, 330, 0], ["Catering-kitchen chiller door", "后厨冷藏柜门", 1323, 337, 1],
          ["Catering-kitchen chiller handle", "后厨冷藏柜把手", 1265, 360, 3], ["Catering-kitchen chiller caster", "后厨冷藏柜脚轮", 1300, 525, 4],
          ["Catering-kitchen grey waste container", "后厨灰色废物容器", 1225, 470, 1],
        ],
      },
      {
        id: "meal-service-pass", title: "Meal service pass", translation: "传菜与供餐区",
        description: "Inspect the dining-room opening, heated serving counter, food wells, insulated carrier and service lighting.",
        x: 1_225, y: 80, width: 447, height: 580, targetScale: 2.7,
        labels: [
          ["Catering-kitchen dining-room opening", "后厨餐厅连通口", 1540, 260, 0], ["Catering-kitchen service opening frame", "后厨传菜口框", 1530, 220, 1],
          ["Catering-kitchen opening head", "后厨传菜口上框", 1530, 120, 2], ["Catering-kitchen opening left jamb", "后厨传菜口左门梃", 1425, 285, 2],
          ["Catering-kitchen opening right jamb", "后厨传菜口右门梃", 1660, 285, 2], ["Catering-kitchen dining-hall glimpse", "后厨可见餐厅", 1550, 300, 0],
          ["Catering-kitchen distant dining chair", "后厨可见餐椅", 1540, 350, 1], ["Catering-kitchen distant dining table", "后厨可见餐桌", 1510, 320, 1],
          ["Dining-room pendant light", "餐厅吊灯", 1535, 190, 0], ["Pendant-light shade", "吊灯灯罩", 1535, 205, 2],
          ["Catering-kitchen serving counter", "后厨供餐柜台", 1510, 470, 0], ["Catering-kitchen counter top rail", "后厨供餐台顶轨", 1510, 405, 2],
          ["Catering-kitchen heated food well", "后厨加热食物槽", 1525, 410, 0], ["Catering-kitchen orange-food pan", "后厨橙色食物盘", 1480, 400, 1],
          ["Catering-kitchen green-food pan", "后厨绿色食物盘", 1560, 410, 1], ["Catering-kitchen food-pan divider", "后厨食物盘分隔板", 1540, 410, 3],
          ["Catering-kitchen counter support", "后厨供餐台支架", 1515, 510, 2], ["Catering-kitchen counter wheel", "后厨供餐台脚轮", 1600, 545, 4],
          ["Catering-kitchen blue insulated carrier", "后厨蓝色保温运输箱", 1375, 460, 0], ["Catering-kitchen carrier door", "后厨保温箱门", 1357, 458, 1],
          ["Catering-kitchen carrier latch", "后厨保温箱门扣", 1330, 445, 3], ["Catering-kitchen carrier hinge", "后厨保温箱铰链", 1420, 445, 4],
          ["Catering-kitchen carrier caster", "后厨保温箱脚轮", 1380, 545, 4], ["Catering-kitchen service-side floor", "后厨传菜区地面", 1460, 600, 1],
          ["Catering-kitchen tiled opening wall", "后厨传菜口瓷砖墙", 1450, 120, 2],
        ],
      },
      {
        id: "mobile-storage-and-utilities", title: "Mobile storage and utilities", translation: "移动储存与公用设施",
        description: "Follow the service trolley, plates, covered pans, waste bins, floor drain, table shelves and utility fittings.",
        x: 0, y: 300, width: 1_672, height: 641, targetScale: 2.45,
        labels: [
          ["Catering-kitchen service trolley", "后厨服务推车", 1425, 720, 0], ["Catering-kitchen trolley top shelf", "后厨推车顶层板", 1425, 610, 1],
          ["Catering-kitchen trolley middle shelf", "后厨推车中层板", 1425, 710, 1], ["Catering-kitchen trolley lower shelf", "后厨推车下层板", 1425, 850, 1],
          ["Catering-kitchen trolley push rail", "后厨推车推杆", 1285, 620, 2], ["Catering-kitchen trolley front caster", "后厨推车前脚轮", 1265, 900, 4],
          ["Catering-kitchen trolley rear caster", "后厨推车后脚轮", 1600, 905, 4], ["Catering-kitchen white plate stack", "后厨白色餐盘叠", 1350, 720, 0],
          ["Catering-kitchen cream plate stack", "后厨米色餐盘叠", 1460, 720, 0], ["Catering-kitchen plate-stack rim", "后厨餐盘叠边沿", 1360, 710, 3],
          ["Catering-kitchen bread-roll pan", "后厨面包卷盘", 1360, 825, 0], ["Catering-kitchen bread roll", "后厨面包卷", 1360, 820, 2],
          ["Catering-kitchen covered service pan", "后厨带盖供餐盘", 1515, 830, 0], ["Catering-kitchen service-pan lid", "后厨供餐盘盖", 1515, 815, 3],
          ["Catering-kitchen green-lid waste bin", "后厨绿盖废物桶", 70, 690, 0], ["Catering-kitchen green bin lid", "后厨绿色桶盖", 75, 625, 2],
          ["Catering-kitchen blue-lid waste bin", "后厨蓝盖废物桶", 45, 800, 0], ["Catering-kitchen blue bin lid", "后厨蓝色桶盖", 45, 745, 2],
          ["Catering-kitchen waste-bin liner", "后厨垃圾桶内衬", 75, 665, 3], ["Catering-kitchen waste-bin caster", "后厨垃圾桶脚轮", 105, 880, 4],
          ["Catering-kitchen floor drain", "后厨地漏", 1025, 860, 0], ["Catering-kitchen drain grate", "后厨地漏格栅", 1025, 852, 3],
          ["Catering-kitchen floor cove", "后厨地墙弧形接缝", 1220, 580, 2], ["Catering-kitchen stainless backsplash panel", "后厨不锈钢挡水板", 350, 340, 2],
          ["Catering-kitchen utility circulation lane", "后厨公用通行道", 1110, 750, 1],
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
    parentId: "school-corridor", childId: "school-dining-hall", title: "School dining hall",
    portal: { id: "enter-school-dining-hall", label: "Enter the school dining hall", translation: "进入学校餐厅", childSceneId: "school-dining-hall", sourceVisualRegion: "portal-school-dining-hall", x: 690, y: 295, width: 270, height: 295, enterScale: 3.2 },
    description: "Complete open double doorway with dining tables visibly continuing beyond the corridor",
  },
  {
    parentId: "school-dining-hall", childId: "school-catering-kitchen", title: "School catering kitchen",
    portal: { id: "enter-school-catering-kitchen", label: "Enter the catering kitchen", translation: "进入学校餐饮后厨", childSceneId: "school-catering-kitchen", sourceVisualRegion: "portal-school-catering-kitchen", x: 1_045, y: 205, width: 260, height: 305, enterScale: 3.25 },
    description: "Complete open kitchen doorway behind the serving counter with commercial equipment clearly visible",
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

function applyIntegrationsToBuiltScenes(builtScenes) {
  for (const item of integrations) {
    const parent = builtScenes.find(({ id }) => id === item.parentId);
    if (!parent) continue;
    const region = { id: item.portal.sourceVisualRegion, description: item.description, kind: "object", x: item.portal.x, y: item.portal.y, width: item.portal.width, height: item.portal.height };
    const pi = parent.portals.findIndex(({ id }) => id === item.portal.id); if (pi >= 0) parent.portals[pi] = item.portal; else parent.portals.push(item.portal);
    const ri = parent.visualRegions.findIndex(({ id }) => id === region.id); if (ri >= 0) parent.visualRegions[ri] = region; else parent.visualRegions.push(region);
  }
}

export async function buildSchoolDiningAndKitchenScenes() {
  const builtScenes = scenes.map(buildScene);
  if (integrate) applyIntegrationsToBuiltScenes(builtScenes);
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
  buildSchoolDiningAndKitchenScenes().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(`add-school-dining-and-kitchen-scenes: ${error.message}`); process.exitCode = 1; });
}
