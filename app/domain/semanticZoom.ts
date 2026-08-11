import { clamp } from "./camera";
import type { Camera, Point } from "./types";

export type SemanticZoomLevel = "realm" | "topic" | "subcluster" | "word";

export interface SemanticZoomViewport {
  readonly width: number;
  readonly height: number;
}

/** Logical zoom is independent of device fit; 1 always means the full 1600×900 plane. */
export interface SemanticZoomView {
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
}

export interface SemanticZoomBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SemanticZoomNodeInput {
  readonly id: string;
  readonly count: number;
  /** Optional reviewed position supplied by the visual manifest. */
  readonly authoredPoint?: Point;
}

export interface SemanticZoomLayoutNode<T extends SemanticZoomNodeInput = SemanticZoomNodeInput> {
  readonly node: T;
  readonly x: number;
  readonly y: number;
  /** Screen-space sizing hint; renderers must not put text inside the scaled plane. */
  readonly radius: number;
}

export interface SemanticZoomProjectedNode<T extends SemanticZoomNodeInput = SemanticZoomNodeInput>
  extends SemanticZoomLayoutNode<T> {
  readonly screenX: number;
  readonly screenY: number;
}

export interface SemanticZoomPlacedNode<T extends SemanticZoomNodeInput = SemanticZoomNodeInput>
  extends SemanticZoomProjectedNode<T> {
  /** Unmoved visual anchor retained for an optional screen-space leader. */
  readonly anchorScreenX: number;
  readonly anchorScreenY: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
}

export interface SemanticZoomPlacementOptions {
  readonly expanded?: boolean;
  /** Screen-space UI that vocabulary pills must not cover. */
  readonly protectedRegions?: readonly SemanticZoomBounds[];
}

export interface SemanticZoomDataReadiness {
  readonly realmSelected: boolean;
  readonly topicsReady: boolean;
  readonly topicSelected: boolean;
  readonly subclustersReady: boolean;
  readonly subclusterSelected: boolean;
  readonly wordsReady: boolean;
}

export interface SemanticZoomRealmEntry<T extends SemanticZoomNodeInput = SemanticZoomNodeInput> {
  readonly node: SemanticZoomLayoutNode<T>;
  readonly view: SemanticZoomView;
}

export type SemanticZoomContinuationAction = "zoom" | "pan-zoom" | "pan" | "complete";

/** Screen-space progress for the current LOD, independent of its rendering copy. */
export interface SemanticZoomExplorationProgress {
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly remainingCount: number;
  readonly action: SemanticZoomContinuationAction;
}

export const SEMANTIC_ZOOM_WORLD_WIDTH = 1600;
export const SEMANTIC_ZOOM_WORLD_HEIGHT = 900;
export const SEMANTIC_ZOOM_MIN_SCALE = 1;
export const SEMANTIC_ZOOM_MAX_SCALE = 5.2;

export const SEMANTIC_ZOOM_THRESHOLDS = {
  realm: 1,
  topic: 1.55,
  subcluster: 2.35,
  word: 3.45,
} as const satisfies Readonly<Record<SemanticZoomLevel, number>>;

const SEMANTIC_ZOOM_FOCUS_SCALES = {
  realm: 1,
  topic: 1.82,
  subcluster: 2.72,
  word: 3.82,
} as const satisfies Readonly<Record<SemanticZoomLevel, number>>;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fitFor(viewport: SemanticZoomViewport): number {
  return Math.min(
    finitePositive(viewport.width, "viewport.width") / SEMANTIC_ZOOM_WORLD_WIDTH,
    finitePositive(viewport.height, "viewport.height") / SEMANTIC_ZOOM_WORLD_HEIGHT,
  );
}

export function semanticZoomLevelForScale(scale: number): SemanticZoomLevel {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("scale must be positive");
  if (scale >= SEMANTIC_ZOOM_THRESHOLDS.word) return "word";
  if (scale >= SEMANTIC_ZOOM_THRESHOLDS.subcluster) return "subcluster";
  if (scale >= SEMANTIC_ZOOM_THRESHOLDS.topic) return "topic";
  return "realm";
}

export function semanticZoomScaleForLevel(level: SemanticZoomLevel): number {
  return SEMANTIC_ZOOM_FOCUS_SCALES[level];
}

export function semanticZoomDepth(level: SemanticZoomLevel): 0 | 1 | 2 | 3 {
  return level === "realm" ? 0 : level === "topic" ? 1 : level === "subcluster" ? 2 : 3;
}

export function nextSemanticZoomLevel(level: SemanticZoomLevel): SemanticZoomLevel {
  return level === "realm" ? "topic" : level === "topic" ? "subcluster" : "word";
}

/** Keeps the previous populated LOD visible while the requested shard arrives. */
export function semanticZoomDisplayLevel(
  target: SemanticZoomLevel,
  readiness: SemanticZoomDataReadiness,
): SemanticZoomLevel {
  if (target === "realm" || !readiness.realmSelected) return "realm";
  if (!readiness.topicsReady) return "realm";
  if (target === "topic" || !readiness.topicSelected) return "topic";
  if (!readiness.subclustersReady) return "topic";
  if (target === "subcluster" || !readiness.subclusterSelected) return "subcluster";
  return readiness.wordsReady ? "word" : "subcluster";
}

export function semanticZoomNodeBudget(viewportWidth: number): 40 | 80 {
  return viewportWidth < 820 ? 40 : 80;
}

/**
 * Describes what the user can see now and the gesture that reveals more.
 * Counts are normalized because transient loading states may briefly report
 * an empty or stale projection while keeping the previous LOD mounted.
 */
export function semanticZoomExplorationProgress(
  level: SemanticZoomLevel,
  totalCount: number,
  visibleCount: number,
): SemanticZoomExplorationProgress {
  const total = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const visible = Number.isFinite(visibleCount)
    ? Math.min(total, Math.max(0, Math.floor(visibleCount)))
    : 0;
  const remaining = total - visible;
  const action: SemanticZoomContinuationAction = level === "word"
    ? remaining > 0 ? "pan" : "complete"
    : remaining > 0 ? "pan-zoom" : "zoom";
  return {
    visibleCount: visible,
    totalCount: total,
    remainingCount: remaining,
    action,
  };
}

export function clampSemanticZoomView(
  view: SemanticZoomView,
  viewport: SemanticZoomViewport,
): SemanticZoomView {
  const fit = fitFor(viewport);
  const scale = clamp(view.scale, SEMANTIC_ZOOM_MIN_SCALE, SEMANTIC_ZOOM_MAX_SCALE);
  const visibleWidth = viewport.width / (fit * scale);
  const visibleHeight = viewport.height / (fit * scale);
  const centerX = visibleWidth >= SEMANTIC_ZOOM_WORLD_WIDTH
    ? SEMANTIC_ZOOM_WORLD_WIDTH / 2
    : clamp(view.centerX, visibleWidth / 2, SEMANTIC_ZOOM_WORLD_WIDTH - visibleWidth / 2);
  const centerY = visibleHeight >= SEMANTIC_ZOOM_WORLD_HEIGHT
    ? SEMANTIC_ZOOM_WORLD_HEIGHT / 2
    : clamp(view.centerY, visibleHeight / 2, SEMANTIC_ZOOM_WORLD_HEIGHT - visibleHeight / 2);
  return { centerX, centerY, scale };
}

export function semanticZoomCamera(
  view: SemanticZoomView,
  viewport: SemanticZoomViewport,
): Camera {
  const clamped = clampSemanticZoomView(view, viewport);
  const scale = fitFor(viewport) * clamped.scale;
  return {
    x: viewport.width / 2 - clamped.centerX * scale,
    y: viewport.height / 2 - clamped.centerY * scale,
    scale,
  };
}

export function zoomSemanticViewAboutPoint(
  view: SemanticZoomView,
  nextScale: number,
  point: Point,
  viewport: SemanticZoomViewport,
): SemanticZoomView {
  const current = clampSemanticZoomView(view, viewport);
  const currentCamera = semanticZoomCamera(current, viewport);
  const scenePoint = {
    x: (point.x - currentCamera.x) / currentCamera.scale,
    y: (point.y - currentCamera.y) / currentCamera.scale,
  };
  const clampedScale = clamp(nextScale, SEMANTIC_ZOOM_MIN_SCALE, SEMANTIC_ZOOM_MAX_SCALE);
  const nextFitScale = fitFor(viewport) * clampedScale;
  return clampSemanticZoomView({
    centerX: scenePoint.x - (point.x - viewport.width / 2) / nextFitScale,
    centerY: scenePoint.y - (point.y - viewport.height / 2) / nextFitScale,
    scale: clampedScale,
  }, viewport);
}

export function panSemanticZoomView(
  view: SemanticZoomView,
  delta: Point,
  viewport: SemanticZoomViewport,
): SemanticZoomView {
  const current = clampSemanticZoomView(view, viewport);
  const effectiveScale = fitFor(viewport) * current.scale;
  return clampSemanticZoomView({
    ...current,
    centerX: current.centerX - delta.x / effectiveScale,
    centerY: current.centerY - delta.y / effectiveScale,
  }, viewport);
}

export function focusSemanticZoomView(
  point: Point,
  level: SemanticZoomLevel,
  viewport: SemanticZoomViewport,
): SemanticZoomView {
  return clampSemanticZoomView({
    centerX: point.x,
    centerY: point.y,
    scale: semanticZoomScaleForLevel(level),
  }, viewport);
}

/**
 * Resolves an explicit, reviewed bridge from a spatial word into one of the
 * ten semantic realms. Unknown IDs return null instead of being guessed from
 * display text, so lexical descendants are never presented as drawn objects.
 */
export function resolveSemanticZoomRealmEntry<T extends SemanticZoomNodeInput>(
  nodes: readonly SemanticZoomLayoutNode<T>[],
  realmId: string | undefined,
  viewport: SemanticZoomViewport,
): SemanticZoomRealmEntry<T> | null {
  if (!realmId) return null;
  const node = nodes.find((candidate) => candidate.node.id === realmId);
  if (!node) return null;
  return {
    node,
    view: focusSemanticZoomView(node, "topic", viewport),
  };
}

/**
 * Frame-rate-independent camera interpolation. Scale moves in logarithmic
 * space, so zooming in and out feels symmetric and cannot overshoot its target.
 */
export function smoothSemanticZoomView(
  current: SemanticZoomView,
  target: SemanticZoomView,
  deltaMs: number,
  timeConstantMs = 105,
): SemanticZoomView {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError("deltaMs cannot be negative");
  finitePositive(current.scale, "current.scale");
  finitePositive(target.scale, "target.scale");
  finitePositive(timeConstantMs, "timeConstantMs");
  const alpha = 1 - Math.exp(-Math.min(deltaMs, 64) / timeConstantMs);
  const next = {
    centerX: current.centerX + (target.centerX - current.centerX) * alpha,
    centerY: current.centerY + (target.centerY - current.centerY) * alpha,
    scale: Math.exp(Math.log(current.scale) + (Math.log(target.scale) - Math.log(current.scale)) * alpha),
  };
  return Math.abs(next.centerX - target.centerX) < 0.02
    && Math.abs(next.centerY - target.centerY) < 0.02
    && Math.abs(Math.log(next.scale / target.scale)) < 0.0001
    ? target
    : next;
}

export function semanticWheelScale(
  currentScale: number,
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  const pixels = deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * Math.max(1, viewportHeight)
      : deltaY;
  const normalized = clamp(pixels, -240, 240);
  return clamp(
    currentScale * Math.exp(-normalized * 0.0017),
    SEMANTIC_ZOOM_MIN_SCALE,
    SEMANTIC_ZOOM_MAX_SCALE,
  );
}

function insetBounds(bounds: SemanticZoomBounds, x: number, y: number): SemanticZoomBounds {
  return {
    x: bounds.x + x,
    y: bounds.y + y,
    width: Math.max(1, bounds.width - x * 2),
    height: Math.max(1, bounds.height - y * 2),
  };
}

/**
 * Returns the nested region occupied by one hierarchy level. Topic and word
 * nodes stay inside the selected realm's high-resolution tile; subclusters
 * gather around the activated topic without creating a new page or modal.
 */
export function semanticZoomBoundsForLevel(
  level: Exclude<SemanticZoomLevel, "realm">,
  reviewedTileBounds: SemanticZoomBounds,
  parentPoint?: Point,
): SemanticZoomBounds {
  const tile = reviewedTileBounds;
  if (level === "topic") return insetBounds(tile, 52, 42);
  if (level === "word") return insetBounds(tile, 24, 22);

  const width = Math.max(1, Math.min(620, tile.width - 36));
  const height = Math.max(1, Math.min(340, tile.height - 36));
  const center = parentPoint ?? { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
  return {
    x: clamp(center.x - width / 2, tile.x + 18, tile.x + tile.width - width - 18),
    y: clamp(center.y - height / 2, tile.y + 18, tile.y + tile.height - height - 18),
    width,
    height,
  };
}

function radiusFor(level: SemanticZoomLevel, count: number): number {
  const base = level === "realm" ? 58 : level === "topic" ? 48 : level === "subcluster" ? 40 : 31;
  return base + Math.min(14, Math.log2(Math.max(1, count) + 1) * 1.8);
}

export function layoutSemanticZoomNodes<T extends SemanticZoomNodeInput>(
  nodes: readonly T[],
  level: SemanticZoomLevel,
  bounds: SemanticZoomBounds = { x: 0, y: 0, width: SEMANTIC_ZOOM_WORLD_WIDTH, height: SEMANTIC_ZOOM_WORLD_HEIGHT },
): SemanticZoomLayoutNode<T>[] {
  if (level === "realm") {
    return nodes.map((node, index) => {
      const point = node.authoredPoint ?? {
            x: bounds.x + bounds.width * ((index % 5) + 0.5) / 5,
            y: bounds.y + bounds.height * (Math.floor(index / 5) + 0.5) / Math.max(1, Math.ceil(nodes.length / 5)),
          };
      return { node, ...point, radius: radiusFor(level, node.count) };
    });
  }

  if (!nodes.length) return [];
  const aspect = bounds.width / bounds.height;
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * aspect)));
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const cellWidth = bounds.width / columns;
  const cellHeight = bounds.height / rows;
  return nodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const phase = (stableHash(node.id) % 360) * Math.PI / 180 + index * GOLDEN_ANGLE;
    const jitterX = Math.cos(phase) * cellWidth * 0.1;
    const jitterY = Math.sin(phase) * cellHeight * 0.1;
    return {
      node,
      x: bounds.x + (column + 0.5) * cellWidth + jitterX,
      y: bounds.y + (row + 0.5) * cellHeight + jitterY,
      radius: radiusFor(level, node.count),
    };
  });
}

export function projectSemanticZoomNodes<T extends SemanticZoomNodeInput>(
  nodes: readonly SemanticZoomLayoutNode<T>[],
  camera: Camera,
  viewport: SemanticZoomViewport,
  budget = semanticZoomNodeBudget(viewport.width),
): SemanticZoomProjectedNode<T>[] {
  const margin = 150;
  return nodes
    .map((node) => ({
      ...node,
      screenX: node.x * camera.scale + camera.x,
      screenY: node.y * camera.scale + camera.y,
    }))
    .filter((node) => (
      node.screenX >= -margin
      && node.screenX <= viewport.width + margin
      && node.screenY >= -margin
      && node.screenY <= viewport.height + margin
    ))
    .sort((left, right) => {
      const leftInside = Number(
        left.screenX >= 0 && left.screenX <= viewport.width
        && left.screenY >= 0 && left.screenY <= viewport.height,
      );
      const rightInside = Number(
        right.screenX >= 0 && right.screenX <= viewport.width
        && right.screenY >= 0 && right.screenY <= viewport.height,
      );
      const leftDistance = Math.hypot(left.screenX - viewport.width / 2, left.screenY - viewport.height / 2);
      const rightDistance = Math.hypot(right.screenX - viewport.width / 2, right.screenY - viewport.height / 2);
      return rightInside - leftInside || leftDistance - rightDistance || left.node.id.localeCompare(right.node.id);
    })
    .slice(0, Math.max(1, Math.floor(budget)));
}

function collisionBoxForLevel(
  level: SemanticZoomLevel,
  viewportWidth: number,
  expanded: boolean,
): { width: number; height: number } {
  const mobile = viewportWidth < 820;
  const base = level === "realm"
    ? { width: mobile ? 112 : 160, height: mobile ? 58 : 62 }
    : level === "topic"
      ? { width: mobile ? 112 : 144, height: mobile ? 46 : 50 }
      : level === "subcluster"
        ? { width: mobile ? 108 : 132, height: mobile ? 42 : 46 }
        : { width: mobile ? 86 : 104, height: mobile ? 34 : 36 };
  return {
    width: Math.min(Math.max(48, viewportWidth - 12), base.width),
    height: base.height + (expanded ? 16 : 0),
  };
}

function boxesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
  gap: number,
): boolean {
  return Math.abs(left.x - right.x) < (left.width + right.width) / 2 + gap
    && Math.abs(left.y - right.y) < (left.height + right.height) / 2 + gap;
}

/**
 * Resolves labels in screen space after camera projection. This keeps the
 * reviewed focal point as an anchor while deterministically offsetting pills,
 * so mobile realm labels and dense word batches never blur or overlap.
 */
export function placeSemanticZoomNodes<T extends SemanticZoomNodeInput>(
  nodes: readonly SemanticZoomProjectedNode<T>[],
  viewport: SemanticZoomViewport,
  level: SemanticZoomLevel,
  options: SemanticZoomPlacementOptions = {},
): SemanticZoomPlacedNode<T>[] {
  if (!nodes.length) return [];
  const box = collisionBoxForLevel(level, viewport.width, options.expanded ?? false);
  const gap = level === "word" ? 4 : 7;
  const gutter = 6;
  const placed: SemanticZoomPlacedNode<T>[] = [];
  const missesChrome = (point: Point) => {
    const candidateBox = { x: point.x, y: point.y, width: box.width, height: box.height };
    return (options.protectedRegions ?? []).every((region) => !boxesOverlap(
      candidateBox,
      {
        x: region.x + region.width / 2,
        y: region.y + region.height / 2,
        width: region.width,
        height: region.height,
      },
      2,
    ));
  };
  const strideX = box.width + gap;
  const strideY = box.height + gap;
  const columns = Math.max(1, Math.floor((viewport.width - gutter * 2 + gap) / strideX));
  const rows = Math.max(1, Math.floor((viewport.height - gutter * 2 + gap) / strideY));
  const availableGrid = Array.from({ length: columns * rows }, (_, index) => ({
    x: gutter + box.width / 2 + (index % columns) * strideX,
    y: gutter + box.height / 2 + Math.floor(index / columns) * strideY,
  })).filter(missesChrome);

  for (const node of nodes) {
    const anchor = { x: node.screenX, y: node.screenY };
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [index, candidate] of availableGrid.entries()) {
      const distance = Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    // Density budgets are upper bounds. Tiny or chrome-heavy viewports may
    // have fewer collision-free slots, so omit the farthest remainder instead
    // of forcing overlapping pills into the field.
    if (bestIndex < 0) continue;
    const point = availableGrid.splice(bestIndex, 1)[0];
    placed.push({
      ...node,
      screenX: point.x,
      screenY: point.y,
      anchorScreenX: anchor.x,
      anchorScreenY: anchor.y,
      boxWidth: box.width,
      boxHeight: box.height,
    });
  }
  return placed;
}

export function nearestSemanticZoomNode<T extends SemanticZoomNodeInput>(
  nodes: readonly SemanticZoomLayoutNode<T>[],
  point: Point,
): SemanticZoomLayoutNode<T> | undefined {
  return nodes.reduce<SemanticZoomLayoutNode<T> | undefined>((nearest, candidate) => {
    if (!nearest) return candidate;
    const candidateDistance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    const nearestDistance = Math.hypot(nearest.x - point.x, nearest.y - point.y);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, undefined);
}
