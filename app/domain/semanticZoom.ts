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
  /** Visible copy used to reserve a truthful screen-space card footprint. */
  readonly labelEn?: string;
  readonly labelZh?: string;
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

export type SemanticZoomProjectionMode = "spatial" | "shelf";

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
export const SEMANTIC_ZOOM_WORLD_BOUNDS: SemanticZoomBounds = {
  x: 0,
  y: 0,
  width: SEMANTIC_ZOOM_WORLD_WIDTH,
  height: SEMANTIC_ZOOM_WORLD_HEIGHT,
};

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

function normalizedSemanticZoomBounds(bounds: SemanticZoomBounds): SemanticZoomBounds {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
    throw new RangeError("semantic zoom bounds must be finite");
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError("semantic zoom bounds must have positive dimensions");
  }
  const left = clamp(bounds.x, 0, SEMANTIC_ZOOM_WORLD_WIDTH);
  const top = clamp(bounds.y, 0, SEMANTIC_ZOOM_WORLD_HEIGHT);
  const right = clamp(bounds.x + bounds.width, 0, SEMANTIC_ZOOM_WORLD_WIDTH);
  const bottom = clamp(bounds.y + bounds.height, 0, SEMANTIC_ZOOM_WORLD_HEIGHT);
  if (right <= left || bottom <= top) {
    throw new RangeError("semantic zoom bounds must intersect the shared plane");
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Exact logical extent occupied by the active LOD. Camera clamping must use
 * this instead of the whole 1600×900 plane once a realm/topic/leaf is active;
 * otherwise a valid drag can leave every active node and its realm tile.
 */
export function semanticZoomLayoutBounds<T extends SemanticZoomNodeInput>(
  nodes: readonly SemanticZoomLayoutNode<T>[],
  fallback: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
): SemanticZoomBounds {
  if (!nodes.length) return normalizedSemanticZoomBounds(fallback);
  const left = Math.min(...nodes.map((node) => node.x - node.radius));
  const top = Math.min(...nodes.map((node) => node.y - node.radius));
  const right = Math.max(...nodes.map((node) => node.x + node.radius));
  const bottom = Math.max(...nodes.map((node) => node.y + node.radius));
  return normalizedSemanticZoomBounds({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
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
  activeBounds: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
): SemanticZoomView {
  const fit = fitFor(viewport);
  const bounds = normalizedSemanticZoomBounds(activeBounds);
  const scale = clamp(view.scale, SEMANTIC_ZOOM_MIN_SCALE, SEMANTIC_ZOOM_MAX_SCALE);
  const visibleWidth = viewport.width / (fit * scale);
  const visibleHeight = viewport.height / (fit * scale);
  const centerX = visibleWidth >= bounds.width
    ? bounds.x + bounds.width / 2
    : clamp(view.centerX, bounds.x + visibleWidth / 2, bounds.x + bounds.width - visibleWidth / 2);
  const centerY = visibleHeight >= bounds.height
    ? bounds.y + bounds.height / 2
    : clamp(view.centerY, bounds.y + visibleHeight / 2, bounds.y + bounds.height - visibleHeight / 2);
  return { centerX, centerY, scale };
}

export function semanticZoomCamera(
  view: SemanticZoomView,
  viewport: SemanticZoomViewport,
  activeBounds: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
): Camera {
  const clamped = clampSemanticZoomView(view, viewport, activeBounds);
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
  activeBounds: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
): SemanticZoomView {
  const current = clampSemanticZoomView(view, viewport, activeBounds);
  const currentCamera = semanticZoomCamera(current, viewport, activeBounds);
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
  }, viewport, activeBounds);
}

export function panSemanticZoomView(
  view: SemanticZoomView,
  delta: Point,
  viewport: SemanticZoomViewport,
  activeBounds: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
): SemanticZoomView {
  const current = clampSemanticZoomView(view, viewport, activeBounds);
  const effectiveScale = fitFor(viewport) * current.scale;
  return clampSemanticZoomView({
    ...current,
    centerX: current.centerX - delta.x / effectiveScale,
    centerY: current.centerY - delta.y / effectiveScale,
  }, viewport, activeBounds);
}

export function focusSemanticZoomView(
  point: Point,
  level: SemanticZoomLevel,
  viewport: SemanticZoomViewport,
  activeBounds: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
): SemanticZoomView {
  return clampSemanticZoomView({
    centerX: point.x,
    centerY: point.y,
    scale: semanticZoomScaleForLevel(level),
  }, viewport, activeBounds);
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
  bounds: SemanticZoomBounds = SEMANTIC_ZOOM_WORLD_BOUNDS,
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
  placementMode: SemanticZoomProjectionMode = "spatial",
): SemanticZoomProjectedNode<T>[] {
  const margin = 150;
  return nodes
    .map((node) => ({
      ...node,
      screenX: node.x * camera.scale + camera.x,
      screenY: node.y * camera.scale + camera.y,
    }))
    .filter((node) => placementMode === "shelf" || (
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
      return (placementMode === "spatial" ? rightInside - leftInside : 0)
        || leftDistance - rightDistance
        || left.node.id.localeCompare(right.node.id);
    })
    .slice(0, Math.max(1, Math.floor(budget)));
}

function approximateTextWidth(text: string, fontSize: number): number {
  return [...text].reduce((width, character) => {
    if (/\s/u.test(character)) return width + fontSize * 0.32;
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(character)) {
      return width + fontSize;
    }
    if (/[MWmw@#%&]/u.test(character)) return width + fontSize * 0.86;
    if (/[ilI1.,'`|!:;]/u.test(character)) return width + fontSize * 0.32;
    if (/[A-Z]/u.test(character)) return width + fontSize * 0.72;
    if (/[0-9]/u.test(character)) return width + fontSize * 0.58;
    return width + fontSize * 0.64;
  }, 0);
}

function wrappedTextLineCount(text: string, fontSize: number, availableWidth: number): number {
  return text.split(/\r?\n/u).reduce((lines, line) => (
    lines + Math.max(1, Math.ceil(approximateTextWidth(line, fontSize) / availableWidth))
  ), 0);
}

/**
 * Reserves the same native-pixel footprint rendered by the word-card CSS.
 * English and translated copy are never made smaller to satisfy density; a
 * larger card simply consumes more collision slots and lowers the live count.
 */
export function semanticZoomNodeBox(
  node: SemanticZoomNodeInput,
  level: SemanticZoomLevel,
  viewportWidth: number,
  expanded: boolean,
): { width: number; height: number } {
  const mobile = viewportWidth < 820;
  if (node.labelEn) {
    if (level !== "word") {
      const metrics = mobile
        ? {
            minWidth: level === "realm" ? 160 : level === "topic" ? 148 : 142,
            maxWidth: Math.max(48, Math.min(176, viewportWidth - 12)),
            leftChromeWidth: 38,
            verticalPadding: 18,
            rowGap: 4,
            englishFontSize: 13.44,
            englishLineHeight: 16,
            translationFontSize: 11.52,
            translationLineHeight: 14,
            minimumHeight: level === "realm" ? 58 : level === "topic" ? 50 : 44,
          }
        : {
            minWidth: level === "realm" ? 210 : level === "topic" ? 190 : 176,
            maxWidth: level === "realm" ? 300 : level === "topic" ? 340 : 320,
            leftChromeWidth: 42,
            verticalPadding: 18,
            rowGap: 4,
            englishFontSize: 15.36,
            englishLineHeight: 18,
            translationFontSize: 11.52,
            translationLineHeight: 15,
            minimumHeight: level === "realm" ? 62 : level === "topic" ? 54 : 50,
          };
      const boundedMaxWidth = Math.max(48, Math.min(metrics.maxWidth, viewportWidth - 12));
      const badgeLabel = node.count.toLocaleString("en-US");
      const badgeWidth = Math.max(28, Math.ceil(approximateTextWidth(badgeLabel, 10.56) + 12));
      const badgeChromeWidth = badgeWidth + 8;
      const englishWidth = approximateTextWidth(node.labelEn, metrics.englishFontSize);
      const translationWidth = expanded && node.labelZh
        ? Math.max(...node.labelZh.split(/\r?\n/u).map((line) => (
            approximateTextWidth(line, metrics.translationFontSize)
          )))
        : 0;
      const preferredWidth = Math.max(
        englishWidth + metrics.leftChromeWidth + badgeChromeWidth,
        translationWidth + metrics.leftChromeWidth,
      );
      const width = Math.ceil(clamp(
        preferredWidth,
        Math.min(metrics.minWidth, boundedMaxWidth),
        boundedMaxWidth,
      ));
      const englishTextWidth = Math.max(
        1,
        width - metrics.leftChromeWidth - badgeChromeWidth,
      );
      const translationTextWidth = Math.max(1, width - metrics.leftChromeWidth);
      const englishLines = wrappedTextLineCount(
        node.labelEn,
        metrics.englishFontSize,
        englishTextWidth,
      );
      const translationLines = expanded && node.labelZh
        ? wrappedTextLineCount(
            node.labelZh,
            metrics.translationFontSize,
            translationTextWidth,
          )
        : 0;
      return {
        width,
        height: Math.max(metrics.minimumHeight, Math.ceil(
          metrics.verticalPadding
          + englishLines * metrics.englishLineHeight
          + (translationLines
            ? metrics.rowGap + translationLines * metrics.translationLineHeight
            : 0),
        )),
      };
    }
    const metrics = mobile
      ? {
          minWidth: 142,
          maxWidth: Math.max(48, Math.min(176, viewportWidth - 12)),
          chromeWidth: 40,
          verticalPadding: 18,
          rowGap: 4,
          englishFontSize: 13.44,
          englishLineHeight: 16,
          translationFontSize: 11.52,
          translationLineHeight: 14,
        }
      : {
          minWidth: 148,
          maxWidth: Math.max(48, Math.min(220, viewportWidth - 12)),
          chromeWidth: 40,
          verticalPadding: 18,
          rowGap: 4,
          englishFontSize: 14.4,
          englishLineHeight: 17,
          translationFontSize: 12,
          translationLineHeight: 15,
        };
    const preferredTextWidth = Math.max(
      approximateTextWidth(node.labelEn, metrics.englishFontSize),
      expanded && node.labelZh
        ? Math.max(...node.labelZh.split(/\r?\n/u).map((line) => (
            approximateTextWidth(line, metrics.translationFontSize)
          )))
        : 0,
    );
    const width = Math.ceil(clamp(
      preferredTextWidth + metrics.chromeWidth,
      Math.min(metrics.minWidth, metrics.maxWidth),
      metrics.maxWidth,
    ));
    const availableTextWidth = Math.max(1, width - metrics.chromeWidth);
    const englishLines = wrappedTextLineCount(
      node.labelEn,
      metrics.englishFontSize,
      availableTextWidth,
    );
    const translationLines = expanded && node.labelZh
      ? wrappedTextLineCount(
          node.labelZh,
          metrics.translationFontSize,
          availableTextWidth,
        )
      : 0;
    return {
      width,
      height: Math.max(mobile ? 44 : 36, Math.ceil(
        metrics.verticalPadding
        + englishLines * metrics.englishLineHeight
        + (translationLines
          ? metrics.rowGap + translationLines * metrics.translationLineHeight
          : 0),
      )),
    };
  }
  const base = level === "realm"
    ? { width: mobile ? 112 : 160, height: mobile ? 58 : 62 }
    : level === "topic"
      ? { width: mobile ? 112 : 144, height: mobile ? 46 : 50 }
      : level === "subcluster"
        ? { width: mobile ? 108 : 132, height: mobile ? 42 : 46 }
        : { width: mobile ? 86 : 104, height: mobile ? 44 : 36 };
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
  const boxes = nodes.map((node) => semanticZoomNodeBox(
    node.node,
    level,
    viewport.width,
    options.expanded ?? false,
  ));
  const gap = level === "word" ? 4 : 7;
  const gutter = 6;
  const rowWidth = Math.max(0, viewport.width - gutter * 2);
  const shelves: Array<{
    items: Array<{ node: SemanticZoomProjectedNode<T>; box: { width: number; height: number }; index: number }>;
    width: number;
    height: number;
  }> = [];

  // First-fit shelves keep each real card's footprint. One unusually long
  // translation only increases its own row instead of forcing every card into
  // the batch's largest rectangle.
  nodes.forEach((node, index) => {
    const box = boxes[index];
    const shelf = shelves.find((candidate) => (
      candidate.width + (candidate.items.length ? gap : 0) + box.width <= rowWidth
    ));
    const item = { node, box, index };
    if (shelf) {
      shelf.items.push(item);
      shelf.width += gap + box.width;
      shelf.height = Math.max(shelf.height, box.height);
    } else if (box.width <= rowWidth) {
      shelves.push({ items: [item], width: box.width, height: box.height });
    }
  });

  const fullWidthBlockers = (options.protectedRegions ?? [])
    .filter((region) => region.x <= gutter && region.x + region.width >= viewport.width - gutter)
    .map((region) => ({
      start: Math.max(gutter, region.y - gap),
      end: Math.min(viewport.height - gutter, region.y + region.height + gap),
    }))
    .sort((left, right) => left.start - right.start);
  const mergedBlockers: Array<{ start: number; end: number }> = [];
  for (const blocker of fullWidthBlockers) {
    const previous = mergedBlockers.at(-1);
    if (previous && blocker.start <= previous.end) previous.end = Math.max(previous.end, blocker.end);
    else mergedBlockers.push({ ...blocker });
  }
  const verticalBands: Array<{ start: number; end: number }> = [];
  let bandStart = gutter;
  for (const blocker of mergedBlockers) {
    if (blocker.start > bandStart) verticalBands.push({ start: bandStart, end: blocker.start });
    bandStart = Math.max(bandStart, blocker.end);
  }
  if (bandStart < viewport.height - gutter) {
    verticalBands.push({ start: bandStart, end: viewport.height - gutter });
  }

  const placed = new Map<number, SemanticZoomPlacedNode<T>>();
  let bandIndex = 0;
  const shelfStackHeight = shelves.reduce((height, shelf, index) => (
    height + shelf.height + (index ? gap : 0)
  ), 0);
  const firstBand = verticalBands[0];
  let verticalCursor = firstBand
    ? firstBand.start + (verticalBands.length === 1
      ? Math.max(0, (firstBand.end - firstBand.start - shelfStackHeight) / 2)
      : 0)
    : viewport.height;
  for (const shelf of shelves) {
    while (
      bandIndex < verticalBands.length
      && verticalCursor + shelf.height > verticalBands[bandIndex].end
    ) {
      bandIndex += 1;
      verticalCursor = verticalBands[bandIndex]?.start ?? viewport.height;
    }
    if (bandIndex >= verticalBands.length) continue;

    const orderedItems = [...shelf.items].sort((left, right) => (
      left.node.screenX - right.node.screenX || left.index - right.index
    ));
    const averageAnchorX = orderedItems.reduce((sum, item) => sum + item.node.screenX, 0)
      / orderedItems.length;
    let horizontalCursor = clamp(
      averageAnchorX - shelf.width / 2,
      gutter,
      viewport.width - gutter - shelf.width,
    );
    const rowY = verticalCursor + shelf.height / 2;
    for (const item of orderedItems) {
      const point = { x: horizontalCursor + item.box.width / 2, y: rowY };
      horizontalCursor += item.box.width + gap;
      const candidateBox = { ...point, ...item.box };
      const missesChrome = (options.protectedRegions ?? []).every((region) => !boxesOverlap(
        candidateBox,
        {
          x: region.x + region.width / 2,
          y: region.y + region.height / 2,
          width: region.width,
          height: region.height,
        },
        2,
      ));
      if (!missesChrome) continue;
      placed.set(item.index, {
        ...item.node,
        screenX: point.x,
        screenY: point.y,
        anchorScreenX: item.node.screenX,
        anchorScreenY: item.node.screenY,
        boxWidth: item.box.width,
        boxHeight: item.box.height,
      });
    }
    verticalCursor += shelf.height + gap;
  }
  const ordered: SemanticZoomPlacedNode<T>[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = placed.get(index);
    if (node) ordered.push(node);
  }
  return ordered;
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
