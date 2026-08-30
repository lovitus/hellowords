import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(root, "scripts/assets/supermarket-walk-in-cooler-v1.png");
const publicAsset = resolve(root, "public/scenes/supermarket-walk-in-cooler-premium-v1.jpg");
const scenePath = resolve(root, "public/data/scenes/supermarket-walk-in-cooler.json");
const parentPath = resolve(root, "public/data/scenes/supermarket-backroom.json");
const manifestPath = resolve(root, "public/data/scenes/manifest.json");
const WIDTH = 1600;
const HEIGHT = 900;
const SOURCE_SHA256 = "c559a638ec3396b26cc926c495d7c3a71c6e4befd00358b230feb655ba933b8a";
const PUBLIC_SHA256 = "efa6b81519ae88ad40713303792d610212c6b3faa5b4bc61fa7bea3fe9b2d34a";

const zones = [
  { id: "dairy-shelving", title: "Dairy shelving", translation: "乳品货架", x: 0, y: 0, width: 650, height: 900, targetScale: 2.75, labels: [
    ["cooler dairy rack", "冷库乳品货架", 330, 420, 0], ["dairy rack upright", "乳品架立柱", 145, 430, 2], ["dairy rack top shelf", "乳品架顶层", 330, 70, 2],
    ["dairy rack wire deck", "乳品架网层板", 350, 270, 2], ["dairy rack shelf collar", "乳品架层板卡箍", 150, 320, 4], ["dairy rack foot", "乳品架支脚", 585, 810, 3],
    ["cooler milk jug", "冷库牛奶壶", 260, 150, 0], ["milk-jug screw cap", "牛奶壶旋盖", 260, 105, 3], ["milk-jug handle", "牛奶壶把手", 240, 145, 3],
    ["cooler milk bottle", "冷库牛奶瓶", 450, 245, 1], ["milk-bottle neck", "牛奶瓶颈", 450, 220, 3], ["milk-bottle lid", "牛奶瓶盖", 450, 210, 4],
    ["plain dairy tub", "无字乳品杯", 200, 390, 1], ["dairy-tub rim", "乳品杯沿", 200, 375, 3], ["dairy-tub lid", "乳品杯盖", 200, 370, 4],
    ["cooler cheese block", "冷库奶酪块", 390, 470, 0], ["cheese-block wrapper", "奶酪块包装膜", 390, 455, 3], ["stacked cheese row", "成排奶酪块", 500, 470, 1],
    ["cooler egg tray", "冷库鸡蛋托", 390, 590, 0], ["white cooler egg", "冷库白壳蛋", 430, 570, 2], ["brown cooler egg", "冷库褐壳蛋", 300, 570, 2],
    ["egg-tray cup", "蛋托杯穴", 420, 600, 4], ["cooler butter block", "冷库黄油块", 235, 690, 1], ["butter-block paper", "黄油块包装纸", 235, 680, 3],
  ] },
  { id: "produce-shelving", title: "Produce shelving", translation: "果蔬货架", x: 920, y: 40, width: 450, height: 740, targetScale: 2.8, labels: [
    ["cooler produce rack", "冷库果蔬货架", 1120, 420, 0], ["produce rack upright", "果蔬架立柱", 1040, 430, 2], ["produce rack wire shelf", "果蔬架网层板", 1150, 350, 2],
    ["produce rack shelf edge", "果蔬架层板边", 1150, 500, 3], ["produce rack foot", "果蔬架支脚", 1040, 650, 4], ["cooler leafy lettuce", "冷库叶用莴苣", 1190, 130, 0],
    ["lettuce leaf margin", "莴苣叶缘", 1210, 125, 3], ["lettuce leaf rib", "莴苣叶脉", 1190, 135, 3], ["cooler mushroom", "冷库蘑菇", 1230, 300, 0],
    ["mushroom cap surface", "蘑菇菌盖表面", 1230, 285, 3], ["cooler carrot", "冷库胡萝卜", 1170, 470, 0], ["cooler carrot shoulder", "冷库胡萝卜肩部", 1170, 450, 3],
    ["cooler cucumber", "冷库黄瓜", 1090, 440, 1], ["cucumber skin", "黄瓜外皮", 1090, 440, 4], ["cooler orange", "冷库橙子", 1270, 500, 0],
    ["orange peel", "橙子果皮", 1270, 500, 4], ["cooler green apple", "冷库青苹果", 1110, 600, 0], ["green-apple stem", "青苹果果梗", 1110, 580, 4],
    ["cooler red apple", "冷库红苹果", 1200, 600, 0], ["red-apple skin", "红苹果果皮", 1200, 600, 4], ["blue produce crate", "蓝色果蔬周转箱", 1080, 365, 1],
    ["green produce crate", "绿色果蔬周转箱", 1230, 370, 1], ["orange produce crate", "橙色果蔬周转箱", 1080, 480, 2], ["produce-crate handhold", "果蔬箱提手孔", 1120, 470, 3],
  ] },
  { id: "mobile-storage", title: "Mobile storage", translation: "移动存储", x: 570, y: 250, width: 520, height: 500, targetScale: 2.9, labels: [
    ["cooler rolling rack", "冷库移动货架", 720, 480, 0], ["rolling-rack push handle", "移动架推手", 665, 380, 2], ["rolling-rack upright", "移动架立柱", 680, 500, 2],
    ["rolling-rack shelf", "移动架层板", 745, 430, 2], ["rolling-rack caster", "移动架脚轮", 680, 660, 3], ["cooler caster fork", "冷库脚轮轮叉", 680, 650, 4],
    ["caster wheel tread", "脚轮轮面", 690, 665, 4], ["rolling-rack dairy cup", "移动架乳品杯", 750, 380, 1], ["rolling-rack cheese block", "移动架奶酪块", 740, 550, 1],
    ["stacked cooler crate", "冷库堆叠周转箱", 930, 500, 0], ["black cooler crate", "黑色冷库周转箱", 930, 585, 1], ["red cooler crate", "红色冷库周转箱", 930, 470, 1],
    ["blue cooler crate", "蓝色冷库周转箱", 930, 380, 1], ["cooler crate lattice", "冷库周转箱格栅", 930, 490, 3], ["cooler crate rim", "冷库周转箱上沿", 930, 455, 3],
    ["cooler storage pallet", "冷库储货托盘", 930, 650, 0], ["cooler pallet deck", "冷库托盘面板", 930, 640, 3], ["cooler pallet stringer", "冷库托盘纵梁", 930, 660, 4],
    ["foreground beverage crate", "前景饮料筐", 1110, 770, 1], ["plain juice bottle", "无字果汁瓶", 1150, 745, 1], ["juice-bottle cap", "果汁瓶盖", 1150, 715, 4],
    ["foreground dairy crate", "前景乳品筐", 1040, 700, 1], ["small dairy bottle", "小乳品瓶", 1060, 690, 2], ["dairy-bottle foil cap", "乳品瓶箔盖", 1060, 675, 4],
  ] },
  { id: "refrigeration", title: "Refrigeration equipment", translation: "制冷设备", x: 550, y: 0, width: 580, height: 360, targetScale: 3.1, labels: [
    ["cooler evaporator unit", "冷库蒸发器机组", 820, 145, 0], ["evaporator casing", "蒸发器机壳", 820, 140, 2], ["left evaporator fan", "左侧蒸发器风扇", 760, 140, 1],
    ["right evaporator fan", "右侧蒸发器风扇", 875, 140, 1], ["evaporator fan guard", "蒸发器风扇护网", 760, 140, 3], ["fan-guard spoke", "风扇护网辐条", 875, 140, 4],
    ["evaporator mounting bolt", "蒸发器安装螺栓", 705, 170, 4], ["evaporator condensate drain", "蒸发器冷凝排水管", 820, 225, 1], ["black drain elbow", "黑色排水弯头", 820, 250, 3],
    ["insulated refrigerant pipe", "保温制冷剂管", 930, 210, 1], ["cooler pipe insulation seam", "冷库管道保温层接缝", 930, 210, 4], ["ceiling copper pipe", "顶棚铜管", 665, 65, 2],
    ["copper pipe elbow", "铜管弯头", 665, 90, 4], ["cooler pipe hanger", "冷库管道吊架", 1040, 65, 3], ["white utility conduit", "白色公用导管", 965, 260, 2],
    ["conduit junction box", "导管接线盒", 965, 275, 3], ["cooler ceiling light", "冷库顶灯", 810, 45, 0], ["light diffuser cover", "顶灯扩散罩", 810, 50, 3],
    ["light fixture end cap", "灯具端盖", 720, 50, 4], ["cooler smoke detector", "冷库烟感探测器", 1015, 55, 1], ["detector vent slot", "探测器通风槽", 1015, 55, 4],
    ["refrigeration wall penetration", "制冷管墙体穿孔", 980, 210, 3], ["evaporator drip tray", "蒸发器滴水盘", 820, 195, 2], ["evaporator access panel", "蒸发器检修面板", 705, 140, 3],
  ] },
  { id: "cooler-doorway", title: "Cooler doorway", translation: "冷库门口", x: 0, y: 0, width: 1600, height: 900, targetScale: 2.8, labels: [
    ["walk-in cooler doorway", "步入式冷库门洞", 1430, 430, 0], ["cooler insulated door", "冷库保温门", 1500, 430, 0], ["cooler door frame", "冷库门框", 1370, 430, 1],
    ["cooler door jamb", "冷库门框侧柱", 1380, 500, 2], ["cooler door header", "冷库门框上梁", 1470, 20, 2], ["cooler door gasket edge", "冷库门密封边", 1395, 500, 3],
    ["cooler pull handle assembly", "冷库拉手组件", 1510, 540, 1], ["horizontal cooler handle", "冷库横向门把", 1510, 540, 2], ["handle mounting plate", "门把安装板", 1450, 540, 3],
    ["cooler strap hinge", "冷库带式铰链", 1510, 55, 1], ["strap-hinge arm", "带式铰链臂", 1530, 50, 3], ["strap-hinge pivot", "带式铰链转轴", 1420, 150, 3],
    ["cooler lower hinge", "冷库下铰链", 1410, 810, 2], ["diamond kick plate", "菱纹踢脚板", 1510, 730, 1], ["kick-plate diamond tread", "踢脚板菱形纹", 1510, 740, 4],
    ["clear strip curtain", "透明条形门帘", 1330, 420, 0], ["individual vinyl strip", "单条乙烯门帘", 1325, 400, 3], ["strip-curtain overlap", "门帘条重叠处", 1340, 450, 4],
    ["blank cooler display", "空白冷库显示屏", 1530, 310, 1], ["cooler display bezel", "冷库显示屏边框", 1530, 310, 3], ["display mounting bracket", "显示屏安装座", 1530, 350, 4],
    ["cooler threshold rail", "冷库门槛轨", 800, 855, 1], ["threshold rail groove", "门槛轨凹槽", 800, 850, 4], ["cooler door closer", "冷库闭门器", 1510, 50, 1],
  ] },
  { id: "room-fabric", title: "Room fabric and utilities", translation: "库房结构与设施", x: 0, y: 0, width: 1600, height: 900, targetScale: 2.45, labels: [
    ["cooler insulated wall", "冷库保温墙", 820, 410, 0], ["cooler insulated wall panel", "冷库保温墙板", 820, 410, 2], ["vertical panel seam", "保温板竖缝", 780, 400, 3],
    ["wall base rail", "墙脚护轨", 820, 500, 2], ["base-rail fastener", "墙脚护轨紧固件", 820, 500, 4], ["cooler metal ceiling", "冷库金属顶棚", 850, 25, 0],
    ["ceiling panel seam", "顶棚板接缝", 500, 30, 3], ["ceiling corner trim", "顶棚角部饰条", 1100, 35, 3], ["cooler epoxy floor", "冷库环氧地坪", 800, 720, 0],
    ["floor coved skirting", "地坪圆弧踢脚", 800, 520, 2], ["cooler floor drain", "冷库地漏", 820, 800, 0], ["circular drain grate", "圆形地漏格栅", 820, 800, 3],
    ["drain-grate slot", "地漏格栅孔", 820, 800, 4], ["cooler floor expansion joint", "冷库地坪伸缩缝", 600, 820, 3], ["cooler aisle", "冷库中央通道", 800, 650, 0],
    ["cooler shelf label holder", "冷库货架标签夹", 380, 700, 1], ["blank shelf card", "空白货架卡", 380, 700, 3], ["white storage carton", "白色储物箱", 450, 70, 1],
    ["storage-carton lid", "储物箱盖", 450, 60, 3], ["storage-carton handgrip", "储物箱提手", 480, 80, 4], ["produce carton stack", "果蔬纸箱堆", 1280, 650, 1],
    ["carton folded flap", "纸箱折叠盖片", 1280, 620, 3], ["cooler wall corner", "冷库墙角", 1060, 360, 3], ["cooler service pipe", "冷库公用管道", 1080, 120, 2],
  ] },
];

function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""); }
function region(word, x, y, zone) { const size = 42; return { id: `supermarket-walk-in-cooler-region-${slug(word)}`, description: `Pixel-audited “${word}” in the ${zone} crop`, kind: "part", x: Math.max(0, Math.min(WIDTH - size, x - 21)), y: Math.max(0, Math.min(HEIGHT - size, y - 21)), width: size, height: size }; }

function buildScene() {
  const labels = []; const visualRegions = []; const detailZones = []; let priorityIndex = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const source = region(word, x, y, zone.title); const id = `supermarket-walk-in-cooler-${slug(word)}`;
      labels.push({ id, word, translation, x, y, priority: Number((1 + priorityIndex++ / 1000).toFixed(6)), minLevel, sourceVisualRegion: source.id, semanticRealmId: "body-daily-life" });
      visualRegions.push(source); labelIds.push(id);
    }
    detailZones.push({ id: `supermarket-walk-in-cooler-zone-${zone.id}`, title: zone.title, translation: zone.translation, description: `Inspect independently visible parts of the ${zone.title.toLowerCase()}.`, x: zone.x, y: zone.y, width: zone.width, height: zone.height, targetScale: zone.targetScale, labelIds });
  }
  return { id: "supermarket-walk-in-cooler", title: "Supermarket walk-in cooler", translation: "超市步入式冷库", subtitle: "Dairy, produce, refrigeration and insulated enclosure", asset: "/scenes/supermarket-walk-in-cooler-premium-v1.jpg", width: WIDTH, height: HEIGHT, parentId: "supermarket-backroom", visualRegions, detailZones, anchorAudit: { status: "human-verified", policy: "visible-object-or-part-only", reviewedAsset: "/scenes/supermarket-walk-in-cooler-premium-v1.jpg", reviewedAssetSha256: PUBLIC_SHA256, rationale: "The source and 1600×900 output were inspected at native pixels. Every retained term points to an independently visible dairy, produce, storage, refrigeration, doorway, room-fabric or utility object or part. Brands, printed labels, temperatures, stock status and operating claims are excluded.", previousLabelCount: labels.length + 7, retainedLabelCount: labels.length, removedLabelCount: 7, removedExamples: ["brand name", "temperature value", "expiry date", "stock status", "food-safety claim", "cooling performance", "worker action"] }, labels, portals: [] };
}

async function writeJson(path, value) { const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); try { if (Buffer.compare(await readFile(path), bytes) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; } await writeFile(path, bytes); return true; }
async function ensureAsset() { const source = await readFile(sourceAsset); if (sha(source) !== SOURCE_SHA256) throw new Error("cooler source changed; repeat pixel audit"); const output = await sharp(source).resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" }).jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true }).toBuffer(); if (sha(output) !== PUBLIC_SHA256) throw new Error(`cooler JPEG changed: ${sha(output)}`); await writeFile(publicAsset, output); }

const parentPortal = { id: "enter-supermarket-walk-in-cooler", label: "Enter the supermarket walk-in cooler", translation: "进入超市步入式冷库", childSceneId: "supermarket-walk-in-cooler", sourceVisualRegion: "portal-supermarket-walk-in-cooler-doorway", x: 1040, y: 155, width: 280, height: 465, enterScale: 3.2 };
const parentRegion = { id: parentPortal.sourceVisualRegion, description: "Complete visible open walk-in cooler doorway in the supermarket backroom photograph", kind: "object", x: parentPortal.x, y: parentPortal.y, width: parentPortal.width, height: parentPortal.height };

async function updateParent() { const parent = JSON.parse(await readFile(parentPath, "utf8")); const portal = parent.portals.findIndex(({ id }) => id === parentPortal.id); if (portal >= 0) parent.portals[portal] = parentPortal; else parent.portals.push(parentPortal); const visual = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id); if (visual >= 0) parent.visualRegions[visual] = parentRegion; else parent.visualRegions.push(parentRegion); return writeJson(parentPath, parent); }
async function updateManifest() { const manifest = JSON.parse(await readFile(manifestPath, "utf8")); if (!manifest.scenes.some(({ id }) => id === "supermarket-walk-in-cooler")) { const index = manifest.scenes.findIndex(({ id }) => id === "supermarket-backroom"); if (index < 0) throw new Error("supermarket-backroom missing"); manifest.scenes.splice(index + 1, 0, { id: "supermarket-walk-in-cooler", title: "Supermarket walk-in cooler", parentId: "supermarket-backroom" }); } return writeJson(manifestPath, manifest); }

export async function buildSupermarketWalkInCoolerScene() { await ensureAsset(); const scene = buildScene(); return { sceneChanged: await writeJson(scenePath, scene), parentChanged: await updateParent(), manifestChanged: await updateManifest(), labels: scene.labels.length, zones: scene.detailZones.length }; }
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) buildSupermarketWalkInCoolerScene().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
