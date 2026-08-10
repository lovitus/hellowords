import type { Label, Portal } from "./types";

export interface SceneLabelCamera {
  readonly x: number;
  readonly y: number;
  readonly fit: number;
  readonly scale: number;
}

export interface SceneLabelViewport {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
}

export interface SceneLabelLayoutItem {
  readonly id: string;
  readonly lod: 0 | 1 | 2 | 3 | 4;
  readonly opacity: number;
  readonly interactive: boolean;
  readonly screenX: number;
  readonly screenY: number;
  /** Small screen-pixel displacement used to resolve a local collision. */
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface VocabularyZoomCue {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** A real authored object point used as the cue's visual anchor. */
  readonly anchorLabelId: string;
  readonly labelIds: readonly string[];
  readonly minLod: 2 | 3 | 4;
}

const DEFAULT_REVEAL_BANDS = [
  { start: 0.52, end: 0.76 },
  // Overview scenes are now deliberately smaller, human-audited sets. Reveal
  // the second grounded band at fit scale so the world still feels rich
  // without padding it with words that the artwork does not contain.
  { start: 0.72, end: 0.98 },
  { start: 1.08, end: 1.36 },
  { start: 1.65, end: 2.15 },
  { start: 2.3, end: 3.05 },
] as const;

const DEFAULT_RETIRE_BANDS = [
  { start: 2.12, end: 2.48 },
  { start: 2.4, end: 2.82 },
  { start: 3.02, end: 3.42 },
  null,
  null,
] as const;

type LabelLod = SceneLabelLayoutItem["lod"];

interface LabelBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(start: number, end: number, value: number): number {
  const progress = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function sceneLabelRevealOpacity(label: Label, scale: number): number {
  const lod = sceneLabelLod(label);
  const authoredMinimum = label.minScale;
  const authoredMaximum = label.maxScale;
  const band = DEFAULT_REVEAL_BANDS[lod];
  const start = authoredMinimum ?? band.start;
  const end = authoredMinimum === undefined
    ? band.end
    : authoredMinimum + Math.max(0.2, band.end - band.start);
  const fadeIn = smoothstep(start, end, scale);
  const defaultRetirement = DEFAULT_RETIRE_BANDS[lod];
  if (authoredMaximum === undefined) {
    if (defaultRetirement === null) return fadeIn;
    return fadeIn * (1 - smoothstep(defaultRetirement.start, defaultRetirement.end, scale));
  }
  const fadeOutWidth = Math.max(0.2, Math.min(0.48, band.end - band.start));
  const fadeOut = 1 - smoothstep(
    Math.max(start, authoredMaximum - fadeOutWidth),
    authoredMaximum,
    scale,
  );
  return fadeIn * fadeOut;
}

export function sceneLabelLod(label: Label): LabelLod {
  return Math.min(4, Math.max(0, Math.round(label.minLevel ?? 0))) as LabelLod;
}

function estimatedLabelSize(
  label: Label,
  meaningVisible: boolean,
  lod: LabelLod,
): { width: number; height: number } {
  const detailed = lod >= 3;
  // Font-weight 750 makes Latin glyphs slightly wider than a regular canvas
  // estimate. Keep a conservative buffer so the collision model agrees with
  // actual DOM geometry on high-DPR mobile Chromium.
  const wordWidth = Math.max(24, Array.from(label.word).length * (detailed ? 6.55 : 7.15));
  const translationWidth = meaningVisible
    ? Array.from(label.translation).length * (detailed ? 9.8 : 10.65) + 15
    : 0;
  return {
    width: Math.min(250, (detailed ? 27 : 31) + wordWidth + translationWidth),
    height: detailed ? 28 : 30,
  };
}

function overlaps(
  first: LabelBounds,
  second: LabelBounds,
  padding: number,
): boolean {
  return !(
    first.right + padding <= second.left
    || first.left >= second.right + padding
    || first.bottom + padding <= second.top
    || first.top >= second.bottom + padding
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Creates a small, stable set of spatial hints for vocabulary that will be
 * revealed by zooming without entering a child scene. Labels inside a portal
 * are intentionally excluded: the portal's gold entry marker owns that area,
 * so a green "more words" marker cannot contradict it.
 */
export function buildVocabularyZoomCues(
  labels: readonly Label[],
  portals: readonly Portal[],
  sceneWidth: number,
  sceneHeight: number,
  maxCues = 4,
): VocabularyZoomCue[] {
  const columns = 4;
  const rows = 3;
  const cellWidth = sceneWidth / columns;
  const cellHeight = sceneHeight / rows;
  const groups = new Map<string, Label[]>();
  const isInsidePortal = (label: Label) => portals.some((portal) => (
    label.x >= portal.x
    && label.x <= portal.x + portal.width
    && label.y >= portal.y
    && label.y <= portal.y + portal.height
  ));

  for (const label of labels) {
    const lod = sceneLabelLod(label);
    if (lod < 2 || isInsidePortal(label)) continue;
    const column = Math.min(columns - 1, Math.max(0, Math.floor(label.x / cellWidth)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(label.y / cellHeight)));
    const key = `${column}-${row}`;
    const group = groups.get(key) ?? [];
    group.push(label);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([cell, group]) => {
      const ordered = [...group].sort((first, second) => (
        sceneLabelLod(first) - sceneLabelLod(second)
        || first.priority - second.priority
        || first.id.localeCompare(second.id)
      ));
      const minLod = sceneLabelLod(ordered[0]) as 2 | 3 | 4;
      const centroid = {
        x: group.reduce((sum, label) => sum + label.x, 0) / group.length,
        y: group.reduce((sum, label) => sum + label.y, 0) / group.length,
      };
      const anchor = [...group].sort((first, second) => (
        Math.hypot(first.x - centroid.x, first.y - centroid.y)
          - Math.hypot(second.x - centroid.x, second.y - centroid.y)
        || first.priority - second.priority
        || first.id.localeCompare(second.id)
      ))[0];
      return {
        id: `vocabulary-${cell}`,
        x: anchor.x,
        y: anchor.y,
        anchorLabelId: anchor.id,
        labelIds: ordered.map((label) => label.id),
        minLod,
      } satisfies VocabularyZoomCue;
    })
    .sort((first, second) => (
      second.labelIds.length - first.labelIds.length
      || first.minLod - second.minLod
      || first.y - second.y
      || first.x - second.x
    ))
    .slice(0, Math.max(0, maxCues));
}

function placementOffsets(
  id: string,
  width: number,
  height: number,
  compact: boolean,
): ReadonlyArray<readonly [number, number]> {
  const horizontal = Math.min(compact ? 58 : 72, Math.max(30, width * 0.54));
  const vertical = height + (compact ? 2 : 4);
  const firstRing: Array<readonly [number, number]> = [
    [0, -vertical],
    [0, vertical],
    [-horizontal, 0],
    [horizontal, 0],
    [-horizontal, -vertical],
    [horizontal, -vertical],
    [-horizontal, vertical],
    [horizontal, vertical],
  ];
  const rotation = stableHash(id) % firstRing.length;
  const rotated = firstRing.slice(rotation).concat(firstRing.slice(0, rotation));
  return [
    // Labels are callouts, not stickers: prefer a short upward stem so the
    // authored object pixel remains visible and unmistakably anchored.
    [0, -vertical],
    ...rotated.filter(([x, y]) => x !== 0 || y !== -vertical),
    [0, -vertical * 0.58],
    [0, vertical * 0.58],
    [-horizontal * 0.55, 0],
    [horizontal * 0.55, 0],
    [0, -vertical * 2],
    [0, vertical * 2],
    [-horizontal * 1.7, 0],
    [horizontal * 1.7, 0],
    [-horizontal * 1.45, -vertical * 1.55],
    [horizontal * 1.45, -vertical * 1.55],
    [-horizontal * 1.45, vertical * 1.55],
    [horizontal * 1.45, vertical * 1.55],
  ];
}

function boundsAt(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): LabelBounds {
  return {
    left: screenX - width / 2,
    right: screenX + width / 2,
    top: screenY - height / 2,
    bottom: screenY + height / 2,
  };
}

function insideViewport(
  bounds: LabelBounds,
  viewport: SceneLabelViewport,
  margin: number,
): boolean {
  return bounds.left >= margin
    && bounds.right <= viewport.width - margin
    && bounds.top >= margin
    && bounds.bottom <= viewport.height - margin;
}

function createCollisionIndex(cellSize: number) {
  const cells = new Map<number, LabelBounds[]>();
  const visitCells = (
    bounds: LabelBounds,
    padding: number,
    visitor: (cell: LabelBounds[]) => boolean | void,
  ): boolean => {
    const firstColumn = Math.floor((bounds.left - padding) / cellSize);
    const lastColumn = Math.floor((bounds.right + padding) / cellSize);
    const firstRow = Math.floor((bounds.top - padding) / cellSize);
    const lastRow = Math.floor((bounds.bottom + padding) / cellSize);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const cell = cells.get(row * 10_000 + column);
        if (cell && visitor(cell)) return true;
      }
    }
    return false;
  };

  return {
    overlaps(bounds: LabelBounds, padding: number): boolean {
      return visitCells(bounds, padding, (cell) => (
        cell.some((placed) => overlaps(bounds, placed, padding))
      ));
    },
    add(bounds: LabelBounds): void {
      const firstColumn = Math.floor(bounds.left / cellSize);
      const lastColumn = Math.floor(bounds.right / cellSize);
      const firstRow = Math.floor(bounds.top / cellSize);
      const lastRow = Math.floor(bounds.bottom / cellSize);
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const key = row * 10_000 + column;
          const cell = cells.get(key) ?? [];
          cell.push(bounds);
          cells.set(key, cell);
        }
      }
    },
  };
}

/**
 * Projects a bounded authored label set into screen space, then resolves local
 * collisions by priority. A small spatial index keeps 100+ label scenes cheap
 * during continuous wheel or pinch frames. Opacity remains continuous with
 * camera scale; CSS only eases final collision changes.
 */
export function computeSceneLabelLayout(
  labels: readonly Label[],
  camera: SceneLabelCamera,
  viewport: SceneLabelViewport,
  meaningVisible: boolean,
): SceneLabelLayoutItem[] {
  const effectiveScale = camera.fit * camera.scale;
  const candidates = labels
    .map((label) => {
      const lod = sceneLabelLod(label);
      const opacity = sceneLabelRevealOpacity(label, camera.scale);
      const screenX = camera.x + label.x * effectiveScale;
      const screenY = camera.y + label.y * effectiveScale;
      const size = estimatedLabelSize(label, meaningVisible, lod);
      return { label, lod, opacity, screenX, screenY, ...size };
    })
    .filter(({ opacity, screenX, screenY }) => (
      opacity > 0.025
      && screenX >= -18
      && screenX <= viewport.width + 18
      && screenY >= -18
      && screenY <= viewport.height + 18
    ))
    .sort((first, second) => (
      Number(second.opacity >= 0.52) - Number(first.opacity >= 0.52)
      || second.opacity - first.opacity
      || first.label.priority - second.label.priority
      || first.lod - second.lod
      || first.label.id.localeCompare(second.label.id)
    ));

  const collisionIndex = createCollisionIndex(viewport.compact ? 40 : 48);
  const visible = new Map<string, SceneLabelLayoutItem>();
  const padding = viewport.compact ? 1 : 2;
  const edgeMargin = viewport.compact ? 3 : 6;
  for (const candidate of candidates) {
    const placement = placementOffsets(
      candidate.label.id,
      candidate.width,
      candidate.height,
      viewport.compact,
    ).find(([offsetX, offsetY]) => {
      const bounds = boundsAt(
        candidate.screenX + offsetX,
        candidate.screenY + offsetY,
        candidate.width,
        candidate.height,
      );
      return insideViewport(bounds, viewport, edgeMargin)
        && !collisionIndex.overlaps(bounds, padding);
    });
    const offsetX = placement?.[0] ?? 0;
    const offsetY = placement?.[1] ?? 0;
    const blocked = placement === undefined;
    if (!blocked) {
      collisionIndex.add(boundsAt(
        candidate.screenX + offsetX,
        candidate.screenY + offsetY,
        candidate.width,
        candidate.height,
      ));
    }
    const opacity = blocked ? 0 : candidate.opacity;
    visible.set(candidate.label.id, {
      id: candidate.label.id,
      lod: candidate.lod,
      opacity,
      interactive: !blocked && opacity >= 0.52,
      screenX: candidate.screenX + offsetX,
      screenY: candidate.screenY + offsetY,
      offsetX,
      offsetY,
    });
  }

  return labels.map((label) => visible.get(label.id) ?? {
    id: label.id,
    lod: sceneLabelLod(label),
    opacity: 0,
    interactive: false,
    screenX: Number.NaN,
    screenY: Number.NaN,
    offsetX: 0,
    offsetY: 0,
  });
}
