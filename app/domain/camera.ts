import type { Camera, Point } from "./types";

/** Existing authored LOD/portal scale ceiling on viewports with ample pixels. */
export const BASE_SCENE_CAMERA_MAX_SCALE = 4.15;

/**
 * The high atlas provides two source pixels per logical scene pixel. Keeping
 * that native CSS-pixel detail reachable prevents a narrow viewport from
 * stopping at a much coarser crop than desktop merely because its contain-fit
 * factor is smaller.
 */
export const NATIVE_SCENE_EFFECTIVE_MAX_SCALE = 2;

export interface CameraClampBounds {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly minScale: number;
  readonly maxScale: number;
  /** Visible breathing room permitted beyond each viewport edge. */
  readonly padding?: number;
}

const finite = (value: number, name: string): number => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
  return value;
};

const positive = (value: number, name: string): number => {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
};

/** A responsive spatial ceiling that preserves both legacy LOD depth and native atlas detail. */
export function maximumSceneCameraScale(fit: number): number {
  positive(fit, "fit");
  return Math.max(
    BASE_SCENE_CAMERA_MAX_SCALE,
    NATIVE_SCENE_EFFECTIVE_MAX_SCALE / fit,
  );
}

export function clamp(value: number, minimum: number, maximum: number): number {
  finite(value, "value");
  finite(minimum, "minimum");
  finite(maximum, "maximum");
  if (minimum > maximum) {
    throw new RangeError("minimum cannot be greater than maximum");
  }
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Clamps zoom and pan so the scene covers the viewport. If one scaled scene
 * dimension is smaller than the viewport, that dimension is centered.
 */
export function clampCamera(
  camera: Camera,
  bounds: CameraClampBounds,
): Camera {
  assertCamera(camera);
  const viewportWidth = positive(bounds.viewportWidth, "viewportWidth");
  const viewportHeight = positive(bounds.viewportHeight, "viewportHeight");
  const contentWidth = positive(bounds.contentWidth, "contentWidth");
  const contentHeight = positive(bounds.contentHeight, "contentHeight");
  const minScale = positive(bounds.minScale, "minScale");
  const maxScale = positive(bounds.maxScale, "maxScale");
  if (minScale > maxScale) {
    throw new RangeError("minScale cannot be greater than maxScale");
  }
  const padding = bounds.padding ?? 0;
  finite(padding, "padding");
  if (padding < 0) throw new RangeError("padding cannot be negative");

  const scale = clamp(camera.scale, minScale, maxScale);
  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;

  return {
    x: clampAxis(camera.x, scaledWidth, viewportWidth, padding),
    y: clampAxis(camera.y, scaledHeight, viewportHeight, padding),
    scale,
  };
}

function clampAxis(
  translation: number,
  scaledContent: number,
  viewport: number,
  padding: number,
): number {
  if (scaledContent + padding * 2 <= viewport) {
    return (viewport - scaledContent) / 2;
  }
  return clamp(translation, viewport - scaledContent - padding, padding);
}

/**
 * Changes scale while preserving the scene coordinate underneath `point`.
 * The point is expressed in viewport pixels, not scene coordinates.
 */
export function zoomCameraAboutPoint(
  camera: Camera,
  nextScale: number,
  point: Point,
): Camera {
  assertCamera(camera);
  positive(nextScale, "nextScale");
  finite(point.x, "point.x");
  finite(point.y, "point.y");
  const ratio = nextScale / camera.scale;
  return {
    x: point.x - (point.x - camera.x) * ratio,
    y: point.y - (point.y - camera.y) * ratio,
    scale: nextScale,
  };
}

/** Zooms about a viewport point, then applies scene bounds in one operation. */
export function zoomAndClampCamera(
  camera: Camera,
  nextScale: number,
  point: Point,
  bounds: CameraClampBounds,
): Camera {
  return clampCamera(zoomCameraAboutPoint(camera, nextScale, point), bounds);
}

/**
 * Advances a camera toward a target using time-based exponential smoothing.
 * Logarithmic scale interpolation keeps zoom-in and zoom-out motion symmetric.
 */
export function smoothCameraTowards(
  camera: Camera,
  target: Camera,
  deltaMs: number,
  responseMs: number,
): Camera {
  assertCamera(camera);
  assertCamera(target);
  finite(deltaMs, "deltaMs");
  positive(responseMs, "responseMs");
  if (deltaMs < 0) throw new RangeError("deltaMs cannot be negative");
  if (deltaMs === 0) return { ...camera };
  const blend = 1 - Math.exp(-deltaMs / responseMs);
  return {
    x: camera.x + (target.x - camera.x) * blend,
    y: camera.y + (target.y - camera.y) * blend,
    scale: Math.exp(
      Math.log(camera.scale)
      + (Math.log(target.scale) - Math.log(camera.scale)) * blend,
    ),
  };
}

export function sceneToViewport(camera: Camera, point: Point): Point {
  assertCamera(camera);
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}

export function viewportToScene(camera: Camera, point: Point): Point {
  assertCamera(camera);
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}

export function assertCamera(camera: Camera): void {
  finite(camera.x, "camera.x");
  finite(camera.y, "camera.y");
  positive(camera.scale, "camera.scale");
}
