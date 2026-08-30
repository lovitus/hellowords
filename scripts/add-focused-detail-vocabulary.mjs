import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Adds a small, evidence-led detail batch to already reviewed raster scenes.
 * Unlike the broad professional pass, these labels carry explicit pixel
 * anchors so a new word never inherits a generic grid coordinate by accident.
 * The script is idempotent: it can be rerun after a failed build without
 * duplicating a word or changing an existing anchor.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "public/data/scenes");

const realmByScene = {
  "transit-hub": "objects-technology",
  "potting-workbench": "nature-life",
  "greenhouse-interior": "nature-life",
  leaf: "nature-life",
};

/**
 * Coordinates are in the reviewed 1600x900 scene space. Each point was
 * checked against the named visual region in the corresponding raster.
 */
const additions = {
  "transit-hub": [
    ["bicycle handlebar", "自行车车把", 1100, 585, "verified-bicycle", "foreground-mobility"],
    ["bicycle saddle", "自行车鞍座", 1140, 595, "verified-bicycle", "foreground-mobility"],
    ["bicycle pedal", "自行车脚踏", 1125, 625, "verified-bicycle", "foreground-mobility"],
    ["bicycle chain", "自行车链条", 1120, 610, "verified-bicycle", "foreground-mobility"],
    ["trolley basket", "行李车篮", 1135, 690, "verified-luggage-trolley", "foreground-mobility"],
    ["trolley frame", "行李车车架", 1135, 735, "verified-luggage-trolley", "foreground-mobility"],
    ["trolley caster", "行李车脚轮", 1105, 815, "verified-luggage-trolley", "foreground-mobility"],
    ["trolley basket rail", "行李车篮栏", 1165, 690, "verified-luggage-trolley", "foreground-mobility"],
    ["bollard body", "护柱柱身", 1240, 760, "verified-bollard", "foreground-mobility"],
    ["bollard base", "护柱底座", 1240, 850, "verified-bollard", "foreground-mobility"],
    ["bollard band", "护柱环带", 1300, 730, "verified-bollard", "foreground-mobility"],
    ["floor reflection", "地面倒影", 1420, 820, "verified-polished-floor", "foreground-mobility"],
  ],
  "potting-workbench": [
    ["soil sack rim", "土袋袋口", 470, 615, "lower-storage", "lower-storage-zone"],
    ["soil sack opening", "土袋开口", 475, 640, "lower-storage", "lower-storage-zone"],
    ["soil sack side", "土袋侧面", 430, 680, "lower-storage", "lower-storage-zone"],
    ["bucket side", "桶身侧面", 660, 690, "lower-storage", "lower-storage-zone"],
    ["nursery pot base", "育苗盆底部", 770, 700, "lower-storage", "lower-storage-zone"],
    ["pot stack side", "盆摞侧面", 760, 670, "lower-storage", "lower-storage-zone"],
    ["coir disc surface", "椰糠圆片表面", 980, 680, "lower-storage", "lower-storage-zone"],
    ["coir fiber edge", "椰糠纤维边", 980, 700, "lower-storage", "lower-storage-zone"],
    ["burlap mat fold", "粗麻垫折痕", 1110, 660, "lower-storage", "lower-storage-zone"],
    ["burlap mat edge", "粗麻垫边缘", 1140, 700, "lower-storage", "lower-storage-zone"],
    ["lower shelf board", "下层搁板", 800, 740, "lower-storage", "lower-storage-zone"],
    ["shelf front edge", "搁板前沿", 900, 735, "lower-storage", "lower-storage-zone"],
  ],
  "greenhouse-interior": [
    ["propagation tray rim", "育苗盘边", 300, 430, "propagation-trays", "propagation-area"],
    ["tray divider", "托盘隔格", 360, 435, "propagation-trays", "propagation-area"],
    ["seedling plug", "幼苗穴块", 330, 470, "propagation-trays", "propagation-area"],
    ["seedling stem", "幼苗茎", 460, 420, "propagation-trays", "propagation-area"],
    ["cotyledon", "子叶", 465, 405, "propagation-trays", "propagation-area"],
    ["seedling leaf pair", "幼苗叶对", 490, 410, "propagation-trays", "propagation-area"],
    ["potting mix surface", "盆栽土表面", 350, 455, "propagation-trays", "propagation-area"],
    ["nursery pot rim", "育苗盆边", 348, 458, "propagation-trays", "propagation-area"],
    ["tray drainage hole", "托盘排水孔", 300, 510, "propagation-trays", "propagation-area"],
    ["basil stem", "罗勒茎", 490, 390, "propagation-trays", "propagation-area"],
    ["basil node", "罗勒节", 500, 420, "propagation-trays", "propagation-area"],
    ["terracotta pot rim", "陶盆边", 575, 475, "propagation-trays", "propagation-area"],
  ],
  leaf: [
    ["leaf notch edge", "叶片缺口边", 1490, 330, "chewed-edge", "margin-damage-and-silk"],
    ["leaf tooth", "叶缘齿", 1530, 360, "chewed-edge", "margin-damage-and-silk"],
    ["silk strand junction", "蛛丝交汇", 500, 420, "attached-spider-silk", "margin-damage-and-silk"],
    ["silk anchor point", "蛛丝锚点", 520, 430, "attached-spider-silk", "margin-damage-and-silk"],
    ["water droplet", "水滴", 800, 520, "small-water-beads", "margin-damage-and-silk"],
    ["droplet highlight", "水滴高光", 820, 530, "small-water-beads", "margin-damage-and-silk"],
    ["leaf spot halo", "叶斑晕圈", 880, 520, "leaf-spot", "margin-damage-and-silk"],
    ["leaf spot center", "叶斑中心", 885, 530, "leaf-spot", "margin-damage-and-silk"],
    ["caterpillar bristle", "毛虫刚毛", 1120, 500, "caterpillar-segments", "margin-damage-and-silk"],
    ["caterpillar proleg", "毛虫腹足", 1150, 530, "caterpillar-segments", "margin-damage-and-silk"],
    ["insect egg shell", "昆虫卵壳", 1120, 350, "insect-eggs", "margin-damage-and-silk"],
    ["spider silk bridge", "蛛丝桥", 650, 430, "attached-spider-silk", "margin-damage-and-silk"],
  ],
};

function slugify(word) {
  return word.toLocaleLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

function addSceneLabels(scene, rows) {
  const words = new Set(scene.labels.map((label) => label.word.toLocaleLowerCase()));
  const ids = new Set(scene.labels.map((label) => label.id));
  const regions = new Map((scene.visualRegions ?? []).map((region) => [region.id, region]));
  const zones = new Map((scene.detailZones ?? []).map((zone) => [zone.id, zone]));
  const maxPriority = scene.labels.reduce((max, label) => Math.max(max, label.priority ?? 0), 0);
  let added = 0;

  for (const [word, translation, x, y, regionId, zoneId] of rows) {
    if (words.has(word.toLocaleLowerCase())) continue;
    const region = regions.get(regionId);
    const zone = zones.get(zoneId);
    if (!region) throw new Error(`${scene.id} has no visual region ${regionId}`);
    if (!zone) throw new Error(`${scene.id} has no detail zone ${zoneId}`);
    if (x < region.x || x > region.x + region.width || y < region.y || y > region.y + region.height) {
      throw new Error(`${scene.id}/${word} is outside visual region ${regionId}`);
    }
    if (x < zone.x || x > zone.x + zone.width || y < zone.y || y > zone.y + zone.height) {
      throw new Error(`${scene.id}/${word} is outside detail zone ${zoneId}`);
    }
    const baseId = `${slugify(word)}-focus-${added + 1}`;
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) id = `${baseId}-${suffix++}`;
    scene.labels.push({
      id,
      word,
      translation,
      x,
      y,
      priority: Number((maxPriority + (added + 1) / 1000).toFixed(6)),
      minLevel: 2 + Math.floor(added / 4),
      sourceVisualRegion: regionId,
      semanticRealmId: realmByScene[scene.id],
    });
    zone.labelIds.push(id);
    words.add(word.toLocaleLowerCase());
    ids.add(id);
    added += 1;
  }
  if (added > 0) {
    scene.anchorAudit.previousLabelCount += added;
    scene.anchorAudit.retainedLabelCount = scene.labels.length;
    scene.anchorAudit.rationale = `${scene.anchorAudit.rationale.trim()} The focused detail batch adds ${added} additional pixel-anchored parts inside previously reviewed crops.`;
  }
  return added;
}

async function main() {
  for (const [sceneId, rows] of Object.entries(additions)) {
    const scene = JSON.parse(await readFile(resolve(dataRoot, `${sceneId}.json`), "utf8"));
    const added = addSceneLabels(scene, rows);
    if (!added) {
      console.log(`${sceneId}: already current`);
      continue;
    }
    await writeFile(resolve(dataRoot, `${sceneId}.json`), `${JSON.stringify(scene, null, 2)}\n`, "utf8");
    console.log(`${sceneId}: +${added} focused labels (${scene.labels.length} total)`);
  }
}

await main();
