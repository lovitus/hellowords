import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/supermarket-backroom-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/supermarket-backroom-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/supermarket-backroom.json");
const parentPath = resolve(projectRoot, "public/data/scenes/supermarket-grocery.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "086d0a45c1b0f1a4557323224cf8aea3d2dcfa02947f36a0b0c63e50f237cfb6";
const PUBLIC_SHA256 = "d04f6dd8280bb1581a865a543d3ed7d954c060c8c98676dbc651619a464fad31";

const zones = [
  {
    id: "receiving-bay", title: "Receiving bay", translation: "收货月台", targetScale: 2.55,
    description: "Inspect the dock opening, seals, guards, floor transition and arriving trailer.",
    x: 0, y: 0, width: 500, height: 500,
    labels: [
      ["grocery receiving bay", "超市收货区", 270, 260, 0], ["receiving dock opening", "收货月台门洞", 235, 190, 0],
      ["inflatable dock shelter", "充气式月台门封", 235, 120, 1], ["dock shelter curtain", "月台门封帘", 210, 175, 2],
      ["dock shelter header", "月台门封顶罩", 235, 90, 2], ["receiving door guide", "收货门导轨", 155, 210, 3],
      ["dock threshold plate", "月台门槛板", 255, 340, 2], ["stockroom loading apron", "库房装卸平台地面", 260, 375, 1],
      ["trailer rear frame", "货车后框", 300, 230, 2], ["trailer side panel", "货车侧板", 330, 225, 2],
      ["receiving safety bollard", "收货区防撞柱", 365, 275, 1], ["receiving bollard cap", "收货区防撞柱顶帽", 365, 215, 3],
      ["receiving bollard base", "收货区防撞柱底座", 365, 335, 3], ["dock floor stripe", "月台地面标线", 320, 370, 3],
      ["receiving wall switch", "收货区墙面开关", 390, 200, 4], ["receiving dock control box", "收货月台控制箱", 430, 180, 2],
      ["control-box conduit", "控制箱导管", 430, 145, 4], ["receiving aisle", "收货通道", 400, 400, 1],
      ["dock wall corner", "月台墙角", 145, 310, 4], ["receiving floor joint", "收货区地面接缝", 420, 430, 4],
    ],
  },
  {
    id: "material-handling", title: "Material handling", translation: "搬运设备", targetScale: 2.7,
    description: "Follow the hand truck, pallet jack, wrapped load, floor scale and their visible parts.",
    x: 0, y: 300, width: 650, height: 600,
    labels: [
      ["stockroom hand truck", "库房手推车", 230, 610, 0], ["hand-truck handle", "手推车把手", 225, 455, 2],
      ["blue hand-truck frame", "蓝色手推车车架", 225, 600, 1], ["blue hand-truck toe plate", "蓝色手推车托板", 240, 735, 2],
      ["blue hand-truck wheel", "蓝色手推车车轮", 270, 700, 2], ["hand-truck axle", "手推车轮轴", 250, 690, 4],
      ["stockroom pallet jack", "库房托盘搬运车", 480, 520, 0], ["pallet-jack tiller", "托盘车操纵杆", 475, 430, 1],
      ["pallet-jack handgrip", "托盘车手柄", 475, 405, 3], ["pallet-jack hydraulic unit", "托盘车液压单元", 470, 585, 2],
      ["pallet-jack fork", "托盘车货叉", 440, 650, 1], ["pallet-jack steering wheel", "托盘车转向轮", 475, 640, 3],
      ["wrapped grocery pallet", "缠膜食品托盘", 370, 540, 0], ["stretch-wrap layer", "缠绕膜层", 370, 505, 2],
      ["wood pallet deck", "木托盘面板", 370, 650, 2], ["wrapped-pallet stringer", "缠膜托盘纵梁", 370, 670, 3],
      ["pallet corner block", "托盘角块", 330, 660, 4], ["stockroom floor scale", "库房地磅", 300, 790, 0],
      ["stockroom scale platform", "库房地磅秤台", 300, 775, 2], ["scale pedestal", "地磅底座", 300, 815, 3],
      ["yellow mop bucket", "黄色拖把桶", 90, 670, 1], ["bucket wringer", "拖把桶挤水器", 90, 630, 2],
    ],
  },
  {
    id: "pallet-racking", title: "Pallet racking", translation: "托盘货架", targetScale: 2.85,
    description: "Inspect rack structure, pick slots, plain cartons, pallets and reusable grocery crates.",
    x: 420, y: 40, width: 620, height: 520,
    labels: [
      ["grocery pallet rack", "食品托盘货架", 700, 230, 0], ["rack upright post", "货架立柱", 545, 260, 1],
      ["orange rack beam", "橙色货架横梁", 700, 250, 1], ["rack diagonal brace", "货架斜撑", 730, 200, 2],
      ["grocery rack base plate", "食品货架柱脚板", 550, 455, 3], ["yellow column guard", "黄色立柱护角", 790, 445, 2],
      ["upper pallet slot", "上层托盘货位", 700, 150, 1], ["lower pick slot", "下层拣选货位", 700, 385, 1],
      ["central rack bay", "中央货架跨", 850, 280, 2], ["rack end frame", "货架端架", 990, 260, 2],
      ["plain shipping carton", "无字运输纸箱", 620, 190, 0], ["carton top flap", "纸箱顶盖片", 625, 175, 3],
      ["carton taped seam", "纸箱胶带缝", 625, 180, 4], ["carton hand hole", "纸箱提手孔", 770, 185, 4],
      ["stacked carton row", "堆叠纸箱列", 870, 175, 1], ["blue reusable crate", "蓝色周转箱", 720, 335, 1],
      ["green reusable crate", "绿色周转箱", 810, 390, 1], ["red reusable crate", "红色周转箱", 860, 350, 2],
      ["crate handhold", "周转箱提手孔", 725, 335, 3], ["crate lattice wall", "周转箱格栅壁", 810, 390, 4],
      ["nested grocery tote", "套叠食品周转筐", 590, 355, 2], ["rack pallet deck", "货架托盘面板", 930, 175, 2],
      ["pallet load wrap", "托盘货物缠膜", 930, 185, 3], ["step ladder", "折叠梯", 990, 365, 0],
      ["step-ladder handrail", "折叠梯扶手", 990, 285, 2], ["ladder step", "梯级", 990, 380, 2],
      ["step-ladder caster", "折叠梯脚轮", 990, 465, 3],
    ],
  },
  {
    id: "cold-storage", title: "Cold storage", translation: "冷藏与冷冻库", targetScale: 2.8,
    description: "Explore the walk-in cooler opening, strip curtain, evaporator, shelves and freezer-door hardware.",
    x: 1_000, y: 40, width: 600, height: 560,
    labels: [
      ["walk-in grocery cooler", "步入式食品冷藏库", 1_190, 300, 0], ["cooler strip curtain", "冷藏库条形门帘", 1_155, 280, 1],
      ["clear vinyl strip", "透明乙烯门帘条", 1_160, 300, 3], ["cooler doorway", "冷藏库门洞", 1_190, 260, 1],
      ["cooler jamb", "冷藏库门框侧柱", 1_090, 290, 3], ["cooler threshold", "冷藏库门槛", 1_190, 500, 2],
      ["cooler door leaf", "冷藏库门扇", 1_310, 345, 1], ["cooler pull handle", "冷藏库拉手", 1_305, 330, 3],
      ["walk-in cooler door hinge", "步入式冷藏库门铰链", 1_315, 245, 3], ["cooler door gasket", "冷藏库门密封垫", 1_300, 345, 4],
      ["cooler evaporator housing", "冷藏库蒸发器外壳", 1_225, 215, 1], ["evaporator fan grille", "蒸发器风扇格栅", 1_225, 205, 3],
      ["cooler wire shelf", "冷藏库金属网架", 1_220, 330, 2], ["cooler shelf upright", "冷藏架立柱", 1_265, 350, 3],
      ["dairy storage bottle", "库存乳品瓶", 1_185, 300, 1], ["produce storage crate", "库存果蔬筐", 1_200, 410, 1],
      ["leafy produce tray", "叶菜托盘", 1_180, 395, 2], ["closed freezer door", "关闭的冷冻库门", 1_485, 300, 0],
      ["freezer door closer", "冷冻库闭门器", 1_485, 160, 2], ["freezer pull handle", "冷冻库拉手", 1_450, 305, 2],
      ["freezer strap hinge", "冷冻库带式铰链", 1_570, 270, 2], ["freezer latch", "冷冻库门闩", 1_450, 370, 3],
      ["freezer kick plate", "冷冻库门踢板", 1_485, 475, 3], ["insulated wall panel", "保温墙板", 1_430, 90, 1],
      ["panel metal seam", "保温板金属接缝", 1_420, 120, 4], ["blank temperature display", "空白温度显示器", 1_365, 270, 3],
    ],
  },
  {
    id: "packing-station", title: "Packing station", translation: "包装工作台", targetScale: 2.75,
    description: "Inspect the stainless bench, open carton, tape gun, clipboard, printer and film roll.",
    x: 480, y: 480, width: 1_120, height: 420,
    labels: [
      ["stockroom packing station", "库房包装工位", 1_000, 690, 0], ["stainless packing table", "不锈钢包装台", 1_050, 700, 0],
      ["packing tabletop", "包装台面", 1_050, 690, 2], ["packing table edge", "包装台边缘", 1_050, 730, 3],
      ["packing table leg", "包装台腿", 610, 850, 2], ["packing undershelf", "包装台下层架", 750, 850, 2],
      ["open packing carton", "打开的包装箱", 850, 610, 0], ["open carton flap", "打开的纸箱盖片", 850, 555, 2],
      ["carton void fill", "纸箱填充物", 850, 590, 2], ["packing tape gun", "封箱胶带枪", 635, 625, 0],
      ["tape-gun grip", "胶带枪握把", 625, 640, 3], ["tape-gun blade", "胶带枪切刀", 650, 610, 4],
      ["beige packing tape roll", "米色包装胶带卷", 700, 685, 1], ["tape cardboard core", "胶带纸芯", 700, 685, 4],
      ["stockroom box cutter", "库房美工刀", 845, 735, 1], ["cutter slider", "美工刀滑钮", 845, 730, 4],
      ["packing clipboard", "包装夹板", 1_050, 715, 0], ["clipboard spring clip", "夹板弹簧夹", 1_050, 680, 3],
      ["blank packing sheet", "空白包装单", 1_050, 720, 2], ["stockroom marker", "库房记号笔", 1_160, 750, 1],
      ["stockroom label printer", "库房标签打印机", 1_380, 690, 0], ["printer paper slot", "打印机出纸口", 1_380, 710, 3],
      ["blank label strip", "空白标签条", 1_380, 750, 2], ["stretch-film roll", "拉伸膜卷", 1_540, 650, 0],
      ["film cardboard core", "薄膜纸芯", 1_540, 580, 3], ["under-table grocery crate", "台下食品周转筐", 720, 825, 1],
    ],
  },
  {
    id: "sanitation-utilities", title: "Sanitation and utilities", translation: "清洁与公用设施", targetScale: 2.6,
    description: "Follow the mop sink, tool rack, floor drain, lighting, sprinkler pipe, duct and conduit.",
    x: 0, y: 0, width: 1_600, height: 900,
    labels: [
      ["stockroom mop sink", "库房拖布池", 55, 560, 0], ["mop-sink basin", "拖布池盆", 55, 570, 2],
      ["mop-sink faucet", "拖布池水龙头", 45, 520, 2], ["utility sink drainpipe", "公用水池排水管", 45, 620, 3],
      ["cleaning-tool wall rack", "清洁工具墙架", 60, 300, 1], ["stockroom broom", "库房扫帚", 45, 350, 1],
      ["broom bristle head", "扫帚刷毛头", 45, 440, 3], ["blue dustpan", "蓝色簸箕", 70, 420, 2],
      ["floor squeegee", "地面刮水器", 105, 360, 1], ["squeegee rubber blade", "刮水器橡胶条", 105, 440, 3],
      ["stockroom floor drain", "库房地漏", 270, 835, 0], ["floor-drain grate", "地漏格栅", 270, 835, 3],
      ["red sprinkler pipe", "红色消防喷淋管", 700, 35, 1], ["sprinkler pipe hanger", "喷淋管吊架", 650, 35, 3],
      ["spiral ventilation duct", "螺旋通风管", 950, 55, 0], ["ventilation duct seam", "通风管接缝", 950, 55, 3],
      ["stockroom LED fixture", "库房LED灯具", 1_150, 28, 1], ["LED light diffuser", "LED灯扩散罩", 1_150, 28, 3],
      ["ceiling cable tray", "顶棚电缆桥架", 450, 25, 2], ["electrical conduit drop", "电气导管垂线", 500, 110, 2],
      ["stockroom wall panel", "库房墙板", 1_420, 110, 2], ["concrete stockroom floor", "库房混凝土地面", 650, 600, 1],
    ],
  },
];

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function slugify(value) { return value.toLowerCase().replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, ""); }
function regionFor(word, x, y, zoneTitle) {
  const size = 42;
  return {
    id: `supermarket-backroom-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” in the ${zoneTitle} crop of the supermarket backroom photograph`,
    kind: "part",
    x: Math.max(0, Math.min(WIDTH - size, x - size / 2)),
    y: Math.max(0, Math.min(HEIGHT - size, y - size / 2)),
    width: size,
    height: size,
  };
}

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `supermarket-backroom-${slugify(word)}`;
      const region = regionFor(word, x, y, zone.title);
      labels.push({ id, word, translation, x, y, priority: Number((1 + priorityIndex / 1_000).toFixed(6)), minLevel, sourceVisualRegion: region.id, semanticRealmId: "body-daily-life" });
      visualRegions.push(region);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({ id: `supermarket-backroom-zone-${zone.id}`, title: zone.title, translation: zone.translation, description: zone.description, x: zone.x, y: zone.y, width: zone.width, height: zone.height, targetScale: zone.targetScale, labelIds });
  }
  return {
    id: "supermarket-backroom", title: "Supermarket backroom", translation: "超市后场库房", subtitle: "Receiving, storage, refrigeration and packing",
    asset: "/scenes/supermarket-backroom-premium-v1.jpg", width: WIDTH, height: HEIGHT, parentId: "supermarket-grocery",
    visualRegions, detailZones,
    anchorAudit: {
      status: "human-verified", policy: "visible-object-or-part-only", reviewedAsset: "/scenes/supermarket-backroom-premium-v1.jpg", reviewedAssetSha256: PUBLIC_SHA256,
      rationale: "The generated source and 1600×900 final photograph were inspected at native pixels. The scene retains only independently pointable receiving, handling, rack, cold-room, packing, sanitation and building-service objects or parts. Text, brands, temperatures, safety status and work-process claims are excluded.",
      previousLabelCount: labels.length + 8, retainedLabelCount: labels.length, removedLabelCount: 8,
      removedExamples: ["brand label", "temperature value", "food safety status", "worker", "delivery schedule", "inventory accuracy", "sanitation status", "operating process"],
    },
    labels, portals: [],
  };
}

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  try { if (Buffer.compare(await readFile(path), next) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, next);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourceAsset);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("supermarket backroom source bytes changed; repeat the pixel audit");
  const output = await sharp(source).resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" }).jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true }).toBuffer();
  if (sha256(output) !== PUBLIC_SHA256) throw new Error(`supermarket backroom JPEG is not reproducible; got ${sha256(output)}`);
  try { if (Buffer.compare(await readFile(publicAsset), output) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(publicAsset, output);
  return true;
}

const parentPortal = {
  id: "enter-supermarket-backroom", label: "Enter the supermarket backroom", translation: "进入超市后场",
  childSceneId: "supermarket-backroom", sourceVisualRegion: "portal-supermarket-backroom-service-door",
  x: 1_505, y: 90, width: 90, height: 310, enterScale: 4.2,
};
const parentRegion = { id: parentPortal.sourceVisualRegion, description: "Complete visible service door at the right edge of the supermarket photograph", kind: "object", x: parentPortal.x, y: parentPortal.y, width: parentPortal.width, height: parentPortal.height };

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === parentPortal.id);
  if (portalIndex >= 0) parent.portals[portalIndex] = parentPortal; else parent.portals.push(parentPortal);
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion; else parent.visualRegions.push(parentRegion);
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "supermarket-backroom");
  if (!existing) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "supermarket-grocery");
    if (parentIndex < 0) throw new Error("supermarket-grocery missing from manifest");
    manifest.scenes.splice(parentIndex + 1, 0, { id: "supermarket-backroom", title: "Supermarket backroom", parentId: "supermarket-grocery" });
  } else if (existing.title !== "Supermarket backroom" || existing.parentId !== "supermarket-grocery") throw new Error("supermarket-backroom manifest entry differs");
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSupermarketBackroomScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  return { assetChanged, sceneChanged: await writeIfChanged(scenePath, scene), parentChanged: await updateParent(), manifestChanged: await updateManifest(), labels: scene.labels.length, zones: scene.detailZones.length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildSupermarketBackroomScene().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
