import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { Scene } from "../../app/domain/types";

interface Manifest {
  rootSceneId: string;
  scenes: Array<{ id: string; title: string; parentId: string | null }>;
}

interface VisualRegion {
  id: string;
  description: string;
  kind: "whole" | "object" | "part" | "diagram";
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AuditedScene extends Scene {
  anchorAudit: {
    status: "human-verified";
    policy: "visible-object-or-part-only";
    reviewedAsset: string;
    rationale: string;
    previousLabelCount: number;
    retainedLabelCount: number;
    removedLabelCount: number;
    removedExamples: string[];
  };
  visualRegions: VisualRegion[];
  labels: Array<Scene["labels"][number] & { sourceVisualRegion: string }>;
  portals: Array<Scene["portals"][number] & { sourceVisualRegion: string }>;
}

const projectRoot = resolve(import.meta.dirname, "../..");

async function loadWorld(): Promise<{ manifest: Manifest; scenes: AuditedScene[] }> {
  const dataRoot = resolve(projectRoot, "public/data/scenes");
  const manifest = JSON.parse(await readFile(resolve(dataRoot, "manifest.json"), "utf8")) as Manifest;
  const scenes = await Promise.all(
    manifest.scenes.map(async ({ id }) =>
      JSON.parse(await readFile(resolve(dataRoot, `${id}.json`), "utf8")) as AuditedScene,
    ),
  );
  return { manifest, scenes };
}

test("mature world has three subject branches and six deep, fully reachable paths", async () => {
  const { manifest, scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const root = byId.get(manifest.rootSceneId);
  assert.ok(root);
  assert.equal(root.parentId, null);
  assert.deepEqual(
    root.portals.map((portal) => portal.childSceneId),
    ["apartment", "city-street", "city-park"],
  );

  const reachable = new Set<string>();
  const visit = (id: string) => {
    assert.ok(!reachable.has(id), `cycle or duplicate path at ${id}`);
    reachable.add(id);
    for (const portal of byId.get(id)?.portals ?? []) visit(portal.childSceneId);
  };
  visit(root.id);
  assert.equal(reachable.size, scenes.length);
  assert.equal(scenes.length, 30);

  const expectedPaths = [
    ["world-map", "apartment", "kitchen", "coffee-machine", "water-tank", "polymer"],
    ["world-map", "apartment", "bedroom", "wardrobe-interior", "cotton-shirt"],
    ["world-map", "city-street", "transit-hub", "electric-bus", "battery", "lithium-ion-cell"],
    ["world-map", "city-street", "transit-hub", "railway-platform", "train-carriage", "rail-bogie"],
    ["world-map", "city-street", "science-museum", "human-body", "heart", "blood-cell", "hemoglobin", "oxygen-molecule"],
    ["world-map", "city-park", "oak-tree", "leaf", "plant-cell", "chloroplast-interior"],
  ];
  for (const path of expectedPaths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      assert.ok(
        byId.get(path[index])?.portals.some((portal) => portal.childSceneId === path[index + 1]),
        `missing portal ${path[index]} -> ${path[index + 1]}`,
      );
    }
  }
});

test("every spatial label and portal is traceable to a human-verified visual region", async () => {
  const { scenes } = await loadWorld();
  let retainedTotal = 0;
  let removedTotal = 0;
  for (const scene of scenes) {
    assert.equal(scene.width, 1600, `${scene.id} width`);
    assert.equal(scene.height, 900, `${scene.id} height`);
    assert.equal(scene.anchorAudit.status, "human-verified", `${scene.id} audit status`);
    assert.equal(
      scene.anchorAudit.policy,
      "visible-object-or-part-only",
      `${scene.id} visual-only policy`,
    );
    assert.equal(scene.anchorAudit.reviewedAsset, scene.asset, `${scene.id} reviewed asset`);
    assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length, `${scene.id} retained count`);
    assert.equal(
      scene.anchorAudit.previousLabelCount - scene.anchorAudit.retainedLabelCount,
      scene.anchorAudit.removedLabelCount,
      `${scene.id} audit reconciliation`,
    );
    assert.ok(scene.anchorAudit.rationale.length >= 40, `${scene.id} rationale`);
    assert.ok(scene.anchorAudit.removedExamples.length >= 3, `${scene.id} removed examples`);

    retainedTotal += scene.labels.length;
    removedTotal += scene.anchorAudit.removedLabelCount;
    assert.deepEqual(
      [...new Set(scene.labels.map((label) => label.minLevel))].sort(),
      [0, 1, 2, 3, 4],
      `${scene.id} density bands`,
    );
    assert.equal(
      new Set(scene.labels.map((label) => label.word.toLocaleLowerCase())).size,
      scene.labels.length,
      `${scene.id} unique display terms`,
    );
    const regions = new Map(scene.visualRegions.map((region) => [region.id, region]));
    assert.equal(regions.size, scene.visualRegions.length, `${scene.id} unique visual regions`);
    for (const label of scene.labels) {
      assert.ok(label.translation.trim(), `${scene.id}/${label.id} translation`);
      const region = regions.get(label.sourceVisualRegion);
      assert.ok(region, `${scene.id}/${label.id} source region`);
      assert.ok(label.x >= region.x && label.x <= region.x + region.width, `${scene.id}/${label.id} x`);
      assert.ok(label.y >= region.y && label.y <= region.y + region.height, `${scene.id}/${label.id} y`);
    }
    for (const portal of scene.portals) {
      const region = regions.get(portal.sourceVisualRegion);
      assert.ok(region, `${scene.id}/${portal.id} source region`);
      assert.ok(portal.x >= region.x && portal.y >= region.y, `${scene.id}/${portal.id} origin`);
      assert.ok(
        portal.x + portal.width <= region.x + region.width &&
          portal.y + portal.height <= region.y + region.height,
        `${scene.id}/${portal.id} rectangle`,
      );
    }
  }
  assert.ok(removedTotal > retainedTotal, "quality audit removes more unsupported labels than it retains");
});

test("known floating-label regressions stay removed and critical portals match visible objects", async () => {
  const { scenes } = await loadWorld();
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));

  const forbidden: Record<string, string[]> = {
    "city-park": [
      "sprinkler",
      "barbecue",
      "rabbit",
      "skateboarding",
      "drinking fountain",
      "bird feeder",
      "walking trail",
      "fallen leaves",
    ],
    kitchen: ["boiling", "recipe", "chef knife", "whisk"],
    bedroom: ["sleep", "dream", "cozy", "alarm clock"],
    polymer: ["thermoplastic", "polymerization", "molecular weight"],
    "oxygen-molecule": ["combustion", "oxidation", "hypoxia"],
    frog: ["jump", "hibernate", "food chain"],
  };
  for (const [sceneId, terms] of Object.entries(forbidden)) {
    const words = new Set(byId.get(sceneId)?.labels.map((label) => label.word.toLocaleLowerCase()));
    for (const term of terms) assert.ok(!words.has(term), `${sceneId} cross-topic filler: ${term}`);
  }

  const cityPark = byId.get("city-park");
  assert.ok(cityPark);
  assert.deepEqual(
    cityPark.portals.map(({ id, x, y, width, height }) => [id, x, y, width, height]),
    [
      ["enter-oak-tree", 650, 0, 900, 710],
      ["enter-pond-edge", 0, 560, 500, 340],
    ],
  );

  const cityStreet = byId.get("city-street");
  assert.ok(cityStreet);
  assert.equal(cityStreet.asset, "/scenes/city-street-museum-v2.jpg");
  const streetWords = new Set(cityStreet.labels.map((label) => label.word));
  for (const visibleMuseumTerm of ["science museum", "atom symbol", "telescope", "skeleton"]) {
    assert.ok(streetWords.has(visibleMuseumTerm), `city street shows ${visibleMuseumTerm}`);
  }
  assert.deepEqual(
    cityStreet.portals.find((portal) => portal.id === "enter-science-museum"),
    {
      id: "enter-science-museum",
      label: "Enter the science museum",
      translation: "进入科学馆",
      childSceneId: "science-museum",
      x: 0,
      y: 0,
      width: 285,
      height: 660,
      enterScale: 3.6,
      sourceVisualRegion: "portal-museum",
    },
  );

  assert.equal(
    byId.get("heart")?.labels.find((label) => label.word === "chamber")?.translation,
    "心腔",
  );
});

test("every scene uses a real, accessible external visual asset", async () => {
  const { scenes } = await loadWorld();
  assert.equal(new Set(scenes.map((scene) => scene.asset)).size, scenes.length, "each semantic slice has its own visual");
  for (const scene of scenes) {
    const assetPath = resolve(projectRoot, "public", scene.asset.replace(/^\//, ""));
    const bytes = await readFile(assetPath);
    assert.ok(bytes.byteLength > 1_000, `${scene.id} asset is unexpectedly empty`);
    if (scene.asset.endsWith(".svg")) {
      const source = bytes.toString("utf8");
      assert.match(source, /<title[ >]/, `${scene.id} accessible title`);
      assert.match(source, /<desc[ >]/, `${scene.id} accessible description`);
      assert.ok(source.includes('viewBox="0 0 1600 900"'), `${scene.id} coordinate system`);
    } else {
      assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${scene.id} JPEG signature`);
    }
  }
});
