import assert from "node:assert/strict";
import test from "node:test";
import { computeSceneLabelLayout, sceneLabelRevealOpacity, type Label } from "../../app/domain";

function label(id: string, x: number, priority: number, minLevel: 0 | 1 | 2): Label {
  return { id, word: id, translation: `释义${id}`, x, y: 100, priority, minLevel };
}

test("label reveal opacity changes continuously between density bands", () => {
  const detail = label("detail", 200, 2, 1);
  assert.equal(sceneLabelRevealOpacity(detail, 0.7), 0);
  const middle = sceneLabelRevealOpacity(detail, 0.95);
  assert.ok(middle > 0 && middle < 1);
  assert.equal(sceneLabelRevealOpacity(detail, 1.2), 1);
});

test("screen-space layout keeps priority labels and reveals more as anchors separate", () => {
  const labels = [
    label("primary", 100, 1, 0),
    label("secondary", 160, 2, 1),
    label("far", 360, 2, 1),
  ];
  const compact = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    { width: 500, height: 300, compact: false },
    false,
  );
  assert.ok(compact.find((item) => item.id === "primary")!.opacity > 0.9);
  assert.equal(compact.find((item) => item.id === "secondary")!.opacity, 0);
  assert.ok(compact.find((item) => item.id === "far")!.opacity > 0.5);

  const zoomed = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 2 },
    { width: 900, height: 400, compact: false },
    false,
  );
  assert.ok(zoomed.filter((item) => item.opacity > 0.5).length > compact.filter((item) => item.opacity > 0.5).length);
});

test("translations widen labels and collision layout accounts for the preference", () => {
  const labels = [label("one", 100, 1, 0), label("two", 190, 1, 0)];
  const camera = { x: 0, y: 0, fit: 1, scale: 1 };
  const viewport = { width: 400, height: 240, compact: false };
  const withoutMeanings = computeSceneLabelLayout(labels, camera, viewport, false);
  const withMeanings = computeSceneLabelLayout(labels, camera, viewport, true);
  assert.equal(withoutMeanings.filter((item) => item.interactive).length, 2);
  assert.equal(withMeanings.filter((item) => item.interactive).length, 1);
});
