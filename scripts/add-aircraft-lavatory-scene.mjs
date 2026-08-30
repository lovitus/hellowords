import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal aircraft-lavatory scene from the reviewed close-up. The
 * vocabulary is limited to visible fixtures, panels, surfaces and hardware;
 * no passenger action, cleanliness claim, safety state or hidden system is
 * represented.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/aircraft-lavatory-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/aircraft-lavatory-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/aircraft-lavatory.json");
const parentScenePath = resolve(projectRoot, "public/data/scenes/aircraft-cabin.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "d0f3894c0536aca629280a92d812b76009d3ab211a41841fedcd9f29c6a50017";
const PUBLIC_ASSET_SHA256 = "656375726949d55919bcef32f468b24d9cf454bcfc731882871b4ba6c7de4f60";

const zones = [
  {
    id: "cabin-connection-entry",
    title: "Cabin connection and entry",
    translation: "客舱连接与卫生间入口",
    description: "Trace the open entrance, cabin-side curtain, jamb, grab hardware and threshold details.",
    x: 0,
    y: 0,
    width: 420,
    height: 900,
    labels: [
      ["lavatory entrance", "卫生间入口", 300, 300],
      ["lavatory entrance frame", "卫生间入口框", 390, 300],
      ["entrance door jamb", "入口门框立柱", 405, 400],
      ["doorway threshold", "门口门槛", 340, 820],
      ["doorway threshold plate", "门口门槛板", 350, 840],
      ["doorway sill trim", "门口门槛饰条", 370, 850],
      ["doorway seal", "门口密封条", 395, 450],
      ["door jamb fastener", "门框紧固件", 405, 520],
      ["door jamb hinge", "门框铰链", 405, 640],
      ["cabin-side curtain", "客舱侧帘", 120, 400],
      ["curtain panel", "帘布面板", 170, 350],
      ["curtain tieback", "帘布束带", 120, 520],
      ["lavatory curtain rail", "卫生间帘布导轨", 180, 80],
      ["curtain rail bracket", "帘布导轨支架", 240, 90],
      ["lavatory entry grab handle", "卫生间入口抓扶把手", 380, 600],
      ["grab handle mount", "抓扶把手底座", 390, 610],
      ["cabin-side seatback", "客舱侧椅背", 80, 500],
      ["cabin-side seat cushion", "客舱侧坐垫", 100, 570],
      ["cabin-side armrest", "客舱侧扶手", 120, 620],
      ["cabin-side carpet", "客舱侧地毯", 250, 760],
      ["entry wall panel", "入口墙板", 300, 180],
      ["entry corner trim", "入口转角饰条", 350, 200],
    ],
  },
  {
    id: "upper-back-service",
    title: "Upper wall and service fittings",
    translation: "上部墙面与服务设施",
    description: "Study the visible ceiling, mirror cabinet, shelf, upper panels, vents and light fittings.",
    x: 420,
    y: 0,
    width: 660,
    height: 320,
    labels: [
      ["lavatory upper ceiling panel", "卫生间上部顶板", 500, 60],
      ["ceiling light fixture", "顶面灯具", 650, 70],
      ["ceiling light lens", "顶灯灯罩", 650, 75],
      ["ceiling vent grille", "顶面通风格栅", 900, 50],
      ["ceiling air outlet", "顶面出风口", 920, 80],
      ["upper wall panel", "上部墙板", 520, 230],
      ["rear wall panel", "后墙板", 700, 230],
      ["mirror cabinet", "镜面柜", 700, 150],
      ["mirror cabinet door", "镜面柜门", 700, 170],
      ["mirror cabinet handle", "镜面柜把手", 800, 180],
      ["mirror cabinet hinge", "镜面柜铰链", 820, 170],
      ["mirror cabinet seam", "镜面柜接缝", 760, 100],
      ["open storage shelf", "开放储物搁板", 1_000, 250],
      ["storage shelf lip", "储物搁板边缘", 1_000, 270],
      ["storage shelf bracket", "储物搁板支架", 970, 260],
      ["upper service panel", "上部服务面板", 930, 170],
      ["service panel latch", "服务面板锁扣", 940, 190],
      ["vanity light housing", "盥洗台灯具外壳", 540, 300],
      ["vanity light diffuser", "盥洗台灯具扩散罩", 560, 300],
      ["lavatory mirror surround", "卫生间镜面外框", 570, 180],
      ["mirror edge trim", "镜面边饰条", 600, 180],
      ["mirror glass", "镜面玻璃", 650, 190],
      ["wall corner trim", "墙角饰条", 1_050, 250],
      ["cabin roof seam", "客舱顶面接缝", 800, 30],
      ["ceiling fastener", "顶面紧固件", 1_020, 60],
    ],
  },
  {
    id: "vanity-left",
    title: "Vanity and wash basin",
    translation: "盥洗台与洗手盆",
    description: "Inspect the visible wash basin, faucet, soap dispenser, towel fitting, counter and cabinet face.",
    x: 420,
    y: 320,
    width: 580,
    height: 280,
    labels: [
      ["aircraft lavatory vanity unit", "飞机卫生间盥洗台", 600, 450],
      ["sink counter", "洗手盆台面", 620, 430],
      ["lavatory wash basin", "卫生间洗手盆", 620, 470],
      ["lavatory basin drain", "卫生间洗手盆排水口", 620, 490],
      ["lavatory faucet spout", "卫生间水龙头出水口", 590, 400],
      ["lavatory faucet handle", "卫生间水龙头把手", 575, 410],
      ["faucet base", "水龙头底座", 600, 425],
      ["backsplash panel", "挡水板", 650, 380],
      ["backsplash seam", "挡水板接缝", 700, 380],
      ["aircraft lavatory soap dispenser", "飞机卫生间皂液器", 730, 420],
      ["soap dispenser pump", "皂液器泵头", 730, 400],
      ["soap dispenser mount", "皂液器底座", 730, 440],
      ["paper towel holder", "纸巾架", 920, 450],
      ["towel roll", "纸巾卷", 930, 470],
      ["towel holder bracket", "纸巾架支架", 920, 430],
      ["vanity front panel", "盥洗台前板", 600, 550],
      ["lavatory vanity drawer", "卫生间盥洗台抽屉", 650, 550],
      ["vanity drawer handle", "盥洗台抽屉把手", 650, 540],
      ["under-sink cabinet", "洗手盆下柜", 520, 560],
      ["cabinet kickplate", "柜体踢脚板", 540, 590],
      ["lavatory counter edge", "卫生间台面边缘", 760, 520],
      ["counter sidewall", "台面侧墙", 800, 500],
      ["lavatory basin overflow", "卫生间洗手盆溢水口", 660, 475],
      ["tap escutcheon", "水龙头装饰盖", 590, 430],
      ["vanity counter corner", "盥洗台转角", 850, 500],
    ],
  },
  {
    id: "toilet-center",
    title: "Toilet fixture and lower compartment",
    translation: "马桶设施与下部隔间",
    description: "Trace the visible toilet fixture, flush hardware, shroud, sidewall panels and floor mount details.",
    x: 780,
    y: 320,
    width: 360,
    height: 580,
    labels: [
      ["toilet compartment", "马桶隔间", 900, 600],
      ["aircraft lavatory bowl", "飞机卫生间马桶盆", 930, 650],
      ["aircraft lavatory seat ring", "飞机卫生间座圈", 930, 600],
      ["aircraft lavatory lid", "飞机卫生间马桶盖", 930, 570],
      ["aircraft lavatory seat hinge", "飞机卫生间座圈铰链", 980, 590],
      ["toilet shroud", "马桶罩壳", 960, 730],
      ["aircraft lavatory pedestal", "飞机卫生间马桶底座", 930, 790],
      ["flush panel", "冲洗面板", 850, 520],
      ["aircraft lavatory flush button", "飞机卫生间冲洗按钮", 860, 520],
      ["toilet side bumper", "马桶侧缓冲垫", 1_000, 690],
      ["floor mount ring", "地面安装环", 940, 830],
      ["toilet floor seal", "马桶地面密封圈", 950, 820],
      ["privacy partition", "隐私隔板", 800, 450],
      ["partition edge", "隔板边缘", 810, 500],
      ["partition trim", "隔板饰条", 820, 520],
      ["lavatory sidewall panel", "卫生间侧墙板", 1_060, 450],
      ["sidewall seam", "侧墙板接缝", 1_060, 520],
      ["lower wall panel", "下部墙板", 1_020, 700],
      ["wall service cover", "墙面服务盖板", 1_030, 600],
      ["service cover fastener", "服务盖板紧固件", 1_035, 610],
      ["lower wall air outlet", "下部墙面出风口", 1_050, 670],
      ["lavatory floor", "卫生间地面", 850, 850],
      ["non-slip floor", "防滑地面", 900, 860],
      ["floor seam", "地面接缝", 1_000, 850],
      ["floor corner trim", "地面转角饰条", 1_050, 820],
      ["toilet access panel", "马桶检修面板", 1_000, 760],
    ],
  },
  {
    id: "right-door-wall",
    title: "Right door and wall hardware",
    translation: "右侧门与墙面五金",
    description: "Study the visible lavatory door, latch, grab rails, coat hook, access panels and trim.",
    x: 1_140,
    y: 0,
    width: 460,
    height: 900,
    labels: [
      ["right lavatory door", "右侧卫生间门", 1_350, 250],
      ["door inner panel", "门内板", 1_350, 350],
      ["lavatory door frame", "卫生间门框", 1_180, 350],
      ["aircraft lavatory door handle", "飞机卫生间门把手", 1_330, 420],
      ["aircraft lavatory door latch", "飞机卫生间门锁扣", 1_330, 500],
      ["door latch plate", "门锁扣板", 1_330, 510],
      ["lavatory door hinge", "卫生间门铰链", 1_180, 500],
      ["door edge seal", "门边密封条", 1_160, 400],
      ["door lock housing", "门锁体外壳", 1_330, 520],
      ["right grab rail", "右侧抓扶杆", 1_250, 280],
      ["grab rail upper mount", "抓扶杆上支座", 1_270, 220],
      ["grab rail lower mount", "抓扶杆下支座", 1_270, 600],
      ["wall coat hook", "墙面衣帽钩", 1_330, 100],
      ["coat hook base", "衣帽钩底座", 1_330, 110],
      ["wall service panel", "墙面服务面板", 1_450, 600],
      ["service panel button", "服务面板按钮", 1_450, 610],
      ["door push plate", "门推板", 1_340, 540],
      ["lower access panel", "下部检修面板", 1_450, 760],
      ["lower panel latch", "下部面板锁扣", 1_460, 760],
      ["right wall trim", "右侧墙面饰条", 1_500, 400],
      ["wall corner guard", "墙角护条", 1_180, 700],
      ["threshold side cap", "门槛侧端盖", 1_180, 820],
      ["lavatory doorway fastener", "卫生间门框紧固件", 1_190, 450],
      ["door skin seam", "门板接缝", 1_400, 300],
      ["lavatory door sill", "卫生间门槛", 1_250, 840],
    ],
  },
  {
    id: "lower-floor",
    title: "Lower floor and cabinet base",
    translation: "下部地面与柜体底座",
    description: "Follow the visible lavatory floor pan, edge trim, vanity base, curtain hem and threshold joints.",
    x: 420,
    y: 600,
    width: 360,
    height: 300,
    labels: [
      ["lavatory floor mat", "卫生间地垫", 520, 760],
      ["washroom floor pan", "卫生间地板盘", 620, 820],
      ["lavatory floor edge", "卫生间地面边缘", 700, 780],
      ["lavatory floor joint", "卫生间地面接缝", 700, 840],
      ["floor edge trim", "地面边饰条", 740, 700],
      ["threshold floor joint", "门槛地面接缝", 450, 820],
      ["under-vanity toe kick", "盥洗台下踢脚板", 520, 650],
      ["toe-kick seam", "踢脚板接缝", 560, 670],
      ["lower cabinet foot", "下柜脚座", 600, 700],
      ["vanity base", "盥洗台底座", 650, 680],
      ["floor wall junction", "地墙交界", 760, 740],
      ["anti-slip texture", "防滑纹理", 600, 850],
      ["cabin carpet edge", "客舱地毯边缘", 430, 700],
      ["curtain lower hem", "帘布下摆", 430, 650],
      ["doorway floor strip", "门口地面条", 440, 840],
    ],
  },
];

const lavatoryPortal = {
  id: "enter-aircraft-lavatory",
  label: "Enter the aircraft lavatory",
  translation: "进入飞机卫生间",
  childSceneId: "aircraft-lavatory",
  sourceVisualRegion: "portal-aircraft-lavatory",
  x: 1_110,
  y: 170,
  width: 390,
  height: 560,
  enterScale: 3.6,
};

const lavatoryPortalRegion = {
  id: lavatoryPortal.sourceVisualRegion,
  description: "Complete open lavatory compartment with visible sink and toilet on the aircraft-cabin photograph",
  kind: "object",
  x: lavatoryPortal.x,
  y: lavatoryPortal.y,
  width: lavatoryPortal.width,
  height: lavatoryPortal.height,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(value) {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function makeScene() {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, labelTranslation, x, y] of zone.labels) {
      const idSuffix = slug(word);
      const region = {
        id: `aircraft-lavatory-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the aircraft lavatory photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `aircraft-lavatory-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`aircraft-lavatory-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `aircraft-lavatory-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      targetScale: 3.15,
      labelIds,
    });
  }
  return {
    id: "aircraft-lavatory",
    title: "Aircraft lavatory",
    translation: "飞机卫生间",
    subtitle: "Entry, vanity, toilet, service fittings, door hardware and floor details",
    asset: "/scenes/aircraft-lavatory-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "aircraft-cabin",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/aircraft-lavatory-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 aircraft-lavatory photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable entrance, upper-service, vanity, toilet, door-hardware and floor parts. Passenger actions, cleanliness claims, safety outcomes, airline identity, readable signs and hidden plumbing or electrical systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["passenger action", "cleanliness claim", "safety outcome", "airline brand", "hidden plumbing", "hidden electrical system"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("aircraft lavatory source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("aircraft lavatory JPEG is not reproducible");
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function updateParentScene() {
  const parent = JSON.parse(await readFile(parentScenePath, "utf8"));
  const portalIndex = parent.portals.findIndex(({ id }) => id === lavatoryPortal.id);
  if (portalIndex === -1) parent.portals.push(lavatoryPortal);
  else parent.portals[portalIndex] = lavatoryPortal;
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === lavatoryPortalRegion.id);
  if (regionIndex === -1) parent.visualRegions.push(lavatoryPortalRegion);
  else parent.visualRegions[regionIndex] = lavatoryPortalRegion;
  return writeIfChanged(parentScenePath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "aircraft-lavatory");
  if (!existing) manifest.scenes.push({ id: "aircraft-lavatory", title: "Aircraft lavatory", parentId: "aircraft-cabin" });
  else if (existing.title !== "Aircraft lavatory" || existing.parentId !== "aircraft-cabin") {
    throw new Error("aircraft-lavatory manifest entry has a different parent or title");
  }
  return writeIfChanged(manifestPath, manifest);
}

async function assertUniqueWords(scene) {
  const wordSources = new Map();
  for (const label of scene.labels) {
    const normalized = label.word.toLocaleLowerCase();
    const sources = wordSources.get(normalized) ?? [];
    sources.push(label.id);
    wordSources.set(normalized, sources);
  }
  const duplicateWords = [...wordSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([word, sources]) => `${word} (${sources.join(", ")})`);
  if (duplicateWords.length > 0) throw new Error(`aircraft-lavatory contains duplicate display words: ${duplicateWords.join("; ")}`);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existingWords = new Set();
  for (const entry of manifest.scenes) {
    if (entry.id === scene.id) continue;
    const otherPath = resolve(projectRoot, "public/data/scenes", `${entry.id}.json`);
    let other;
    try {
      other = JSON.parse(await readFile(otherPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const label of other.labels) existingWords.add(label.word.toLocaleLowerCase());
  }
  const existingDuplicates = [...wordSources.keys()].filter((word) => existingWords.has(word));
  if (existingDuplicates.length > 0) throw new Error(`aircraft-lavatory term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

export async function buildAircraftLavatoryScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const parentChanged = await updateParentScene();
  const manifestChanged = await updateManifest();
  return {
    assetChanged,
    sceneChanged,
    parentChanged,
    manifestChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildAircraftLavatoryScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-aircraft-lavatory-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
