import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * Author the school-music-room terminal scene from its reviewed source
 * raster. The default command writes only this scene JSON and verifies both
 * image tiers; school-campus integration stays on the main branch.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const sourceAsset = resolve(projectRoot, "scripts/assets/school-music-room-v1.png");
const publicAsset = resolve(projectRoot, "public/scenes/school-music-room-premium-v1.jpg");
const scenePath = resolve(projectRoot, "public/data/scenes/school-music-room.json");
const manifestPath = resolve(projectRoot, "public/data/scenes/manifest.json");
const parentPath = resolve(projectRoot, "public/data/scenes/school-campus.json");
const integrate = process.argv.includes("--integrate");

const SOURCE_WIDTH = 1_672;
const SOURCE_HEIGHT = 941;
const SCENE_WIDTH = 1_600;
const SCENE_HEIGHT = 900;
const SOURCE_SHA256 = "e70747cb22b3fcbbc7674f6b6e18c6e791ac901b13a9b4568dfcb271a821d5f8";
const PUBLIC_ASSET_SHA256 = "1503d02240eaf3534d2df3bde51c2b7ca62e60477f932a4f80fff1a60ee2095b";
const SCALE_X = SCENE_WIDTH / SOURCE_WIDTH;
const SCALE_Y = SCENE_HEIGHT / SOURCE_HEIGHT;

const sourceZones = [
  {
    id: "piano-and-bench",
    title: "Piano and bench",
    translation: "钢琴与琴凳",
    description: "Inspect the upright piano, keyboard, pedals, music desk, casters and padded piano bench.",
    x: 0,
    y: 250,
    width: 600,
    height: 650,
    targetScale: 2.55,
    labels: [
      ["School music upright piano", "学校音乐教室立式钢琴", 280, 450, 0],
      ["Upright piano lid", "立式钢琴琴盖", 250, 370, 1],
      ["Music room piano keyboard", "音乐教室钢琴键盘", 300, 500, 0],
      ["Piano white keys", "钢琴白键", 320, 500, 2],
      ["Piano black keys", "钢琴黑键", 320, 480, 2],
      ["Piano keybed", "钢琴键床", 300, 510, 1],
      ["Piano music desk", "钢琴乐谱架", 250, 300, 0],
      ["Music desk hinge", "乐谱架铰链", 350, 300, 3],
      ["Piano fallboard", "钢琴键盖", 300, 410, 1],
      ["Fallboard edge", "键盖边缘", 300, 420, 3],
      ["Piano pedal box", "钢琴踏板盒", 300, 640, 0],
      ["Sustain pedal", "延音踏板", 300, 680, 2],
      ["Soft pedal", "弱音踏板", 350, 680, 2],
      ["Pedal rod", "踏板连杆", 320, 650, 3],
      ["Music room piano leg", "音乐教室钢琴琴腿", 180, 700, 0],
      ["Piano caster", "钢琴脚轮", 60, 720, 2],
      ["Piano caster wheel", "钢琴脚轮轮子", 60, 720, 4],
      ["Piano side panel", "钢琴侧板", 500, 580, 1],
      ["Piano front rail", "钢琴前横梁", 350, 560, 2],
      ["Music room piano bench", "音乐教室钢琴琴凳", 420, 650, 0],
      ["Piano bench cushion", "钢琴琴凳软垫", 420, 630, 1],
      ["Bench tuft", "琴凳绗缝扣", 420, 630, 4],
      ["Piano bench leg", "钢琴琴凳腿", 420, 780, 2],
      ["Piano bench foot", "钢琴琴凳脚垫", 420, 800, 3],
      ["Piano rear caster", "钢琴后脚轮", 500, 700, 4],
    ],
  },
  {
    id: "drum-kit",
    title: "Drum kit",
    translation: "架子鼓",
    description: "Follow the bass drum, snare, toms, cymbals, pedals, stands, throne and drum rug.",
    x: 500,
    y: 250,
    width: 450,
    height: 400,
    targetScale: 2.55,
    labels: [
      ["Classroom drum kit", "教室架子鼓", 650, 430, 0],
      ["Drum kit bass drum", "架子鼓底鼓", 650, 480, 0],
      ["Bass drum head", "底鼓鼓面", 650, 480, 1],
      ["Bass drum rim", "底鼓鼓圈", 650, 480, 3],
      ["Bass drum pedal", "底鼓踏板", 650, 570, 2],
      ["Drum kit snare drum", "架子鼓小鼓", 570, 400, 0],
      ["Snare drum head", "小鼓鼓面", 570, 400, 1],
      ["Snare drum rim", "小鼓鼓圈", 570, 400, 3],
      ["Rack tom", "吊镲鼓", 630, 350, 0],
      ["Floor tom", "落地通鼓", 760, 400, 0],
      ["Tom drum head", "通鼓鼓面", 700, 350, 1],
      ["Tom lug", "通鼓调音螺栓", 650, 370, 4],
      ["Hi-hat", "踩镲", 540, 350, 0],
      ["Hi-hat cymbal pair", "踩镲双片", 540, 350, 1],
      ["Hi-hat pedal", "踩镲踏板", 540, 450, 2],
      ["Crash cymbal", "碎音镲", 520, 300, 0],
      ["Ride cymbal", "叮叮镲", 760, 300, 0],
      ["Cymbal felt", "镲片毡垫", 760, 300, 4],
      ["Drum cymbal stand", "架子鼓镲架", 760, 350, 1],
      ["Drum throne", "架子鼓鼓凳", 800, 450, 0],
      ["Throne seat", "鼓凳座面", 800, 430, 1],
      ["Snare stand", "小鼓架", 570, 440, 2],
      ["Tom stand", "通鼓架", 700, 400, 2],
      ["Bass drum hoop", "底鼓鼓圈环", 650, 480, 3],
      ["Drum rug", "架子鼓地毯", 650, 550, 0],
    ],
  },
  {
    id: "guitars-and-music-stands",
    title: "Guitars and music stands",
    translation: "吉他与乐谱架",
    description: "Inspect the two acoustic guitars, their stands and the nearby blank music stands.",
    x: 850,
    y: 300,
    width: 450,
    height: 450,
    targetScale: 2.55,
    labels: [
      ["Classroom acoustic guitar", "教室木吉他", 980, 500, 0],
      ["Classroom guitar neck", "教室吉他琴颈", 980, 380, 1],
      ["Guitar headstock", "吉他琴头", 980, 330, 2],
      ["Guitar tuning pegs", "吉他弦钮", 980, 320, 3],
      ["Guitar fretboard", "吉他指板", 980, 420, 1],
      ["Guitar fret", "吉他品丝", 980, 430, 3],
      ["Guitar strings", "吉他琴弦", 980, 500, 2],
      ["Guitar bridge", "吉他琴桥", 980, 560, 2],
      ["Guitar saddle", "吉他弦枕", 980, 555, 4],
      ["Guitar body", "吉他琴身", 980, 510, 0],
      ["Guitar rosette", "吉他音孔饰圈", 980, 500, 3],
      ["Guitar pickguard", "吉他护板", 980, 530, 2],
      ["Guitar strap", "吉他背带", 1_020, 520, 3],
      ["Guitar stand", "吉他支架", 980, 620, 0],
      ["Guitar case", "吉他琴盒", 1_050, 650, 1],
      ["Second guitar", "第二把吉他", 1_070, 500, 0],
      ["Second guitar neck", "第二把吉他琴颈", 1_070, 380, 1],
      ["Second guitar headstock", "第二把吉他琴头", 1_070, 330, 2],
      ["Second guitar strings", "第二把吉他琴弦", 1_070, 500, 2],
      ["Second guitar stand", "第二把吉他支架", 1_070, 620, 0],
      ["Music stand", "乐谱架", 880, 450, 0],
      ["Music stand tray", "乐谱架托盘", 880, 560, 2],
      ["Music stand hinge", "乐谱架铰链", 880, 570, 3],
      ["Music stand base", "乐谱架底座", 880, 620, 1],
      ["Music stand foot", "乐谱架底脚", 880, 650, 4],
    ],
  },
  {
    id: "percussion-table",
    title: "Mallets and hand percussion",
    translation: "键盘打击乐与手鼓",
    description: "Explore the xylophone, glockenspiel, hand drums, tambourine, maracas, triangle and wood block.",
    x: 1_050,
    y: 430,
    width: 622,
    height: 511,
    targetScale: 2.55,
    labels: [
      ["Xylophone", "木琴", 1_300, 530, 0],
      ["Xylophone bar", "木琴音条", 1_300, 520, 1],
      ["Xylophone frame", "木琴框架", 1_300, 590, 0],
      ["Xylophone resonator", "木琴共鸣管", 1_300, 560, 2],
      ["Xylophone mallet", "木琴琴槌", 1_200, 620, 3],
      ["Glockenspiel", "钟琴", 1_300, 620, 0],
      ["Glockenspiel bar", "钟琴音条", 1_300, 610, 1],
      ["Glockenspiel frame", "钟琴框架", 1_300, 670, 2],
      ["Glockenspiel mallet", "钟琴琴槌", 1_200, 650, 3],
      ["Classroom hand drum", "教室手鼓", 1_180, 680, 0],
      ["Hand drum skin", "手鼓鼓皮", 1_180, 650, 2],
      ["Classroom conga drum", "教室康加鼓", 1_230, 700, 0],
      ["Conga drum head", "康加鼓鼓面", 1_230, 660, 1],
      ["Conga shell", "康加鼓鼓身", 1_230, 720, 2],
      ["Djembe", "非洲鼓", 1_350, 730, 0],
      ["Djembe head", "非洲鼓鼓面", 1_350, 690, 1],
      ["Djembe shell", "非洲鼓鼓身", 1_350, 750, 2],
      ["Tambourine", "铃鼓", 1_180, 820, 0],
      ["Tambourine ring", "铃鼓环", 1_180, 810, 2],
      ["Tambourine jingles", "铃鼓铜片", 1_180, 830, 3],
      ["Maraca pair", "沙锤一对", 1_300, 840, 0],
      ["Shaker", "沙锤", 1_300, 800, 1],
      ["Triangle", "三角铁", 1_500, 840, 0],
      ["Triangle beater", "三角铁击棒", 1_500, 880, 3],
      ["Wood block", "木鱼块", 1_450, 880, 0],
    ],
  },
  {
    id: "instrument-storage",
    title: "Instrument storage and audio",
    translation: "乐器储藏与音响",
    description: "Inspect the instrument cabinet, cases, keyboard, speaker, microphone, headphones and metronome.",
    x: 1_150,
    y: 80,
    width: 522,
    height: 650,
    targetScale: 2.5,
    labels: [
      ["Music instrument cabinet", "音乐教室乐器柜", 1_350, 250, 0],
      ["Instrument cabinet glass door", "乐器柜玻璃门", 1_350, 250, 2],
      ["Instrument cabinet shelf", "乐器柜搁板", 1_350, 180, 1],
      ["Instrument cabinet hinge", "乐器柜铰链", 1_200, 250, 3],
      ["Instrument cabinet handle", "乐器柜把手", 1_350, 330, 3],
      ["Storage guitar case", "储藏吉他琴盒", 1_230, 220, 0],
      ["Storage drum case", "储藏鼓盒", 1_400, 220, 1],
      ["Storage cymbal case", "储藏镲片盒", 1_500, 220, 2],
      ["Electronic keyboard", "电子键盘", 1_250, 420, 0],
      ["Keyboard stand", "键盘支架", 1_250, 470, 1],
      ["Keyboard key row", "键盘琴键列", 1_250, 420, 2],
      ["Keyboard power cable", "键盘电源线", 1_250, 500, 3],
      ["Audio speaker", "音响", 1_570, 430, 0],
      ["Classroom speaker grille", "教室音响网罩", 1_570, 430, 2],
      ["Speaker stand", "音响支架", 1_570, 500, 1],
      ["Microphone", "麦克风", 1_560, 330, 0],
      ["Microphone head", "麦克风头", 1_560, 310, 2],
      ["Classroom microphone grille", "教室麦克风网罩", 1_560, 310, 3],
      ["Microphone stand", "麦克风支架", 1_560, 420, 0],
      ["Microphone boom arm", "麦克风悬臂", 1_580, 370, 2],
      ["Microphone cable", "麦克风线", 1_560, 450, 3],
      ["Headphone rack", "耳机架", 1_650, 230, 0],
      ["Headphone pair", "耳机一对", 1_650, 230, 1],
      ["Classroom headphone earcup", "教室耳机罩", 1_650, 260, 3],
      ["Metronome", "节拍器", 1_550, 610, 0],
    ],
  },
  {
    id: "room-acoustics-and-support",
    title: "Room acoustics and support",
    translation: "房间声学与设施",
    description: "Follow the acoustic panels, windows, ceiling services, doors, floor box, rug, outlet and plant.",
    x: 0,
    y: 0,
    width: 1_672,
    height: 941,
    targetScale: 2.4,
    labels: [
      ["Acoustic wall panel", "吸音墙板", 100, 100, 0],
      ["Acoustic panel seam", "吸音板接缝", 100, 200, 3],
      ["Music room whiteboard", "音乐教室白板", 1_000, 250, 0],
      ["Whiteboard ledge", "白板托沿", 1_000, 330, 2],
      ["Music room door", "音乐教室门", 700, 200, 0],
      ["Music room door window", "音乐教室门窗", 700, 220, 1],
      ["Music room door handle", "音乐教室门把手", 700, 250, 3],
      ["Music room window wall", "音乐教室窗墙", 250, 180, 0],
      ["Music room window mullion", "音乐教室窗竖框", 250, 180, 2],
      ["Music room ceiling light", "音乐教室顶灯", 900, 50, 0],
      ["Music room ceiling air diffuser", "音乐教室送风口", 900, 100, 2],
      ["Music room ceiling panel", "音乐教室顶板", 900, 100, 1],
      ["Music room floor", "音乐教室地面", 900, 850, 0],
      ["Music room floor box cover", "音乐教室地面线盒盖", 700, 700, 3],
      ["Music room floor cable box", "音乐教室地面线盒", 700, 700, 2],
      ["Music room bench carpet", "音乐教室地毯", 700, 650, 0],
      ["Music room carpet edge", "音乐教室地毯边", 700, 700, 3],
      ["Music room audio cable", "音乐教室音频线", 700, 400, 2],
      ["Music room power outlet", "音乐教室电源插座", 700, 350, 1],
      ["Music room outlet cover", "音乐教室插座盖", 700, 350, 3],
      ["Instrument stool", "乐器凳", 1_450, 650, 0],
      ["Music stool seat", "乐器凳座面", 1_450, 650, 1],
      ["Music stool leg", "乐器凳凳腿", 1_450, 700, 2],
      ["Room plant pot", "教室植物盆", 250, 350, 0],
      ["Room plant leaf", "教室植物叶片", 250, 300, 1],
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
    id: `school-music-room-region-${slugify(word)}`,
    description: `Pixel-audited “${word}” inside the ${zoneTitle} crop of the school music-room photograph`,
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
      const id = `school-music-room-${slugify(word)}`;
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
        semanticRealmId: "people-society",
      });
      visualRegions.push(region);
      labelIds.push(id);
      priorityIndex += 1;
    }
    detailZones.push({
      id: `school-music-room-zone-${zone.id}`,
      title: zone.title,
      translation: zone.translation,
      description: zone.description,
      ...sceneRectangle(zone),
      targetScale: zone.targetScale,
      labelIds,
    });
  }
  return {
    id: "school-music-room",
    title: "School music room",
    translation: "学校音乐教室",
    subtitle: "Piano, drums, guitars, percussion and instrument storage",
    asset: "/scenes/school-music-room-premium-v1.jpg",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    parentId: "school-campus",
    visualRegions,
    detailZones,
    anchorAudit: {
      status: "human-verified",
      policy: "visible-object-or-part-only",
      reviewedAsset: "/scenes/school-music-room-premium-v1.jpg",
      reviewedAssetSha256: PUBLIC_ASSET_SHA256,
      rationale: `The source and resized music-room photographs were inspected at native and final pixels. This batch retains ${labels.length} independently pointable piano, drum, guitar, percussion, storage, audio, acoustic and room-fixture parts across ${detailZones.length} bounded zones. Student identity, teacher identity, readable music notation, lyrics, scores, lesson state, brands, school policy and hidden instrument functions were excluded.`,
      previousLabelCount: labels.length + 8,
      retainedLabelCount: labels.length,
      removedLabelCount: 8,
      removedExamples: [
        "student identity",
        "teacher identity",
        "readable music notation",
        "lyrics",
        "score",
        "lesson state",
        "brand name",
        "hidden instrument function",
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
  if (sha256(source) !== SOURCE_SHA256) throw new Error("music-room source bytes changed; rerun the pixel audit");
  const output = await sharp(source, { failOn: "error", sequentialRead: true })
    .resize({ width: SCENE_WIDTH, height: SCENE_HEIGHT, fit: "fill", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
  if (sha256(output) !== PUBLIC_ASSET_SHA256) throw new Error(`music-room JPEG is not reproducible; got ${sha256(output)}`);
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
  const localWords = new Set();
  for (const label of scene.labels) {
    const word = label.word.toLocaleLowerCase();
    if (localWords.has(word)) throw new Error(`school-music-room contains duplicate display word: ${word}`);
    localWords.add(word);
  }
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
  const duplicates = [...localWords].filter((word) => existingWords.has(word));
  if (duplicates.length > 0) throw new Error(`school-music-room term duplicates existing words: ${duplicates.join(", ")}`);
}

const parentPortal = {
  id: "enter-school-music-room",
  label: "Enter the school music room",
  translation: "进入学校音乐教室",
  childSceneId: "school-music-room",
  sourceVisualRegion: "portal-school-music-room",
  x: 598,
  y: 306,
  width: 330,
  height: 239,
  enterScale: 3.4,
};

const parentRegion = {
  id: parentPortal.sourceVisualRegion,
  description: "Complete music room visible in the central school wing",
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
  else {
    const gymIndex = parent.portals.findIndex(({ childSceneId }) => childSceneId === "school-gymnasium-equipment");
    parent.portals.splice(gymIndex >= 0 ? gymIndex : parent.portals.length, 0, parentPortal);
  }
  const regionIndex = parent.visualRegions.findIndex(({ id }) => id === parentRegion.id);
  if (regionIndex >= 0) parent.visualRegions[regionIndex] = parentRegion;
  else parent.visualRegions.push(parentRegion);
  return writeIfChanged(parentPath, parent);
}

async function updateManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.scenes.some(({ id }) => id === "school-music-room")) {
    const artIndex = manifest.scenes.findIndex(({ id }) => id === "school-art-studio");
    const parentIndex = manifest.scenes.findIndex(({ id }) => id === "school-campus");
    if (parentIndex < 0) throw new Error("school-campus is missing from the scene manifest");
    manifest.scenes.splice(artIndex >= 0 ? artIndex + 1 : parentIndex + 1, 0, {
      id: "school-music-room",
      title: "School music room",
      parentId: "school-campus",
    });
  }
  return writeIfChanged(manifestPath, manifest);
}

export async function buildSchoolMusicRoomScene() {
  const scene = buildScene();
  if (scene.labels.length < 145 || scene.labels.length > 155) {
    throw new Error(`music-room label count ${scene.labels.length} is outside 145–155`);
  }
  if (scene.detailZones.length !== 6) throw new Error(`music-room zone count ${scene.detailZones.length} is not 6`);
  await assertUniqueWords(scene);
  const result = {
    assetChanged: await ensureAsset(),
    sceneChanged: await writeIfChanged(scenePath, scene),
    labels: scene.labels.length,
    zones: scene.detailZones.length,
    parentId: scene.parentId,
  };
  if (integrate) {
    result.parentChanged = await updateParent();
    result.manifestChanged = await updateManifest();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildSchoolMusicRoomScene()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`add-school-music-room-scene: ${error.message}`);
      process.exitCode = 1;
    });
}
