import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVocabularyZoomCues,
  consolidateVocabularyCueBatches,
  computeSceneLabelLayout,
  sceneLabelLod,
  sceneLabelRevealOpacity,
  type Label,
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
  };
  const secondCue = {
    id: "second",
    x: 210,
    y: 130,
    anchorLabelId: "three",
    labelIds: ["three", "four"],
    minLod: 2 as const,
  };
  const laterCue = {
    id: "later",
    x: 180,
    y: 140,
    anchorLabelId: "later",
    labelIds: ["later"],
    minLod: 3 as const,
  };
  const batches = consolidateVocabularyCueBatches([
    { cue: firstCue, labels: labels.slice(0, 2), nextLod: 2 },
    { cue: secondCue, labels: labels.slice(2, 4), nextLod: 2 },
    { cue: laterCue, labels: labels.slice(4), nextLod: 3 },
  ], 4, 300, 200);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].labels.length, 4);
  assert.deepEqual(batches[0].sourceCueIds, ["first", "second"]);
  assert.ok(batches.every((batch) => batch.labels.length >= 4));
  assert.equal(batches[0].nextLod, 2, "later LODs cannot be pulled into the current reveal count");
});

test("a sparse or spatially disconnected vocabulary cue is hidden instead of overstating its count", () => {
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
      cue: { id: "near", x: 100, y: 100, anchorLabelId: "one", labelIds: ["one", "two"], minLod: 2 },
      labels: nearby,
      nextLod: 2,
    },
    {
      cue: { id: "far", x: 1_300, y: 700, anchorLabelId: "three", labelIds: ["three", "four"], minLod: 2 },
      labels: distant,
      nextLod: 2,
    },
  ], 4, 300, 200);

  assert.deepEqual(batches, []);
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
