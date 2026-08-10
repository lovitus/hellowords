#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semanticDirectory = path.join(root, "public/data/semantic");
const lexicalDirectory = path.join(root, "public/data/lexical-world");
const LEXICAL_URL_PREFIX = "/data/lexical-world/";
const FROZEN_REALM_COUNT = 10;
const FROZEN_TOPIC_COUNT = 44;
const FROZEN_SUBCLUSTER_COUNT = 704;
const FROZEN_SUBCLUSTER_ID_SHA256 = "0be73ef86c725d5782f689c802c506fb17f1a155a6adec8c6c3a2c8dca7ec00e";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const compareNodes = (left, right) => left.rank - right.rank || left.id.localeCompare(right.id);

function urlToFile(url, prefix, directory) {
  assert.equal(typeof url, "string");
  assert(url.startsWith(prefix), `invalid data URL ${url}`);
  const relativePath = url.slice(prefix.length);
  assert(relativePath.length > 0 && !relativePath.includes(".."), `unsafe data URL ${url}`);
  return path.join(directory, relativePath);
}

function assertNavigationNode(node, expectedKind, context) {
  assert.equal(node.kind, expectedKind, `${context}: wrong kind`);
  assert.match(node.id, /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/, `${context}: unstable id`);
  assert.equal(typeof node.labelEn, "string", `${context}: missing English label`);
  assert(node.labelEn.trim().length > 0, `${context}: empty English label`);
  assert.equal(typeof node.labelZh, "string", `${context}: missing Chinese label`);
  assert(/[\u3400-\u9fff]/u.test(node.labelZh), `${context}: Chinese label is not localized`);
  assert(Number.isSafeInteger(node.count) && node.count >= 0, `${context}: invalid count`);
  assert(Number.isSafeInteger(node.childrenCount) && node.childrenCount >= 0, `${context}: invalid childrenCount`);
  assert(Array.isArray(node.previewWords), `${context}: previewWords must be an array`);
}

function assertSource(source, expected, context) {
  assert.deepEqual(source, expected, `${context}: semantic source drift`);
}

function assertPreviewWords(previewWords, allowedIds, semanticNodeById, context) {
  const previewIds = new Set();
  for (const preview of previewWords) {
    assert.deepEqual(Object.keys(preview), ["id", "word"], `${context}: preview must only duplicate id and display word`);
    assert(!previewIds.has(preview.id), `${context}: duplicate preview ${preview.id}`);
    previewIds.add(preview.id);
    assert(allowedIds.has(preview.id), `${context}: preview ${preview.id} is outside this branch`);
    const sourceNode = semanticNodeById.get(preview.id);
    assert(sourceNode, `${context}: dangling preview ${preview.id}`);
    assert.equal(preview.word, sourceNode.word, `${context}: preview word mismatch ${preview.id}`);
  }
}

function assertRepresentativePreviewWords(previewWords, allowedIds, semanticNodeById, context) {
  assertPreviewWords(previewWords, allowedIds, semanticNodeById, context);
  for (const preview of previewWords) {
    const sourceNode = semanticNodeById.get(preview.id);
    const allowFunctionWords = sourceNode.realmId === "grammar-relations";
    const acceptedRelation = sourceNode.relation === "concept"
      || (allowFunctionWords && sourceNode.relation === "function-word");
    const canonicalLemma = sourceNode.word.trim().toLowerCase() === sourceNode.lemma.trim().toLowerCase();
    const hasPartOfSpeech = Array.isArray(sourceNode.partsOfSpeech) && sourceNode.partsOfSpeech.length > 0;
    const readableLength = sourceNode.word.trim().length >= 2 || allowFunctionWords;
    assert(acceptedRelation && canonicalLemma && hasPartOfSpeech && readableLength,
      `${context}: ${sourceNode.word} is not a representative navigation preview`);
  }
}

function comparableLink(asset) {
  return {
    id: asset.id,
    kind: asset.kind,
    labelEn: asset.labelEn,
    labelZh: asset.labelZh,
    color: asset.color,
    count: asset.count,
    childrenCount: asset.childrenCount,
    previewWords: asset.previewWords,
  };
}

export function validateLexicalWorld() {
  const semanticBytes = fs.readFileSync(path.join(semanticDirectory, "manifest.json"));
  const semantic = JSON.parse(semanticBytes);
  const lexical = readJson(path.join(lexicalDirectory, "manifest.json"));
  const expectedSource = {
    semanticManifest: "/data/semantic/manifest.json",
    semanticManifestSha256: sha256(semanticBytes),
    semanticSchemaVersion: semantic.schemaVersion,
  };
  const subclusterIdBytes = semantic.subclusters.map(({ id }) => id).sort().join("\n");
  assert.equal(semantic.realms.length, FROZEN_REALM_COUNT, "realm product contract drift");
  assert.equal(semantic.topics.length, FROZEN_TOPIC_COUNT, "topic product contract drift");
  assert.equal(semantic.subclusters.length, FROZEN_SUBCLUSTER_COUNT, "subcluster product contract drift");
  assert(semantic.subclusters.every(({ count }) => count > 0), "frozen subclusters must remain non-empty");
  assert.equal(sha256(subclusterIdBytes), FROZEN_SUBCLUSTER_ID_SHA256, "stable subcluster ID set drift");

  assert.equal(lexical.schemaVersion, 1);
  assert.equal(lexical.generatedBy, "scripts/generate-lexical-world.mjs");
  assertNavigationNode(lexical, "overview", "overview");
  assert.equal(lexical.id, "lexical-world");
  assert.equal(lexical.entryCount, semantic.entryCount);
  assert.equal(lexical.count, semantic.entryCount);
  assert.equal(lexical.childrenCount, lexical.children.length);
  assertSource(lexical.source, expectedSource, "overview");
  assert.deepEqual(lexical.stats, {
    realms: semantic.realms.length,
    topics: semantic.topics.length,
    subclusters: semantic.subclusters.length,
    nodes: semantic.entryCount,
    emptySubclusters: semantic.subclusters.filter((subcluster) => subcluster.count === 0).length,
  });

  const semanticRealmById = new Map(semantic.realms.map((realm) => [realm.id, realm]));
  const semanticTopicById = new Map(semantic.topics.map((topic) => [topic.id, topic]));
  const semanticSubclusterById = new Map(semantic.subclusters.map((subcluster) => [subcluster.id, subcluster]));
  const semanticShardByTopic = new Map(semantic.shards.map((shard) => [shard.clusterIds[0], shard]));
  const semanticNodeById = new Map();
  const semanticNodesByTopic = new Map();

  for (const descriptor of semantic.shards) {
    const shardFile = path.join(semanticDirectory, descriptor.path);
    const bytes = fs.readFileSync(shardFile);
    assert.equal(bytes.byteLength, descriptor.bytes, `semantic byte drift ${descriptor.path}`);
    assert.equal(sha256(bytes), descriptor.sha256, `semantic checksum drift ${descriptor.path}`);
    const payload = JSON.parse(bytes);
    const nodes = [...payload.nodes].sort(compareNodes);
    assert.equal(nodes.length, descriptor.count, `semantic count drift ${descriptor.path}`);
    semanticNodesByTopic.set(payload.topicId, nodes);
    for (const node of nodes) {
      assert(!semanticNodeById.has(node.id), `duplicate source node ${node.id}`);
      semanticNodeById.set(node.id, node);
    }
  }
  assert.equal(semanticNodeById.size, semantic.entryCount, "semantic source is not complete");

  assert.deepEqual(lexical.children.map((child) => child.id), semantic.realms.map((realm) => realm.id), "realm order or membership drift");
  assert.equal(lexical.children.length, semanticRealmById.size);

  const seenRealms = new Set();
  const seenTopics = new Set();
  const seenSubclusters = new Set();
  const reachableNodeIds = new Set();
  let topicCountTotal = 0;
  let subclusterCountTotal = 0;
  let emptySubclusters = 0;

  const allSourceIds = new Set(semanticNodeById.keys());
  assertRepresentativePreviewWords(lexical.previewWords, allSourceIds, semanticNodeById, "overview");
  const realmPreviewIds = new Set(lexical.children.flatMap((child) => child.previewWords.map(({ id }) => id)));
  assert(lexical.previewWords.every(({ id }) => realmPreviewIds.has(id)), "overview previews must be sampled from realm previews");

  for (const realmLink of lexical.children) {
    assertNavigationNode(realmLink, "realm", `realm link ${realmLink.id}`);
    assert(!seenRealms.has(realmLink.id), `duplicate realm ${realmLink.id}`);
    seenRealms.add(realmLink.id);
    const sourceRealm = semanticRealmById.get(realmLink.id);
    assert(sourceRealm, `dangling realm ${realmLink.id}`);
    assert.equal(realmLink.path, `/data/lexical-world/realms/${realmLink.id}.json`);

    const realm = readJson(urlToFile(realmLink.path, LEXICAL_URL_PREFIX, lexicalDirectory));
    assert.equal(realm.schemaVersion, lexical.schemaVersion);
    assertNavigationNode(realm, "realm", `realm ${realm.id}`);
    assert.deepEqual({ ...comparableLink(realmLink), path: realmLink.path }, { ...comparableLink(realm), path: realmLink.path });
    assert.equal(realm.parentId, lexical.id);
    assert.equal(realm.parentPath, "/data/lexical-world/manifest.json");
    assert.equal(realm.childrenCount, realm.children.length);
    assert.deepEqual(realm.children.map((child) => child.id), sourceRealm.topicIds, `topic membership drift ${realm.id}`);
    assertSource(realm.source, expectedSource, `realm ${realm.id}`);

    const realmNodeIds = new Set(sourceRealm.topicIds.flatMap((id) => semanticNodesByTopic.get(id).map((node) => node.id)));
    assertRepresentativePreviewWords(realm.previewWords, realmNodeIds, semanticNodeById, `realm ${realm.id}`);
    const topicPreviewIds = new Set(realm.children.flatMap((child) => child.previewWords.map(({ id }) => id)));
    assert(realm.previewWords.every(({ id }) => topicPreviewIds.has(id)), `realm ${realm.id} previews must be sampled from topic previews`);
    let realmCount = 0;

    for (const topicLink of realm.children) {
      assertNavigationNode(topicLink, "topic", `topic link ${topicLink.id}`);
      assert(!seenTopics.has(topicLink.id), `duplicate or multiply reachable topic ${topicLink.id}`);
      seenTopics.add(topicLink.id);
      const sourceTopic = semanticTopicById.get(topicLink.id);
      assert(sourceTopic, `dangling topic ${topicLink.id}`);
      assert.equal(sourceTopic.realmId, realm.id, `wrong parent for topic ${topicLink.id}`);
      assert.equal(topicLink.path, `/data/lexical-world/topics/${topicLink.id}.json`);
      const sourceShard = semanticShardByTopic.get(topicLink.id);
      const expectedShard = {
        path: `/data/semantic/${sourceShard.path}`,
        count: sourceShard.count,
        bytes: sourceShard.bytes,
        sha256: sourceShard.sha256,
      };
      assert.deepEqual(topicLink.semanticShard, expectedShard, `topic link must reference its semantic shard ${topicLink.id}`);

      const topic = readJson(urlToFile(topicLink.path, LEXICAL_URL_PREFIX, lexicalDirectory));
      assert.equal(topic.schemaVersion, lexical.schemaVersion);
      assertNavigationNode(topic, "topic", `topic ${topic.id}`);
      assert.deepEqual({ ...comparableLink(topicLink), path: topicLink.path, semanticShard: topicLink.semanticShard },
        { ...comparableLink(topic), path: topicLink.path, semanticShard: topic.semanticShard });
      assert.equal(topic.parentId, realm.id);
      assert.equal(topic.parentPath, realmLink.path);
      assert.equal(topic.childrenCount, topic.children.length);
      assert.deepEqual(topic.children.map((child) => child.id), sourceTopic.subclusterIds, `subcluster membership drift ${topic.id}`);
      assert.deepEqual(topic.semanticShard, expectedShard);
      assertSource(topic.source, expectedSource, `topic ${topic.id}`);

      const topicNodes = semanticNodesByTopic.get(topic.id);
      const topicNodeIds = new Set(topicNodes.map((node) => node.id));
      assertRepresentativePreviewWords(topic.previewWords, topicNodeIds, semanticNodeById, `topic ${topic.id}`);
      let topicCount = 0;

      for (const subcluster of topic.children) {
        assertNavigationNode(subcluster, "subcluster", `subcluster ${subcluster.id}`);
        assert(!seenSubclusters.has(subcluster.id), `duplicate or multiply reachable subcluster ${subcluster.id}`);
        seenSubclusters.add(subcluster.id);
        const sourceSubcluster = semanticSubclusterById.get(subcluster.id);
        assert(sourceSubcluster, `dangling subcluster ${subcluster.id}`);
        assert.equal(sourceSubcluster.topicId, topic.id, `wrong parent for subcluster ${subcluster.id}`);
        assert.equal(subcluster.childrenCount, subcluster.children.length);
        assert.equal(subcluster.count, subcluster.children.length);
        assert.equal(subcluster.count, sourceSubcluster.count);
        assert.equal(subcluster.empty, subcluster.count === 0, `dishonest empty marker ${subcluster.id}`);
        if (subcluster.empty) emptySubclusters += 1;
        assert.deepEqual(subcluster.nodeSource, {
          path: expectedShard.path,
          collection: "nodes",
          idField: "id",
          match: { field: "subclusterId", value: subcluster.id },
        }, `invalid leaf query ${subcluster.id}`);

        const expectedNodes = topicNodes.filter((node) => node.subclusterId === subcluster.id).sort(compareNodes);
        assert.deepEqual(subcluster.children, expectedNodes.map((node) => node.id), `leaf references drift ${subcluster.id}`);
        const leafIds = new Set(subcluster.children);
        assert.equal(leafIds.size, subcluster.children.length, `duplicate node inside ${subcluster.id}`);
        assertPreviewWords(subcluster.previewWords, leafIds, semanticNodeById, `subcluster ${subcluster.id}`);
        for (const id of subcluster.children) {
          assert.equal(typeof id, "string", `leaf children must be id references, not duplicated word data: ${subcluster.id}`);
          assert(!reachableNodeIds.has(id), `semantic node is reachable more than once: ${id}`);
          assert(semanticNodeById.has(id), `dangling semantic node reference: ${id}`);
          reachableNodeIds.add(id);
        }
        topicCount += subcluster.count;
        subclusterCountTotal += subcluster.count;
      }

      assert.equal(topicCount, topic.count, `subcluster counts do not close for ${topic.id}`);
      assert.equal(topic.count, topicNodes.length, `semantic shard count does not close for ${topic.id}`);
      realmCount += topic.count;
      topicCountTotal += topic.count;
    }

    assert.equal(realmCount, realm.count, `topic counts do not close for ${realm.id}`);
    assert.equal(realm.count, sourceRealm.count, `realm source count drift ${realm.id}`);
  }

  assert.equal(seenRealms.size, semantic.realms.length);
  assert.equal(seenTopics.size, semantic.topics.length);
  assert.equal(seenSubclusters.size, semantic.subclusters.length);
  assert.equal(reachableNodeIds.size, semantic.entryCount);
  assert.deepEqual(reachableNodeIds, allSourceIds, "not every semantic node is reachable exactly once");
  assert.equal(topicCountTotal, lexical.count, "realm/topic counts do not close at overview");
  assert.equal(subclusterCountTotal, lexical.count, "leaf counts do not close at overview");
  assert.equal(emptySubclusters, lexical.stats.emptySubclusters);

  return {
    entries: reachableNodeIds.size,
    realms: seenRealms.size,
    topics: seenTopics.size,
    subclusters: seenSubclusters.size,
    emptySubclusters,
    danglingReferences: 0,
    duplicateReachability: 0,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(validateLexicalWorld(), null, 2));
}
