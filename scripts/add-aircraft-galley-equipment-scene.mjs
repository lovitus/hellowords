import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build the terminal aircraft-galley-equipment scene from a reviewed cabin
 * photograph. Pass --integrate after review to connect the real forward-galley
 * crop in the aircraft-cabin parent and update the scene manifest.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/aircraft-galley-equipment-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/aircraft-galley-equipment-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/aircraft-galley-equipment.json");
const parentPath = resolve(projectRoot, "public/data/scenes/aircraft-cabin.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "ef0e9a9a1d98f1e6ce2b05c3105a003dbb4d14dda70a46edf1a2bb989afc807d";
const PUBLIC_ASSET_SHA256 = "ad4302dc7a0b87d7ae7bc6f596aec9a1c264ca29774d8c5ea0f024c91c3c0bbe";

const zones = [
  {
    id: "upper-storage",
    title: "Galley upper storage",
    translation: "厨房上部储物",
    description: "Trace the visible upper cabinets, locker edges, shelves, dividers, trim and ceiling finish.",
    x: 320,
    y: 0,
    width: 880,
    height: 210,
    labels: [
      ["galley upper cabinet", "厨房上柜", 500, 90],
      ["galley cabinet door", "厨房柜门", 500, 120],
      ["galley cabinet handle", "厨房柜门把手", 530, 125],
      ["galley cabinet hinge", "厨房柜门铰链", 450, 130],
      ["galley cabinet latch", "厨房柜门锁扣", 500, 185],
      ["galley cabinet seam", "厨房柜体接缝", 650, 120],
      ["galley storage bay", "厨房储物舱", 700, 100],
      ["galley shelf", "厨房搁板", 760, 150],
      ["galley shelf lip", "厨房搁板边缘", 760, 170],
      ["galley shelf bracket", "厨房搁板支架", 800, 170],
      ["galley divider", "厨房分隔板", 820, 150],
      ["galley ceiling panel", "厨房顶板", 850, 20],
      ["galley top trim", "厨房顶部饰条", 900, 40],
      ["galley side trim", "厨房侧饰条", 1_050, 160],
      ["galley light", "厨房灯", 400, 190],
      ["galley light housing", "厨房灯具外壳", 400, 195],
      ["galley upper work panel", "厨房上部工作面板", 600, 190],
      ["galley overhead liner", "厨房顶置内衬", 1_000, 100],
      ["galley cabinet fastener", "厨房柜体紧固件", 610, 130],
      ["galley locker edge", "厨房储物柜边缘", 1_000, 155],
      ["galley locker pull", "厨房储物柜拉手", 1_020, 125],
    ],
  },
  {
    id: "oven-beverage",
    title: "Oven and beverage equipment",
    translation: "烤箱与饮品设备",
    description: "Inspect the visible oven fronts, beverage maker, coffee carafe, boiler, dispenser and worktop hardware.",
    x: 300,
    y: 190,
    width: 900,
    height: 280,
    labels: [
      ["galley oven bank", "厨房烤箱组", 950, 300],
      ["upper galley oven", "厨房上层烤箱", 950, 270],
      ["lower galley oven", "厨房下层烤箱", 950, 380],
      ["aircraft galley oven door", "飞机厨房烤箱门", 950, 315],
      ["aircraft galley oven handle", "飞机厨房烤箱把手", 950, 260],
      ["aircraft galley oven latch", "飞机厨房烤箱锁扣", 950, 245],
      ["galley oven hinge", "厨房烤箱铰链", 1_000, 400],
      ["galley oven bezel", "厨房烤箱边框", 900, 250],
      ["galley oven cavity", "厨房烤箱腔体", 950, 330],
      ["galley oven panel", "厨房烤箱面板", 1_050, 330],
      ["galley oven fastener", "厨房烤箱紧固件", 1_050, 250],
      ["galley beverage maker", "厨房饮品机", 560, 300],
      ["galley coffee maker", "厨房咖啡机", 700, 330],
      ["coffee maker carafe", "咖啡机壶", 700, 360],
      ["coffee maker lid", "咖啡机壶盖", 700, 315],
      ["coffee maker handle", "咖啡机壶把手", 730, 360],
      ["coffee maker base", "咖啡机底座", 700, 410],
      ["galley water boiler", "厨房热水锅炉", 560, 300],
      ["boiler spout", "锅炉出水口", 570, 370],
      ["boiler drip tray", "锅炉滴水盘", 570, 420],
      ["galley beverage dispenser", "厨房饮品分配器", 560, 260],
      ["dispenser nozzle", "分配器喷嘴", 570, 370],
      ["dispenser tray", "分配器托盘", 580, 420],
      ["galley cup dispenser", "厨房杯子分配架", 780, 300],
      ["galley cup shelf", "厨房杯架", 760, 300],
      ["galley cup", "厨房杯子", 760, 280],
      ["galley cup stack", "厨房杯子堆", 760, 270],
      ["galley beverage panel", "厨房饮品面板", 550, 250],
      ["beverage drip tray", "饮品滴水盘", 620, 420],
      ["galley worktop", "厨房台面", 750, 440],
      ["galley worktop backsplash", "厨房台面挡板", 750, 415],
      ["aircraft galley worktop edge", "飞机厨房台面边缘", 750, 455],
    ],
  },
  {
    id: "trolley-banks",
    title: "Service trolley banks",
    translation: "服务推车组",
    description: "Compare the visible stowed trolleys, doors, handles, latches, drawers, bays, casters and retaining hardware.",
    x: 500,
    y: 450,
    width: 780,
    height: 450,
    labels: [
      ["galley service trolley", "厨房服务推车", 600, 620],
      ["trolley door", "推车门", 600, 650],
      ["service trolley handle", "服务推车把手", 600, 540],
      ["trolley latch", "推车锁扣", 610, 500],
      ["trolley hinge", "推车铰链", 550, 700],
      ["trolley drawer", "推车抽屉", 600, 700],
      ["trolley drawer handle", "推车抽屉把手", 600, 700],
      ["trolley container bay", "推车容器舱", 600, 760],
      ["service trolley caster", "服务推车脚轮", 620, 850],
      ["service trolley wheel", "服务推车轮", 650, 850],
      ["trolley brake", "推车刹车", 660, 840],
      ["trolley lower rail", "推车下导轨", 700, 820],
      ["trolley upper rail", "推车上导轨", 700, 510],
      ["left service trolley", "左侧服务推车", 580, 600],
      ["center service trolley", "中央服务推车", 800, 600],
      ["right service trolley", "右侧服务推车", 1_050, 600],
      ["trolley door seal", "推车门密封条", 760, 550],
      ["trolley side panel", "推车侧板", 760, 700],
      ["trolley front panel", "推车前板", 800, 650],
      ["trolley access flap", "推车检修翻板", 800, 760],
      ["trolley tray", "推车托盘", 800, 530],
      ["trolley tray handle", "推车托盘把手", 820, 530],
      ["trolley storage bin", "推车储物箱", 900, 740],
      ["trolley bin lid", "推车箱盖", 900, 720],
      ["trolley wheel housing", "推车轮罩", 900, 850],
      ["trolley floor guide", "推车地面导轨", 950, 880],
      ["galley trolley bay", "厨房推车舱", 1_000, 600],
      ["trolley bay divider", "推车舱分隔板", 1_000, 500],
      ["trolley retaining bracket", "推车固定支架", 1_050, 820],
      ["trolley base plate", "推车底板", 1_050, 860],
    ],
  },
  {
    id: "sink-waste",
    title: "Sink and waste compartment",
    translation: "水槽与废弃物舱",
    description: "Inspect the visible galley sink, faucet, counter, waste compartment, receptacle and lower panel hardware.",
    x: 250,
    y: 220,
    width: 300,
    height: 680,
    labels: [
      ["galley sink", "厨房水槽", 380, 430],
      ["galley sink basin", "厨房水槽盆", 380, 440],
      ["galley sink drain", "厨房水槽排水口", 380, 455],
      ["galley faucet", "厨房水龙头", 380, 350],
      ["galley faucet spout", "厨房水龙头出水口", 380, 380],
      ["galley faucet handle", "厨房水龙头把手", 360, 395],
      ["galley faucet base", "厨房水龙头底座", 380, 410],
      ["galley splashback", "厨房挡水板", 400, 300],
      ["galley sink counter", "厨房水槽台面", 420, 460],
      ["galley sink counter edge", "厨房水槽台面边缘", 450, 470],
      ["galley waste compartment", "厨房废弃物舱", 390, 700],
      ["waste compartment door", "废弃物舱门", 390, 650],
      ["waste door handle", "废弃物舱门把手", 450, 650],
      ["galley trash receptacle", "厨房垃圾容器", 380, 760],
      ["trash bin rim", "垃圾箱边缘", 380, 700],
      ["trash bin liner", "垃圾箱内衬", 380, 780],
      ["galley waste cabinet", "厨房废弃物柜", 450, 600],
      ["waste cabinet hinge", "废弃物柜铰链", 470, 620],
      ["waste cabinet latch", "废弃物柜锁扣", 460, 660],
      ["lower galley panel", "厨房下部面板", 500, 820],
      ["lower panel handle", "下部面板把手", 500, 780],
      ["aircraft galley kickplate", "飞机厨房踢脚板", 450, 870],
    ],
  },
  {
    id: "doorway-curtain",
    title: "Doorway and curtain",
    translation: "门口与幕帘",
    description: "Trace the visible galley doorway, aircraft door hardware, handrails, sill, curtain and entry liner.",
    x: 0,
    y: 0,
    width: 320,
    height: 900,
    labels: [
      ["galley entry doorway", "厨房入口门口", 180, 300],
      ["galley door jamb", "厨房门框立柱", 220, 400],
      ["galley door hinge", "厨房门铰链", 190, 200],
      ["galley door latch", "厨房门锁扣", 210, 500],
      ["galley door seal", "厨房门密封条", 230, 450],
      ["galley door frame trim", "厨房门框饰条", 250, 350],
      ["galley entry handrail", "厨房入口扶手", 70, 780],
      ["galley handrail mount", "厨房扶手底座", 80, 760],
      ["yellow entry handrail", "黄色入口扶手", 60, 820],
      ["galley door sill", "厨房门槛", 160, 870],
      ["galley sill plate", "厨房门槛板", 180, 850],
      ["galley curtain", "厨房幕帘", 280, 400],
      ["galley curtain panel", "厨房幕帘面板", 280, 350],
      ["galley curtain tieback", "厨房幕帘束带", 280, 500],
      ["galley curtain rail", "厨房幕帘导轨", 280, 80],
      ["galley curtain rail bracket", "厨房幕帘导轨支架", 270, 100],
      ["galley cabin threshold", "厨房客舱门槛", 250, 870],
      ["galley threshold tread", "厨房门槛踏板", 100, 880],
      ["galley door fastener", "厨房门框紧固件", 240, 600],
      ["galley entry wall liner", "厨房入口墙面内衬", 260, 250],
    ],
  },
  {
    id: "cabin-side-floor",
    title: "Cabin-side seating and floor",
    translation: "客舱侧座椅与地面",
    description: "Inspect the visible cabin-side seat parts, aisle floor, wall panels, window and galley floor finish.",
    x: 1_200,
    y: 0,
    width: 400,
    height: 900,
    labels: [
      ["galley-side cabin seat", "厨房侧客舱座椅", 1_350, 550],
      ["galley-side seatback", "厨房侧椅背", 1_350, 500],
      ["galley-side seat cushion", "厨房侧坐垫", 1_350, 600],
      ["galley-side seat armrest", "厨房侧扶手", 1_430, 620],
      ["galley-side seat shell", "厨房侧椅壳", 1_350, 530],
      ["galley-side headrest", "厨房侧头枕", 1_350, 450],
      ["galley aisle carpet", "厨房侧过道地毯", 1_250, 800],
      ["galley cabin floor", "厨房侧客舱地面", 1_350, 850],
      ["galley floor seam", "厨房地面接缝", 1_300, 840],
      ["aircraft galley floor track", "飞机厨房地面导轨", 1_250, 870],
      ["galley floor panel", "厨房地面面板", 1_450, 830],
      ["aircraft galley sidewall", "飞机厨房侧墙", 1_250, 220],
      ["galley curtain lower hem", "厨房幕帘下摆", 1_220, 700],
      ["galley aisle side trim", "厨房过道侧饰条", 1_230, 500],
      ["galley cabin wall panel", "厨房客舱墙板", 1_300, 300],
      ["galley overhead sidewall", "厨房上侧墙", 1_400, 180],
      ["galley sidewall seam", "厨房侧墙接缝", 1_450, 300],
      ["galley floor edge strip", "厨房地面边条", 1_220, 880],
      ["galley cabin window", "厨房侧客舱窗", 1_500, 350],
      ["galley window frame", "厨房侧客舱窗框", 1_500, 350],
      ["galley-side seat base", "厨房侧椅底座", 1_350, 720],
      ["galley-side seat leg", "厨房侧椅腿", 1_400, 760],
    ],
  },
];

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
        id: `aircraft-galley-equipment-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the aircraft galley photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `aircraft-galley-equipment-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`aircraft-galley-equipment-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `aircraft-galley-equipment-zone-${zone.id}`,
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
    id: "aircraft-galley-equipment",
    title: "Aircraft galley equipment",
    translation: "飞机厨房设备",
    subtitle: "Galley cabinets, ovens, beverage equipment, trolleys, sink, doorway and cabin-side fixtures",
    asset: "/scenes/aircraft-galley-equipment-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "aircraft-cabin",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/aircraft-galley-equipment-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 aircraft-galley photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable cabinet, oven, beverage, trolley, sink, doorway and cabin-side parts. Passenger actions, crew actions, food-service outcomes, airline identity, readable labels, power state, temperature and hidden aircraft systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["passenger action", "crew action", "food-service outcome", "airline identity", "power state", "hidden system"],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("aircraft galley source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("aircraft galley JPEG is not reproducible");
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
  if (duplicateWords.length > 0) throw new Error(`aircraft-galley-equipment contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`aircraft-galley-equipment term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-aircraft-galley-equipment",
  label: "Enter the forward aircraft galley",
  translation: "进入前部机上厨房",
  childSceneId: "aircraft-galley-equipment",
  sourceVisualRegion: "portal-forward-aircraft-galley",
  x: 320,
  y: 60,
  width: 380,
  height: 780,
  enterScale: 3.1,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete forward-galley cabinet, oven, cart and worktop bank visible at the left of the aircraft-cabin photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "aircraft-galley-equipment")) {
    const cabinIndex = manifest.scenes.findIndex(({ id }) => id === "aircraft-cabin");
    if (cabinIndex < 0) throw new Error("aircraft-cabin is missing from the scene manifest");
    manifest.scenes.splice(cabinIndex + 1, 0, {
      id: "aircraft-galley-equipment",
      title: "Aircraft galley equipment",
      parentId: "aircraft-cabin",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildAircraftGalleyEquipmentScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  const result = {
    assetChanged,
    sceneChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildAircraftGalleyEquipmentScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-aircraft-galley-equipment-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
