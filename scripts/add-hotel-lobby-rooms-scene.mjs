import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Build two connected, pixel-audited hotel scenes from generated source
 * photographs. The exterior portal occupies the unused upper-floor portion
 * of the existing mixed-use brick facade; the cafe keeps its own lower-level
 * storefront portal.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAssets = {
  exterior: resolve(projectRoot, "scripts/assets/hotel-exterior-v1.png"),
  rooms: resolve(projectRoot, "scripts/assets/hotel-lobby-rooms-v1.png"),
};
const publicAssets = {
  exterior: resolve(projectRoot, "public/scenes/hotel-exterior-premium-v1.jpg"),
  rooms: resolve(projectRoot, "public/scenes/hotel-lobby-rooms-premium-v1.jpg"),
};
const scenePaths = {
  exterior: resolve(projectRoot, "public/data/scenes/hotel-exterior.json"),
  rooms: resolve(projectRoot, "public/data/scenes/hotel-lobby-rooms.json"),
};
const cityStreetPath = resolve(projectRoot, "public/data/scenes/city-street.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = {
  exterior: "8cf87bfd956dca0ac1fc63dac3fa46bcaeaf277adc4a0d5a7e22f5cf9812170b",
  rooms: "36c413044f2b8f8ecf9899daa954549b02e43e2beeb58575f8ceeb4331449052",
};
const PUBLIC_ASSET_SHA256 = {
  exterior: "5d8658256347fe839abbca9c2d81f71a4dab5262b96c2c74a8b5547103707464",
  rooms: "7e3052ac5f4d31577fada2dd3d4bdeb863e467c8d3d8ae65243a2cd311225b49",
};

const hotelExteriorZones = [
  {
    id: "upper-facade",
    title: "Upper hotel facade",
    translation: "酒店上层立面",
    description: "Inspect windows, balcony rails, stone trim and the blank sign structure.",
    x: 350,
    y: 0,
    width: 900,
    height: 180,
    labels: [
      ["hotel facade", "酒店立面", 1_000, 100],
      ["stone facade", "石材立面", 1_180, 130],
      ["blank sign panel", "空白招牌面板", 550, 95],
      ["sign frame", "招牌框", 550, 95],
      ["upper window bay", "上层窗格", 900, 120],
      ["balcony railing", "阳台栏杆", 1_020, 160],
      ["balcony door", "阳台门", 900, 145],
      ["facade cornice", "立面檐口", 1_100, 65],
      ["pilaster capital", "壁柱柱头", 720, 80],
      ["rain gutter", "雨水槽", 1_180, 20],
      ["facade ledge", "立面挑台", 1_150, 175],
      ["window transom", "窗上横梁", 900, 175],
    ],
  },
  {
    id: "entrance-canopy",
    title: "Hotel entrance canopy",
    translation: "酒店入口雨棚",
    description: "Follow the canopy, glass vestibule, revolving door and visible lobby entrance.",
    x: 350,
    y: 180,
    width: 900,
    height: 420,
    labels: [
      ["canopy soffit", "雨棚底面", 700, 295],
      ["canopy edge", "雨棚边缘", 800, 265],
      ["revolving door", "旋转门", 930, 430],
      ["glass vestibule", "玻璃门厅", 850, 380],
      ["hotel entrance door", "酒店入口门", 780, 420],
      ["door pull", "门拉手", 815, 430],
      ["lobby chandelier", "大堂吊灯", 900, 315],
      ["lobby wall panel", "大堂墙面板", 860, 350],
      ["canopy downlight", "雨棚筒灯", 700, 305],
      ["hotel entry threshold", "酒店入口门槛", 920, 540],
      ["glass door rail", "玻璃门轨", 930, 450],
      ["revolving door frame", "旋转门框", 950, 430],
      ["vestibule mullion", "门厅竖框", 840, 380],
      ["lobby floor tile", "大堂地砖", 700, 500],
      ["chandelier chain", "吊灯链", 900, 280],
      ["front desk plinth", "前台底座", 730, 410],
      ["hotel key reader", "酒店钥匙读卡器", 780, 420],
      ["bell desk", "行李服务台", 760, 410],
      ["concierge desk", "礼宾台", 780, 410],
      ["guest entrance", "客用入口", 900, 430],
      ["door mat", "门垫", 920, 560],
    ],
  },
  {
    id: "east-facade",
    title: "East hotel facade",
    translation: "酒店东侧立面",
    description: "Study the stone panels, upper windows, balcony posts and plaque mount.",
    x: 1_250,
    y: 0,
    width: 350,
    height: 600,
    labels: [
      ["stone panel", "石材面板", 1_300, 250],
      ["stone seam", "石材接缝", 1_300, 300],
      ["entry column", "入口立柱", 1_270, 340],
      ["window bay", "窗格", 1_500, 150],
      ["window trim", "窗框饰条", 1_500, 115],
      ["balcony post", "阳台立柱", 1_320, 160],
      ["railing post", "栏杆立柱", 1_325, 160],
      ["balcony post cap", "阳台柱帽", 1_325, 145],
      ["stone trim", "石材饰条", 1_280, 115],
      ["stone coping", "压顶石", 1_300, 220],
      ["plaque frame", "牌匾框", 1_290, 430],
      ["plaque mount", "牌匾底座", 1_290, 440],
    ],
  },
  {
    id: "arrival-drive",
    title: "Hotel arrival drive",
    translation: "酒店落客车道",
    description: "Trace the drop-off lane, paving joints, bollards and curb details.",
    x: 350,
    y: 600,
    width: 900,
    height: 300,
    labels: [
      ["drop-off lane", "落客车道", 700, 700],
      ["loading curb", "装卸路缘", 600, 650],
      ["wheel stop", "车轮挡块", 450, 650],
      ["driveway paving", "车道铺装", 700, 750],
      ["curb ramp edge", "路缘坡道边", 450, 840],
      ["pavement joint", "铺面接缝", 600, 780],
      ["crosswalk stripe", "斑马线条", 380, 850],
      ["taxi curb", "出租车路缘", 600, 760],
      ["entry bollard", "入口防撞柱", 500, 620],
      ["driveway drain", "车道排水口", 400, 870],
      ["canopy shadow edge", "雨棚阴影边", 700, 620],
      ["driveway paver", "车道铺砖", 760, 820],
      ["curb stone joint", "路缘石接缝", 620, 820],
      ["arrival paving", "落客区铺面", 850, 720],
      ["drop-off stone", "落客区石材", 950, 680],
    ],
  },
  {
    id: "street-west",
    title: "West sidewalk arrival",
    translation: "西侧人行道入口",
    description: "Inspect the street lamp, planted tree pit and crossing-side curb.",
    x: 0,
    y: 0,
    width: 350,
    height: 900,
    labels: [
      ["street lamp", "街灯", 50, 480],
      ["pedestrian crossing edge", "人行横道边", 20, 830],
      ["tree pit", "树池", 120, 650],
      ["sidewalk curb", "人行道路缘", 300, 740],
      ["drop-off curb", "落客路缘", 340, 700],
    ],
  },
  {
    id: "landscape-east",
    title: "East planted frontage",
    translation: "东侧花箱前沿",
    description: "Follow the planted wall, shrub bed and flower planter at the facade edge.",
    x: 1_250,
    y: 600,
    width: 350,
    height: 300,
    labels: [
      ["planter wall", "花箱围墙", 1_450, 650],
      ["shrub bed", "灌木花坛", 1_450, 620],
      ["flower planter", "花卉花箱", 1_350, 620],
      ["planter border", "花箱边框", 1_470, 700],
    ],
  },
];

const hotelInteriorZones = [
  {
    id: "lobby",
    title: "Hotel lobby",
    translation: "酒店大堂",
    description: "Explore the reception desk, guest seating, floor inlay and lobby objects.",
    x: 0,
    y: 0,
    width: 400,
    height: 900,
    labels: [
      ["hotel reception desk", "酒店前台", 310, 300],
      ["registration desk", "登记台", 310, 360],
      ["hotel luggage trolley", "酒店行李车", 240, 450],
      ["guest bell cart", "客用行李车", 300, 455],
      ["lobby armchair", "大堂扶手椅", 160, 620],
      ["lobby stone tile", "大堂石砖", 240, 820],
      ["lobby floor inlay", "大堂地面镶嵌", 300, 700],
      ["hotel lobby planter", "酒店大堂花盆", 80, 520],
      ["front desk monitor", "前台显示器", 312, 300],
      ["counter bell", "柜台铃", 330, 340],
      ["guest key packet", "客用钥匙套", 350, 355],
      ["lobby curtain", "大堂帘", 70, 250],
      ["reception drawer", "前台抽屉", 300, 385],
      ["lobby painting", "大堂画作", 380, 300],
      ["lobby desk plinth", "大堂台座", 310, 400],
      ["lobby floor seam", "大堂地面接缝", 260, 760],
    ],
  },
  {
    id: "upper-hall",
    title: "Elevator and housekeeping hall",
    translation: "电梯与客房服务走廊",
    description: "Inspect the elevator hall, stair rail and open housekeeping alcove.",
    x: 400,
    y: 0,
    width: 700,
    height: 460,
    labels: [
      ["concierge counter", "礼宾柜台", 520, 350],
      ["lobby wall mirror", "大堂墙镜", 560, 300],
      ["luggage bench", "行李长椅", 720, 240],
      ["staircase balustrade", "楼梯栏杆", 640, 80],
      ["stair runner", "楼梯地毯", 650, 180],
      ["elevator door panel", "电梯门板", 820, 150],
      ["elevator call button bezel", "电梯呼叫按钮圈", 860, 190],
      ["elevator floor plate", "电梯楼层牌", 820, 100],
      ["elevator door rail", "电梯门轨", 815, 185],
      ["linen cart", "布草车", 1_040, 110],
      ["folded towel stack", "叠放毛巾", 1_050, 55],
      ["laundry hamper", "洗衣篮", 1_030, 150],
      ["vacuum cleaner", "吸尘器", 1_080, 180],
      ["cleaning caddy", "清洁提篮", 1_090, 130],
      ["laundry bag", "洗衣袋", 1_050, 210],
      ["room-service tray", "客房服务托盘", 975, 220],
      ["linen shelf", "布草搁板", 1_050, 40],
      ["hamper lid", "洗衣篮盖", 1_035, 150],
      ["vacuum hose", "吸尘器软管", 1_085, 190],
      ["caddy handle", "提篮把手", 1_095, 130],
      ["housekeeping cart handle", "客房服务车把手", 1_040, 120],
      ["service cart", "服务车", 1_035, 100],
    ],
  },
  {
    id: "upper-east-room",
    title: "Upper guest room",
    translation: "上层客房",
    description: "Study the bed, desk, wardrobe, room controls and visible guest amenities.",
    x: 1_100,
    y: 0,
    width: 500,
    height: 460,
    labels: [
      ["guest bed", "客房床", 1_400, 260],
      ["guest headboard", "客房床头板", 1_350, 190],
      ["guest pillowcase", "客房枕套", 1_430, 175],
      ["guest duvet fold", "客房被褥折边", 1_460, 230],
      ["guest bedside table", "客房床头桌", 1_260, 260],
      ["room telephone", "客房电话", 1_250, 250],
      ["writing desk", "书写桌", 1_260, 120],
      ["desk chair", "书桌椅", 1_300, 150],
      ["suitcase stand", "行李架", 1_190, 190],
      ["open wardrobe", "开放式衣柜", 1_160, 80],
      ["suitcase shell", "行李箱外壳", 1_180, 210],
      ["room curtain panel", "客房窗帘面", 1_550, 130],
      ["room blackout blind", "客房遮光帘", 1_530, 110],
      ["guest artwork frame", "客房画框", 1_320, 90],
      ["mini refrigerator", "小冰箱", 1_190, 320],
      ["coffee tray", "咖啡托盘", 1_260, 260],
      ["room safe", "客房保险箱", 1_180, 290],
      ["guest thermostat", "客房恒温器", 1_450, 100],
      ["electrical outlet", "电源插座", 1_260, 220],
      ["door peephole", "门窥视孔", 1_150, 290],
      ["key-card slot", "房卡插槽", 1_160, 295],
      ["guest carpet edge", "客房地毯边", 1_450, 420],
      ["guest duvet corner", "客房被角", 1_470, 280],
      ["guest wardrobe rail", "客房衣柜杆", 1_160, 95],
      ["guest room door", "客房门", 1_120, 300],
      ["guest door handle", "客房门把手", 1_140, 300],
      ["bedside outlet", "床头插座", 1_260, 280],
      ["desk lamp shade", "台灯灯罩", 1_250, 120],
      ["wardrobe shelf", "衣柜搁板", 1_170, 45],
      ["blind pull", "遮光帘拉绳", 1_540, 170],
      ["safe keypad", "保险箱键盘", 1_190, 300],
      ["coffee maker", "咖啡机", 1_280, 250],
      ["ice bucket", "冰桶", 1_290, 260],
    ],
  },
  {
    id: "lower-central-bath",
    title: "Central guest bathroom",
    translation: "中央客房卫浴",
    description: "Inspect the vanity, shower enclosure, towel fittings and bathroom controls.",
    x: 400,
    y: 460,
    width: 700,
    height: 440,
    labels: [
      ["guest bathrobe", "客房浴袍", 850, 680],
      ["toiletry tray", "洗漱用品托盘", 850, 700],
      ["conditioner bottle", "护发素瓶", 910, 700],
      ["guest bathroom shelf", "客房卫浴搁板", 900, 650],
      ["guest bathroom door", "客房卫浴门", 980, 700],
      ["guest hand towel", "客房擦手巾", 1_000, 700],
      ["guest vanity", "客房盥洗台", 750, 580],
      ["guest vanity counter", "客房盥洗台面", 760, 590],
      ["bathroom mirror", "卫浴镜", 800, 560],
      ["bathroom tile", "卫浴瓷砖", 700, 650],
      ["bathroom waste bin", "卫浴垃圾桶", 980, 760],
      ["shower enclosure", "淋浴隔间", 900, 800],
      ["showerhead", "淋浴喷头", 930, 780],
      ["mixer handle", "混水阀把手", 940, 800],
      ["glass shower door", "淋浴玻璃门", 950, 820],
      ["grab bar", "扶手杆", 900, 850],
      ["shower seat", "淋浴座椅", 920, 850],
      ["hairdryer", "吹风机", 780, 650],
      ["robe hook", "浴袍挂钩", 970, 680],
      ["towel shelf", "毛巾搁板", 760, 620],
      ["shower hinge", "淋浴门铰链", 950, 820],
      ["shower drain cover", "淋浴排水盖", 920, 870],
    ],
  },
  {
    id: "lower-east-baths",
    title: "East guest bathrooms",
    translation: "东侧客房卫浴",
    description: "Follow the second bathroom row, door hardware, drains and vanity details.",
    x: 1_100,
    y: 460,
    width: 500,
    height: 440,
    labels: [
      ["bathroom door latch", "卫浴门闩", 1_160, 520],
      ["shower seal", "淋浴密封条", 1_370, 620],
      ["toilet flush button", "马桶冲水按钮", 1_450, 700],
      ["basin drain cover", "洗手盆排水盖", 1_270, 700],
      ["bathroom shelf bracket", "卫浴搁板支架", 1_300, 600],
      ["vanity light", "盥洗台灯", 1_250, 520],
      ["room floorboard", "客房地板条", 1_150, 880],
      ["room baseboard", "客房踢脚线", 1_450, 880],
      ["bathroom ceiling vent", "卫浴顶面通风口", 1_500, 540],
      ["shower shelf", "淋浴搁板", 1_400, 620],
      ["floor drain cover", "地漏盖", 1_370, 850],
      ["toilet flush plate", "马桶冲水板", 1_470, 700],
      ["door strike plate", "门框锁扣板", 1_160, 520],
      ["toilet roll spring", "卷纸架弹簧", 1_300, 690],
    ],
  },
];

const hotelExteriorPortal = {
  id: "enter-hotel-lobby-rooms",
  label: "Enter the hotel lobby and rooms",
  translation: "进入酒店大堂与客房",
  childSceneId: "hotel-lobby-rooms",
  sourceVisualRegion: "portal-hotel-lobby-rooms",
  x: 760,
  y: 320,
  width: 400,
  height: 250,
  enterScale: 3.4,
};

const hotelExteriorPortalRegion = {
  id: hotelExteriorPortal.sourceVisualRegion,
  description: "Large unobstructed revolving-door and glass-vestibule entrance on the hotel exterior",
  kind: "object",
  x: hotelExteriorPortal.x,
  y: hotelExteriorPortal.y,
  width: hotelExteriorPortal.width,
  height: hotelExteriorPortal.height,
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(value) {
  return value.replace(/[^a-z]+/gu, "-").replace(/^-|-$/gu, "");
}

function makeScene(id, title, translation, subtitle, zones, portal) {
  const labels = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, labelTranslation, x, y] of zone.labels) {
      const idSuffix = slug(word);
      const region = {
        id: `${id}-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the hotel photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      labels.push({
        id: `${id}-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: zone.labels.indexOf(zone.labels.find((row) => row[0] === word)) < 2
          ? 0
          : zone.labels.indexOf(zone.labels.find((row) => row[0] === word)) < 4
            ? 1
            : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`${id}-${idSuffix}`);
      priority += 1;
    }
    detailZones.push({
      id: `${id}-zone-${zone.id}`,
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
  if (portal?.region) visualRegions.push(portal.region);
  return {
    id,
    title,
    translation,
    subtitle,
    asset: portal?.asset ?? "",
    width: WIDTH,
    height: HEIGHT,
    parentId: portal?.parentId,
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: portal?.asset ?? "",
      reviewedAssetSha256: portal?.assetSha256,
      rationale: portal?.rationale,
      previousLabelCount: labels.length + 6,
      retainedLabelCount: labels.length,
      removedLabelCount: 6,
      removedExamples: portal?.removedExamples,
    },
    labels,
    portals: portal?.value ? [portal.value] : [],
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

async function ensureAsset(kind) {
  const source = await readFile(sourceAssets[kind]);
  if (sha256(source) !== SOURCE_SHA256[kind]) throw new Error(`${kind} hotel source bytes changed; rerun pixel audit`);
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256[kind]) throw new Error(`${kind} hotel JPEG is not reproducible`);
  try {
    const current = await readFile(publicAssets[kind]);
    if (Buffer.compare(current, output) === 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(publicAssets[kind], output);
  return true;
}

async function buildScenes() {
  const exterior = makeScene(
    "hotel-exterior",
    "Hotel exterior",
    "酒店外立面",
    "Arrival canopy, entrance and city-side hotel details",
    hotelExteriorZones,
    {
      asset: "/scenes/hotel-exterior-premium-v1.jpg",
      assetSha256: PUBLIC_ASSET_SHA256.exterior,
      value: hotelExteriorPortal,
      region: hotelExteriorPortalRegion,
      parentId: "city-street",
      rationale: "The final 1600 by 900 hotel exterior photograph was inspected at source and output resolution. It retains 69 independently pointable facade, entrance, arrival, sidewalk and planted-frontage details; the upper-floor mixed-use brick building portal on city street is separate from the cafe storefront below. Text, brand identity, occupancy, traffic states and unsupported hotel operations were excluded.",
      removedExamples: ["hotel name", "room number", "taxi passenger", "check-in action", "building ownership", "service schedule"],
    },
  );
  const rooms = makeScene(
    "hotel-lobby-rooms",
    "Hotel lobby and rooms",
    "酒店大堂与客房",
    "Guest rooms, bathrooms, lobby services and housekeeping",
    hotelInteriorZones,
    {
      asset: "/scenes/hotel-lobby-rooms-premium-v1.jpg",
      assetSha256: PUBLIC_ASSET_SHA256.rooms,
      value: null,
      region: null,
      parentId: "hotel-exterior",
      rationale: "The final 1600 by 900 hotel lobby and guest-room photograph was inspected at source and output resolution. It retains 103 independently pointable lobby, elevator, housekeeping, guest-room and bathroom objects or parts. Room occupancy, guest identity, service actions, room numbers and hidden building systems were excluded; repeated rooms share no duplicate display term.",
      removedExamples: ["guest identity", "room number", "occupancy state", "room-service action", "hotel brand", "cleanliness claim"],
    },
  );
  await writeIfChanged(scenePaths.exterior, exterior);
  await writeIfChanged(scenePaths.rooms, rooms);
  return { exterior, rooms };
}

async function updateCityStreet() {
  const city = JSON.parse(await readFile(cityStreetPath, "utf8"));
  const cafe = city.portals.find((portal) => portal.id === "enter-city-cafe");
  if (!cafe) throw new Error("city-street cafe portal is required");
  Object.assign(cafe, {
    x: 740,
    y: 340,
    width: 250,
    height: 300,
  });
  const existingHotelIndex = city.portals.findIndex((portal) => portal.id === "enter-hotel-exterior");
  const hotelPortal = {
    id: "enter-hotel-exterior",
    label: "Enter the hotel exterior",
    translation: "进入酒店外立面",
    childSceneId: "hotel-exterior",
    sourceVisualRegion: "portal-hotel-exterior",
    x: 650,
    y: 155,
    width: 300,
    height: 180,
    enterScale: 3.4,
  };
  if (existingHotelIndex === -1) city.portals.push(hotelPortal);
  else city.portals[existingHotelIndex] = hotelPortal;
  const hotelRegion = {
    id: "portal-hotel-exterior",
    description: "Upper-floor windows and facade of the mixed-use brick building above the cafe storefront",
    kind: "object",
    x: 650,
    y: 155,
    width: 300,
    height: 180,
  };
  const existingRegionIndex = city.visualRegions.findIndex(({ id }) => id === hotelRegion.id);
  if (existingRegionIndex === -1) city.visualRegions.push(hotelRegion);
  else city.visualRegions[existingRegionIndex] = hotelRegion;
  return writeIfChanged(cityStreetPath, city);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [id, title, parentId] of [
    ["hotel-exterior", "Hotel exterior", "city-street"],
    ["hotel-lobby-rooms", "Hotel lobby and rooms", "hotel-exterior"],
  ]) {
    const existing = manifest.scenes.find((entry) => entry.id === id);
    if (!existing) manifest.scenes.push({ id, title, parentId });
    else if (existing.title !== title || existing.parentId !== parentId) throw new Error(`${id} manifest entry has a different parent or title`);
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildHotelScenes() {
  const exteriorAssetChanged = await ensureAsset("exterior");
  const roomsAssetChanged = await ensureAsset("rooms");
  const { exterior, rooms } = await buildScenes();
  const cityChanged = await updateCityStreet();
  const manifestChanged = await updateManifest();
  return {
    exteriorAssetChanged,
    roomsAssetChanged,
    cityChanged,
    manifestChanged,
    exteriorLabels: exterior.labels.length,
    roomsLabels: rooms.labels.length,
  };
}

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  buildHotelScenes()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-hotel-lobby-rooms-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
