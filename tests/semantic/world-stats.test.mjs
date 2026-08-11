import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { collectWorldStats } from "../../scripts/lib/world-stats.mjs";

test("world statistics reconcile scenes, portals, assets, anchors and detail zones", async () => {
  const stats = await collectWorldStats(resolve(import.meta.dirname, "../.."));
  assert.equal(stats.rasterScenes + stats.svgScenes, stats.scenes);
  assert.equal(stats.portals, stats.scenes - 1, "the authored spatial world remains a strict tree");
  assert.ok(stats.anchors >= stats.distinctTerms);
  assert.ok(stats.detailZones <= stats.anchors);
  assert.ok(stats.linkedAnchors <= stats.anchors);
});
