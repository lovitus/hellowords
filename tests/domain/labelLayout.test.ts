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

test("zoom reuses revealed callout slots while newly eligible words fill around them", () => {
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
  const retained = new Set(
    overview.filter((item) => item.interactive).map((item) => item.id),
  );
  const offsets = new Map(
    overview
      .filter((item) => item.interactive)
      .map((item) => [item.id, [item.offsetX, item.offsetY] as const]),
  );
  const zoomed = computeSceneLabelLayout(
    labels,
    // Keep projected anchors fixed so this isolates slot stability from the
    // expected movement of objects under the camera.
    { x: 0, y: 0, fit: 0.5, scale: 2 },
    viewport,
    false,
    { retainedLabelIds: retained, preferredOffsets: offsets },
  );

  for (const id of retained) {
    const before = overview.find((item) => item.id === id)!;
    const after = zoomed.find((item) => item.id === id)!;
    assert.equal(after.interactive, true, `${id} remains readable`);
    assert.deepEqual(
      [after.offsetX, after.offsetY],
      [before.offsetX, before.offsetY],
      `${id} keeps the same object-relative callout slot`,
    );
  }
  assert.ok(
    zoomed.filter((item) => item.interactive).length >= retained.size,
    "newly revealed vocabulary never reduces the readable set",
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
  let retained = new Set<string>();
  let offsets = new Map<string, readonly [number, number]>();
  let previousCount = 0;

  for (const scale of [1, 1.4, 2.2, 3.2, 4.15]) {
    const layout = computeSceneLabelLayout(
      labels,
      { x: 0, y: 0, fit: 1 / scale, scale },
      viewport,
      false,
      { retainedLabelIds: retained, preferredOffsets: offsets },
    );
    const visible = layout.filter((item) => item.interactive);
    assert.ok(visible.length >= previousCount, `readable count does not fall at scale ${scale}`);
    for (const id of retained) {
      assert.equal(
        layout.find((item) => item.id === id)?.interactive,
        true,
        `${id} survives scale ${scale}`,
      );
    }
    retained = new Set(visible.map((item) => item.id));
    offsets = new Map(visible.map((item) => [item.id, [item.offsetX, item.offsetY] as const]));
    previousCount = visible.length;
  }
});

test("current plant-cell labels stay ahead of hidden disclosure history", () => {
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

  const competing = [
    label("chloroplast-stroma", 300, 1, 4, 150),
    label("mitochondrial-intermembrane-space", 300, 2, 4, 150),
  ];
  const layout = computeSceneLabelLayout(
    competing,
    { x: 0, y: 0, fit: 1, scale: 1.05 },
    { width: 600, height: 300, compact: false },
    false,
    { retainedLabelIds: prioritized, maximumVisibleLabels: 1 },
  );
  assert.equal(
    layout.find((item) => item.id === "mitochondrial-intermembrane-space")?.interactive,
    true,
    "the label readable in the latest frame keeps the contested slot",
  );
  assert.equal(
    layout.find((item) => item.id === "chloroplast-stroma")?.interactive,
    false,
    "hidden history waits for a genuinely free slot instead of flickering back",
  );
});

test("a greedy fallback cannot steal another active label's valid preferred slot", () => {
  const labels = [
    label("fallback-first", 300, 1, 4, 160),
    label("reserved-second", 304, 2, 4, 160),
  ];
  const layout = computeSceneLabelLayout(
    labels,
    { x: 0, y: 0, fit: 1, scale: 1.05 },
    { width: 600, height: 400, compact: false },
    false,
    {
      retainedLabelIds: new Set(labels.map((item) => item.id)),
      activeRetainedLabelIds: new Set(labels.map((item) => item.id)),
      preferredOffsets: new Map([
        ["fallback-first", [0, -30] as const],
        ["reserved-second", [0, 96] as const],
      ]),
      protectedRegions: [{ left: 0, right: 600, top: 0, bottom: 225 }],
      maximumVisibleLabels: 2,
    },
  );

  const reserved = layout.find((item) => item.id === "reserved-second")!;
  assert.equal(reserved.interactive, true);
  assert.deepEqual(
    [reserved.offsetX, reserved.offsetY],
    [0, 96],
    "the later active label keeps its still-valid previous-frame slot",
  );
});

test("plant-cell micro zoom preserves the mitochondrial intermembrane callout", () => {
  const scene = JSON.parse(readFileSync(
    new URL("../../public/data/scenes/plant-cell.json", import.meta.url),
    "utf8",
  )) as Scene;
  const viewport = { width: 1_280, height: 632, compact: false };
  const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  let retained = new Set<string>();
  let active = new Set<string>();
  const offsets = new Map<string, readonly [number, number]>();

  const layoutAt = (scale: number) => computeSceneLabelLayout(
    scene.labels,
    {
      fit,
      scale,
      x: (viewport.width - scene.width * fit * scale) / 2,
      y: (viewport.height - scene.height * fit * scale) / 2,
    },
    viewport,
    false,
    {
      retainedLabelIds: retained,
      activeRetainedLabelIds: active,
      preferredOffsets: offsets,
    },
  );
  const accept = (layout: ReturnType<typeof computeSceneLabelLayout>) => {
    const visible = layout
      .filter((item) => item.interactive)
      .sort((first, second) => first.placementOrder - second.placementOrder);
    retained = prioritizeCurrentLabelOrder(retained, visible);
    active = new Set(visible.map((item) => item.id));
    for (const item of visible) offsets.set(item.id, [item.offsetX, item.offsetY]);
  };

  for (let index = 0; index <= 10; index += 1) accept(layoutAt(1 + index * 0.005));
  const before = layoutAt(1.05).find((item) => (
    item.id === "mitochondrial-intermembrane-space"
  ))!;
  assert.equal(before.interactive, true);
  accept(layoutAt(1.05));
  const after = layoutAt(1.055).find((item) => (
    item.id === "mitochondrial-intermembrane-space"
  ))!;
  assert.equal(after.interactive, true, "the current callout survives the 0.005 zoom step");
  assert.deepEqual(
    [after.offsetX, after.offsetY],
    [before.offsetX, before.offsetY],
    "the callout remains on the same side of its mitochondrial structure",
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
    visible.length < labels.length,
    "the overview retains deeper vocabulary as a real zoom reward",
  );
});

test("zoom raises the adaptive allowance and reveals more words without scaling their layout size", () => {
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
  assert.ok(
    zoomed.filter((item) => item.interactive).length
      > overview.filter((item) => item.interactive).length,
  );
});

test("crowding obeys priority and budget while a selected word keeps a readable slot", () => {
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
    { selectedLabelId: "crowded-29", maximumVisibleLabels: 6 },
  );
  const visibleIds = layout.filter((item) => item.interactive).map((item) => item.id);

  assert.ok(visibleIds.length <= 5, "the overview fill fraction preserves later zoom capacity");
  assert.ok(visibleIds.includes("crowded-29"), "the selected word cannot lose its local collision");
  assert.ok(visibleIds.includes("crowded-0"), "the highest authored priority remains visible");
  assert.ok(visibleIds.includes("crowded-1"), "priority order decides the remaining crowded slots");
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

test("mobile uses a smaller adaptive budget and still fills more than a token handful", () => {
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
  assert.ok(visible.length <= budget, "mobile density stays bounded for tap readability");
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
