import assert from "node:assert/strict";
import test from "node:test";
import {
  computeScenePlacements,
  type Label,
  type SceneLabelLayoutItem,
} from "../../app/domain";

const VIEWPORT = { width: 1440, height: 900, compact: false };

test("a focused zone's word that is crowded out without priority is placed with priority", () => {
  const labels = scatteredLabels(420, 7);
  const camera = { x: 0, y: 0, fit: 1, scale: 1 };
  const without = computeScenePlacements(labels, camera, VIEWPORT, false);
  const hidden = without.find((item) => item.opacity <= 0);
  assert.ok(hidden, "the dense fixture must crowd at least one word out");
  const withPriority = computeScenePlacements(labels, camera, VIEWPORT, false, {
    priorityLabelIds: new Set([hidden.id]),
  });
  const placed = withPriority.find((item) => item.id === hidden.id);
  assert.ok(placed && placed.opacity > 0, "the focused zone's word must not be dropped for nearer words");
});

function scatteredLabels(count: number, seed: number): Label[] {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => ({
    id: `label-${index}`,
    word: `word ${index}`,
    translation: `词${index}`,
    x: 80 + next() * 1440,
    y: 60 + next() * 780,
    priority: index,
    minLevel: (index % 5) as 0 | 1 | 2 | 3 | 4,
  }));
}

interface Box { left: number; right: number; top: number; bottom: number }
interface Leader { x1: number; y1: number; x2: number; y2: number }

function visibleBoxes(items: readonly SceneLabelLayoutItem[]) {
  const boxes: Array<{ id: string; box: Box; leader: Leader }> = [];
  for (const item of items) {
    if (item.opacity <= 0) continue;
    const box = {
      left: item.screenX - item.width / 2,
      right: item.screenX + item.width / 2,
      top: item.screenY - item.height / 2,
      bottom: item.screenY + item.height / 2,
    };
    const leader = {
      x1: item.screenX - item.offsetX,
      y1: item.screenY - item.offsetY,
      x2: item.screenX,
      y2: item.screenY,
    };
    boxes.push({ id: item.id, box, leader });
  }
  return boxes;
}

function boxesOverlap(first: Box, second: Box): boolean {
  return first.left < second.right && first.right > second.left
    && first.top < second.bottom && first.bottom > second.top;
}

function cross(ax: number, ay: number, bx: number, by: number) {
  return ax * by - ay * bx;
}

function leadersCross(first: Leader, second: Leader): boolean {
  const d1 = cross(second.x2 - second.x1, second.y2 - second.y1, first.x1 - second.x1, first.y1 - second.y1);
  const d2 = cross(second.x2 - second.x1, second.y2 - second.y1, first.x2 - second.x1, first.y2 - second.y1);
  const d3 = cross(first.x2 - first.x1, first.y2 - first.y1, second.x1 - first.x1, second.y1 - first.y1);
  const d4 = cross(first.x2 - first.x1, first.y2 - first.y1, second.x2 - first.x1, second.y2 - first.y1);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function leaderCrossesBox(leader: Leader, box: Box): boolean {
  const inside = (x: number, y: number) => x > box.left && x < box.right && y > box.top && y < box.bottom;
  if (inside(leader.x1, leader.y1) || inside(leader.x2, leader.y2)) return true;
  const edges: Leader[] = [
    { x1: box.left, y1: box.top, x2: box.right, y2: box.top },
    { x1: box.right, y1: box.top, x2: box.right, y2: box.bottom },
    { x1: box.right, y1: box.bottom, x2: box.left, y2: box.bottom },
    { x1: box.left, y1: box.bottom, x2: box.left, y2: box.top },
  ];
  return edges.some((edge) => leadersCross(leader, edge));
}

const CAMERAS = [
  { x: 0, y: 0, fit: 0.55, scale: 1 },
  { x: -120, y: -40, fit: 0.55, scale: 1.8 },
  { x: 40, y: 20, fit: 0.55, scale: 3.2 },
];

test("visible callouts never overlap each other or the viewport edge", () => {
  const labels = scatteredLabels(180, 7);
  for (const camera of CAMERAS) {
    const boxes = visibleBoxes(computeScenePlacements(labels, camera, VIEWPORT, true));
    assert.ok(boxes.length > 0, "dense scene should place at least one callout");
    for (const { box } of boxes) {
      assert.ok(box.left >= 0 && box.right <= VIEWPORT.width && box.top >= 0 && box.bottom <= VIEWPORT.height);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        assert.equal(boxesOverlap(boxes[i].box, boxes[j].box), false, `${boxes[i].id} overlaps ${boxes[j].id}`);
      }
    }
  }
});

test("leaders never cross another leader or cover another callout", () => {
  const labels = scatteredLabels(180, 11);
  for (const camera of CAMERAS) {
    const boxes = visibleBoxes(computeScenePlacements(labels, camera, VIEWPORT, true));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = 0; j < boxes.length; j += 1) {
        if (i === j) continue;
        if (i < j) assert.equal(leadersCross(boxes[i].leader, boxes[j].leader), false, `${boxes[i].id} crosses ${boxes[j].id}`);
        assert.equal(leaderCrossesBox(boxes[i].leader, boxes[j].box), false, `${boxes[i].id} leader covers ${boxes[j].id}`);
      }
    }
  }
});

test("placement depends only on the current camera, not on earlier frames", () => {
  const labels = scatteredLabels(160, 3);
  const first = computeScenePlacements(labels, CAMERAS[0], VIEWPORT, true);
  computeScenePlacements(labels, CAMERAS[2], VIEWPORT, true);
  computeScenePlacements(labels, CAMERAS[1], VIEWPORT, false);
  const again = computeScenePlacements(labels, CAMERAS[0], VIEWPORT, true);
  assert.deepEqual(again, first);
});

test("a sparse scene shows every word", () => {
  const labels: Label[] = Array.from({ length: 12 }, (_, index) => ({
    id: `sparse-${index}`,
    word: `spare ${index}`,
    translation: "",
    x: 120 + (index % 4) * 320,
    y: 150 + Math.floor(index / 4) * 250,
    priority: index,
    minLevel: 0 as const,
  }));
  const items = computeScenePlacements(labels, { x: 0, y: 0, fit: 1, scale: 1 }, VIEWPORT, false);
  assert.equal(items.filter((item) => item.opacity > 0).length, labels.length);
});

test("the selected word keeps its slot in a crowded cluster", () => {
  const labels = scatteredLabels(220, 5);
  const target = labels[labels.length - 1];
  const items = computeScenePlacements(labels, CAMERAS[0], VIEWPORT, true, { selectedLabelId: target.id });
  const selected = items.find((item) => item.id === target.id);
  assert.ok(selected && selected.opacity > 0);
});

test("protected chrome regions stay free of callouts", () => {
  const labels = scatteredLabels(160, 9);
  const protectedRegions = [{ left: 480, right: 960, top: 300, bottom: 600 }];
  const items = computeScenePlacements(labels, CAMERAS[0], VIEWPORT, true, { protectedRegions });
  for (const { box } of visibleBoxes(items)) {
    const overlaps = box.left < protectedRegions[0].right && box.right > protectedRegions[0].left
      && box.top < protectedRegions[0].bottom && box.bottom > protectedRegions[0].top;
    assert.equal(overlaps, false);
  }
});

test("every callout's leader ends exactly on its scene anchor", () => {
  const labels = scatteredLabels(120, 13);
  for (const camera of CAMERAS) {
    const items = computeScenePlacements(labels, camera, VIEWPORT, true);
    for (const item of items) {
      if (item.opacity <= 0) continue;
      const label = labels.find(({ id }) => id === item.id)!;
      const scale = camera.fit * camera.scale;
      assert.ok(Math.abs(item.screenX - item.offsetX - (camera.x + label.x * scale)) < 1e-9);
      assert.ok(Math.abs(item.screenY - item.offsetY - (camera.y + label.y * scale)) < 1e-9);
    }
  }
});
