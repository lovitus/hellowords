#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semanticDir = path.join(root, "public/data/semantic");
const vocabularyDir = path.join(root, "public/data/vocabulary");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const conceptId = (lemma) => `concept-${sha256(Buffer.from(lemma)).slice(0, 16)}`;

export function validateSemanticAtlas() {
  const manifest = readJson(path.join(semanticDir, "manifest.json"));
  const quality = readJson(path.join(semanticDir, "quality-report.json"));
  const vocabularyManifest = readJson(path.join(vocabularyDir, "manifest.json"));
  const vocabulary = new Map();
  for (const shard of vocabularyManifest.shards) {
    for (const entry of readJson(path.join(vocabularyDir, shard.path)).entries) {
      assert(!vocabulary.has(entry.id), `duplicate vocabulary id ${entry.id}`);
      vocabulary.set(entry.id, entry);
    }
  }

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.entryCount, 10_000);
  assert.deepEqual(manifest.world, { x: 0, y: 0, height: 9000, width: 10000 });
  assert.equal(vocabulary.size, 10_000);
  assert(fs.existsSync(path.join(semanticDir, "WORDNET-LICENSE.txt")), "WordNet license is missing");
  assert.match(manifest.semanticSource.sha256, /^[a-f0-9]{64}$/);

  const realmIds = new Set(manifest.realms.map((realm) => realm.id));
  const topicIds = new Set(manifest.topics.map((topic) => topic.id));
  const clusterIds = new Set(manifest.clusters.map((cluster) => cluster.id));
  const subclusters = new Map(manifest.subclusters.map((cluster) => [cluster.id, cluster]));
  assert.equal(realmIds.size, manifest.realms.length, "duplicate realms");
  assert.equal(topicIds.size, manifest.topics.length, "duplicate topics");
  assert.deepEqual(clusterIds, topicIds, "runtime clusters must mirror semantic topics");
  assert(manifest.topics.every((topic) => topic.count > 0), "empty semantic topic");
  assert(manifest.realms.every((realm) => realmIds.has(realm.id) && realm.count > 0));
  for (const topic of manifest.topics) {
    assert(realmIds.has(topic.realmId), `topic ${topic.id} has dangling realm`);
    assert(topic.subclusterIds.every((id) => subclusters.has(id)), `topic ${topic.id} has dangling subcluster`);
  }
  for (const cluster of manifest.clusters) {
    assert.equal(typeof cluster.title, "string");
    assert.equal(typeof cluster.translation, "string");
    assert.match(cluster.color, /^#[0-9a-f]{6}$/i);
    assert(cluster.radius > 0);
  }

  const seenIds = new Set();
  const seenRanks = new Set();
  const seenCoordinates = new Set();
  const methodCounts = new Map();
  const relationCounts = new Map();
  const realmCounts = new Map();
  const topicCounts = new Map();
  const subclusterCounts = new Map();
  const initialTopics = new Map();
  const nodesByWord = new Map();
  const allowedRelations = new Set(manifest.relationTypes);
  let wordNetResolvedCount = 0;

  assert.equal(manifest.shards.length, manifest.topics.length, "one on-demand shard is required per topic");
  for (const descriptor of manifest.shards) {
    const file = path.join(semanticDir, descriptor.path);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.byteLength, descriptor.bytes, `byte count mismatch: ${descriptor.path}`);
    assert.equal(sha256(bytes), descriptor.sha256, `checksum mismatch: ${descriptor.path}`);
    const payload = JSON.parse(bytes);
    assert.equal(payload.schemaVersion, manifest.schemaVersion);
    assert.equal(payload.nodes.length, descriptor.count, `node count mismatch: ${descriptor.path}`);
    assert.deepEqual(descriptor.clusterIds, [payload.topicId]);
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const node of payload.nodes) {
      assert(!seenIds.has(node.id), `duplicate semantic node ${node.id}`);
      seenIds.add(node.id);
      assert(!seenRanks.has(node.rank), `duplicate rank ${node.rank}`);
      seenRanks.add(node.rank);
      const vocabularyEntry = vocabulary.get(node.id);
      assert(vocabularyEntry, `semantic node ${node.id} is not in the vocabulary`);
      assert.equal(node.word, vocabularyEntry.displayWord, `word mismatch for ${node.id}`);
      assert.equal(node.meaning, vocabularyEntry.meaning, `meaning mismatch for ${node.id}`);
      assert.deepEqual(node.partsOfSpeech, vocabularyEntry.partsOfSpeech, `POS mismatch for ${node.id}`);
      assert.equal(node.clusterId, payload.topicId);
      assert(topicIds.has(node.topicId), `dangling topic ${node.topicId}`);
      assert(realmIds.has(node.realmId), `dangling realm ${node.realmId}`);
      assert(subclusters.has(node.subclusterId), `dangling subcluster ${node.subclusterId}`);
      assert(allowedRelations.has(node.relation), `invalid relation ${node.relation}`);
      assert.equal(node.conceptId, conceptId(node.lemma), `invalid concept binding for ${node.word}`);
      assert(node.x >= 0 && node.x < manifest.world.width && node.y >= 0 && node.y < manifest.world.height);
      assert(node.importance >= 0.1 && node.importance <= 1);
      const coordinate = `${node.x},${node.y}`;
      assert(!seenCoordinates.has(coordinate), `duplicate coordinate ${coordinate}`);
      seenCoordinates.add(coordinate);
      if (node.wordnetSynset) {
        wordNetResolvedCount++;
        assert.match(node.wordnetSynset, /^\d{8}-[nvar]$/);
        assert.match(node.wordnetLexname, /^(noun|verb|adj|adv)\./);
      }
      for (const [map, key] of [[methodCounts, node.semanticSource], [relationCounts, node.relation],
        [realmCounts, node.realmId], [topicCounts, node.topicId], [subclusterCounts, node.subclusterId]]) {
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      const initial = node.word[0];
      if (!initialTopics.has(initial)) initialTopics.set(initial, new Set());
      initialTopics.get(initial).add(node.topicId);
      nodesByWord.set(node.word, node);
      bounds.minX = Math.min(bounds.minX, node.x); bounds.minY = Math.min(bounds.minY, node.y);
      bounds.maxX = Math.max(bounds.maxX, node.x); bounds.maxY = Math.max(bounds.maxY, node.y);
    }
    assert.deepEqual(descriptor.bounds, {
      x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX + 1,
      height: bounds.maxY - bounds.minY + 1, ...bounds,
    }, `bounds mismatch: ${descriptor.path}`);
  }

  assert.equal(seenIds.size, 10_000);
  assert.equal(seenRanks.size, 10_000);
  assert.deepEqual(seenIds, new Set(vocabulary.keys()), "not every vocabulary entry is reachable");
  assert.equal(seenCoordinates.size, 10_000);
  assert([..."abcdefghijklmnopqrstuvwxyz"].filter((letter) => (initialTopics.get(letter)?.size ?? 0) >= 10).length >= 24,
    "semantic topics still resemble alphabetical buckets");

  for (const [id, cluster] of subclusters) {
    assert.equal(subclusterCounts.get(id), cluster.count, `subcluster count mismatch ${id}`);
  }
  const objectFrom = (map) => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)));
  assert.deepEqual(quality.assignmentMethods, objectFrom(methodCounts));
  assert.deepEqual(quality.relationCounts, objectFrom(relationCounts));
  assert.deepEqual(quality.realmCounts, objectFrom(realmCounts));
  assert.deepEqual(quality.topicCounts, objectFrom(topicCounts));
  assert.equal(quality.wordNetResolvedCount, wordNetResolvedCount);
  assert.equal(quality.reachableCount, seenIds.size);
  assert.equal(quality.uniqueCoordinateCount, seenCoordinates.size);

  const expectedCases = {
    declined: ["decline", "inflection"], observers: ["observer", "inflection"],
    recommends: ["recommend", "inflection"], paul: ["paul", "proper-name"],
    douglas: ["douglas", "proper-name"], fifa: ["fifa", "abbreviation"], pdf: ["pdf", "abbreviation"],
  };
  for (const [word, [lemma, relation]] of Object.entries(expectedCases)) {
    const node = nodesByWord.get(word);
    assert(node, `quality fixture ${word} is missing`);
    assert.equal(node.lemma, lemma, `${word} has incorrect lemma`);
    assert.equal(node.relation, relation, `${word} has incorrect relation`);
  }
  for (const [word, lemma, relation, topic] of [
    ["b", "b", "abbreviation", "technology-computing"],
    ["his", "his", "function-word", "determiners-pronouns"],
    ["was", "be", "inflection", "states-conditions"],
  ]) {
    const node = nodesByWord.get(word);
    assert.equal(node?.lemma, lemma, `${word} has incorrect lemma`);
    assert.equal(node?.relation, relation, `${word} has incorrect relation`);
    assert.equal(node?.topicId, topic, `${word} has incorrect topic`);
  }

  return {
    entries: seenIds.size,
    realms: realmIds.size,
    topics: topicIds.size,
    subclusters: subclusters.size,
    wordNetCoveragePercent: quality.wordNetCoveragePercent,
    relations: quality.relationCounts,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(validateSemanticAtlas(), null, 2));
}
