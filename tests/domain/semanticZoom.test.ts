import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SEMANTIC_ZOOM_MAX_SCALE,
  SEMANTIC_ZOOM_MIN_SCALE,
  SEMANTIC_ZOOM_THRESHOLDS,
  SEMANTIC_ZOOM_WORLD_HEIGHT,
  SEMANTIC_ZOOM_WORLD_WIDTH,
  clampSemanticZoomView,
  focusSemanticZoomView,
  layoutSemanticZoomNodes,
  nearestSemanticZoomNode,
  nextSemanticZoomLevel,
  panSemanticZoomView,
  placeSemanticZoomNodes,
  projectSemanticZoomNodes,
  resolveSemanticZoomRealmEntry,
  semanticWheelScale,
  semanticZoomBoundsForLevel,
  semanticZoomCamera,
  semanticZoomDisplayLevel,
  semanticZoomExplorationProgress,
  semanticZoomLevelForScale,
  semanticZoomLayoutBounds,
  semanticZoomNodeBudget,
  semanticZoomNodeBox,
  semanticZoomScaleForLevel,
  smoothSemanticZoomView,
  zoomSemanticViewAboutPoint,
} from "../../app/domain/semanticZoom";
import { lexicalWorldRealmTiles } from "../../app/lib/lexical-world-visuals";

const DESKTOP = { width: 1200, height: 675 } as const;
const ROOT = new URL("../../", import.meta.url);

test("semantic zoom thresholds replace hierarchy levels at stable scales", () => {
  assert.equal(semanticZoomLevelForScale(1), "realm");
  assert.equal(semanticZoomLevelForScale(SEMANTIC_ZOOM_THRESHOLDS.topic - 0.001), "realm");
  assert.equal(semanticZoomLevelForScale(SEMANTIC_ZOOM_THRESHOLDS.topic), "topic");
  assert.equal(semanticZoomLevelForScale(SEMANTIC_ZOOM_THRESHOLDS.subcluster), "subcluster");
  assert.equal(semanticZoomLevelForScale(SEMANTIC_ZOOM_THRESHOLDS.word), "word");
  assert.ok(semanticZoomScaleForLevel("topic") >= SEMANTIC_ZOOM_THRESHOLDS.topic);
  assert.ok(semanticZoomScaleForLevel("subcluster") >= SEMANTIC_ZOOM_THRESHOLDS.subcluster);
  assert.ok(semanticZoomScaleForLevel("word") >= SEMANTIC_ZOOM_THRESHOLDS.word);
  assert.throws(() => semanticZoomLevelForScale(0), /positive/);
});

test("slow data preserves the last populated LOD instead of rendering an empty deeper layer", () => {
  const base = {
    realmSelected: true,
    topicsReady: false,
    topicSelected: false,
    subclustersReady: false,
    subclusterSelected: false,
    wordsReady: false,
  };
  assert.equal(semanticZoomDisplayLevel("word", base), "realm");
  assert.equal(semanticZoomDisplayLevel("word", { ...base, topicsReady: true }), "topic");
  assert.equal(semanticZoomDisplayLevel("word", {
    ...base,
    topicsReady: true,
    topicSelected: true,
  }), "topic");
  assert.equal(semanticZoomDisplayLevel("word", {
    ...base,
    topicsReady: true,
    topicSelected: true,
    subclustersReady: true,
    subclusterSelected: true,
  }), "subcluster");
  assert.equal(semanticZoomDisplayLevel("word", {
    realmSelected: true,
    topicsReady: true,
    topicSelected: true,
    subclustersReady: true,
    subclusterSelected: true,
    wordsReady: true,
  }), "word");
  assert.equal(nextSemanticZoomLevel("realm"), "topic");
  assert.equal(nextSemanticZoomLevel("topic"), "subcluster");
  assert.equal(nextSemanticZoomLevel("subcluster"), "word");
});

test("the ten reviewed overview realms keep authored, unique in-frame centers", () => {
  const tiles = lexicalWorldRealmTiles();
  assert.equal(tiles.length, 10);
  assert.equal(new Set(tiles.map(({ focalPoint }) => `${focalPoint.x}:${focalPoint.y}`)).size, 10);
  for (const { focalPoint: point } of tiles) {
    assert.ok(point.x > 0 && point.x < SEMANTIC_ZOOM_WORLD_WIDTH);
    assert.ok(point.y > 0 && point.y < SEMANTIC_ZOOM_WORLD_HEIGHT);
  }
});

test("realm tiles and every deeper semantic field remain inside one shared plane", () => {
  for (const { overviewRect: tile, focalPoint } of lexicalWorldRealmTiles()) {
    assert.ok(tile.x >= 0 && tile.y >= 0);
    assert.ok(tile.x + tile.width <= SEMANTIC_ZOOM_WORLD_WIDTH);
    assert.ok(tile.y + tile.height <= SEMANTIC_ZOOM_WORLD_HEIGHT);

    for (const level of ["topic", "subcluster", "word"] as const) {
      const bounds = semanticZoomBoundsForLevel(level, tile, focalPoint);
      assert.ok(bounds.x >= tile.x && bounds.y >= tile.y);
      assert.ok(bounds.x + bounds.width <= tile.x + tile.width);
      assert.ok(bounds.y + bounds.height <= tile.y + tile.height);
    }
  }
});

test("layout is deterministic and nested nodes stay inside their authored field", () => {
  const tile = lexicalWorldRealmTiles()[0];
  const bounds = semanticZoomBoundsForLevel("subcluster", tile.overviewRect, tile.focalPoint);
  const inputs = Array.from({ length: 31 }, (_, index) => ({ id: `node-${index}`, count: index + 1 }));
  const first = layoutSemanticZoomNodes(inputs, "subcluster", bounds);
  const second = layoutSemanticZoomNodes(inputs, "subcluster", bounds);
  assert.deepEqual(first, second);
  for (const node of first) {
    assert.ok(node.x >= bounds.x && node.x <= bounds.x + bounds.width);
    assert.ok(node.y >= bounds.y && node.y <= bounds.y + bounds.height);
    assert.ok(node.radius > 0);
  }
});

test("zoom-about-point preserves the scene coordinate under the pointer", () => {
  const initial = { centerX: 800, centerY: 450, scale: 1.4 } as const;
  const pointer = { x: 318, y: 240 } as const;
  const before = semanticZoomCamera(initial, DESKTOP);
  const sceneBefore = {
    x: (pointer.x - before.x) / before.scale,
    y: (pointer.y - before.y) / before.scale,
  };
  const next = zoomSemanticViewAboutPoint(initial, 2.6, pointer, DESKTOP);
  const after = semanticZoomCamera(next, DESKTOP);
  const sceneAfter = {
    x: (pointer.x - after.x) / after.scale,
    y: (pointer.y - after.y) / after.scale,
  };
  assert.ok(Math.abs(sceneBefore.x - sceneAfter.x) < 0.0001);
  assert.ok(Math.abs(sceneBefore.y - sceneAfter.y) < 0.0001);
});

test("focus, pan and wheel gestures remain bounded", () => {
  const focused = focusSemanticZoomView({ x: 40, y: 40 }, "word", DESKTOP);
  assert.equal(focused.scale, semanticZoomScaleForLevel("word"));
  const panned = panSemanticZoomView(focused, { x: 100_000, y: -100_000 }, DESKTOP);
  const clamped = clampSemanticZoomView(panned, DESKTOP);
  assert.deepEqual(panned, clamped);
  assert.ok(panned.centerX >= 0 && panned.centerX <= SEMANTIC_ZOOM_WORLD_WIDTH);
  assert.ok(panned.centerY >= 0 && panned.centerY <= SEMANTIC_ZOOM_WORLD_HEIGHT);
  assert.equal(semanticWheelScale(1, 100_000, 0, DESKTOP.height), SEMANTIC_ZOOM_MIN_SCALE);
  assert.ok(semanticWheelScale(1, -120, 0, DESKTOP.height) > 1);
  assert.equal(semanticWheelScale(SEMANTIC_ZOOM_MAX_SCALE, -100_000, 0, DESKTOP.height), SEMANTIC_ZOOM_MAX_SCALE);
});

test("the active layout owns camera bounds instead of the empty shared plane", () => {
  const authoredBounds = { x: 920, y: 280, width: 640, height: 350 } as const;
  const layout = layoutSemanticZoomNodes(
    Array.from({ length: 206 }, (_, index) => ({ id: `artifact-${index}`, count: 1 })),
    "word",
    authoredBounds,
  );
  const activeBounds = semanticZoomLayoutBounds(layout, authoredBounds);
  for (const node of layout) {
    assert.ok(node.x - node.radius >= activeBounds.x - 0.0001);
    assert.ok(node.x + node.radius <= activeBounds.x + activeBounds.width + 0.0001);
    assert.ok(node.y - node.radius >= activeBounds.y - 0.0001);
    assert.ok(node.y + node.radius <= activeBounds.y + activeBounds.height + 0.0001);
  }

  const extreme = panSemanticZoomView(
    { centerX: 0, centerY: 0, scale: semanticZoomScaleForLevel("word") },
    { x: -1_000_000, y: 1_000_000 },
    DESKTOP,
    activeBounds,
  );
  assert.deepEqual(extreme, clampSemanticZoomView(extreme, DESKTOP, activeBounds));
  assert.equal(
    projectSemanticZoomNodes(
      layout,
      semanticZoomCamera(extreme, DESKTOP, activeBounds),
      DESKTOP,
      semanticZoomNodeBudget(DESKTOP.width),
    ).length,
    semanticZoomNodeBudget(DESKTOP.width),
    "an extreme pan must retain a full live batch instead of producing 0 / 206",
  );
});

test("206/1,013-word leaves stay populated and exchange words across six extreme pan directions", () => {
  const directions = [
    { x: -1_000_000, y: 0 },
    { x: 1_000_000, y: 0 },
    { x: 0, y: -1_000_000 },
    { x: 0, y: 1_000_000 },
    { x: -1_000_000, y: -1_000_000 },
    { x: 1_000_000, y: 1_000_000 },
  ] as const;
  const cases = [
    { count: 206, realmId: "objects-technology" },
    { count: 1_013, realmId: "qualities-states" },
  ] as const;

  for (const { count, realmId } of cases) {
    const tile = lexicalWorldRealmTiles().find((candidate) => candidate.realmId === realmId);
    assert.ok(tile);
    const layout = layoutSemanticZoomNodes(
      Array.from({ length: count }, (_, index) => ({ id: `${realmId}-${index}`, count: 1 })),
      "word",
      semanticZoomBoundsForLevel("word", tile.detailRect),
    );
    const activeBounds = semanticZoomLayoutBounds(layout, tile.detailRect);

    for (const viewport of [DESKTOP, { width: 390, height: 562 }] as const) {
      const budget = semanticZoomNodeBudget(viewport.width);
      const start = focusSemanticZoomView({
        x: activeBounds.x + activeBounds.width / 2,
        y: activeBounds.y + activeBounds.height / 2,
      }, "word", viewport, activeBounds);
      const samples = directions.map((delta) => {
        const panned = panSemanticZoomView(start, delta, viewport, activeBounds);
        assert.deepEqual(panned, clampSemanticZoomView(panned, viewport, activeBounds));
        const visible = projectSemanticZoomNodes(
          layout,
          semanticZoomCamera(panned, viewport, activeBounds),
          viewport,
          budget,
        );
        assert.equal(
          visible.length,
          budget,
          `${count} words / ${viewport.width}px / ${delta.x}:${delta.y} must never reach an empty batch`,
        );
        return new Set(visible.map(({ node }) => node.id));
      });
      const horizontalUnion = new Set([...samples[0], ...samples[1]]);
      assert.ok(
        horizontalUnion.size >= Math.min(count, Math.ceil(budget * 1.5)),
        `${count} words / ${viewport.width}px should exchange at least half a live batch between horizontal extremes`,
      );
    }
  }
});

test("a reviewed spatial lexeme enters its exact semantic realm without guessing", () => {
  const realms = layoutSemanticZoomNodes([
    { id: "nature-life", count: 2_300, authoredPoint: { x: 240, y: 180 } },
    { id: "objects-technology", count: 2_100, authoredPoint: { x: 1_000, y: 430 } },
  ], "realm");

  const entry = resolveSemanticZoomRealmEntry(realms, "objects-technology", DESKTOP);
  assert.ok(entry);
  assert.equal(entry.node.node.id, "objects-technology");
  assert.equal(entry.view.scale, semanticZoomScaleForLevel("topic"));
  assert.deepEqual(
    { centerX: entry.view.centerX, centerY: entry.view.centerY },
    { centerX: 1_000, centerY: 430 },
    "the authored point is focused, subject only to world-edge clamping",
  );
  assert.equal(resolveSemanticZoomRealmEntry(realms, "unreviewed-realm", DESKTOP), null);
  assert.equal(resolveSemanticZoomRealmEntry(realms, undefined, DESKTOP), null);
});

test("rapid wheel input accumulates against the pending target scale", () => {
  const firstTarget = semanticWheelScale(1, -120, 0, DESKTOP.height);
  const secondTarget = semanticWheelScale(firstTarget, -120, 0, DESKTOP.height);
  const staleVisibleTarget = semanticWheelScale(1, -120, 0, DESKTOP.height);
  assert.ok(secondTarget > firstTarget);
  assert.ok(secondTarget > staleVisibleTarget);
});

test("camera smoothing is monotonic, frame-rate independent and never overshoots", () => {
  const start = { centerX: 300, centerY: 240, scale: 1 };
  const target = { centerX: 1100, centerY: 680, scale: 4.2 };
  let current = start;
  for (let index = 0; index < 90; index += 1) {
    const next = smoothSemanticZoomView(current, target, 16);
    assert.ok(next.centerX >= current.centerX && next.centerX <= target.centerX);
    assert.ok(next.centerY >= current.centerY && next.centerY <= target.centerY);
    assert.ok(next.scale >= current.scale && next.scale <= target.scale);
    current = next;
  }
  assert.ok(Math.abs(current.centerX - target.centerX) < 0.02);
  assert.ok(Math.abs(current.centerY - target.centerY) < 0.02);
  assert.ok(Math.abs(current.scale - target.scale) < 0.001);

  const oneFrame = smoothSemanticZoomView(start, target, 32);
  const twoFrames = smoothSemanticZoomView(smoothSemanticZoomView(start, target, 16), target, 16);
  assert.ok(Math.abs(oneFrame.centerX - twoFrames.centerX) < 0.0001);
  assert.ok(Math.abs(oneFrame.scale - twoFrames.scale) < 0.0001);
  assert.throws(() => smoothSemanticZoomView(start, target, -1), /negative/);
});

test("screen projection enforces the 40/80 live-node budgets", () => {
  assert.equal(semanticZoomNodeBudget(819), 40);
  assert.equal(semanticZoomNodeBudget(820), 80);
  const nodes = layoutSemanticZoomNodes(
    Array.from({ length: 240 }, (_, index) => ({ id: `word-${index}`, count: 1 })),
    "word",
    { x: 0, y: 0, width: SEMANTIC_ZOOM_WORLD_WIDTH, height: SEMANTIC_ZOOM_WORLD_HEIGHT },
  );
  const camera = semanticZoomCamera({ centerX: 800, centerY: 450, scale: 1 }, DESKTOP);
  assert.ok(projectSemanticZoomNodes(nodes, camera, DESKTOP).length <= 80);
  assert.ok(projectSemanticZoomNodes(nodes, camera, { width: 390, height: 700 }).length <= 40);
});

test("diagram shelves select the nearest live batch without spatial viewport culling", () => {
  const viewport = { width: 1200, height: 675 };
  const layout = layoutSemanticZoomNodes(
    Array.from({ length: 120 }, (_, index) => ({ id: `diagram-${index}`, count: 1 })),
    "word",
    { x: 0, y: 0, width: SEMANTIC_ZOOM_WORLD_WIDTH, height: SEMANTIC_ZOOM_WORLD_HEIGHT },
  );
  const leftCamera = semanticZoomCamera({ centerX: 250, centerY: 450, scale: 4 }, viewport);
  const rightCamera = semanticZoomCamera({ centerX: 1_350, centerY: 450, scale: 4 }, viewport);
  const spatial = projectSemanticZoomNodes(layout, leftCamera, viewport, 80);
  const leftShelf = projectSemanticZoomNodes(layout, leftCamera, viewport, 80, "shelf");
  const rightShelf = projectSemanticZoomNodes(layout, rightCamera, viewport, 80, "shelf");

  assert.ok(spatial.length < 80, "the legacy photo projection remains spatially culled");
  assert.equal(leftShelf.length, 80);
  assert.equal(rightShelf.length, 80);
  assert.notDeepEqual(
    leftShelf.map(({ node }) => node.id),
    rightShelf.map(({ node }) => node.id),
    "panning a diagram must exchange the nearest shelf batch",
  );
});

test("exploration progress reports the real leaf total and the gesture that reveals more", () => {
  assert.deepEqual(semanticZoomExplorationProgress("word", 1_013, 40), {
    visibleCount: 40,
    totalCount: 1_013,
    remainingCount: 973,
    action: "pan",
  });
  assert.deepEqual(semanticZoomExplorationProgress("word", 40, 40), {
    visibleCount: 40,
    totalCount: 40,
    remainingCount: 0,
    action: "complete",
  });
  assert.equal(semanticZoomExplorationProgress("topic", 120, 80).action, "pan-zoom");
  assert.equal(semanticZoomExplorationProgress("subcluster", 12, 12).action, "zoom");
  assert.deepEqual(semanticZoomExplorationProgress("word", -1, Number.NaN), {
    visibleCount: 0,
    totalCount: 0,
    remainingCount: 0,
    action: "complete",
  });
});

test("a 1,013-word leaf spatially samples different words as the same plane is panned", () => {
  const bounds = lexicalWorldRealmTiles().find(({ realmId }) => realmId === "qualities-states")?.detailRect;
  assert.ok(bounds);
  const layout = layoutSemanticZoomNodes(
    Array.from({ length: 1_013 }, (_, index) => ({ id: `quality-${index}`, count: 1 })),
    "word",
    semanticZoomBoundsForLevel("word", bounds),
  );
  for (const viewport of [DESKTOP, { width: 390, height: 562 }] as const) {
    const budget = semanticZoomNodeBudget(viewport.width);
    const y = bounds.y + bounds.height / 2;
    const samples = [0.25, 0.5, 0.75].map((fraction) => new Set(projectSemanticZoomNodes(
      layout,
      semanticZoomCamera({
        centerX: bounds.x + bounds.width * fraction,
        centerY: y,
        scale: SEMANTIC_ZOOM_MAX_SCALE,
      }, viewport),
      viewport,
      budget,
    ).map(({ node }) => node.id)));
    assert.ok(samples.every((sample) => sample.size === budget));
    const union = new Set(samples.flatMap((sample) => [...sample]));
    assert.ok(union.size > budget * 2, `${viewport.width}px viewport should reveal new words while panning`);
  }
});

function assertPlacedNodesDoNotOverlap(
  nodes: readonly { screenX: number; screenY: number; boxWidth: number; boxHeight: number }[],
  viewport: { width: number; height: number },
  protectedRegions: readonly { x: number; y: number; width: number; height: number }[],
) {
  for (const [index, node] of nodes.entries()) {
    assert.ok(node.screenX - node.boxWidth / 2 >= 0);
    assert.ok(node.screenX + node.boxWidth / 2 <= viewport.width);
    assert.ok(node.screenY - node.boxHeight / 2 >= 0);
    assert.ok(node.screenY + node.boxHeight / 2 <= viewport.height);
    for (const other of nodes.slice(index + 1)) {
      assert.ok(
        Math.abs(node.screenX - other.screenX) >= (node.boxWidth + other.boxWidth) / 2
        || Math.abs(node.screenY - other.screenY) >= (node.boxHeight + other.boxHeight) / 2,
      );
    }
    for (const region of protectedRegions) {
      assert.ok(
        node.screenX + node.boxWidth / 2 <= region.x
        || node.screenX - node.boxWidth / 2 >= region.x + region.width
        || node.screenY + node.boxHeight / 2 <= region.y
        || node.screenY - node.boxHeight / 2 >= region.y + region.height,
      );
    }
  }
}

test("mobile realm pills deterministically avoid each other, chrome and status", () => {
  const viewport = { width: 390, height: 780 };
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 94 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const realmInputs = lexicalWorldRealmTiles().map((tile) => ({
    id: tile.realmId,
    count: 1,
    authoredPoint: tile.focalPoint,
  }));
  const projected = projectSemanticZoomNodes(
    layoutSemanticZoomNodes(realmInputs, "realm"),
    semanticZoomCamera({ centerX: 800, centerY: 450, scale: 1 }, viewport),
    viewport,
    40,
  );
  const placed = placeSemanticZoomNodes(projected, viewport, "realm", { expanded: true, protectedRegions });
  assert.equal(placed.length, 10);
  assert.deepEqual(placed, placeSemanticZoomNodes(projected, viewport, "realm", { expanded: true, protectedRegions }));
  assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
});

test("an eighty-word desktop batch stays collision-free in screen space", () => {
  const viewport = { width: 1200, height: 675 };
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 88 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const layout = layoutSemanticZoomNodes(
    Array.from({ length: 80 }, (_, index) => ({ id: `dense-word-${index}`, count: 1 })),
    "word",
    { x: 0, y: 0, width: SEMANTIC_ZOOM_WORLD_WIDTH, height: SEMANTIC_ZOOM_WORLD_HEIGHT },
  );
  const projected = projectSemanticZoomNodes(
    layout,
    semanticZoomCamera({ centerX: 800, centerY: 450, scale: 1 }, viewport),
    viewport,
    80,
  );
  assert.equal(projected.length, 80);
  const placed = placeSemanticZoomNodes(projected, viewport, "word", { expanded: true, protectedRegions });
  assert.equal(placed.length, 80);
  assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
});

test("a short mobile field drops overflow instead of forcing forty word pills to overlap", () => {
  const viewport = { width: 390, height: 562 };
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 94 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const layout = layoutSemanticZoomNodes(
    Array.from({ length: 40 }, (_, index) => ({ id: `mobile-word-${index}`, count: 1 })),
    "word",
    { x: 0, y: 0, width: SEMANTIC_ZOOM_WORLD_WIDTH, height: SEMANTIC_ZOOM_WORLD_HEIGHT },
  );
  const projected = projectSemanticZoomNodes(
    layout,
    semanticZoomCamera({ centerX: 800, centerY: 450, scale: 1 }, viewport),
    viewport,
    40,
  );
  for (const expanded of [false, true]) {
    const placed = placeSemanticZoomNodes(projected, viewport, "word", { expanded, protectedRegions });
    assert.ok(placed.length > 0 && placed.length <= 40);
    assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
  }
});

test("word card footprints preserve complete English and translated copy at native font sizes", () => {
  const six = { id: "six", count: 1, labelEn: "six", labelZh: "num. 六, 六个" };
  const millions = {
    id: "millions",
    count: 1,
    labelEn: "millions",
    labelZh: "n. 数百万",
  };
  const longCopy = {
    id: "gross",
    count: 1,
    labelEn: "characteristically",
    labelZh: "n. 总数, 总量\na. 总共的, 未打折扣的, 恶劣的, 粗野的\nvt. 总共收入",
  };

  const desktopSix = semanticZoomNodeBox(six, "word", DESKTOP.width, true);
  const desktopMillions = semanticZoomNodeBox(millions, "word", DESKTOP.width, true);
  const desktopLong = semanticZoomNodeBox(longCopy, "word", DESKTOP.width, true);
  const collapsed = semanticZoomNodeBox(longCopy, "word", DESKTOP.width, false);
  const mobileLong = semanticZoomNodeBox(longCopy, "word", 390, true);

  assert.ok(desktopSix.width >= 148 && desktopSix.height >= 54);
  assert.ok(desktopMillions.width >= 148 && desktopMillions.height >= 54);
  assert.ok(desktopLong.width <= 220 && desktopLong.height > desktopSix.height);
  assert.ok(collapsed.height < desktopLong.height);
  assert.ok(mobileLong.width >= 142 && mobileLong.width <= 176);
  assert.ok(mobileLong.height >= desktopLong.height);
});

test("truthful word footprints trade density for non-overlapping readable cards", () => {
  const samples = [
    { labelEn: "six", labelZh: "num. 六, 六个" },
    { labelEn: "millions", labelZh: "n. 数百万" },
    {
      labelEn: "characteristically",
      labelZh: "n. 总数, 总量\na. 总共的, 未打折扣的, 恶劣的, 粗野的\nvt. 总共收入",
    },
  ];
  for (const viewport of [DESKTOP, { width: 390, height: 562 }] as const) {
    const protectedRegions = [
      { x: 0, y: 0, width: viewport.width, height: viewport.width < 820 ? 94 : 88 },
      { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
    ];
    const projected = Array.from({ length: semanticZoomNodeBudget(viewport.width) }, (_, index) => ({
      node: {
        id: `readable-${index}`,
        count: 1,
        ...samples[index % samples.length],
      },
      x: 0,
      y: 0,
      radius: 12,
      screenX: (index * 137) % viewport.width,
      screenY: (index * 83) % viewport.height,
    }));
    const placed = placeSemanticZoomNodes(projected, viewport, "word", {
      expanded: true,
      protectedRegions,
    });
    assert.ok(placed.length > 0);
    assert.ok(placed.length < projected.length, "readability may lower the 40/80 upper budget");
    assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
    for (const card of placed) {
      assert.deepEqual(
        { width: card.boxWidth, height: card.boxHeight },
        semanticZoomNodeBox(card.node, "word", viewport.width, true),
      );
    }
  }
});

test("all semantic card CSS overrides ellipsis without shrinking screen-space typography", () => {
  const css = readFileSync(new URL("app/components/lexical-world.css", ROOT), "utf8");
  const start = css.indexOf("/* Every semantic card stays at native screen size");
  const end = css.indexOf(".lexical-world__word-detail", start);
  assert.ok(start >= 0 && end > start);
  const wordRules = css.slice(start, end);
  assert.doesNotMatch(wordRules, /ellipsis/u);
  assert.match(wordRules, /font-size: \.9rem;[\s\S]*?line-height: 17px;/u);
  assert.match(wordRules, /text-overflow: clip;[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/u);
  assert.match(wordRules, /font-size: \.75rem;[\s\S]*?line-height: 15px;/u);
  assert.match(wordRules, /white-space: pre-wrap;[\s\S]*?overflow-wrap: anywhere;/u);
});

test("the real ten realms remain two-column readable on a 390×562 field", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("public/data/lexical-world/manifest.json", ROOT),
    "utf8",
  )) as {
    children: Array<{ id: string; count: number; labelEn: string; labelZh: string }>;
  };
  const viewport = { width: 390, height: 562 };
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 94 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const projected = manifest.children.map((node, index) => ({
    node,
    x: 0,
    y: 0,
    radius: 12,
    screenX: 30 + (index % 2) * 330,
    screenY: 110 + Math.floor(index / 2) * 78,
  }));
  const placed = placeSemanticZoomNodes(projected, viewport, "realm", {
    expanded: true,
    protectedRegions,
  });
  assert.equal(manifest.children.length, 10);
  assert.equal(placed.length, 10);
  assert.ok(placed.every(({ boxWidth, boxHeight }) => boxWidth <= 176 && boxHeight >= 44));
  assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
});

test("the real 43-word Integer leaf is not padded to its single largest translation", () => {
  const shard = JSON.parse(readFileSync(
    new URL("public/data/semantic/topics/number-measure.json", ROOT),
    "utf8",
  )) as {
    nodes: Array<{ id: string; word: string; meaning: string; subclusterId: string }>;
  };
  const integerWords = shard.nodes.filter(({ subclusterId }) => subclusterId === "number-measure--integer");
  const viewport = { width: 390, height: 562 };
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 94 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const projected = integerWords.slice(0, semanticZoomNodeBudget(viewport.width)).map((word, index) => ({
    node: { id: word.id, count: 1, labelEn: word.word, labelZh: word.meaning },
    x: 0,
    y: 0,
    radius: 10,
    screenX: 20 + (index % 2) * 350,
    screenY: 105 + (index % 6) * 68,
  }));
  const placed = placeSemanticZoomNodes(projected, viewport, "word", {
    expanded: true,
    protectedRegions,
  });
  assert.equal(integerWords.length, 43);
  assert.ok(placed.length >= 10 && placed.length <= 40);
  assert.ok(new Set(placed.map(({ boxHeight }) => boxHeight)).size > 1);
  assert.ok(placed.filter(({ boxHeight }) => boxHeight <= 54).length >= 8);
  assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
});

test("the real Integer diagram fills every safe desktop shelf slot", () => {
  const shard = JSON.parse(readFileSync(
    new URL("public/data/semantic/topics/number-measure.json", ROOT),
    "utf8",
  )) as {
    nodes: Array<{ id: string; word: string; meaning: string; subclusterId: string }>;
  };
  const integerWords = shard.nodes
    .filter(({ subclusterId }) => subclusterId === "number-measure--integer")
    .map((word) => ({ id: word.id, count: 1, labelEn: word.word, labelZh: word.meaning }));
  const viewport = DESKTOP;
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 88 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const layout = layoutSemanticZoomNodes(
    integerWords,
    "word",
    { x: 920, y: 280, width: 640, height: 350 },
  );
  const camera = semanticZoomCamera(
    { centerX: 1_500, centerY: 455, scale: semanticZoomScaleForLevel("word") },
    viewport,
  );
  const projected = projectSemanticZoomNodes(layout, camera, viewport, 80, "shelf");
  const placed = placeSemanticZoomNodes(projected, viewport, "word", {
    expanded: true,
    protectedRegions,
  });

  assert.equal(integerWords.length, 43);
  assert.equal(projected.length, 43);
  assert.ok(placed.length >= 40, `expected at least 40 readable Integer cards, got ${placed.length}`);
  assertPlacedNodesDoNotOverlap(placed, viewport, protectedRegions);
});

test("a single safe vertical band centers its complete shelf stack", () => {
  const viewport = DESKTOP;
  const protectedRegions = [
    { x: 0, y: 0, width: viewport.width, height: 88 },
    { x: 0, y: viewport.height - 58, width: viewport.width, height: 58 },
  ];
  const nodes = Array.from({ length: 4 }, (_, index) => ({
    node: { id: `centered-${index}`, count: 1, labelEn: `Topic ${index}`, labelZh: `主题 ${index}` },
    x: 0,
    y: 0,
    radius: 12,
    screenX: 150 + index * 280,
    screenY: 120,
  }));
  const placed = placeSemanticZoomNodes(nodes, viewport, "topic", {
    expanded: true,
    protectedRegions,
  });
  const usableStart = 88 + 7;
  const usableEnd = viewport.height - 58 - 7;
  const occupiedTop = Math.min(...placed.map(({ screenY, boxHeight }) => screenY - boxHeight / 2));
  const occupiedBottom = Math.max(...placed.map(({ screenY, boxHeight }) => screenY + boxHeight / 2));

  assert.equal(placed.length, 4);
  assert.ok(Math.abs((occupiedTop - usableStart) - (usableEnd - occupiedBottom)) < 0.001);
});

test("mobile diagrams hide decorative backdrop copy outside the card contract", () => {
  const css = readFileSync(new URL("app/components/semantic-zoom-field.css", ROOT), "utf8");
  const mobileRules = css.slice(css.indexOf("@media (max-width: 819px)"));
  assert.match(
    mobileRules,
    /\.semantic-zoom-field__backdrop-copy\s*\{\s*display:\s*none;\s*\}/u,
  );
});

test("nearest node resolves activation intent without changing layout order", () => {
  const nodes = layoutSemanticZoomNodes([
    { id: "left", count: 10 },
    { id: "right", count: 10 },
  ], "topic", { x: 100, y: 100, width: 600, height: 300 });
  assert.equal(nearestSemanticZoomNode(nodes, { x: nodes[1].x + 1, y: nodes[1].y + 1 })?.node.id, "right");
  assert.equal(nearestSemanticZoomNode([], { x: 0, y: 0 }), undefined);
});
