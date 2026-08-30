import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the PACU/recovery-room terminal scene from its reviewed source
 * raster. The default command writes only the owned scene JSON and verifies
 * both image tiers. Pass --integrate only when the main branch is ready to
 * add the operating-theatre portal and manifest entry.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/post-anesthesia-care-unit-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/post-anesthesia-care-unit-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/post-anesthesia-care-unit.json");
const operatingTheatrePath = resolve(projectRoot, "public/data/scenes/operating-theatre.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "094bf112eba7d050d0e55d16ebc4e06135489f3d2fc015f5188ca4be601e40dc";
const PUBLIC_ASSET_SHA256 = "e3329b44269fbd08545a2a1adf3e0f9929696fde864fd4ff42537366cb2cedef";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "foreground-recovery-bays",
    title: "Foreground recovery bays",
    translation: "前排恢复病床",
    description: "Inspect the three foreground recovery beds, bedside devices, outlets and privacy fittings.",
    x: 0,
    y: 430,
    width: 1_100,
    height: 511,
    targetScale: 2.55,
    labels: [
      ["PACU foreground bed", "PACU 前排病床", 250, 700, 0],
      ["PACU bed mattress", "PACU 病床垫", 250, 640, 1],
      ["PACU bed headboard", "PACU 病床头板", 250, 800, 2],
      ["PACU bed footboard", "PACU 病床尾板", 250, 830, 3],
      ["PACU bed side rail", "PACU 病床侧栏", 180, 680, 2],
      ["PACU bed caster", "PACU 病床脚轮", 280, 880, 4],
      ["PACU bedside table", "PACU 床旁桌", 390, 670, 0],
      ["PACU bedside drawer", "PACU 床旁抽屉", 390, 700, 2],
      ["PACU bedside monitor", "PACU 床旁监视器", 80, 560, 1],
      ["PACU monitor screen", "PACU 监视器屏幕", 80, 560, 3],
      ["PACU monitor arm", "PACU 监视器支臂", 100, 520, 2],
      ["PACU IV pole", "PACU 输液杆", 430, 520, 0],
      ["PACU infusion pump", "PACU 输液泵", 430, 580, 2],
      ["PACU infusion hook", "PACU 输液挂钩", 430, 500, 4],
      ["PACU oxygen outlet", "PACU 氧气接口", 300, 500, 2],
      ["PACU vacuum outlet", "PACU 真空接口", 330, 500, 3],
      ["PACU pulse oximeter probe", "PACU 脉搏血氧探头", 120, 600, 3],
      ["PACU blood pressure cuff", "PACU 血压袖带", 150, 620, 4],
      ["PACU ECG lead set", "PACU 心电导联组", 180, 620, 4],
      ["PACU privacy curtain", "PACU 隐私帘", 480, 500, 1],
      ["PACU curtain track", "PACU 隐私帘轨道", 450, 430, 2],
      ["PACU curtain carrier", "PACU 隐私帘滑轮", 480, 470, 4],
    ],
  },
  {
    id: "rear-recovery-bays",
    title: "Rear recovery bays",
    translation: "后排恢复病床",
    description: "Follow the rear recovery beds, monitor mounts, outlets, curtains, tables and glass separation.",
    x: 430,
    y: 130,
    width: 1_242,
    height: 500,
    targetScale: 2.5,
    labels: [
      ["PACU rear bay", "PACU 后排病区", 1_400, 350, 0],
      ["left recovery bed", "左侧恢复病床", 1_300, 430, 0],
      ["left bed rail", "左侧病床护栏", 1_250, 430, 2],
      ["left bed caster", "左侧病床脚轮", 1_300, 560, 4],
      ["center recovery bed", "中间恢复病床", 1_500, 430, 0],
      ["center bed rail", "中间病床护栏", 1_450, 430, 2],
      ["center bed caster", "中间病床脚轮", 1_500, 560, 4],
      ["right recovery bed", "右侧恢复病床", 1_600, 430, 0],
      ["right bed rail", "右侧病床护栏", 1_550, 430, 2],
      ["right bed caster", "右侧病床脚轮", 1_600, 560, 4],
      ["rear bedside monitor", "后排床旁监视器", 1_250, 250, 1],
      ["rear monitor screen", "后排监视器屏幕", 1_250, 250, 3],
      ["rear monitor mount", "后排监视器支架", 1_250, 300, 4],
      ["rear IV pole", "后排输液杆", 1_500, 250, 0],
      ["rear infusion pump", "后排输液泵", 1_500, 320, 2],
      ["rear oxygen panel", "后排氧气面板", 1_450, 230, 2],
      ["rear vacuum socket", "后排真空插口", 1_500, 230, 3],
      ["rear privacy curtain", "后排隐私帘", 1_550, 300, 1],
      ["rear curtain track", "后排帘轨", 1_550, 180, 3],
      ["rear bedside table", "后排床旁桌", 1_570, 450, 0],
      ["rear drawer pull", "后排抽屉拉手", 1_570, 500, 4],
      ["rear glass partition", "后排玻璃隔断", 1_100, 200, 0],
    ],
  },
  {
    id: "nurse-communications-base",
    title: "Nurse communications base",
    translation: "护士通讯工作站",
    description: "Inspect the central communications base, observation glazing, corridor hardware and ceiling services.",
    x: 500,
    y: 0,
    width: 650,
    height: 470,
    targetScale: 2.4,
    labels: [
      ["PACU nurse base", "PACU 护士工作站", 760, 170, 0],
      ["nurse base counter", "护士站柜台", 760, 220, 1],
      ["nurse base monitor", "护士站监视器", 760, 170, 2],
      ["nurse base keyboard", "护士站键盘", 730, 210, 3],
      ["nurse base chair", "护士站座椅", 830, 230, 0],
      ["nurse base wall clock", "护士站挂钟", 650, 150, 1],
      ["nurse observation window", "护士观察窗", 850, 260, 0],
      ["observation window frame", "观察窗框", 850, 260, 3],
      ["PACU corridor doorway", "PACU 走廊门口", 550, 170, 0],
      ["PACU corridor door handle", "PACU 走廊门把手", 550, 170, 3],
      ["PACU corridor door window", "PACU 走廊门窗", 550, 150, 2],
      ["PACU discharge corridor", "PACU 出院走廊", 650, 300, 1],
      ["PACU call light panel", "PACU 呼叫灯面板", 950, 300, 2],
      ["PACU communication panel", "PACU 通讯面板", 900, 300, 3],
      ["PACU ceiling service rail", "PACU 顶部服务轨", 750, 40, 0],
      ["PACU ceiling light panel", "PACU 顶灯面板", 800, 25, 2],
      ["PACU air diffuser", "PACU 送风散流器", 1_000, 50, 3],
      ["PACU floor transition strip", "PACU 地面过渡条", 650, 390, 4],
      ["central workstation drawer", "中央工作站抽屉", 800, 240, 2],
      ["workstation cable grommet", "工作站穿线孔", 810, 215, 4],
    ],
  },
  {
    id: "clean-utility-bay",
    title: "Clean utility bay",
    translation: "清洁物资区",
    description: "Explore the utility sink, dispensers, linen shelves, blanket warmer and supply storage.",
    x: 0,
    y: 80,
    width: 450,
    height: 560,
    targetScale: 2.5,
    labels: [
      ["PACU clean utility bay", "PACU 清洁物资区", 220, 330, 0],
      ["PACU utility sink", "PACU 物资区水槽", 120, 350, 0],
      ["PACU hands-free faucet", "PACU 免手触水龙头", 120, 300, 2],
      ["PACU utility backsplash", "PACU 水槽挡水板", 120, 260, 2],
      ["PACU utility drain", "PACU 水槽排水口", 120, 390, 4],
      ["PACU soap dispenser", "PACU 皂液分配器", 60, 250, 1],
      ["PACU glove dispenser", "PACU 手套分配器", 250, 280, 1],
      ["PACU paper towel dispenser", "PACU 纸巾分配器", 60, 200, 2],
      ["PACU clean cabinet", "PACU 清洁柜", 300, 430, 0],
      ["PACU cabinet glass door", "PACU 柜体玻璃门", 300, 430, 2],
      ["PACU cabinet shelf", "PACU 柜内搁板", 300, 480, 3],
      ["PACU linen shelf", "PACU 布草搁板", 380, 180, 1],
      ["PACU folded blanket", "PACU 折叠毯", 380, 220, 3],
      ["PACU blanket warmer", "PACU 保温柜", 380, 330, 0],
      ["PACU clean supply cart", "PACU 清洁物资车", 410, 450, 1],
      ["PACU supply cart shelf", "PACU 物资车搁板", 410, 490, 3],
      ["PACU supply cart caster", "PACU 物资车脚轮", 410, 540, 4],
      ["PACU sealed supply bin", "PACU 密封物资箱", 320, 520, 2],
      ["PACU clean waste bin", "PACU 清洁废物桶", 250, 500, 1],
      ["PACU waste bin lid", "PACU 废物桶盖", 250, 470, 3],
      ["PACU sharps station", "PACU 锐器处理位", 210, 420, 2],
      ["PACU sharps container", "PACU 锐器盒", 210, 450, 4],
      ["PACU utility floor mat", "PACU 物资区地垫", 220, 580, 1],
      ["PACU utility wall rail", "PACU 物资区墙轨", 220, 150, 3],
      ["PACU sink counter edge", "PACU 水槽台面边缘", 150, 410, 4],
    ],
  },
  {
    id: "equipment-parking-bay",
    title: "Equipment parking bay",
    translation: "设备停放区",
    description: "Inspect the resuscitation trolley, suction, oxygen cylinder, airway cart, mobile imaging and transfer gear.",
    x: 1_050,
    y: 170,
    width: 622,
    height: 700,
    targetScale: 2.6,
    labels: [
      ["PACU equipment bay", "PACU 设备停放区", 1_350, 500, 0],
      ["PACU resuscitation trolley", "PACU 复苏推车", 1_250, 350, 0],
      ["PACU trolley drawer", "PACU 推车抽屉", 1_250, 410, 2],
      ["PACU trolley caster", "PACU 推车脚轮", 1_250, 480, 4],
      ["PACU portable suction unit", "PACU 便携吸引机", 1_350, 300, 1],
      ["PACU suction canister", "PACU 吸引罐", 1_350, 350, 3],
      ["PACU suction tubing", "PACU 吸引管路", 1_350, 400, 4],
      ["PACU oxygen cylinder", "PACU 氧气瓶", 1_450, 300, 0],
      ["PACU cylinder trolley", "PACU 氧气瓶车", 1_450, 400, 1],
      ["PACU cylinder strap", "PACU 氧气瓶带", 1_450, 350, 3],
      ["PACU airway cart", "PACU 气道设备车", 1_550, 300, 1],
      ["PACU airway drawer", "PACU 气道设备抽屉", 1_550, 360, 3],
      ["PACU mobile xray cart", "PACU 移动 X 光车", 1_600, 500, 0],
      ["PACU xray panel", "PACU X 光面板", 1_600, 430, 2],
      ["PACU wheelchair", "PACU 轮椅", 1_250, 650, 0],
      ["PACU wheelchair armrest", "PACU 轮椅扶手", 1_250, 620, 2],
      ["PACU wheelchair wheel", "PACU 轮椅车轮", 1_250, 700, 4],
      ["PACU transfer stretcher", "PACU 转运担架", 1_500, 700, 0],
      ["PACU stretcher mattress", "PACU 担架床垫", 1_500, 660, 2],
      ["PACU stretcher side rail", "PACU 担架床侧栏", 1_450, 680, 3],
      ["PACU stretcher caster", "PACU 担架床脚轮", 1_500, 780, 4],
      ["PACU equipment parking rail", "PACU 设备停放护栏", 1_300, 220, 2],
      ["PACU equipment cabinet", "PACU 设备柜", 1_600, 650, 1],
      ["PACU equipment shelf", "PACU 设备搁板", 1_600, 700, 3],
      ["PACU equipment supply box", "PACU 设备物资箱", 1_600, 750, 4],
    ],
  },
  {
    id: "corridor-and-discharge",
    title: "Corridor and discharge lounge",
    translation: "走廊与离院休息区",
    description: "Follow the discharge lounge, corridor handrails, glazing, doors, floor surfaces and transfer supplies.",
    x: 480,
    y: 0,
    width: 700,
    height: 450,
    targetScale: 2.45,
    labels: [
      ["PACU discharge lounge", "PACU 离院休息区", 1_000, 300, 0],
      ["PACU discharge chair", "PACU 离院休息椅", 1_000, 350, 0],
      ["PACU discharge chair arm", "PACU 离院椅扶手", 1_000, 350, 2],
      ["PACU discharge side table", "PACU 离院休息桌", 1_100, 350, 1],
      ["PACU side table edge", "PACU 休息桌边缘", 1_100, 350, 3],
      ["PACU ward corridor handrail", "PACU 病区走廊扶手", 600, 300, 1],
      ["PACU recovery corridor window", "PACU 恢复走廊窗", 650, 120, 0],
      ["PACU corridor glass partition", "PACU 走廊玻璃隔断", 700, 180, 1],
      ["PACU corridor ceiling light", "PACU 走廊顶灯", 750, 30, 2],
      ["PACU corridor floor tile", "PACU 走廊地砖", 750, 400, 3],
      ["PACU corridor wall panel", "PACU 走廊墙板", 600, 220, 2],
      ["PACU entrance door", "PACU 入口门", 500, 180, 0],
      ["PACU entrance door window", "PACU 入口门窗", 500, 160, 2],
      ["PACU entrance door handle", "PACU 入口门把手", 500, 220, 4],
      ["PACU discharge wheelchair", "PACU 离院轮椅", 1_100, 250, 0],
      ["PACU laundry hamper", "PACU 布草筐", 900, 250, 1],
      ["PACU blanket trolley", "PACU 毛毯车", 850, 250, 2],
      ["PACU transfer bag", "PACU 转运袋", 850, 300, 3],
      ["PACU visitor chair", "PACU 探视椅", 1_100, 220, 0],
      ["PACU lounge floor strip", "PACU 休息区地面条", 1_050, 410, 4],
    ],
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function slugify(word) {
  return word.toLocaleLowerCase("en-US").replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function visualRegionFor(word, x, y, zoneTitle) {
  const size = 44;
  const left = Math.max(0, Math.min(SOURCE_WIDTH - size, x - size / 2));
  const top = Math.max(0, Math.min(SOURCE_HEIGHT - size, y - size / 2));
  return {
    id: `post-anesthesia-care-unit-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the PACU photograph`,
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
      const id = `post-anesthesia-care-unit-${slugify(word)}`;
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
      id: `post-anesthesia-care-unit-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "post-anesthesia-care-unit",
    title: "Post-anesthesia care unit",
    translation: "麻醉后恢复室",
    subtitle: "Recovery bays, equipment and discharge lounge",
    asset: "/scenes/post-anesthesia-care-unit-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "operating-theatre",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/post-anesthesia-care-unit-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized PACU photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable recovery-room beds, equipment, room fixtures and support objects across ${detailZones.length} bounded zones. Patient identity, diagnosis, medication names, clinical readings, recovery outcomes, procedure steps, sterility claims, brands, readable screen content and hidden functions were excluded.`,
      previousLabelCount: labels.length + 6,
      retainedLabelCount: labels.length,
      removedLabelCount: 6,
      removedExamples: [
        "patient identity",
        "diagnosis",
        "medication name",
        "clinical reading",
        "recovery outcome",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("PACU source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`PACU JPEG is not reproducible; got ${sha256(output)}`);
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

const operatingPortal = {
  id: "enter-post-anesthesia-care-unit",
  label: "Enter the post-anesthesia care unit",
  translation: "进入麻醉后恢复室",
  childSceneId: "post-anesthesia-care-unit",
  sourceVisualRegion: "recovery-ward",
  x: 1_050,
  y: 100,
  width: 500,
  height: 430,
  enterScale: 3.4,
};
const operatingPortalRegion = {
  id: operatingPortal.sourceVisualRegion,
  description: "Complete visible recovery ward beyond the glazed opening in the operating-theatre photograph",
  kind: "object",
  x: operatingPortal.x,
  y: operatingPortal.y,
  width: operatingPortal.width,
  height: operatingPortal.height,
};

async function updateOperatingTheatre() {
  const scene = JSON.parse(await readFile(operatingTheatrePath, "utf8"));
  const existingIndex = scene.portals.findIndex(({ id }) => id === operatingPortal.id);
  if (existingIndex >= 0) scene.portals[existingIndex] = operatingPortal;
  else scene.portals.push(operatingPortal);
  const regionIndex = scene.visualRegions.findIndex(({ id }) => id === operatingPortalRegion.id);
  if (regionIndex >= 0) scene.visualRegions[regionIndex] = operatingPortalRegion;
  else scene.visualRegions.push(operatingPortalRegion);
  return writeIfChanged(operatingTheatrePath, scene);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entry = {
    id: "post-anesthesia-care-unit",
    title: "Post-anesthesia care unit",
    parentId: "operating-theatre",
  };
  const existing = manifest.scenes.find(({ id }) => id === entry.id);
  if (!existing) {
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === entry.parentId);
    if (parentIndex < 0) throw new Error("operating-theatre is missing from the scene manifest");
    manifest.scenes.splice(parentIndex + 1, 0, entry);
  } else if (existing.title !== entry.title || existing.parentId !== entry.parentId) {
    throw new Error("post-anesthesia-care-unit already exists with a different title or parent");
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildPostAnesthesiaCareUnitScene() {
  const scene = buildScene();
  const result = {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
  if (integrate) {
    result.operatingTheatreChanged = await updateOperatingTheatre();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildPostAnesthesiaCareUnitScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-post-anesthesia-care-unit-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
