import assert from "node:assert/strict";
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
  semanticWheelScale,
  semanticZoomBoundsForLevel,
  semanticZoomCamera,
  semanticZoomDisplayLevel,
  semanticZoomLevelForScale,
  semanticZoomNodeBudget,
  semanticZoomScaleForLevel,
  smoothSemanticZoomView,
  zoomSemanticViewAboutPoint,
} from "../../app/domain/semanticZoom";
import { lexicalWorldRealmTiles } from "../../app/lib/lexical-world-visuals";

const DESKTOP = { width: 1200, height: 675 } as const;

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

test("nearest node resolves activation intent without changing layout order", () => {
  const nodes = layoutSemanticZoomNodes([
    { id: "left", count: 10 },
    { id: "right", count: 10 },
  ], "topic", { x: 100, y: 100, width: 600, height: 300 });
  assert.equal(nearestSemanticZoomNode(nodes, { x: nodes[1].x + 1, y: nodes[1].y + 1 })?.node.id, "right");
  assert.equal(nearestSemanticZoomNode([], { x: 0, y: 0 }), undefined);
});
