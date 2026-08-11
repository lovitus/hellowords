import assert from "node:assert/strict";
import test from "node:test";
import { findOrphanSceneAssets } from "../../scripts/lib/orphan-scene-assets.mjs";

test("reports only scene assets absent from runtime references", () => {
  const assets = [
    "public/scenes/unused-scene.svg",
    "public/scenes/kitchen.jpg",
    "public/scenes/LICENSE.txt",
  ];
  const references = [
    'const kitchen = "/scenes/kitchen.jpg";',
    '{"asset":"/scenes/another-scene.svg"}',
  ];

  assert.deepEqual(findOrphanSceneAssets(assets, references), [
    "public/scenes/unused-scene.svg",
  ]);
});
