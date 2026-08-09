import type { Camera, Point } from "./types";

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

