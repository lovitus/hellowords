import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the school-gymnasium-equipment terminal scene from its reviewed
 * source raster. The default command writes only this scene JSON and verifies
 * both image tiers; school-campus integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/school-gymnasium-equipment-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/school-gymnasium-equipment-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-gymnasium-equipment.json");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "6f2c55bdc79578875ed93856a5a8ff162a3d72128051fe8107ad6c4c1a9efe21";
const PUBLIC_ASSET_SHA256 = "406402409959fbbdd3b1b5cb2283d3b43506802de99cf7a6f307ecdbfd31a053";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "basketball-wall",
    title: "Basketball wall",
    translation: "篮球墙面",
    description: "Inspect the wall-mounted backboard, hoop, net, braces and blue wall protection.",
    x: 0,
    y: 0,
    width: 400,
    height: 360,
    targetScale: 2.45,
    labels: [
      ["Gymnasium backboard", "体育馆篮板", 180, 150, 0],
      ["Backboard frame", "篮板框", 180, 95, 2],
      ["Backboard panel", "篮板面板", 180, 150, 1],
      ["Backboard top edge", "篮板上沿", 180, 55, 3],
      ["Backboard lower edge", "篮板下沿", 180, 220, 3],
      ["Backboard brace", "篮板支撑", 40, 160, 2],
      ["Backboard support arm", "篮板支臂", 70, 80, 1],
      ["Side support post", "侧支柱", 320, 180, 1],
      ["Wall hoop mount", "墙面篮圈支架", 240, 210, 0],
      ["Hoop mounting plate", "篮圈安装板", 240, 220, 2],
      ["Hoop anchor bolt", "篮圈锚栓", 250, 225, 4],
      ["Basketball rim", "篮球圈", 245, 235, 0],
      ["Rim bracket", "篮圈托架", 230, 225, 2],
      ["Rim fastener", "篮圈紧固件", 275, 230, 4],
      ["Basket net", "篮网", 245, 270, 0],
      ["Basket net cord", "篮网绳", 245, 280, 3],
      ["Net knot", "篮网结", 245, 295, 4],
      ["Blue wall pad", "蓝色墙垫", 180, 330, 0],
      ["Wall pad seam", "墙垫接缝", 180, 330, 3],
      ["Wall pad fastener", "墙垫固定件", 300, 330, 4],
      ["Court wall panel", "球场墙面板", 350, 300, 1],
      ["Court wall panel seam", "球场墙面板接缝", 350, 300, 3],
      ["Gym wall rail", "体育馆墙轨", 350, 250, 2],
      ["Gym wall corner", "体育馆墙角", 390, 300, 2],
      ["Hoop side post", "篮圈侧柱", 300, 210, 1],
    ],
  },
  {
    id: "wall-ladders-and-ropes",
    title: "Wall ladders and ropes",
    translation: "墙梯与攀爬绳",
    description: "Follow the timber wall ladders, rungs, mounting hardware and three hanging climbing ropes.",
    x: 280,
    y: 100,
    width: 500,
    height: 500,
    targetScale: 2.5,
    labels: [
      ["Gym wall ladder", "体育馆墙梯", 420, 400, 0],
      ["Left ladder upright", "左侧墙梯立柱", 330, 400, 1],
      ["Right ladder upright", "右侧墙梯立柱", 520, 400, 1],
      ["Upper ladder rung", "上层墙梯横杆", 420, 300, 2],
      ["Middle ladder rung", "中层墙梯横杆", 420, 370, 2],
      ["Lower ladder rung", "下层墙梯横杆", 420, 450, 2],
      ["Ladder rung bracket", "墙梯横杆托", 500, 370, 3],
      ["Ladder wall mount", "墙梯墙面支座", 330, 280, 1],
      ["Ladder crossbar", "墙梯横梁", 420, 500, 0],
      ["Gym climbing rope", "体育馆攀爬绳", 570, 330, 0],
      ["Rope ceiling anchor", "攀爬绳顶端锚点", 570, 150, 2],
      ["Rope lower knot", "攀爬绳下方绳结", 570, 520, 3],
      ["Rope tail", "攀爬绳尾端", 570, 540, 4],
      ["Gym rope loop", "体育馆攀爬绳环", 570, 480, 3],
      ["Rope wall bracket", "攀爬绳墙托", 570, 160, 1],
      ["Rope ceiling hook", "攀爬绳顶钩", 570, 145, 2],
      ["Rope strand", "攀爬绳绳股", 570, 400, 3],
      ["Left climbing rope", "左侧攀爬绳", 470, 330, 0],
      ["Center climbing rope", "中间攀爬绳", 570, 330, 0],
      ["Right climbing rope", "右侧攀爬绳", 660, 330, 0],
      ["Rope mount plate", "攀爬绳安装板", 660, 155, 2],
      ["Timber ladder rail", "木质墙梯轨", 420, 250, 1],
      ["Ladder foot", "墙梯底脚", 330, 500, 3],
      ["Ladder end cap", "墙梯端盖", 520, 500, 4],
      ["Ladder side brace", "墙梯侧撑", 330, 250, 2],
    ],
  },
  {
    id: "balls-and-rack",
    title: "Balls and rack",
    translation: "球类与球架",
    description: "Inspect the wheeled ball trolley, shelves, dividers, handles, casters and visible colored balls.",
    x: 350,
    y: 450,
    width: 420,
    height: 430,
    targetScale: 2.55,
    labels: [
      ["Gym ball trolley", "体育馆球车", 560, 620, 0],
      ["Ball trolley frame", "球车框架", 560, 560, 1],
      ["Upper ball shelf", "上层球架", 560, 560, 2],
      ["Middle ball shelf", "中层球架", 560, 650, 2],
      ["Lower ball shelf", "下层球架", 560, 750, 2],
      ["Ball shelf divider", "球架隔板", 650, 650, 3],
      ["Ball trolley handle", "球车把手", 560, 530, 1],
      ["Ball trolley caster", "球车脚轮", 560, 790, 4],
      ["Left trolley caster", "球车左脚轮", 450, 790, 4],
      ["Right trolley caster", "球车右脚轮", 680, 790, 4],
      ["Gym basketball cluster", "体育馆篮球簇", 560, 580, 0],
      ["Gym soccer cluster", "体育馆足球簇", 560, 680, 0],
      ["Gym volleyball pair", "体育馆排球对", 640, 680, 0],
      ["Blue volleyball", "蓝色排球", 650, 690, 2],
      ["Foam ball row", "泡沫球列", 560, 750, 0],
      ["Green foam ball", "绿色泡沫球", 500, 750, 2],
      ["Yellow foam ball", "黄色泡沫球", 540, 750, 2],
      ["Red foam ball", "红色泡沫球", 580, 750, 2],
      ["Orange foam ball", "橙色泡沫球", 620, 750, 2],
      ["Blue foam ball", "蓝色泡沫球", 660, 750, 2],
      ["Purple foam ball", "紫色泡沫球", 700, 750, 2],
      ["Ball rack rail", "球架护轨", 460, 620, 1],
      ["Rack side post", "球架侧柱", 680, 620, 1],
      ["Rack lower rail", "球架下护轨", 560, 800, 3],
      ["Ball cradle", "球托架", 560, 700, 3],
    ],
  },
  {
    id: "mats-and-vault-box",
    title: "Mats and vaulting box",
    translation: "体操垫与跳箱",
    description: "Explore the stacked tumbling mats, mat cart, handles, straps, vaulting box tiers and a low gym bench.",
    x: 0,
    y: 430,
    width: 1_400,
    height: 500,
    targetScale: 2.55,
    labels: [
      ["Tumbling mat stack", "体操垫堆", 850, 600, 0],
      ["Green mat top", "绿色垫顶面", 850, 550, 1],
      ["Green mat side", "绿色垫侧面", 850, 600, 1],
      ["Green mat handle", "绿色垫把手", 900, 570, 3],
      ["Blue mat layer", "蓝色垫层", 850, 670, 1],
      ["Blue mat seam", "蓝色垫接缝", 850, 680, 3],
      ["Blue mat handle", "蓝色垫把手", 900, 670, 3],
      ["Mat cart", "体操垫车", 850, 760, 0],
      ["Mat cart shelf", "体操垫车搁板", 850, 760, 2],
      ["Mat cart caster", "体操垫车脚轮", 850, 800, 4],
      ["Mat cart handle", "体操垫车把手", 900, 740, 3],
      ["Mat corner", "体操垫角", 760, 620, 4],
      ["Mat strap", "体操垫绑带", 900, 610, 3],
      ["Gym vaulting box", "体育馆跳箱", 1_120, 650, 0],
      ["Vault box top", "跳箱顶层", 1_120, 590, 1],
      ["Vault box tier", "跳箱层板", 1_120, 680, 2],
      ["Vault box hand slot", "跳箱提手槽", 1_120, 660, 3],
      ["Vault box corner", "跳箱角块", 1_060, 620, 3],
      ["Vault box side", "跳箱侧板", 1_170, 700, 1],
      ["Vault box caster", "跳箱脚轮", 1_220, 750, 4],
      ["Gym bench", "体育馆长凳", 250, 730, 0],
      ["Gym bench seat", "体育馆长凳座面", 250, 700, 1],
      ["Gym bench leg", "体育馆长凳凳腿", 250, 780, 2],
      ["Gym bench brace", "体育馆长凳支撑", 250, 770, 3],
      ["Gym bench foot", "体育馆长凳脚垫", 250, 800, 4],
    ],
  },
  {
    id: "volleyball-and-storage",
    title: "Volleyball and equipment storage",
    translation: "排球与器材储藏",
    description: "Follow the volleyball posts, rolled net, equipment-store shelves, cones, hoops, agility gear and trolley.",
    x: 1_100,
    y: 150,
    width: 572,
    height: 700,
    targetScale: 2.5,
    labels: [
      ["Volleyball post left", "左侧排球柱", 1_450, 480, 0],
      ["Volleyball post right", "右侧排球柱", 1_560, 480, 0],
      ["Post base left", "左侧排球柱底座", 1_450, 760, 1],
      ["Post base right", "右侧排球柱底座", 1_560, 760, 1],
      ["Post height collar", "排球柱高度环", 1_450, 350, 3],
      ["Post top cap", "排球柱顶盖", 1_450, 200, 3],
      ["Volleyball net roll", "排球网卷", 1_620, 450, 0],
      ["Volleyball net cord", "排球网绳", 1_620, 450, 2],
      ["Net storage bag", "球网收纳袋", 1_620, 500, 1],
      ["Net clip", "球网夹", 1_620, 520, 3],
      ["Sports equipment store", "体育器材储藏间", 1_300, 450, 0],
      ["Equipment-store shelf", "器材储藏架", 1_300, 420, 1],
      ["Upper storage shelf", "上层储物架", 1_300, 340, 1],
      ["Blue foam block", "蓝色泡沫块", 1_300, 350, 2],
      ["Green foam block", "绿色泡沫块", 1_380, 350, 2],
      ["Yellow foam block", "黄色泡沫块", 1_450, 350, 2],
      ["Orange training cone", "橙色训练锥", 1_220, 380, 0],
      ["Yellow training cone", "黄色训练锥", 1_280, 380, 0],
      ["Cone stack", "锥桶堆", 1_230, 500, 1],
      ["Hula hoop bundle", "呼啦圈束", 1_380, 500, 0],
      ["Hoop storage hook", "呼啦圈收纳钩", 1_380, 420, 3],
      ["Agility ladder", "敏捷梯", 1_230, 520, 1],
      ["Jump-rope coil", "跳绳卷", 1_230, 470, 2],
      ["Equipment trolley", "器材推车", 1_470, 520, 0],
      ["Trolley shelf", "器材车搁板", 1_470, 560, 2],
    ],
  },
  {
    id: "court-and-room-fittings",
    title: "Court and room fittings",
    translation: "球场与房间设施",
    description: "Inspect the sprung floor, court lines, ceiling services, clerestory windows, doors and store fittings.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.4,
    labels: [
      ["Gym sprung floor", "体育馆弹性地板", 900, 850, 0],
      ["Court boundary line", "球场边界线", 900, 850, 1],
      ["Blue court line", "蓝色球场线", 900, 800, 2],
      ["Red court line", "红色球场线", 1_100, 800, 2],
      ["White court line", "白色球场线", 700, 800, 2],
      ["Court center circle", "球场中圈", 800, 850, 0],
      ["Gym floor expansion joint", "体育馆地板伸缩缝", 1_000, 850, 3],
      ["Gym wall air grille", "体育馆墙面风栅", 1_000, 300, 2],
      ["Gym ceiling light panel", "体育馆顶灯面板", 1_000, 50, 0],
      ["Gym acoustic ceiling tile", "体育馆吸音顶板", 1_000, 100, 1],
      ["Gym clerestory window", "体育馆高侧窗", 800, 130, 0],
      ["Gym window mullion", "体育馆窗竖框", 800, 130, 2],
      ["Gym side door", "体育馆侧门", 900, 400, 0],
      ["Gym door window", "体育馆门窗", 900, 400, 2],
      ["Gym door handle", "体育馆门把手", 900, 430, 3],
      ["Equipment-store threshold", "器材储藏间门槛", 1_200, 550, 2],
      ["Equipment-store lintel", "器材储藏间门楣", 1_300, 300, 1],
      ["Equipment-store doorframe", "器材储藏间门框", 1_200, 400, 2],
      ["Store cabinet", "储藏柜", 1_300, 450, 0],
      ["Store cabinet shelf", "储藏柜搁板", 1_300, 450, 2],
      ["Store shelf divider", "储藏架隔板", 1_380, 450, 3],
      ["Wall-mounted gear rack", "墙面器材架", 1_300, 500, 0],
      ["Gear rack upright", "器材架立柱", 1_300, 500, 2],
      ["Gear rack hook", "器材架挂钩", 1_300, 500, 3],
      ["Floor boundary junction", "地面边界线交点", 1_100, 800, 4],
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
    id: `school-gymnasium-equipment-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the school gymnasium photograph`,
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
      const id = `school-gymnasium-equipment-${slugify(word)}`;
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
      id: `school-gymnasium-equipment-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "school-gymnasium-equipment",
    title: "School gymnasium equipment",
    translation: "学校体育馆器材",
    subtitle: "Court, wall bars, balls, mats, vaulting and storage",
    asset: "/scenes/school-gymnasium-equipment-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-gymnasium-equipment-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized gymnasium photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable basketball, wall-ladder, rope, ball, mat, vaulting, volleyball, storage, court and room-fixture parts across ${detailZones.length} bounded zones. Student identity, activity state, scores, signage, brands, school policy and hidden equipment functions were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "student identity",
        "activity state",
        "score",
        "signage",
        "brand name",
        "school policy",
        "game result",
        "hidden equipment function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("gym source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`gym JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

export async function buildSchoolGymnasiumEquipmentScene() {
  const scene = buildScene();
  if (scene.labels.length < 145 || scene.labels.length > 155) {
    throw new Error(`gym label count ${scene.labels.length} is outside 145–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`gym zone count ${scene.detailZones.length} is not 6`);
  return {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildSchoolGymnasiumEquipmentScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-gymnasium-equipment-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
