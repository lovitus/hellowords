import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPortalCueProtectedRegions,
  buildVocabularyCueRevealState,
  buildVocabularyRevealSummary,
  buildVocabularyZoomCues,
  consolidateVocabularyCueBatches,
  computeSceneLabelLayout,
  prioritizeCurrentLabelOrder,
  sceneLabelLod,
  sceneLabelRevealOpacity,
  sceneLabelVisibilityBudget,
  sceneVocabularyCueLimit,
  vocabularyCueFocusPoint,
  type Label,
  type Scene,
} from "../../app/domain";

type Lod = NonNullable<Label["minLevel"]>;

function label(
  id: string,
  x: number,
  priority: number,
  minLevel: Lod,
  y = 100,
): Label {
  return { id, word: id, translation: `释义${id}`, x, y, priority, minLevel };
}

test("all five LOD bands reveal continuously and in order", () => {
  const probes = [
    { lod: 0, before: 0.45, middle: 0.64, after: 0.8 },
    { lod: 1, before: 0.68, middle: 0.85, after: 1 },
    { lod: 2, before: 1, middle: 1.22, after: 1.4 },
    { lod: 3, before: 1.55, middle: 1.9, after: 2.22 },
    { lod: 4, before: 2.2, middle: 2.65, after: 3.12 },
  ] as const;

  for (const probe of probes) {
    const detail = label(`lod-${probe.lod}`, 200, probe.lod + 1, probe.lod);
    assert.equal(sceneLabelLod(detail), probe.lod);
    assert.equal(sceneLabelRevealOpacity(detail, probe.before), 0);
    const middle = sceneLabelRevealOpacity(detail, probe.middle);
    assert.ok(middle > 0 && middle < 1, `LOD ${probe.lod} must have a partial-opacity interval`);
    assert.equal(sceneLabelRevealOpacity(detail, probe.after), 1);

    const epsilon = 0.0001;
    const left = sceneLabelRevealOpacity(detail, probe.middle - epsilon);
    const right = sceneLabelRevealOpacity(detail, probe.middle + epsilon);
    assert.ok(Math.abs(right - left) < 0.01, `LOD ${probe.lod} must not jump at an intermediate scale`);
  }
});

test("authored min and max scales fade a label both in and out", () => {
  const authored: Label = {
    ...label("authored", 200, 1, 0),
    minScale: 1.5,
    maxScale: 2.5,
  };
  assert.equal(sceneLabelRevealOpacity(authored, 1.49), 0);
  assert.ok(sceneLabelRevealOpacity(authored, 1.62) > 0);
  assert.equal(sceneLabelRevealOpacity(authored, 1.8), 1);
  assert.ok(sceneLabelRevealOpacity(authored, 2.35) > 0);
  assert.ok(sceneLabelRevealOpacity(authored, 2.35) < 1);
  assert.equal(sceneLabelRevealOpacity(authored, 2.5), 0);
});

test("default LOD words stay revealed at maximum zoom unless an author explicitly retires them", () => {
  for (const lod of [0, 1, 2, 3, 4] as const) {
    const grounded = label(`persistent-${lod}`, 200, lod + 1, lod);
    assert.equal(
      sceneLabelRevealOpacity(grounded, 4.15),
      1,
      `LOD ${lod} remains readable at maximum zoom`,
    );
  }
});

test("focused detail batches promote their own LOD4 words only at the crop scale", () => {
  const detail = label("focused-detail", 100, 1, 4, 100);
  const viewport = { width: 600, height: 300, compact: false };
  const hidden = computeSceneLabelLayout(
    [detail],
    { x: 0, y: 0, fit: 1, scale: 2.2 },
    viewport,
    false,
    { adaptiveRevealScale: 4, revealLabelIds: new Set([detail.id]), revealAtScale: 2.3 },
  )[0];
  assert.equal(hidden.interactive, false);

  const focused = computeSceneLabelLayout(
    [detail],
    { x: 0, y: 0, fit: 1, scale: 2.4 },
    viewport,
    false,
    { adaptiveRevealScale: 4, revealLabelIds: new Set([detail.id]), revealAtScale: 2.3 },
  )[0];
  assert.equal(focused.interactive, true);
  assert.ok(focused.opacity >= 0.82);
});

test("compact focused anchors take collision ownership before unrelated labels", () => {
  const labels = [
    label("overview", 180, 1, 0, 120),
    label("focused", 180, 9, 0, 120),
  ];
  const layout = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    { width: 420, height: 260, compact: true },
    false,
    { priorityLabelIds: new Set(["focused"]) },
  );
  assert.ok(
    layout.find((item) => item.id === "focused")!.placementOrder
      < layout.find((item) => item.id === "overview")!.placementOrder,
    "the focused crop should reserve the first collision slot",
  );
});

test("dense desktop pills are one-third shorter while compact touch boxes stay 28px", () => {
  const labels = [
    label("overview", 120, 1, 0, 120),
    label("detail", 420, 2, 4, 120),
  ];
  const camera = { x: 0, y: 0, fit: 0.25, scale: 4 };
  const desktop = computeSceneLabelLayout(
    labels,
    camera,
    { width: 600, height: 260, compact: false },
    false,
  );
  const compact = computeSceneLabelLayout(
    labels,
    camera,
    { width: 600, height: 260, compact: true },
    false,
  );
  assert.deepEqual(desktop.map(({ height }) => height), [15, 13]);
  assert.deepEqual(compact.map(({ height }) => height), [28, 28]);
});

test("a fixed projection has one canonical callout layout across LOD disclosure", () => {
  const labels = Array.from({ length: 18 }, (_, index) => label(
    `stable-${index}`,
    180 + (index % 6) * 78,
    index + 1,
    index < 8 ? 0 : 2,
    130 + Math.floor(index / 6) * 68,
  ));
  const viewport = { width: 760, height: 420, compact: false };
  const overview = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    viewport,
    false,
  );
  const zoomed = computeSceneLabelLayout(
    labels,
    // Keep projected anchors fixed so this isolates slot stability from the
    // expected movement of objects under the camera.
    { x: 0, y: 0, fit: 0.5, scale: 2 },
    viewport,
    false,
  );

  assert.deepEqual(
    zoomed.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
    overview.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
    "authored depth changes opacity, not collision ownership at identical screen anchors",
  );
});

test("maximum zoom does not retire previously readable words that remain in view", () => {
  const labels = Array.from({ length: 30 }, (_, index) => label(
    `cumulative-${index}`,
    70 + (index % 6) * 105,
    index + 1,
    (index % 5) as Lod,
    75 + Math.floor(index / 6) * 62,
  ));
  const viewport = { width: 760, height: 430, compact: false };
  let baseline: ReturnType<typeof computeSceneLabelLayout> | null = null;

  for (const scale of [1, 1.4, 2.2, 3.2, 4.15]) {
    const layout = computeSceneLabelLayout(
      labels,
      { x: 0, y: 0, fit: 1 / scale, scale },
      viewport,
      false,
    );
    baseline ??= layout;
    assert.deepEqual(
      layout.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
      baseline.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
      `fixed projected anchors keep one deterministic layout at scale ${scale}`,
    );
  }
});

test("encounter history keeps current labels first without controlling layout", () => {
  const historical = new Set([
    "chloroplast-stroma",
    "mitochondrial-intermembrane-space",
    "cell-wall",
  ]);
  const prioritized = prioritizeCurrentLabelOrder(historical, [
    { id: "chloroplast-stroma", interactive: false, placementOrder: 0 },
    { id: "mitochondrial-intermembrane-space", interactive: true, placementOrder: 1 },
    { id: "new-current-label", interactive: true, placementOrder: 2 },
  ]);

  assert.deepEqual([...prioritized], [
    "mitochondrial-intermembrane-space",
    "new-current-label",
    "chloroplast-stroma",
    "cell-wall",
  ]);
});

test("oak-tree fills safe slots and reproduces the exact layout after a zoom round trip", () => {
  const scene = JSON.parse(readFileSync(
    new URL("../../public/data/scenes/oak-tree.json", import.meta.url),
    "utf8",
  )) as Scene;
  const viewport = { width: 1_000, height: 700, compact: false };
  const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  const layoutAt = (scale: number) => {
    const camera = {
      fit,
      scale,
      x: (viewport.width - scene.width * fit * scale) / 2,
      y: (viewport.height - scene.height * fit * scale) / 2,
    };
    return computeSceneLabelLayout(
      scene.labels,
      camera,
      viewport,
      false,
      { protectedRegions: buildPortalCueProtectedRegions(scene.portals, camera, viewport) },
    );
  };
  const before = layoutAt(1);
  assert.ok(
    before.filter((item) => item.interactive).length >= 64,
    "the shorter desktop pills keep nearly all grounded oak labels readable at fit",
  );
  for (const scale of [1.05, 1.2, 1.65, 2.3, 3.1, 2.3, 1.65, 1.2, 1.05]) layoutAt(scale);
  const after = layoutAt(1);
  assert.deepEqual(
    after.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
    before.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
    "the same camera cannot inherit a different interactive set or callout side",
  );
});

test("screen-space layout uses anchored callouts and nudges a colliding label", () => {
  const labels = [
    label("primary", 100, 1, 0),
    label("secondary", 105, 2, 1),
    label("far", 360, 2, 1),
  ];
  const layout = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1.25 },
    { width: 500, height: 300, compact: false },
    false,
  );
  const primary = layout.find((item) => item.id === "primary")!;
  const secondary = layout.find((item) => item.id === "secondary")!;
  assert.equal(primary.offsetX, 0);
  assert.ok(primary.offsetY < 0, "the preferred callout sits above its exact object point");
  assert.equal(primary.screenX - primary.offsetX, 125);
  assert.equal(primary.screenY - primary.offsetY, 125);
  assert.ok(primary.opacity > 0.95);
  assert.ok(secondary.opacity > 0.95);
  assert.ok(
    Math.hypot(secondary.offsetX, secondary.offsetY) > 0,
    "a lower-priority collision should use a nearby callout slot instead of disappearing",
  );
});

test("continuous motion reserves every still-legal interactive slot before new first-fit claims", () => {
  const newcomer = label("newcomer", 200, 1, 0, 218);
  const retained = label("retained", 200, 2, 2, 150);
  const viewport = { width: 500, height: 300, compact: false };
  const camera = { x: 0, y: 0, fit: 1, scale: 1 };
  const preferredOffsets = new Map([
    [retained.id, { offsetX: 0, offsetY: 34 }],
  ]);
  const sticky = computeSceneLabelLayout(
    [newcomer, retained],
    camera,
    viewport,
    false,
    { preferredOffsets },
  );
  const stickyRetained = sticky.find(({ id }) => id === retained.id)!;

  assert.equal(stickyRetained.interactive, true);
  assert.deepEqual(
    [stickyRetained.offsetX, stickyRetained.offsetY],
    [0, 34],
    "an earlier newcomer cannot borrow a retained callout's still-empty previous slot",
  );

  const canonical = computeSceneLabelLayout(
    [newcomer, retained],
    camera,
    viewport,
    false,
  );
  const canonicalReplay = computeSceneLabelLayout(
    [newcomer, retained],
    camera,
    viewport,
    false,
  );
  assert.notDeepEqual(
    [canonical.find(({ id }) => id === retained.id)!.offsetX,
      canonical.find(({ id }) => id === retained.id)!.offsetY],
    [0, 34],
    "clearing motion memory on Fit or direction reversal returns to canonical placement",
  );
  assert.deepEqual(
    canonicalReplay.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
    canonical.map((item) => [item.id, item.interactive, item.offsetX, item.offsetY]),
    "the same camera after reset always reproduces canonical IDs and offsets",
  );

  const blocked = computeSceneLabelLayout(
    [newcomer, retained],
    camera,
    viewport,
    false,
    {
      preferredOffsets,
      protectedRegions: [{ left: 160, right: 240, top: 165, bottom: 203 }],
    },
  ).find(({ id }) => id === retained.id)!;
  assert.notDeepEqual(
    [blocked.offsetX, blocked.offsetY],
    [0, 34],
    "a previous slot is released as soon as it has a real protected-region collision",
  );
});

test("vocabulary zoom cues never compete with a child-scene portal", () => {
  const labels = [
    label("portal-detail", 200, 1, 2, 180),
    label("nearby-detail", 640, 2, 2, 180),
    label("nearby-part", 700, 3, 3, 220),
    label("lower-detail", 1_300, 2, 4, 700),
  ];
  const cues = buildVocabularyZoomCues(
    labels,
    [{
      id: "enter-object",
      label: "Enter object",
      childSceneId: "object",
      x: 100,
      y: 100,
      width: 240,
      height: 220,
    }],
    1_600,
    900,
  );

  assert.equal(cues.length, 2);
  assert.ok(cues.every((cue) => !cue.labelIds.includes("portal-detail")));
  assert.deepEqual(cues[0].labelIds, ["nearby-detail", "nearby-part"]);
  assert.ok(cues[0].labelIds.includes(cues[0].anchorLabelId));
  assert.ok(
    labels.some((item) => (
      item.id === cues[0].anchorLabelId
      && item.x === cues[0].x
      && item.y === cues[0].y
    )),
    "the cue must sit on a real authored label anchor rather than an averaged empty point",
  );
  assert.equal(cues[0].minLod, 2);
  assert.ok(cues.every((cue) => cue.source === "fallback-grid"));
  assert.deepEqual(
    buildVocabularyZoomCues(labels, [{
      id: "enter-object",
      label: "Enter object",
      childSceneId: "object",
      x: 100,
      y: 100,
      width: 240,
      height: 220,
    }], 1_600, 900, 4, []),
    cues,
    "an explicitly empty authored-zone list is the same grid fallback",
  );
});

test("authored detail zones replace grid inference and preserve semantic camera targets", () => {
  const labels = [
    label("overview", 550, 1, 0, 180),
    label("zone-detail", 620, 2, 2, 210),
    label("zone-part", 760, 3, 3, 250),
    label("portal-detail", 200, 4, 2, 180),
  ];
  const cues = buildVocabularyZoomCues(
    labels,
    [{
      id: "enter-object",
      label: "Enter object",
      childSceneId: "object",
      x: 100,
      y: 100,
      width: 240,
      height: 220,
    }],
    1_600,
    900,
    8,
    [{
      id: "workbench",
      title: "Workbench details",
      translation: "工作台细节",
      description: "A bounded authored crop around visible workbench parts",
      x: 500,
      y: 100,
      width: 400,
      height: 300,
      targetScale: 2.6,
      labelIds: ["overview", "zone-detail", "zone-part", "portal-detail"],
    }],
  );

  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, "detail-zone-workbench");
  assert.equal(cues[0].source, "authored-zone");
  assert.equal(cues[0].detailZoneId, "workbench");
  assert.equal(cues[0].title, "Workbench details");
  assert.equal(cues[0].translation, "工作台细节");
  assert.equal(cues[0].targetScale, 2.6);
  assert.equal(cues[0].focusX, 700);
  assert.equal(cues[0].focusY, 250);
  assert.deepEqual(cues[0].labelIds, ["zone-detail", "zone-part"]);
  assert.ok(cues[0].labelIds.includes(cues[0].anchorLabelId));
  assert.ok(
    labels.some((item) => (
      item.id === cues[0].anchorLabelId
      && item.x === cues[0].x
      && item.y === cues[0].y
    )),
    "the semantic region cue still sits on a real label point",
  );
  assert.ok(cues.every((cue) => !cue.id.startsWith("vocabulary-")));

  const portalOwned = buildVocabularyZoomCues(
    [labels[3]],
    [{
      id: "enter-object",
      label: "Enter object",
      childSceneId: "object",
      x: 100,
      y: 100,
      width: 240,
      height: 220,
    }],
    1_600,
    900,
    8,
    [{
      id: "portal-owned",
      title: "Child object",
      translation: "子场景对象",
      description: "This authored crop belongs entirely to the child-scene portal",
      x: 100,
      y: 100,
      width: 240,
      height: 220,
      targetScale: 2.5,
      labelIds: ["portal-detail"],
    }],
  );
  assert.deepEqual(portalOwned, [], "a portal-owned zone stays data-only instead of becoming a grid cue");
});

test("authored cue counts all remaining words but targets only the nearest reveal batch", () => {
  const labels = [
    label("near", 620, 1, 2, 210),
    label("later", 700, 2, 3, 230),
    label("deep", 760, 3, 4, 250),
  ];
  const cue = buildVocabularyZoomCues(
    labels,
    [],
    1_600,
    900,
    8,
    [{
      id: "parts",
      title: "Visible parts",
      translation: "可见部件",
      description: "A truthful crop containing three progressively revealed parts",
      x: 500,
      y: 100,
      width: 400,
      height: 300,
      targetScale: 1.15,
      labelIds: labels.map((item) => item.id),
    }],
  )[0];

  const overview = buildVocabularyCueRevealState(cue, labels, 1, 4);
  assert.deepEqual(overview.hiddenLabels.map((item) => item.id), ["near", "later", "deep"]);
  assert.deepEqual(overview.nextLabels.map((item) => item.id), ["near"]);
  assert.equal(overview.nextLod, 2);
  assert.ok(overview.targetScale! > cue.targetScale!);

  const afterFirstReveal = buildVocabularyCueRevealState(cue, labels, 1.4, 4);
  assert.deepEqual(afterFirstReveal.hiddenLabels.map((item) => item.id), ["later", "deep"]);
  assert.deepEqual(afterFirstReveal.nextLabels.map((item) => item.id), ["later"]);
  assert.equal(afterFirstReveal.nextLod, 3);
  assert.ok(afterFirstReveal.targetScale! > overview.targetScale!);
});

test("authored cues focus the next real anchors instead of an empty zone centre", () => {
  const cue = {
    id: "zone",
    x: 800,
    y: 450,
    anchorLabelId: "next-a",
    labelIds: ["next-a", "next-b"],
    minLod: 2 as const,
    source: "authored-zone" as const,
    focusX: 800,
    focusY: 450,
  };
  assert.deepEqual(
    vocabularyCueFocusPoint(cue, [
      { x: 120, y: 180 },
      { x: 280, y: 260 },
    ]),
    { x: 200, y: 220 },
  );
  assert.deepEqual(
    vocabularyCueFocusPoint({ ...cue, source: "fallback-grid" }, []),
    { x: 800, y: 450 },
  );
});

test("vocabulary cue batches merge nearby same-LOD words and never advertise fewer than four", () => {
  const labels = [
    label("one", 100, 1, 2, 100),
    label("two", 140, 2, 2, 120),
    label("three", 210, 3, 2, 130),
    label("four", 240, 4, 2, 150),
    label("later", 180, 5, 3, 140),
  ];
  const firstCue = {
    id: "first",
    x: 100,
    y: 100,
    anchorLabelId: "one",
    labelIds: ["one", "two"],
    minLod: 2 as const,
    source: "fallback-grid" as const,
  };
  const secondCue = {
    id: "second",
    x: 210,
    y: 130,
    anchorLabelId: "three",
    labelIds: ["three", "four"],
    minLod: 2 as const,
    source: "fallback-grid" as const,
  };
  const laterCue = {
    id: "later",
    x: 180,
    y: 140,
    anchorLabelId: "later",
    labelIds: ["later"],
    minLod: 3 as const,
    source: "fallback-grid" as const,
  };
  const batches = consolidateVocabularyCueBatches([
    { cue: firstCue, labels: labels.slice(0, 2), nextLod: 2 },
    { cue: secondCue, labels: labels.slice(2, 4), nextLod: 2 },
    { cue: laterCue, labels: labels.slice(4), nextLod: 3 },
  ], 4, 300, 200);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].mode, "region");
  assert.equal(batches[0].labels.length, 4);
  assert.deepEqual(batches[0].sourceCueIds, ["first", "second"]);
  assert.ok(batches.every((batch) => batch.labels.length >= 4));
  assert.equal(batches[0].nextLod, 2, "later LODs cannot be pulled into the current reveal count");
});

test("vocabulary cue counts are exact unique label ids across overlapping source cues", () => {
  const labels = [
    label("one", 100, 1, 2, 100),
    label("two", 140, 2, 2, 120),
    label("three", 180, 3, 2, 140),
    label("four", 220, 4, 2, 160),
  ];
  const batches = consolidateVocabularyCueBatches([
    {
      cue: {
        id: "left",
        x: 100,
        y: 100,
        anchorLabelId: "one",
        labelIds: ["one", "two", "three"],
        minLod: 2,
        source: "fallback-grid",
      },
      labels: labels.slice(0, 3),
      nextLod: 2,
    },
    {
      cue: {
        id: "right",
        x: 180,
        y: 140,
        anchorLabelId: "three",
        labelIds: ["three", "four"],
        minLod: 2,
        source: "fallback-grid",
      },
      labels: labels.slice(2),
      nextLod: 2,
    },
  ], 4, 300, 200);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].mode, "region");
  assert.deepEqual(batches[0].labels.map((item) => item.id), ["one", "two", "three", "four"]);
  assert.equal(
    new Set(batches[0].labels.map((item) => item.id)).size,
    batches[0].labels.length,
    "the number shown to a user must never count the same word anchor twice",
  );
});

test("sparse or spatially disconnected cues remain honest compact fallbacks instead of going silent", () => {
  const nearby = [
    label("one", 100, 1, 2, 100),
    label("two", 130, 2, 2, 120),
  ];
  const distant = [
    label("three", 1_300, 3, 2, 700),
    label("four", 1_350, 4, 2, 740),
  ];
  const batches = consolidateVocabularyCueBatches([
    {
      cue: { id: "near", x: 100, y: 100, anchorLabelId: "one", labelIds: ["one", "two"], minLod: 2, source: "fallback-grid" },
      labels: nearby,
      nextLod: 2,
    },
    {
      cue: { id: "far", x: 1_300, y: 700, anchorLabelId: "three", labelIds: ["three", "four"], minLod: 2, source: "fallback-grid" },
      labels: distant,
      nextLod: 2,
    },
  ], 4, 300, 200);

  assert.equal(batches.length, 2);
  assert.ok(batches.every((batch) => batch.mode === "compact"));
  assert.deepEqual(
    batches.map((batch) => ({ id: batch.cue.id, words: batch.labels.map((item) => item.id) })),
    [
      { id: "near", words: ["one", "two"] },
      { id: "far", words: ["three", "four"] },
    ],
  );
  assert.equal(
    new Set(batches.flatMap((batch) => batch.labels.map((item) => item.id))).size,
    4,
    "fallback guidance must report every actual word once without inventing a four-word region",
  );
});

test("scene-wide reveal summary covers hidden labels that the four regional cue budget cannot", () => {
  const hidden = [
    label("north-west", 100, 1, 2, 100),
    label("north-east", 1_500, 2, 2, 100),
    label("middle-left", 100, 3, 2, 450),
    label("middle-right", 1_500, 4, 2, 450),
    label("south-west", 100, 5, 2, 800),
    label("deep", 800, 6, 3, 450),
  ];
  const labels = [
    label("visible", 800, 0, 0, 100),
    ...hidden,
    { ...hidden[0], word: "duplicate authoring must not inflate the count" },
    { ...label("beyond-maximum", 800, 7, 4, 800), minScale: 4.8 },
  ];

  const regionalCues = buildVocabularyZoomCues(labels, [], 1_600, 900, 4);
  const regionalIds = new Set(regionalCues.flatMap((cue) => cue.labelIds));
  assert.ok(
    hidden.some((item) => !regionalIds.has(item.id)),
    "this fixture must prove the regional cue budget does not cover the whole scene",
  );

  const summary = buildVocabularyRevealSummary(labels, 1, 4);
  assert.deepEqual(summary.hiddenLabels.map((item) => item.id), hidden.map((item) => item.id));
  assert.equal(new Set(summary.hiddenLabels.map((item) => item.id)).size, summary.hiddenLabels.length);
  assert.equal(summary.nextLod, 2);
  assert.deepEqual(
    summary.nextLabels.map((item) => item.id),
    hidden.filter((item) => item.minLevel === 2).map((item) => item.id),
  );
  assert.notEqual(summary.targetScale, null);
  assert.ok(summary.targetScale! > 1 && summary.targetScale! <= 4);
});

test("translations consume more collision space without changing the DOM budget", () => {
  const labels = Array.from({ length: 18 }, (_, index) => ({
    ...label(`word-${index}`, 190 + (index % 3) * 8, 1, 0, 100 + Math.floor(index / 3) * 8),
    translation: `这是一个较长的场景释义${index}`,
  }));
  const camera = { x: 0, y: 0, fit: 1, scale: 1 };
  const viewport = { width: 420, height: 300, compact: false };
  const withoutMeanings = computeSceneLabelLayout(labels, camera, viewport, false);
  const withMeanings = computeSceneLabelLayout(labels, camera, viewport, true);
  assert.equal(withoutMeanings.length, labels.length);
  assert.equal(withMeanings.length, labels.length);
  assert.ok(
    withMeanings.filter((item) => item.interactive).length
      < withoutMeanings.filter((item) => item.interactive).length,
  );
});

function spaciousFutureLabels(count = 80): Label[] {
  return Array.from({ length: count }, (_, index) => label(
    `future-${index}`,
    65 + (index % 10) * 112,
    index + 1,
    index < 4 ? 0 : 2,
    70 + Math.floor(index / 10) * 76,
  ));
}

test("a spacious desktop fills empty overview regions with higher-LOD words before their fixed band", () => {
  const labels = spaciousFutureLabels();
  const viewport = { width: 1_200, height: 700, compact: false };
  const layout = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    viewport,
    false,
  );
  const visible = layout.filter((item) => item.interactive);
  const adaptive = visible.filter((item) => item.adaptive);

  assert.ok(visible.length >= 28, "large usable space should not stop at the four overview words");
  assert.ok(adaptive.length >= 20, "spare capacity should pull useful LOD 2 anchors forward");
  assert.ok(
    adaptive.every((item) => item.lod === 2),
    "the adaptive pass still follows the authored LOD order",
  );
  assert.ok(
    visible.length === labels.length,
    "every future label is shown when every authored anchor has a safe slot",
  );
});

test("a spacious viewport fills every safe slot before showing a synthetic remainder", () => {
  const labels = spaciousFutureLabels();
  const viewport = { width: 1_200, height: 700, compact: false };
  const overview = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    viewport,
    false,
  );
  const zoomed = computeSceneLabelLayout(
    labels,
    // Keep projected anchor positions constant so this assertion isolates LOD
    // density rather than viewport cropping.
    { x: 0, y: 0, fit: 0.5, scale: 2 },
    viewport,
    false,
  );
  const overviewCount = overview.filter((item) => item.interactive).length;
  const zoomedCount = zoomed.filter((item) => item.interactive).length;
  assert.ok(overviewCount >= 38, "overview uses the available native-size label capacity");
  assert.ok(zoomedCount >= overviewCount, "zoom never lowers the filled readable capacity");
});

test("crowding is bounded by real collisions while a selected word keeps a readable slot", () => {
  const labels = Array.from({ length: 30 }, (_, index) => label(
    `crowded-${index}`,
    300,
    index + 1,
    2,
    200,
  ));
  const layout = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    { width: 600, height: 400, compact: false },
    false,
    { selectedLabelId: "crowded-29" },
  );
  const visibleIds = layout.filter((item) => item.interactive).map((item) => item.id);

  assert.ok(visibleIds.length > 6, "an arbitrary six-word quota cannot waste valid callout slots");
  assert.ok(visibleIds.length < labels.length, "real geometric crowding still hides unsafe pills");
  assert.ok(visibleIds.includes("crowded-29"), "the selected word cannot lose its local collision");
  assert.ok(visibleIds.includes("crowded-0"), "the highest authored priority remains visible");
  assert.ok(visibleIds.includes("crowded-1"), "priority order decides the remaining crowded slots");

  const released = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    { width: 600, height: 400, compact: false },
    false,
  ).find((item) => item.id === "crowded-29")!;
  assert.equal(
    released.interactive,
    false,
    "closing a selection releases its exceptional collision priority in the same scene",
  );
});

test("portal cue footprint is reserved before adaptive labels are placed", () => {
  const viewport = { width: 1_000, height: 600, compact: false };
  const camera = { x: 0, y: 0, fit: 1, scale: 1 };
  const portal = {
    id: "portal",
    label: "Enter",
    childSceneId: "child",
    x: 400,
    y: 200,
    width: 200,
    height: 200,
  };
  const [protectedRegion] = buildPortalCueProtectedRegions([portal], camera, viewport);
  const [placed] = computeSceneLabelLayout(
    [label("selected-object", 500, 99, 2, 300)],
    camera,
    viewport,
    false,
    { selectedLabelId: "selected-object", protectedRegions: [protectedRegion] },
  );

  assert.equal(placed.interactive, true);
  assert.ok(
    placed.screenY < protectedRegion.top || placed.screenY > protectedRegion.bottom,
    "the word moves clear of the gold cue and caption rather than sitting beneath it",
  );
});

test("mobile density target does not hide labels that still have tap-safe slots", () => {
  const labels = Array.from({ length: 80 }, (_, index) => label(
    `mobile-${index}`,
    45 + (index % 5) * 74,
    index + 1,
    2,
    55 + Math.floor(index / 5) * 47,
  ));
  const viewport = { width: 390, height: 780, compact: true };
  const budget = sceneLabelVisibilityBudget(viewport, false);
  const visible = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1 },
    viewport,
    false,
  ).filter((item) => item.interactive);

  assert.ok(budget <= 28);
  assert.ok(visible.length >= 10, "mobile should expose a useful first-screen vocabulary set");
  assert.ok(visible.length > budget, "the advisory target cannot become an artificial hard cap");
  assert.ok(visible.length <= labels.length, "physical placement remains the true upper bound");
});

test("zone navigation cues stay below a small overlay budget", () => {
  assert.equal(sceneVocabularyCueLimit(390), 2);
  assert.equal(sceneVocabularyCueLimit(700), 2);
  assert.equal(sceneVocabularyCueLimit(701), 3);
  assert.equal(sceneVocabularyCueLimit(1_440), 3);
});

function denseSceneLabels(): Label[] {
  const overview = Array.from({ length: 40 }, (_, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    return label(
      `overview-${index}`,
      105 + column * 195,
      index < 20 ? 1 : 2,
      index < 20 ? 0 : 1,
      105 + row * 170,
    );
  });
  const focusedDetail = Array.from({ length: 48 }, (_, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    return label(
      `detail-${index}`,
      430 + column * 105,
      3,
      2,
      230 + row * 86,
    );
  });
  const deepDetail = Array.from({ length: 12 }, (_, index) => label(
    `deep-${index}`,
    540 + (index % 4) * 170,
    4,
    index < 6 ? 3 : 4,
    320 + Math.floor(index / 4) * 125,
  ));
  return [...overview, ...focusedDetail, ...deepDetail];
}

test("dense scenes meet desktop, mobile and zoomed-in readability floors", () => {
  const labels = denseSceneLabels();
  const desktopFit = Math.min(1440 / 1600, 826 / 900);
  const desktopOverview = computeSceneLabelLayout(
    labels,
    { x: 0, y: 8, fit: desktopFit, scale: 1 },
    { width: 1440, height: 826, compact: false },
    false,
  );
  assert.ok(
    desktopOverview.filter((item) => item.opacity >= 0.52).length >= 20,
    "desktop overview must expose at least 20 readable labels",
  );

  const mobileFit = Math.min(412 / 1600, 849 / 900);
  const mobileScale = 1.3;
  const mobileOverview = computeSceneLabelLayout(
    labels,
    {
      x: (412 - 1600 * mobileFit * mobileScale) / 2,
      y: (849 - 900 * mobileFit * mobileScale) / 2,
      fit: mobileFit,
      scale: mobileScale,
    },
    { width: 412, height: 849, compact: true },
    false,
  );
  assert.ok(
    mobileOverview.filter((item) => item.opacity >= 0.52).length >= 14,
    "mobile overview must expose at least 14 readable labels",
  );

  const zoomScale = 1.8;
  const desktopZoomed = computeSceneLabelLayout(
    labels,
    {
      x: (1440 - 1600 * desktopFit * zoomScale) / 2,
      y: (826 - 900 * desktopFit * zoomScale) / 2,
      fit: desktopFit,
      scale: zoomScale,
    },
    { width: 1440, height: 826, compact: false },
    false,
  );
  assert.ok(
    desktopZoomed.filter((item) => item.opacity >= 0.95).length >= 40,
    "a focused desktop detail layer must expose at least 40 fully readable labels",
  );
});
