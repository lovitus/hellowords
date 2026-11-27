import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Author the cabin overview from its released photograph. Parts that cannot
 * be identified at this distance stay available in the scene index.
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
    description: "The open doorway shows its curved frame, exposed metal fittings, narrow window and tubular handrail.",
    x: 0, y: 0, width: 464, height: 900,
    labels: [
      ["cabin entry door frame", "客舱入口门框", 342, 320, 16, 42],
      ["entry door viewing window", "入口门观察窗", 79, 265, 12, 64],
      ["cabin entry door", "客舱入口门", 153, 226, 43, 65],
      ["entry door inner panel", "入口门内板", 133, 445, 36, 54],
      ["entry latch body", "入口插销主体", 238, 694, 15, 24],
      ["entry latch pin", "入口插销销轴", 230, 516, 15, 7],
      ["cabin entry handrail", "客舱入口扶手", 51, 629, 22, 8],
      ["entry handrail bracket", "入口扶手支架", 130, 577, 13, 21],
      ["entry window frame", "入口窗框", 112, 158, 5, 15],
      ["entry window seal", "入口窗密封条", 92, 183, 4, 12],
      ["door frame fastener", "门框紧固件", 275, 375, 8, 8],
      ["entry door edge trim", "入口门边饰条", 189, 436, 3, 24],
    ],
  },
  {
    id: "forward-galley",
    title: "Forward galley",
    translation: "前部厨房",
    description: "The galley has wall cabinets above two metal units, three wheeled carts and a coffee pot on the counter.",
    x: 355, y: 0, width: 302, height: 900,
    labels: [
      ["galley coffee pot", "厨房咖啡壶", 582, 385, 19, 29],
      ["galley service cart", "厨房服务车", 455, 699, 59, 68],
      ["upper galley cabinet", "厨房上柜", 482, 88, 39, 39],
      ["galley countertop", "厨房台面", 526, 422, 40, 6],
      ["forward galley", "前部厨房", 485, 325, 37, 46],
      ["forward upper cabinet door", "前部上柜柜门", 554, 155, 34, 36],
      ["cabinet door handle", "柜门把手", 512, 131, 5, 18],
      ["galley sidewall", "厨房侧墙", 623, 280, 20, 49],
      ["galley worktop edge", "厨房台面边缘", 415, 458, 32, 4],
      ["galley backsplash", "厨房挡板", 630, 384, 15, 27],
      ["galley cart handle", "厨房推车把手", 449, 516, 17, 8],
      ["galley cart caster", "厨房推车脚轮", 564, 811, 8, 11],
      ["galley cart drawer", "厨房推车抽屉", 421, 539, 22, 20],
      ["galley cart latch", "厨房推车锁扣", 454, 469, 9, 10],
      ["coffee pot handle", "咖啡壶把手", 603, 385, 4, 11],
      ["galley floor track", "厨房地面导轨", 587, 823, 10, 9],
    ],
  },
  {
    id: "overhead-psu",
    title: "Overhead stowage and passenger service unit",
    translation: "头顶行李架与旅客服务单元",
    description: "Follow the left bank of overhead lockers and their underside panels to the long ceiling lights.",
    x: 705, y: 0, width: 371, height: 348,
    labels: [
      ["left overhead bin", "左侧头顶行李架", 759, 164, 24, 34],
      ["cabin ceiling light", "客舱顶灯", 968, 103, 88, 4],
      ["overhead bin door", "头顶行李架门", 802, 182, 20, 26],
      ["overhead bin latch", "头顶行李架锁扣", 795, 212, 10, 8],
      ["overhead bin lip", "头顶行李架边缘", 768, 220, 17, 5],
      ["overhead bin end cap", "头顶行李架端盖", 731, 146, 20, 46],
      ["overhead bin seam", "头顶行李架接缝", 838, 198, 3, 15],
      ["cabin stowage compartment", "客舱储物舱", 869, 228, 12, 12],
      ["left passenger service unit", "左侧旅客服务单元", 741, 247, 23, 6],
      ["passenger service panel", "旅客服务面板", 802, 263, 18, 5],
      ["cabin ceiling panel", "客舱顶板", 936, 54, 56, 34],
      ["ceiling trim rail", "顶面饰条", 1072, 61, 3, 24],
      ["upper sidewall panel", "上侧墙板", 769, 307, 25, 12],
    ],
  },
  {
    id: "cabin-seating",
    title: "Passenger seating",
    translation: "客舱座椅",
    description: "Rows of blue seats recede beside the aisle. Headrests, seat backs, padded armrests and metal supports can be distinguished at different distances.",
    x: 700, y: 329, width: 374, height: 402,
    labels: [
      ["forward cabin seat", "前排客舱座椅", 1049, 479, 29, 40],
      ["forward cabin headrest", "前排客舱头枕", 726, 418, 33, 33],
      ["forward cabin seatback", "前排客舱椅背", 735, 461, 20, 24],
      ["forward cabin armrest", "前排客舱扶手", 786, 547, 13, 10],
      ["forward cabin cushion", "前排客舱坐垫", 1043, 541, 27, 14],
      ["forward cabin seat leg", "前排客舱椅腿", 769, 684, 6, 19],
      ["middle cabin seat", "中排客舱座椅", 857, 400, 16, 20],
      ["middle cabin seatback", "中排客舱椅背", 849, 428, 18, 17],
      ["middle cabin headrest", "中排客舱头枕", 852, 373, 19, 14],
      ["middle cabin armrest", "中排客舱扶手", 880, 456, 8, 6],
      ["middle cabin seat leg", "中排客舱椅腿", 887, 517, 3, 11],
      ["rear cabin seat", "后排客舱座椅", 975, 352, 4, 6],
      ["rear cabin seatback", "后排客舱椅背", 952, 366, 5, 8],
      ["rear cabin headrest", "后排客舱头枕", 965, 341, 4, 3],
    ],
  },
  {
    id: "aisle-floor",
    title: "Aisle and floor finish",
    translation: "过道与地面饰面",
    description: "The central carpet runs between pale edge stripes. A cream partition and its metal trim separate the aisle from the lavatory.",
    x: 620, y: 280, width: 513, height: 620,
    labels: [
      ["cabin center aisle", "客舱中央过道", 883, 760, 44, 53],
      ["aisle edge trim", "过道边饰条", 982, 754, 5, 22],
      ["aisle carpet runner", "过道地毯", 929, 607, 23, 30],
      ["cabin partition edge", "客舱隔断边缘", 1111, 563, 3, 24],
      ["cabin bulkhead panel", "客舱隔板", 1091, 532, 18, 47],
      ["cabin floor guide stripe", "客舱地面导向条", 716, 838, 4, 7],
      ["aisle carpet border", "过道地毯边界", 780, 717, 4, 7],
    ],
  },
  {
    id: "lavatory",
    title: "Lavatory interior",
    translation: "客舱卫生间",
    description: "The open compartment shows a basin, a dispenser, a closed toilet lid and a metal threshold beneath the doorway.",
    x: 1072, y: 89, width: 262, height: 689,
    labels: [
      ["aircraft lavatory entry", "飞机卫生间入口", 1121, 259, 5, 45],
      ["lavatory toilet lid", "卫生间马桶盖", 1214, 517, 28, 6],
      ["lavatory vanity", "卫生间盥洗台", 1194, 437, 40, 13],
      ["lavatory threshold", "卫生间门槛", 1182, 753, 52, 8],
      ["lavatory bulkhead", "卫生间隔板", 1100, 268, 13, 63],
      ["lavatory sink basin", "卫生间洗手盆", 1193, 416, 29, 4],
      ["lavatory backsplash", "卫生间挡水板", 1180, 384, 28, 24],
      ["lavatory soap dispenser", "卫生间皂液器", 1221, 394, 9, 19],
      ["lavatory toilet seat", "卫生间马桶座圈", 1201, 535, 12, 3],
      ["lavatory toilet base", "卫生间马桶底座", 1226, 597, 14, 25],
      ["lavatory floor pan", "卫生间地板盘", 1172, 689, 31, 24],
      ["lavatory wall panel", "卫生间墙板", 1167, 157, 25, 22],
      ["lavatory cabinet door", "卫生间柜门", 1174, 522, 23, 48],
    ],
  },
  {
    id: "right-door-jamb",
    title: "Doorway and fuselage side",
    translation: "门框与机身侧板",
    description: "At the right edge the metal jamb and rectangular latch housing frame the doorway. A vertical grab rail is fixed beside the curtain.",
    x: 1284, y: 0, width: 316, height: 900,
    labels: [
      ["right doorway jamb", "右侧门框立柱", 1420, 223, 10, 55],
      ["doorway grab rail", "门框抓扶杆", 1300, 414, 6, 29],
      ["doorway latch receiver", "门框锁扣座", 1452, 413, 8, 13],
      ["doorway lock housing", "门框锁体外壳", 1488, 393, 23, 51],
      ["grab rail mount", "抓扶杆底座", 1328, 490, 10, 7],
      ["doorway seal strip", "门框密封条", 1481, 161, 6, 34],
      ["fuselage side panel", "机身侧板", 1570, 293, 17, 32],
      ["doorway fastener", "门框紧固件", 1470, 354, 5, 5],
    ],
  },
];

const indexTerms = [
  ["entry door upper hinge", "入口门上铰链"],
  ["entry door mid hinge", "入口门中铰链"],
  ["entry door lower hinge", "入口门下铰链"],
  ["entry hinge cover", "入口铰链盖"],
  ["entry latch hook", "入口插销钩"],
  ["entry door handle", "入口门把手"],
  ["entry handle mount", "入口把手底座"],
  ["entry handrail end cap", "入口扶手端盖"],
  ["entry sill trim", "入口门槛饰条"],
  ["entry threshold strip", "入口门槛条"],
  ["cabinet door hinge", "柜门铰链"],
  ["forward cabinet latch", "前部柜门锁扣"],
  ["galley ceiling locker", "厨房顶柜"],
  ["galley oven", "厨房烤箱"],
  ["galley oven door", "厨房烤箱门"],
  ["galley oven handle", "厨房烤箱把手"],
  ["galley oven latch", "厨房烤箱锁扣"],
  ["coffee pot lid", "咖啡壶盖"],
  ["galley storage drawer", "厨房储物抽屉"],
  ["galley kickplate", "厨房踢脚板"],
  ["overhead bin hinge", "头顶行李架铰链"],
  ["reading light bezel", "阅读灯边框"],
  ["air vent nozzle", "通风口喷嘴"],
  ["cabin speaker grille", "客舱扬声器格栅"],
  ["cabin light lens", "客舱灯罩"],
  ["left sidewall cove", "左侧墙面凹槽"],
  ["bin hinge cover", "行李架铰链盖"],
  ["forward cabin tray table", "前排客舱小桌板"],
  ["forward cabin seatback pocket", "前排客舱椅背袋"],
  ["forward cabin seat belt", "前排客舱安全带"],
  ["forward cabin seat buckle", "前排客舱安全带扣"],
  ["middle cabin cushion", "中排客舱坐垫"],
  ["middle cabin tray table", "中排客舱小桌板"],
  ["middle cabin seatback pocket", "中排客舱椅背袋"],
  ["middle cabin seat buckle", "中排客舱安全带扣"],
  ["rear cabin cushion", "后排客舱坐垫"],
  ["rear cabin armrest", "后排客舱扶手"],
  ["rear cabin seat leg", "后排客舱椅腿"],
  ["rear cabin tray table", "后排客舱小桌板"],
  ["aisle floor seam", "过道地面接缝"],
  ["cabin floor panel", "客舱地板面板"],
  ["seat track cover", "座椅导轨盖"],
  ["seat track fastener", "座椅导轨紧固件"],
  ["aisle sidewall", "过道侧墙"],
  ["cabin seat rail", "客舱座椅导轨"],
  ["floor threshold joint", "地面门槛接缝"],
  ["lavatory door handle", "卫生间门把手"],
  ["lavatory door latch", "卫生间门锁扣"],
  ["lavatory faucet", "卫生间水龙头"],
  ["lavatory tap handle", "卫生间水龙头把手"],
  ["lavatory mirror", "卫生间镜子"],
  ["lavatory mirror frame", "卫生间镜框"],
  ["lavatory shelf", "卫生间搁板"],
  ["lavatory waste bin", "卫生间垃圾桶"],
  ["lavatory toilet bowl", "卫生间马桶盆"],
  ["lavatory ceiling panel", "卫生间顶板"],
  ["right jamb cover", "右侧门框盖"],
  ["doorway sill cap", "门槛端盖"],
  ["fuselage panel seam", "机身板接缝"],
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

const seatPortal = {
  id: "enter-passenger-seat-row",
  label: "Explore the passenger seat",
  translation: "查看乘客座位",
  childSceneId: "passenger-seat-row",
  sourceVisualRegion: "portal-passenger-seat-row",
  x: 783, y: 444, width: 25, height: 17, enterScale: 3.4,
};

function makeScene(previous) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [localIndex, [word, labelTranslation, x, y, width, height]] of zone.labels.entries()) {
      const idSuffix = slug(word);
      const region = {
        id: `aircraft-cabin-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the aircraft cabin photograph`,
        kind: "part",
        x: x - Math.floor(width / 2),
        y: y - Math.floor(height / 2),
        width,
        height,
      };
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
  const otherPortals = (previous?.portals ?? []).filter(portal => portal.id !== seatPortal.id);
  const portalRegionIds = new Set(otherPortals.map(portal => portal.sourceVisualRegion));
  visualRegions.push(...(previous?.visualRegions ?? []).filter(region => portalRegionIds.has(region.id)));
  const { x, y, width, height } = seatPortal;
  visualRegions.push({ id: seatPortal.sourceVisualRegion, kind: "object",
    description: "Blue back panel on the aisle seat of the left row, below its padded headrest",
    x, y, width, height });
  return {
    id: "aircraft-cabin",
    title: "Aircraft cabin",
    translation: "飞机客舱",
    subtitle: "Entry door, galley, seating, overhead service, lavatory and cabin finishes",
    asset: "/scenes/aircraft-cabin-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "passenger-boarding-bridge",
    portraitOverviewLabelIds: ["aircraft-cabin-cabin-center-aisle"],
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/aircraft-cabin-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The original cabin vocabulary is preserved across visible points and related words. The carpet, blue rows, coffee pot and lavatory fixtures were located on the released image. Hidden hardware and functions that cannot be distinguished in this wide view stay in the index.",
      previousLabelCount: labels.length + indexTerms.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: indexTerms.length + 8,
      removedExamples: ["forward cabin seat buckle", "middle cabin seatback pocket", "cabin pressure"],
    },
    labels,
    relatedWords: indexTerms.map(([word, translation]) => ({ id: `aircraft-cabin-${slug(word)}`, word, translation })),
    portals: [...otherPortals, seatPortal],
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
  const previous = await readFile(scenePath, "utf8").catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  const scene = makeScene(previous && JSON.parse(previous));
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
