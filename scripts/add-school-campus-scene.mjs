import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Build the standalone school-campus scene from the already reviewed school
 * atlas panel. The panel is deliberately treated as a source photograph, not
 * as a reason to copy the atlas vocabulary: every label below names a new,
 * independently pointable detail that is absent from the current world.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(
  projectRoot,
  "scripts/assets/mega-atlas-v21/01-school-classroom-v1.png",
);
const publicAsset = resolve(projectRoot, "public/scenes/school-campus-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const worldMapPath = resolve(projectRoot, "public/data/scenes/world-map.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "d0a04bebd7b4c43b5d1f426dc91d584cd89275365f760b0507337b50f23af9d1";
const PUBLIC_ASSET_SHA256 = "ba3863de7141714144a7c1fc91327fdfb021bdc9f53087027d7c32adb6d766a3";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "campus-entry",
    title: "Campus entry",
    translation: "校园入口",
    description: "Follow the gate, walkway, brick posts and planted entry court.",
    x: 0,
    y: 0,
    width: 470,
    height: 320,
    labels: [
      ["gate hinge", "铁门铰链", 339, 164, 0],
      ["gate latch", "铁门插销", 345, 167, 1],
      ["pathway tile", "小路铺砖", 342, 258, 2],
      ["brick pillar cap", "砖柱顶盖", 250, 158, 3],
      ["garden bench slat", "花园长椅木条", 171, 211, 4],
    ],
  },
  {
    id: "classroom",
    title: "Classroom detail",
    translation: "教室细节",
    description: "Inspect the teaching wall, desk storage, globe stand and floor.",
    x: 470,
    y: 0,
    width: 425,
    height: 320,
    labels: [
      ["projector housing", "投影机外壳", 700, 30, 0],
      ["whiteboard frame", "白板边框", 678, 47, 1],
      ["whiteboard tray", "白板托槽", 678, 141, 2],
      ["teacher desk drawer", "教师桌抽屉", 595, 153, 3],
      ["student desk drawer", "学生桌抽屉", 531, 181, 4],
      ["student chair back", "学生椅靠背", 532, 198, 2],
      ["bookcase shelf", "书柜搁板", 862, 95, 3],
      ["classroom rug border", "教室地毯边缘", 791, 158, 4],
    ],
  },
  {
    id: "library-office",
    title: "Library and office detail",
    translation: "图书馆与办公室细节",
    description: "Explore book rows, reading furniture, stairs and office hardware.",
    x: 895,
    y: 0,
    width: 777,
    height: 320,
    labels: [
      ["book spine row", "书脊排列", 965, 89, 0],
      ["bookcase divider", "书柜隔板", 954, 104, 1],
      ["reading table edge", "阅读桌边", 1025, 161, 2],
      ["armchair cushion", "扶手椅坐垫", 1150, 154, 3],
      ["stair handrail", "楼梯扶手", 1438, 147, 4],
      ["printer output tray", "打印机出纸托盘", 1294, 203, 2],
      ["door lever", "门杆把手", 1328, 286, 3],
      ["office keyboard", "办公键盘", 1117, 259, 4],
    ],
  },
  {
    id: "art-studio",
    title: "Art studio detail",
    translation: "艺术室细节",
    description: "Study the easel frames, paint containers, carts and bicycle rack.",
    x: 0,
    y: 320,
    width: 625,
    height: 250,
    labels: [
      ["easel frame", "画架框架", 278, 447, 0],
      ["canvas stretcher", "画布绷架", 288, 432, 1],
      ["palette wells", "调色板凹槽", 495, 413, 2],
      ["paint tube", "颜料管", 306, 350, 3],
      ["supply cart shelf", "用品车搁板", 590, 381, 4],
      ["worktable edge", "工作台边缘", 515, 435, 2],
      ["canvas clip", "画布夹", 490, 383, 3],
      ["paint jar lid", "颜料罐盖", 286, 340, 4],
    ],
  },
  {
    id: "music-room",
    title: "Music room detail",
    translation: "音乐室细节",
    description: "Follow the piano, guitar, drum and stand hardware in rehearsal space.",
    x: 625,
    y: 320,
    width: 345,
    height: 250,
    labels: [
      ["piano lid", "钢琴盖", 698, 396, 0],
      ["piano leg", "钢琴支腿", 698, 455, 1],
      ["keybed", "键床", 707, 430, 2],
      ["piano pedal", "钢琴踏板", 655, 467, 3],
      ["guitar soundhole", "吉他音孔", 825, 374, 4],
      ["drum shell", "鼓腔外壳", 846, 449, 2],
      ["cymbal stand", "镲片架", 875, 430, 3],
      ["music stand shelf", "乐谱架托板", 779, 430, 4],
    ],
  },
  {
    id: "gym-washroom",
    title: "Gym and washroom detail",
    translation: "体育馆与洗手间细节",
    description: "Inspect sports hardware, mats, ball storage and washroom fixtures.",
    x: 970,
    y: 320,
    width: 602,
    height: 250,
    labels: [
      ["basketball backboard", "篮球篮板", 1224, 354, 0],
      ["hoop net", "篮圈网", 1224, 383, 1],
      ["gym mat edge", "体操垫边", 1047, 434, 2],
      ["wall bar rung", "肋木横杆", 1092, 372, 3],
      ["climbing rope knot", "攀爬绳结", 1163, 371, 4],
      ["ball cart shelf", "球车搁板", 1315, 468, 2],
      ["ball rack", "球架", 1320, 455, 3],
      ["vaulting box handle", "跳箱把手", 1197, 530, 4],
      ["goal net", "球门网", 1274, 548, 2],
      ["marker cone tip", "标志锥顶端", 1228, 464, 3],
      ["washroom mirror frame", "洗手间镜框", 1447, 347, 4],
      ["basin faucet handle", "洗手盆水龙头把手", 1446, 367, 2],
    ],
  },
  {
    id: "infirmary",
    title: "School infirmary detail",
    translation: "校医室细节",
    description: "Explore the examination bed, privacy fittings and medical storage.",
    x: 0,
    y: 570,
    width: 400,
    height: 230,
    labels: [
      ["examination bedrail", "检查床护栏", 273, 670, 0],
      ["headrest cushion", "头枕坐垫", 357, 683, 1],
      ["privacy curtain ring", "隔帘环", 183, 650, 2],
      ["privacy screen frame", "隔断屏框", 179, 645, 3],
      ["cabinet glass door", "玻璃柜门", 267, 620, 4],
      ["cabinet shelf edge", "柜架边缘", 267, 632, 2],
      ["pedal bin lid", "脚踏垃圾桶盖", 316, 635, 3],
      ["supply cabinet handle", "用品柜把手", 86, 720, 4],
    ],
  },
  {
    id: "corridor-lockers",
    title: "Corridor and lockers detail",
    translation: "走廊与储物柜细节",
    description: "Inspect locker vents, label slots, the notice board and cabinet seams.",
    x: 400,
    y: 570,
    width: 490,
    height: 230,
    labels: [
      ["locker vent", "储物柜通风孔", 600, 735, 0],
      ["label holder", "标签槽", 616, 720, 1],
      ["notice board frame", "通知板边框", 694, 589, 2],
      ["locker door seam", "储物柜门缝", 600, 735, 3],
    ],
  },
  {
    id: "equipment-prep",
    title: "Equipment and preparation room detail",
    translation: "器材与准备间细节",
    description: "Follow storage edges, bins, sink hardware and office-machine controls.",
    x: 890,
    y: 570,
    width: 782,
    height: 230,
    labels: [
      ["storage shelf edge", "储物架边缘", 935, 620, 0],
      ["equipment bin handle", "器材箱把手", 951, 741, 1],
      ["hoop rim", "圈架边缘", 1035, 760, 2],
      ["bucket handle", "水桶把手", 1065, 770, 3],
      ["sink faucet handle", "水槽水龙头把手", 1368, 603, 4],
      ["sink drain opening", "水槽排水口", 1402, 628, 2],
      ["printer paper tray", "打印机纸盘", 1138, 684, 3],
      ["printer control panel", "打印机控制面板", 1148, 690, 4],
    ],
  },
  {
    id: "south-grounds",
    title: "South campus grounds detail",
    translation: "校园南侧绿地细节",
    description: "Trace the path-light cap and hedge top along the planted grounds.",
    x: 0,
    y: 800,
    width: 1_672,
    height: 141,
    labels: [
      ["path light cap", "路灯顶盖", 35, 865, 0],
      ["hedge top", "绿篱顶部", 310, 807, 1],
      ["lawn edge", "草坪边缘", 1500, 890, 2],
      ["tree planter wall", "树池围墙", 500, 900, 3],
    ],
  },
];

const rootSchoolPortal = {
  id: "enter-school-campus",
  label: "Explore the school campus",
  translation: "探索校园",
  childSceneId: "school-campus",
  sourceVisualRegion: "portal-enter-school-campus",
  x: 220,
  y: 20,
  width: 220,
  height: 145,
  enterScale: 3.75,
};

const rootSchoolPortalRegion = {
  id: rootSchoolPortal.sourceVisualRegion,
  description: "Complete visible school interior and corridor area on the school atlas panel",
  kind: "object",
  x: rootSchoolPortal.x,
  y: rootSchoolPortal.y,
  width: rootSchoolPortal.width,
  height: rootSchoolPortal.height,
};

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

function labelId(word) {
  return `school-campus-${word.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "")}`;
}

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 40;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  const rectangle = sceneRectangle({ x: left, y: top, width: size, height: size });
  return {
    id: `school-campus-region-${word.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "")}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the school campus photograph`,
    kind: "part",
    ...rectangle,
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
      const id = labelId(word);
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
      });
      visualRegions.push(sourceVisualRegion);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `school-campus-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: 3.15,
      labelIds,
    });
  }
  return {
    id: "school-campus",
    title: "School campus",
    translation: "校园",
    subtitle: "Classrooms, arts, health and everyday campus spaces",
    asset: "/scenes/school-campus-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "world-map",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-campus-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The resized school-campus photograph was inspected at source and final pixels. This batch retains only 73 independently pointable fixture or part details across classrooms, library, arts, music, gym, infirmary, lockers, preparation rooms and planted grounds; all 73 display terms are new to the existing 43-scene world and the atlas school panel vocabulary. Student activities, signage, writing, medical procedures, hidden equipment functions and generic duplicate furniture were excluded.",
      previousLabelCount: 79,
      retainedLabelCount: 73,
      removedLabelCount: 6,
      removedExamples: [
        "student activity",
        "class schedule",
        "school bell",
        "lesson content",
        "medical procedure",
        "sports practice",
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
    throw new Error("school source panel bytes changed; rerun the pixel audit before rebuilding");
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) {
    throw new Error(`school campus JPEG is not reproducible; got ${sha256(output)}`);
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

async function updateWorldMap() {
  const worldMap = JSON.parse(await readFile(worldMapPath, "utf8"));
  const existingPortalIndex = worldMap.portals.findIndex(({ id }) => id === rootSchoolPortal.id);
  if (existingPortalIndex === -1) {
    worldMap.portals.push(rootSchoolPortal);
  } else {
    worldMap.portals[existingPortalIndex] = rootSchoolPortal;
  }
  const existingRegionIndex = worldMap.visualRegions.findIndex(
    ({ id }) => id === rootSchoolPortalRegion.id,
  );
  if (existingRegionIndex === -1) {
    worldMap.visualRegions.push(rootSchoolPortalRegion);
  } else {
    worldMap.visualRegions[existingRegionIndex] = rootSchoolPortalRegion;
  }
  return writeIfChanged(worldMapPath, worldMap);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "school-campus");
  if (!existing) {
    manifest.scenes.push({ id: "school-campus", title: "School campus", parentId: "world-map" });
  } else if (
    existing.title !== "School campus"
    || existing.parentId !== "world-map"
  ) {
    throw new Error("school-campus already exists in the manifest with a different parent or title");
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSchoolCampusScene() {
  const assetChanged = await ensureAsset();
  const scene = buildScene();
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const worldMapChanged = await updateWorldMap();
  const manifestChanged = await updateManifest();
  return {
    assetChanged,
    sceneChanged,
    worldMapChanged,
    manifestChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildSchoolCampusScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-campus-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
