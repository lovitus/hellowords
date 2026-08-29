import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSceneLabelMountWindow,
  COMPACT_SCENE_LABEL_MOUNT_LIMIT,
  DESKTOP_SCENE_LABEL_MOUNT_LIMIT,
  sameSceneLabelMountWindow,
  type Label,
  type SceneLabelLayoutItem,
} from "../../app/domain";

const labels: readonly Label[] = Array.from({ length: 300 }, (_, index) => ({
  id: `label-${index.toString().padStart(3, "0")}`,
  word: `word ${index}`,
  translation: `词 ${index}`,
  x: index % 20,
  y: Math.floor(index / 20),
  priority: index,
}));

function layoutWindow(
  interactiveIds: ReadonlySet<string>,
  finiteIds: ReadonlySet<string> = new Set(labels.map(({ id }) => id)),
): SceneLabelLayoutItem[] {
  return labels.map((label, index) => {
    const interactive = interactiveIds.has(label.id);
    const finite = finiteIds.has(label.id);
    return {
      id: label.id,
      lod: 0,
      opacity: interactive ? 0.82 : 0,
      interactive,
      adaptive: false,
      width: finite ? 80 : 0,
      height: finite ? 30 : 0,
      screenX: finite ? index * 2 : Number.NaN,
      screenY: finite ? index : Number.NaN,
      offsetX: 0,
      offsetY: 0,
      placementOrder: finite ? index : Number.POSITIVE_INFINITY,
    };
  });
}

test("a first frame mounts every painted label without filling the desktop ceiling", () => {
  const visible = new Set(labels.slice(0, 168).map(({ id }) => id));
  const layout = layoutWindow(visible);
  const first = buildSceneLabelMountWindow(labels, layout, { compact: false });
  assert.equal(first.size, visible.size);
  assert.ok(first.size < DESKTOP_SCENE_LABEL_MOUNT_LIMIT);
  for (const id of visible) assert.ok(first.has(id), `${id} remains mounted`);

  const repeated = buildSceneLabelMountWindow(labels, layout, { compact: false }, {
    previousIds: first,
  });
  assert.ok(sameSceneLabelMountWindow(first, repeated));
  assert.deepEqual([...repeated], [...first], "an unchanged fit frame keeps one stable window order");
});

test("an explicitly focused detail crop keeps its authored batch mounted first", () => {
  const visible = new Set(labels.map(({ id }) => id));
  const preferred = new Set(labels.slice(240, 280).map(({ id }) => id));
  const mounted = buildSceneLabelMountWindow(
    labels,
    layoutWindow(visible),
    { compact: true },
    { preferredIds: preferred },
  );
  for (const id of preferred) assert.ok(mounted.has(id), `${id} stays mounted for the focused crop`);
  assert.equal(mounted.size, COMPACT_SCENE_LABEL_MOUNT_LIMIT);
});

test("camera batches exchange only for newly visible anchors and remain deterministic", () => {
  const firstVisible = new Set(labels.slice(0, 70).map(({ id }) => id));
  const first = buildSceneLabelMountWindow(
    labels,
    layoutWindow(firstVisible),
    { compact: true },
  );
  assert.equal(first.size, firstVisible.size, "a first frame has no synthetic overscan");

  const nextVisible = new Set([
    ...labels.slice(40, 90).map(({ id }) => id),
    ...labels.slice(200, 220).map(({ id }) => id),
  ]);
  const nearby = new Set(labels.slice(0, 225).map(({ id }) => id));
  const nextLayout = layoutWindow(nextVisible, nearby);
  const next = buildSceneLabelMountWindow(labels, nextLayout, { compact: true }, {
    previousIds: first,
  });
  assert.equal(next.size, nextVisible.size + 40, "only forty still-nearby previous ids add overscan");
  assert.ok(next.size < COMPACT_SCENE_LABEL_MOUNT_LIMIT);
  for (const id of nextVisible) assert.ok(next.has(id), `${id} enters before overscan`);
  assert.ok(
    [...first].some((id) => next.has(id) && !nextVisible.has(id)),
    "still-nearby previous nodes provide stable overscan",
  );
  assert.deepEqual(
    [...buildSceneLabelMountWindow(labels, nextLayout, { compact: true }, { previousIds: first })],
    [...next],
  );
});

test("focused and selected words win a bounded window even while offscreen", () => {
  const visible = new Set(labels.slice(0, 80).map(({ id }) => id));
  const finite = new Set(labels.slice(0, 110).map(({ id }) => id));
  const mounted = buildSceneLabelMountWindow(
    labels,
    layoutWindow(visible, finite),
    { compact: true },
    {
      focusedLabelId: "label-238",
      selectedLabelId: "label-239",
    },
  );
  assert.equal(mounted.size, visible.size + 2);
  assert.ok(mounted.size < COMPACT_SCENE_LABEL_MOUNT_LIMIT);
  assert.ok(mounted.has("label-238"));
  assert.ok(mounted.has("label-239"));
  for (const id of visible) assert.ok(mounted.has(id));
});

test("only a previous mounted window can contribute hidden overscan", () => {
  const visible = new Set(labels.slice(40, 52).map(({ id }) => id));
  const withoutHistory = buildSceneLabelMountWindow(
    labels,
    layoutWindow(visible),
    { compact: true },
  );
  assert.deepEqual([...withoutHistory], [...visible]);

  const previousIds = new Set(labels.slice(0, 20).map(({ id }) => id));
  const withHistory = buildSceneLabelMountWindow(
    labels,
    layoutWindow(visible),
    { compact: true },
    { previousIds },
  );
  assert.equal(withHistory.size, visible.size + previousIds.size);
  for (const id of previousIds) assert.ok(withHistory.has(id));
  assert.ok(!withHistory.has("label-052"), "an arbitrary finite candidate cannot fill the cap");
});

test("malformed over-budget layout data can never lift the hard DOM ceilings", () => {
  const tooManyVisible = new Set(labels.slice(0, 280).map(({ id }) => id));
  assert.equal(
    buildSceneLabelMountWindow(labels, layoutWindow(tooManyVisible), { compact: false }).size,
    DESKTOP_SCENE_LABEL_MOUNT_LIMIT,
  );
  assert.equal(
    buildSceneLabelMountWindow(labels, layoutWindow(tooManyVisible), { compact: true }).size,
    COMPACT_SCENE_LABEL_MOUNT_LIMIT,
  );
  assert.equal(DESKTOP_SCENE_LABEL_MOUNT_LIMIT, 256);
  assert.equal(COMPACT_SCENE_LABEL_MOUNT_LIMIT, 128);
});
