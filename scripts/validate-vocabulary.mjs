#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_COUNT = 10_000;
const EXPECTED_SHARD_SIZE = 1_000;
const EXPECTED_SOURCES = new Map([
  [
    "wordfreq-3.1.1",
    {
      bytes: 56_834_549,
      license: "CC-BY-SA-4.0",
      sha256:
        "4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473",
    },
  ],
  [
    "ecdict-bc015ed2e24a",
    {
      bytes: 65_933_428,
      license: "MIT",
      sha256:
        "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf",
    },
  ],
]);
const EXPECTED_SOURCE_REFS = [...EXPECTED_SOURCES.keys()];
const EXPECTED_LICENSE_REFS = ["CC-BY-SA-4.0", "MIT-ECDICT"];
const VALID_PARTS_OF_SPEECH = new Set([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "numeral",
  "auxiliary",
  "interjection",
  "abbreviation",
  "phrase",
]);
const CJK_PATTERN = /[\u3400-\u9fff]/u;
const SHARD_PATTERN = /^rank-(\d{5})-(\d{5})\.json$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function equalArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizedWord(value) {
  return value.normalize("NFKC").toLowerCase();
}

function validDisplayWord(value) {
  const characters = [...value];
  if (
    characters.length === 0 ||
    !/^\p{L}$/u.test(characters[0]) ||
    !/^\p{L}$/u.test(characters.at(-1))
  ) {
    return false;
  }
  let previousWasSeparator = false;
  for (const character of characters) {
    if (/^\p{L}$/u.test(character)) {
      previousWasSeparator = false;
    } else if (
      !["'", "’", "-"].includes(character) ||
      previousWasSeparator
    ) {
      return false;
    } else {
      previousWasSeparator = true;
    }
  }
  return true;
}

async function validate() {
  const root = path.resolve(
    process.argv[2] ?? "public/data/vocabulary",
  );
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  invariant(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
  invariant(
    manifest.generatedBy === "scripts/generate-vocabulary.py",
    "unexpected generator identity",
  );
  invariant(
    manifest.entryCount === EXPECTED_COUNT,
    `manifest must declare exactly ${EXPECTED_COUNT} entries`,
  );
  invariant(
    manifest.shardCount === manifest.shards?.length,
    "manifest shardCount does not match shards",
  );
  invariant(
    manifest.shardCount === EXPECTED_COUNT / EXPECTED_SHARD_SIZE,
    "unexpected number of rank shards",
  );
  invariant(
    equalArray(manifest.licenseRefs, EXPECTED_LICENSE_REFS),
    "manifest licenseRefs are missing or reordered",
  );
  invariant(
    Array.isArray(manifest.licenses) && manifest.licenses.length === 2,
    "manifest license records are incomplete",
  );
  const shareAlike = manifest.licenses.find(
    (license) => license.id === "CC-BY-SA-4.0",
  );
  const ecdictLicense = manifest.licenses.find(
    (license) => license.id === "MIT-ECDICT",
  );
  invariant(
    shareAlike?.url === "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC BY-SA license URL is missing",
  );
  invariant(
    ecdictLicense?.notice === "../THIRD_PARTY_NOTICES.md#ecdict",
    "ECDICT notice reference is missing",
  );
  const notice = await readFile(
    path.resolve(root, "../THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  for (const requiredNoticeText of [
    "wordfreq",
    "CC BY-SA 4.0",
    "ECDICT",
    "MIT License",
    EXPECTED_SOURCES.get("wordfreq-3.1.1").sha256,
    EXPECTED_SOURCES.get("ecdict-bc015ed2e24a").sha256,
  ]) {
    invariant(
      notice.includes(requiredNoticeText),
      `third-party notice is missing ${requiredNoticeText}`,
    );
  }
  invariant(
    Array.isArray(manifest.sources) &&
      manifest.sources.length === EXPECTED_SOURCES.size,
    "manifest sources are incomplete",
  );
  for (const source of manifest.sources) {
    const expected = EXPECTED_SOURCES.get(source.id);
    invariant(expected, `unexpected source ${source.id}`);
    invariant(
      source.dataLicense === expected.license,
      `wrong license for ${source.id}`,
    );
    invariant(
      source.artifact?.sha256 === expected.sha256,
      `wrong artifact hash for ${source.id}`,
    );
    invariant(
      source.artifact?.bytes === expected.bytes,
      `invalid artifact byte size for ${source.id}`,
    );
    invariant(
      typeof source.upstream === "string" && source.upstream.startsWith("https://"),
      `missing upstream URL for ${source.id}`,
    );
  }

  const ids = new Set();
  const words = new Set();
  const atlasGroups = new Map();
  const partOfSpeechCounts = new Map();
  let expectedRank = 1;
  let previousSourceRank = 0;
  let previousZipf = Number.POSITIVE_INFINITY;
  let totalBytes = 0;

  for (const [shardIndex, shardReference] of manifest.shards.entries()) {
    invariant(
      typeof shardReference.path === "string" &&
        path.basename(shardReference.path) === shardReference.path,
      `unsafe shard path at index ${shardIndex}`,
    );
    const filenameMatch = SHARD_PATTERN.exec(shardReference.path);
    invariant(filenameMatch, `invalid shard filename ${shardReference.path}`);
    const declaredStart = Number(filenameMatch[1]);
    const declaredEnd = Number(filenameMatch[2]);
    invariant(
      declaredStart === shardReference.rankStart &&
        declaredEnd === shardReference.rankEnd,
      `filename rank range differs for ${shardReference.path}`,
    );
    invariant(
      shardReference.rankStart === expectedRank,
      `rank gap before ${shardReference.path}`,
    );

    const encoded = await readFile(path.join(root, shardReference.path));
    totalBytes += encoded.length;
    invariant(
      encoded.length === shardReference.bytes,
      `byte length mismatch for ${shardReference.path}`,
    );
    invariant(
      sha256(encoded) === shardReference.sha256,
      `SHA-256 mismatch for ${shardReference.path}`,
    );
    const shard = JSON.parse(encoded.toString("utf8"));
    invariant(shard.schemaVersion === 1, `bad schema in ${shardReference.path}`);
    invariant(
      equalArray(shard.sourceRefs, EXPECTED_SOURCE_REFS),
      `bad source refs in ${shardReference.path}`,
    );
    invariant(
      equalArray(shard.licenseRefs, EXPECTED_LICENSE_REFS),
      `bad license refs in ${shardReference.path}`,
    );
    invariant(
      shard.rankBand?.start === shardReference.rankStart &&
        shard.rankBand?.end === shardReference.rankEnd,
      `bad rank band in ${shardReference.path}`,
    );
    invariant(
      Array.isArray(shard.entries) &&
        shard.entries.length === shardReference.count &&
        shard.entries.length === EXPECTED_SHARD_SIZE,
      `bad entry count in ${shardReference.path}`,
    );

    for (const entry of shard.entries) {
      invariant(entry.rank === expectedRank, `rank ${expectedRank} is missing`);
      invariant(
        Number.isInteger(entry.sourceRank) && entry.sourceRank > previousSourceRank,
        `sourceRank is not strictly increasing at rank ${entry.rank}`,
      );
      invariant(
        typeof entry.id === "string" && /^en-[0-9a-f]{16}$/u.test(entry.id),
        `invalid id at rank ${entry.rank}`,
      );
      invariant(!ids.has(entry.id), `duplicate id ${entry.id}`);
      ids.add(entry.id);
      invariant(
        typeof entry.displayWord === "string" && validDisplayWord(entry.displayWord),
        `invalid displayWord at rank ${entry.rank}`,
      );
      const wordKey = normalizedWord(entry.displayWord);
      invariant(!words.has(wordKey), `duplicate display word ${entry.displayWord}`);
      words.add(wordKey);
      invariant(
        typeof entry.meaning === "string" &&
          entry.meaning.length > 0 &&
          entry.meaning.length <= 360 &&
          CJK_PATTERN.test(entry.meaning),
        `invalid Chinese meaning for ${entry.displayWord}`,
      );
      invariant(
        entry.phonetic === null ||
          (typeof entry.phonetic === "string" &&
            entry.phonetic.length > 0 &&
            entry.phonetic.length <= 120),
        `invalid phonetic for ${entry.displayWord}`,
      );
      invariant(
        Number.isFinite(entry.zipf) && entry.zipf > 0 && entry.zipf <= 8,
        `invalid Zipf score for ${entry.displayWord}`,
      );
      invariant(
        entry.zipf <= previousZipf,
        `Zipf scores increase at ${entry.displayWord}`,
      );
      invariant(
        Array.isArray(entry.partsOfSpeech) &&
          new Set(entry.partsOfSpeech).size === entry.partsOfSpeech.length &&
          entry.partsOfSpeech.every((part) => VALID_PARTS_OF_SPEECH.has(part)),
        `invalid partsOfSpeech for ${entry.displayWord}`,
      );
      for (const part of entry.partsOfSpeech) {
        partOfSpeechCounts.set(part, (partOfSpeechCounts.get(part) ?? 0) + 1);
      }
      invariant(
        typeof entry.atlasGroup === "string" &&
          (/^[a-z]$/u.test(entry.atlasGroup) || entry.atlasGroup === "other"),
        `invalid atlasGroup for ${entry.displayWord}`,
      );
      atlasGroups.set(
        entry.atlasGroup,
        (atlasGroups.get(entry.atlasGroup) ?? 0) + 1,
      );
      invariant(
        equalArray(entry.sourceRefs, EXPECTED_SOURCE_REFS),
        `bad entry source refs for ${entry.displayWord}`,
      );
      invariant(
        equalArray(entry.licenseRefs, EXPECTED_LICENSE_REFS),
        `bad entry license refs for ${entry.displayWord}`,
      );
      previousSourceRank = entry.sourceRank;
      previousZipf = entry.zipf;
      expectedRank += 1;
    }
    invariant(
      shardReference.rankEnd === expectedRank - 1,
      `rank end mismatch for ${shardReference.path}`,
    );
    invariant(
      shardReference.sourceRankStart === shard.entries[0].sourceRank &&
        shardReference.sourceRankEnd === shard.entries.at(-1).sourceRank,
      `source rank range mismatch for ${shardReference.path}`,
    );
  }

  invariant(expectedRank - 1 === EXPECTED_COUNT, "validated entry count is wrong");
  invariant(ids.size === EXPECTED_COUNT, "stable IDs are not unique");
  invariant(words.size === EXPECTED_COUNT, "display words are not unique");
  invariant(
    manifest.rankRange?.start === 1 && manifest.rankRange?.end === EXPECTED_COUNT,
    "manifest rankRange is wrong",
  );
  invariant(
    manifest.sourceRankRange?.start === 1 &&
      manifest.sourceRankRange?.end === previousSourceRank,
    "manifest sourceRankRange is wrong",
  );

  console.log(
    JSON.stringify(
      {
        atlasGroups: Object.fromEntries([...atlasGroups].sort()),
        entries: words.size,
        partOfSpeechCounts: Object.fromEntries([...partOfSpeechCounts].sort()),
        shardBytes: totalBytes,
        shards: manifest.shardCount,
        sourceRankEnd: previousSourceRank,
      },
      null,
      2,
    ),
  );
}

validate().catch((error) => {
  console.error(`Vocabulary validation failed: ${error.message}`);
  process.exitCode = 1;
});
