export interface SemanticZoomOutBoundaryResult {
  readonly accumulated: number;
  readonly trigger: boolean;
}

const SEMANTIC_ZOOM_OUT_BOUNDARY_THRESHOLD = 0.28;
const SEMANTIC_ZOOM_OUT_BOUNDARY_WINDOW_MS = 850;

/**
 * Returns the unclamped scale factor represented by a browser wheel event.
 * Keeping the raw factor is important at scale 1: the clamped camera itself
 * can no longer show how strongly the user kept shrinking.
 */
export function semanticZoomWheelFactor(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  const pixels = deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * Math.max(1, viewportHeight)
      : deltaY;
  const normalized = Math.min(240, Math.max(-240, pixels));
  return Math.exp(-normalized * 0.0017);
}

/**
 * Accumulates deliberate shrink intent only while an enabled semantic field
 * is already resting at its overview boundary. A pause, zoom-in, pan start,
 * disabled entry, or camera above minimum must clear the partial gesture.
 */
export function advanceSemanticZoomOutBoundary(
  accumulated: number,
  scaleFactor: number,
  atMinimumScale: boolean,
  enabled: boolean,
  elapsedSincePreviousMs = 0,
): SemanticZoomOutBoundaryResult {
  if (
    !enabled
    || !atMinimumScale
    || !Number.isFinite(scaleFactor)
    || scaleFactor <= 0
    || scaleFactor >= 1
  ) {
    return { accumulated: 0, trigger: false };
  }

  const continuedGesture = Number.isFinite(elapsedSincePreviousMs)
    && elapsedSincePreviousMs >= 0
    && elapsedSincePreviousMs <= SEMANTIC_ZOOM_OUT_BOUNDARY_WINDOW_MS;
  const next = (continuedGesture ? Math.max(0, accumulated) : 0)
    + Math.max(0, -Math.log(scaleFactor));
  if (next < SEMANTIC_ZOOM_OUT_BOUNDARY_THRESHOLD) {
    return { accumulated: next, trigger: false };
  }
  return { accumulated: 0, trigger: true };
}
