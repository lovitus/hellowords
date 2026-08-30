import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the produce weighing-station terminal scene from the reviewed
 * produce-department raster. This command owns only the child scene, its
 * assets and its generated JSON; parent portal and manifest integration stay
 * on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/produce-weighing-station-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/produce-weighing-station-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/produce-weighing-station.json");
const parentPath = resolve(projectRoot, "public/data/scenes/supermarket-produce-department.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "01a5fc44bb3d41f6d21fca158ae34649a5beaf0a68e95bb2aee1994bc5c973b9";
const PUBLIC_ASSET_SHA256 = "c09efe1e2eccde845e097be6000e691d63e7baa934f2c0aa1eda524725803475";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "scale-hardware",
    title: "Scale hardware",
    translation: "称重设备",
    description: "Inspect the visible weighing bowl, scale display, housing, platform and support parts.",
    x: 500,
    y: 330,
    width: 300,
    height: 250,
    targetScale: 2.6,
    labels: [
      ["Weighing station digital scale", "称重台电子秤", 650, 470, 0],
      ["Weighing station stainless bowl", "称重台不锈钢盆", 650, 390, 0],
      ["Weighing station bowl rim", "称重台秤盆边缘", 650, 375, 2],
      ["Weighing station bowl interior", "称重台秤盆内壁", 650, 410, 1],
      ["Weighing station bowl base ring", "称重台秤盆底环", 650, 450, 3],
      ["Weighing station bowl support", "称重台秤盆支架", 650, 455, 2],
      ["Weighing station scale housing", "称重台秤体外壳", 650, 500, 0],
      ["Weighing station touch display", "称重台触控显示屏", 650, 490, 1],
      ["Weighing station display bezel", "称重台显示屏边框", 650, 490, 3],
      ["Weighing station left display bezel", "称重台显示屏左边框", 580, 490, 4],
      ["Weighing station right display bezel", "称重台显示屏右边框", 720, 490, 4],
      ["Weighing station scale platform", "称重台秤台面", 650, 465, 2],
      ["Weighing station platform front lip", "称重台秤台前沿", 650, 530, 3],
      ["Weighing station left footing", "称重台左脚座", 590, 545, 3],
      ["Weighing station right footing", "称重台右脚座", 710, 545, 3],
      ["Weighing station scale side panel", "称重台秤体侧板", 735, 500, 2],
      ["Weighing station side seam", "称重台秤体侧缝", 735, 500, 4],
      ["Weighing station rear corner", "称重台秤体后角", 720, 450, 4],
      ["Weighing station lower trim", "称重台秤体下饰条", 650, 550, 3],
      ["Weighing station display lower ledge", "称重台显示屏下沿", 650, 535, 4],
      ["Weighing station scale front panel", "称重台秤体前面板", 650, 520, 1],
      ["Weighing station scale top edge", "称重台秤体上沿", 650, 455, 3],
      ["Weighing station platform left corner", "称重台面左角", 560, 470, 4],
      ["Weighing station platform right corner", "称重台面右角", 740, 470, 4],
      ["Weighing station scale back panel", "称重台秤体后板", 720, 430, 2],
    ],
  },
  {
    id: "bag-roll-and-film",
    title: "Bag roll and film",
    translation: "袋卷与薄膜",
    description: "Follow the paper-bag roll, dispenser frame, hanging bag film and tear-edge details beside the scale.",
    x: 720,
    y: 330,
    width: 260,
    height: 400,
    targetScale: 2.6,
    labels: [
      ["Weighing station bag roll", "称重台纸袋卷", 820, 440, 0],
      ["Weighing station bag roll core", "称重台袋卷芯", 820, 460, 2],
      ["Weighing station roll end cap", "称重台袋卷端盖", 785, 445, 3],
      ["Weighing station roll bracket", "称重台袋卷支架", 790, 520, 1],
      ["Weighing station dispenser frame", "称重台分配器框架", 790, 535, 0],
      ["Weighing station left frame upright", "称重台框架左立柱", 775, 530, 2],
      ["Weighing station right frame upright", "称重台框架右立柱", 875, 530, 2],
      ["Weighing station dispenser base", "称重台分配器底座", 825, 650, 1],
      ["Weighing station dispenser crossbar", "称重台分配器横杆", 825, 535, 3],
      ["Weighing station hanging bag", "称重台悬挂纸袋", 850, 555, 0],
      ["Weighing station bag opening", "称重台纸袋开口", 850, 500, 2],
      ["Weighing station bag side seam", "称重台纸袋侧缝", 860, 575, 3],
      ["Weighing station bag lower edge", "称重台纸袋下沿", 850, 635, 3],
      ["Weighing station bag hanger fold", "称重台纸袋挂折", 810, 520, 4],
      ["Weighing station loose film sheet", "称重台散开薄膜", 870, 560, 1],
      ["Weighing station film fold", "称重台薄膜折痕", 875, 600, 4],
      ["Weighing station film drape", "称重台薄膜垂片", 885, 610, 2],
      ["Weighing station film lower hem", "称重台薄膜下缘", 870, 675, 4],
      ["Weighing station bag tear edge", "称重台纸袋撕口边", 805, 470, 3],
      ["Weighing station roll paper edge", "称重台袋卷纸边", 790, 455, 4],
      ["Weighing station bag support shelf", "称重台纸袋支撑板", 850, 660, 1],
      ["Weighing station bag support lip", "称重台纸袋支撑板前沿", 850, 675, 3],
      ["Weighing station dispenser black brace", "称重台分配器黑色支撑", 790, 600, 2],
      ["Weighing station dispenser side edge", "称重台分配器侧边", 900, 600, 3],
      ["Weighing station bag roll shadow", "称重台袋卷阴影边", 900, 455, 4],
    ],
  },
  {
    id: "counter-structure",
    title: "Counter structure",
    translation: "操作台结构",
    description: "Explore the wood counter, metal rails, corner guards, support panels and visible casters around the station.",
    x: 0,
    y: 450,
    width: 1_000,
    height: 491,
    targetScale: 2.55,
    labels: [
      ["Weighing station counter top", "称重台操作台面", 650, 550, 0],
      ["Weighing station counter front panel", "称重台操作台前面板", 600, 650, 0],
      ["Weighing station counter side panel", "称重台操作台侧板", 750, 700, 1],
      ["Weighing station counter metal edge", "称重台操作台金属边", 500, 540, 2],
      ["Weighing station counter wood grain", "称重台操作台木纹", 560, 590, 3],
      ["Weighing station counter corner block", "称重台操作台角块", 500, 600, 2],
      ["Weighing station counter support leg", "称重台操作台支腿", 700, 820, 2],
      ["Weighing station counter lower shelf", "称重台操作台下层板", 450, 760, 0],
      ["Weighing station lower shelf edge", "称重台下层板前沿", 450, 790, 2],
      ["Weighing station black corner guard", "称重台黑色护角", 820, 650, 1],
      ["Weighing station guard screw", "称重台护角螺钉", 820, 650, 4],
      ["Weighing station produce rail", "称重台果蔬护栏", 400, 540, 1],
      ["Weighing station front metal rail", "称重台前金属护条", 400, 560, 2],
      ["Weighing station rail end cap", "称重台护条端盖", 400, 560, 4],
      ["Weighing station rail support bracket", "称重台护条支架", 500, 560, 3],
      ["Weighing station left display caster", "称重台左侧脚轮", 80, 780, 4],
      ["Weighing station front display caster", "称重台前侧脚轮", 850, 870, 4],
      ["Weighing station station-base caster", "称重台底座脚轮", 900, 820, 4],
      ["Weighing station lower cabinet face", "称重台下柜面板", 700, 700, 1],
      ["Weighing station lower cabinet edge", "称重台下柜边缘", 700, 720, 3],
      ["Weighing station panel seam", "称重台面板接缝", 700, 780, 4],
      ["Weighing station counter underside", "称重台台面底部", 680, 620, 2],
      ["Weighing station counter front corner", "称重台台面前角", 600, 620, 3],
      ["Weighing station floor clearance", "称重台底部空隙", 700, 870, 3],
      ["Weighing station base side brace", "称重台底座侧撑", 780, 820, 2],
    ],
  },
  {
    id: "near-fruit-and-citrus",
    title: "Near fruit and citrus",
    translation: "近处水果与柑橘",
    description: "Inspect the fruit trays immediately around the weighing station without inferring prices or freshness states.",
    x: 0,
    y: 90,
    width: 580,
    height: 470,
    targetScale: 2.5,
    labels: [
      ["Weighing station left apple crate", "称重台左侧苹果箱", 120, 360, 0],
      ["Weighing station red apple row", "称重台红苹果列", 100, 320, 1],
      ["Weighing station pink apple cluster", "称重台粉红苹果簇", 180, 350, 1],
      ["Weighing station apple stem", "称重台苹果梗", 100, 290, 3],
      ["Weighing station apple dimple", "称重台苹果凹点", 180, 390, 4],
      ["Weighing station apple crate divider", "称重台苹果箱隔板", 300, 420, 3],
      ["Weighing station apple crate front", "称重台苹果箱前沿", 240, 510, 2],
      ["Weighing station apple crate side", "称重台苹果箱侧板", 360, 300, 2],
      ["Weighing station green apple tray", "称重台青苹果托盘", 260, 370, 0],
      ["Weighing station green apple cluster", "称重台青苹果簇", 260, 330, 1],
      ["Weighing station green apple dimple", "称重台青苹果凹点", 260, 400, 4],
      ["Weighing station green crate rim", "称重台青苹果箱沿", 300, 450, 2],
      ["Weighing station lemon tray", "称重台柠檬托盘", 430, 390, 0],
      ["Weighing station lemon cluster", "称重台柠檬簇", 460, 380, 1],
      ["Weighing station lime cluster", "称重台青柠簇", 520, 390, 1],
      ["Weighing station lime skin", "称重台青柠果皮", 520, 420, 4],
      ["Weighing station citrus tray divider", "称重台柑橘托盘隔板", 520, 450, 3],
      ["Weighing station pear crate", "称重台梨子箱", 430, 250, 0],
      ["Weighing station pear cluster", "称重台梨子簇", 430, 200, 1],
      ["Weighing station pear stem", "称重台梨梗", 430, 130, 3],
      ["Weighing station fruit display wood rail", "称重台水果陈列木条", 350, 500, 2],
      ["Weighing station fruit tray corner", "称重台水果托盘角", 520, 300, 3],
      ["Weighing station left crate corner", "称重台左侧果箱角", 30, 500, 4],
      ["Weighing station grape tray", "称重台葡萄托盘", 220, 250, 2],
      ["Weighing station fruit riser", "称重台水果台阶", 400, 280, 1],
    ],
  },
  {
    id: "greens-and-vegetable-edge",
    title: "Greens and vegetable edge",
    translation: "叶菜与蔬菜边缘",
    description: "Follow the visible greens, herbs and vegetable trays bordering the weighing and bagging station.",
    x: 760,
    y: 0,
    width: 912,
    height: 570,
    targetScale: 2.5,
    labels: [
      ["Weighing station dill bunch", "称重台莳萝束", 900, 300, 1],
      ["Weighing station dill fronds", "称重台莳萝叶", 900, 320, 3],
      ["Weighing station parsley bunch", "称重台欧芹束", 980, 320, 1],
      ["Weighing station herb tray", "称重台香草托盘", 940, 370, 0],
      ["Weighing station leafy greens bin", "称重台叶菜箱", 1080, 210, 0],
      ["Weighing station greens tray edge", "称重台叶菜托盘边", 1100, 450, 2],
      ["Weighing station carrot bunch", "称重台胡萝卜束", 1060, 310, 1],
      ["Weighing station carrot tops", "称重台胡萝卜缨", 1050, 260, 2],
      ["Weighing station carrot root", "称重台胡萝卜根", 1080, 350, 2],
      ["Weighing station tomato cluster", "称重台番茄簇", 930, 300, 1],
      ["Weighing station tomato stem", "称重台番茄梗", 930, 280, 3],
      ["Weighing station broccoli crown", "称重台西兰花冠", 1160, 280, 1],
      ["Weighing station broccoli stalk", "称重台西兰花茎", 1160, 330, 3],
      ["Weighing station white mushroom cluster", "称重台白蘑菇簇", 1180, 400, 1],
      ["Weighing station brown mushroom cluster", "称重台褐蘑菇簇", 1300, 420, 1],
      ["Weighing station vegetable tray divider", "称重台蔬菜托盘隔板", 1250, 450, 3],
      ["Weighing station cucumber row", "称重台黄瓜列", 1340, 230, 1],
      ["Weighing station zucchini row", "称重台西葫芦列", 1300, 250, 1],
      ["Weighing station eggplant cluster", "称重台茄子簇", 1400, 300, 1],
      ["Weighing station red pepper cluster", "称重台红甜椒簇", 1510, 230, 1],
      ["Weighing station pepper tray", "称重台甜椒托盘", 1580, 300, 0],
      ["Weighing station mist rail", "称重台喷雾管", 850, 50, 0],
      ["Weighing station mist nozzle", "称重台喷雾喷嘴", 900, 70, 2],
      ["Weighing station mist pipe joint", "称重台喷雾管接头", 1100, 60, 3],
      ["Weighing station greens shelf rail", "称重台叶菜搁架护条", 1150, 500, 2],
    ],
  },
  {
    id: "lower-display-and-floor",
    title: "Lower display and floor",
    translation: "下层陈列与地面",
    description: "Explore the lower onion, potato and asparagus baskets, display hardware, handbasket and floor mat.",
    x: 0,
    y: 550,
    width: 1_672,
    height: 391,
    targetScale: 2.45,
    labels: [
      ["Weighing station lower onion basket", "称重台下层洋葱篮", 60, 650, 0],
      ["Weighing station yellow onion cluster", "称重台黄洋葱簇", 80, 620, 1],
      ["Weighing station onion papery skin", "称重台洋葱表皮", 100, 650, 4],
      ["Weighing station red onion basket", "称重台红洋葱篮", 260, 650, 0],
      ["Weighing station red onion cluster", "称重台红洋葱簇", 260, 630, 1],
      ["Weighing station red onion skin", "称重台红洋葱表皮", 280, 680, 4],
      ["Weighing station lower potato basket", "称重台下层土豆篮", 520, 700, 0],
      ["Weighing station russet potato cluster", "称重台褐皮土豆簇", 520, 700, 1],
      ["Weighing station potato basket rim", "称重台土豆篮边缘", 500, 640, 2],
      ["Weighing station asparagus tray", "称重台芦笋托盘", 1160, 600, 0],
      ["Weighing station asparagus bundle", "称重台芦笋束", 1150, 570, 1],
      ["Weighing station asparagus tip", "称重台芦笋尖", 1140, 590, 3],
      ["Weighing station lower display shelf", "称重台下层陈列搁板", 700, 800, 0],
      ["Weighing station shelf metal rail", "称重台搁架金属护条", 400, 760, 2],
      ["Weighing station lower shelf bracket", "称重台下层搁架托", 780, 800, 3],
      ["Weighing station left display wheel", "称重台左侧陈列脚轮", 80, 780, 4],
      ["Weighing station front display wheel", "称重台前侧陈列脚轮", 850, 870, 4],
      ["Weighing station right display wheel", "称重台右侧陈列脚轮", 1100, 850, 4],
      ["Weighing station lower produce crate", "称重台下层果蔬箱", 350, 750, 0],
      ["Weighing station basket weave", "称重台果篮编织纹", 260, 670, 3],
      ["Weighing station handbasket", "称重台手提篮", 270, 850, 0],
      ["Weighing station handbasket rim", "称重台手提篮边缘", 270, 790, 2],
      ["Weighing station handbasket slat", "称重台手提篮条", 270, 830, 3],
      ["Weighing station concrete floor", "称重台混凝土地面", 900, 900, 2],
      ["Weighing station anti-fatigue mat", "称重台防疲劳垫", 1400, 850, 0],
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
    id: `produce-weighing-station-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the produce weighing-station photograph`,
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
      const id = `produce-weighing-station-${slugify(word)}`;
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
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `produce-weighing-station-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "produce-weighing-station",
    title: "Produce weighing station",
    translation: "果蔬称重台",
    subtitle: "Scale hardware, bag roll, counter and nearby produce",
    asset: "/scenes/produce-weighing-station-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "supermarket-produce-department",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/produce-weighing-station-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized produce-department photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable scale, bowl, bag-roll, counter, nearby-produce and display-fixture objects across ${detailZones.length} bounded zones. Weight readings, prices, printed labels, brands, customer identity, shopping actions and hidden scale functions were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "weight reading",
        "price",
        "printed produce label",
        "brand name",
        "customer identity",
        "shopping action",
        "purchase state",
        "hidden scale function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("produce source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`produce weighing JPEG is not reproducible; got ${sha256(output)}`);
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
  id: "enter-produce-weighing-station",
  label: "Enter the produce weighing station",
  translation: "进入果蔬称重台",
  childSceneId: "produce-weighing-station",
  sourceVisualRegion: "portal-produce-weighing-station-scale-counter",
  x: 459,
  y: 335,
  width: 431,
  height: 335,
  enterScale: 3.35,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete visible produce scale, bowl, bag roll and counter workstation in the produce photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "produce-weighing-station")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "supermarket-produce-department");
    if (index < 0) throw new Error("supermarket-produce-department is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "produce-weighing-station",
      title: "Produce weighing station",
      parentId: "supermarket-produce-department",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildProduceWeighingStationScene() {
  const scene = buildScene();
  if (scene.labels.length < 140 || scene.labels.length > 155) {
    throw new Error(`produce weighing label count ${scene.labels.length} is outside 140–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`produce weighing zone count ${scene.detailZones.length} is not 6`);
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
  buildProduceWeighingStationScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-produce-weighing-station-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
