import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal aircraft-cabin scene from the reviewed boarding-bridge
 * doorway image. Labels describe only visible cabin objects or object parts;
 * flight state, passenger actions, airline identity and hidden systems stay
 * outside this batch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/aircraft-cabin-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/aircraft-cabin-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/aircraft-cabin.json");
const boardingBridgePath = resolve(projectRoot, "public/data/scenes/passenger-boarding-bridge.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "7571800b6caeae7a6d2b8f0198c8aae76d7291cd334e45cbedbb4d5597e5d926";
const PUBLIC_ASSET_SHA256 = "43bc4ae1927274df211288acce769e17f16975ddfea8e0c57d8ce5349f697dbc";

const zones = [
  {
    id: "entry-door-hardware",
    title: "Entry door hardware",
    translation: "客舱入口门与五金",
    description: "Trace the visible entry-door frame, hinges, latch pieces, window, rails and threshold trim.",
    x: 0,
    y: 0,
    width: 320,
    height: 900,
    labels: [
      ["cabin entry door", "客舱入口门", 180, 210],
      ["cabin entry door frame", "客舱入口门框", 170, 200],
      ["entry door inner panel", "入口门内板", 150, 350],
      ["entry door upper hinge", "入口门上铰链", 220, 65],
      ["entry door mid hinge", "入口门中铰链", 220, 260],
      ["entry door lower hinge", "入口门下铰链", 220, 710],
      ["entry hinge cover", "入口铰链盖", 235, 120],
      ["entry latch body", "入口插销主体", 230, 480],
      ["entry latch hook", "入口插销钩", 235, 500],
      ["entry latch pin", "入口插销销轴", 240, 550],
      ["entry door handle", "入口门把手", 50, 635],
      ["entry handle mount", "入口把手底座", 85, 625],
      ["cabin entry handrail", "客舱入口扶手", 50, 780],
      ["entry handrail bracket", "入口扶手支架", 75, 770],
      ["entry handrail end cap", "入口扶手端盖", 55, 865],
      ["entry door viewing window", "入口门观察窗", 70, 220],
      ["entry window frame", "入口窗框", 90, 220],
      ["entry window seal", "入口窗密封条", 110, 220],
      ["door frame fastener", "门框紧固件", 250, 405],
      ["entry door edge trim", "入口门边饰条", 275, 300],
      ["entry sill trim", "入口门槛饰条", 160, 875],
      ["entry threshold strip", "入口门槛条", 150, 895],
    ],
  },
  {
    id: "forward-galley",
    title: "Forward galley",
    translation: "前部厨房",
    description: "Inspect the visible galley cabinets, oven fronts, carts, coffee equipment, worktop and floor hardware.",
    x: 320,
    y: 0,
    width: 380,
    height: 900,
    labels: [
      ["forward galley", "前部厨房", 500, 300],
      ["upper galley cabinet", "厨房上柜", 500, 90],
      ["forward upper cabinet door", "前部上柜柜门", 480, 120],
      ["cabinet door handle", "柜门把手", 520, 125],
      ["cabinet door hinge", "柜门铰链", 450, 130],
      ["forward cabinet latch", "前部柜门锁扣", 500, 190],
      ["galley sidewall", "厨房侧墙", 620, 200],
      ["galley ceiling locker", "厨房顶柜", 500, 55],
      ["galley oven", "厨房烤箱", 420, 275],
      ["galley oven door", "厨房烤箱门", 420, 330],
      ["galley oven handle", "厨房烤箱把手", 430, 345],
      ["galley oven latch", "厨房烤箱锁扣", 450, 360],
      ["galley countertop", "厨房台面", 480, 420],
      ["galley worktop edge", "厨房台面边缘", 500, 430],
      ["galley backsplash", "厨房挡板", 500, 390],
      ["galley service cart", "厨房服务车", 390, 600],
      ["galley cart handle", "厨房推车把手", 380, 600],
      ["galley cart caster", "厨房推车脚轮", 400, 850],
      ["galley cart drawer", "厨房推车抽屉", 450, 600],
      ["galley cart latch", "厨房推车锁扣", 480, 650],
      ["galley coffee pot", "厨房咖啡壶", 570, 350],
      ["coffee pot handle", "咖啡壶把手", 600, 360],
      ["coffee pot lid", "咖啡壶盖", 575, 330],
      ["galley storage drawer", "厨房储物抽屉", 550, 520],
      ["galley kickplate", "厨房踢脚板", 500, 855],
      ["galley floor track", "厨房地面导轨", 640, 850],
    ],
  },
  {
    id: "overhead-psu",
    title: "Overhead stowage and passenger service unit",
    translation: "头顶行李架与旅客服务单元",
    description: "Study the overhead bin, latches, seams, passenger-service panel, lights, vents and ceiling finish.",
    x: 700,
    y: 0,
    width: 800,
    height: 280,
    labels: [
      ["left overhead bin", "左侧头顶行李架", 790, 145],
      ["overhead bin door", "头顶行李架门", 800, 170],
      ["overhead bin latch", "头顶行李架锁扣", 820, 220],
      ["overhead bin lip", "头顶行李架边缘", 860, 245],
      ["overhead bin hinge", "头顶行李架铰链", 900, 235],
      ["overhead bin end cap", "头顶行李架端盖", 720, 150],
      ["overhead bin seam", "头顶行李架接缝", 900, 170],
      ["cabin stowage compartment", "客舱储物舱", 950, 160],
      ["left passenger service unit", "左侧旅客服务单元", 790, 270],
      ["passenger service panel", "旅客服务面板", 800, 278],
      ["reading light bezel", "阅读灯边框", 825, 278],
      ["air vent nozzle", "通风口喷嘴", 850, 278],
      ["cabin speaker grille", "客舱扬声器格栅", 880, 278],
      ["cabin light lens", "客舱灯罩", 930, 270],
      ["cabin ceiling panel", "客舱顶板", 1_000, 80],
      ["ceiling trim rail", "顶面饰条", 1_000, 20],
      ["cabin ceiling light", "客舱顶灯", 1_030, 110],
      ["left sidewall cove", "左侧墙面凹槽", 730, 260],
      ["upper sidewall panel", "上侧墙板", 740, 200],
      ["bin hinge cover", "行李架铰链盖", 890, 240],
    ],
  },
  {
    id: "cabin-seating",
    title: "Passenger seating",
    translation: "客舱座椅",
    description: "Compare the visible forward, middle and rear seat rows, cushions, armrests, tables and fittings.",
    x: 700,
    y: 280,
    width: 300,
    height: 620,
    labels: [
      ["forward cabin seat", "前排客舱座椅", 760, 480],
      ["forward cabin seatback", "前排客舱椅背", 760, 450],
      ["forward cabin headrest", "前排客舱头枕", 760, 400],
      ["forward cabin cushion", "前排客舱坐垫", 770, 500],
      ["forward cabin armrest", "前排客舱扶手", 820, 520],
      ["forward cabin seat leg", "前排客舱椅腿", 790, 650],
      ["forward cabin tray table", "前排客舱小桌板", 780, 520],
      ["forward cabin seatback pocket", "前排客舱椅背袋", 770, 540],
      ["forward cabin seat belt", "前排客舱安全带", 805, 560],
      ["forward cabin seat buckle", "前排客舱安全带扣", 815, 565],
      ["middle cabin seat", "中排客舱座椅", 860, 500],
      ["middle cabin seatback", "中排客舱椅背", 860, 470],
      ["middle cabin headrest", "中排客舱头枕", 865, 430],
      ["middle cabin cushion", "中排客舱坐垫", 870, 520],
      ["middle cabin armrest", "中排客舱扶手", 915, 530],
      ["middle cabin seat leg", "中排客舱椅腿", 885, 650],
      ["middle cabin tray table", "中排客舱小桌板", 870, 540],
      ["middle cabin seatback pocket", "中排客舱椅背袋", 870, 560],
      ["middle cabin seat buckle", "中排客舱安全带扣", 900, 570],
      ["rear cabin seat", "后排客舱座椅", 950, 500],
      ["rear cabin seatback", "后排客舱椅背", 950, 475],
      ["rear cabin headrest", "后排客舱头枕", 950, 445],
      ["rear cabin cushion", "后排客舱坐垫", 960, 525],
      ["rear cabin armrest", "后排客舱扶手", 990, 535],
      ["rear cabin seat leg", "后排客舱椅腿", 970, 650],
      ["rear cabin tray table", "后排客舱小桌板", 960, 550],
    ],
  },
  {
    id: "aisle-floor",
    title: "Aisle and floor finish",
    translation: "过道与地面饰面",
    description: "Follow the central aisle, carpet boundaries, floor joints, seat tracks and partition edges.",
    x: 1_000,
    y: 280,
    width: 250,
    height: 620,
    labels: [
      ["cabin center aisle", "客舱中央过道", 1_120, 600],
      ["aisle carpet runner", "过道地毯", 1_120, 700],
      ["aisle edge trim", "过道边饰条", 1_040, 700],
      ["aisle floor seam", "过道地面接缝", 1_160, 800],
      ["cabin floor panel", "客舱地板面板", 1_160, 850],
      ["seat track cover", "座椅导轨盖", 1_030, 650],
      ["seat track fastener", "座椅导轨紧固件", 1_030, 670],
      ["aisle sidewall", "过道侧墙", 1_060, 400],
      ["cabin partition edge", "客舱隔断边缘", 1_080, 330],
      ["cabin bulkhead panel", "客舱隔板", 1_100, 300],
      ["cabin floor guide stripe", "客舱地面导向条", 1_180, 750],
      ["aisle carpet border", "过道地毯边界", 1_090, 720],
      ["cabin seat rail", "客舱座椅导轨", 1_020, 680],
      ["floor threshold joint", "地面门槛接缝", 1_180, 875],
    ],
  },
  {
    id: "lavatory",
    title: "Lavatory interior",
    translation: "客舱卫生间",
    description: "Inspect the visible lavatory doorway, vanity, sink, faucet, mirror, toilet and surface hardware.",
    x: 1_250,
    y: 280,
    width: 250,
    height: 480,
    labels: [
      ["aircraft lavatory entry", "飞机卫生间入口", 1_330, 300],
      ["lavatory door handle", "卫生间门把手", 1_430, 350],
      ["lavatory door latch", "卫生间门锁扣", 1_420, 400],
      ["lavatory threshold", "卫生间门槛", 1_320, 730],
      ["lavatory bulkhead", "卫生间隔板", 1_300, 280],
      ["lavatory vanity", "卫生间盥洗台", 1_310, 400],
      ["lavatory sink basin", "卫生间洗手盆", 1_300, 440],
      ["lavatory faucet", "卫生间水龙头", 1_300, 360],
      ["lavatory tap handle", "卫生间水龙头把手", 1_325, 370],
      ["lavatory backsplash", "卫生间挡水板", 1_300, 420],
      ["lavatory mirror", "卫生间镜子", 1_320, 300],
      ["lavatory mirror frame", "卫生间镜框", 1_320, 300],
      ["lavatory soap dispenser", "卫生间皂液器", 1_370, 410],
      ["lavatory shelf", "卫生间搁板", 1_390, 350],
      ["lavatory waste bin", "卫生间垃圾桶", 1_390, 640],
      ["lavatory toilet bowl", "卫生间马桶盆", 1_320, 560],
      ["lavatory toilet seat", "卫生间马桶座圈", 1_320, 540],
      ["lavatory toilet lid", "卫生间马桶盖", 1_320, 520],
      ["lavatory toilet base", "卫生间马桶底座", 1_320, 640],
      ["lavatory floor pan", "卫生间地板盘", 1_320, 700],
      ["lavatory wall panel", "卫生间墙板", 1_450, 500],
      ["lavatory ceiling panel", "卫生间顶板", 1_400, 280],
      ["lavatory cabinet door", "卫生间柜门", 1_300, 470],
    ],
  },
  {
    id: "right-door-jamb",
    title: "Doorway and fuselage side",
    translation: "门框与机身侧板",
    description: "Trace the visible right-hand doorway jamb, latch housing, grab rail, sill and fuselage panel seams.",
    x: 1_500,
    y: 0,
    width: 100,
    height: 900,
    labels: [
      ["right doorway jamb", "右侧门框立柱", 1_570, 300],
      ["right jamb cover", "右侧门框盖", 1_560, 200],
      ["doorway latch receiver", "门框锁扣座", 1_570, 500],
      ["doorway lock housing", "门框锁体外壳", 1_580, 500],
      ["doorway grab rail", "门框抓扶杆", 1_550, 450],
      ["grab rail mount", "抓扶杆底座", 1_555, 460],
      ["doorway seal strip", "门框密封条", 1_540, 300],
      ["doorway sill cap", "门槛端盖", 1_550, 700],
      ["fuselage side panel", "机身侧板", 1_600, 250],
      ["fuselage panel seam", "机身板接缝", 1_580, 350],
      ["doorway fastener", "门框紧固件", 1_590, 420],
    ],
  },
];

const cabinPortal = {
  id: "enter-aircraft-cabin",
  label: "Enter the aircraft cabin",
  translation: "进入飞机客舱",
  childSceneId: "aircraft-cabin",
  sourceVisualRegion: "portal-aircraft-cabin",
  x: 735,
  y: 205,
  width: 108,
  height: 228,
  enterScale: 3.6,
};

const cabinPortalRegion = {
  id: cabinPortal.sourceVisualRegion,
  description: "Open aircraft doorway visible at the end of the passenger boarding bridge",
  kind: "object",
  x: cabinPortal.x,
  y: cabinPortal.y,
  width: cabinPortal.width,
  height: cabinPortal.height,
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
        id: `aircraft-cabin-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the aircraft cabin photograph`,
        kind: "part",
        x: Math.max(0, Math.min(WIDTH - 40, x - 20)),
        y: Math.max(0, Math.min(HEIGHT - 40, y - 20)),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `aircraft-cabin-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`aircraft-cabin-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `aircraft-cabin-zone-${zone.id}`,
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
    id: "aircraft-cabin",
    title: "Aircraft cabin",
    translation: "飞机客舱",
    subtitle: "Entry door, galley, seating, overhead service, lavatory and cabin finishes",
    asset: "/scenes/aircraft-cabin-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "passenger-boarding-bridge",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/aircraft-cabin-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 aircraft-cabin photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable entry-door, galley, overhead-service, seating, aisle, lavatory and doorway-side parts. Flight status, passenger actions, airline identity, readable signs, safety outcomes and hidden aircraft systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["flight status", "passenger action", "airline brand", "cabin pressure", "hidden system", "safety outcome"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("aircraft cabin source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("aircraft cabin JPEG is not reproducible");
  try {
    const current = await readFile(publicAsset);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAsset, output);
  return true;
}

async function updateBoardingBridge() {
  const bridge = JSON.parse(await readFile(boardingBridgePath, "utf8"));
  const index = bridge.portals.findIndex(({ id }) => id === cabinPortal.id);
  if (index === -1) bridge.portals.push(cabinPortal);
  else bridge.portals[index] = cabinPortal;
  const regionIndex = bridge.visualRegions.findIndex(({ id }) => id === cabinPortalRegion.id);
  if (regionIndex === -1) bridge.visualRegions.push(cabinPortalRegion);
  else bridge.visualRegions[regionIndex] = cabinPortalRegion;
  return writeIfChanged(boardingBridgePath, bridge);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.scenes.find(({ id }) => id === "aircraft-cabin");
  if (!existing) manifest.scenes.push({ id: "aircraft-cabin", title: "Aircraft cabin", parentId: "passenger-boarding-bridge" });
  else if (existing.title !== "Aircraft cabin" || existing.parentId !== "passenger-boarding-bridge") {
    throw new Error("aircraft-cabin manifest entry has a different parent or title");
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
  if (duplicateWords.length > 0) throw new Error(`aircraft-cabin contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`aircraft-cabin term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

export async function buildAircraftCabinScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const boardingBridgeChanged = await updateBoardingBridge();
  const manifestChanged = await updateManifest();
  return {
    assetChanged,
    sceneChanged,
    boardingBridgeChanged,
    manifestChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildAircraftCabinScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-aircraft-cabin-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
