import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Builds the standalone supermarket terminal scene from a reviewed source
 * photograph. Source coordinates stay in the 1672 x 941 audit raster until
 * the reproducible final JPEG is generated.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/supermarket-grocery-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/supermarket-grocery-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/supermarket-grocery.json");
const worldMapPath = resolve(projectRoot, "public/data/scenes/world-map.json");
const configPath = resolve(projectRoot, "scripts/data/mega-atlas-v21/scene-config.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "14c8a91258539f6851144a1ac1bca3b43356ffe14226845734d9338ba6b579c9";
const PUBLIC_ASSET_SHA256 = "c5a6278b87a0b851263b6befff437ef3e54269bf4cdd980d043ab8a4e3f65414";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "produce-section",
    title: "Produce section",
    translation: "果蔬区",
    description: "Inspect the produce aisle, crates, individual foods, scale and paper produce bag.",
    x: 0,
    y: 220,
    width: 580,
    height: 721,
    targetScale: 2.45,
    labels: [
      ["produce aisle", "果蔬通道", 250, 550, 0],
      ["produce crate", "果蔬箱", 200, 350, 0],
      ["apple produce", "苹果果品", 80, 330, 1],
      ["orange produce", "橙子果品", 300, 300, 1],
      ["tomato", "番茄", 100, 500, 1],
      ["lemon", "柠檬", 300, 530, 1],
      ["green apple", "青苹果", 200, 380, 2],
      ["red apple produce", "红苹果果品", 80, 340, 2],
      ["carrot bunch", "胡萝卜束", 150, 620, 2],
      ["onion", "洋葱", 400, 500, 2],
      ["broccoli", "西兰花", 400, 650, 2],
      ["mushroom", "蘑菇", 300, 760, 2],
      ["leaf lettuce cluster", "生菜叶簇", 470, 620, 2],
      ["leafy greens", "绿叶菜", 100, 700, 1],
      ["produce scale", "果蔬秤", 70, 680, 0],
      ["scale tray", "秤盘", 70, 650, 2],
      ["produce scale display", "果蔬秤显示屏", 70, 610, 3],
      ["paper produce bag", "果蔬纸袋", 120, 820, 1],
      ["crate divider", "果蔬箱隔板", 250, 450, 3],
      ["crate corner", "果蔬箱角", 420, 540, 4],
      ["produce shelf", "果蔬搁架", 400, 700, 1],
      ["tomato stem scar", "番茄茎痕", 100, 500, 4],
      ["mushroom cap", "蘑菇菌盖", 300, 750, 4],
    ],
  },
  {
    id: "chilled-dairy",
    title: "Chilled dairy case",
    translation: "冷藏乳品柜",
    description: "Follow the refrigerated case, milk, yogurt, eggs, butter, cheese and cold-case hardware.",
    x: 300,
    y: 80,
    width: 620,
    height: 500,
    targetScale: 2.5,
    labels: [
      ["refrigerated dairy case", "冷藏乳品柜", 550, 250, 0],
      ["cooler door", "冷柜门", 500, 200, 0],
      ["cooler handle", "冷柜把手", 650, 300, 2],
      ["cooler door seal", "冷柜门封条", 610, 300, 3],
      ["cooler shelf rail", "冷柜搁架导轨", 500, 350, 3],
      ["milk bottle", "牛奶瓶", 700, 300, 1],
      ["milk cap", "牛奶瓶盖", 700, 270, 4],
      ["yogurt cup", "酸奶杯", 430, 160, 1],
      ["yogurt lid", "酸奶杯盖", 430, 160, 3],
      ["egg carton", "鸡蛋盒", 790, 180, 0],
      ["egg carton lid", "鸡蛋盒盖", 790, 180, 2],
      ["butter pack", "黄油包装", 800, 260, 1],
      ["cheese block", "奶酪块", 800, 350, 1],
      ["cheese wedge", "奶酪楔块", 800, 420, 2],
      ["cream carton", "奶油纸盒", 700, 430, 2],
      ["dairy bottle", "乳品瓶", 550, 350, 2],
      ["dairy tray", "乳品托盘", 450, 450, 3],
      ["case mullion", "冷柜中梃", 650, 200, 3],
      ["cooler glass door", "冷柜玻璃门", 550, 200, 1],
      ["cooler door hinge", "冷柜门铰链", 800, 300, 4],
      ["cooler base", "冷柜底座", 550, 500, 2],
      ["chilled shelf", "冷藏搁板", 550, 180, 2],
      ["package tray", "包装托盘", 780, 220, 3],
      ["product divider", "商品隔板", 780, 300, 4],
    ],
  },
  {
    id: "grocery-aisle",
    title: "Grocery aisle",
    translation: "食品杂货货架",
    description: "Explore dry-goods shelves, generic food packages, jars, bottles, dividers and end displays.",
    x: 650,
    y: 0,
    width: 750,
    height: 500,
    targetScale: 2.55,
    labels: [
      ["grocery aisle", "食品杂货通道", 1_000, 250, 0],
      ["grocery shelf", "食品杂货搁架", 1_000, 100, 0],
      ["cereal carton", "谷物纸盒", 850, 80, 1],
      ["pasta bag", "意面袋", 900, 180, 1],
      ["rice bag", "米袋", 950, 180, 1],
      ["snack pouch", "零食袋", 1_000, 180, 1],
      ["canned food", "罐装食品", 1_150, 220, 1],
      ["canned food lid", "罐装食品盖", 1_150, 220, 3],
      ["pantry glass jar", "食品储藏玻璃罐", 1_200, 180, 2],
      ["pantry jar lid", "食品储藏罐盖", 1_200, 180, 4],
      ["sauce bottle", "酱料瓶", 1_200, 250, 1],
      ["pantry bottle cap", "食品储藏瓶盖", 1_200, 250, 3],
      ["paperboard box", "纸板盒", 850, 300, 2],
      ["cardboard carton", "纸箱", 900, 300, 1],
      ["package seal", "包装封口", 950, 300, 3],
      ["grocery shelf bracket", "食品杂货搁架托", 1_000, 100, 3],
      ["grocery shelf divider", "食品杂货搁架隔板", 1_100, 100, 4],
      ["shelf endcap", "货架端头", 700, 200, 1],
      ["aisle end display", "通道端架陈列", 1_200, 350, 0],
      ["bulk packet", "散装包装袋", 1_300, 350, 2],
      ["spice container", "香料容器", 1_200, 150, 2],
      ["condiment bottle", "调味品瓶", 1_250, 200, 2],
      ["shelf label strip", "货架标签条", 1_000, 150, 4],
      ["packaged food row", "包装食品列", 1_000, 200, 1],
    ],
  },
  {
    id: "checkout-lanes",
    title: "Checkout lanes",
    translation: "收银通道",
    description: "Inspect checkout belts, scanners, payment hardware, bagging areas, carts and baskets.",
    x: 780,
    y: 430,
    width: 892,
    height: 511,
    targetScale: 2.65,
    labels: [
      ["checkout lane", "收银通道", 1_200, 700, 0],
      ["checkout conveyor", "收银输送带", 1_100, 620, 0],
      ["checkout belt", "收银皮带", 1_100, 650, 1],
      ["checkout belt roller", "收银皮带滚轮", 1_100, 650, 3],
      ["checkout barcode scanner", "收银条码扫描器", 1_030, 560, 1],
      ["checkout scanner glass", "收银扫描玻璃", 1_030, 570, 3],
      ["scanner housing", "扫描器外壳", 1_030, 550, 2],
      ["checkout keypad", "收银按键板", 1_040, 600, 3],
      ["card terminal", "刷卡终端", 1_030, 630, 1],
      ["checkout receipt printer", "收银小票打印机", 1_030, 580, 2],
      ["checkout receipt slot", "收银小票出口", 1_030, 580, 4],
      ["bagging shelf", "装袋搁板", 1_130, 760, 1],
      ["reusable shopping bag", "可重复使用购物袋", 1_100, 780, 0],
      ["paper bag handle", "纸袋提手", 1_100, 760, 3],
      ["divider bar", "分隔杆", 1_150, 550, 2],
      ["checkout counter", "收银柜台", 1_100, 700, 0],
      ["checkout counter edge", "收银柜台边缘", 1_000, 700, 3],
      ["bagging rack", "装袋架", 1_150, 780, 2],
      ["shopping cart", "购物车", 850, 650, 0],
      ["cart basket", "购物车篮", 870, 630, 1],
      ["shopping cart handle", "购物车把手", 850, 580, 2],
      ["shopping cart wheel", "购物车轮", 900, 760, 3],
      ["handbasket", "手提购物篮", 1_300, 850, 0],
      ["handbasket handle", "手提篮把手", 1_300, 810, 2],
      ["basket slat", "购物篮条", 1_300, 850, 4],
    ],
  },
  {
    id: "store-services",
    title: "Store services",
    translation: "商店服务区",
    description: "Follow the service desk, cart bay, freezer chest, entrance, waste bins and public fixtures.",
    x: 1_200,
    y: 0,
    width: 472,
    height: 700,
    targetScale: 2.45,
    labels: [
      ["customer service desk", "顾客服务台", 1_450, 200, 0],
      ["service monitor", "服务台监视器", 1_440, 170, 2],
      ["shopping-cart bay", "购物车停放区", 1_450, 350, 0],
      ["cart bay rail", "购物车区护栏", 1_450, 330, 2],
      ["waste sorting bin", "垃圾分类桶", 1_500, 500, 0],
      ["waste-bin lid", "分类桶盖", 1_500, 480, 3],
      ["freezer chest", "冷冻柜", 1_600, 350, 0],
      ["freezer lid", "冷冻柜盖", 1_600, 300, 2],
      ["freezer handle", "冷冻柜把手", 1_600, 380, 3],
      ["grocery service door", "食品杂货服务门", 1_650, 180, 1],
      ["grocery entrance door", "食品杂货入口门", 1_650, 250, 0],
      ["entrance door window", "入口门窗", 1_650, 230, 2],
      ["wall display", "墙面显示屏", 1_450, 100, 1],
      ["checkout security camera", "收银区安防摄像机", 1_500, 20, 3],
      ["store ceiling light", "商店顶灯", 1_450, 20, 2],
      ["grocery floor tile", "食品杂货地砖", 1_400, 550, 2],
      ["floor joint", "地面接缝", 1_400, 550, 4],
      ["aisle end shelf", "通道端架", 1_300, 350, 1],
      ["store plant pot", "商店植物盆", 1_450, 120, 3],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function scenePoint(value, axis) {
  const scaled = value * (axis === "x" ? SCALE_X : SCALE_Y);
  return Number(scaled.toFixed(6));
}

function sceneRectangle(rectangle) {
  return {
    x: scenePoint(rectangle.x, "x"),
    y: scenePoint(rectangle.y, "y"),
    width: scenePoint(rectangle.width, "x"),
    height: scenePoint(rectangle.height, "y"),
  };
}

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `supermarket-grocery-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the supermarket photograph`,
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
      const id = `supermarket-grocery-${slugify(word)}`;
      const sourceVisualRegion = visualRegionFor(word, x, y, zone.title);
      labels.push({
        id,
        word,
        translation,
        x: scenePoint(x, "x"),
        y: scenePoint(y, "y"),
        priority: Number((1 + priorityIndex / 1000).toFixed(6)),
        minLevel,
        sourceVisualRegion: sourceVisualRegion.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `supermarket-grocery-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "supermarket-grocery",
    title: "Supermarket grocery",
    translation: "超市食品区",
    subtitle: "Produce, chilled foods, groceries and checkout",
    asset: "/scenes/supermarket-grocery-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "world-map",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/supermarket-grocery-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The source and resized supermarket photographs were inspected at native and final pixels. This batch retains 115 independently pointable produce, chilled-food, grocery-package, checkout and store-service objects or parts across five bounded exploration zones. Brand names, readable package text, prices, nutrition claims, freshness claims, customer identities and inferred retail operations were excluded.",
      previousLabelCount: 121,
      retainedLabelCount: 115,
      removedLabelCount: 6,
      removedExamples: [
        "brand name",
        "package text",
        "price",
        "nutrition claim",
        "customer identity",
        "retail operation",
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
  if (sha256(source) !== SOURCE_SHA256) {
    throw new Error("supermarket source bytes changed; rerun the pixel audit before rebuilding");
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) {
    throw new Error(`supermarket JPEG is not reproducible; got ${sha256(output)}`);
  }
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const supermarketPortal = {
  id: "enter-supermarket-grocery",
  label: "Explore the supermarket",
  translation: "探索超市",
  childSceneId: "supermarket-grocery",
  sourceVisualRegion: "portal-enter-supermarket-grocery",
  x: 1_045,
  y: 785,
  width: 200,
  height: 119,
  enterScale: 3.75,
};

const supermarketPortalRegion = {
  id: supermarketPortal.sourceVisualRegion,
  description: "Complete visible retail counter and produce display in the market atlas panel",
  kind: "object",
  x: supermarketPortal.x,
  y: supermarketPortal.y,
  width: supermarketPortal.width,
  height: supermarketPortal.height,
};

const supermarketConfigPortal = {
  id: supermarketPortal.id,
  label: supermarketPortal.label,
  translation: supermarketPortal.translation,
  childSceneId: supermarketPortal.childSceneId,
  x: supermarketPortal.x * 2,
  y: supermarketPortal.y * 2,
  width: supermarketPortal.width * 2,
  height: supermarketPortal.height * 2,
  enterScale: supermarketPortal.enterScale,
  description: supermarketPortalRegion.description,
};

async function updateWorldMap() {
  const worldMap = JSON.parse(await readFile(worldMapPath, "utf8"));
  const existingPortalIndex = worldMap.portals.findIndex(({ id }) => id === supermarketPortal.id);
  if (existingPortalIndex >= 0) worldMap.portals[existingPortalIndex] = supermarketPortal;
  else worldMap.portals.push(supermarketPortal);
  const existingRegionIndex = worldMap.visualRegions.findIndex(
    ({ id }) => id === supermarketPortalRegion.id,
  );
  if (existingRegionIndex >= 0) worldMap.visualRegions[existingRegionIndex] = supermarketPortalRegion;
  else {
    const firstAnchorIndex = worldMap.visualRegions.findIndex(({ id }) => id.startsWith("anchor-"));
    worldMap.visualRegions.splice(
      firstAnchorIndex >= 0 ? firstAnchorIndex : worldMap.visualRegions.length,
      0,
      supermarketPortalRegion,
    );
  }
  return writeIfChanged(worldMapPath, worldMap);
}

async function updateConfig() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const portals = config.scene.portals;
  const existingIndex = portals.findIndex(({ id }) => id === supermarketConfigPortal.id);
  if (existingIndex >= 0) portals[existingIndex] = supermarketConfigPortal;
  else portals.push(supermarketConfigPortal);
  return writeIfChanged(configPath, config);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "supermarket-grocery");
  if (!existing) {
    const worldMapIndex = manifest.scenes.findIndex(({ id }) => id === "world-map");
    if (worldMapIndex < 0) throw new Error("world-map is missing from the scene manifest");
    manifest.scenes.splice(worldMapIndex + 1, 0, {
      id: "supermarket-grocery",
      title: "Supermarket grocery",
      parentId: "world-map",
    });
  } else if (existing.title !== "Supermarket grocery" || existing.parentId !== "world-map") {
    throw new Error("supermarket-grocery already exists with a different title or parent");
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSupermarketGroceryScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const worldMapChanged = await updateWorldMap();
  const configChanged = await updateConfig();
  const manifestChanged = await updateManifest();
  return {
    assetChanged,
    sceneChanged,
    worldMapChanged,
    configChanged,
    manifestChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildSupermarketGroceryScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-supermarket-grocery-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
