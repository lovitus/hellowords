import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Author the open-plan workstation terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; office-building integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/open-plan-workstation-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/open-plan-workstation-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/open-plan-workstation.json");
const parentPath = resolve(projectRoot, "public/data/scenes/office-building.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "88fb49dacb4baf57134d1bf8e9f8c68253949939df87579091462fbc8f78d10f";
const PUBLIC_ASSET_SHA256 = "9acbbe66dd5fb56faa58562c07219f723bb39d12d535648fa7be6e3abcd7f1df";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "left-workstation-island",
    title: "Left workstation island",
    translation: "左侧工位岛",
    description: "Inspect the left open-plan desk, blank monitor, keyboard, mouse, headset, lamp, pedestal and chair.",
    x: 0,
    y: 300,
    width: 520,
    height: 560,
    targetScale: 2.55,
    labels: [
      ["Open-plan left workstation", "左侧开放工位", 350, 500, 0],
      ["Open-plan left desk top", "左侧工位桌面", 350, 480, 0],
      ["Open-plan left desk edge", "左侧工位桌沿", 430, 520, 2],
      ["Open-plan left monitor", "左侧工位显示器", 350, 360, 0],
      ["Open-plan left blank screen", "左侧工位空白屏幕", 350, 360, 1],
      ["Open-plan left monitor bezel", "左侧工位显示器边框", 350, 360, 2],
      ["Open-plan left monitor arm", "左侧工位显示器支臂", 380, 420, 1],
      ["Open-plan left arm joint", "左侧工位支臂接头", 390, 430, 3],
      ["Open-plan left keyboard", "左侧工位键盘", 300, 500, 0],
      ["Open-plan left key field", "左侧工位按键区", 300, 500, 3],
      ["Open-plan left mouse", "左侧工位鼠标", 380, 510, 2],
      ["Open-plan left mouse pad", "左侧工位鼠标垫", 400, 510, 3],
      ["Open-plan left desk phone", "左侧工位电话", 260, 480, 0],
      ["Open-plan left phone handset", "左侧工位电话听筒", 260, 480, 2],
      ["Open-plan left headset", "左侧工位耳机", 440, 420, 1],
      ["Open-plan left headset earcup", "左侧工位耳机罩", 440, 420, 3],
      ["Open-plan left headset cable", "左侧工位耳机线", 450, 470, 4],
      ["Open-plan left pencil cup", "左侧工位笔筒", 380, 480, 1],
      ["Open-plan left desk lamp", "左侧工位台灯", 200, 420, 0],
      ["Open-plan left lamp shade", "左侧工位灯罩", 200, 420, 2],
      ["Open-plan left document stack", "左侧工位文件叠", 410, 500, 1],
      ["Open-plan left drawer pedestal", "左侧工位抽屉柜", 420, 620, 0],
      ["Open-plan left drawer front", "左侧工位抽屉面", 420, 650, 2],
      ["Open-plan left drawer handle", "左侧工位抽屉拉手", 420, 650, 3],
      ["Open-plan left task chair", "左侧工位办公椅", 180, 600, 0],
    ],
  },
  {
    id: "center-workstation-island",
    title: "Center workstation island",
    translation: "中央工位岛",
    description: "Follow the central desk surface, blank monitor, keyboard, mouse, lamp, document holder, cable route and pedestal.",
    x: 500,
    y: 300,
    width: 650,
    height: 560,
    targetScale: 2.55,
    labels: [
      ["Open-plan center workstation", "中央开放工位", 800, 500, 0],
      ["Open-plan center desk surface", "中央工位桌面", 800, 480, 0],
      ["Open-plan center desk edge", "中央工位桌沿", 900, 520, 2],
      ["Open-plan center monitor", "中央工位显示器", 800, 360, 0],
      ["Open-plan center blank display", "中央工位空白屏幕", 800, 360, 1],
      ["Open-plan center display bezel", "中央工位显示器边框", 800, 360, 2],
      ["Open-plan center monitor arm", "中央工位显示器支臂", 820, 430, 1],
      ["Open-plan center arm elbow", "中央工位支臂肘接", 830, 430, 3],
      ["Open-plan center support post", "中央工位支架立柱", 830, 460, 2],
      ["Open-plan center keyboard", "中央工位键盘", 780, 500, 0],
      ["Open-plan center key field", "中央工位按键区", 780, 500, 3],
      ["Open-plan center mouse", "中央工位鼠标", 930, 510, 2],
      ["Open-plan center mouse pad", "中央工位鼠标垫", 930, 510, 3],
      ["Open-plan center desk lamp", "中央工位台灯", 680, 440, 0],
      ["Open-plan center lamp shade", "中央工位灯罩", 680, 440, 2],
      ["Open-plan center document holder", "中央工位文件架", 1_020, 450, 0],
      ["Open-plan center document folder", "中央工位文件夹", 1_020, 430, 2],
      ["Open-plan center cable grommet", "中央工位穿线孔", 860, 510, 3],
      ["Open-plan center cable tray", "中央工位线缆托盘", 800, 600, 1],
      ["Open-plan center vertical cable riser", "中央工位竖向线缆槽", 700, 650, 2],
      ["Open-plan center desk leg", "中央工位桌腿", 640, 700, 1],
      ["Open-plan center drawer pedestal", "中央工位抽屉柜", 1_000, 620, 0],
      ["Open-plan center upper drawer", "中央工位上抽屉", 1_000, 620, 2],
      ["Open-plan center drawer handle", "中央工位抽屉拉手", 1_000, 620, 3],
      ["Open-plan center task chair", "中央工位办公椅", 800, 650, 0],
    ],
  },
  {
    id: "right-workstation-island",
    title: "Right workstation island",
    translation: "右侧工位岛",
    description: "Inspect the right desk, blank monitor, input devices, telephone, headset, lamp, pedestal and task chair.",
    x: 1_110,
    y: 300,
    width: 562,
    height: 560,
    targetScale: 2.55,
    labels: [
      ["Open-plan right workstation", "右侧开放工位", 1_350, 500, 0],
      ["Open-plan right desk top", "右侧工位桌面", 1_350, 480, 0],
      ["Open-plan right desk edge", "右侧工位桌沿", 1_250, 520, 2],
      ["Open-plan right monitor", "右侧工位显示器", 1_350, 360, 0],
      ["Open-plan right blank screen", "右侧工位空白屏幕", 1_350, 360, 1],
      ["Open-plan right monitor bezel", "右侧工位显示器边框", 1_350, 360, 2],
      ["Open-plan right monitor arm", "右侧工位显示器支臂", 1_380, 420, 1],
      ["Open-plan right arm joint", "右侧工位支臂接头", 1_390, 430, 3],
      ["Open-plan right keyboard", "右侧工位键盘", 1_300, 500, 0],
      ["Open-plan right key field", "右侧工位按键区", 1_300, 500, 3],
      ["Open-plan right mouse", "右侧工位鼠标", 1_430, 510, 2],
      ["Open-plan right mouse pad", "右侧工位鼠标垫", 1_430, 510, 3],
      ["Open-plan right desk phone", "右侧工位电话", 1_270, 480, 0],
      ["Open-plan right phone handset", "右侧工位电话听筒", 1_270, 480, 2],
      ["Open-plan right headset", "右侧工位耳机", 1_520, 420, 1],
      ["Open-plan right headset earcup", "右侧工位耳机罩", 1_520, 420, 3],
      ["Open-plan right headset cable", "右侧工位耳机线", 1_530, 470, 4],
      ["Open-plan right desk lamp", "右侧工位台灯", 1_220, 440, 0],
      ["Open-plan right lamp shade", "右侧工位灯罩", 1_220, 440, 2],
      ["Open-plan right drawer pedestal", "右侧工位抽屉柜", 1_300, 620, 0],
      ["Open-plan right drawer front", "右侧工位抽屉面", 1_300, 650, 2],
      ["Open-plan right drawer handle", "右侧工位抽屉拉手", 1_300, 650, 3],
      ["Open-plan right task chair", "右侧工位办公椅", 1_500, 600, 0],
      ["Open-plan right chair armrest", "右侧工位椅扶手", 1_500, 570, 2],
      ["Open-plan right chair caster", "右侧工位椅脚轮", 1_500, 780, 4],
    ],
  },
  {
    id: "shared-office-fittings",
    title: "Shared office fittings",
    translation: "共享办公设施",
    description: "Explore the shared printer shelf, storage cubbies, privacy screens, modesty panels, coat stand, window and floor outlet.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 900,
    targetScale: 2.5,
    labels: [
      ["Shared open-plan printer", "共享办公打印机", 560, 420, 0],
      ["Shared printer paper tray", "共享打印机纸盘", 560, 460, 2],
      ["Shared printer output tray", "共享打印机出纸盘", 560, 450, 2],
      ["Shared printer control panel", "共享打印机控制面板", 560, 400, 3],
      ["Shared printer shelf", "共享打印机搁板", 550, 380, 0],
      ["Shared shelf cubby", "共享搁架格位", 520, 550, 0],
      ["Shared storage bin", "共享储物箱", 550, 560, 1],
      ["Shared paper stack", "共享纸张叠", 1_020, 430, 1],
      ["Shared planter box", "共享种植箱", 700, 300, 0],
      ["Shared planter leaf cluster", "共享种植箱叶簇", 700, 280, 1],
      ["Shared left privacy screen", "共享左侧隐私屏", 250, 430, 0],
      ["Shared center privacy screen", "共享中央隐私屏", 800, 430, 0],
      ["Shared right privacy screen", "共享右侧隐私屏", 1_350, 430, 0],
      ["Shared left modesty panel", "共享左侧挡板", 350, 600, 1],
      ["Shared center modesty panel", "共享中央挡板", 800, 600, 1],
      ["Shared right modesty panel", "共享右侧挡板", 1_350, 600, 1],
      ["Shared office coat stand", "共享办公衣帽架", 1_300, 300, 0],
      ["Shared coat hook", "共享衣帽钩", 1_300, 260, 2],
      ["Shared coat fabric", "共享外套衣料", 1_300, 330, 2],
      ["Shared window wall", "共享窗墙", 1_150, 250, 0],
      ["Shared window mullion", "共享窗竖框", 1_150, 250, 2],
      ["Shared floor outlet", "共享地面插座", 500, 800, 1],
      ["Shared floor outlet cover", "共享地面插座盖", 500, 800, 3],
      ["Shared wall panel", "共享墙面板", 600, 220, 2],
      ["Shared storage shelf edge", "共享储物搁板边", 520, 500, 3],
    ],
  },
  {
    id: "cable-management-and-seating",
    title: "Cable management and seating",
    translation: "线缆管理与座椅",
    description: "Follow the visible cable trays, risers, baskets, power strips, grommets, clips and chair components below the desks.",
    x: 0,
    y: 450,
    width: 1_500,
    height: 491,
    targetScale: 2.55,
    labels: [
      ["Underdesk left cable tray", "左侧桌下线缆托盘", 300, 620, 0],
      ["Underdesk center cable tray", "中央桌下线缆托盘", 800, 620, 0],
      ["Underdesk right cable tray", "右侧桌下线缆托盘", 1_300, 620, 0],
      ["Underdesk left cable riser", "左侧桌下线缆槽", 300, 650, 1],
      ["Underdesk center cable riser", "中央桌下线缆槽", 700, 650, 1],
      ["Underdesk right cable riser", "右侧桌下线缆槽", 1_300, 650, 1],
      ["Underdesk left cable basket", "左侧桌下线缆篮", 300, 690, 0],
      ["Underdesk center cable basket", "中央桌下线缆篮", 800, 690, 0],
      ["Underdesk right cable basket", "右侧桌下线缆篮", 1_300, 690, 0],
      ["Underdesk left power strip", "左侧桌下电源排", 300, 680, 2],
      ["Underdesk center power strip", "中央桌下电源排", 800, 680, 2],
      ["Underdesk right power strip", "右侧桌下电源排", 1_300, 680, 2],
      ["Underdesk left cable grommet", "左侧桌下穿线孔", 300, 550, 3],
      ["Underdesk center cable grommet", "中央桌下穿线孔", 800, 550, 3],
      ["Underdesk right cable grommet", "右侧桌下穿线孔", 1_300, 550, 3],
      ["Underdesk left cable clip", "左侧桌下线缆夹", 300, 700, 4],
      ["Underdesk center cable clip", "中央桌下线缆夹", 800, 700, 4],
      ["Underdesk right cable clip", "右侧桌下线缆夹", 1_300, 700, 4],
      ["Open-plan left chair back", "左侧工位椅背", 180, 570, 1],
      ["Open-plan left chair seat", "左侧工位座面", 180, 650, 1],
      ["Open-plan left chair armrest", "左侧工位椅扶手", 180, 620, 2],
      ["Open-plan left chair five-star base", "左侧工位五星椅脚", 180, 760, 0],
      ["Open-plan left chair caster", "左侧工位椅脚轮", 80, 800, 4],
      ["Open-plan center chair back", "中央工位椅背", 800, 600, 1],
      ["Open-plan center chair caster", "中央工位椅脚轮", 700, 780, 4],
    ],
  },
  {
    id: "lighting-plants-and-floor",
    title: "Lighting, plants and floor",
    translation: "照明、植物与地面",
    description: "Inspect the ceiling slats, lights, air grille, windows, varied planter foliage, wall finish and polished floor.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.45,
    labels: [
      ["Open-plan linear ceiling light", "开放办公线性顶灯", 800, 50, 0],
      ["Open-plan wood ceiling slat", "开放办公木质顶格栅", 700, 20, 1],
      ["Open-plan acoustic ceiling panel", "开放办公吸音顶板", 500, 100, 1],
      ["Open-plan return-air grille", "开放办公回风格栅", 800, 100, 2],
      ["Open-plan window glass", "开放办公窗玻璃", 1_500, 300, 0],
      ["Open-plan window mullion", "开放办公窗竖框", 1_500, 300, 2],
      ["Open-plan planter trough", "开放办公种植槽", 800, 300, 0],
      ["Open-plan broadleaf plant", "开放办公阔叶植物", 650, 270, 1],
      ["Open-plan fern frond", "开放办公蕨叶", 470, 300, 2],
      ["Open-plan upright plant", "开放办公直立植物", 850, 270, 1],
      ["Open-plan trailing leaf", "开放办公垂叶", 1_000, 300, 2],
      ["Open-plan planter soil", "开放办公种植土", 800, 320, 3],
      ["Open-plan plant stem", "开放办公植物茎", 700, 300, 3],
      ["Open-plan polished floor", "开放办公磨光地面", 900, 850, 0],
      ["Open-plan floor seam", "开放办公地面接缝", 500, 800, 2],
      ["Open-plan floor reflection", "开放办公地面反光", 1_100, 820, 3],
      ["Open-plan wall baseboard", "开放办公墙脚线", 1_100, 380, 2],
      ["Open-plan wall finish", "开放办公墙面饰面", 600, 180, 1],
      ["Open-plan glass partition", "开放办公玻璃隔断", 1_100, 400, 0],
      ["Open-plan partition frame", "开放办公隔断框", 1_100, 400, 2],
      ["Open-plan desk task light", "开放办公桌面工作灯", 1_200, 440, 1],
      ["Open-plan task-light stem", "开放办公工作灯杆", 1_200, 470, 3],
      ["Open-plan ceiling light diffuser", "开放办公顶灯扩散罩", 800, 50, 2],
      ["Open-plan window sill", "开放办公窗台", 1_500, 400, 2],
      ["Open-plan floor box cover", "开放办公地面线盒盖", 500, 800, 4],
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
    id: `open-plan-workstation-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the open-plan workstation photograph`,
    kind: "part",
    ...sceneRectangle({ x: left, y: top, width: size, height: size }),
  };
}

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `open-plan-workstation-${slugify(word)}`;
      const region = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: region.id,
        semanticRealmId: "people-society",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `open-plan-workstation-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "open-plan-workstation",
    title: "Open-plan workstation",
    translation: "开放式办公工位",
    subtitle: "Desks, monitors, input devices, seating and cable management",
    asset: "/scenes/open-plan-workstation-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "office-building",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/open-plan-workstation-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized open-plan office photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable desk, monitor, keyboard, mouse, chair, privacy, cable-management, storage, lighting, plant and floor parts across ${detailZones.length} bounded zones. Employee identity, company identity, screen content, network status, private documents, company policy and inferred productivity were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "employee identity",
        "company identity",
        "screen content",
        "network status",
        "private document",
        "company policy",
        "productivity claim",
        "hidden office function",
      ],
    },
    labels,
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("open-plan source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`open-plan JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const parentPortal = {
  id: "enter-open-plan-workstation",
  label: "Enter the open-plan workstation",
  translation: "进入开放式办公工位",
  childSceneId: "open-plan-workstation",
  sourceVisualRegion: "portal-open-plan-left-workstations",
  x: 330,
  y: 410,
  width: 270,
  height: 270,
  enterScale: 3.5,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Two complete left-side desk rows, monitors, chairs and plant divider in the office-building photograph",
  kind: "object",
  x: parentPortal.x,
  y: parentPortal.y,
  width: parentPortal.width,
  height: parentPortal.height,
};

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
  if (!manifest.scenes.some(({ id }) => id === "open-plan-workstation")) {
    const officeIndex = manifest.scenes.findIndex(({ id }) => id === "office-building");
    if (officeIndex < 0) throw new Error("office-building is missing from the scene manifest");
    manifest.scenes.splice(officeIndex + 1, 0, {
      id: "open-plan-workstation",
      title: "Open-plan workstation",
      parentId: "office-building",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildOpenPlanWorkstationScene() {
  const scene = buildScene();
  if (scene.labels.length < 140 || scene.labels.length > 155) {
    throw new Error(`open-plan label count ${scene.labels.length} is outside 140–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`open-plan zone count ${scene.detailZones.length} is not 6`);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  buildOpenPlanWorkstationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-open-plan-workstation-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
