import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build a terminal school-locker scene from the reviewed locker-bank image.
 * Source points and crops are scaled into the published 1600x900 canvas.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/school-locker-bank-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/school-locker-bank-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-locker-bank.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-corridor.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "3b5c595f007d9aeffae0e9888dedeac9b3ea2a1e768ccb1ae551dd44645d1001";
const PUBLIC_ASSET_SHA256 = "8f03e0c4b267c589dce954be3191337945407f6df32cb6bb716610ba8209509c";
const SCALE_X = WIDTH / SOURCE_WIDTH;
const SCALE_Y = HEIGHT / SOURCE_HEIGHT;

const zones = [
  {
    id: "left-locker-bank",
    title: "Locker doors and frame",
    translation: "储物柜门与框架",
    description: "Inspect the left locker doors, top frame, vents, hinges and visible dial hardware.",
    x: 145,
    y: 35,
    width: 650,
    height: 440,
    labels: [
      ["School locker bank", "学校储物柜组", 515, 260],
      ["Left locker door jamb", "储物柜左侧门框立边", 165, 350],
      ["Second blue locker door panel", "第二扇蓝色储物柜门板", 480, 250],
      ["Locker-bank top rail", "储物柜组上横梁", 700, 42],
      ["Vertical locker divider", "储物柜竖向隔板", 675, 300],
      ["Blue locker door panel", "蓝色储物柜门板", 220, 250],
      ["Sage locker door panel", "灰绿色储物柜门板", 350, 250],
      ["Locker door edge seam", "储物柜门边接缝", 284, 220],
      ["Upper locker vent grille", "储物柜上部通风格栅", 220, 103],
      ["Upper vent louver", "上部通风百叶片", 220, 115],
      ["Locker lock faceplate", "储物柜锁面板", 203, 350],
      ["Combination-lock dial", "密码锁旋钮", 204, 359],
      ["Locker dial index mark", "储物柜旋钮指示刻线", 204, 335],
      ["Locker door hinge leaf", "储物柜门铰链页片", 281, 347],
      ["Locker hinge knuckle", "储物柜铰链关节", 282, 350],
    ],
  },
  {
    id: "open-locker-compartment",
    title: "Open locker compartment",
    translation: "打开的储物柜格",
    description: "Focus on the open compartment, shelf, coat hook, inner door and visible lower cubby.",
    x: 800,
    y: 35,
    width: 205,
    height: 650,
    labels: [
      ["Open locker compartment", "打开的储物柜格", 865, 330],
      ["Locker upper shelf", "储物柜上层隔板", 865, 145],
      ["Shelf front lip", "隔板前沿", 865, 155],
      ["Locker shelf bracket", "储物柜隔板托架", 825, 150],
      ["Locker interior left wall", "储物柜内左侧壁", 817, 300],
      ["Locker interior right wall", "储物柜内右侧壁", 925, 300],
      ["Locker rear panel", "储物柜后板", 870, 270],
      ["Double coat hook", "双头衣钩", 872, 195],
      ["Coat-hook mounting plate", "衣钩安装底板", 872, 185],
      ["Open locker door inner face", "储物柜门内侧面", 970, 300],
      ["Inner-door vent slots", "门内侧通风槽", 970, 105],
      ["Door-mounted lock case", "门内侧锁盒", 975, 354],
      ["Lower locker cubby", "储物柜下部格", 870, 520],
      ["Locker threshold lip", "储物柜门槛边", 870, 505],
      ["Locker shoe pair", "储物柜里的鞋", 866, 626],
    ],
  },
  {
    id: "right-locker-bank",
    title: "Right locker doors",
    translation: "右侧储物柜门",
    description: "Compare the right-side blue and sage doors, their vents, frames and separate lock hardware.",
    x: 1_005,
    y: 35,
    width: 575,
    height: 650,
    labels: [
      ["Right locker-bank wing", "储物柜组右侧", 1_300, 260],
      ["Far-right blue locker door", "最右侧蓝色储物柜门", 1_520, 260],
      ["Right sage locker door", "右侧灰绿色储物柜门", 1_115, 260],
      ["Right-bank door seam", "右侧柜门接缝", 1_470, 250],
      ["Right locker vent block", "右侧储物柜通风组", 1_520, 112],
      ["Lower-right vent block", "右下通风组", 1_520, 615],
      ["Right-side lock plate", "右侧锁面板", 1_095, 355],
      ["Right-side dial ring", "右侧旋钮环", 1_115, 355],
      ["Right-side hinge", "右侧铰链", 1_074, 350],
      ["Far-right upper door hinge", "最右侧柜门上部铰链", 1_565, 355],
      ["Right-bank top edge", "右侧柜组顶沿", 1_450, 37],
      ["Right-bank lower rail", "右侧柜组下横梁", 1_350, 675],
      ["Locker-bank right upright", "储物柜组右立柱", 1_575, 520],
      ["Lower-right locker door panel", "右下储物柜门板", 1_115, 640],
      ["Right locker door bottom edge", "右侧柜门下沿", 1_115, 665],
    ],
  },
  {
    id: "backpack-and-bottle",
    title: "Backpack and school items",
    translation: "书包与学习用品",
    description: "Trace the backpack pockets and straps, lunch container and clear water bottle beside the lockers.",
    x: 145,
    y: 475,
    width: 590,
    height: 370,
    labels: [
      ["Navy school backpack", "藏蓝色学生书包", 410, 690],
      ["Backpack carry loop", "书包提环", 425, 510],
      ["Backpack side seam", "书包侧缝", 330, 650],
      ["Backpack front pocket", "书包前袋", 405, 720],
      ["Front-pocket zipper", "前袋拉链", 360, 708],
      ["Backpack zipper pull", "书包拉链头", 330, 710],
      ["Backpack side pocket", "书包侧袋", 488, 700],
      ["Backpack bottom panel", "书包底部面板", 420, 770],
      ["White lunch container", "白色午餐盒", 597, 750],
      ["Lunch-container lid", "午餐盒盖", 600, 718],
      ["Lunch-container clasp", "午餐盒扣", 620, 722],
      ["Clear locker-area bottle", "储物柜旁透明水瓶", 690, 715],
      ["Water-bottle cap", "水瓶盖", 690, 652],
      ["Bottle carry loop", "水瓶提环", 700, 650],
      ["Transparent bottle body", "透明瓶身", 690, 720],
    ],
  },
  {
    id: "bench-and-books",
    title: "Bench, books and clothing",
    translation: "长椅、书本与衣物",
    description: "Inspect the timber bench, closed exercise book, pencil pouch and folded rain jacket.",
    x: 735,
    y: 685,
    width: 710,
    height: 230,
    labels: [
      ["School locker bench", "学校储物柜长椅", 1_000, 765],
      ["Timber bench seat plank", "木制长椅坐板", 1_000, 740],
      ["Bench front edge", "长椅前沿", 1_000, 780],
      ["Bench support leg", "长椅支腿", 1_275, 875],
      ["Closed exercise book", "合上的练习本", 810, 755],
      ["Book front cover", "书本封面", 820, 750],
      ["Exercise-book page block", "练习本书页", 815, 775],
      ["Book spine edge", "书脊边", 745, 760],
      ["Blue pencil pouch", "蓝色铅笔袋", 975, 758],
      ["Pencil-pouch zipper", "铅笔袋拉链", 970, 742],
      ["Pencil-pouch pull tab", "铅笔袋拉片", 1_030, 746],
      ["Folded rain jacket", "折叠雨衣", 1_190, 750],
      ["Jacket sleeve fold", "外套袖褶", 1_240, 750],
      ["Jacket cuff edge", "外套袖口边", 1_300, 770],
      ["Bench right end", "长椅右端", 1_390, 745],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function point(value, axis) {
  return Number((value * (axis === "x" ? SCALE_X : SCALE_Y)).toFixed(6));
}

function rectangle(rect) {
  return {
    x: point(rect.x, "x"),
    y: point(rect.y, "y"),
    width: point(rect.width, "x"),
    height: point(rect.height, "y"),
  };
}

function slug(value) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function makeScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y] of zone.labels) {
      if (x < zone.x || x > zone.x + zone.width || y < zone.y || y > zone.y + zone.height) {
        throw new Error(`${zone.id}/${word} anchor falls outside its focus zone`);
      }
      const regionSize = 42;
      const left = Math.max(0, Math.min(SOURCE_WIDTH - regionSize, x - regionSize / 2));
      const top = Math.max(0, Math.min(SOURCE_HEIGHT - regionSize, y - regionSize / 2));
      const id = `school-locker-bank-${slug(word)}`;
      const regionId = `school-locker-bank-region-${slug(word)}`;
      visualRegions.push({
        id: regionId,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the school locker photograph`,
        kind: "part",
        ...rectangle({ x: left, y: top, width: regionSize, height: regionSize }),
      });
      labels.push({
        id,
        word,
        translation,
        x: point(x, "x"),
        y: point(y, "y"),
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: zone.labels.findIndex(([candidate]) => candidate === word) < 2
          ? 0
          : zone.labels.findIndex(([candidate]) => candidate === word) < 4
            ? 1
            : 2 + ((priority + 1) % 3),
        sourceVisualRegion: regionId,
      });
      labelIds.push(id);
      priority += 1;
    }
    detailZones.push({
      id: `school-locker-bank-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...rectangle(zone),
      targetScale: 2.85,
      labelIds,
    });
  }
  const count = zones.reduce((sum, zone) => sum + zone.labels.length, 0);
  if (count !== 75 || detailZones.length !== 5) {
    throw new Error(`expected 75 labels across 5 zones, got ${count}/${detailZones.length}`);
  }
  return {
    id: "school-locker-bank",
    title: "School locker bank",
    translation: "学校储物柜区",
    subtitle: "Locker doors, storage hardware, student bags, school items and bench",
    asset: "/scenes/school-locker-bank-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "school-corridor",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-locker-bank-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 photograph was reviewed at native size. It retains ${count} independently pointable locker structures, compartment parts, footwear, student storage items, stationery, clothing and bench parts across five non-overlapping focus regions. Student identity, readable labels, school branding, activities and hidden contents were excluded.`,
      previousLabelCount: 82,
      retainedLabelCount: count,
      removedLabelCount: 7,
      removedExamples: ["student identity", "locker number", "school branding", "printed name", "bag contents", "brand", "school activity"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("school-locker source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("school-locker JPEG is not reproducible");
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function assertUniqueWords(scene) {
  const words = new Set();
  for (const label of scene.labels) {
    const normalized = label.word.toLocaleLowerCase("en-US");
    if (words.has(normalized)) throw new Error(`school-locker-bank repeats “${label.word}”`);
    words.add(normalized);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = new Set();
  for (const entry of manifest.scenes) {
    if (entry.id === scene.id) continue;
    const path = resolve(projectRoot, "public/data/scenes", `${entry.id}.json`);
    try {
      const other = JSON.parse(await readFile(path, "utf8"));
      for (const label of other.labels) existing.add(label.word.toLocaleLowerCase("en-US"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const duplicates = [...words].filter((word) => existing.has(word));
  if (duplicates.length > 0) throw new Error(`school-locker-bank duplicates existing display words: ${duplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-school-locker-bank",
  label: "Explore the school lockers",
  translation: "探索学校储物柜",
  childSceneId: "school-locker-bank",
  sourceVisualRegion: "portal-school-locker-bank",
  x: 1_518,
  y: 38,
  width: 77,
  height: 722,
  enterScale: 3.3,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete far-right blue locker door in the foreground locker bank of the school corridor",
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
  if (!manifest.scenes.some(({ id }) => id === "school-locker-bank")) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "school-corridor");
    if (parentIndex < 0) throw new Error("school-corridor is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, {
      id: "school-locker-bank",
      title: "School locker bank",
      parentId: "school-corridor",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSchoolLockerBankScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const result = { assetChanged, sceneChanged, labels: scene.labels.length, zones: scene.detailZones.length };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildSchoolLockerBankScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-locker-bank-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
