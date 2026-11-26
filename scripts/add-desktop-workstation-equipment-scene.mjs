import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  desktopWorkstationPortal as parentPortal,
  desktopWorkstationPortalRegion as parentRegion,
} from "./add-open-plan-workstation-scene.mjs";

/**
 * Author the desktop workstation equipment terminal scene from its reviewed
 * source raster. The default command writes only this scene JSON and verifies
 * both image tiers. Pass --integrate after review to connect the visible
 * centre workstation in the open-plan parent and update the manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/desktop-workstation-equipment-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/desktop-workstation-equipment-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/desktop-workstation-equipment.json");
const parentPath = resolve(projectRoot, "public/data/scenes/open-plan-workstation.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "e8a02343bf2ea6114bb655c03bc6c0891654a48f583446cec9332a918b1f34e1";
const PUBLIC_ASSET_SHA256 = "1018242a50cc54d8d7eba6d9a0d6725037ed446fbfc8cdab2c5bf731f993d8a7";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "monitor-and-arm",
    title: "Monitor and arm",
    translation: "显示器与支臂",
    description: "Inspect the blank monitor, its bezel, the two joints on the support arm and its base plate.",
    x: 160,
    y: 30,
    width: 1_000,
    height: 430,
    targetScale: 2.65,
    labels: [
      ["Desktop station primary monitor", "桌面工位主显示器", 679, 161, 0],
      ["Desktop station blank screen", "桌面工位空白屏幕", 859, 106, 1],
      ["Desktop station screen bezel", "桌面工位屏幕边框", 810, 258, 2],
      ["Desktop station upper bezel", "桌面工位屏幕上边框", 761, 47, 3],
      ["Desktop station lower bezel", "桌面工位屏幕下边框", 670, 259, 3],
      ["Desktop station left screen edge", "桌面工位屏幕左边缘", 593, 129, 4],
      ["Desktop station right screen edge", "桌面工位屏幕右边缘", 986, 179, 4],
      ["Desktop station display corner", "桌面工位显示屏角", 984, 48, 4],
      ["Desktop station monitor arm", "桌面工位显示器支臂", 1023, 326, 0],
      ["Desktop station arm upper joint", "桌面工位支臂上接头", 1090, 261, 2],
      ["Desktop station arm lower joint", "桌面工位支臂下接头", 971, 361, 2],
      ["Desktop station arm clamp", "桌面工位支臂夹具"],
      ["Desktop station VESA plate", "桌面工位 VESA 挂板"],
      ["Desktop station arm cable clip", "桌面工位支臂线夹"],
      ["Desktop station display power cable", "桌面工位显示电源线"],
      ["Desktop station display signal cable", "桌面工位显示信号线"],
      ["Desktop station monitor mounting plate", "桌面工位显示器安装板"],
      ["Desktop station monitor rear housing", "桌面工位显示器后壳"],
      ["Desktop station monitor lower ledge", "桌面工位显示器下沿", 900, 264, 3],
      ["Desktop station tilt hinge", "桌面工位倾斜铰链"],
      ["Desktop station cable sleeve", "桌面工位线缆套"],
      ["Desktop station monitor support bracket", "桌面工位显示器支架"],
      ["Desktop station arm gas spring", "桌面工位支臂气弹簧"],
      ["Desktop station arm cable channel", "桌面工位支臂线槽"],
      ["Desktop station arm base plate", "桌面工位支臂底板", 986, 407, 4],
    ],
  },
  {
    id: "desktop-inputs-and-dock",
    title: "Desktop inputs and dock",
    translation: "桌面输入设备与扩展坞",
    description: "Follow the blank laptop, docking station, keyboard, keypad, mouse, document holder and desk accessories.",
    x: 0,
    y: 40,
    width: 1_250,
    height: 550,
    targetScale: 2.6,
    labels: [
      ["Desktop station laptop", "桌面工位笔记本电脑", 481, 415, 0],
      ["Desktop station laptop blank screen", "桌面工位笔记本空白屏幕", 517, 341, 1],
      ["Desktop station laptop bezel", "桌面工位笔记本边框", 505, 298, 2],
      ["Desktop station laptop keyboard", "桌面工位笔记本键盘", 477, 407, 0],
      ["Desktop station laptop key field", "桌面工位笔记本按键区", 541, 403, 3],
      ["Desktop station laptop trackpad", "桌面工位笔记本触控板"],
      ["Desktop station laptop hinge", "桌面工位笔记本铰链"],
      ["Desktop station USB-C docking station", "桌面工位 USB-C 扩展坞", 783, 394, 0],
      ["Desktop station dock top panel", "桌面工位扩展坞顶板", 800, 384, 2],
      ["Desktop station dock port row", "桌面工位扩展坞接口列", 849, 399, 3],
      ["Desktop station dock power lead", "桌面工位扩展坞电源线"],
      ["Desktop station dock video cable", "桌面工位扩展坞视频线"],
      ["Desktop station full-size keyboard", "桌面工位全尺寸键盘", 690, 456, 0],
      ["Desktop station keyboard key field", "桌面工位键盘按键区", 753, 437, 2],
      ["Desktop station keyboard numeric cluster", "桌面工位键盘数字区", 931, 438, 3],
      ["Desktop station separate numeric keypad", "桌面工位独立数字键盘", 1027, 455, 0],
      ["Desktop station keypad key field", "桌面工位数字键盘按键区", 1016, 437, 3],
      ["Desktop station desktop mouse", "桌面工位鼠标", 1174, 444, 1],
      ["Desktop station mouse pad", "桌面工位鼠标垫", 1227, 451, 2],
      ["Desktop station notebook", "桌面工位笔记本", 351, 464, 0],
      ["Desktop station notebook cover", "桌面工位笔记本封面", 337, 447, 2],
      ["Desktop station document holder", "桌面工位文件架", 279, 340, 0],
      ["Desktop station document paper stack", "桌面工位文件纸叠", 285, 271, 2],
      ["Desktop station pencil cup", "桌面工位笔筒", 346, 394, 1],
      ["Desktop station task lamp", "桌面工位台灯", 338, 106, 0],
    ],
  },
  {
    id: "desk-surface-and-storage",
    title: "Desk surface and storage",
    translation: "桌面与储物柜",
    description: "Inspect the work surface, rounded edges, desk legs, modesty panel and closed drawer pedestal.",
    x: 0,
    y: 175,
    width: 1_672,
    height: 746,
    targetScale: 2.55,
    labels: [
      ["Desktop station desk surface", "桌面工位工作台面", 528, 454, 0],
      ["Desktop station desk front edge", "桌面工位桌面前沿", 871, 484, 2],
      ["Desktop station desk left corner", "桌面工位桌面左角", 35, 471, 3],
      ["Desktop station desk right corner", "桌面工位桌面右角", 1644, 472, 3],
      ["Desktop station left desk leg", "桌面工位左桌腿", 175, 705, 0],
      ["Desktop station right desk leg", "桌面工位右桌腿"],
      ["Desktop station left height column", "桌面工位左升降柱", 169, 537, 1],
      ["Desktop station right height column", "桌面工位右升降柱"],
      ["Desktop station left leg foot", "桌面工位左桌脚", 137, 891, 2],
      ["Desktop station right leg foot", "桌面工位右桌脚"],
      ["Desktop station underdesk support beam", "桌面工位桌下支撑梁"],
      ["Desktop station modesty panel", "桌面工位桌下挡板", 811, 641, 0],
      ["Desktop station drawer pedestal", "桌面工位抽屉柜", 1530, 816, 0],
      ["Desktop station pedestal top", "桌面工位抽屉柜顶板", 1542, 552, 2],
      ["Desktop station top drawer", "桌面工位上抽屉", 1571, 615, 1],
      ["Desktop station middle drawer", "桌面工位中抽屉", 1570, 679, 1],
      ["Desktop station bottom drawer", "桌面工位下抽屉", 1481, 839, 1],
      ["Desktop station top drawer handle", "桌面工位上抽屉拉手", 1501, 582, 3],
      ["Desktop station middle drawer handle", "桌面工位中抽屉拉手", 1504, 657, 3],
      ["Desktop station bottom drawer handle", "桌面工位下抽屉拉手", 1491, 733, 3],
      ["Desktop station drawer lock cylinder", "桌面工位抽屉锁芯", 1601, 584, 4],
      ["Desktop station pedestal side panel", "桌面工位抽屉柜侧板"],
      ["Desktop station pedestal base", "桌面工位抽屉柜底座"],
      ["Desktop station desktop privacy panel", "桌面工位桌面隐私板", 1113, 190, 0],
      ["Desktop station desk-side shelf", "桌面工位侧置搁板"],
    ],
  },
  {
    id: "chair-and-ergonomics",
    title: "Chair and ergonomics",
    translation: "办公椅与人体工学部件",
    description: "Explore the mesh task chair, lumbar support, armrests, adjustment hardware, five-star base and casters.",
    x: 900,
    y: 280,
    width: 772,
    height: 661,
    targetScale: 2.55,
    labels: [
      ["Desktop station ergonomic task chair", "桌面工位人体工学椅", 1288, 662, 0],
      ["Desktop station mesh backrest", "桌面工位网布椅背", 1396, 414, 1],
      ["Desktop station lumbar support", "桌面工位腰部支撑", 1403, 596, 2],
      ["Desktop station seat pan", "桌面工位座板"],
      ["Desktop station seat cushion", "桌面工位座垫", 1024, 685, 2],
      ["Desktop station left armrest", "桌面工位左扶手"],
      ["Desktop station right armrest", "桌面工位右扶手"],
      ["Desktop station armrest pad", "桌面工位扶手垫", 1101, 555, 3],
      ["Desktop station backrest frame", "桌面工位椅背框架", 1434, 323, 2],
      ["Desktop station backrest tilt joint", "桌面工位椅背倾仰接头"],
      ["Desktop station seat-height lever", "桌面工位座高调节杆", 1083, 790, 3],
      ["Desktop station recline tension knob", "桌面工位后仰张力旋钮", 1191, 804, 4],
      ["Desktop station gas-lift column", "桌面工位气压升降柱", 1247, 823, 1],
      ["Desktop station five-star base", "桌面工位五星椅脚", 1172, 887, 0],
      ["Desktop station front-left caster", "桌面工位左前脚轮"],
      ["Desktop station front-right caster", "桌面工位右前脚轮"],
      ["Desktop station rear-left caster", "桌面工位左后脚轮"],
      ["Desktop station rear-right caster", "桌面工位右后脚轮"],
      ["Desktop station caster stem", "桌面工位脚轮杆"],
      ["Desktop station caster wheel", "桌面工位脚轮", 1064, 898, 3],
      ["Desktop station base hub", "桌面工位椅脚中心", 1245, 868, 3],
      ["Desktop station chair side frame", "桌面工位椅侧框", 1351, 748, 2],
      ["Desktop station back support", "桌面工位椅背支撑", 1311, 612, 2],
      ["Desktop station armrest post", "桌面工位扶手立柱", 1115, 665, 3],
      ["Desktop station seat edge", "桌面工位座面边缘", 999, 716, 3],
    ],
  },
  {
    id: "underdesk-cables-and-power",
    title: "Under-desk cables and power",
    translation: "桌下线缆与电源",
    description: "Follow the cable basket beneath the desk, the clips along its back and the cable riser down to the floor box.",
    x: 200,
    y: 450,
    width: 1_300,
    height: 491,
    targetScale: 2.6,
    labels: [
      ["Desktop station underdesk cable tray", "桌面工位桌下线缆托盘", 751, 555, 0],
      ["Desktop station cable tray cover", "桌面工位线缆托盘盖"],
      ["Desktop station cable basket", "桌面工位线缆篮", 406, 524, 0],
      ["Desktop station vertical cable riser", "桌面工位竖向线缆槽", 507, 649, 1],
      ["Desktop station riser base", "桌面工位线缆槽底座", 486, 825, 3],
      ["Desktop station power strip", "桌面工位电源排"],
      ["Desktop station power-strip outlet row", "桌面工位电源排插孔列"],
      ["Desktop station surge protector", "桌面工位浪涌保护器"],
      ["Desktop station dock cable bundle", "桌面工位扩展坞线束"],
      ["Desktop station monitor cable bundle", "桌面工位显示线束"],
      ["Desktop station keyboard cable", "桌面工位键盘线"],
      ["Desktop station mouse cable", "桌面工位鼠标线"],
      ["Desktop station strain-relief clip", "桌面工位应力释放夹"],
      ["Desktop station left cable clip", "桌面工位左线夹", 278, 526, 3],
      ["Desktop station center cable clip", "桌面工位中线夹", 514, 527, 3],
      ["Desktop station right cable clip", "桌面工位右线夹", 1199, 526, 3],
      ["Desktop station floor power box", "桌面工位地面电源盒", 663, 828, 0],
      ["Desktop station power-box cover", "桌面工位电源盒盖"],
      ["Desktop station floor cable outlet", "桌面工位地面线缆口", 698, 820, 2],
      ["Desktop station woven cable sleeve", "桌面工位编织线缆套"],
      ["Desktop station cable loop", "桌面工位线缆环", 598, 585, 2],
      ["Desktop station underdesk wire channel", "桌面工位桌下线槽", 462, 548, 0],
      ["Desktop station leg cable clamp", "桌面工位桌腿线夹"],
      ["Desktop station tray support bracket", "桌面工位托盘支架"],
      ["Desktop station tray hinge", "桌面工位托盘铰链"],
    ],
  },
  {
    id: "room-lighting-and-floor",
    title: "Room lighting and floor",
    translation: "房间照明与地面",
    description: "Explore the window, fabric divider, potted plant, recycling bin and the edge of the carpet.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.45,
    labels: [
      ["Desktop station room window wall", "桌面工位房间窗墙", 1530, 181, 0],
      ["Desktop station window glass pane", "桌面工位窗玻璃", 1481, 115, 1],
      ["Desktop station window mullion", "桌面工位窗竖框", 1639, 134, 2],
      ["Desktop station privacy-panel fabric", "桌面工位隐私板面料", 706, 318, 0],
      ["Desktop station privacy-panel top edge", "桌面工位隐私板上沿", 564, 180, 2],
      ["Desktop station planter trough", "桌面工位种植槽"],
      ["Desktop station broadleaf plant", "桌面工位阔叶植物", 1562, 366, 1],
      ["Desktop station left leaf cluster", "桌面工位左叶簇"],
      ["Desktop station center leaf cluster", "桌面工位中央叶簇"],
      ["Desktop station plant pot", "桌面工位花盆", 1515, 418, 0],
      ["Desktop station plant stem", "桌面工位植物茎"],
      ["Desktop station coat stand", "桌面工位衣帽架"],
      ["Desktop station coat hook", "桌面工位衣帽钩"],
      ["Desktop station coat fabric", "桌面工位外套衣料"],
      ["Desktop station linear ceiling light", "桌面工位线性顶灯"],
      ["Desktop station wood ceiling slat", "桌面工位木质顶格栅"],
      ["Desktop station acoustic ceiling panel", "桌面工位吸音顶板"],
      ["Desktop station return-air grille", "桌面工位回风格栅"],
      ["Desktop station wall finish panel", "桌面工位墙面饰板", 267, 76, 1],
      ["Desktop station glass partition", "桌面工位玻璃隔断"],
      ["Desktop station partition frame", "桌面工位隔断框"],
      ["Desktop station polished floor", "桌面工位磨光地面", 715, 736, 0],
      ["Desktop station carpet runner", "桌面工位地毯", 885, 844, 1],
      ["Desktop station carpet edge", "桌面工位地毯边", 760, 776, 3],
      ["Desktop station recycling bin", "桌面工位回收桶", 264, 761, 0],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
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

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `desktop-workstation-equipment-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the desktop workstation photograph`,
    kind: "part",
    ...sceneRectangle({ x: left, y: top, width: size, height: size }),
  };
}

function buildScene() {
  const labels = [];
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `desktop-workstation-equipment-${slugify(word)}`;
      const priority = Number((1 + priorityIndex++ / 1000).toFixed(6));
      if (x === undefined) {
        relatedWords.push({ id, word, translation });
        continue;
      }
      const region = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority,
        minLevel,
        sourceVisualRegion: region.id,
        semanticRealmId: "people-society",
      });
      visualRegions.push(region);
      labelIds.push(id);
    }
    detailZones.push({
      id: `desktop-workstation-equipment-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "desktop-workstation-equipment",
    title: "Desktop workstation equipment",
    translation: "桌面工位设备",
    subtitle: "Monitor, dock, keyboard, mouse, chair and cable management",
    asset: "/scenes/desktop-workstation-equipment-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "open-plan-workstation",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/desktop-workstation-equipment-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The mouse and pad, monitor glass and bezel, drawer handles and task lamp have distinct locations in the reviewed photograph. ${labels.length} photographed objects and parts remain pointable. ${relatedWords.length} terms are available in the index only, including the hidden monitor rear housing and the coat stand previously placed on hanging headphones. Eight unrelated entries were excluded in the original audit.`,
      previousLabelCount: 158,
      retainedLabelCount: labels.length,
      removedLabelCount: relatedWords.length + 8,
      removedExamples: [
        "Desktop station coat stand",
        "Desktop station monitor rear housing",
        "Desktop station tray hinge",
        "employee identity",
      ],
    },
    labels,
    relatedWords,
    portals: [],
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

async function ensureAsset() {
  const source = await readFile(sourceAsset);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("desktop workstation source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`desktop workstation JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === parentPortal.id);
  if (portalIndex >= 0) parent.portals[portalIndex] = parentPortal;
  else parent.portals.push(parentPortal);
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion;
  else parent.visualRegions.push(parentRegion);
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "desktop-workstation-equipment")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "open-plan-workstation");
    if (parentIndex < 0) throw new Error("open-plan-workstation is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "desktop-workstation-equipment",
      title: "Desktop workstation equipment",
      parentId: "open-plan-workstation",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildDesktopWorkstationEquipmentScene() {
  const scene = buildScene();
  if (scene.labels.length + scene.relatedWords.length !== 150) {
    throw new Error("Desktop workstation must retain its 150 scene words");
  }
  if (scene.detailZones.length !== 6) throw new Error(`desktop workstation zone count ${scene.detailZones.length} is not 6`);
  const result = {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildDesktopWorkstationEquipmentScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-desktop-workstation-equipment-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
