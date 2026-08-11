import assert from "node:assert/strict";
import test from "node:test";
import {
  BoundedAsyncResourceCache,
  DECODED_SCENE_ASSET_CACHE_LIMIT,
} from "../../app/lib/decoded-scene-asset-cache";

test("scene decode cache shares one in-flight loader and then serves the ready value", async () => {
  const cache = new BoundedAsyncResourceCache<{ readonly id: string }>(2);
  let resolve!: (value: { readonly id: string }) => void;
  let loads = 0;
  const loader = () => {
    loads += 1;
    return new Promise<{ readonly id: string }>((accept) => { resolve = accept; });
  };

  const first = cache.getOrLoad("/atlas-high.jpg", loader);
  const second = cache.getOrLoad("/atlas-high.jpg", loader);
  assert.equal(first.status, "loading");
  assert.equal(second.status, "loading");
  if (first.status !== "loading" || second.status !== "loading") return;
  assert.strictEqual(second.promise, first.promise);
  assert.equal(loads, 0, "loader starts in one shared microtask");
  await Promise.resolve();
  assert.equal(loads, 1);

  const decoded = { id: "atlas" };
  resolve(decoded);
  assert.strictEqual(await first.promise, decoded);
  const ready = cache.getOrLoad("/atlas-high.jpg", loader);
  assert.equal(ready.status, "ready");
  if (ready.status === "ready") assert.strictEqual(ready.value, decoded);
  assert.equal(loads, 1, "a later SceneViewport does not create or decode another image");
});

test("an abandoned consumer cannot cancel or delete another viewport's shared success", async () => {
  const cache = new BoundedAsyncResourceCache<string>(2);
  let finish!: (value: string) => void;
  const abandoned = cache.getOrLoad(
    "/atlas-high.jpg",
    () => new Promise<string>((resolve) => { finish = resolve; }),
  );
  await Promise.resolve();
  const mountedReplacement = cache.getOrLoad(
    "/atlas-high.jpg",
    async () => "must-not-run",
  );
  assert.equal(abandoned.status, "loading");
  assert.equal(mountedReplacement.status, "loading");
  if (abandoned.status !== "loading" || mountedReplacement.status !== "loading") return;
  assert.strictEqual(mountedReplacement.promise, abandoned.promise);

  finish("decoded");
  assert.equal(await mountedReplacement.promise, "decoded");
  assert.deepEqual(cache.peek("/atlas-high.jpg"), { status: "ready", value: "decoded" });
});

test("the strong decoded-image cache has an explicit LRU ceiling and failures remain retryable", async () => {
  assert.equal(DECODED_SCENE_ASSET_CACHE_LIMIT, 2);
  const cache = new BoundedAsyncResourceCache<string>(2);
  const load = (value: string) => async () => value;
  const first = cache.getOrLoad("first", load("one"));
  const second = cache.getOrLoad("second", load("two"));
  if (first.status === "loading") await first.promise;
  if (second.status === "loading") await second.promise;

  cache.getOrLoad("first", load("unused"));
  const third = cache.getOrLoad("third", load("three"));
  if (third.status === "loading") await third.promise;
  assert.equal(cache.size, 2);
  assert.deepEqual(cache.keys(), ["first", "third"]);
  assert.equal(cache.peek("second"), undefined, "least-recently-used strong image is released");

  let attempts = 0;
  const retryable = new BoundedAsyncResourceCache<string>(1);
  const failed = retryable.getOrLoad("high", async () => {
    attempts += 1;
    throw new Error("decode failed");
  });
  assert.equal(failed.status, "loading");
  if (failed.status === "loading") await assert.rejects(failed.promise, /decode failed/);
  assert.equal(retryable.size, 0);
  const retried = retryable.getOrLoad("high", async () => {
    attempts += 1;
    return "decoded";
  });
  assert.equal(retried.status, "loading");
  if (retried.status === "loading") assert.equal(await retried.promise, "decoded");
  assert.equal(attempts, 2);
});
