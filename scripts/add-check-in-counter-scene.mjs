import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { baggageDropPortal, baggageDropPortalRegion } from "./add-baggage-drop-station-scene.mjs";

/**
 * Build the airport check-in counter terminal scene. Parent portal and
 * manifest integration stay with the root agent; this script owns only the
 * reviewed child scene, its images and the global-term audit.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/check-in-counter-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/check-in-counter-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/check-in-counter.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/airport.json");
const integrate = process.argv.includes("--integrate");

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "4c3c56ed197e00557c45b32a02242f853958b57293689575ddfe8a0a1f83c09d";
const PUBLIC_ASSET_SHA256 = "f3089bcc3e56bdb5805cfe3a7208e06a56a683d05297ecbb54efea73d5be2414";

const zones = [
  {
    id: "counter-row-shell",
    title: "Check-in counter row shell",
    translation: "值机柜台排与柜体",
    description: "Follow the metal counter fronts, ledges and brown partitions along the staffed row.",
    x: 80,
    y: 180,
    width: 1_050,
    height: 500,
    labels: [
      ["check-in counter", "值机柜台", 865, 419, 44, 48],
      ["counter worktop", "柜台台面", 345, 356, 20, 5],
      ["counter fascia", "柜台饰面", 399, 395, 50, 14],
      ["counter side panel", "柜台侧板", 158, 404, 30, 12],
      ["check-in counter drawer", "值机柜台抽屉"],
      ["counter drawer pull", "柜台抽屉拉手"],
      ["counter pedestal base", "柜台基座"],
      ["counter base plinth", "柜台底座踢脚", 282, 622, 24, 8],
      ["counter privacy divider", "柜台隐私隔板", 418, 274, 40, 34],
      ["counter privacy panel", "柜台隐私面板", 1001, 245, 32, 24],
      ["staffed counter cable cover", "人工柜台电缆盖"],
      ["counter service ledge", "柜台服务台沿", 689, 363, 38, 6],
      ["document shelf", "证件搁板"],
      ["receipt shelf", "收据搁板"],
      ["check-in monitor arm", "值机显示器支臂"],
      ["check-in monitor bezel", "值机显示器边框"],
      ["blank counter monitor", "柜台空白显示器"],
      ["check-in counter partition", "值机柜台分隔板", 851, 241, 28, 13],
      ["counter foot rail", "柜台脚踏杆"],
      ["accessible counter section", "无障碍柜台段"],
      ["counter end cap", "柜台端盖"],
    ],
  },
  {
    id: "staffed-desk-equipment",
    title: "Staffed desk equipment",
    translation: "人工值机设备",
    description: "Identify the staffed workstation, the rear of the desk monitor, its stand and the separate equipment shelf.",
    x: 80,
    y: 250,
    width: 900,
    height: 360,
    labels: [
      ["agent workstation", "值机工作位", 796, 271, 38, 18],
      ["document scanner", "证件扫描器"],
      ["check-in passport reader", "值机护照读取器"],
      ["check-in boarding pass printer", "值机登机牌打印机"],
      ["baggage tag printer", "行李标签打印机"],
      ["check-in receipt printer", "值机收据打印机"],
      ["check-in printer output tray", "值机打印机出纸托盘"],
      ["tag roll", "标签卷"],
      ["blank baggage tag", "空白行李标签"],
      ["check-in keyboard tray", "值机键盘托盘"],
      ["check-in keyboard", "值机键盘"],
      ["card reader", "读卡器"],
      ["card reader cradle", "读卡器托架"],
      ["desk monitor", "工作位显示器", 309, 309, 42, 25],
      ["check-in monitor stand", "值机显示器支架", 294, 344, 16, 8],
      ["monitor power cable", "显示器电源线"],
      ["check-in scanner glass", "值机扫描玻璃"],
      ["scanner lid", "扫描器盖"],
      ["check-in document tray", "值机证件托盘"],
      ["paper stack", "纸张堆"],
      ["paper tray", "纸张托盘"],
      ["label dispenser", "标签分配器"],
      ["baggage tag slot", "行李标签插槽"],
      ["desk equipment shelf", "工作位设备搁板", 123, 490, 20, 4],
      ["counter device cable", "柜台设备电缆"],
      ["baggage tag holder", "行李标签夹"],
      ["tag stack", "标签堆"],
      ["paper roll", "纸卷"],
    ],
  },
  {
    id: "baggage-conveyor-scale",
    title: "Baggage scale and conveyor",
    translation: "行李秤与传送带",
    description: "Trace the black belts between the desks and the row of exposed silver rollers on the right.",
    x: 470,
    y: 350,
    width: 600,
    height: 330,
    labels: [
      ["check-in baggage scale", "值机行李秤"],
      ["baggage scale platform", "行李秤台"],
      ["baggage scale display", "行李秤显示屏"],
      ["scale deck", "秤面板"],
      ["scale support", "秤台支撑"],
      ["check-in belt conveyor", "值机传送带", 663, 452, 26, 12],
      ["conveyor belt surface", "传送带表面", 574, 479, 16, 6],
      ["check-in conveyor roller", "值机传送带滚筒", 1007, 407, 7, 2],
      ["roller axle", "滚筒轴"],
      ["belt side rail", "传送带侧导轨", 579, 427, 8, 3],
      ["bag-drop belt", "行李托运带"],
      ["check-in baggage chute", "值机行李滑槽"],
      ["luggage weighing tray", "行李称重托盘"],
      ["counter bag shelf", "柜台行李搁板"],
      ["baggage side guide", "行李侧导向板", 1001, 381, 15, 4],
      ["conveyor stop rail", "传送带止挡杆"],
      ["conveyor end plate", "传送带端板", 548, 537, 38, 15],
      ["conveyor housing", "传送带外壳", 960, 443, 14, 11],
      ["baggage bin", "行李箱"],
      ["check-in cart dock", "值机推车停靠位"],
      ["belt access panel", "传送带检修面板"],
      ["scale floor plate", "秤台地板板"],
    ],
  },
  {
    id: "kiosk-bank",
    title: "Self-service kiosk bank",
    translation: "自助值机机组",
    description: "Follow the row of freestanding kiosks from the nearest cabinet to the far screen and its metal base.",
    x: 640,
    y: 400,
    width: 840,
    height: 500,
    labels: [
      ["check-in self-service kiosk", "值机自助机", 768, 837, 56, 30],
      ["check-in kiosk screen", "值机自助机屏幕", 1015, 556, 44, 50],
      ["check-in kiosk bezel", "值机自助机边框", 1015, 499, 18, 6],
      ["kiosk frame", "自助机框架"],
      ["kiosk passport reader", "自助机护照读取器"],
      ["kiosk document slot", "自助机证件插槽"],
      ["kiosk boarding-pass slot", "自助机登机牌插槽"],
      ["kiosk tag printer", "自助机标签打印机"],
      ["check-in kiosk receipt slot", "值机自助机收据插槽"],
      ["check-in kiosk card reader", "值机自助机读卡器"],
      ["kiosk card-reader cradle", "自助机读卡器托架"],
      ["kiosk lower panel", "自助机下部面板", 1040, 774, 50, 60],
      ["kiosk base plate", "自助机底板", 1106, 846, 24, 8],
      ["kiosk foot", "自助机脚座"],
      ["kiosk side panel", "自助机侧板", 960, 747, 18, 58],
      ["kiosk cable cover", "自助机电缆盖"],
      ["kiosk bag-tag roll", "自助机行李标签卷"],
      ["kiosk blank tag", "自助机空白标签"],
      ["kiosk paper tray", "自助机纸张托盘"],
      ["kiosk power inlet", "自助机电源接口"],
      ["kiosk screen hood", "自助机屏幕遮罩"],
      ["kiosk printer door", "自助机打印机门"],
      ["kiosk printer latch", "自助机打印机锁扣"],
      ["kiosk speaker grille", "自助机扬声器格栅"],
      ["kiosk floor mat", "自助机地垫"],
      ["foreground check-in kiosk", "前景值机自助机"],
      ["middle check-in kiosk", "中景值机自助机", 1236, 680, 40, 44],
      ["rear check-in kiosk", "后景值机自助机", 1408, 620, 34, 40],
    ],
  },
  {
    id: "overhead-info-wall",
    title: "Overhead display wall",
    translation: "顶部显示墙",
    description: "Find the dark overhead displays, their metal supports, and the wall and window framing behind them.",
    x: 0,
    y: 0,
    width: 1_540,
    height: 260,
    labels: [
      ["overhead display panel", "顶部显示面板", 295, 92, 110, 56],
      ["blank information screen", "空白信息屏", 572, 90, 72, 38],
      ["display screen frame", "显示屏框", 807, 55, 28, 3],
      ["display mounting arm", "显示屏支臂", 308, 16, 4, 20],
      ["display cable cover", "显示屏电缆盖"],
      ["check-in wall cladding", "值机区墙面饰板", 287, 200, 90, 38],
      ["wall panel seam", "墙板接缝", 436, 194, 2, 44],
      ["ceiling bulkhead", "顶面横梁", 1018, 35, 58, 24],
      ["ceiling vent", "顶面通风口"],
      ["ceiling light strip", "顶面灯带", 83, 66, 66, 2],
      ["ceiling light housing", "顶灯外壳"],
      ["terminal glass mullion", "航站楼玻璃竖框", 1303, 99, 4, 24],
      ["check-in window frame", "值机区窗框", 1511, 21, 34, 2],
      ["terminal glazing", "航站楼玻璃", 1459, 89, 42, 28],
      ["signage support rail", "标牌支撑轨"],
      ["blank signage panel", "空白标牌面板", 976, 110, 42, 30],
      ["counter header light", "柜台上梁灯"],
      ["check-in upper service panel", "值机区上部服务面板"],
    ],
  },
  {
    id: "queue-accessibility",
    title: "Queue and accessible lane",
    translation: "排队与无障碍通道",
    description: "Trace the queue from the metal posts and belt clips to the open passenger lane beside the windows.",
    x: 950,
    y: 70,
    width: 650,
    height: 605,
    labels: [
      ["check-in queue stanchion", "值机排队隔离柱", 1503, 494, 9, 48],
      ["stanchion post", "隔离柱杆", 1202, 406, 5, 26],
      ["queue stanchion base", "排队隔离柱底座", 1523, 603, 16, 6],
      ["check-in queue belt", "值机排队隔离带", 1281, 366, 22, 3],
      ["belt receiver", "隔离带接收扣", 1344, 383, 8, 10],
      ["check-in queue corner", "值机排队转角"],
      ["accessible check-in lane", "无障碍值机通道"],
      ["accessible check-in counter", "无障碍值机柜台"],
      ["accessible counter knee space", "无障碍柜台膝部空间"],
      ["check-in queue rail", "值机排队栏杆"],
      ["queue rail foot", "排队栏杆脚座"],
      ["check-in floor guide stripe", "值机地面导向条"],
      ["queue floor tile", "排队区地砖", 1449, 332, 36, 14],
      ["check-in queue barrier", "值机排队隔离栏", 1449, 364, 24, 3],
      ["barrier connector", "隔离栏连接件", 1517, 420, 4, 6],
      ["queue lane divider", "排队通道分隔栏", 1306, 285, 20, 2],
      ["waiting lane", "等候通道", 1287, 321, 42, 25],
      ["aisle boundary", "过道边界"],
      ["queue end post", "排队末端柱"],
      ["check-in floor expansion joint", "值机区地面伸缩缝"],
      ["terminal column", "航站楼立柱", 1564, 146, 22, 72],
      ["glass wall panel", "玻璃墙面板", 1349, 106, 38, 30],
    ],
  },
  {
    id: "floor-baggage-ancillaries",
    title: "Floor and baggage ancillaries",
    translation: "地面与行李辅助物",
    description: "Look at the foreground stone tiles, the open waste bin and the lower edges of the counter and kiosks.",
    x: 0,
    y: 495,
    width: 1_600,
    height: 405,
    labels: [
      ["polished terminal floor", "航站楼抛光地面", 562, 732, 72, 36],
      ["check-in floor tile", "值机区地砖", 324, 823, 64, 26],
      ["check-in floor grout line", "值机区地砖缝", 169, 799, 2, 2],
      ["terminal bin liner", "航站楼箱内衬"],
      ["terminal waste bin", "航站楼垃圾桶", 73, 647, 56, 94],
      ["terminal recycling bin", "航站楼回收桶"],
      ["counter footrest", "柜台脚踏"],
      ["desk lower panel", "工作位下部面板", 394, 516, 50, 56],
      ["check-in equipment plinth", "值机设备基座", 1247, 768, 16, 8],
      ["cable floor cover", "地面电缆盖"],
      ["floor access plate", "地面检修板"],
      ["stanchion floor socket", "隔离柱地面插座"],
      ["kiosk floor plate", "自助机地板板", 1441, 695, 16, 8],
      ["kiosk base corner", "自助机底座转角", 1216, 811, 6, 4],
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
  const relatedWords = [];
  const visualRegions = [];
  const detailZones = [];
  let priority = 0;
  for (const zone of zones) {
    const labelIds = [];
    for (const [word, translation, x, y, width, height] of zone.labels) {
      const idSuffix = slug(word);
      const id = `check-in-counter-${idSuffix}`;
      if (x === undefined) {
        relatedWords.push({ id, word, translation });
        continue;
      }
      const region = {
        id: `check-in-counter-region-${idSuffix}`,
        description: `Visible ${word} in the ${zone.title.toLowerCase()} area of the airport photograph`,
        kind: "part",
        x: x - Math.floor(width / 2),
        y: y - Math.floor(height / 2),
        width,
        height,
      };
      const localIndex = labelIds.length;
      labels.push({
        id,
        word,
        translation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(id);
      priority += 1;
    }
    detailZones.push({
      id: `check-in-counter-zone-${zone.id}`,
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
    id: "check-in-counter",
    title: "Check-in counter",
    translation: "值机柜台",
    subtitle: "Counter hardware, baggage scale, printers, kiosks and queue fixtures",
    asset: "/scenes/check-in-counter-premium-v1.jpg",
    width: WIDTH,
    height: HEIGHT,
    parentId: "airport",
    visualRegions: [...visualRegions, baggageDropPortalRegion],
    detailZones,
    anchorAudit: {
      status: "image-reviewed",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/check-in-counter-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: "The counter row, desk equipment, conveyors, kiosks, displays, queue and floor were matched to features visible in the 1600 by 900 photograph. The nearest kiosk is identifiable by its cabinet. The function of its dark recess is indistinct, so card readers, printers and other unresolved equipment stay in the scene index.",
      previousLabelCount: 161,
      retainedLabelCount: labels.length,
      removedLabelCount: relatedWords.length + 8,
      removedExamples: ["check-in kiosk card reader", "baggage scale display", "kiosk floor mat", "check-in baggage chute", "passenger identity", "airline branding"],
    },
    labels,
    relatedWords,
    portals: [baggageDropPortal],
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("check-in counter source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: WIDTH, height: HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: false, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error("check-in counter JPEG is not reproducible");
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
  for (const label of [...scene.labels, ...scene.relatedWords]) {
    const normalized = label.word.toLocaleLowerCase();
    const sources = wordSources.get(normalized) ?? [];
    sources.push(label.id);
    wordSources.set(normalized, sources);
  }
  const duplicateWords = [...wordSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([word, sources]) => `${word} (${sources.join(", ")})`);
  if (duplicateWords.length > 0) throw new Error(`check-in-counter contains duplicate display words: ${duplicateWords.join("; ")}`);

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
  if (existingDuplicates.length > 0) throw new Error(`check-in-counter term duplicates existing words: ${existingDuplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-check-in-counter",
  label: "Enter the check-in counter",
  translation: "进入值机柜台",
  childSceneId: "check-in-counter",
  sourceVisualRegion: "portal-check-in-counter-left-counter-bank",
  x: 0,
  y: 340,
  width: 270,
  height: 220,
  enterScale: 3.5,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete visible left-hand check-in counter bank in the airport photograph",
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
  if (!manifest.scenes.some(({ id }) => id === "check-in-counter")) {
    const index = manifest.scenes.findIndex(({ id }) => id === "airport");
    if (index < 0) throw new Error("airport is missing from the scene manifest");
    manifest.scenes.splice(index + 1, 0, {
      id: "check-in-counter",
      title: "Check-in counter",
      parentId: "airport",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildCheckInCounterScene() {
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
  buildCheckInCounterScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-check-in-counter-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
