import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(projectRoot, "scripts/assets/emergency-assessment-bay-v1.png");
const assetPath = resolve(projectRoot, "public/scenes/emergency-assessment-bay-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/emergency-assessment-bay.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "e0c71d09e58710929db8f78672ccc0ba5e6379aba306e5bdf5b123ee8185b734";
const ASSET_SHA256 = "f8bf7333b715e7dc07d19c219444afc0eda6c95ff218a2d9eb5b79463b4e48cd";
const EXPECTED_LABEL_COUNT = 148;
const OVERVIEW_LABELS = new Set([
  "Assessment couch",
  "Couch underframe",
  "Vitals monitor",
  "Bedhead panel",
  "Bay supply cart",
  "Bay sink",
  "Bay privacy curtain",
]);

// Coordinates are recorded in the final 1600×900 scene frame after visual review.
// Each point lands on an identifiable visible object or component, not the empty room.
const zones = [
  {
    id: "examination-couch",
    title: "Examination couch and linen",
    translation: "检查床与床品",
    description: "Explore the visible examination couch, pillow, mattress, sheet and side rails.",
    x: 315, y: 325, width: 590, height: 260, targetScale: 2.8,
    labels: [
      ["Assessment couch", "评估床", 625, 461],
      ["Assessment-bay pillow", "评估区枕头", 478, 392],
      ["Assessment-bay pillowcase", "评估区枕套", 477, 389],
      ["Assessment-bay pillow seam", "评估区枕头缝线", 496, 400],
      ["Assessment-bay mattress", "评估区床垫", 669, 477],
      ["Assessment-couch rail upright post", "评估床护栏立柱", 428, 461],
      ["Assessment-bay mattress edge", "评估区床垫边缘", 736, 534],
      ["Assessment-bay fitted sheet", "评估区床单", 668, 456],
      ["Assessment-bay sheet fold", "评估区床单折边", 573, 453],
      ["Assessment-bay sheet hem", "评估区床单下摆", 838, 529],
      ["Assessment-couch head section", "评估床头部", 437, 398],
      ["Assessment-couch foot section", "评估床脚部", 850, 523],
      ["Assessment-couch near-side rail", "评估床近侧护栏", 446, 465],
      ["Assessment-couch far-side rail", "评估床远侧护栏", 710, 392],
      ["Assessment-couch near rail grip", "评估床近侧护栏握把", 501, 473],
      ["Assessment-couch far rail grip", "评估床远侧护栏握把", 791, 414],
      ["Assessment-couch rail crossbar", "评估床护栏横杆", 405, 471],
      ["Assessment-couch foot-end rail", "评估床脚端护栏", 842, 512],
      ["Assessment-couch rail hinge", "评估床护栏铰链", 437, 454],
      ["Assessment-couch rail latch", "评估床护栏锁扣", 464, 457],
      ["Assessment-couch side panel", "评估床侧板", 526, 565],
      ["Assessment-couch mattress platform", "评估床床板", 720, 562],
      ["Assessment-couch head-end corner", "评估床头端角", 355, 402],
      ["Assessment-couch foot-end corner", "评估床脚端角", 878, 535],
    ],
  },
  {
    id: "couch-base-and-casters",
    title: "Couch base and casters",
    translation: "床架与脚轮",
    description: "Inspect the visible underframe, adjustment controls, supports and rolling casters.",
    x: 300, y: 555, width: 610, height: 280, targetScale: 2.9,
    labels: [
      ["Couch underframe", "评估床底架", 661, 632],
      ["Assessment-couch central base", "评估床中央底座", 671, 682],
      ["Assessment-couch lower frame", "评估床下层框架", 650, 731],
      ["Assessment-couch head-end support", "评估床头端支撑", 388, 636],
      ["Assessment-couch foot-end support", "评估床脚端支撑", 851, 646],
      ["Assessment-couch left frame rail", "评估床左侧框梁", 415, 626],
      ["Assessment-couch right frame rail", "评估床右侧框梁", 818, 632],
      ["Assessment-couch cross support", "评估床横向支撑", 570, 655],
      ["Assessment-couch lower crossbar", "评估床下横杆", 568, 716],
      ["Assessment-couch frame joint", "评估床框架接点", 611, 637],
      ["Assessment-couch frame bracket", "评估床框架连接片", 733, 638],
      ["Assessment-couch side support", "评估床侧支撑", 507, 669],
      ["Assessment-couch height-control pedal", "评估床高度调节踏板", 550, 765],
      ["Assessment-couch brake pedal", "评估床制动踏板", 775, 758],
      ["Assessment-couch control lever", "评估床调节杆", 495, 704],
      ["Assessment-couch caster assembly", "评估床脚轮组件", 374, 704],
      ["Assessment-couch left caster wheel", "评估床左脚轮", 376, 722],
      ["Assessment-couch left caster fork", "评估床左脚轮叉架", 376, 697],
      ["Assessment-couch front caster wheel", "评估床前脚轮", 573, 748],
      ["Assessment-couch lower foot bar", "评估床底部踏杆", 640, 780],
      ["Assessment-couch right caster wheel", "评估床右脚轮", 794, 745],
      ["Assessment-couch right caster fork", "评估床右脚轮叉架", 794, 719],
      ["Assessment-couch wheel tread", "评估床脚轮胎面", 812, 747],
      ["Assessment-couch wheel swivel", "评估床脚轮转向架", 394, 692],
    ],
  },
  {
    id: "vital-signs-monitor",
    title: "Vital-signs monitor",
    translation: "生命体征监护仪",
    description: "Explore the blank monitor screen, casing, control buttons, stand and visible cables.",
    x: 555, y: 175, width: 165, height: 185, targetScale: 3.05,
    labels: [
      ["Vitals monitor", "生命体征监护仪", 637, 254],
      ["Assessment monitor blank screen", "评估监护仪空白屏幕", 637, 250],
      ["Assessment monitor screen glass", "评估监护仪屏幕玻璃", 633, 249],
      ["Assessment monitor top bezel", "评估监护仪上边框", 637, 219],
      ["Assessment monitor lower bezel", "评估监护仪下边框", 639, 286],
      ["Assessment monitor left bezel", "评估监护仪左边框", 603, 252],
      ["Assessment monitor right bezel", "评估监护仪右边框", 665, 252],
      ["Assessment monitor casing", "评估监护仪外壳", 690, 250],
      ["Assessment monitor control row", "评估监护仪控制键列", 633, 291],
      ["Assessment monitor left button", "评估监护仪左侧按键", 620, 291],
      ["Assessment monitor centre button", "评估监护仪中央按键", 637, 291],
      ["Assessment monitor right button", "评估监护仪右侧按键", 654, 291],
      ["Assessment monitor status indicator", "评估监护仪状态指示灯", 611, 292],
      ["Assessment monitor stand collar", "评估监护仪支架套环", 654, 304],
      ["Assessment monitor mounting bracket", "评估监护仪安装支架", 645, 309],
      ["Assessment monitor support pole", "评估监护仪支撑杆", 653, 319],
      ["Assessment monitor coiled lead", "评估监护仪盘绕导线", 700, 293],
    ],
  },
  {
    id: "headwall-medical-services",
    title: "Headwall medical services",
    translation: "床头医疗接口",
    description: "Identify visible wall outlets, connectors, flowmeter, clear tubing and the nurse-call unit without inferring readings.",
    x: 80, y: 100, width: 450, height: 240, targetScale: 2.85,
    labels: [
      ["Bedhead panel", "床头设备面板", 333, 181],
      ["Assessment headwall upper rail", "评估床头面板上沿", 329, 147],
      ["Assessment headwall lower rail", "评估床头面板下沿", 332, 222],
      ["Assessment headwall end cap", "评估床头面板端盖", 168, 183],
      ["Assessment wall service outlet", "评估区墙面医疗接口", 207, 184],
      ["Assessment round service connector", "评估区圆形接口", 238, 185],
      ["Assessment green connector", "评估区绿色接口", 250, 196],
      ["Assessment yellow connector", "评估区黄色接口", 284, 188],
      ["Assessment black connector", "评估区黑色接口", 392, 187],
      ["Assessment red connector", "评估区红色接口", 419, 193],
      ["Assessment flowmeter tube", "评估区流量计透明管", 290, 254],
      ["Assessment flowmeter body", "评估区流量计主体", 282, 267],
      ["Assessment flowmeter top cap", "评估区流量计顶部", 285, 244],
      ["Assessment flowmeter control knob", "评估区流量计旋钮", 282, 235],
      ["Assessment clear service tubing", "评估区透明医疗管", 272, 306],
      ["Assessment blue service lead", "评估区蓝色导线", 510, 266],
      ["Assessment dark service cable", "评估区深色电缆", 488, 299],
      ["Assessment wall call unit", "评估区墙面呼叫器", 87, 274],
      ["Assessment call-unit indicator", "评估区呼叫器指示灯", 87, 264],
      ["Assessment call-unit red button", "评估区呼叫器红色按键", 87, 286],
      ["Assessment call-unit blue button", "评估区呼叫器蓝色按键", 87, 304],
      ["Assessment call-unit cable", "评估区呼叫器线缆", 89, 333],
      ["Assessment wall connector socket", "评估区墙面插座", 453, 187],
      ["Assessment headwall mounting clip", "评估床头面板固定夹", 347, 221],
    ],
  },
  {
    id: "clinical-supply-cart",
    title: "Clinical supply cart",
    translation: "临床用品推车",
    description: "Explore the open supply trolley, clear packets, shelf rails, lower shelves and casters; package contents are not inferred.",
    x: 0, y: 340, width: 270, height: 470, targetScale: 2.8,
    labels: [
      ["Bay supply cart", "临床用品推车", 126, 610],
      ["Assessment supply-cart top tray", "评估区推车上层托盘", 215, 425],
      ["Assessment supply-cart blue tray", "评估区推车蓝色托盘", 90, 400],
      ["Assessment supply-cart tray rim", "评估区推车托盘边沿", 158, 412],
      ["Assessment supply-cart upper shelf", "评估区推车上层架", 128, 464],
      ["Assessment supply-cart middle shelf", "评估区推车中层架", 124, 604],
      ["Assessment supply-cart lower shelf", "评估区推车底层架", 129, 721],
      ["Assessment supply-cart left upright", "评估区推车左立柱", 37, 593],
      ["Assessment supply-cart right upright", "评估区推车右立柱", 241, 596],
      ["Assessment supply-cart front rail", "评估区推车前护栏", 132, 493],
      ["Assessment supply-cart side rail", "评估区推车侧护栏", 220, 481],
      ["Assessment wrapped supply packet", "评估区独立包装用品", 70, 546],
      ["Assessment folded white supply pack", "评估区折叠白色用品包", 103, 514],
      ["Assessment blue storage tub", "评估区蓝色收纳盒", 117, 652],
      ["Assessment clear-front supply bin", "评估区透明前板用品箱", 183, 650],
      ["Assessment small white packet", "评估区小型白色包装", 74, 689],
      ["Assessment grey storage bin", "评估区灰色收纳箱", 186, 555],
      ["Assessment cart right shelf rail", "评估区推车右侧搁架护栏", 238, 670],
      ["Assessment cart lower crossbar", "评估区推车底横杆", 126, 759],
      ["Assessment cart left caster", "评估区推车左脚轮", 20, 755],
      ["Assessment cart left caster fork", "评估区推车左轮叉架", 25, 741],
      ["Assessment cart right caster", "评估区推车右脚轮", 229, 756],
      ["Assessment cart wheel tread", "评估区推车轮胎面", 231, 762],
      ["Assessment cart lower frame joint", "评估区推车下部框架接点", 245, 714],
    ],
  },
  {
    id: "handwash-and-waste-station",
    title: "Handwash and waste station",
    translation: "洗手池与废弃物设施",
    description: "Identify the visible wash basin, tap, yellow lidded container and dark waste bin without assuming their contents.",
    x: 1_175, y: 220, width: 300, height: 450, targetScale: 2.95,
    labels: [
      ["Bay sink", "洗手池", 1293, 442],
      ["Assessment handwash basin rim", "评估区洗手池边沿", 1301, 360],
      ["Assessment basin bowl", "评估区洗手池盆体", 1305, 390],
      ["Assessment basin opening", "评估区洗手池开口", 1337, 423],
      ["Assessment basin front face", "评估区洗手池前壁", 1315, 459],
      ["Assessment faucet", "评估区水龙头", 1375, 375],
      ["Assessment faucet spout", "评估区龙头出水嘴", 1383, 395],
      ["Assessment faucet handle", "评估区龙头把手", 1365, 375],
      ["Assessment basin lower contour", "评估区洗手池下缘曲线", 1273, 465],
      ["Assessment yellow lidded container", "评估区黄色带盖容器", 1220, 510],
      ["Assessment yellow container lid", "评估区黄色容器盖", 1235, 375],
      ["Assessment yellow container body", "评估区黄色容器桶身", 1219, 465],
      ["Assessment yellow container foot", "评估区黄色容器底座", 1223, 555],
      ["Assessment dark waste bin", "评估区深色废弃物桶", 1306, 559],
      ["Assessment waste-bin lid", "评估区废弃物桶盖", 1308, 518],
      ["Assessment waste-bin opening", "评估区废弃物桶投入口", 1309, 526],
      ["Assessment waste-bin body", "评估区废弃物桶身", 1306, 573],
      ["Assessment wall dispenser housing", "评估区墙面分配器外壳", 1330, 235],
      ["Assessment wall dispenser lower edge", "评估区墙面分配器下沿", 1335, 274],
    ],
  },
  {
    id: "curtain-window-and-chair",
    title: "Curtain, window and visitor chair",
    translation: "隔帘、窗户与出入口",
    description: "Explore visible privacy curtain fittings, window frame and visitor chair.",
    x: 730, y: 65, width: 420, height: 450, targetScale: 2.75,
    labels: [
      ["Bay privacy curtain", "评估区隐私隔帘", 890, 320],
      ["Assessment curtain track", "评估区隔帘轨道", 873, 91],
      ["Assessment curtain leading edge", "评估区隔帘前缘", 947, 324],
      ["Assessment curtain top hem", "评估区隔帘顶部包边", 881, 95],
      ["Assessment curtain fold", "评估区隔帘褶皱", 914, 232],
      ["Assessment curtain lower hem", "评估区隔帘下摆", 926, 495],
      ["Assessment curtain carrier", "评估区隔帘滑轮", 934, 89],
      ["Assessment bay window", "评估区窗户", 1035, 221],
      ["Assessment window glass", "评估区窗玻璃", 1040, 216],
      ["Assessment window left jamb", "评估区窗户左侧框", 1014, 216],
      ["Assessment window right jamb", "评估区窗户右侧框", 1096, 215],
      ["Assessment window sill", "评估区窗台", 1055, 330],
      ["Assessment visitor chair", "评估区访客椅", 1013, 406],
      ["Assessment chair back", "评估区椅背", 1009, 382],
      ["Assessment chair seat", "评估区椅座", 1018, 412],
      ["Assessment chair wooden leg", "评估区椅子木腿", 1036, 462],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slugify(value) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function levelFor(word) {
  if (OVERVIEW_LABELS.has(word)) return 0;
  const normalized = word.toLocaleLowerCase("en-US");
  if (/\b(seam|hem|hinge|latch|tread|swivel|edge|fold|carrier|drain|overflow|spout|handle|joint|bracket|fork|hub|indicator|button|cable|connector|socket|cap|knob|rim|jamb)\b/u.test(normalized)) return 4;
  if (/\b(screen|bezel|casing|rail|frame|support|base|shelf|tray|panel|outlet|pedal|caster|wheel|glass|bowl|body|lid|leg|track|hem|fold|lead|stand|mount|crossbar|column)\b/u.test(normalized)) return 3;
  if (/\b(couch|monitor|cart|basin|curtain|window|chair|container|connector|flowmeter|tubing|packet|faucet|bin|pillow|mattress|sheet|cable|panel|pedestal|rail)\b/u.test(normalized)) return 2;
  return 1;
}

function rect(x, y, width, height) {
  return {
    x,
    y,
    width,
    height,
  };
}

function buildScene(assetSha256) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y] of zone.labels) {
      const id = `emergency-assessment-bay-${slugify(word)}`;
      const size = 44;
      const region = {
        id: `${id}-region`,
        description: `${word} on the ${zone.title.toLowerCase()} in the emergency assessment-bay photograph`,
        kind: "part",
        ...rect(Math.max(0, Math.min(WIDTH - size, x - size / 2)), Math.max(0, Math.min(HEIGHT - size, y - size / 2)), size, size),
      };
      labels.push({
        id,
        word,
        translation,
        x,
        y,
        priority: Number((1 + priority / 1_000).toFixed(6)),
        minLevel: levelFor(word),
        sourceVisualRegion: region.id,
        semanticRealmId: "body-daily-life",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priority += 1;
    }
    detailZones.push({
      id: `emergency-assessment-bay-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...rect(zone.x, zone.y, zone.width, zone.height),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  const uniqueWords = new Set(labels.map(({ word }) => word.toLocaleLowerCase("en-US")));
  const uniqueIds = new Set(labels.map(({ id }) => id));
  if (labels.length !== EXPECTED_LABEL_COUNT || uniqueWords.size !== labels.length || uniqueIds.size !== labels.length) {
    throw new Error(`Expected ${EXPECTED_LABEL_COUNT} unique labels and IDs, got ${labels.length}/${uniqueWords.size}/${uniqueIds.size}`);
  }
  return {
    id: "emergency-assessment-bay",
    title: "Emergency assessment bay",
    translation: "急诊评估床位",
    subtitle: "Examination couch, monitoring, wall services, clinical supplies and privacy fittings",
    asset: "/scenes/emergency-assessment-bay-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "emergency-triage-reception",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/emergency-assessment-bay-premium-v1.jpg",
      reviewedAssetSha256: assetSha256,
      rationale: "The bright emergency assessment-bay photograph was inspected at original and final pixels. Seven focused zones cover the examination couch, its visible rolling base, blank-screen monitor, bedhead connectors, open clinical supply cart, wash/waste station, and curtain/window/visitor chair. Labels name only visible surfaces, fittings and generic supplies. No patient, diagnosis, device reading, package contents, treatment or specific waste purpose is inferred.",
      previousLabelCount: 153,
      retainedLabelCount: labels.length,
      removedLabelCount: 5,
      removedExamples: ["patient identity", "monitor readings", "waste contents", "duplicate monitor cable label", "unpictured sink splashback"],
    },
    labels,
    portals: [],
  };
}

async function writeIfChanged(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, bytes) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path, bytes);
  return true;
}

async function ensureAsset() {
  const source = await readFile(sourcePath);
  if (sha256(source) !== SOURCE_SHA256) throw new Error("Source image bytes changed; repeat visual review first");
  const metadata = await sharp(source).metadata();
  if (metadata.width !== SOURCE_WIDTH || metadata.height !== SOURCE_HEIGHT) {
    throw new Error(`Expected a ${SOURCE_WIDTH}×${SOURCE_HEIGHT} source raster, got ${metadata.width}×${metadata.height}`);
  }
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== ASSET_SHA256) throw new Error(`JPEG is not reproducible; got ${sha256(output)}`);
  await writeFile(assetPath, output);
  return sha256(output);
}

async function assertUniqueSceneWords(scene) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Set();
  for (const entry of manifest.scenes.filter(({ id }) => id !== scene.id)) {
    const existing = JSON.parse(await readFile(resolve(projectRoot, `public/data/scenes/${entry.id}.json`), "utf8"));
    for (const label of existing.labels) existingWords.add(label.word.toLocaleLowerCase("en-US"));
  }
  for (const label of scene.labels) {
    if (existingWords.has(label.word.toLocaleLowerCase("en-US"))) throw new Error(`Scene word duplicates ${label.word} from another scene`);
  }
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expected = { id: "emergency-assessment-bay", title: "Emergency assessment bay", parentId: "emergency-triage-reception" };
  const existing = manifest.scenes.find(({ id }) => id === expected.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(expected)) throw new Error("Emergency assessment bay already exists with a different manifest record");
  if (!existing) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === expected.parentId);
    if (parentIndex < 0) throw new Error("emergency-triage-reception is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, expected);
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildEmergencyAssessmentBayScene() {
  const assetSha256 = await ensureAsset();
  const scene = buildScene(assetSha256);
  await assertUniqueSceneWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const manifestChanged = await updateManifest();
  return { id: scene.id, labels: scene.labels.length, zones: scene.detailZones.length, assetSha256, sceneChanged, manifestChanged };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildEmergencyAssessmentBayScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-emergency-assessment-bay-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
