import test from "node:test";
import assert from "node:assert/strict";
import { validateSemanticAtlas } from "../../scripts/semantic-validate.mjs";

test("all 10,000 vocabulary entries form a valid semantic atlas", () => {
  const result = validateSemanticAtlas();
  assert.equal(result.entries, 10_000);
  assert(result.realms >= 10);
  assert(result.topics >= 40);
  assert(result.subclusters >= 500);
  assert(result.wordNetCoveragePercent >= 90);
});
