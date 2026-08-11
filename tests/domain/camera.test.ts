import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_SCENE_CAMERA_MAX_SCALE,
  clampCamera,
  maximumSceneCameraScale,
  NATIVE_SCENE_EFFECTIVE_MAX_SCALE,
  sceneToViewport,
  smoothCameraTowards,
  viewportToScene,
  zoomCameraAboutPoint,
} from "../../app/domain/camera";

test("responsive scene ceiling preserves native high-tier detail on narrow viewports", () => {
  assert.equal(maximumSceneCameraScale(0.8), BASE_SCENE_CAMERA_MAX_SCALE);
  assert.equal(maximumSceneCameraScale(0.24375), NATIVE_SCENE_EFFECTIVE_MAX_SCALE / 0.24375);
  assert.equal(maximumSceneCameraScale(0.24375) * 0.24375, 2);
  assert.throws(() => maximumSceneCameraScale(0), RangeError);
});

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

test("camera smoothing is stable across different frame rates", () => {
  const camera = { x: -300, y: 80, scale: 0.8 };
  const target = { x: 120, y: -240, scale: 3.2 };
  const oneFrame = smoothCameraTowards(camera, target, 16, 60);
  const twoFrames = smoothCameraTowards(
    smoothCameraTowards(camera, target, 8, 60),
    target,
    8,
    60,
  );
  assert.ok(Math.abs(oneFrame.x - twoFrames.x) < 1e-10);
  assert.ok(Math.abs(oneFrame.y - twoFrames.y) < 1e-10);
  assert.ok(Math.abs(oneFrame.scale - twoFrames.scale) < 1e-10);
  assert.ok(oneFrame.scale > camera.scale && oneFrame.scale < target.scale);
});

test("camera smoothing validates timing inputs", () => {
  const camera = { x: 0, y: 0, scale: 1 };
  assert.throws(() => smoothCameraTowards(camera, camera, -1, 60), RangeError);
  assert.throws(() => smoothCameraTowards(camera, camera, 16, 0), RangeError);
});

test("camera smoothing is monotonic, bounded and symmetric in log scale", () => {
  const target = { x: -420, y: 260, scale: 4 };
  const zoomIn = [{ x: 80, y: -120, scale: 1 }];
  for (let frame = 0; frame < 20; frame += 1) {
    zoomIn.push(smoothCameraTowards(zoomIn.at(-1)!, target, 16, 52));
  }
  for (let frame = 1; frame < zoomIn.length; frame += 1) {
    assert.ok(zoomIn[frame].scale > zoomIn[frame - 1].scale);
    assert.ok(zoomIn[frame].scale < target.scale);
    assert.ok(zoomIn[frame].x < zoomIn[frame - 1].x && zoomIn[frame].x > target.x);
    assert.ok(zoomIn[frame].y > zoomIn[frame - 1].y && zoomIn[frame].y < target.y);
  }

  const zoomOut = smoothCameraTowards(
    { x: 0, y: 0, scale: 4 },
    { x: 0, y: 0, scale: 1 },
    16,
    52,
  );
  const zoomInLogStep = Math.abs(Math.log(zoomIn[1].scale) - Math.log(1));
  const zoomOutLogStep = Math.abs(Math.log(zoomOut.scale) - Math.log(4));
  assert.ok(Math.abs(zoomInLogStep - zoomOutLogStep) < 1e-12);
});
