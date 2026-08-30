import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/library-reading-room-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/library-reading-room-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/library-reading-room.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "5fd672b2c35507869aab0e2e9f58c574895f8c1fa23a6d8ff98ee068baa066ed";
const PUBLIC_ASSET_SHA256 = "229653feffda532fe9f55e846829364d4cf1f6648acf9381ffdab65ac2d2e713";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "book-stacks",
    title: "Book stacks",
    translation: "图书书库区",
    description: "Inspect shelving structure, arranged volumes, display hardware and a mobile return trolley.",
    x: 0, y: 90, width: 650, height: 500,
    labels: [
      ["stack-room bookcase", "书库书柜", 280, 300, 0],
      ["library shelving", "图书馆搁架", 360, 310, 0],
      ["library shelf upright", "图书馆搁架立柱", 300, 320, 1],
      ["library shelf board", "图书馆搁板", 365, 330, 1],
      ["shelf end panel", "书架端板", 470, 330, 0],
      ["library shelf divider", "图书馆书架分隔片", 405, 280, 3],
      ["library bookend", "图书馆书挡", 430, 240, 2],
      ["hardcover book", "精装书", 350, 270, 0],
      ["paperback book", "平装书", 390, 380, 0],
      ["library book spine", "图书馆书脊", 325, 365, 1],
      ["book cover", "书封面", 610, 335, 2],
      ["shelf-label holder", "书架标签夹", 510, 260, 2],
      ["face-out book", "封面朝外图书", 605, 335, 1],
      ["reference volume", "参考书卷", 555, 420, 0],
      ["library atlas", "图书馆地图集", 520, 390, 1],
      ["book row", "一排图书", 260, 410, 0],
      ["oversize volume", "大型开本图书", 575, 470, 2],
      ["lower bookshelf", "下层书架", 270, 490, 3],
      ["top bookshelf", "顶层书架", 290, 145, 3],
      ["stack aisle", "书库通道", 120, 480, 0],
      ["library step stool", "图书馆踏凳", 340, 520, 0],
      ["step-stool tread", "踏凳踏面", 340, 510, 2],
      ["shelf base", "书架底座", 445, 520, 4],
      ["bookcase cap", "书柜顶板", 305, 150, 4],
    ],
  },
  {
    id: "circulation",
    title: "Circulation and self-service",
    translation: "流通与自助服务区",
    description: "Explore the service desk, book return, staff hardware, return cart and self-checkout kiosk.",
    x: 0, y: 500, width: 1_380, height: 441,
    labels: [
      ["circulation desk", "流通服务台", 600, 760, 0],
      ["service countertop", "服务台面", 620, 630, 0],
      ["accessible counter", "无障碍服务台", 870, 700, 1],
      ["staff monitor", "工作人员显示器", 500, 610, 0],
      ["circulation keyboard", "流通台键盘", 500, 680, 1],
      ["circulation mouse", "流通台鼠标", 590, 690, 2],
      ["desk barcode scanner", "服务台条码扫描器", 650, 650, 0],
      ["desk scanner cradle", "扫描器底座", 650, 680, 3],
      ["circulation receipt printer", "流通台小票打印机", 750, 680, 0],
      ["receipt-paper slot", "小票出纸口", 750, 675, 3],
      ["library pencil cup", "图书馆笔筒", 400, 610, 1],
      ["library card", "借阅证", 690, 760, 0],
      ["book-return slot", "还书口", 520, 825, 0],
      ["return-slot frame", "还书口边框", 520, 825, 3],
      ["circulation cabinet door", "流通台柜门", 420, 845, 2],
      ["circulation drawer pull", "流通台抽屉拉手", 490, 790, 4],
      ["book-return cart", "还书车", 110, 700, 0],
      ["return-cart handle", "还书车把手", 120, 590, 1],
      ["return-cart shelf", "还书车层板", 115, 700, 2],
      ["return-cart caster", "还书车脚轮", 155, 875, 3],
      ["self-checkout kiosk", "自助借还机", 1_120, 690, 0],
      ["kiosk touchscreen", "自助机触摸屏", 1_140, 620, 0],
      ["kiosk scanner bed", "自助机扫描台", 1_130, 810, 1],
      ["RFID checkout pad", "射频借还感应板", 1_270, 825, 1],
      ["kiosk receipt slot", "自助机小票口", 1_095, 720, 2],
      ["kiosk card reader", "自助机读卡器", 1_230, 735, 2],
    ],
  },
  {
    id: "reading-study",
    title: "Reading and study area",
    translation: "阅览与学习区",
    description: "Inspect reading furniture, study dividers, lighting and personal study objects.",
    x: 500, y: 220, width: 590, height: 480,
    labels: [
      ["library reading table", "图书馆阅览桌", 770, 500, 0],
      ["reading-table leg", "阅览桌桌腿", 760, 610, 2],
      ["study chair", "学习椅", 865, 560, 0],
      ["chair back rail", "椅背横档", 860, 520, 3],
      ["upholstered armchair", "软垫扶手椅", 650, 350, 0],
      ["armchair armrest", "扶手椅扶手", 625, 370, 2],
      ["library side table", "图书馆边桌", 695, 390, 0],
      ["reading floor lamp", "阅读落地灯", 700, 300, 0],
      ["floor-lamp shade", "落地灯灯罩", 700, 260, 1],
      ["desk task lamp", "桌面任务灯", 645, 470, 0],
      ["acoustic divider", "吸音隔板", 800, 420, 0],
      ["divider foot", "隔板底脚", 800, 510, 3],
      ["table power outlet", "桌面电源插座", 810, 440, 2],
      ["study-table cable grommet", "学习桌穿线孔", 845, 470, 4],
      ["study laptop", "学习笔记本电脑", 725, 485, 0],
      ["study laptop screen", "学习笔记本屏幕", 725, 460, 1],
      ["study notebook", "学习笔记本", 800, 480, 0],
      ["study pencil cup", "学习铅笔杯", 850, 450, 1],
      ["group reading table", "小组阅览桌", 925, 335, 0],
      ["group-table chair", "小组桌椅", 985, 350, 1],
      ["library whiteboard", "图书馆白板", 790, 225, 0],
      ["library whiteboard frame", "图书馆白板边框", 790, 225, 2],
      ["whiteboard marker tray", "白板笔托", 790, 325, 3],
      ["library carpet tile", "图书馆方块地毯", 820, 600, 0],
      ["floor transition strip", "地面过渡条", 520, 620, 4],
    ],
  },
  {
    id: "children-media",
    title: "Children and media area",
    translation: "儿童与媒体区",
    description: "Explore low book displays, story furniture, media hardware and map storage.",
    x: 1_040, y: 170, width: 632, height: 650,
    labels: [
      ["picture-book shelving", "绘本书架", 1_225, 310, 0],
      ["picture book", "绘本", 1_220, 300, 0],
      ["face-out display rack", "封面展示架", 1_135, 400, 0],
      ["magazine rack", "杂志架", 1_130, 400, 1],
      ["magazine shelf", "杂志搁板", 1_130, 430, 3],
      ["story-theater frame", "故事剧场框架", 1_380, 300, 0],
      ["theater curtain", "剧场帘幕", 1_380, 315, 1],
      ["story-area globe", "故事区地球仪", 1_525, 270, 0],
      ["child-size table", "儿童桌", 1_380, 410, 0],
      ["child-size chair", "儿童椅", 1_450, 430, 0],
      ["reading floor cushion", "阅读地垫", 1_300, 430, 0],
      ["media desk", "媒体工作台", 1_520, 480, 0],
      ["media desktop monitor", "媒体区台式显示器", 1_500, 410, 0],
      ["library headphones", "图书馆耳机", 1_585, 450, 0],
      ["headphone earcup", "耳机耳罩", 1_590, 455, 3],
      ["media keyboard", "媒体区键盘", 1_505, 485, 1],
      ["media mouse", "媒体区鼠标", 1_565, 485, 2],
      ["media-area printer", "媒体区打印机", 1_625, 470, 0],
      ["media printer paper tray", "媒体打印机纸盒", 1_625, 490, 3],
      ["map cabinet", "地图柜", 1_575, 650, 0],
      ["map drawer", "地图抽屉", 1_575, 690, 1],
      ["map-drawer pull", "地图抽屉拉手", 1_575, 685, 3],
      ["map viewing frame", "地图阅览框", 1_575, 590, 0],
      ["book display plinth", "图书展示台", 1_250, 560, 0],
      ["media book trolley", "媒体区图书车", 1_450, 700, 0],
      ["media-trolley caster", "媒体区图书车脚轮", 1_500, 805, 4],
    ],
  },
  {
    id: "entrance-safety",
    title: "Entrance and safety fixtures",
    translation: "入口与安全设施",
    description: "Inspect the glazed entrance, ceiling services, clock, emergency fixtures and windows.",
    x: 0, y: 0, width: 1_672, height: 360,
    labels: [
      ["glazed library door", "图书馆玻璃门", 1_000, 220, 0],
      ["library door transom", "图书馆门上亮窗", 1_000, 90, 1],
      ["door push bar", "门推杆", 975, 250, 0],
      ["door closer arm", "闭门器连杆", 1_040, 130, 2],
      ["entrance pull handle", "入口拉手", 1_030, 240, 3],
      ["concrete column", "混凝土柱", 670, 120, 0],
      ["ceiling tile", "天花板板块", 780, 45, 0],
      ["library ceiling light panel", "图书馆天花板灯板", 1_200, 35, 0],
      ["wood pendant light", "木质吊灯", 1_365, 90, 0],
      ["ceiling air grille", "天花板风口", 855, 35, 1],
      ["library sprinkler head", "图书馆喷淋头", 1_535, 55, 1],
      ["library smoke detector", "图书馆烟雾探测器", 230, 45, 1],
      ["CCTV dome", "监控半球罩", 1_060, 30, 0],
      ["library fire extinguisher", "图书馆灭火器", 1_160, 255, 0],
      ["fire alarm station", "火灾报警按钮", 1_165, 195, 1],
      ["reading-room wall clock", "阅览室挂钟", 855, 120, 0],
      ["library window mullion", "图书馆窗中梃", 1_480, 160, 2],
      ["clerestory window", "高侧窗", 1_000, 75, 1],
      ["entrance threshold", "入口门槛", 1_000, 335, 3],
      ["library entrance door frame", "图书馆入口门框", 1_050, 220, 4],
    ],
  },
];

const libraryPortal = {
  id: "enter-library-reading-room",
  label: "Enter the school library",
  translation: "进入学校图书馆",
  childSceneId: "library-reading-room",
  sourceVisualRegion: "portal-library-reading-room",
  x: 850,
  y: 20,
  width: 470,
  height: 190,
  enterScale: 3.4,
};

const libraryPortalRegion = {
  id: libraryPortal.sourceVisualRegion,
  description: "Visible school library shelves, reading table and lounge chairs in the upper-right campus room",
  kind: "object",
  x: libraryPortal.x,
  y: libraryPortal.y,
  width: libraryPortal.width,
  height: libraryPortal.height,
};

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function scenePoint(value, axis) { return Number((value * (axis === "x" ? SCALE_X : SCALE_Y)).toFixed(6)); }
function sceneRectangle(rectangle) {
  return { x: scenePoint(rectangle.x, "x"), y: scenePoint(rectangle.y, "y"), width: scenePoint(rectangle.width, "x"), height: scenePoint(rectangle.height, "y") };
}
function slug(value) { return value.replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""); }

function buildScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priorityIndex = 0;
  for (const zone of sourceZones) {
    const labelIds = [];
    for (const [word, translation, x, y, minLevel] of zone.labels) {
      const id = `library-${slug(word)}`;
      const sourceVisualRegion = {
        id: `library-region-${slug(word)}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the library photograph`,
        kind: "part",
        ...sceneRectangle({ x: Math.max(0, Math.min(SOURCE_WIDTH - 40, x - 20)), y: Math.max(0, Math.min(SOURCE_HEIGHT - 40, y - 20)), width: 40, height: 40 }),
      };
      labels.push({ id, word, translation, x: scenePoint(x, "x"), y: scenePoint(y, "y"), priority: Number((1 + priorityIndex / 1000).toFixed(6)), minLevel, sourceVisualRegion: sourceVisualRegion.id });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({ id: `library-zone-${zone.id}`, title: zone.title, translation: zone.translation, description: zone.description, ...sceneRectangle(zone), targetScale: 3.15, labelIds });
  }
  return {
    id: "library-reading-room",
    title: "School library",
    translation: "学校图书馆",
    subtitle: "Stacks, circulation, reading, children's books and media",
    asset: "/scenes/library-reading-room-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/library-reading-room-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The final 1600 by 900 library photograph was inspected at source and output resolution. It supports visible shelving, books, service and self-check hardware, reading furniture, children's displays, media equipment, map storage and entrance fixtures. Catalog records, loans, classifications, subjects, patrons, staff roles and other invisible library operations are excluded.",
      previousLabelCount: sourceZones.reduce((count, zone) => count + zone.labels.length, 0) + 6,
      retainedLabelCount: sourceZones.reduce((count, zone) => count + zone.labels.length, 0),
      removedLabelCount: 6,
      removedExamples: ["catalog record", "loan period", "reference service", "subject heading", "library patron", "circulation status"],
    },
    labels,
    portals: [],
  };
}

async function writeIfChanged(path, value) {
  const next = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try { const current = await readFile(path); if (Buffer.compare(current, next) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path, next);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourceAsset);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("library source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true }).toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`library JPEG is not reproducible; got ${sha256(output)}`);
  try { const current = await readFile(publicAsset); if (Buffer.compare(current, output) === 0) return false; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(publicAsset, output);
  return true;
}

async function updateParent() {
  const parent = JSON.parse(await readFile(parentPath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === libraryPortal.id);
  if (portalIndex === -1) parent.portals.push(libraryPortal); else parent.portals[portalIndex] = libraryPortal;
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === libraryPortalRegion.id);
  if (regionIndex === -1) parent.visualRegions.push(libraryPortalRegion); else parent.visualRegions[regionIndex] = libraryPortalRegion;
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "library-reading-room");
  if (!existing) manifest.scenes.push({ id: "library-reading-room", title: "School library", parentId: "school-campus" });
  else if (existing.title !== "School library" || existing.parentId !== "school-campus") throw new Error("library manifest entry has a different parent or title");
  return writeIfChanged(manifestPath, manifest);
}

export async function buildLibraryReadingRoomScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const parentChanged = await updateParent();
  const manifestChanged = await updateManifest();
  return { assetChanged, sceneChanged, parentChanged, manifestChanged, labels: scene.labels.length, zones: scene.detailZones.length };
}

const isDirectInvocation = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) buildLibraryReadingRoomScene().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(`add-library-reading-room-scene: ${error.message}`); process.exitCode = 1; });
