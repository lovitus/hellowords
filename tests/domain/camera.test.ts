import assert from "node:assert/strict";
import test from "node:test";
import {
  clampCamera,
  sceneToViewport,
  viewportToScene,
  zoomCameraAboutPoint,
} from "../../app/domain/camera";

test("zoom about a point preserves the scene coordinate under the pointer", () => {
  const camera = { x: -300, y: -120, scale: 2 };
  const pointer = { x: 240, y: 180 };
  const scenePoint = viewportToScene(camera, pointer);
  const zoomed = zoomCameraAboutPoint(camera, 5, pointer);

  assert.deepEqual(sceneToViewport(zoomed, scenePoint), pointer);
});

test("clamp centers content smaller than the viewport", () => {
  assert.deepEqual(
    clampCamera(
      { x: 999, y: -999, scale: 1 },
      {
        viewportWidth: 800,
        viewportHeight: 600,
        contentWidth: 400,
        contentHeight: 200,
        minScale: 0.5,
        maxScale: 4,
      },
    ),
    { x: 200, y: 200, scale: 1 },
  );
});

test("clamp constrains translation and scale for oversized content", () => {
  assert.deepEqual(
    clampCamera(
      { x: -5_000, y: 100, scale: 8 },
      {
        viewportWidth: 800,
        viewportHeight: 600,
        contentWidth: 1_000,
        contentHeight: 800,
        minScale: 1,
        maxScale: 3,
        padding: 20,
      },
    ),
    { x: -2_220, y: 20, scale: 3 },
  );
});

test("invalid scales are rejected", () => {
  assert.throws(
    () => zoomCameraAboutPoint({ x: 0, y: 0, scale: 1 }, 0, { x: 0, y: 0 }),
    RangeError,
  );
});

