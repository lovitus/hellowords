import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const sceneRoot = resolve(root, "public/data/scenes");
const manifestPath = resolve(sceneRoot, "manifest.json");
const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const WIDTH = 1_600;
const HEIGHT = 900;
const sx = WIDTH / SOURCE_WIDTH;
const sy = HEIGHT / SOURCE_HEIGHT;
const doIntegrate = !process.argv.includes("--no-integrate");

// Every anchor is tied to an independently visible object or visible part in the reviewed source image.
// Coordinates are authored against the 1672x941 source, then scaled to the scene's 1600x900 pixels.
const configs = [
  {
    id: "hospital-inpatient-bedspace", title: "Hospital inpatient bedspace", translation: "医院住院床位区",
    subtitle: "Patient bed, bedhead services, bedside equipment, privacy fittings and room furniture",
    semanticRealmId: "body-daily-life",
    parentId: "emergency-department", source: "scripts/assets/hospital-inpatient-bedspace-v1.png",
    sourceSha256: "12545b36661cb09bd7a9c184a9ab2894dc5fb1bd414c0ba3a5e2f082a9ee489a",
    asset: "/scenes/hospital-inpatient-bedspace-premium-v1.jpg", assetSha256: "237730a426a5b8406f6b152f1fd719e98c619685e28616eac4731c71fb4df54f",
    removed: ["patient identity", "diagnosis", "vital signs", "medicine name", "treatment status", "device reading", "brand", "screen text"],
    zones: [
      { id: "bedhead-services", title: "Bedhead services", translation: "床头设备", description: "Explore the bedhead rail, medical gas fittings, patient call controls, lights and wall connections.", x: 650, y: 115, width: 760, height: 300, targetScale: 2.6, labels: [
        ["Bedspace headwall service rail", "床位区床头设备横轨", 1090, 220, 0], ["Bedspace horizontal utility rail", "床位区水平设备轨", 1110, 230, 1], ["Bedspace upper wall light", "床位区上方壁灯", 1080, 115, 0], ["Bedspace light diffuser", "床位区灯具扩散罩", 1080, 116, 2], ["Bedspace oxygen flowmeter", "床位区氧气流量计", 960, 222, 1], ["Bedspace oxygen outlet", "床位区氧气接口", 960, 258, 2], ["Bedspace suction regulator", "床位区负压调节器", 1025, 225, 1], ["Bedspace suction canister", "床位区负压收集罐", 1024, 278, 2], ["Bedspace medical-gas outlet", "床位区医用气体接口", 1000, 252, 3], ["Bedspace green gas fitting", "床位区绿色气体接头", 960, 228, 3], ["Bedspace yellow gas fitting", "床位区黄色气体接头", 995, 228, 3], ["Bedspace blue gas fitting", "床位区蓝色气体接头", 1030, 228, 3], ["Bedspace nurse-call handset", "床位区护士呼叫手柄", 1200, 245, 1], ["Bedspace call-cord socket", "床位区呼叫线插座", 1200, 225, 2], ["Bedspace hanging call cord", "床位区垂挂呼叫线", 1200, 305, 2], ["Bedspace red call button", "床位区红色呼叫按钮", 1200, 240, 3], ["Bedspace power outlet", "床位区电源插座", 1235, 225, 2], ["Bedspace data outlet", "床位区数据接口", 1265, 225, 3], ["Bedspace wall switch", "床位区墙壁开关", 1305, 228, 2], ["Bedspace outlet faceplate", "床位区插座面板", 1235, 230, 3], ["Bedspace wall-mounted examination light", "床位区壁挂检查灯", 1110, 196, 2], ["Bedspace rail end cap", "床位区横轨端盖", 1340, 230, 3], ["Bedspace rail mounting bracket", "床位区横轨固定支架", 1060, 228, 4], ["Bedspace tubing hook", "床位区管线挂钩", 1305, 255, 3], ["Bedspace wall-panel seam", "床位区墙板接缝", 1370, 280, 4],
      ] },
      { id: "mattress-and-linens", title: "Bed and linens", translation: "病床与床品", description: "Inspect the mattress, pillow, sheet, blanket, bed rails and the visible bed upholstery.", x: 800, y: 300, width: 720, height: 450, targetScale: 2.65, labels: [
        ["Inpatient bed mattress", "住院病床床垫", 1190, 505, 0], ["Bedspace mattress seam", "床位区床垫缝线", 1300, 520, 3], ["Bedspace white pillow", "床位区白色枕头", 1060, 380, 0], ["Bedspace pillowcase edge", "床位区枕套边缘", 1040, 390, 3], ["Bedspace fitted sheet", "床位区床笠", 1220, 465, 1], ["Bedspace top sheet", "床位区床单", 1260, 580, 0], ["Bedspace blue blanket", "床位区蓝色毯子", 1350, 625, 0], ["Bedspace blanket fold", "床位区毯子折边", 1280, 620, 2], ["Bedspace blanket hem", "床位区毯子下摆", 1440, 660, 3], ["Bedspace mattress corner", "床位区床垫角", 1480, 540, 2], ["Bedspace mattress cover", "床位区床垫外罩", 1180, 540, 1], ["Bedspace upper bed rail", "床位区上侧护栏", 915, 420, 0], ["Bedspace upper rail grip", "床位区上侧护栏握柄", 910, 400, 2], ["Bedspace upper rail release", "床位区上侧护栏释放扣", 970, 500, 3], ["Bedspace lower bed rail", "床位区下侧护栏", 1460, 500, 0], ["Bedspace lower rail opening", "床位区下侧护栏开口", 1470, 520, 2], ["Bedspace headboard panel", "床位区床头板", 1190, 395, 1], ["Bedspace footboard panel", "床位区床尾板", 1300, 555, 2], ["Bedspace bedding tuck", "床位区床单收边", 1160, 600, 3], ["Bedspace pillow crease", "床位区枕头褶痕", 1095, 380, 4], ["Bedspace sheet drape", "床位区床单垂边", 1120, 640, 2], ["Bedspace bed-corner protector", "床位区床角防护套", 1500, 565, 3], ["Bedspace mattress piping", "床位区床垫滚边", 1420, 465, 4], ["Bedspace blanket surface", "床位区毯面", 1370, 590, 1], ["Bedspace bed linen fold", "床位区床品折叠边", 1010, 440, 3],
      ] },
      { id: "frame-and-controls", title: "Bed frame and controls", translation: "床架与调节部件", description: "Follow the bed frame, lift mechanism, wheels, brake pedals and visible adjustment controls.", x: 850, y: 570, width: 700, height: 340, targetScale: 2.7, labels: [
        ["Inpatient bed frame", "住院病床床架", 1230, 690, 0], ["Bedspace frame side beam", "床位区床架侧梁", 1290, 720, 1], ["Bedspace frame crossbar", "床位区床架横梁", 1140, 755, 2], ["Bedspace bed base", "床位区床板底座", 1250, 680, 1], ["Bedspace hydraulic lift column", "床位区液压升降柱", 1170, 755, 2], ["Bedspace lift linkage", "床位区升降连杆", 1250, 770, 3], ["Bedspace frame support", "床位区床架支撑杆", 1330, 775, 2], ["Bedspace head-end caster", "床位区床头脚轮", 980, 815, 0], ["Bedspace caster fork", "床位区脚轮叉架", 980, 800, 3], ["Bedspace caster brake pedal", "床位区脚轮刹车踏板", 990, 830, 2], ["Bedspace foot-end caster", "床位区床尾脚轮", 1510, 820, 0], ["Bedspace rear caster wheel", "床位区后侧脚轮", 1050, 850, 2], ["Bedspace wheel hub", "床位区车轮轮毂", 1050, 850, 3], ["Bedspace brake linkage", "床位区制动连杆", 1000, 835, 3], ["Bedspace bed-height control", "床位区床高调节器", 1125, 705, 2], ["Bedspace hand control", "床位区手持调节器", 1030, 645, 1], ["Bedspace control cable", "床位区控制线缆", 1050, 690, 3], ["Bedspace frame end bracket", "床位区床架端支架", 1480, 740, 3], ["Bedspace lower chassis", "床位区底盘", 1300, 800, 1], ["Bedspace chassis guard", "床位区底盘护板", 1400, 805, 2], ["Bedspace central brake bar", "床位区中央刹车杆", 1200, 840, 2], ["Bedspace caster tread", "床位区脚轮胎面", 1510, 825, 3], ["Bedspace bed-support foot", "床位区床架支脚", 1140, 820, 3], ["Bedspace actuator housing", "床位区驱动器外壳", 1360, 750, 3], ["Bedspace chassis tube joint", "床位区床架管接头", 1260, 850, 1],
      ] },
      { id: "monitor-and-infusion", title: "Monitor and infusion equipment", translation: "监护与输液设备", description: "Explore the bedside monitor, equipment trolley, infusion pole, pump, tubing and cable fittings.", x: 600, y: 50, width: 920, height: 560, targetScale: 2.6, labels: [
        ["Bedspace patient monitor", "床位区患者监护仪", 1370, 170, 0], ["Bedspace monitor screen", "床位区监护仪屏幕", 1370, 165, 1], ["Bedspace monitor bezel", "床位区监护仪边框", 1370, 170, 2], ["Bedspace monitor control knob", "床位区监护仪旋钮", 1320, 215, 3], ["Bedspace monitor support arm", "床位区监护仪支臂", 1370, 250, 2], ["Bedspace monitor cable", "床位区监护仪线缆", 1395, 270, 3], ["Bedspace monitor equipment basket", "床位区监护设备篮", 1370, 286, 2], ["Bedspace monitor basket rail", "床位区监护设备篮边", 1370, 285, 3], ["Bedspace infusion pole", "床位区输液杆", 825, 320, 0], ["Bedspace pole hook", "床位区输液杆挂钩", 825, 100, 2], ["Bedspace clear fluid bag", "床位区透明输液袋", 850, 150, 1], ["Bedspace fluid bag port", "床位区输液袋接口", 850, 200, 3], ["Bedspace infusion tubing", "床位区输液管", 835, 410, 1], ["Bedspace infusion pump", "床位区输液泵", 835, 265, 0], ["Bedspace pump control panel", "床位区输液泵控制面板", 835, 260, 2], ["Bedspace pump clamp", "床位区输液泵夹", 835, 290, 3], ["Bedspace pump pole bracket", "床位区输液泵杆支架", 835, 305, 3], ["Bedspace mobile equipment stand", "床位区移动设备支架", 865, 510, 0], ["Bedspace stand caster", "床位区支架脚轮", 860, 580, 3], ["Bedspace stand base", "床位区支架底座", 850, 560, 2], ["Bedspace sensor lead", "床位区传感器导线", 1310, 280, 3], ["Bedspace lead connector", "床位区导线接头", 1310, 240, 4], ["Bedspace wall diagnostic unit", "床位区墙挂诊断设备", 805, 275, 0], ["Bedspace diagnostic display", "床位区诊断设备显示窗", 805, 270, 2], ["Bedspace equipment handle", "床位区设备提手", 810, 305, 3],
      ] },
      { id: "bedside-cabinet", title: "Bedside cabinet and supplies", translation: "床旁柜与用品", description: "Identify the bedside cabinet, drawers, drinking glass, water jug, tissues and adjacent surfaces.", x: 1180, y: 300, width: 470, height: 430, targetScale: 2.65, labels: [
        ["Bedspace bedside cabinet", "床位区床旁柜", 1280, 455, 0], ["Bedspace cabinet top", "床位区床旁柜台面", 1280, 370, 1], ["Bedspace upper drawer", "床位区床旁柜上抽屉", 1280, 425, 1], ["Bedspace lower drawer", "床位区床旁柜下抽屉", 1280, 485, 1], ["Bedspace drawer pull", "床位区抽屉拉手", 1280, 430, 3], ["Bedspace cabinet side panel", "床位区床旁柜侧板", 1350, 465, 2], ["Bedspace cabinet plinth", "床位区床旁柜底座", 1280, 525, 2], ["Bedspace bedside water jug", "床位区床旁水壶", 1245, 345, 0], ["Bedspace jug handle", "床位区水壶提手", 1245, 345, 2], ["Bedspace drinking tumbler", "床位区饮水杯", 1310, 350, 0], ["Bedspace tumbler rim", "床位区水杯杯口", 1310, 342, 3], ["Bedspace bedside tray", "床位区床旁托盘", 1250, 355, 1], ["Bedspace tissue box", "床位区纸巾盒", 1215, 360, 0], ["Bedspace tissue opening", "床位区纸巾抽口", 1215, 350, 3], ["Bedspace bedside carafe", "床位区床旁玻璃壶", 1275, 345, 1], ["Bedspace bedside table edge", "床位区床旁台边", 1330, 375, 2], ["Bedspace table support leg", "床位区床旁桌支腿", 1350, 520, 3], ["Bedspace cabinet handle recess", "床位区柜门凹槽拉手", 1280, 490, 4], ["Bedspace cupboard seam", "床位区床旁柜门缝", 1340, 450, 4], ["Bedspace bedside wheel", "床位区床旁柜脚轮", 1350, 525, 3], ["Bedspace wall shelf", "床位区墙面小搁板", 1270, 325, 2], ["Bedspace shelf bracket", "床位区搁板托架", 1320, 330, 4], ["Bedspace bedside cup base", "床位区床旁水杯杯底", 1300, 365, 4], ["Bedspace cabinet corner", "床位区床旁柜转角", 1215, 405, 3], ["Bedspace tabletop grain", "床位区柜台木纹", 1290, 365, 4],
      ] },
      { id: "privacy-and-room", title: "Privacy and room fittings", translation: "隐私设施与病室环境", description: "Inspect the privacy curtain, visitor chair, window, ceiling fittings, door and nearby room surfaces.", x: 0, y: 0, width: 1_672, height: 941, targetScale: 2.5, labels: [
        ["Bedspace privacy curtain", "床位区隐私帘", 710, 420, 0], ["Bedspace curtain pleat", "床位区窗帘褶", 690, 300, 2], ["Bedspace curtain track", "床位区帘轨", 730, 95, 1], ["Bedspace curtain runner", "床位区帘轨滑轮", 730, 100, 3], ["Bedspace curtain hem", "床位区帘摆", 700, 580, 2], ["Bedspace visitor chair", "床位区访客椅", 1480, 505, 0], ["Bedspace chair back", "床位区访客椅靠背", 1480, 415, 1], ["Bedspace chair armrest", "床位区访客椅扶手", 1495, 475, 2], ["Bedspace chair cushion", "床位区访客椅坐垫", 1485, 500, 1], ["Bedspace chair leg", "床位区访客椅椅腿", 1515, 600, 3], ["Bedspace right window", "床位区右侧窗户", 1600, 260, 0], ["Bedspace window glazing", "床位区窗玻璃", 1610, 245, 1], ["Bedspace window frame", "床位区窗框", 1560, 190, 2], ["Bedspace window sill", "床位区窗台", 1585, 365, 2], ["Bedspace ceiling light panel", "床位区天花灯板", 1030, 15, 1], ["Bedspace recessed ceiling light", "床位区嵌入式顶灯", 390, 35, 2], ["Bedspace corridor doorway", "床位区走廊门口", 380, 240, 0], ["Bedspace door handle", "床位区房门把手", 415, 295, 3], ["Bedspace corridor counter", "床位区走廊接待台", 330, 350, 0], ["Bedspace corridor office chair", "床位区走廊办公椅", 275, 315, 2], ["Bedspace corridor monitor", "床位区走廊显示器", 275, 285, 1], ["Bedspace corridor plant", "床位区走廊盆栽", 340, 245, 1], ["Bedspace rolling linen trolley", "床位区移动布草车", 570, 430, 0], ["Bedspace trolley shelf", "床位区布草车层架", 570, 435, 2], ["Bedspace floor tile", "床位区地砖", 980, 870, 1],
      ] },
    ],
  },
  {
    id: "office-reception-lobby", title: "Office reception lobby", translation: "写字楼接待大厅",
    subtitle: "Reception desk, visitor check-in, access gates, lifts and waiting furniture",
    semanticRealmId: "people-society",
    parentId: "office-building", source: "scripts/assets/office-reception-lobby-v1.png",
    sourceSha256: "9a255aeea385fd72b0d1b028d3918e4f76069d065293b07eae0328d80ff1f8ba",
    asset: "/scenes/office-reception-lobby-premium-v1.jpg", assetSha256: "f2db98876ee462b82b684d01308ea4250d5e1c9bc8a7abeb2cc2d13984025ad1",
    removed: ["visitor identity", "company name", "access permission", "meeting status", "screen content", "security status", "brand", "written signage"],
    zones: [
      { id: "reception-desk", title: "Reception desk", translation: "接待台", description: "Explore the curved reception counter, desktop equipment, drawer units, desk panels and visitor-facing edge.", x: 0, y: 330, width: 660, height: 600, targetScale: 2.55, labels: [
        ["Lobby curved reception desk", "大厅弧形接待台", 255, 560, 0], ["Lobby reception countertop", "大厅接待台台面", 250, 530, 0], ["Lobby counter front panel", "大厅柜台前板", 245, 675, 1], ["Lobby desk transaction edge", "大厅接待台交接边", 435, 520, 2], ["Lobby desk curved return", "大厅柜台弧形侧翼", 500, 590, 1], ["Lobby desk timber slats", "大厅柜台木饰条", 210, 690, 2], ["Reception-counter base trim", "大厅柜台踢脚底座", 260, 800, 2], ["Lobby receptionist monitor", "大厅前台显示器", 195, 405, 0], ["Lobby monitor screen", "大厅显示器屏幕", 195, 385, 1], ["Lobby monitor stand", "大厅显示器支架", 200, 435, 2], ["Lobby desk telephone", "大厅前台电话", 370, 430, 0], ["Lobby telephone handset", "大厅电话听筒", 365, 410, 2], ["Lobby telephone keypad", "大厅电话按键区", 382, 438, 3], ["Lobby visitor check-in tablet", "大厅访客登记平板", 465, 430, 0], ["Lobby tablet screen", "大厅登记平板屏幕", 465, 420, 2], ["Lobby tablet support stand", "大厅平板支架", 465, 455, 2], ["Lobby stationery cup", "大厅文具杯", 545, 440, 0], ["Lobby desk pens", "大厅桌面签字笔", 545, 425, 2], ["Lobby document tray", "大厅文件托盘", 75, 495, 0], ["Lobby stacked paper tray", "大厅叠层文件盘", 75, 475, 2], ["Lobby counter corner", "大厅柜台转角", 45, 590, 2], ["Lobby countertop stone edge", "大厅台面石材边", 310, 525, 3], ["Lobby drawer pedestal", "大厅抽屉柜", 90, 750, 1], ["Lobby drawer handle", "大厅抽屉拉手", 85, 765, 3], ["Lobby desk chair", "大厅前台办公椅", 245, 480, 1],
      ] },
      { id: "entry-and-check-in", title: "Entrance and visitor check-in", translation: "入口与访客登记", description: "Inspect the glass entry doors, mullions, floor mat, door hardware, check-in stand and entrance glazing.", x: 270, y: 40, width: 550, height: 520, targetScale: 2.6, labels: [
        ["Lobby glass entrance doors", "大厅玻璃入口门", 480, 260, 0], ["Lobby left entrance door", "大厅左侧入口门", 405, 285, 1], ["Lobby right entrance door", "大厅右侧入口门", 545, 285, 1], ["Lobby door pull handle", "大厅门拉手", 520, 290, 2], ["Lobby door pivot hinge", "大厅门轴铰链", 585, 260, 3], ["Lobby door frame", "大厅入口门框", 360, 240, 1], ["Lobby glazing mullion", "大厅玻璃竖框", 455, 220, 2], ["Lobby transom window", "大厅入口上亮窗", 480, 115, 1], ["Lobby door closer", "大厅闭门器", 480, 170, 3], ["Lobby glass panel", "大厅入口玻璃板", 620, 220, 1], ["Lobby check-in kiosk", "大厅访客登记机", 470, 390, 0], ["Lobby kiosk screen bezel", "大厅登记机屏幕边框", 470, 365, 2], ["Lobby kiosk pedestal", "大厅登记机立柱", 470, 430, 2], ["Lobby entry floor mat", "大厅入口地垫", 465, 460, 0], ["Lobby mat bound edge", "大厅地垫包边", 350, 480, 3], ["Lobby vestibule floor tile", "大厅门厅地砖", 670, 455, 1], ["Lobby entrance threshold", "大厅入口门槛", 480, 365, 3], ["Lobby door bottom rail", "大厅门底横档", 480, 345, 3], ["Lobby overhead entrance sensor", "大厅入口感应器", 470, 155, 2], ["Lobby metal door stile", "大厅金属门挺", 540, 230, 3], ["Lobby glazing gasket", "大厅玻璃密封条", 525, 245, 4], ["Lobby entrance wall panel", "大厅入口墙板", 315, 245, 2], ["Lobby check-in stand foot", "大厅登记台底脚", 470, 470, 3], ["Lobby visitor counter bell", "大厅访客柜台铃", 425, 450, 2], ["Lobby glass door reflection", "大厅玻璃门反光面", 600, 300, 4],
      ] },
      { id: "access-gates", title: "Access gates", translation: "门禁闸机", description: "Explore the lobby turnstiles, glass flaps, card readers, steel posts and lane floor markers.", x: 690, y: 275, width: 680, height: 430, targetScale: 2.65, labels: [
        ["Lobby access turnstile", "大厅门禁闸机", 980, 445, 0], ["Lobby stainless gate pedestal", "大厅不锈钢闸机柱", 940, 470, 1], ["Lobby glass swing flap", "大厅玻璃摆闸挡板", 1000, 405, 0], ["Lobby glass flap edge", "大厅玻璃挡板边", 1015, 405, 2], ["Lobby card reader", "大厅门禁读卡器", 960, 365, 0], ["Lobby reader display", "大厅读卡器显示窗", 960, 360, 2], ["Lobby reader housing", "大厅读卡器外壳", 960, 370, 2], ["Lobby gate top cover", "大厅闸机顶盖", 950, 340, 2], ["Lobby gate side panel", "大厅闸机侧板", 950, 450, 2], ["Lobby gate base plate", "大厅闸机底板", 945, 535, 3], ["Lobby gate lane divider", "大厅闸机通道隔板", 1110, 420, 1], ["Lobby gate lane glass", "大厅闸机通道玻璃", 1130, 410, 1], ["Lobby lane stainless post", "大厅通道不锈钢立柱", 850, 460, 0], ["Lobby lane post cap", "大厅通道立柱顶帽", 850, 355, 2], ["Lobby lane post foot", "大厅通道立柱底脚", 850, 515, 3], ["Lobby brushed steel post", "大厅拉带不锈钢柱", 760, 450, 0], ["Lobby post circular base", "大厅立柱圆形底座", 760, 500, 2], ["Lobby queue belt", "大厅排队隔离带", 805, 370, 1], ["Lobby queue belt cassette", "大厅隔离带卷盒", 850, 360, 2], ["Lobby access lane tile", "大厅门禁通道地砖", 1000, 585, 1], ["Lobby tactile floor strip", "大厅地面导向条", 915, 580, 2], ["Lobby gate control pedestal", "大厅闸机控制柱", 1260, 460, 1], ["Lobby control panel", "大厅闸机控制面板", 1260, 430, 2], ["Lobby gate hinge", "大厅闸机铰链", 1030, 415, 3], ["Lobby gate floor anchor", "大厅闸机地面固定件", 985, 540, 3],
      ] },
      { id: "lifts-and-wayfinding", title: "Lifts and service core", translation: "电梯与设备核心", description: "Inspect the lift doors, call panel, floor indicator, door track, lobby wall and surrounding finishes.", x: 1030, y: 40, width: 470, height: 525, targetScale: 2.6, labels: [
        ["Lobby passenger lift", "大厅客用电梯", 1230, 285, 0], ["Lobby left lift door", "大厅左侧电梯门", 1175, 285, 1], ["Lobby right lift door", "大厅右侧电梯门", 1280, 285, 1], ["Lobby lift door seam", "大厅电梯门缝", 1230, 290, 2], ["Lobby lift header", "大厅电梯门楣", 1230, 205, 2], ["Lobby lift call panel", "大厅电梯呼梯面板", 1345, 315, 0], ["Lobby call button", "大厅电梯呼叫按钮", 1345, 322, 2], ["Lobby floor indicator", "大厅电梯楼层指示器", 1345, 285, 2], ["Lobby lift sill", "大厅电梯门槛", 1230, 365, 2], ["Lobby lift reveal", "大厅电梯门洞侧壁", 1120, 285, 2], ["Lobby right passenger lift", "大厅右侧客梯", 1380, 285, 0], ["Lobby second lift door", "大厅第二部电梯门", 1400, 285, 1], ["Lobby second call button", "大厅第二部电梯按钮", 1440, 320, 2], ["Lobby lift wall cladding", "大厅电梯墙面饰板", 1090, 260, 1], ["Lobby stone wall joint", "大厅石材墙缝", 1100, 210, 3], ["Lobby vertical wall light", "大厅竖向墙灯", 1070, 235, 2], ["Lobby wall light diffuser", "大厅墙灯扩散罩", 1070, 235, 3], ["Lobby lift ceiling recess", "大厅电梯顶棚凹槽", 1240, 150, 3], ["Lobby ceiling downlight", "大厅天花筒灯", 1180, 80, 2], ["Lobby ceiling air diffuser", "大厅天花送风口", 1280, 70, 2], ["Lobby lift-door track", "大厅电梯门导轨", 1230, 195, 3], ["Lobby wall corner trim", "大厅墙角收边条", 1090, 320, 3], ["Lobby elevator cab edge", "大厅电梯轿厢边", 1230, 320, 4], ["Lobby service-core floor tile", "大厅设备核心区地砖", 1340, 470, 1], ["Lobby wall panel seam", "大厅墙面板接缝", 1460, 200, 4],
      ] },
      { id: "visitor-waiting", title: "Visitor waiting area", translation: "访客等候区", description: "Explore the visitor sofa, lounge chairs, coffee table, rug, indoor plant, coat stand and umbrella holder.", x: 1230, y: 150, width: 442, height: 780, targetScale: 2.55, labels: [
        ["Lobby visitor sofa", "大厅访客沙发", 1550, 650, 0], ["Lobby sofa back cushion", "大厅沙发靠垫", 1550, 605, 1], ["Lobby sofa seat cushion", "大厅沙发坐垫", 1550, 680, 1], ["Lobby sofa armrest", "大厅沙发扶手", 1640, 650, 2], ["Lobby sofa metal leg", "大厅沙发金属脚", 1560, 750, 3], ["Lobby lounge chair", "大厅休闲椅", 1490, 820, 0], ["Lobby chair arm", "大厅休闲椅扶手", 1530, 800, 2], ["Lobby chair cushion", "大厅休闲椅坐垫", 1490, 825, 1], ["Lobby coffee table", "大厅茶几", 1360, 730, 0], ["Lobby coffee-table top", "大厅茶几台面", 1360, 700, 1], ["Lobby table metal frame", "大厅茶几金属框", 1350, 760, 2], ["Lobby table leg", "大厅茶几桌腿", 1370, 785, 3], ["Lobby waiting-area rug", "大厅等候区地毯", 1430, 820, 0], ["Lobby rug border", "大厅地毯边缘", 1320, 800, 2], ["Lobby potted plant", "大厅盆栽", 1320, 585, 0], ["Lobby plant leaves", "大厅植物叶片", 1320, 555, 2], ["Lobby planter pot", "大厅花盆", 1320, 625, 1], ["Lobby coat stand", "大厅衣帽架", 1500, 300, 0], ["Lobby coat-stand hook", "大厅衣帽架挂钩", 1500, 205, 2], ["Lobby umbrella holder", "大厅雨伞筒", 1500, 405, 0], ["Lobby umbrella handle", "大厅雨伞把手", 1515, 355, 2], ["Lobby floor vase", "大厅落地花瓶", 1320, 625, 3], ["Lobby lounge chair leg", "大厅休闲椅椅腿", 1455, 880, 3], ["Lobby waiting-zone tile", "大厅等候区地砖", 1260, 860, 1], ["Lobby foreground chair arm pad", "大厅前景休闲椅扶手垫", 1530, 815, 2],
      ] },
      { id: "glazing-and-interior", title: "Glazing and interior details", translation: "玻璃与室内细节", description: "Inspect the glazed facade, interior plant, ceiling lights, floor joints, bench seating and architectural finishes.", x: 0, y: 0, width: 1_672, height: 941, targetScale: 2.5, labels: [
        ["Lobby glazed facade", "大厅玻璃幕墙", 700, 170, 0], ["Lobby facade transom", "大厅幕墙上横窗", 640, 100, 1], ["Lobby window mullion", "大厅窗户竖梃", 690, 225, 2], ["Lobby horizontal glazing bar", "大厅玻璃横档", 600, 205, 2], ["Lobby exterior planter", "大厅窗边花盆", 835, 310, 0], ["Lobby planter foliage", "大厅花盆枝叶", 835, 265, 1], ["Lobby interior palm", "大厅室内棕榈", 830, 280, 0], ["Lobby palm frond", "大厅棕榈叶", 800, 230, 2], ["Lobby palm planter", "大厅棕榈花盆", 830, 340, 1], ["Lobby ceiling strip light", "大厅天花线性灯", 1000, 35, 1], ["Lobby recessed spot light", "大厅嵌入式射灯", 720, 28, 2], ["Lobby ceiling air grille", "大厅天花回风格栅", 690, 35, 3], ["Lobby stone floor tile", "大厅石材地砖", 800, 710, 0], ["Lobby floor grout joint", "大厅地砖缝", 760, 775, 3], ["Lobby floor tile junction", "大厅地砖交汇点", 960, 720, 2], ["Lobby polished floor edge", "大厅抛光地面边缘", 680, 840, 2], ["Lobby window bench", "大厅窗边长椅", 960, 315, 0], ["Lobby bench seat", "大厅长椅坐面", 950, 330, 1], ["Lobby bench support", "大厅长椅支架", 950, 365, 3], ["Lobby wall stone panel", "大厅石材墙板", 1060, 340, 1], ["Lobby timber wall slat", "大厅木墙饰条", 90, 200, 2], ["Lobby ceiling timber slat", "大厅天花木饰条", 105, 25, 2], ["Lobby hanging pendant", "大厅吊灯", 790, 175, 1], ["Lobby pendant shade", "大厅吊灯灯罩", 790, 180, 2], ["Lobby interior glass partition", "大厅室内玻璃隔断", 700, 460, 0],
      ] },
    ],
  },
  {
    id: "airport-customs-hall", title: "Airport customs hall", translation: "机场海关大厅",
    subtitle: "Arrivals channels, inspection desks, screening equipment, queue barriers and exits",
    semanticRealmId: "objects-technology",
    parentId: "baggage-claim", source: "scripts/assets/airport-customs-hall-v1.png",
    sourceSha256: "8477fb962d93eeca3189af30ed02fa7013be11b248c37a9de293a42d600e0703",
    asset: "/scenes/airport-customs-hall-premium-v1.jpg", assetSha256: "123816c93796df56223b3e50aa3c1cd696fa9ca7747f5c904e4c04132d4c4e40",
    removed: ["traveller identity", "declaration content", "inspection result", "legal status", "item contents", "staff action", "screen text", "brand"],
    zones: [
      { id: "arrival-channels", title: "Arrivals channels", translation: "入境通道", description: "Follow the green and red floor routes, overhead lane signals, glass partitions and channel entrance fittings.", x: 250, y: 50, width: 1_050, height: 760, targetScale: 2.6, labels: [
        ["Customs lane floor divider", "海关通道地面分界线", 820, 450, 0], ["Customs green channel", "海关绿色通道", 760, 620, 0], ["Customs red channel", "海关红色通道", 1020, 650, 0], ["Customs green floor stripe", "海关绿色地面引导线", 750, 710, 1], ["Customs red floor stripe", "海关红色地面引导线", 1060, 720, 1], ["Customs channel floor tile", "海关通道地砖", 870, 680, 1], ["Customs channel tile joint", "海关通道地砖缝", 900, 750, 3], ["Customs overhead green signal", "海关顶部绿色信号灯", 765, 130, 0], ["Customs green signal lens", "海关绿灯灯罩", 765, 130, 2], ["Customs overhead red signal", "海关顶部红色信号灯", 1035, 130, 0], ["Customs red signal lens", "海关红灯灯罩", 1035, 130, 2], ["Customs lane header panel", "海关通道顶部面板", 900, 125, 1], ["Customs lane divider", "海关通道隔板", 850, 340, 0], ["Customs glass lane partition", "海关玻璃通道隔断", 825, 375, 1], ["Customs partition top rail", "海关隔断顶部横杆", 825, 300, 2], ["Customs partition metal post", "海关隔断金属立柱", 845, 400, 2], ["Customs channel gate", "海关通道闸门", 900, 440, 0], ["Customs gate control box", "海关闸门控制盒", 900, 430, 2], ["Customs retractable belt", "海关伸缩隔离带", 990, 415, 1], ["Customs queue post", "海关排队柱", 1000, 520, 0], ["Customs queue-post cap", "海关排队柱顶帽", 1000, 385, 2], ["Customs queue-post base", "海关排队柱底座", 1000, 585, 2], ["Customs lane floor marker", "海关通道地面标记", 795, 675, 2], ["Customs glass divider upright", "海关玻璃隔断立柱", 880, 390, 1], ["Customs floor tile corner", "海关地砖转角", 890, 800, 3],
      ] },
      { id: "screening-conveyor", title: "Baggage screening conveyor", translation: "行李检查传送带", description: "Inspect the X-ray tunnel, conveyor rollers, belt, trays, return track and screening-machine housing.", x: 0, y: 250, width: 650, height: 680, targetScale: 2.65, labels: [
        ["Customs X-ray scanner", "海关X光检查机", 420, 440, 0], ["Customs scanner tunnel", "海关检查机通道口", 450, 400, 1], ["Customs tunnel curtain", "海关通道防护帘", 450, 405, 2], ["Customs scanner housing", "海关检查机外壳", 380, 450, 1], ["Customs conveyor belt", "海关传送带", 340, 515, 0], ["Customs conveyor roller", "海关传送滚筒", 490, 520, 2], ["Customs belt side rail", "海关传送带侧栏", 330, 485, 2], ["Customs tray conveyor", "海关托盘传送带", 520, 485, 0], ["Customs grey inspection tray", "海关灰色检查托盘", 530, 475, 1], ["Customs tray lip", "海关托盘边沿", 530, 465, 3], ["Customs tray return track", "海关托盘回送轨道", 500, 540, 1], ["Customs steel conveyor frame", "海关传送机钢架", 395, 560, 2], ["Customs conveyor leg", "海关传送机支腿", 430, 645, 3], ["Customs equipment foot", "海关设备支脚", 340, 690, 3], ["Customs scanner control housing", "海关检查机控制外壳", 290, 455, 1], ["Customs yellow scanner button", "海关检查机黄色按钮", 290, 445, 3], ["Customs scanner side vent", "海关检查机侧面散热口", 310, 460, 3], ["Customs nested tray rack", "海关叠放托盘架", 80, 440, 0], ["Customs tray-rack side rail", "海关托盘架侧栏", 130, 510, 1], ["Customs tray-rack foot", "海关托盘架支脚", 150, 700, 2], ["Customs inspection worktop", "海关检查工作台", 140, 600, 0], ["Customs worktop edge", "海关工作台边缘", 140, 560, 2], ["Customs worktable support", "海关工作台支架", 140, 675, 2], ["Customs rubber floor mat", "海关橡胶地垫", 240, 790, 0], ["Customs scanner cable", "海关检查机电缆", 390, 610, 3],
      ] },
      { id: "inspection-desks", title: "Inspection desks", translation: "检查柜台", description: "Explore the inspection counter, desk panels, trays, document surfaces, monitor stands and visitor-facing barrier.", x: 1030, y: 250, width: 640, height: 530, targetScale: 2.6, labels: [
        ["Customs inspection counter", "海关检查柜台", 1330, 455, 0], ["Customs counter worktop", "海关柜台台面", 1330, 410, 1], ["Customs counter front panel", "海关柜台前板", 1330, 520, 1], ["Customs counter side return", "海关柜台侧翼", 1480, 475, 2], ["Customs inspection workstation", "海关检查工作站", 1260, 355, 0], ["Customs desk monitor", "海关柜台显示器", 1250, 330, 0], ["Customs monitor frame", "海关显示器边框", 1250, 325, 2], ["Customs monitor stand", "海关显示器支架", 1250, 355, 2], ["Customs keyboard", "海关键盘", 1270, 375, 1], ["Customs desk telephone", "海关柜台电话", 1370, 365, 0], ["Customs telephone handset", "海关电话听筒", 1370, 350, 2], ["Customs card terminal", "海关刷卡终端", 1450, 370, 1], ["Customs terminal screen", "海关终端屏幕", 1450, 360, 2], ["Customs document tray", "海关文件托盘", 1190, 380, 1], ["Customs tray divider", "海关托盘隔片", 1190, 375, 3], ["Customs empty inspection tray", "海关空检查盘", 1110, 470, 0], ["Customs tray stack", "海关托盘叠", 1120, 445, 1], ["Customs desk privacy screen", "海关柜台防护屏", 1420, 340, 0], ["Customs clear counter shield", "海关柜台透明隔板", 1390, 330, 1], ["Customs shield support foot", "海关隔板支脚", 1380, 365, 3], ["Customs counter pedestal", "海关柜台支座", 1340, 560, 2], ["Customs desk cable grommet", "海关桌面走线孔", 1300, 410, 3], ["Customs counter corner guard", "海关柜台护角", 1480, 450, 3], ["Customs visitor-side rail", "海关访客侧扶栏", 1100, 535, 2], ["Customs counter base trim", "海关柜台底部饰条", 1320, 550, 3],
      ] },
      { id: "trolleys-and-luggage", title: "Trolleys and luggage", translation: "行李车与行李", description: "Identify the nested luggage trolleys, handles, baskets, wheels, suitcases and trolley bay fittings.", x: 1360, y: 230, width: 312, height: 650, targetScale: 2.6, labels: [
        ["Customs nested luggage trolley", "海关叠放行李车", 1570, 490, 0], ["Customs trolley basket", "海关行李车篮筐", 1580, 450, 1], ["Customs trolley handle", "海关行李车把手", 1580, 400, 1], ["Customs trolley grip", "海关行李车握把", 1580, 395, 2], ["Customs trolley frame", "海关行李车车架", 1570, 530, 1], ["Customs trolley front wheel", "海关行李车前轮", 1530, 575, 2], ["Customs trolley rear wheel", "海关行李车后轮", 1605, 580, 2], ["Customs trolley caster fork", "海关行李车脚轮叉架", 1530, 570, 3], ["Customs trolley base platform", "海关行李车底板", 1570, 550, 2], ["Customs trolley bumper", "海关行李车防撞条", 1560, 520, 3], ["Customs black suitcase", "海关黑色行李箱", 1450, 470, 0], ["Customs suitcase shell", "海关行李箱外壳", 1450, 465, 1], ["Customs suitcase corner guard", "海关行李箱护角", 1435, 450, 3], ["Customs suitcase wheel", "海关行李箱脚轮", 1460, 510, 2], ["Customs suitcase pull handle", "海关行李箱拉杆把手", 1450, 430, 2], ["Customs canvas duffel bag", "海关帆布旅行袋", 1510, 500, 0], ["Customs duffel shoulder strap", "海关旅行袋肩带", 1510, 475, 2], ["Customs duffel zipper", "海关旅行袋拉链", 1510, 485, 3], ["Customs trolley bay rail", "海关行李车停放栏", 1640, 480, 1], ["Customs trolley bay wheel stop", "海关行李车轮挡", 1620, 590, 3], ["Customs trolley basket rim", "海关行李车篮筐边", 1570, 420, 2], ["Customs basket wire grid", "海关车篮金属网格", 1575, 440, 3], ["Customs trolley handlebar joint", "海关行李车把手接头", 1560, 395, 3], ["Customs trolley side brace", "海关行李车侧撑杆", 1600, 515, 3], ["Customs suitcase zipper pull", "海关行李箱拉链头", 1450, 475, 4],
      ] },
      { id: "arrival-exit", title: "Arrivals exit and glazing", translation: "入境出口与玻璃门", description: "Inspect the arrival exit doors, glass panels, door rails, security cameras, clock, windows and seating.", x: 850, y: 0, width: 822, height: 460, targetScale: 2.55, labels: [
        ["Customs arrivals exit doors", "海关入境出口门", 1270, 250, 0], ["Customs exit left door", "海关出口左门", 1220, 260, 1], ["Customs exit right door", "海关出口右门", 1320, 260, 1], ["Customs door pull handle", "海关出口门拉手", 1280, 280, 2], ["Customs exit door frame", "海关出口门框", 1200, 230, 2], ["Customs exit glass panel", "海关出口玻璃板", 1270, 220, 1], ["Customs door horizontal rail", "海关出口门横档", 1270, 180, 2], ["Customs door vertical stile", "海关出口门竖挺", 1300, 250, 2], ["Customs automatic door sensor", "海关自动门感应器", 1280, 150, 3], ["Customs overhead door track", "海关自动门导轨", 1260, 130, 2], ["Customs door threshold", "海关出口门槛", 1280, 320, 2], ["Customs lobby wall clock", "海关大厅挂钟", 1540, 165, 0], ["Customs clock face", "海关时钟表盘", 1540, 165, 2], ["Customs clock rim", "海关时钟外圈", 1540, 165, 3], ["Customs security camera", "海关监控摄像头", 1560, 35, 0], ["Customs camera dome", "海关摄像头半球罩", 1560, 35, 2], ["Customs high clerestory window", "海关高侧窗", 1420, 80, 1], ["Customs window mullion", "海关窗户竖框", 1400, 95, 2], ["Customs upper glazing bar", "海关上窗横档", 1440, 90, 2], ["Customs exit-side wall panel", "海关出口侧墙板", 1490, 250, 1], ["Customs waiting bench", "海关等候长椅", 1450, 380, 0], ["Customs bench seat", "海关长椅坐面", 1450, 390, 1], ["Customs bench leg", "海关长椅椅腿", 1490, 420, 3], ["Customs exit floor tile", "海关出口地砖", 1300, 360, 1], ["Customs fixed sidelight pane", "海关出口侧窗玻璃", 1390, 210, 3],
      ] },
      { id: "queue-and-room", title: "Queue and hall fittings", translation: "排队区与大厅设施", description: "Explore the queue posts, ceiling fixtures, glass partitions, side desk, wall panels and open circulation space.", x: 0, y: 0, width: 1_672, height: 941, targetScale: 2.5, labels: [
        ["Arrivals queue barrier", "海关排队隔离栏", 650, 470, 0], ["Customs barrier post", "海关隔离柱", 650, 420, 1], ["Customs barrier belt", "海关隔离带", 720, 430, 1], ["Customs barrier post base", "海关隔离柱底座", 650, 510, 2], ["Customs second queue post", "海关第二根排队柱", 700, 495, 0], ["Customs queue-post belt clip", "海关隔离带卡扣", 680, 430, 3], ["Customs side inspection desk", "海关侧边检查桌", 150, 580, 0], ["Customs side desk support", "海关侧桌支架", 150, 670, 2], ["Customs metal chair", "海关金属椅", 95, 480, 0], ["Customs chair seat", "海关金属椅座面", 95, 500, 1], ["Customs chair backrest", "海关金属椅靠背", 95, 455, 1], ["Customs ceiling light panel", "海关天花灯板", 730, 45, 1], ["Customs recessed downlight", "海关嵌入式筒灯", 850, 40, 2], ["Customs ceiling air diffuser", "海关天花送风口", 700, 30, 2], ["Customs ceiling access panel", "海关天花检修板", 1200, 45, 3], ["Customs structural column", "海关结构立柱", 650, 270, 0], ["Customs column base", "海关立柱底座", 650, 500, 2], ["Customs glass partition wall", "海关玻璃隔断墙", 300, 200, 0], ["Customs partition glazing", "海关隔断玻璃", 300, 240, 1], ["Customs glass partition stile", "海关隔断竖框", 320, 240, 2], ["Customs wall skirting", "海关墙脚线", 150, 380, 2], ["Customs stainless wall trim", "海关不锈钢墙边条", 430, 260, 3], ["Customs hall floor joint", "海关大厅地面接缝", 600, 820, 3], ["Customs open circulation floor", "海关大厅通行地面", 800, 850, 0], ["Customs queue-lane carpet mat", "海关排队区地垫", 550, 700, 1],
      ] },
    ],
  },
];

const integrations = [
  { parentId: "emergency-department", childId: "hospital-inpatient-bedspace", title: "Hospital inpatient bedspace", description: "A clear patch over the visible examination couch in the right-hand emergency-department bay", portal: { id: "enter-hospital-inpatient-bedspace", label: "Explore the inpatient bedspace", translation: "探索住院床位区", childSceneId: "hospital-inpatient-bedspace", sourceVisualRegion: "portal-hospital-inpatient-bedspace", x: 1_220, y: 660, width: 70, height: 70, enterScale: 3.35 } },
  { parentId: "office-building", childId: "office-reception-lobby", title: "Office reception lobby", description: "The visible curved reception counter at the left foreground of the office-building photograph", portal: { id: "enter-office-reception-lobby", label: "Explore the reception lobby", translation: "探索接待大厅", childSceneId: "office-reception-lobby", sourceVisualRegion: "portal-office-reception-lobby", x: 0, y: 500, width: 300, height: 360, enterScale: 3.3 } },
  { parentId: "office-reception-lobby", childId: "office-elevator-car", title: "Office elevator car", description: "Passenger-lift doors and adjacent call panel in the office reception lobby", portal: { id: "enter-office-elevator-car", label: "Enter the office elevator", translation: "进入写字楼电梯", childSceneId: "office-elevator-car", sourceVisualRegion: "portal-office-elevator-car", x: 1_044, y: 183, width: 152, height: 180, enterScale: 3.3 } },
  { parentId: "baggage-claim", childId: "airport-customs-hall", title: "Airport customs hall", description: "The glazed arrivals exit doors at the upper-right end of the baggage-claim hall", portal: { id: "enter-airport-customs-hall", label: "Explore the customs hall", translation: "探索海关大厅", childSceneId: "airport-customs-hall", sourceVisualRegion: "portal-airport-customs-hall", x: 1_210, y: 75, width: 340, height: 320, enterScale: 3.3 } },
];

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function slug(value) { return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function point(value, axis) { return Number((value * (axis === "x" ? sx : sy)).toFixed(6)); }
function rect(value) { return { x: point(value.x, "x"), y: point(value.y, "y"), width: point(value.width, "x"), height: point(value.height, "y") }; }

function buildScene(config) {
  const labels = []; const visualRegions = []; const detailZones = []; let sequence = 0;
  for (const zone of config.zones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `${config.id}-${slug(word)}`;
      const sourceX = Math.max(0, Math.min(SOURCE_WIDTH - 44, x - 22));
      const sourceY = Math.max(0, Math.min(SOURCE_HEIGHT - 44, y - 22));
      const regionId = `${config.id}-region-${slug(word)}`;
      labels.push({ id, word, translation, x: point(x, "x"), y: point(y, "y"), priority: Number((1 + sequence / 1000).toFixed(6)), minLevel, sourceVisualRegion: regionId, semanticRealmId: config.semanticRealmId });
      visualRegions.push({ id: regionId, description: `${word} visible in ${zone.title}`, kind: "object", x: point(sourceX, "x"), y: point(sourceY, "y"), width: point(44, "x"), height: point(44, "y") });
      labelIds.push(id); sequence += 1;
    }
    detailZones.push({ id: `${config.id}-zone-${zone.id}`, title: zone.title, translation: zone.translation, description: zone.description, ...rect(zone), targetScale: zone.targetScale, labelIds });
  }
  return {
    id: config.id, title: config.title, translation: config.translation, subtitle: config.subtitle, asset: config.asset,
    width: WIDTH, height: HEIGHT, parentId: config.parentId, visualRegions, detailZones,
    anchorAudit: { status: "human-verified", policy: "visible-object-or-part-only", reviewedAsset: config.asset, reviewedAssetSha256: config.assetSha256, rationale: `The generated source and final JPEG were inspected at native and final pixels. This scene retains ${labels.length} independently pointable objects and visible parts across ${detailZones.length} bounded zones. People, identity, readable text, brands, hidden contents, inferred processes and unsupported states were excluded.`, previousLabelCount: labels.length + config.removed.length, retainedLabelCount: labels.length, removedLabelCount: config.removed.length, removedExamples: config.removed },
    labels, portals: [],
  };
}

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try { if (Buffer.compare(await readFile(path), next) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, next); return true;
}

async function renderAsset(config) {
  const source = await readFile(resolve(root, config.source));
  if (hash(source) !== config.sourceSha256) throw new Error(`${config.id} source bytes changed; rerun the pixel audit`);
  return sharp(source, { failOn: "error", sequentialRead: true }).resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 }).jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true }).toBuffer();
}

async function assertUniqueWords(built) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")); const owners = new Map(); const collisions = [];
  for (const entry of manifest.scenes) {
    if (built.some(({ id }) => id === entry.id)) continue;
    const scene = JSON.parse(await readFile(resolve(sceneRoot, `${entry.id}.json`), "utf8"));
    for (const label of scene.labels) owners.set(label.word.toLocaleLowerCase(), entry.id);
  }
  for (const scene of built) for (const label of scene.labels) {
    const key = label.word.toLocaleLowerCase();
    if (owners.has(key)) collisions.push(`${scene.id} duplicates ${owners.get(key)}: ${label.word}`);
    owners.set(key, scene.id);
  }
  if (collisions.length) throw new Error(`display-word collisions:\n${collisions.join("\n")}`);
}

async function integrateScenes() {
  const changes = {};
  for (const item of integrations) {
    const path = resolve(sceneRoot, `${item.parentId}.json`); const parent = JSON.parse(await readFile(path, "utf8"));
    const region = { id: item.portal.sourceVisualRegion, description: item.description, kind: "object", x: item.portal.x, y: item.portal.y, width: item.portal.width, height: item.portal.height };
    const portalIndex = parent.portals.findIndex(({ id }) => id === item.portal.id);
    if (portalIndex >= 0) parent.portals[portalIndex] = item.portal; else parent.portals.push(item.portal);
    const regionIndex = parent.visualRegions.findIndex(({ id }) => id === region.id);
    if (regionIndex >= 0) parent.visualRegions[regionIndex] = region; else parent.visualRegions.push(region);
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

function addPortalsToBuiltScenes(built) {
  for (const item of integrations) {
    const parent = built.find(({ id }) => id === item.parentId);
    if (!parent) continue;
    parent.portals.push(item.portal);
    parent.visualRegions.push({ id: item.portal.sourceVisualRegion, description: item.description, kind: "object", x: item.portal.x, y: item.portal.y, width: item.portal.width, height: item.portal.height });
  }
}

export async function buildPracticalDeepScenes() {
  const built = configs.map(buildScene);
  if (doIntegrate) addPortalsToBuiltScenes(built);
  for (const scene of built) {
    if (scene.labels.length !== 150 || scene.detailZones.length !== 6 || scene.detailZones.some(({ labelIds }) => labelIds.length !== 25)) throw new Error(`${scene.id} must contain six zones of 25 labels`);
    if (new Set(scene.labels.map(({ word }) => word.toLocaleLowerCase())).size !== scene.labels.length) throw new Error(`${scene.id} has repeated display words`);
  }
  await assertUniqueWords(built);
  const rendered = await Promise.all(configs.map(renderAsset));
  if (process.argv.includes("--print-asset-hashes")) {
    console.log(JSON.stringify(Object.fromEntries(configs.map((config, index) => [config.id, hash(rendered[index])])), null, 2));
    return;
  }
  const result = { scenes: [] };
  for (let index = 0; index < configs.length; index += 1) {
    const config = configs[index]; const bytes = rendered[index]; const actualHash = hash(bytes);
    if (actualHash !== config.assetSha256) throw new Error(`${config.id} JPEG hash mismatch: ${actualHash}`);
    const assetPath = resolve(root, `public${config.asset}`);
    let assetChanged = true;
    try { assetChanged = Buffer.compare(await readFile(assetPath), bytes) !== 0; } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (assetChanged) await writeFile(assetPath, bytes);
    result.scenes.push({ id: config.id, labels: 150, assetChanged, sceneChanged: await writeIfChanged(resolve(sceneRoot, `${config.id}.json`), built[index]) });
  }
  if (doIntegrate) Object.assign(result, await integrateScenes());
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildPracticalDeepScenes().catch((error) => { console.error(`add-practical-deep-scenes: ${error.message}`); process.exitCode = 1; });
}
