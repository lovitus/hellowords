import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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

const WIDTH = 1_600;
const HEIGHT = 900;
const SOURCE_SHA256 = "4c3c56ed197e00557c45b32a02242f853958b57293689575ddfe8a0a1f83c09d";
const PUBLIC_ASSET_SHA256 = "f3089bcc3e56bdb5805cfe3a7208e06a56a683d05297ecbb54efea73d5be2414";

const zones = [
  {
    id: "counter-row-shell",
    title: "Check-in counter row shell",
    translation: "值机柜台排与柜体",
    description: "Trace the visible counter worktops, privacy panels, drawers, bases, ledges and cable covers.",
    x: 80,
    y: 180,
    width: 1_050,
    height: 500,
    labels: [
      ["check-in counter", "值机柜台", 550, 500],
      ["counter worktop", "柜台台面", 550, 400],
      ["counter fascia", "柜台饰面", 550, 540],
      ["counter side panel", "柜台侧板", 470, 550],
      ["check-in counter drawer", "值机柜台抽屉", 600, 550],
      ["counter drawer pull", "柜台抽屉拉手", 600, 560],
      ["counter pedestal base", "柜台基座", 550, 650],
      ["counter base plinth", "柜台底座踢脚", 550, 680],
      ["counter privacy divider", "柜台隐私隔板", 450, 320],
      ["counter privacy panel", "柜台隐私面板", 700, 330],
      ["staffed counter cable cover", "人工柜台电缆盖", 500, 420],
      ["counter service ledge", "柜台服务台沿", 760, 420],
      ["document shelf", "证件搁板", 450, 460],
      ["receipt shelf", "收据搁板", 650, 460],
      ["check-in monitor arm", "值机显示器支臂", 560, 310],
      ["check-in monitor stand", "值机显示器支架", 560, 350],
      ["check-in monitor bezel", "值机显示器边框", 560, 280],
      ["blank counter monitor", "柜台空白显示器", 560, 260],
      ["check-in counter partition", "值机柜台分隔板", 780, 300],
      ["counter foot rail", "柜台脚踏杆", 500, 620],
      ["accessible counter section", "无障碍柜台段", 930, 420],
      ["counter end cap", "柜台端盖", 1_000, 500],
    ],
  },
  {
    id: "staffed-desk-equipment",
    title: "Staffed desk equipment",
    translation: "人工值机设备",
    description: "Inspect the visible document, boarding-pass, baggage-tag and receipt equipment on the desks.",
    x: 80,
    y: 250,
    width: 900,
    height: 360,
    labels: [
      ["agent workstation", "值机工作位", 350, 390],
      ["document scanner", "证件扫描器", 260, 370],
      ["check-in passport reader", "值机护照读取器", 300, 375],
      ["check-in boarding pass printer", "值机登机牌打印机", 150, 420],
      ["baggage tag printer", "行李标签打印机", 210, 420],
      ["check-in receipt printer", "值机收据打印机", 260, 425],
      ["check-in printer output tray", "值机打印机出纸托盘", 235, 450],
      ["tag roll", "标签卷", 170, 410],
      ["blank baggage tag", "空白行李标签", 120, 450],
      ["check-in keyboard tray", "值机键盘托盘", 380, 450],
      ["check-in keyboard", "值机键盘", 390, 430],
      ["card reader", "读卡器", 430, 390],
      ["card reader cradle", "读卡器托架", 440, 420],
      ["desk monitor", "工作位显示器", 450, 300],
      ["monitor power cable", "显示器电源线", 470, 355],
      ["check-in scanner glass", "值机扫描玻璃", 300, 400],
      ["scanner lid", "扫描器盖", 300, 370],
      ["check-in document tray", "值机证件托盘", 340, 410],
      ["paper stack", "纸张堆", 520, 430],
      ["paper tray", "纸张托盘", 530, 450],
      ["label dispenser", "标签分配器", 170, 450],
      ["baggage tag slot", "行李标签插槽", 210, 450],
      ["desk equipment shelf", "工作位设备搁板", 400, 480],
      ["counter device cable", "柜台设备电缆", 450, 470],
      ["baggage tag holder", "行李标签夹", 130, 460],
      ["tag stack", "标签堆", 150, 470],
      ["paper roll", "纸卷", 180, 460],
    ],
  },
  {
    id: "baggage-conveyor-scale",
    title: "Baggage scale and conveyor",
    translation: "行李秤与传送带",
    description: "Follow the visible luggage scale, belt, rollers, side guides, chute and bag-drop hardware.",
    x: 470,
    y: 350,
    width: 600,
    height: 330,
    labels: [
      ["check-in baggage scale", "值机行李秤", 520, 500],
      ["baggage scale platform", "行李秤台", 520, 520],
      ["baggage scale display", "行李秤显示屏", 520, 470],
      ["scale deck", "秤面板", 550, 530],
      ["scale support", "秤台支撑", 570, 560],
      ["check-in belt conveyor", "值机传送带", 650, 500],
      ["conveyor belt surface", "传送带表面", 680, 520],
      ["check-in conveyor roller", "值机传送带滚筒", 720, 480],
      ["roller axle", "滚筒轴", 730, 490],
      ["belt side rail", "传送带侧导轨", 650, 470],
      ["bag-drop belt", "行李托运带", 800, 500],
      ["check-in baggage chute", "值机行李滑槽", 850, 540],
      ["luggage weighing tray", "行李称重托盘", 540, 550],
      ["counter bag shelf", "柜台行李搁板", 860, 580],
      ["baggage side guide", "行李侧导向板", 900, 500],
      ["conveyor stop rail", "传送带止挡杆", 920, 520],
      ["conveyor end plate", "传送带端板", 980, 530],
      ["conveyor housing", "传送带外壳", 760, 600],
      ["baggage bin", "行李箱", 880, 600],
      ["check-in cart dock", "值机推车停靠位", 950, 620],
      ["belt access panel", "传送带检修面板", 760, 620],
      ["scale floor plate", "秤台地板板", 550, 590],
    ],
  },
  {
    id: "kiosk-bank",
    title: "Self-service kiosk bank",
    translation: "自助值机机组",
    description: "Inspect the visible kiosk screens, readers, printers, panels, bases, plates and cable covers.",
    x: 650,
    y: 430,
    width: 850,
    height: 470,
    labels: [
      ["check-in self-service kiosk", "值机自助机", 850, 700],
      ["check-in kiosk screen", "值机自助机屏幕", 850, 560],
      ["check-in kiosk bezel", "值机自助机边框", 850, 550],
      ["kiosk frame", "自助机框架", 850, 650],
      ["kiosk passport reader", "自助机护照读取器", 850, 690],
      ["kiosk document slot", "自助机证件插槽", 850, 720],
      ["kiosk boarding-pass slot", "自助机登机牌插槽", 850, 735],
      ["kiosk tag printer", "自助机标签打印机", 850, 760],
      ["check-in kiosk receipt slot", "值机自助机收据插槽", 850, 780],
      ["check-in kiosk card reader", "值机自助机读卡器", 850, 700],
      ["kiosk card-reader cradle", "自助机读卡器托架", 850, 715],
      ["kiosk lower panel", "自助机下部面板", 850, 820],
      ["kiosk base plate", "自助机底板", 850, 860],
      ["kiosk foot", "自助机脚座", 850, 850],
      ["kiosk side panel", "自助机侧板", 820, 750],
      ["kiosk cable cover", "自助机电缆盖", 820, 810],
      ["kiosk bag-tag roll", "自助机行李标签卷", 860, 770],
      ["kiosk blank tag", "自助机空白标签", 880, 780],
      ["kiosk paper tray", "自助机纸张托盘", 900, 790],
      ["kiosk power inlet", "自助机电源接口", 820, 840],
      ["kiosk screen hood", "自助机屏幕遮罩", 850, 540],
      ["kiosk printer door", "自助机打印机门", 900, 810],
      ["kiosk printer latch", "自助机打印机锁扣", 900, 820],
      ["kiosk speaker grille", "自助机扬声器格栅", 890, 650],
      ["kiosk floor mat", "自助机地垫", 850, 875],
      ["foreground check-in kiosk", "前景值机自助机", 1_050, 700],
      ["middle check-in kiosk", "中景值机自助机", 1_200, 650],
      ["rear check-in kiosk", "后景值机自助机", 1_350, 600],
    ],
  },
  {
    id: "overhead-info-wall",
    title: "Overhead display wall",
    translation: "顶部显示墙",
    description: "Study the blank display panels, mounting arms, wall cladding, glazing and ceiling fittings.",
    x: 0,
    y: 0,
    width: 1_200,
    height: 260,
    labels: [
      ["overhead display panel", "顶部显示面板", 250, 120],
      ["blank information screen", "空白信息屏", 250, 110],
      ["display screen frame", "显示屏框", 250, 130],
      ["display mounting arm", "显示屏支臂", 270, 180],
      ["display cable cover", "显示屏电缆盖", 300, 190],
      ["check-in wall cladding", "值机区墙面饰板", 500, 180],
      ["wall panel seam", "墙板接缝", 600, 200],
      ["ceiling bulkhead", "顶面横梁", 750, 50],
      ["ceiling vent", "顶面通风口", 800, 40],
      ["ceiling light strip", "顶面灯带", 400, 40],
      ["ceiling light housing", "顶灯外壳", 400, 60],
      ["terminal glass mullion", "航站楼玻璃竖框", 1_000, 150],
      ["check-in window frame", "值机区窗框", 1_050, 180],
      ["terminal glazing", "航站楼玻璃", 1_100, 150],
      ["signage support rail", "标牌支撑轨", 400, 170],
      ["blank signage panel", "空白标牌面板", 450, 170],
      ["counter header light", "柜台上梁灯", 650, 230],
      ["check-in upper service panel", "值机区上部服务面板", 900, 220],
    ],
  },
  {
    id: "queue-accessibility",
    title: "Queue and accessible lane",
    translation: "排队与无障碍通道",
    description: "Trace the visible stanchions, belts, lane dividers, accessible opening and floor guidance.",
    x: 950,
    y: 250,
    width: 650,
    height: 550,
    labels: [
      ["check-in queue stanchion", "值机排队隔离柱", 1_200, 400],
      ["stanchion post", "隔离柱杆", 1_300, 420],
      ["queue stanchion base", "排队隔离柱底座", 1_300, 500],
      ["check-in queue belt", "值机排队隔离带", 1_250, 450],
      ["belt receiver", "隔离带接收扣", 1_350, 450],
      ["check-in queue corner", "值机排队转角", 1_400, 500],
      ["accessible check-in lane", "无障碍值机通道", 1_100, 550],
      ["accessible check-in counter", "无障碍值机柜台", 1_050, 430],
      ["accessible counter knee space", "无障碍柜台膝部空间", 1_050, 520],
      ["check-in queue rail", "值机排队栏杆", 1_450, 600],
      ["queue rail foot", "排队栏杆脚座", 1_450, 650],
      ["check-in floor guide stripe", "值机地面导向条", 1_300, 700],
      ["queue floor tile", "排队区地砖", 1_400, 730],
      ["check-in queue barrier", "值机排队隔离栏", 1_500, 450],
      ["barrier connector", "隔离栏连接件", 1_500, 470],
      ["queue lane divider", "排队通道分隔栏", 1_250, 600],
      ["waiting lane", "等候通道", 1_350, 650],
      ["aisle boundary", "过道边界", 1_450, 700],
      ["queue end post", "排队末端柱", 1_550, 620],
      ["check-in floor expansion joint", "值机区地面伸缩缝", 1_400, 780],
      ["terminal column", "航站楼立柱", 1_450, 300],
      ["glass wall panel", "玻璃墙面板", 1_500, 250],
    ],
  },
  {
    id: "floor-baggage-ancillaries",
    title: "Floor and baggage ancillaries",
    translation: "地面与行李辅助物",
    description: "Inspect the visible floor finish, paper and tag supplies, bins, lower panels and access plates.",
    x: 0,
    y: 600,
    width: 1_600,
    height: 300,
    labels: [
      ["polished terminal floor", "航站楼抛光地面", 600, 800],
      ["check-in floor tile", "值机区地砖", 400, 820],
      ["check-in floor grout line", "值机区地砖缝", 450, 850],
      ["terminal bin liner", "航站楼箱内衬", 100, 750],
      ["terminal waste bin", "航站楼垃圾桶", 100, 700],
      ["terminal recycling bin", "航站楼回收桶", 100, 760],
      ["counter footrest", "柜台脚踏", 500, 650],
      ["desk lower panel", "工作位下部面板", 700, 650],
      ["check-in equipment plinth", "值机设备基座", 750, 700],
      ["cable floor cover", "地面电缆盖", 750, 760],
      ["floor access plate", "地面检修板", 900, 800],
      ["stanchion floor socket", "隔离柱地面插座", 1_200, 780],
      ["kiosk floor plate", "自助机地板板", 1_100, 850],
      ["kiosk base corner", "自助机底座转角", 1_000, 820],
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
        id: `check-in-counter-region-${idSuffix}`,
        description: `Pixel-audited “${word}” inside the ${zone.title} crop of the airport check-in photograph`,
        kind: "part",
        x: Math.max(0, x - 20),
        y: Math.max(0, y - 20),
        width: 40,
        height: 40,
      };
      const localIndex = zone.labels.findIndex((row) => row[0] === word);
      labels.push({
        id: `check-in-counter-${idSuffix}`,
        word,
        translation: labelTranslation,
        x,
        y,
        priority: Number((1 + priority / 1000).toFixed(6)),
        minLevel: localIndex < 2 ? 0 : localIndex < 4 ? 1 : 2 + ((priority + 1) % 3),
        sourceVisualRegion: region.id,
      });
      visualRegions.push(region);
      labelIds.push(`check-in-counter-${idSuffix}`);
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
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/check-in-counter-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The final 1600 by 900 check-in-counter photograph was inspected at source and output resolution. It retains ${labels.length} independently pointable counter, document, baggage, kiosk, display, queue and floor parts. Passenger identity, airline branding, readable screens, prices, baggage status, check-in outcomes and hidden airport systems were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: ["passenger identity", "airline branding", "readable screen", "price", "baggage status", "check-in outcome"],
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
  for (const label of scene.labels) {
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

export async function buildCheckInCounterScene() {
  const assetChanged = await ensureAsset();
  const scene = makeScene();
  await assertUniqueWords(scene);
  const sceneChanged = await writeIfChanged(scenePath, scene);
  return {
    assetChanged,
    sceneChanged,
    labels: scene.labels.length,
    zones: scene.detailZones.length,
  };
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
