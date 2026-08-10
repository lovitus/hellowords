import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLexicalLabelBudget,
  computeLexicalVirtualWindow,
  createLexicalWorldRepository,
  isLatestLexicalRequest,
  nextLexicalFocusIndex,
  resolveLexicalInitialFocus,
} from "../../app/lib/lexical-world-repository";

const nativeFetch = globalThis.fetch;

const manifest = {
  schemaVersion: 1,
  id: "lexical-world",
  kind: "overview",
  labelEn: "Lexical world",
  labelZh: "词汇世界",
  count: 10_000,
  childrenCount: 1,
  children: [{
    id: "nature-life",
    kind: "realm",
    labelEn: "Nature & life",
    labelZh: "自然与生命",
    count: 10_000,
    childrenCount: 1,
    path: "/data/lexical-world/realms/nature-life.json",
    previewWords: [{ id: "dog", word: "dog" }],
  }],
  stats: { realms: 10, topics: 44, subclusters: 704, nodes: 10_000 },
  source: { semanticManifest: "/data/semantic/manifest.json" },
};

const realm = {
  ...manifest.children[0],
  children: [{
    id: "animals",
    kind: "topic",
    labelEn: "Animals",
    labelZh: "动物",
    count: 10_000,
    childrenCount: 1,
    path: "/data/lexical-world/topics/animals.json",
    previewWords: [{ id: "dog", word: "dog" }],
    semanticShard: { path: "/data/semantic/topics/animals.json", count: 2, bytes: 200, sha256: "hash" },
  }],
};

const topic = {
  ...realm.children[0],
  children: [{
    id: "animals--carnivore",
    kind: "subcluster",
    labelEn: "Carnivore",
    labelZh: "食肉动物",
    count: 2,
    childrenCount: 2,
    children: ["dog", "wolf"],
    previewWords: [{ id: "dog", word: "dog" }],
    nodeSource: {
      path: "/data/semantic/topics/animals.json",
      collection: "nodes",
      idField: "id",
      match: { field: "subclusterId", value: "animals--carnivore" },
    },
  }],
};

const nodes = [{
  id: "dog",
  word: "dog",
  meaning: "狗",
  phonetic: "dɒg",
  partsOfSpeech: ["noun"],
  rank: 220,
  realmId: "nature-life",
  topicId: "animals",
  subclusterId: "animals--carnivore",
}, {
  id: "wolf",
  word: "wolf",
  meaning: "狼",
  phonetic: "wʊlf",
  partsOfSpeech: ["noun"],
  rank: 930,
  realmId: "nature-life",
  topicId: "animals",
  subclusterId: "animals--carnivore",
}, {
  id: "eagle",
  word: "eagle",
  meaning: "鹰",
  phonetic: null,
  partsOfSpeech: ["noun"],
  rank: 1100,
  realmId: "nature-life",
  topicId: "animals",
  subclusterId: "animals--bird",
}];

function installFetch() {
  const requests: string[] = [];
  const fixtures: Readonly<Record<string, unknown>> = {
    "/data/lexical-world/manifest.json": manifest,
    "/data/lexical-world/realms/nature-life.json": realm,
    "/data/lexical-world/topics/animals.json": topic,
    "/data/semantic/manifest.json": {
      shards: [{ path: "topics/animals.json", clusterIds: ["animals"] }],
    },
    "/data/semantic/topics/animals.json": { nodes },
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    const value = fixtures[url];
    return value
      ? new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("missing", { status: 404 });
  }) as typeof fetch;
  return requests;
}

test.afterEach(() => {
  globalThis.fetch = nativeFetch;
});

test("the navigation contract resolves overview, realm, topic, leaf, and filtered words", async () => {
  const requests = installFetch();
  const repository = createLexicalWorldRepository();
  const overview = await repository.loadManifest();
  assert.equal(overview.count, 10_000);
  assert.equal(overview.stats.subclusters, 704);

  const realmChildren = await repository.loadChildren(overview.children![0]);
  assert.equal(realmChildren[0].semanticShard?.path, "/data/semantic/topics/animals.json");
  const subclusters = await repository.loadChildren(realmChildren[0]);
  assert.equal(subclusters.length, 1);
  assert.deepEqual(subclusters[0].children, [], "leaf node-id strings are not parsed as descriptors");

  const words = await repository.loadWords(subclusters[0]);
  assert.deepEqual(words.map((word) => word.word), ["dog", "wolf"]);
  await repository.loadWords(subclusters[0]);
  assert.equal(
    requests.filter((request) => request === "/data/semantic/topics/animals.json").length,
    1,
    "a semantic shard is shared by every leaf in its topic",
  );
});

test("whole-library search resolves a result back to its complete navigation path", async () => {
  installFetch();
  const repository = createLexicalWorldRepository();
  const matches = await repository.find("dog");
  assert.equal(matches[0]?.word, "dog");
  const path = await repository.resolvePath(matches[0]);
  assert.deepEqual(path.map((level) => level.kind), ["overview", "realm", "topic", "subcluster"]);
  assert.deepEqual(path.map((level) => level.id), ["lexical-world", "nature-life", "animals", "animals--carnivore"]);
});

test("virtual word fields represent every item while respecting desktop and mobile label budgets", () => {
  assert.equal(activeLexicalLabelBudget(1200), 80);
  assert.equal(activeLexicalLabelBudget(390), 40);

  for (const { width, height, cardWidth, rowHeight } of [
    { width: 390, height: 640, cardWidth: 128, rowHeight: 90 },
    { width: 720, height: 640, cardWidth: 168, rowHeight: 90 },
    { width: 1280, height: 640, cardWidth: 168, rowHeight: 90 },
    { width: 1600, height: 990, cardWidth: 168, rowHeight: 90 },
    { width: 1600, height: 990, cardWidth: 214, rowHeight: 144 },
  ]) {
    const budget = activeLexicalLabelBudget(width);
    const atStart = computeLexicalVirtualWindow({
      itemCount: 1_700,
      viewportWidth: width,
      viewportHeight: height,
      scrollTop: 0,
      minimumCardWidth: cardWidth,
      rowHeight,
    });
    const atEnd = computeLexicalVirtualWindow({
      itemCount: 1_700,
      viewportWidth: width,
      viewportHeight: height,
      scrollTop: Math.max(0, atStart.totalHeight - height),
      minimumCardWidth: cardWidth,
      rowHeight,
    });
    assert.ok(atStart.end - atStart.start <= budget);
    assert.ok(atEnd.end - atEnd.start <= budget);
    assert.equal(atEnd.end, 1_700, `the final word remains reachable at ${width}×${height}`);
    const renderedRows = Math.ceil((atEnd.end - atEnd.start) / atEnd.columns);
    assert.equal(
      atEnd.top + renderedRows * atEnd.rowHeight,
      atEnd.totalHeight,
      `the rendered final row reaches the real scroll canvas bottom at ${width}×${height}`,
    );

    const overscrolled = computeLexicalVirtualWindow({
      itemCount: 1_700,
      viewportWidth: width,
      viewportHeight: height,
      scrollTop: Number.MAX_SAFE_INTEGER,
      minimumCardWidth: cardWidth,
      rowHeight,
    });
    assert.deepEqual(
      { start: overscrolled.start, end: overscrolled.end, top: overscrolled.top },
      { start: atEnd.start, end: atEnd.end, top: atEnd.top },
      "overscroll input is clamped to the browser's true maxScroll position",
    );
  }
});

test("an aborted consumer does not poison a shared manifest request", async () => {
  const requests = installFetch();
  const repository = createLexicalWorldRepository();
  const controller = new AbortController();
  const cancelled = repository.loadManifest(controller.signal);
  const surviving = repository.loadManifest();
  controller.abort();
  await assert.rejects(cancelled, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal((await surviving).count, 10_000);
  assert.deepEqual(requests, ["/data/lexical-world/manifest.json"]);
});

test("a newer search can cancel the stale waiter without cancelling shared lexicon hydration", async () => {
  const requests = installFetch();
  const repository = createLexicalWorldRepository();
  const staleController = new AbortController();
  const stale = repository.find("dog", staleController.signal);
  const latest = repository.find("wolf");
  staleController.abort();

  await assert.rejects(stale, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal((await latest)[0]?.word, "wolf");
  assert.equal(
    requests.filter((request) => request === "/data/semantic/topics/animals.json").length,
    1,
    "both search intents share one underlying topic-shard request",
  );
});

test("initial focus avoids mobile keyboards while keyboard and desktop openings stay productive", () => {
  assert.equal(resolveLexicalInitialFocus("auto", 390, false), "dialog");
  assert.equal(resolveLexicalInitialFocus("auto", 1280, true), "search");
  assert.equal(resolveLexicalInitialFocus("search", 390, false), "search");
  assert.equal(resolveLexicalInitialFocus("dialog", 1280, true), "dialog");
});

test("modal focus cycles in both directions and latest request identity rejects stale work", () => {
  assert.equal(nextLexicalFocusIndex(-1, 4, false), 0);
  assert.equal(nextLexicalFocusIndex(-1, 4, true), 3);
  assert.equal(nextLexicalFocusIndex(3, 4, false), 0);
  assert.equal(nextLexicalFocusIndex(0, 4, true), 3);
  assert.equal(nextLexicalFocusIndex(0, 0, false), -1);

  const staleController = new AbortController();
  assert.equal(isLatestLexicalRequest(2, 3, staleController.signal), false);
  assert.equal(isLatestLexicalRequest(3, 3, staleController.signal), true);
  staleController.abort();
  assert.equal(isLatestLexicalRequest(3, 3, staleController.signal), false);
});
