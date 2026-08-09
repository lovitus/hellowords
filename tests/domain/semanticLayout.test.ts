import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CLUSTERS,
  SemanticSpatialIndex,
  inferCluster,
  intersects,
  layoutVocabularyEntry,
  stableHash,
} from "../../app/lib/semantic-repository";

test("semantic layout is deterministic and remains inside its cluster neighborhood", () => {
  const entry = { id: "word-table", displayWord: "table", meaning: "n. 桌子", partsOfSpeech: ["noun"], rank: 944 };
  const first = layoutVocabularyEntry(entry);
  const second = layoutVocabularyEntry(entry);
  assert.deepEqual(first, second);
  assert.equal(first.clusterId, "home");
  const cluster = DEFAULT_CLUSTERS.find((candidate) => candidate.id === first.clusterId)!;
  assert.ok(Math.abs(first.x - cluster.x) <= cluster.radius);
  assert.ok(Math.abs(first.y - cluster.y) <= cluster.radius);
});

test("cluster inference provides meaningful fallbacks for current vocabulary shards", () => {
  assert.equal(inferCluster({ displayWord: "sparrow", meaning: "n. 鸟", partsOfSpeech: ["noun"] }), "nature");
  assert.equal(inferCluster({ displayWord: "whisper", meaning: "v. 说悄悄话", partsOfSpeech: ["verb"] }), "language");
  assert.equal(inferCluster({ displayWord: "quickly", meaning: "adv. 很快", partsOfSpeech: ["adverb"] }), "mind");
});

test("spatial index culls nodes outside the viewport and de-duplicates inserts", () => {
  const index = new SemanticSpatialIndex(100);
  const near = layoutVocabularyEntry({ id: "near", word: "near", meaning: "近", partsOfSpeech: [], rank: 1, clusterId: "time", x: 50, y: 50 });
  const far = layoutVocabularyEntry({ id: "far", word: "far", meaning: "远", partsOfSpeech: [], rank: 2, clusterId: "time", x: 600, y: 600 });
  index.add([near, near, far]);
  assert.deepEqual(index.query({ x: 0, y: 0, width: 100, height: 100 }).map((node) => node.id), ["near"]);
  assert.deepEqual(index.query({ x: 500, y: 500, width: 200, height: 200 }).map((node) => node.id), ["far"]);
});

test("hash and bounds helpers are stable at world edges", () => {
  assert.equal(stableHash("hello"), stableHash("hello"));
  assert.notEqual(stableHash("hello"), stableHash("world"));
  assert.equal(intersects({ x: 0, y: 0, width: 100, height: 100 }, { x: 100, y: 100, width: 20, height: 20 }), true);
  assert.equal(intersects({ x: 0, y: 0, width: 99, height: 99 }, { x: 100, y: 100, width: 20, height: 20 }), false);
});
