import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateLexicalWorld } from "../../scripts/validate-lexical-world.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lexicalDirectory = path.join(root, "public/data/lexical-world");
const semanticDirectory = path.join(root, "public/data/semantic");

function jsonBytes(directory) {
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .reduce((sum, entry) => sum + fs.statSync(path.join(entry.parentPath, entry.name)).size, 0);
}

test("the lexical world reaches all 10,000 words exactly once", () => {
  assert.deepEqual(validateLexicalWorld(), {
    entries: 10_000,
    realms: 10,
    topics: 44,
    subclusters: 704,
    emptySubclusters: 0,
    danglingReferences: 0,
    duplicateReachability: 0,
  });
});

test("navigation previews reject noisy forms and cold-sense samples", () => {
  const nature = JSON.parse(fs.readFileSync(path.join(lexicalDirectory, "realms/nature-life.json"), "utf8"));
  const objects = JSON.parse(fs.readFileSync(path.join(lexicalDirectory, "realms/objects-technology.json"), "utf8"));
  const arts = JSON.parse(fs.readFileSync(path.join(lexicalDirectory, "topics/arts-entertainment.json"), "utf8"));
  const words = (asset) => new Set(asset.previewWords.map(({ word }) => word));

  for (const word of ["human", "annual", "open", "current"]) assert(!words(nature).has(word));
  for (const word of ["went", "s"]) assert(!words(objects).has(word));
  for (const word of ["cnn", "the", "pg"]) assert(!words(arts).has(word));
});

test("degree morphology does not capture unrelated -er words", () => {
  const topicByWord = new Map();
  for (const descriptor of JSON.parse(fs.readFileSync(path.join(semanticDirectory, "manifest.json"), "utf8")).shards) {
    const shard = JSON.parse(fs.readFileSync(path.join(semanticDirectory, descriptor.path), "utf8"));
    for (const node of shard.nodes) topicByWord.set(node.word, node.topicId);
  }

  assert.equal(topicByWord.get("water"), "water-space");
  assert.equal(topicByWord.get("west"), "places");
  assert.equal(topicByWord.get("daughter"), "people-identity");
  assert.equal(topicByWord.get("winter"), "time");
  assert.equal(topicByWord.get("weather"), "earth-weather");
  for (const word of ["better", "best", "closest"]) assert.equal(topicByWord.get(word), "comparison-degree");
});

test("navigation remains lightweight and bilingual", () => {
  const lexicalBytes = jsonBytes(lexicalDirectory);
  const semanticBytes = jsonBytes(semanticDirectory);
  assert(lexicalBytes < 1_000_000, `navigation payload grew to ${lexicalBytes} bytes`);
  assert(lexicalBytes < semanticBytes / 4, "navigation should stay much smaller than duplicated word shards");

  for (const file of fs.readdirSync(path.join(lexicalDirectory, "topics"))) {
    const topic = JSON.parse(fs.readFileSync(path.join(lexicalDirectory, "topics", file), "utf8"));
    for (const subcluster of topic.children) {
      assert(/[\u3400-\u9fff]/u.test(subcluster.labelZh));
      assert(!/[a-z]/iu.test(subcluster.labelZh), `${subcluster.id} has an untranslated Chinese label`);
      assert(subcluster.children.every((child) => typeof child === "string"), `${subcluster.id} duplicated node payloads`);
    }
  }
});
