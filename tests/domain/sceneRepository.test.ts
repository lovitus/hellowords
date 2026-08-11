import assert from "node:assert/strict";
import test from "node:test";
import {
  getPreparedScene,
  getSceneCacheSnapshot,
  loadScene,
  prepareScene,
  resetSceneRepositoryForTests,
  retainSceneNeighborhood,
} from "../../app/lib/scene-repository";
import type { Scene } from "../../app/domain";

const nativeFetch = globalThis.fetch;
const NativeImage = globalThis.Image;

class FakeImage {
  static instances: FakeImage[] = [];
  static decodeCalls: string[] = [];

  decoding = "auto";
  complete = false;
  naturalWidth = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  private source = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    if (!value) {
      this.complete = false;
      this.naturalWidth = 0;
      return;
    }
    queueMicrotask(() => {
      this.complete = true;
      this.naturalWidth = 1600;
      this.onload?.(new Event("load"));
    });
  }

  decode(): Promise<void> {
    FakeImage.decodeCalls.push(this.source);
    return Promise.resolve();
  }
}

function scene(sceneId: string): Scene {
  return {
    id: sceneId,
    title: sceneId,
    subtitle: sceneId,
    asset: `/scenes/${sceneId}.jpg`,
    width: 1600,
    height: 900,
    parentId: null,
    labels: [],
    portals: [],
  };
}

function installRepositoryFakes() {
  const fetches: string[] = [];
  FakeImage.instances = [];
  FakeImage.decodeCalls = [];
  globalThis.Image = FakeImage as unknown as typeof Image;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    fetches.push(url);
    const match = /\/data\/scenes\/([^/]+)\.json$/.exec(url);
    if (!match) throw new Error(`Unexpected repository request: ${url}`);
    return new Response(JSON.stringify(scene(decodeURIComponent(match[1]))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return fetches;
}

test.beforeEach(() => {
  resetSceneRepositoryForTests();
});

test.after(() => {
  resetSceneRepositoryForTests();
  globalThis.fetch = nativeFetch;
  globalThis.Image = NativeImage;
});

test("the resident cache is exactly current, parent and one preferred child", async () => {
  installRepositoryFakes();
  retainSceneNeighborhood("leaf", "oak-tree", "plant-cell");
  await Promise.all([
    prepareScene("leaf"),
    prepareScene("oak-tree"),
    prepareScene("plant-cell"),
  ]);

  let snapshot = getSceneCacheSnapshot();
  assert.deepEqual(snapshot.residentSceneIds, ["leaf", "oak-tree", "plant-cell"]);
  assert.equal(snapshot.scenes.length, snapshot.limits.scenes);
  assert.equal(snapshot.images.length, snapshot.limits.images);
  assert.ok(snapshot.scenes.every(({ status }) => status === "resolved"));
  assert.ok(snapshot.images.every(({ status, retainedImage }) => (
    status === "resolved" && retainedImage
  )));

  const evictedOakImage = FakeImage.instances.find((image) => image.src.includes("oak-tree"));
  assert.ok(evictedOakImage);
  retainSceneNeighborhood("plant-cell", "leaf", "chloroplast-interior");
  await prepareScene("chloroplast-interior");
  snapshot = getSceneCacheSnapshot();
  assert.deepEqual(snapshot.residentSceneIds, ["plant-cell", "leaf", "chloroplast-interior"]);
  assert.deepEqual(
    snapshot.scenes.map(({ sceneId }) => sceneId).sort(),
    ["chloroplast-interior", "leaf", "plant-cell"],
  );
  assert.ok(snapshot.scenes.length <= snapshot.limits.scenes);
  assert.ok(snapshot.images.length <= snapshot.limits.images);
  assert.equal(
    evictedOakImage.src,
    "",
    "an image outside the new neighborhood releases its decoded buffer",
  );
});

test("returning from a child reuses the parent's decoded Image without network or decode work", async () => {
  const fetches = installRepositoryFakes();
  retainSceneNeighborhood("oak-tree", "city-park", "leaf");
  await prepareScene("oak-tree");
  await prepareScene("leaf");

  retainSceneNeighborhood("leaf", "oak-tree", "plant-cell");
  await prepareScene("plant-cell");
  const fetchCount = fetches.length;
  const decodeCount = FakeImage.decodeCalls.length;
  const parentImage = FakeImage.instances.find((image) => image.src.includes("oak-tree"));
  assert.ok(parentImage, "the parent has a strongly retained decoded Image");

  await prepareScene("oak-tree");
  assert.equal(fetches.length, fetchCount);
  assert.equal(FakeImage.decodeCalls.length, decodeCount);
  assert.equal(parentImage.src, "/scenes/oak-tree.jpg");
  assert.ok(
    getSceneCacheSnapshot().images.some(({ asset, status, retainedImage }) => (
      asset === "/scenes/oak-tree.jpg" && status === "resolved" && retainedImage
    )),
  );
});

test("a decoded neighbor is synchronously available until its neighborhood slot is evicted", async () => {
  installRepositoryFakes();
  retainSceneNeighborhood("oak-tree", "city-park", "leaf");
  assert.equal(getPreparedScene("leaf"), null);

  const leaf = await prepareScene("leaf");
  assert.equal(getPreparedScene("leaf"), leaf);

  retainSceneNeighborhood("oak-tree", "city-park", "root-system");
  assert.equal(getPreparedScene("leaf"), null);
  assert.ok(getSceneCacheSnapshot().scenes.length <= 3);
  assert.ok(getSceneCacheSnapshot().images.length <= 3);
});

test("an evicted speculative child cannot start an orphan artwork decode", async () => {
  installRepositoryFakes();
  let resolveScene: ((response: Response) => void) | undefined;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (!url.endsWith("/first-child.json")) {
      throw new Error(`Unexpected repository request: ${url}`);
    }
    return new Promise<Response>((resolve) => {
      resolveScene = resolve;
    });
  }) as typeof fetch;

  retainSceneNeighborhood("current", "parent", "first-child");
  const stalePrepare = prepareScene("first-child");
  await Promise.resolve();
  assert.ok(resolveScene, "the speculative JSON request has started");

  retainSceneNeighborhood("current", "parent", "second-child");
  resolveScene(new Response(JSON.stringify(scene("first-child")), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  await stalePrepare;

  assert.deepEqual(FakeImage.decodeCalls, []);
  assert.equal(getPreparedScene("first-child"), null);
  const snapshot = getSceneCacheSnapshot();
  assert.ok(snapshot.scenes.length <= snapshot.limits.scenes);
  assert.ok(snapshot.images.length <= snapshot.limits.images);
});

test("continuous prepare signals share one fetch and one image decode", async () => {
  const fetches = installRepositoryFakes();
  retainSceneNeighborhood("oak-tree", "city-park", "leaf");
  const prepared = await Promise.all(
    Array.from({ length: 24 }, () => prepareScene("leaf")),
  );
  assert.ok(prepared.every(({ id }) => id === "leaf"));
  assert.deepEqual(fetches, ["/data/scenes/leaf.json"]);
  assert.deepEqual(FakeImage.decodeCalls, ["/scenes/leaf.jpg"]);
});

test("runtime scene loading rejects malformed optional asset metadata without breaking legacy JSON", async () => {
  installRepositoryFakes();
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ...scene("invalid-assets"),
    assets: {
      base: {
        src: "/scenes/not-the-legacy-base.jpg",
        width: 1600,
        height: 900,
        sha256: "not-a-hash",
      },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  await assert.rejects(
    loadScene("invalid-assets"),
    /assets\.base\.(?:src|sha256)/,
  );
  assert.deepEqual(FakeImage.decodeCalls, []);
});

test("an aborted waiter cannot cancel a shared neighborhood prepare", async () => {
  const fetches = installRepositoryFakes();
  retainSceneNeighborhood("oak-tree", "city-park", "leaf");
  const controller = new AbortController();
  const cancelledWaiter = prepareScene("leaf", controller.signal);
  const survivingWaiter = prepareScene("leaf");
  controller.abort();

  await assert.rejects(cancelledWaiter, (error: unknown) => (
    error instanceof DOMException && error.name === "AbortError"
  ));
  const prepared = await survivingWaiter;
  assert.equal(prepared.id, "leaf");
  assert.deepEqual(fetches, ["/data/scenes/leaf.json"]);
  assert.deepEqual(FakeImage.decodeCalls, ["/scenes/leaf.jpg"]);
  assert.equal(getSceneCacheSnapshot().scenes[0]?.status, "resolved");
});
