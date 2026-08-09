import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidSceneGraph,
  validateSceneGraph,
} from "../../app/domain/sceneGraph";
import type { Scene } from "../../app/domain/types";

const child: Scene = {
  id: "kitchen",
  title: "Kitchen",
  subtitle: "Food and tools",
  asset: "/scenes/kitchen.svg",
  width: 1_000,
  height: 800,
  parentId: "apartment",
  initialCamera: { x: 0, y: 0, scale: 1 },
  labels: [
    {
      id: "sink",
      word: "sink",
      translation: "水槽",
      x: 400,
      y: 500,
      priority: 1,
      minScale: 1,
    },
  ],
  portals: [],
};

const root: Scene = {
  id: "apartment",
  title: "Apartment",
  subtitle: "Home",
  asset: "/scenes/apartment.svg",
  width: 1_200,
  height: 900,
  initialCamera: { x: 0, y: 0, scale: 1 },
  labels: [],
  portals: [
    {
      id: "to-kitchen",
      label: "Enter the kitchen",
      childSceneId: "kitchen",
      x: 200,
      y: 100,
      width: 400,
      height: 500,
      entryCamera: { x: 0, y: 0, scale: 1 },
    },
  ],
};

test("a consistent rooted scene graph is valid", () => {
  const result = validateSceneGraph([root, child]);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.doesNotThrow(() => assertValidSceneGraph([root, child]));
});

test("detects dangling child references", () => {
  const brokenRoot: Scene = {
    ...root,
    portals: [{ ...root.portals[0], childSceneId: "missing" }],
  };
  const result = validateSceneGraph([brokenRoot]);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "portal.missing-child"));
});

test("detects parent cycles and absence of a root", () => {
  const a: Scene = {
    ...root,
    id: "a",
    parentId: "b",
    portals: [
      { ...root.portals[0], id: "to-b", childSceneId: "b" },
    ],
  };
  const b: Scene = {
    ...child,
    id: "b",
    parentId: "a",
    portals: [
      { ...root.portals[0], id: "to-a", childSceneId: "a" },
    ],
  };
  const result = validateSceneGraph([a, b]);
  assert.ok(result.issues.some((issue) => issue.code === "graph.parent-cycle"));
  assert.ok(result.issues.some((issue) => issue.code === "graph.root-count"));
});

test("detects invalid local data and child-parent mismatches", () => {
  const brokenChild: Scene = {
    ...child,
    parentId: "elsewhere",
    labels: [
      { ...child.labels[0], x: 2_000, minScale: 3, maxScale: 2 },
    ],
  };
  const result = validateSceneGraph([root, brokenChild]);
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert.ok(codes.has("label.out-of-bounds"));
  assert.ok(codes.has("label.invalid-scale-range"));
  assert.ok(codes.has("portal.parent-mismatch"));
  assert.ok(codes.has("scene.missing-parent"));
});

