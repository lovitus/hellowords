import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Adds a small, pixel-reviewed batch to an existing mega-atlas panel.
 *
 * The source panel batches are the authoring contract for world-map.json;
 * public/data/scenes/world-map.json is regenerated from them by the two
 * atlas compiler commands documented in docs/premium-scene-art.md. Keeping
 * this pass idempotent makes it safe to resume after a failed regeneration.
 */

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "scripts/data/mega-atlas-v21");

const additions = {
  "science.json": [
    {
      id: "science-utility-wall-panel",
      word: "wall panel",
      translation: "墙面板",
      x: 520,
      y: 805,
      lod: 0,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-paving-slab",
      word: "paving slab",
      translation: "铺地板块",
      x: 650,
      y: 910,
      lod: 0,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-drain-grate",
      word: "drain grate",
      translation: "排水格栅",
      x: 713,
      y: 812,
      lod: 1,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-planter-curb",
      word: "planter curb",
      translation: "花坛缘石",
      x: 945,
      y: 873,
      lod: 1,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-tank-base",
      word: "tank base",
      translation: "储罐底座",
      x: 1465,
      y: 880,
      lod: 1,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-fan-housing",
      word: "fan housing",
      translation: "风扇外壳",
      x: 1580,
      y: 830,
      lod: 1,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-pipe-coupling",
      word: "pipe coupling",
      translation: "管道接头",
      x: 1085,
      y: 802,
      lod: 2,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-pipe-bend",
      word: "pipe bend",
      translation: "管道弯曲段",
      x: 1165,
      y: 803,
      lod: 2,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-tank-shoulder",
      word: "tank shoulder",
      translation: "储罐肩部",
      x: 1460,
      y: 810,
      lod: 2,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-pump-base",
      word: "pump base",
      translation: "水泵底座",
      x: 815,
      y: 852,
      lod: 2,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-valve-handle",
      word: "valve handle",
      translation: "阀门手柄",
      x: 1235,
      y: 850,
      lod: 3,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-pump-outlet-pipe",
      word: "pump outlet pipe",
      translation: "水泵出水管",
      x: 815,
      y: 822,
      lod: 3,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-fan-blade",
      word: "fan blade",
      translation: "风扇叶片",
      x: 1583,
      y: 826,
      lod: 4,
      zoneId: "science-utilities",
    },
    {
      id: "science-utility-tank-outlet-collar",
      word: "tank outlet collar",
      translation: "储罐出水口套环",
      x: 1525,
      y: 817,
      lod: 4,
      zoneId: "science-utilities",
    },
  ],
};

function addPanelAnchors(panel, rows) {
  if (!Array.isArray(panel.anchors) || !Array.isArray(panel.zones)) {
    throw new Error(`${panel.panelId ?? "panel"} must contain zones and anchors arrays`);
  }
  const zones = new Map(panel.zones.map((zone) => [zone.id, zone]));
  const words = new Map(panel.anchors.map((anchor) => [anchor.word.toLocaleLowerCase(), anchor]));
  const ids = new Map(panel.anchors.map((anchor) => [anchor.id, anchor]));
  let added = 0;
  for (const row of rows) {
    const existingWord = words.get(row.word.toLocaleLowerCase());
    if (existingWord) {
      if (existingWord.id !== row.id) {
        throw new Error(`word ${row.word} already belongs to ${existingWord.id}`);
      }
      continue;
    }
    const existingId = ids.get(row.id);
    if (existingId) throw new Error(`anchor id ${row.id} already exists with another word`);
    const zone = zones.get(row.zoneId);
    if (!zone) throw new Error(`${panel.panelId}/${row.id} references unknown zone ${row.zoneId}`);
    if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || !Number.isInteger(row.lod) || row.lod < 0 || row.lod > 4) {
      throw new Error(`${panel.panelId}/${row.id} has invalid coordinate or LOD`);
    }
    if (row.x < zone.x || row.x > zone.x + zone.width || row.y < zone.y || row.y > zone.y + zone.height) {
      throw new Error(`${panel.panelId}/${row.id} lies outside ${row.zoneId}`);
    }
    panel.anchors.push({ ...row });
    zone.labelIds.push(row.id);
    words.set(row.word.toLocaleLowerCase(), row);
    ids.set(row.id, row);
    added += 1;
  }
  if (added > 0) {
    const marker = "The reviewed utilities crop adds separately pointable service hatch, paving, drainage, pipe, pump, valve, tank and fan parts.";
    panel.source.review = panel.source.review.includes(marker)
      ? panel.source.review
      : `${panel.source.review.trim()} ${marker}`;
  }
  return added;
}

async function main() {
  for (const [file, rows] of Object.entries(additions)) {
    const path = resolve(dataRoot, file);
    const panel = JSON.parse(await readFile(path, "utf8"));
    const added = addPanelAnchors(panel, rows);
    if (!added) {
      console.log(`${file}: already current`);
      continue;
    }
    await writeFile(path, `${JSON.stringify(panel, null, 2)}\n`, "utf8");
    console.log(`${file}: +${added} reviewed utility anchors`);
  }
}

export { addPanelAnchors, additions };

const isDirectInvocation = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectInvocation) {
  main().catch((error) => {
    console.error(`add-mega-atlas-vocabulary: ${error.message}`);
    process.exitCode = 1;
  });
}
