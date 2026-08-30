import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the produce-department terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; supermarket-grocery integration is intentionally owned by the
 * main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/supermarket-produce-department-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/supermarket-produce-department-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/supermarket-produce-department.json");
const parentPath = resolve(projectRoot, "public/data/scenes/supermarket-grocery.json");
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
    id: "left-fruit-crates",
    title: "Left fruit crates",
    translation: "左侧水果箱",
    description: "Inspect the left fruit crates, banana bunches, grapes, pears and apple displays.",
    x: 0,
    y: 70,
    width: 520,
    height: 450,
    targetScale: 2.45,
    labels: [
      ["Produce left banana bunch", "左侧香蕉串", 50, 150, 0],
      ["Produce banana stem", "香蕉梗", 80, 95, 3],
      ["Produce banana tip", "香蕉尖端", 50, 180, 4],
      ["Produce red grape cluster", "红葡萄串", 160, 200, 1],
      ["Produce red grape stem", "红葡萄梗", 170, 170, 3],
      ["Produce green grape cluster", "青葡萄串", 300, 190, 1],
      ["Produce green grape stem", "青葡萄梗", 300, 160, 3],
      ["Produce pear row", "梨子排列", 420, 180, 1],
      ["Produce pear stem", "梨梗", 430, 130, 3],
      ["Produce pear shoulder", "梨肩部", 400, 200, 4],
      ["Produce left apple crate", "左侧苹果箱", 120, 360, 0],
      ["Produce red apple cluster", "红苹果簇", 100, 320, 1],
      ["Produce red apple stem", "红苹果梗", 100, 290, 3],
      ["Produce green apple crate", "青苹果箱", 260, 370, 0],
      ["Produce green apple cluster", "青苹果簇", 260, 330, 1],
      ["Produce green apple dimple", "青苹果凹点", 260, 400, 4],
      ["Produce left crate divider", "左侧果箱隔板", 300, 420, 3],
      ["Produce center crate divider", "中间果箱隔板", 390, 420, 3],
      ["Produce left wooden fruit tray", "左侧木质水果托盘", 120, 470, 0],
      ["Produce center wooden fruit tray", "中间木质水果托盘", 350, 470, 0],
      ["Produce front crate rail", "果箱前沿", 240, 510, 2],
      ["Produce left crate corner", "左侧果箱角", 30, 500, 4],
      ["Produce banana display tray", "香蕉陈列托盘", 40, 220, 1],
      ["Produce grape tray", "葡萄托盘", 220, 250, 2],
      ["Produce fruit display riser", "水果陈列台阶", 400, 280, 2],
    ],
  },
  {
    id: "central-fruit-display",
    title: "Central fruit display",
    translation: "中央水果陈列",
    description: "Follow the orange, grapefruit, lemon, lime and mixed-apple trays around the center display.",
    x: 300,
    y: 90,
    width: 540,
    height: 430,
    targetScale: 2.5,
    labels: [
      ["Produce orange mound", "橙子堆", 560, 150, 0],
      ["Produce orange cluster", "橙子簇", 600, 180, 1],
      ["Produce orange peel dimple", "橙皮凹点", 600, 160, 4],
      ["Produce mandarin cluster", "橘子簇", 690, 170, 1],
      ["Produce mandarin shoulder", "橘子肩部", 700, 200, 4],
      ["Produce pink grapefruit mound", "粉红葡萄柚堆", 720, 280, 1],
      ["Produce grapefruit tray", "葡萄柚托盘", 700, 300, 2],
      ["Produce citrus crate", "柑橘箱", 650, 330, 0],
      ["Produce citrus tray divider", "柑橘托盘隔板", 620, 350, 3],
      ["Produce lemon cluster", "柠檬簇", 630, 390, 1],
      ["Produce lime cluster", "青柠簇", 730, 390, 1],
      ["Produce citrus crate lip", "柑橘箱前沿", 700, 460, 2],
      ["Produce red-yellow apple crate", "红黄苹果箱", 460, 360, 0],
      ["Produce red-yellow apple cluster", "红黄苹果簇", 500, 390, 1],
      ["Produce apple stem detail", "苹果梗细节", 500, 370, 4],
      ["Produce apple tray divider", "苹果托盘隔板", 430, 430, 3],
      ["Produce apple tray corner", "苹果托盘角", 560, 470, 4],
      ["Produce rear fruit bin", "后排水果箱", 520, 280, 0],
      ["Produce display wood slat", "陈列木条", 520, 500, 2],
      ["Produce citrus backboard", "柑橘后挡板", 600, 280, 2],
      ["Produce citrus front rail", "柑橘前沿", 680, 500, 2],
      ["Produce pear crate lip", "梨箱前沿", 480, 270, 3],
      ["Produce fruit tray endcap", "水果托盘端头", 780, 340, 1],
      ["Produce apple crate side", "苹果箱侧板", 360, 300, 2],
    ],
  },
  {
    id: "scale-and-bag-station",
    title: "Scale and bag station",
    translation: "称重与装袋台",
    description: "Explore the produce scale, stainless bowl, paper-bag roll, counter and handbasket.",
    x: 0,
    y: 350,
    width: 950,
    height: 591,
    targetScale: 2.55,
    labels: [
      ["Produce weighing station", "果蔬称重台", 650, 500, 0],
      ["Produce stainless bowl", "果蔬不锈钢盆", 650, 390, 0],
      ["Produce bowl rim", "果蔬盆边缘", 650, 380, 3],
      ["Produce bowl base", "果蔬盆底座", 650, 450, 2],
      ["Produce digital scale", "果蔬电子秤", 650, 470, 0],
      ["Produce weighing display panel", "果蔬称重显示面板", 650, 480, 2],
      ["Produce scale platform", "果蔬秤平台", 650, 490, 3],
      ["Produce paper bag roll", "果蔬纸袋卷", 820, 470, 0],
      ["Produce bag roll core", "纸袋卷芯", 820, 460, 3],
      ["Produce hanging bag", "悬挂纸袋", 830, 550, 1],
      ["Produce bag edge", "纸袋边缘", 830, 600, 3],
      ["Produce bag dispenser frame", "纸袋分配器框架", 790, 520, 2],
      ["Produce bag dispenser base", "纸袋分配器底座", 800, 650, 2],
      ["Produce weighing counter", "称重台面", 650, 550, 0],
      ["Produce counter front panel", "称重台前面板", 600, 650, 2],
      ["Produce counter corner", "称重台角", 500, 590, 4],
      ["Produce counter metal rail", "称重台金属护条", 400, 540, 2],
      ["Produce handbasket handle", "手提篮把手", 250, 850, 0],
      ["Produce handbasket rim", "手提篮边缘", 270, 780, 2],
      ["Produce handbasket slat", "手提篮条", 270, 830, 3],
      ["Produce handbasket base", "手提篮底部", 270, 900, 4],
      ["Produce bag station wheel", "装袋台脚轮", 840, 760, 4],
      ["Produce counter support leg", "称重台支腿", 700, 820, 3],
      ["Produce paper bag fold", "纸袋折痕", 830, 570, 4],
    ],
  },
  {
    id: "leafy-greens-and-herbs",
    title: "Leafy greens and herbs",
    translation: "叶菜与香草",
    description: "Inspect the mist rail, leafy greens, lettuce, herbs and wooden greens trays.",
    x: 760,
    y: 0,
    width: 450,
    height: 550,
    targetScale: 2.5,
    labels: [
      ["Produce mist rail", "果蔬喷雾管", 850, 50, 0],
      ["Produce mist nozzle", "喷雾喷嘴", 900, 70, 2],
      ["Produce mist spray", "喷雾水汽", 950, 90, 3],
      ["Produce green lettuce head", "绿色生菜球", 900, 150, 0],
      ["Produce lettuce leaf edge", "生菜叶缘", 900, 180, 3],
      ["Produce red leaf lettuce", "红叶生菜", 1050, 150, 1],
      ["Produce romaine lettuce", "罗马生菜", 1120, 180, 1],
      ["Produce leafy greens tray", "叶菜托盘", 1000, 230, 0],
      ["Produce kale bunch", "羽衣甘蓝束", 1020, 250, 1],
      ["Produce herb bunch", "香草束", 900, 300, 1],
      ["Produce dill fronds", "莳萝叶", 900, 320, 3],
      ["Produce parsley bunch", "欧芹束", 980, 320, 1],
      ["Produce herb tray", "香草托盘", 940, 370, 0],
      ["Produce cilantro leaves", "香菜叶", 1000, 360, 2],
      ["Produce wooden greens crate", "叶菜木箱", 900, 400, 0],
      ["Produce greens crate rim", "叶菜箱前沿", 900, 430, 2],
      ["Produce greens divider", "叶菜隔板", 1050, 400, 3],
      ["Produce mist pipe joint", "喷雾管接头", 1100, 60, 3],
      ["Produce mist pipe elbow", "喷雾管弯头", 1000, 50, 3],
      ["Produce greens shelf edge", "叶菜搁架边缘", 1100, 450, 2],
      ["Produce rear greens bin", "后排叶菜箱", 1080, 210, 0],
      ["Produce leaf cluster", "叶菜簇", 1150, 250, 1],
      ["Produce greens display leg", "叶菜陈列台支腿", 1150, 500, 3],
      ["Produce greens tray corner", "叶菜托盘角", 1170, 430, 4],
    ],
  },
  {
    id: "vegetable-trays",
    title: "Vegetable trays",
    translation: "蔬菜托盘",
    description: "Follow the tomato, carrot, broccoli, cauliflower, mushroom, pepper, cabbage and root-vegetable trays.",
    x: 850,
    y: 150,
    width: 822,
    height: 520,
    targetScale: 2.55,
    labels: [
      ["Produce tomato tray", "番茄托盘", 900, 280, 0],
      ["Produce cherry tomato cluster", "樱桃番茄簇", 930, 300, 1],
      ["Produce tomato stem", "番茄梗", 930, 280, 3],
      ["Produce carrot bunch", "胡萝卜束", 1060, 310, 1],
      ["Produce carrot tops", "胡萝卜缨", 1050, 260, 2],
      ["Produce carrot root", "胡萝卜根", 1080, 350, 2],
      ["Produce broccoli crown", "西兰花冠", 1160, 280, 1],
      ["Produce broccoli stalk", "西兰花茎", 1160, 330, 3],
      ["Produce cauliflower head", "菜花球", 1270, 300, 1],
      ["Produce cauliflower leaves", "菜花叶", 1260, 340, 2],
      ["Produce white mushroom cluster", "白蘑菇簇", 1180, 400, 1],
      ["Produce brown mushroom cluster", "褐蘑菇簇", 1300, 420, 1],
      ["Produce mushroom tray", "蘑菇托盘", 1240, 460, 0],
      ["Produce green zucchini row", "绿西葫芦列", 1300, 250, 1],
      ["Produce dark cucumber row", "深色黄瓜列", 1340, 230, 1],
      ["Produce eggplant cluster", "茄子簇", 1400, 300, 1],
      ["Produce red pepper cluster", "红甜椒簇", 1510, 230, 1],
      ["Produce yellow pepper cluster", "黄甜椒簇", 1580, 250, 1],
      ["Produce green pepper cluster", "青甜椒簇", 1640, 230, 1],
      ["Produce cabbage head", "圆白菜球", 1440, 380, 1],
      ["Produce red cabbage head", "紫甘蓝球", 1530, 390, 1],
      ["Produce leek bundle", "韭葱束", 1590, 370, 1],
      ["Produce spring onion bundle", "青葱束", 1640, 350, 1],
      ["Produce potato crate", "土豆箱", 1360, 520, 0],
      ["Produce potato cluster", "土豆簇", 1400, 540, 1],
      ["Produce sweet potato crate", "红薯箱", 1500, 560, 0],
      ["Produce sweet potato cluster", "红薯簇", 1530, 580, 1],
    ],
  },
  {
    id: "lower-produce-storage",
    title: "Lower produce storage",
    translation: "下层果蔬储放",
    description: "Explore the lower onion and potato baskets, asparagus tray, display shelving, casters and floor mat.",
    x: 0,
    y: 480,
    width: 1_672,
    height: 461,
    targetScale: 2.45,
    labels: [
      ["Produce lower onion basket", "下层洋葱篮", 60, 650, 0],
      ["Produce yellow onion cluster", "黄洋葱簇", 80, 620, 1],
      ["Produce onion papery skin", "洋葱表皮", 100, 650, 4],
      ["Produce red onion basket", "红洋葱篮", 260, 650, 0],
      ["Produce red onion cluster", "红洋葱簇", 260, 630, 1],
      ["Produce red onion papery skin", "红洋葱表皮", 280, 680, 4],
      ["Produce lower potato basket", "下层土豆篮", 520, 700, 0],
      ["Produce russet potato cluster", "褐皮土豆簇", 520, 700, 1],
      ["Produce potato basket rim", "土豆篮边缘", 500, 640, 2],
      ["Produce asparagus tray", "芦笋托盘", 1160, 600, 0],
      ["Produce asparagus bundle", "芦笋束", 1150, 570, 1],
      ["Produce asparagus tip", "芦笋尖", 1140, 590, 3],
      ["Produce lower display shelf", "下层陈列搁板", 700, 800, 0],
      ["Produce shelf metal rail", "搁架金属护条", 400, 760, 2],
      ["Produce left display wheel", "左侧陈列台脚轮", 80, 780, 4],
      ["Produce front display wheel", "前侧陈列台脚轮", 850, 870, 4],
      ["Produce right display wheel", "右侧陈列台脚轮", 1100, 850, 4],
      ["Produce lower produce crate", "下层果蔬箱", 350, 750, 0],
      ["Produce basket weave", "果篮编织纹", 260, 670, 3],
      ["Produce wooden shelf front", "木质搁板前沿", 500, 770, 2],
      ["Produce stand side panel", "陈列台侧板", 700, 760, 2],
      ["Produce floor concrete seam", "混凝土地面接缝", 900, 900, 3],
      ["Produce anti-fatigue mat", "防疲劳垫", 1400, 850, 0],
      ["Produce mat edge", "地垫边缘", 1300, 820, 3],
      ["Produce display caster right", "右侧陈列脚轮", 1550, 620, 4],
      ["Produce lower shelf bracket", "下层搁架托", 780, 800, 3],
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
    id: `supermarket-produce-department-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the produce-department photograph`,
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
      const id = `supermarket-produce-department-${slugify(word)}`;
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
      id: `supermarket-produce-department-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "supermarket-produce-department",
    title: "Supermarket produce department",
    translation: "超市果蔬区",
    subtitle: "Fresh fruit, vegetables, weighing and bagging",
    asset: "/scenes/supermarket-produce-department-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "supermarket-grocery",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/supermarket-produce-department-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized produce-department photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable fruit, vegetable, display, weighing, bagging and store-fixture objects across ${detailZones.length} bounded zones. Printed prices, labels, brands, freshness claims, customer identity, purchase state and hidden functions were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "printed price",
        "produce label",
        "brand name",
        "freshness claim",
        "customer identity",
        "purchase state",
        "weight reading",
        "hidden store function",
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
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`produce JPEG is not reproducible; got ${sha256(output)}`);
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
  id: "enter-supermarket-produce-department",
  label: "Enter the produce department",
  translation: "进入超市果蔬区",
  childSceneId: "supermarket-produce-department",
  sourceVisualRegion: "portal-supermarket-produce-department-left-display",
  x: 0,
  y: 270,
  width: 300,
  height: 430,
  enterScale: 3.35,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete visible left-hand fruit and vegetable display in the supermarket photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "supermarket-produce-department")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "supermarket-grocery");
    if (index < 0) throw new Error("supermarket-grocery is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "supermarket-produce-department",
      title: "Supermarket produce department",
      parentId: "supermarket-grocery",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSupermarketProduceDepartmentScene() {
  const scene = buildScene();
  if (scene.labels.length < 140 || scene.labels.length > 155) {
    throw new Error(`produce label count ${scene.labels.length} is outside 140–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`produce zone count ${scene.detailZones.length} is not 6`);
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
  buildSupermarketProduceDepartmentScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-supermarket-produce-department-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
