import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const sceneRoot = resolve(root, "public/data/scenes");
const publicRoot = resolve(root, "public/scenes");
const manifestPath = resolve(sceneRoot, "manifest.json");
const WIDTH = 1_600;
const HEIGHT = 900;
const checkOnly = process.argv.includes("--check");
const sources = {
  "passenger-boarding-bridge": {
    input: "scripts/assets/airport-boarding-bridge-v1.png",
    output: "airport-boarding-bridge-premium-v1.jpg",
    sourceSha256: "0c4fb4c93ddf746e6c7f9e9ab370ca6eda2c168c3bde2e3f4656b1c149548cba",
    assetSha256: "f2d8b7c4fde68f8c8abf1b05d708536bd956a64e892ffa620dd9732b80d52835",
  },
  "office-elevator-car": {
    input: "scripts/assets/office-elevator-car-v1.png",
    output: "office-elevator-car-premium-v1.jpg",
    sourceSha256: "1053e7aee909fff760d04a822796ce0613a68ba745e0f751afd50ca4ebc9b9f2",
    assetSha256: "991fbda7b0bd3bf0527cb65600655fda73cbbf9ec3865aec0a75718a1593cd3b",
  },
};

const label = (word, translation, x, y) => ({ word, translation, x, y });
const scenes = [
  {
    id: "passenger-boarding-bridge",
    title: "Passenger boarding bridge",
    translation: "旅客登机廊桥",
    subtitle: "Enclosed jet bridge corridor, telescoping vestibule, handrails, controls and aircraft threshold",
    parentId: "boarding-gate",
    semanticRealmId: "objects-technology",
    zones: [
      { id: "left-glazing", title: "Left glazing and wall", translation: "左侧玻璃与墙面", description: "Explore the left bridge glazing, mullions, sills, seals and visible outer frame parts.", x: 0, y: 0, width: 570, height: 730, targetScale: 2.55, labels: [
        label("Jet-bridge left window band", "廊桥左侧窗带", 530, 220), label("Jet-bridge left window pane", "廊桥左侧窗玻璃", 530, 180), label("Jet-bridge left glazing mullion", "廊桥左侧玻璃竖框", 515, 220), label("Jet-bridge left window sill", "廊桥左侧窗台", 530, 375), label("Jet-bridge left glazing gasket", "廊桥左侧玻璃密封条", 550, 250),
        label("Jet-bridge left frame jamb", "廊桥左侧窗框立边", 515, 160), label("Jet-bridge left transom rail", "廊桥左侧窗上横档", 530, 28), label("Jet-bridge left lower glazing", "廊桥左下方玻璃", 530, 330), label("Jet-bridge left upper glazing", "廊桥左上方玻璃", 530, 80), label("Jet-bridge left wall panel", "廊桥左侧墙板", 480, 296),
        label("Jet-bridge left panel seam", "廊桥左侧墙板接缝", 470, 353), label("Jet-bridge left wall corner", "廊桥左侧墙角", 420, 480), label("Jet-bridge left kick panel", "廊桥左侧墙脚板", 438, 606), label("Jet-bridge left base trim", "廊桥左侧踢脚饰条", 501, 658), label("Jet-bridge left structural post", "廊桥左侧结构立柱", 45, 399),
        label("Jet-bridge left window frame", "廊桥左侧窗框", 550, 130), label("Jet-bridge left glazing reflection", "廊桥左侧玻璃反光面", 540, 285), label("Jet-bridge left exterior view", "廊桥左侧窗外景", 50, 257), label("Jet-bridge apron through glazing", "透过廊桥玻璃看到的机坪", 62, 460), label("Jet-bridge terminal facade view", "透过廊桥玻璃看到的航站楼", 70, 320),
        label("Jet-bridge left window divider", "廊桥左侧窗格分隔条", 550, 295), label("Jet-bridge left glazing edge", "廊桥左侧玻璃边缘", 515, 350), label("Jet-bridge left wall fastener", "廊桥左侧墙板紧固件", 452, 245), label("Jet-bridge left panel joint", "廊桥左侧墙板拼缝", 512, 390), label("Jet-bridge left lower frame", "廊桥左侧窗下框", 530, 366),
      ] },
      { id: "right-glazing", title: "Right glazing and wall", translation: "右侧玻璃与墙面", description: "Follow the right bridge windows, mullions, wall panels and structural frame toward the aircraft.", x: 1_025, y: 0, width: 575, height: 730, targetScale: 2.55, labels: [
        label("Jet-bridge right window band", "廊桥右侧窗带", 1215, 288), label("Jet-bridge right window pane", "廊桥右侧窗玻璃", 1225, 275), label("Jet-bridge right glazing mullion", "廊桥右侧玻璃竖框", 1200, 305), label("Jet-bridge right window sill", "廊桥右侧窗台", 1215, 420), label("Jet-bridge right glazing gasket", "廊桥右侧玻璃密封条", 1205, 361),
        label("Jet-bridge right frame jamb", "廊桥右侧窗框立边", 1200, 210), label("Jet-bridge right transom rail", "廊桥右侧窗上横档", 1215, 182), label("Jet-bridge right lower glazing", "廊桥右下方玻璃", 1225, 488), label("Jet-bridge right upper glazing", "廊桥右上方玻璃", 1225, 220), label("Jet-bridge right wall panel", "廊桥右侧墙板", 1100, 287),
        label("Jet-bridge right panel seam", "廊桥右侧墙板接缝", 1102, 356), label("Jet-bridge right wall corner", "廊桥右侧墙角", 1140, 474), label("Jet-bridge right kick panel", "廊桥右侧墙脚板", 1095, 614), label("Jet-bridge right base trim", "廊桥右侧踢脚饰条", 1205, 660), label("Jet-bridge right structural post", "廊桥右侧结构立柱", 1580, 400),
        label("Jet-bridge right window frame", "廊桥右侧窗框", 1200, 382), label("Jet-bridge right glazing reflection", "廊桥右侧玻璃反光面", 1210, 295), label("Jet-bridge right exterior view", "廊桥右侧窗外景", 1220, 250), label("Jet-bridge aircraft-fuselage view", "廊桥右侧窗外的飞机机身", 1230, 455), label("Jet-bridge right window divider", "廊桥右侧窗格分隔条", 1200, 298),
        label("Jet-bridge right glazing edge", "廊桥右侧玻璃边缘", 1230, 506), label("Jet-bridge right panel fastener", "廊桥右侧墙板紧固件", 1060, 236), label("Jet-bridge right panel joint", "廊桥右侧墙板拼缝", 1075, 405), label("Jet-bridge right lower frame", "廊桥右侧窗下框", 1218, 479), label("Jet-bridge right window upright", "廊桥右侧窗竖向边框", 1200, 177),
      ] },
      { id: "roof-and-telescoping-vestibule", title: "Roof and telescoping vestibule", translation: "顶部与伸缩廊桥接头", description: "Inspect the ceiling lights, roof panels and the ribbed flexible vestibule at the aircraft end.", x: 490, y: 0, width: 630, height: 470, targetScale: 2.7, labels: [
        label("Jet-bridge ceiling panel", "廊桥天花板", 730, 65), label("Jet-bridge ceiling seam", "廊桥天花板接缝", 560, 105), label("Jet-bridge recessed light", "廊桥嵌入式顶灯", 790, 23), label("Jet-bridge light diffuser", "廊桥灯具扩散罩", 795, 21), label("Jet-bridge ceiling crossbeam", "廊桥天花横梁", 570, 133),
        label("Jet-bridge roof support", "廊桥顶棚支撑件", 1020, 112), label("Jet-bridge telescoping roof section", "廊桥伸缩顶棚段", 818, 112), label("Jet-bridge telescoping side section", "廊桥伸缩侧段", 991, 221), label("Jet-bridge flexible vestibule", "廊桥柔性接头", 884, 191), label("Jet-bridge vestibule canopy", "廊桥接头顶罩", 840, 143),
        label("Jet-bridge accordion fold", "廊桥接头风琴褶", 958, 207), label("Jet-bridge accordion rib", "廊桥接头风琴肋", 979, 205), label("Jet-bridge vestibule side curtain", "廊桥接头侧帘", 1010, 293), label("Jet-bridge vestibule roof curtain", "廊桥接头顶帘", 958, 156), label("Jet-bridge vestibule end frame", "廊桥接头端框", 888, 304),
        label("Jet-bridge ceiling lamp housing", "廊桥顶灯外壳", 660, 22), label("Jet-bridge ceiling panel joint", "廊桥顶板拼缝", 740, 93), label("Jet-bridge inner roof rail", "廊桥内侧顶轨", 590, 171), label("Jet-bridge upper wall junction", "廊桥上方墙顶接缝", 536, 192), label("Jet-bridge roof liner", "廊桥顶棚内衬", 700, 114),
        label("Jet-bridge vestibule lower flap", "廊桥接头下挡片", 941, 388), label("Jet-bridge vestibule side seal", "廊桥接头侧密封条", 1003, 322), label("Jet-bridge canopy corner", "廊桥顶罩转角", 861, 139), label("Jet-bridge cross-section frame", "廊桥伸缩段横框", 1023, 180), label("Jet-bridge overhead panel", "廊桥上方内板", 622, 75),
      ] },
      { id: "bridge-controls-and-phone", title: "Bridge controls and emergency phone", translation: "廊桥控制装置与应急电话", description: "Identify the visible joystick console, push buttons, cabinet faces, wall phone and its cord.", x: 140, y: 190, width: 370, height: 500, targetScale: 2.8, labels: [
        label("Jet-bridge operator console", "廊桥操作台", 290, 511), label("Jet-bridge control cabinet", "廊桥控制柜", 288, 567), label("Jet-bridge console top", "廊桥控制台面", 283, 471), label("Jet-bridge joystick", "廊桥操纵杆", 287, 461), label("Jet-bridge joystick grip", "廊桥操纵杆握柄", 294, 453),
        label("Jet-bridge joystick boot", "廊桥操纵杆防尘罩", 286, 478), label("Jet-bridge console red button", "廊桥控制台红色按钮", 329, 483), label("Jet-bridge console black button", "廊桥控制台黑色按钮", 253, 477), label("Jet-bridge console switch", "廊桥控制台开关", 362, 494), label("Jet-bridge console indicator", "廊桥控制台指示灯", 386, 506),
        label("Jet-bridge cabinet front panel", "廊桥控制柜前板", 289, 548), label("Jet-bridge cabinet side panel", "廊桥控制柜侧板", 377, 550), label("Jet-bridge cabinet corner seam", "廊桥控制柜边角接缝", 372, 535), label("Jet-bridge cabinet base", "廊桥控制柜底座", 290, 605), label("Jet-bridge console lower edge", "廊桥控制台下沿", 290, 589),
        label("Jet-bridge emergency phone cabinet", "廊桥应急电话柜", 364, 337), label("Jet-bridge emergency phone handset", "廊桥应急电话听筒", 365, 319), label("Jet-bridge handset cradle", "廊桥电话听筒座", 365, 343), label("Jet-bridge coiled phone cord", "廊桥电话螺旋线", 387, 387), label("Jet-bridge emergency call unit", "廊桥应急通话装置", 365, 310),
        label("Jet-bridge phone cabinet door", "廊桥电话柜门", 365, 354), label("Jet-bridge phone cabinet latch", "廊桥电话柜门扣", 398, 350), label("Jet-bridge phone speaker grille", "廊桥电话扬声器格栅", 363, 291), label("Jet-bridge console mounting base", "廊桥控制台安装底座", 289, 625), label("Jet-bridge control-cabinet foot", "廊桥控制柜支脚", 285, 618),
      ] },
      { id: "handrails-and-threshold", title: "Handrails and boarding threshold", translation: "扶手与登机门槛", description: "Follow both continuous handrails, their brackets and the visible raised aircraft-door threshold.", x: 390, y: 300, width: 720, height: 350, targetScale: 2.7, labels: [
        label("Jet-bridge left handrail", "廊桥左侧扶手", 480, 460), label("Jet-bridge left handrail grip", "廊桥左侧扶手握持面", 547, 452), label("Jet-bridge left handrail bracket", "廊桥左侧扶手支架", 505, 420), label("Jet-bridge left rail end cap", "廊桥左侧扶手端盖", 420, 490), label("Jet-bridge left rail wall mount", "廊桥左扶手墙面固定座", 560, 437),
        label("Jet-bridge right handrail", "廊桥右侧扶手", 1100, 463), label("Jet-bridge right handrail grip", "廊桥右侧扶手握持面", 1028, 450), label("Jet-bridge right handrail bracket", "廊桥右侧扶手支架", 1060, 414), label("Jet-bridge right rail end cap", "廊桥右侧扶手端盖", 1120, 486), label("Jet-bridge right rail wall mount", "廊桥右扶手墙面固定座", 1000, 433),
        label("Jet-bridge boarding threshold", "廊桥登机门槛", 780, 447), label("Jet-bridge threshold sill", "廊桥门槛底槛", 777, 459), label("Jet-bridge threshold edge strip", "廊桥门槛边条", 710, 466), label("Jet-bridge door sill plate", "廊桥登机门槛板", 774, 478), label("Jet-bridge raised transition lip", "廊桥凸起过渡边", 742, 485),
        label("Jet-bridge doorway grab rail", "廊桥门口抓握扶手", 650, 363), label("Jet-bridge left door grab rail", "廊桥左侧门口扶手", 625, 352), label("Jet-bridge right door grab rail", "廊桥右侧门口扶手", 943, 352), label("Jet-bridge grab-rail mount", "廊桥门口扶手固定座", 630, 364), label("Jet-bridge safety rail post", "廊桥安全扶手立柱", 865, 365),
        label("Jet-bridge handrail return", "廊桥扶手回弯", 435, 474), label("Jet-bridge handrail lower brace", "廊桥扶手下支撑", 519, 480), label("Jet-bridge threshold corner", "廊桥门槛转角", 841, 448), label("Jet-bridge accessible clear width", "廊桥无障碍通行宽度", 784, 500), label("Jet-bridge cabin-entry step-free sill", "廊桥无台阶登机门槛", 805, 455),
      ] },
      { id: "floor-and-route", title: "Floor and boarding route", translation: "地面与登机通道", description: "Explore the non-slip floor surface, expansion seams, threshold panels and unobstructed boarding path.", x: 0, y: 500, width: 1_600, height: 400, targetScale: 2.45, labels: [
        label("Jet-bridge non-slip floor", "廊桥防滑地面", 776, 730), label("Jet-bridge floor texture", "廊桥地面纹理", 870, 815), label("Jet-bridge floor panel", "廊桥地板", 660, 745), label("Jet-bridge floor expansion joint", "廊桥地面伸缩缝", 786, 711), label("Jet-bridge transverse floor seam", "廊桥横向地板接缝", 782, 523),
        label("Jet-bridge floor edge trim", "廊桥地面边饰条", 541, 746), label("Jet-bridge left floor border", "廊桥左侧地面边界", 520, 686), label("Jet-bridge right floor border", "廊桥右侧地面边界", 1_054, 680), label("Jet-bridge front floor panel", "廊桥前部地板", 790, 590), label("Jet-bridge rear floor panel", "廊桥后部地板", 800, 859),
        label("Jet-bridge floor seam cover", "廊桥地缝盖条", 565, 705), label("Jet-bridge sill transition plate", "廊桥门槛过渡板", 797, 520), label("Jet-bridge metal floor strip", "廊桥金属地板条", 790, 523), label("Jet-bridge floor-border channel", "廊桥地边槽", 530, 740), label("Jet-bridge center walking lane", "廊桥中央步行通道", 800, 655),
        label("Jet-bridge clear boarding path", "廊桥畅通登机路线", 803, 690), label("Jet-bridge floor-panel corner", "廊桥地板角", 605, 848), label("Jet-bridge floor joint fastener", "廊桥地板接缝紧固件", 1_028, 711), label("Jet-bridge floor-patch boundary", "廊桥地面板块边界", 970, 842), label("Jet-bridge floor surface grain", "廊桥地面表面纹理", 913, 879),
        label("Jet-bridge aisle-side floor", "廊桥通道侧地面", 643, 625), label("Jet-bridge center floor section", "廊桥中央地面段", 821, 803), label("Jet-bridge threshold floor seam", "廊桥门槛地板接缝", 815, 532), label("Jet-bridge floor-to-wall junction", "廊桥地墙交界", 1_096, 699), label("Jet-bridge boarding-route surface", "廊桥登机路线表面", 740, 574),
      ] },
      { id: "aircraft-door-vestibule", title: "Aircraft door vestibule", translation: "飞机舱门接头区", description: "Inspect the visible aircraft doorway, its frame, seals, grab fittings and cabin-side threshold.", x: 620, y: 115, width: 360, height: 370, targetScale: 2.8, labels: [
        label("Jet-bridge aircraft doorway", "廊桥尽头的飞机舱门", 700, 300), label("Jet-bridge aircraft door frame", "廊桥尽头的飞机舱门框", 705, 300), label("Jet-bridge aircraft doorway jamb", "飞机舱门侧框", 705, 332), label("Jet-bridge cabin door reveal", "飞机舱门内凹边", 860, 299), label("Jet-bridge aircraft door gasket", "飞机舱门密封条", 865, 327),
        label("Jet-bridge cabin-side doorway", "廊桥尽头客舱门口", 700, 276), label("Jet-bridge aircraft-door sill", "飞机舱门底槛", 700, 424), label("Jet-bridge cabin threshold strip", "客舱入口门槛条", 700, 431), label("Jet-bridge vestibule end panel", "廊桥接头端部内板", 693, 272), label("Jet-bridge end-panel seam", "廊桥端部内板接缝", 692, 366),
        label("Jet-bridge doorway side seal", "廊桥登机口侧密封条", 716, 312), label("Jet-bridge doorway head seal", "廊桥登机口上缘密封条", 780, 199), label("Jet-bridge door-side grab point", "飞机舱门旁抓握处", 858, 350), label("Jet-bridge vestibule corner post", "廊桥接头转角立柱", 890, 346), label("Jet-bridge aircraft-door lower frame", "飞机舱门下框", 700, 409),
        label("Jet-bridge passenger-cabin opening", "廊桥尽头的客舱开口", 700, 252), label("Jet-bridge doorway upper frame", "飞机舱门上框", 789, 196), label("Jet-bridge doorway frame cap", "飞机舱门框端盖", 736, 202), label("Jet-bridge cabin-entry handhold", "客舱入口握把", 855, 333), label("Jet-bridge threshold side trim", "登机门槛侧饰条", 715, 415),
        label("Jet-bridge vestibule floor lip", "接头区地板凸缘", 687, 441), label("Jet-bridge aircraft-door trim", "飞机舱门饰边", 860, 211), label("Jet-bridge vestibule side panel", "廊桥接头侧板", 889, 265), label("Jet-bridge cabin entry seal", "客舱入口密封条", 860, 385), label("Jet-bridge aircraft-entry aperture", "飞机入口开口", 700, 235),
      ] },
    ],
    portal: {
      id: "enter-aircraft-cabin", label: "Enter the aircraft cabin", translation: "进入飞机客舱", childSceneId: "aircraft-cabin", sourceVisualRegion: "portal-aircraft-cabin",
      x: 735, y: 205, width: 108, height: 228, enterScale: 3.6,
      description: "Open aircraft doorway visible at the end of the passenger boarding bridge",
    },
    removedExamples: ["airline brand", "gate number", "flight delay", "boarding announcement", "passenger identity", "bridge operating state", "hidden drive motor", "aircraft model"],
    rationale: "The source image was inspected at native resolution. The bridge route is unobstructed and shows its handrails, operator console, emergency phone, telescoping vestibule and aircraft threshold. Anchors refer only to visible parts; hidden drive systems and passenger states were excluded.",
  },
  {
    id: "office-elevator-car",
    title: "Office elevator car",
    translation: "写字楼电梯轿厢",
    subtitle: "Lift car operating panel, doors, mirror, stainless and timber wall panels, handrails and floor",
    parentId: "office-reception-lobby",
    semanticRealmId: "people-society",
    zones: [
      { id: "operating-panel", title: "Car operating panel", translation: "轿厢操作面板", description: "Identify the visible lift controls, tactile buttons, indicator window, speaker grille and panel edges.", x: 1_285, y: 100, width: 315, height: 545, targetScale: 2.6, labels: [
        label("Elevator-car operating panel", "电梯轿厢操作面板", 1_305, 357), label("Elevator-car indicator window", "电梯轿厢指示窗", 1_305, 140), label("Elevator-car blank display", "电梯轿厢空白显示屏", 1_305, 150), label("Elevator-car panel speaker grille", "电梯轿厢面板扬声器格栅", 1_305, 210), label("Elevator-car top-row button", "电梯轿厢上排按钮", 1_305, 323),
        label("Elevator-car upper-middle button", "电梯轿厢上中排按钮", 1_305, 374), label("Elevator-car center button", "电梯轿厢中排按钮", 1_305, 423), label("Elevator-car lower-middle button", "电梯轿厢下中排按钮", 1_305, 474), label("Elevator-car bottom-row button", "电梯轿厢下排按钮", 1_305, 524), label("Elevator-car upper button rim", "电梯轿厢上排按钮边圈", 1_312, 323),
        label("Elevator-car upper-middle button face", "电梯轿厢上中排按钮面", 1_312, 374), label("Elevator-car upper-middle raised center", "电梯轿厢上中排按钮凸面", 1_305, 374), label("Elevator-car center button surround", "电梯轿厢中排按钮外圈", 1_312, 423), label("Elevator-car lower-middle button face", "电梯轿厢下中排按钮面", 1_312, 474), label("Elevator-car bottom button face", "电梯轿厢下排按钮面", 1_312, 524),
        label("Elevator-car panel faceplate", "电梯轿厢面板盖板", 1_305, 385), label("Elevator-car panel side trim", "电梯轿厢面板侧饰条", 1_289, 394), label("Elevator-car panel lower edge", "电梯轿厢面板下沿", 1_305, 575), label("Elevator-car control-panel screw", "电梯轿厢面板固定螺钉", 1_290, 583), label("Elevator-car indicator bezel", "电梯轿厢指示窗边框", 1_305, 132),
        label("Elevator-car lower round button", "电梯轿厢下方圆形按钮", 1_315, 474), label("Elevator-car middle button ring", "电梯轿厢中排按钮金属圈", 1_312, 423), label("Elevator-car button center", "电梯轿厢上中排按钮中心", 1_305, 374), label("Elevator-car panel mounting rail", "电梯轿厢面板安装条", 1_290, 402), label("Elevator-car control-panel seam", "电梯轿厢控制面板接缝", 1_340, 236),
      ] },
      { id: "doors-and-entry", title: "Doors and entry", translation: "轿门与入口", description: "Follow the open entrance, door leaves, frame, header, tracks, sill and floor transition.", x: 560, y: 80, width: 600, height: 690, targetScale: 2.65, labels: [
        label("Elevator-car entrance opening", "电梯轿厢入口", 875, 394), label("Elevator-car left door leaf", "电梯轿厢左侧门扇", 666, 383), label("Elevator-car right door leaf", "电梯轿厢右侧门扇", 1_085, 383), label("Elevator-car doorway frame", "电梯轿厢门框", 887, 104), label("Elevator-car doorway header", "电梯轿厢入口上框", 877, 90),
        label("Elevator-car left door jamb", "电梯轿厢左门框立边", 679, 380), label("Elevator-car right door jamb", "电梯轿厢右门框立边", 1_081, 380), label("Elevator-car door-track cover", "电梯轿厢门轨盖板", 867, 101), label("Elevator-car overhead door track", "电梯轿厢顶部门轨", 863, 104), label("Elevator-car door leading edge", "电梯轿厢门扇前缘", 711, 404),
        label("Elevator-car entrance sill", "电梯轿厢入口门槛", 869, 700), label("Elevator-car sill groove", "电梯轿厢门槛槽", 871, 704), label("Elevator-car threshold plate", "电梯轿厢门口过渡板", 874, 710), label("Elevator-car floor-level marker", "电梯轿厢地面边界", 727, 690), label("Elevator-car door pocket", "电梯轿厢门扇收纳侧槽", 635, 392),
        label("Elevator-car left frame trim", "电梯轿厢左门框饰条", 700, 214), label("Elevator-car right frame trim", "电梯轿厢右门框饰条", 1_060, 215), label("Elevator-car upper frame joint", "电梯轿厢上框接缝", 946, 105), label("Elevator-car door-side seal", "电梯轿厢门侧密封条", 1_072, 320), label("Elevator-car door bottom guide", "电梯轿厢门底导向件", 1_018, 699),
        label("Elevator-car left door panel", "电梯轿厢左侧门板", 632, 300), label("Elevator-car right door panel", "电梯轿厢右侧门板", 1_107, 304), label("Elevator-car entrance corner", "电梯轿厢入口转角", 1_028, 699), label("Elevator-car sill end cap", "电梯轿厢门槛端盖", 1_020, 700), label("Elevator-car doorway reveal", "电梯轿厢入口内凹边", 710, 178),
      ] },
      { id: "mirror-and-panels", title: "Mirror and wall panels", translation: "镜面与轿厢壁板", description: "Inspect the mirror, brushed steel, oak veneer, wall-panel joints and protective trim.", x: 0, y: 0, width: 1_320, height: 760, targetScale: 2.55, labels: [
        label("Elevator-car full-height mirror", "电梯轿厢全身镜", 355, 365), label("Elevator-car mirror glass", "电梯轿厢镜面玻璃", 335, 333), label("Elevator-car mirror edge", "电梯轿厢镜面边缘", 401, 350), label("Elevator-car mirror lower trim", "电梯轿厢镜面下饰条", 353, 671), label("Elevator-car mirror side channel", "电梯轿厢镜面侧槽", 411, 377),
        label("Elevator-car left oak wall panel", "电梯轿厢左侧橡木饰板", 529, 368), label("Elevator-car left veneer grain", "电梯轿厢左侧木饰纹理", 537, 350), label("Elevator-car right oak wall panel", "电梯轿厢右侧橡木饰板", 1_202, 385), label("Elevator-car right veneer grain", "电梯轿厢右侧木饰纹理", 1_226, 375), label("Elevator-car timber panel seam", "电梯轿厢木饰板拼缝", 1_190, 308),
        label("Elevator-car stainless wall", "电梯轿厢不锈钢墙面", 1_153, 449), label("Elevator-car brushed-metal grain", "电梯轿厢拉丝金属纹理", 1_159, 427), label("Elevator-car stainless reflection", "电梯轿厢不锈钢反光面", 1_242, 500), label("Elevator-car wall panel joint", "电梯轿厢墙板接缝", 1_126, 581), label("Elevator-car vertical wall trim", "电梯轿厢竖向墙饰条", 1_087, 491),
        label("Elevator-car left wood reveal", "电梯轿厢左侧木饰内边", 585, 196), label("Elevator-car right wood reveal", "电梯轿厢右侧木饰内边", 1_217, 199), label("Elevator-car wall corner joint", "电梯轿厢壁板转角接缝", 1_154, 642), label("Elevator-car lower wall protection", "电梯轿厢下部护板", 1_140, 686), label("Elevator-car wall base trim", "电梯轿厢墙脚饰条", 1_170, 712),
        label("Elevator-car oak panel edge", "电梯轿厢橡木饰板边缘", 495, 545), label("Elevator-car steel-to-wood joint", "电梯轿厢金属与木板交界", 1_115, 238), label("Elevator-car mirror reflection", "电梯轿厢镜中反射", 304, 474), label("Elevator-car wall fastener", "电梯轿厢墙板固定件", 1_255, 622), label("Elevator-car sidewall panel", "电梯轿厢侧壁板", 1_262, 452),
      ] },
      { id: "handrail-and-access", title: "Handrail and accessible space", translation: "扶手与无障碍空间", description: "Follow the continuous side handrails, end caps, mounts and clear standing area inside the cab.", x: 0, y: 430, width: 1_300, height: 390, targetScale: 2.55, labels: [
        label("Elevator-car left handrail", "电梯轿厢左侧扶手", 275, 520), label("Elevator-car left handrail grip", "电梯轿厢左扶手握持面", 455, 514), label("Elevator-car left handrail end cap", "电梯轿厢左扶手端盖", 200, 500), label("Elevator-car left rail bracket", "电梯轿厢左扶手支架", 529, 495), label("Elevator-car left rail wall mount", "电梯轿厢左扶手墙面底座", 398, 507),
        label("Elevator-car right handrail", "电梯轿厢右侧扶手", 1_219, 522), label("Elevator-car right handrail grip", "电梯轿厢右扶手握持面", 1_194, 515), label("Elevator-car right handrail end cap", "电梯轿厢右扶手端盖", 1_244, 550), label("Elevator-car right rail bracket", "电梯轿厢右扶手支架", 1_169, 501), label("Elevator-car right rail wall mount", "电梯轿厢右扶手墙面底座", 1_218, 508),
        label("Elevator-car clear turning area", "电梯轿厢轮椅转向空间", 873, 790), label("Elevator-car open floor space", "电梯轿厢空置地面", 811, 780), label("Elevator-car standing area", "电梯轿厢站立空间", 1_012, 790), label("Elevator-car wheelchair approach area", "电梯轿厢轮椅靠近空间", 751, 790), label("Elevator-car handrail return", "电梯轿厢扶手回弯", 1_241, 533),
        label("Elevator-car handrail underside", "电梯轿厢扶手底面", 462, 532), label("Elevator-car rail support arm", "电梯轿厢扶手支臂", 540, 520), label("Elevator-car rail mounting plate", "电梯轿厢扶手安装板", 1_170, 510), label("Elevator-car handrail wall clearance", "电梯轿厢扶手墙面间距", 1_253, 513), label("Elevator-car grab-rail curve", "电梯轿厢抓握扶手弧段", 80, 509),
        label("Elevator-car accessible cabin floor", "电梯轿厢无障碍地面", 910, 785), label("Elevator-car reachable control height", "电梯轿厢可触及按钮高度", 1_295, 507), label("Elevator-car handrail end fitting", "电梯轿厢扶手端部接头", 1_233, 547), label("Elevator-car side handhold", "电梯轿厢侧边握持扶手", 67, 524), label("Elevator-car uncluttered cabin area", "电梯轿厢无障碍空地", 933, 790),
      ] },
      { id: "ceiling-and-lighting", title: "Ceiling and lighting", translation: "天花与照明", description: "Explore the smooth metal ceiling panels, recessed lights, panel seams and light diffusers.", x: 0, y: 0, width: 1_300, height: 195, targetScale: 2.7, labels: [
        label("Elevator-car ceiling", "电梯轿厢天花板", 450, 43), label("Elevator-car ceiling panel", "电梯轿厢顶板", 1_110, 52), label("Elevator-car ceiling panel seam", "电梯轿厢顶板接缝", 430, 38), label("Elevator-car recessed downlight", "电梯轿厢嵌灯", 610, 29), label("Elevator-car downlight diffuser", "电梯轿厢灯具扩散罩", 613, 27),
        label("Elevator-car ceiling light aperture", "电梯轿厢天花灯孔", 40, 44), label("Elevator-car left ceiling lamp", "电梯轿厢左侧顶灯", 190, 87), label("Elevator-car center ceiling lamp", "电梯轿厢中央顶灯", 610, 29), label("Elevator-car right ceiling lamp", "电梯轿厢右侧顶灯", 1_063, 5), label("Elevator-car rear ceiling lamp", "电梯轿厢后部顶灯", 1_080, 25),
        label("Elevator-car ceiling cove", "电梯轿厢天花凹槽", 1_200, 55), label("Elevator-car ceiling return", "电梯轿厢顶棚折边", 1_260, 69), label("Elevator-car ceiling perimeter trim", "电梯轿厢天花周边饰条", 470, 70), label("Elevator-car ceiling cross-joint", "电梯轿厢天花横向接缝", 1_120, 55), label("Elevator-car ceiling longitudinal seam", "电梯轿厢天花纵向接缝", 520, 12),
        label("Elevator-car right ceiling panel", "电梯轿厢右侧顶板", 1_200, 30), label("Elevator-car ceiling light reflection", "电梯轿厢顶灯反光", 1_185, 25), label("Elevator-car lamp trim ring", "电梯轿厢灯具装饰圈", 613, 30), label("Elevator-car light-panel edge", "电梯轿厢灯板边缘", 1_126, 44), label("Elevator-car ceiling corner", "电梯轿厢天花转角", 1_263, 75),
        label("Elevator-car soffit panel", "电梯轿厢顶棚内板", 429, 60), label("Elevator-car flush ceiling joint", "电梯轿厢齐平顶板接合处", 520, 17), label("Elevator-car ceiling surface", "电梯轿厢顶面", 1_220, 65), label("Elevator-car downlight housing", "电梯轿厢嵌灯外壳", 1_063, 5), label("Elevator-car ceiling-wall junction", "电梯轿厢顶墙交界", 1_035, 78),
      ] },
      { id: "floor-and-sill", title: "Floor and sill", translation: "地面与门槛", description: "Identify the speckled carpet surface, entrance sill, threshold edge and metal floor strip.", x: 0, y: 675, width: 1_600, height: 225, targetScale: 2.5, labels: [
        label("Elevator-car carpet floor", "电梯轿厢地毯地面", 836, 821), label("Elevator-car speckled carpet finish", "电梯轿厢斑点地毯饰面", 647, 820), label("Elevator-car carpet pile", "电梯轿厢地毯绒面", 990, 821), label("Elevator-car carpet mottling", "电梯轿厢地毯斑驳纹理", 1_060, 855), label("Elevator-car carpet fleck", "电梯轿厢地毯颗粒", 729, 862),
        label("Elevator-car entrance sill plate", "电梯轿厢入口门槛板", 847, 700), label("Elevator-car sill edge", "电梯轿厢门槛边缘", 947, 702), label("Elevator-car sill groove", "电梯轿厢门槛沟槽", 870, 704), label("Elevator-car floor-to-sill joint", "电梯轿厢地面与门槛接缝", 779, 703), label("Elevator-car threshold metal strip", "电梯轿厢门槛金属条", 1_000, 701),
        label("Elevator-car left floor corner", "电梯轿厢左侧地面角", 103, 721), label("Elevator-car right floor corner", "电梯轿厢右侧地面角", 1_421, 768), label("Elevator-car front carpet", "电梯轿厢前部地毯", 660, 787), label("Elevator-car rear carpet", "电梯轿厢后部地毯", 1_095, 815), label("Elevator-car carpet boundary", "电梯轿厢地毯边界", 514, 860),
        label("Elevator-car carpet surface fleck", "电梯轿厢地毯表面颗粒", 1_193, 849), label("Elevator-car carpet pile texture", "电梯轿厢地毯绒面纹理", 681, 779), label("Elevator-car sill end piece", "电梯轿厢门槛端片", 995, 704), label("Elevator-car carpet perimeter", "电梯轿厢地毯周边", 1_257, 818), label("Elevator-car level transition", "电梯轿厢平层过渡面", 953, 700),
        label("Elevator-car carpet nap", "电梯轿厢地毯绒毛", 406, 849), label("Elevator-car carpet surface", "电梯轿厢地毯表面", 560, 797), label("Elevator-car sill channel", "电梯轿厢门槛导槽", 797, 702), label("Elevator-car carpet-to-wall edge", "电梯轿厢地毯与墙面交界", 1_249, 774), label("Elevator-car cabin carpet plane", "电梯轿厢地毯平面", 864, 878),
      ] },
    ],
    portal: null,
    removedExamples: ["floor number", "floor indicator value", "door movement state", "elevator speed", "lift motor", "passenger identity", "emergency event", "manufacturer brand"],
    rationale: "The source image was inspected at native resolution. The view shows the complete lift car, operating panel, mirror, handrails, wall finishes, open doors and floor. Labels describe only visible fittings and surfaces; service states and hidden lift machinery were excluded.",
  },
];

const bridgeZones = scenes[0].zones;
const rightGlazing = bridgeZones[1];
bridgeZones[0].id = "bridge-glazing";
bridgeZones[0].title = "Bridge glazing and side walls";
bridgeZones[0].translation = "廊桥玻璃与侧墙";
bridgeZones[0].description = "Explore the windows, mullions, sills, seals and side-wall panels along both sides of the bridge.";
bridgeZones[0].width = 1_600;
bridgeZones[0].labels = [...bridgeZones[0].labels.slice(0, 13), ...rightGlazing.labels.slice(0, 12)];
bridgeZones.splice(1, 1);

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function slug(value) { return value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""); }

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, next) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (checkOnly) throw new Error(`${path} is not up to date`);
  await writeFile(path, next);
  return true;
}

async function ensureAsset(sceneId) {
  const sourceConfig = sources[sceneId];
  const source = await readFile(resolve(root, sourceConfig.input));
  if (sha256(source) !== sourceConfig.sourceSha256) throw new Error(`${sceneId} source image changed; review anchors again`);
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  const assetSha256 = sha256(output);
  if (sourceConfig.assetSha256 && assetSha256 !== sourceConfig.assetSha256) throw new Error(`${sceneId} JPEG changed; got ${assetSha256}`);
  const outputPath = resolve(publicRoot, sourceConfig.output);
  try {
    if (Buffer.compare(await readFile(outputPath), output) === 0) return assetSha256;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (checkOnly) throw new Error(`${outputPath} is missing`);
  }
  if (checkOnly) throw new Error(`${outputPath} does not match the deterministic asset pipeline`);
  await writeFile(outputPath, output);
  return assetSha256;
}

function makeScene(config, assetSha256) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let sequence = 0;
  for (const zone of config.zones) {
    const labelIds = [];
    for (const item of zone.labels) {
      const itemSlug = slug(item.word);
      const id = `${config.id}-${itemSlug}`;
      const regionId = `${config.id}-region-${itemSlug}`;
      const localIndex = labelIds.length;
      const x = Number(item.x.toFixed(3));
      const y = Number(item.y.toFixed(3));
      labels.push({
        id,
        word: item.word,
        translation: item.translation,
        x,
        y,
        priority: Number((1 + sequence / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + (localIndex % 3),
        sourceVisualRegion: regionId,
        semanticRealmId: config.semanticRealmId,
      });
      visualRegions.push({
        id: regionId,
        description: `${item.word} is visible in the ${zone.title} area of the reviewed image`,
        kind: "part",
        x: Math.max(0, Number((x - 20).toFixed(3))),
        y: Math.max(0, Number((y - 20).toFixed(3))),
        width: 40,
        height: 40,
      });
      labelIds.push(id);
      sequence += 1;
    }
    detailZones.push({
      id: `${config.id}-zone-${zone.id}`,
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
  const asset = `/scenes/${sources[config.id].output}`;
  const portals = [];
  if (config.portal) {
    const { description, ...portal } = config.portal;
    portals.push(portal);
    visualRegions.push({
      id: portal.sourceVisualRegion,
      description,
      kind: "object",
      x: portal.x,
      y: portal.y,
      width: portal.width,
      height: portal.height,
    });
  }
  return {
    id: config.id,
    title: config.title,
    translation: config.translation,
    subtitle: config.subtitle,
    asset,
    width: WIDTH,
    height: HEIGHT,
    parentId: config.parentId,
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: asset,
      reviewedAssetSha256: assetSha256,
      rationale: config.rationale,
      previousLabelCount: labels.length + config.removedExamples.length,
      retainedLabelCount: labels.length,
      removedLabelCount: config.removedExamples.length,
      removedExamples: config.removedExamples,
    },
    labels,
    portals,
  };
}

async function updateParentScene(sceneId, portal) {
  const path = resolve(sceneRoot, `${sceneId}.json`);
  const scene = JSON.parse(await readFile(path, "utf8"));
  const oldTarget = sceneId === "boarding-gate" ? "aircraft-cabin" : "office-elevator-car";
  scene.portals = scene.portals.filter(({ childSceneId }) => childSceneId !== oldTarget && childSceneId !== portal.childSceneId);
  scene.portals.push(portal);
  scene.visualRegions = scene.visualRegions.filter(({ id }) => id !== portal.sourceVisualRegion && id !== "portal-aircraft-cabin");
  scene.visualRegions.push({
    id: portal.sourceVisualRegion,
    description: sceneId === "boarding-gate"
      ? "Open boarding-bridge corridor entrance between the gate lounge and aircraft-side bridge"
      : "Passenger-lift doors and adjacent call panel in the office reception lobby",
    kind: "object",
    x: portal.x,
    y: portal.y,
    width: portal.width,
    height: portal.height,
  });
  return writeIfChanged(path, scene);
}

async function main() {
  const sceneById = Object.fromEntries(scenes.map((scene) => [scene.id, scene]));
  const assetHashes = {};
  for (const config of scenes) assetHashes[config.id] = await ensureAsset(config.id);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  const bridgePortal = {
    id: "enter-passenger-boarding-bridge", label: "Enter the passenger boarding bridge", translation: "进入旅客登机廊桥",
    childSceneId: "passenger-boarding-bridge", sourceVisualRegion: "portal-passenger-boarding-bridge",
    x: 795, y: 195, width: 218, height: 330, enterScale: 3.45,
  };
  const boardingGateChanged = await updateParentScene("boarding-gate", bridgePortal);

  const lobbyPortal = {
    id: "enter-office-elevator-car", label: "Enter the office elevator", translation: "进入写字楼电梯",
    childSceneId: "office-elevator-car", sourceVisualRegion: "portal-office-elevator-car",
    x: 1_044, y: 183, width: 152, height: 180, enterScale: 3.3,
  };
  const receptionLobbyChanged = await updateParentScene("office-reception-lobby", lobbyPortal);

  const bridgeScene = makeScene(sceneById["passenger-boarding-bridge"], assetHashes["passenger-boarding-bridge"]);
  const elevatorScene = makeScene(sceneById["office-elevator-car"], assetHashes["office-elevator-car"]);
  elevatorScene.portals = [];
  const bridgeSceneChanged = await writeIfChanged(resolve(sceneRoot, "passenger-boarding-bridge.json"), bridgeScene);
  const elevatorSceneChanged = await writeIfChanged(resolve(sceneRoot, "office-elevator-car.json"), elevatorScene);

  const cabinPath = resolve(sceneRoot, "aircraft-cabin.json");
  const cabin = JSON.parse(await readFile(cabinPath, "utf8"));
  cabin.parentId = "passenger-boarding-bridge";
  const cabinSceneChanged = await writeIfChanged(cabinPath, cabin);

  for (const [id, parentId] of [
    ["passenger-boarding-bridge", "boarding-gate"],
    ["aircraft-cabin", "passenger-boarding-bridge"],
    ["office-elevator-car", "office-reception-lobby"],
  ]) {
    const existing = manifest.scenes.find(({ id: sceneId }) => sceneId === id);
    if (existing) existing.parentId = parentId;
    else {
      const parentIndex = manifest.scenes.findIndex(({ id: sceneId }) => sceneId === parentId);
      const entry = { id, title: sceneById[id].title, parentId };
      manifest.scenes.splice(parentIndex + 1, 0, entry);
    }
  }
  const changedManifest = await writeIfChanged(manifestPath, manifest);
  console.log(JSON.stringify({
    checkOnly,
    scenes: scenes.map(({ id }) => ({ id, labels: sceneById[id].zones.reduce((sum, zone) => sum + zone.labels.length, 0), sourceSha256: sources[id].sourceSha256, assetSha256: assetHashes[id] })),
    sceneChanged: {
      "boarding-gate": boardingGateChanged,
      "office-reception-lobby": receptionLobbyChanged,
      "passenger-boarding-bridge": bridgeSceneChanged,
      "office-elevator-car": elevatorSceneChanged,
      "aircraft-cabin": cabinSceneChanged,
    },
    manifestChanged: changedManifest,
  }, null, 2));
}

await main();
