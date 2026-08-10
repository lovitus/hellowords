import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceLabelDwell,
  labelDiscoveryKey,
  parseDiscoveredEntries,
  recordDiscoveredLabels,
  serializeDiscoveredEntries,
} from "../../app/domain";

test("legacy word arrays remain readable and migrate without inflating the count", () => {
  const legacy = parseDiscoveredEntries('["Oak", "branch", "branch", 7]');
  assert.deepEqual([...legacy].sort(), ["branch", "oak"]);

  const migrated = recordDiscoveredLabels(legacy, [
    { id: "oak", word: "oak" },
  ]);
  assert.deepEqual([...migrated].sort(), ["branch", "label:oak"]);
  assert.equal(migrated.size, legacy.size);
  assert.deepEqual(
    parseDiscoveredEntries(serializeDiscoveredEntries(migrated)),
    migrated,
  );
  assert.equal(labelDiscoveryKey({ id: "oak" }), "label:oak");
  assert.equal(labelDiscoveryKey({ id: "oak", lexemeId: "tree-oak" }), "lexeme:tree-oak");
});

test("continuous visibility reports a label only after the dwell gate", () => {
  const started = advanceLabelDwell(new Map(), ["oak", "branch"], new Set(), 1_000);
  assert.deepEqual(started.newlyEncounteredIds, []);
  assert.equal(started.nextCheckInMs, 600);

  const early = advanceLabelDwell(started.visibleSince, ["oak", "branch"], new Set(), 1_599);
  assert.deepEqual(early.newlyEncounteredIds, []);
  assert.equal(early.nextCheckInMs, 1);

  const settled = advanceLabelDwell(early.visibleSince, ["oak", "branch"], new Set(), 1_600);
  assert.deepEqual([...settled.newlyEncounteredIds].sort(), ["branch", "oak"]);
  assert.equal(settled.nextCheckInMs, null);
  assert.equal(settled.visibleSince.size, 0);
});

test("leaving the viewport resets partial dwell and reported labels stay silent", () => {
  const started = advanceLabelDwell(new Map(), ["oak"], new Set(), 100);
  const left = advanceLabelDwell(started.visibleSince, [], new Set(), 500);
  assert.equal(left.visibleSince.size, 0);

  const returned = advanceLabelDwell(left.visibleSince, ["oak"], new Set(), 550);
  const notYet = advanceLabelDwell(returned.visibleSince, ["oak"], new Set(), 700);
  assert.deepEqual(notYet.newlyEncounteredIds, []);

  const reported = advanceLabelDwell(notYet.visibleSince, ["oak"], new Set(["oak"]), 2_000);
  assert.deepEqual(reported.newlyEncounteredIds, []);
  assert.equal(reported.visibleSince.size, 0);
});
