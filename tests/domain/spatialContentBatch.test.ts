import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");

interface PanelLabel {
  readonly id: string;
  readonly word: string;
  readonly x: number;
  readonly y: number;
  readonly lod: number;
  readonly zoneId: string;
}

interface SceneLabel {
  readonly id: string;
  readonly word: string;
  readonly x: number;
  readonly y: number;
  readonly minLevel: number;
}

interface DetailZone {
  readonly id: string;
  readonly labelIds: readonly string[];
}

interface SceneAudit {
  readonly retainedLabelCount: number;
}

interface SceneDocument {
  readonly labels: readonly SceneLabel[];
  readonly detailZones: readonly DetailZone[];
  readonly anchorAudit: SceneAudit;
}

interface PanelDocument {
  readonly anchors: readonly PanelLabel[];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(projectRoot, path), "utf8")) as T;
}

test("the leaf detail batch keeps its nine new parts on reviewed pixels", async () => {
  const scene = await readJson<SceneDocument>("public/data/scenes/leaf.json");
  const expected = [
    ["ladybird-pronotum-focus-1", "ladybird pronotum", 700, 258, 2],
    ["ladybird-antenna-focus-2", "ladybird antenna", 718, 252, 2],
    ["aphid-antenna-focus-3", "aphid antenna", 884, 178, 2],
    ["aphid-leg-focus-4", "aphid leg", 875, 208, 2],
    ["caterpillar-spiracle-focus-5", "caterpillar spiracle", 1160, 520, 3],
    ["caterpillar-tail-focus-6", "caterpillar tail", 1270, 548, 3],
    ["acorn-tip-focus-7", "acorn tip", 165, 875, 3],
    ["bud-base-focus-8", "bud base", 285, 410, 3],
    ["gall-ridge-focus-9", "gall ridge", 500, 630, 4],
  ] as const;
  const labels = new Map(scene.labels.map((label) => [label.id, label]));
  for (const [id, word, x, y, minLevel] of expected) {
    const label = labels.get(id);
    assert.ok(label, `leaf keeps ${word}`);
    assert.equal(label.word, word);
    assert.deepEqual([label.x, label.y, label.minLevel], [x, y, minLevel]);
  }
  assert.equal(scene.labels.length, 130);
  assert.equal(scene.anchorAudit.retainedLabelCount, 130);
});

test("the science utilities batch is retained in the panel source and atlas output", async () => {
  const panel = await readJson<PanelDocument>("scripts/data/mega-atlas-v21/science.json");
  const atlas = await readJson<SceneDocument>("public/data/scenes/world-map.json");
  const expected = [
    ["science-utility-wall-panel", "wall panel", 520, 805, 0],
    ["science-utility-paving-slab", "paving slab", 650, 910, 0],
    ["science-utility-drain-grate", "drain grate", 713, 812, 1],
    ["science-utility-planter-curb", "planter curb", 945, 873, 1],
    ["science-utility-tank-base", "tank base", 1465, 880, 1],
    ["science-utility-fan-housing", "fan housing", 1580, 830, 1],
    ["science-utility-pipe-coupling", "pipe coupling", 1085, 802, 2],
    ["science-utility-pipe-bend", "pipe bend", 1165, 803, 2],
    ["science-utility-tank-shoulder", "tank shoulder", 1460, 810, 2],
    ["science-utility-pump-base", "pump base", 815, 852, 2],
    ["science-utility-valve-handle", "valve handle", 1235, 850, 3],
    ["science-utility-pump-outlet-pipe", "pump outlet pipe", 815, 822, 3],
    ["science-utility-fan-blade", "fan blade", 1583, 826, 4],
    ["science-utility-tank-outlet-collar", "tank outlet collar", 1525, 817, 4],
  ] as const;
  const panelLabels = new Map(panel.anchors.map((anchor) => [anchor.id, anchor]));
  const atlasLabels = new Map(atlas.labels.map((label) => [label.id, label]));
  for (const [id, word, x, y, lod] of expected) {
    const panelLabel = panelLabels.get(id);
    assert.ok(panelLabel, `panel keeps ${word}`);
    assert.deepEqual(
      [panelLabel.word, panelLabel.x, panelLabel.y, panelLabel.lod, panelLabel.zoneId],
      [word, x, y, lod, "science-utilities"],
    );
    const atlasLabel = atlasLabels.get(id);
    assert.ok(atlasLabel, `atlas keeps ${word}`);
    assert.equal(atlasLabel.word, word);
    assert.deepEqual([atlasLabel.x, atlasLabel.y, atlasLabel.minLevel], [884 + x / 2, y / 2, lod]);
  }
  const zone = atlas.detailZones.find((candidate) => candidate.id === "science-utilities");
  assert.ok(zone);
  assert.equal(zone.labelIds.filter((id) => id.startsWith("science-utility-")).length, 14);
  assert.equal(atlas.labels.length, 1289);
  assert.equal(atlas.anchorAudit.retainedLabelCount, 1289);
});
