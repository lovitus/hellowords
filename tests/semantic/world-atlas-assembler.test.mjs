import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  assembleWorldAtlas,
  buildReviewedLexemeIndex,
  mergeAtlasBatches,
  runAtlasAssembler,
} from "../../scripts/assemble-world-atlas.mjs";

const BED_LEXEME = "en-4d38e3bec157e2b2";
const projectRoot = resolve(import.meta.dirname, "../..");
const productionBatchRoot = resolve(projectRoot, "scripts/data/world-atlas");

function batches() {
  return [
    {
      path: "home-batch.json",
      data: {
        zones: [{
          id: "home",
          title: "Home rooms",
          translation: "住宅房间",
          description: "Complete apartment rooms and visible furnishings",
          x: 0,
          y: 0,
          width: 800,
          height: 450,
          targetScale: 3,
          labelIds: ["bed", "sofa"],
        }],
        anchors: [
          { id: "sofa", word: "sofa", translation: "沙发", x: 250, y: 300, lod: 2, zoneId: "home" },
          { id: "bed", word: "bed", translation: "床", x: 320, y: 180, lod: 0, zoneId: "home" },
        ],
      },
    },
    {
      path: "nature-batch.json",
      data: {
        zones: [{
          id: "nature",
          title: "Nature park",
          translation: "自然公园",
          description: "Visible oak, wetland and pond-edge wildlife",
          x: 800,
          y: 450,
          width: 800,
          height: 450,
          targetScale: 2.8,
        }],
        anchors: [
          { id: "oak", word: "oak", translation: "橡树", x: 1300, y: 600, lod: 1, zone: "nature", kind: "part" },
          { id: "pond", word: "pond", translation: "池塘", x: 1400, y: 720, lod: 4, zone: "nature" },
        ],
      },
    },
  ];
}

test("atlas assembler deterministically generates complete spatial scene metadata", () => {
  const reviewedLexemes = buildReviewedLexemeIndex([{
    id: "apartment",
    labels: [{ id: "bed", word: "bed", lexemeId: BED_LEXEME }],
  }]);
  const scene = assembleWorldAtlas(batches(), {
    reviewedLexemes,
    semanticLexemes: new Map([[BED_LEXEME, "bed"]]),
  });

  assert.equal(scene.id, "world-map");
  assert.equal(scene.asset, "/scenes/world-atlas-master-1600-v1.jpg");
  assert.equal(scene.assets.base.sha256, "d3d481b6c767f375ff9b3b79a7dfd7cfc29564205c2e9bca76c3acea36ec28cb");
  assert.equal(scene.assets.high.sha256, "e30a3750ef9f609056d288268c6692e7dc6fa8b18ff0d93bf37cf3265f405966");
  assert.deepEqual(scene.labels.map(({ id }) => id), ["bed", "oak", "sofa", "pond"]);
  assert.equal(scene.labels[0].lexemeId, BED_LEXEME);
  assert.deepEqual(scene.labels.map(({ priority }) => priority), [1, 2, 3, 5]);
  assert.deepEqual(scene.detailZones.map(({ id, labelIds }) => ({ id, labelIds })), [
    { id: "home", labelIds: ["bed", "sofa"] },
    { id: "nature", labelIds: ["oak", "pond"] },
  ]);
  assert.equal(scene.portals.length, 4);
  assert.deepEqual(
    scene.portals.map(({ childSceneId, x, y, width, height }) => ({ childSceneId, x, y, width, height })),
    [
      { childSceneId: "apartment", x: 160, y: 45, width: 355, height: 275 },
      { childSceneId: "city-street", x: 965, y: 140, width: 560, height: 280 },
      { childSceneId: "city-park", x: 1080, y: 475, width: 475, height: 380 },
      { childSceneId: "community-garden", x: 80, y: 470, width: 545, height: 325 },
    ],
  );
  const regionById = new Map(scene.visualRegions.map((region) => [region.id, region]));
  for (const label of scene.labels) {
    const region = regionById.get(label.sourceVisualRegion);
    assert.ok(region, `missing region for ${label.id}`);
    assert.ok(label.x >= region.x && label.x <= region.x + region.width);
    assert.ok(label.y >= region.y && label.y <= region.y + region.height);
  }
  assert.deepEqual(scene.anchorAudit.removedExamples, [
    "unverified activity",
    "hidden mechanism",
    "duplicate synonym",
  ]);
  assert.equal(scene.anchorAudit.previousLabelCount, scene.labels.length + 3);
  assert.equal(scene.anchorAudit.retainedLabelCount, scene.labels.length);
  assert.equal(scene.anchorAudit.removedLabelCount, 3);
});

test("atlas assembler accepts incremental reviewed batches without a fixed batch ceiling", () => {
  const thirdBatch = {
    path: "home-details.json",
    data: {
      zones: [],
      anchors: [{
        id: "side-table",
        word: "side table",
        translation: "边桌",
        x: 420,
        y: 300,
        lod: 3,
        zoneId: "home",
      }],
    },
  };
  const merged = mergeAtlasBatches([...batches(), thirdBatch]);
  assert.equal(merged.anchors.length, 5);
  assert.equal(merged.zones.length, 2);
  assert.ok(merged.anchors.some(({ id }) => id === "side-table"));
  assert.throws(() => mergeAtlasBatches([]), /Expected at least one atlas batch/);
});

test("the published 568-anchor atlas is reproducible from its three reviewed source batches", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hellowords-world-atlas-"));
  const output = join(temporaryRoot, "world-map.json");
  try {
    const productionBatchPaths = (await readdir(productionBatchRoot))
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((name) => resolve(productionBatchRoot, name));
    assert.ok(productionBatchPaths.length >= 2, "the atlas retains multiple independently reviewed batches");
    await runAtlasAssembler({
      batchPaths: productionBatchPaths,
      output,
    });
    assert.equal(
      await readFile(output, "utf8"),
      await readFile(resolve(projectRoot, "public/data/scenes/world-map.json"), "utf8"),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("atlas assembler reports cross-batch duplicates and zone containment failures", () => {
  const duplicate = batches();
  duplicate[1].data.anchors[0].word = " BED ";
  assert.throws(
    () => mergeAtlasBatches(duplicate),
    /nature-batch\.json\.anchors\[0\]: duplicate word "BED".*home-batch\.json\.anchors\[1\]/,
  );

  const outside = batches();
  outside[0].data.anchors[0].x = 900;
  assert.throws(
    () => mergeAtlasBatches(outside),
    /home-batch\.json\.anchors\[0\]: point \(900, 300\) is outside zone "home"/,
  );

  const staleZoneList = batches();
  staleZoneList[0].data.zones[0].labelIds = ["bed"];
  assert.throws(
    () => mergeAtlasBatches(staleZoneList),
    /labelIds: does not exactly match anchors assigned to zone "home"; missing sofa/,
  );
});

test("an explicit lexeme id must not contradict reviewed spatial evidence", () => {
  const input = batches();
  input[0].data.anchors[1].lexemeId = "en-0000000000000000";
  const reviewedLexemes = buildReviewedLexemeIndex([{
    id: "apartment",
    labels: [{ id: "bed", word: "bed", lexemeId: BED_LEXEME }],
  }]);
  assert.throws(
    () => assembleWorldAtlas(input, {
      reviewedLexemes,
      semanticLexemes: new Map([
        [BED_LEXEME, "bed"],
        ["en-0000000000000000", "bed"],
      ]),
    }),
    new RegExp(`explicit lexemeId en-0000000000000000 conflicts with reviewed ${BED_LEXEME}`),
  );
});
