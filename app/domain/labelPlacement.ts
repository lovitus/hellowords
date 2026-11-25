import type { Label } from "./types";
import type {
  SceneLabelCamera,
  SceneLabelLayoutItem,
  SceneLabelLayoutOptions,
  SceneLabelProtectedRegion,
  SceneLabelViewport,
} from "./labelLayout";

/**
 * Deterministic callout placement for scene words. During continuous desktop
 * zoom the caller can also supply the last painted offsets. Legal old slots
 * are then reserved before the layout looks for alternatives.
 */
export interface ScenePlacementOptions {
  readonly selectedLabelId?: string | null;
  readonly protectedRegions?: readonly SceneLabelProtectedRegion[];
  /** Intrinsic photo size when compact portrait labels must stay on the visible photograph. */
  readonly photoSize?: Pick<SceneLabelViewport, "width" | "height">;
  /** Words of the focused detail zone, placed before other words of equal rank. */
  readonly priorityLabelIds?: ReadonlySet<string>;
  readonly preferredOffsets?: SceneLabelLayoutOptions["preferredOffsets"];
}

interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface Slot {
  readonly rect: Rect;
  readonly segment: Segment;
}

interface IndexedSlot extends Slot {
  lastQuery: number;
}

type Direction = readonly [number, number];

/** Preferred order: right-hand side first (reading direction), then left, then vertical. */
const DIRECTIONS: readonly Direction[] = ([
  [1, -1],
  [1, 0],
  [1, 1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
] as const).map(([x, y]) => {
  const length = Math.hypot(x, y);
  return [x / length, y / length] as const;
});

/** Distance from anchor to the nearest pill edge, tried shortest first. */
const LEADER_DISTANCES = [14, 30, 52, 80] as const;
/**
 * Compact screens also try a very short leader first. Such a slot is only
 * taken when its pill covers no other word's anchor, so a tight pill never
 * hides a neighbouring word.
 */
const COMPACT_LEADER_DISTANCES = [8, 14, 30, 52, 80] as const;
const SHORT_LEADER_DISTANCE = 8;
// When a conflict would flip a word to the far side of its object, look for a
// legal position around its previous pill within a single visible movement.
const MAX_SLOT_SHIFT = 120;
const LOCAL_SHIFT_DISTANCES = [...LEADER_DISTANCES, 112, MAX_SLOT_SHIFT - 0.5];
const LOCAL_SHIFT_DIRECTIONS: readonly Direction[] = Array.from({ length: 24 }, (_, index) => {
  const angle = index * Math.PI / 12;
  return [Math.cos(angle), Math.sin(angle)];
});
const VIEWPORT_MARGIN = 4;
// The 28px compact touch target extends 5px above and below its 18px pill.
const PHOTO_VERTICAL_MARGIN = 5;
/** Pill clearance; compact screens pack words slightly tighter, since their pills are taller. */
const PILL_GAP = 3;
const COMPACT_PILL_GAP = 2;
const ANCHOR_CLEARANCE = 3;
const CULL_MARGIN = 120;
const SLOT_CELL_SIZE = 64;

const CJK = /[\u3000-\u9fff\uf900-\ufaff]/;

function glyphWidth(character: string): number {
  return CJK.test(character) ? 11 : 6.6;
}

/** Desktop pills are 12px tall; compact screens use 18px so dense scenes keep room for words. */
export function scenePlacementSize(
  label: Label,
  meaningVisible: boolean,
  compact: boolean,
): { width: number; height: number } {
  let textWidth = 0;
  for (const character of label.word) textWidth += glyphWidth(character);
  if (meaningVisible && label.translation) {
    let translationWidth = 0;
    for (const character of label.translation) translationWidth += glyphWidth(character);
    textWidth += 8 + translationWidth;
  }
  return {
    width: Math.min(260, Math.max(28, Math.ceil(textWidth + 14))),
    height: compact ? 18 : 12,
  };
}

function rectAt(centerX: number, centerY: number, width: number, height: number): Rect {
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
  };
}

function rectsOverlap(first: Rect, second: Rect, gap: number): boolean {
  return first.left < second.right + gap
    && first.right + gap > second.left
    && first.top < second.bottom + gap
    && first.bottom + gap > second.top;
}

function pointInRect(x: number, y: number, rect: Rect, gap: number): boolean {
  return x >= rect.left - gap && x <= rect.right + gap
    && y >= rect.top - gap && y <= rect.bottom + gap;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function segmentsIntersect(first: Segment, second: Segment): boolean {
  const d1 = cross(second.x2 - second.x1, second.y2 - second.y1, first.x1 - second.x1, first.y1 - second.y1);
  const d2 = cross(second.x2 - second.x1, second.y2 - second.y1, first.x2 - second.x1, first.y2 - second.y1);
  const d3 = cross(first.x2 - first.x1, first.y2 - first.y1, second.x1 - first.x1, second.y1 - first.y1);
  const d4 = cross(first.x2 - first.x1, first.y2 - first.y1, second.x2 - first.x1, second.y2 - first.y1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentTouchesRect(segment: Segment, rect: Rect): boolean {
  // Reject only strict separation so points on an edge keep the existing contact rules.
  if ((segment.x1 < rect.left && segment.x2 < rect.left)
    || (segment.x1 > rect.right && segment.x2 > rect.right)
    || (segment.y1 < rect.top && segment.y2 < rect.top)
    || (segment.y1 > rect.bottom && segment.y2 > rect.bottom)) return false;
  if (pointInRect(segment.x1, segment.y1, rect, 0) || pointInRect(segment.x2, segment.y2, rect, 0)) return true;
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  for (let index = 0; index < 4; index += 1) {
    const start = corners[index];
    const end = corners[(index + 1) % 4];
    if (segmentsIntersect(segment, { x1: start.x, y1: start.y, x2: end.x, y2: end.y })) return true;
  }
  return false;
}

function compareLabels(
  first: { label: Label; lod: number; distance: number; selected: boolean; priority: boolean },
  second: { label: Label; lod: number; distance: number; selected: boolean; priority: boolean },
  focusByDistance: boolean,
): number {
  return Number(second.selected) - Number(first.selected)
    || Number(second.priority) - Number(first.priority)
    || (focusByDistance && first.priority && second.priority ? first.distance - second.distance : 0)
    || first.lod - second.lod
    || first.distance - second.distance
    || first.label.id.localeCompare(second.label.id);
}

export function computeScenePlacements(
  labels: readonly Label[],
  camera: SceneLabelCamera,
  viewport: SceneLabelViewport,
  meaningVisible: boolean,
  options: ScenePlacementOptions = {},
): SceneLabelLayoutItem[] {
  const scale = camera.fit * camera.scale;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const photo = options.photoSize;
  // In a photo crop the object at the end of each readable leader must be in view.
  const anchorLeft = photo ? Math.max(0, camera.x) : -CULL_MARGIN;
  const anchorRight = photo ? Math.min(viewport.width, camera.x + photo.width * scale) : viewport.width + CULL_MARGIN;
  const anchorTop = photo ? Math.max(0, camera.y) : -CULL_MARGIN;
  const anchorBottom = photo ? Math.min(viewport.height, camera.y + photo.height * scale) : viewport.height + CULL_MARGIN;
  const left = photo ? anchorLeft + VIEWPORT_MARGIN : VIEWPORT_MARGIN;
  const right = (photo ? anchorRight : viewport.width) - VIEWPORT_MARGIN;
  const top = photo ? anchorTop + PHOTO_VERTICAL_MARGIN : VIEWPORT_MARGIN;
  const bottom = photo ? anchorBottom - PHOTO_VERTICAL_MARGIN : viewport.height - VIEWPORT_MARGIN;
  const protectedRegions = options.protectedRegions ?? [];
  const preferredOffsets = viewport.compact ? undefined : options.preferredOffsets;
  const pillGap = viewport.compact ? COMPACT_PILL_GAP : PILL_GAP;
  const leaderDistances = viewport.compact ? COMPACT_LEADER_DISTANCES : LEADER_DISTANCES;
  const candidates: Array<{ label: Label; lod: number; distance: number; selected: boolean; priority: boolean; anchorX: number; anchorY: number; width: number; height: number }> = [];
  for (const label of labels) {
    if (label.minScale !== undefined && camera.scale < label.minScale) continue;
    if (label.maxScale !== undefined && camera.scale > label.maxScale) continue;
    const anchorX = camera.x + label.x * scale;
    const anchorY = camera.y + label.y * scale;
    if (
      anchorX < anchorLeft
      || anchorX > anchorRight
      || anchorY < anchorTop
      || anchorY > anchorBottom
    ) continue;
    const size = scenePlacementSize(label, meaningVisible, viewport.compact);
    candidates.push({
      label,
      lod: Math.min(4, Math.max(0, Math.round(label.minLevel ?? 0))),
      distance: Math.hypot(anchorX - centerX, anchorY - centerY),
      selected: label.id === options.selectedLabelId,
      priority: options.priorityLabelIds?.has(label.id) ?? false,
      anchorX,
      anchorY,
      width: size.width,
      height: size.height,
    });
  }
  // In a portrait photo, give the focused zone's overview words the first
  // slots. A nearby part such as a spout can otherwise hide the faucet itself.
  const focusByDistance = viewport.compact && !photo;
  candidates.sort((first, second) => compareLabels(first, second, focusByDistance));

  const clearance = Math.max(pillGap, ANCHOR_CLEARANCE);
  const cellStride = Math.ceil((viewport.width + 2 * (CULL_MARGIN + clearance)) / SLOT_CELL_SIZE) + 1;
  const slotCells = new Map<number, IndexedSlot[]>();
  let queryNumber = 0;
  const placed = new Map<string, SceneLabelLayoutItem>();
  const coversUnplacedAnchor = (rect: Rect, selfId: string, priorityOnly = false): boolean => (
    candidates.some((other) => other.label.id !== selfId && (!priorityOnly || other.priority)
      && !placed.has(other.label.id) && pointInRect(other.anchorX, other.anchorY, rect, ANCHOR_CLEARANCE))
  );

  // The leader ends at the pill center, so the pill and anchor bound the
  // whole slot. Include both boundary cells, even for offscreen anchors.
  function visitSlotCells(rect: Rect, segment: Segment, visit: (key: number) => boolean | void): boolean {
    const firstColumn = Math.floor((Math.min(rect.left, segment.x1) - clearance) / SLOT_CELL_SIZE);
    const lastColumn = Math.floor((Math.max(rect.right, segment.x1) + clearance) / SLOT_CELL_SIZE);
    const firstRow = Math.floor((Math.min(rect.top, segment.y1) - clearance) / SLOT_CELL_SIZE);
    const lastRow = Math.floor((Math.max(rect.bottom, segment.y1) + clearance) / SLOT_CELL_SIZE);
    for (let row = firstRow; row <= lastRow; row += 1) {
      const rowKey = row * cellStride;
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (visit(rowKey + column)) return true;
      }
    }
    return false;
  }

  function anchorIsCovered(x: number, y: number): boolean {
    const key = Math.floor(y / SLOT_CELL_SIZE) * cellStride + Math.floor(x / SLOT_CELL_SIZE);
    return slotCells.get(key)?.some(({ rect }) => pointInRect(x, y, rect, ANCHOR_CLEARANCE)) ?? false;
  }

  type Candidate = (typeof candidates)[number];
  function freeSlot(candidate: Candidate, centerX: number, centerY: number, short = false): Slot | null {
    const rect = rectAt(centerX, centerY, candidate.width, candidate.height);
    if (
      rect.left < left
      || rect.right > right
      || rect.top < top
      || rect.bottom > bottom
    ) return null;
    if (protectedRegions.some((region) => rectsOverlap(rect, region, 0))) return null;
    const segment = { x1: candidate.anchorX, y1: candidate.anchorY, x2: centerX, y2: centerY };
    const query = ++queryNumber;
    if (visitSlotCells(rect, segment, (key) => {
      const cell = slotCells.get(key);
      if (!cell) return false;
      for (const other of cell) {
        if (other.lastQuery === query) continue;
        other.lastQuery = query;
        if (rectsOverlap(rect, other.rect, pillGap)
          || pointInRect(other.segment.x1, other.segment.y1, rect, ANCHOR_CLEARANCE)
          || segmentTouchesRect(segment, other.rect)
          || segmentsIntersect(segment, other.segment)
          || segmentTouchesRect(other.segment, rect)) return true;
      }
      return false;
    })) return null;
    if (short && coversUnplacedAnchor(rect, candidate.label.id)) return null;
    return { rect, segment };
  }

  function occupy(candidate: Candidate, slot: Slot) {
    const { segment } = slot;
    const indexed: IndexedSlot = { rect: slot.rect, segment, lastQuery: 0 };
    visitSlotCells(slot.rect, segment, (key) => {
      const cell = slotCells.get(key);
      if (cell) cell.push(indexed);
      else slotCells.set(key, [indexed]);
    });
    placed.set(candidate.label.id, {
      id: candidate.label.id,
      lod: candidate.lod as SceneLabelLayoutItem["lod"],
      opacity: 1,
      interactive: true,
      adaptive: false,
      width: candidate.width,
      height: candidate.height,
      screenX: segment.x2,
      screenY: segment.y2,
      offsetX: segment.x2 - segment.x1,
      offsetY: segment.y2 - segment.y1,
      placementOrder: placed.size,
    });
  }

  function placeInFreeSlot(candidate: Candidate) {
    const { anchorX, anchorY, width, height } = candidate;
    if (!candidate.priority && anchorIsCovered(anchorX, anchorY)) return;
    const preferred = preferredOffsets?.get(candidate.label.id);
    if (preferred) {
      // A pill grazing the edge can slide along it while its anchor stays on
      // screen. Try that minimum translation before changing leader direction.
      const oldX = anchorX + preferred.offsetX;
      const oldY = anchorY + preferred.offsetY;
      const x = Math.max(left + width / 2, Math.min(right - width / 2, oldX));
      const y = Math.max(top + height / 2, Math.min(bottom - height / 2, oldY));
      if ((x !== oldX || y !== oldY) && Math.hypot(x - oldX, y - oldY) <= MAX_SLOT_SHIFT
        && !pointInRect(anchorX, anchorY, rectAt(x, y, width, height), ANCHOR_CLEARANCE)) {
        const slot = freeSlot(candidate, x, y);
        if (slot) {
          occupy(candidate, slot);
          return;
        }
      }
    }
    let closest: Slot | null = null;
    let smallestShift = Infinity;
    for (const distance of leaderDistances) {
      for (const [directionX, directionY] of DIRECTIONS) {
        const support = (width / 2) * Math.abs(directionX) + (height / 2) * Math.abs(directionY);
        const reach = distance + support;
        // On narrow screens the nearest corner of a diagonal pill sits
        // `distance` from the anchor, even for a long, thin word.
        const pillCenterX = anchorX + (viewport.compact
          ? Math.sign(directionX) * width / 2 + directionX * distance
          : directionX * reach);
        const pillCenterY = anchorY + (viewport.compact
          ? Math.sign(directionY) * height / 2 + directionY * distance
          : directionY * reach);
        const shift = preferred
          ? (pillCenterX - anchorX - preferred.offsetX) ** 2 + (pillCenterY - anchorY - preferred.offsetY) ** 2
          : 0;
        if (shift >= smallestShift) continue;
        const slot = freeSlot(candidate, pillCenterX, pillCenterY, distance === SHORT_LEADER_DISTANCE);
        if (!slot) continue;
        if (!preferred) {
          // In a desktop detail crop, covering another focus word's anchor
          // prevents every leader from reaching it. Prefer an uncovered slot
          // but keep the first legal position if all of them cover an anchor.
          if (candidate.priority && !viewport.compact && coversUnplacedAnchor(slot.rect, candidate.label.id, true)) {
            closest ??= slot;
            continue;
          }
          occupy(candidate, slot);
          return;
        }
        closest = slot;
        smallestShift = shift;
      }
    }
    if (preferred && smallestShift > MAX_SLOT_SHIFT ** 2) {
      const freeShiftedSlot = (dx: number, dy: number): Slot | null => {
        const x = preferred.offsetX + dx;
        const y = preferred.offsetY + dy;
        const gapX = Math.max(0, Math.abs(x) - width / 2);
        const gapY = Math.max(0, Math.abs(y) - height / 2);
        if (Math.max(gapX, gapY) <= ANCHOR_CLEARANCE || Math.hypot(gapX, gapY) > MAX_SLOT_SHIFT) return null;
        return freeSlot(candidate, anchorX + x, anchorY + y);
      };
      // Try the direction of the nearest legal slot too. When it lies just
      // beyond the limit, part of the same open space can still be in reach.
      const distanceToClosest = Math.sqrt(smallestShift);
      const directions: readonly Direction[] = closest ? [
        ...LOCAL_SHIFT_DIRECTIONS,
        [
          (closest.segment.x2 - anchorX - preferred.offsetX) / distanceToClosest,
          (closest.segment.y2 - anchorY - preferred.offsetY) / distanceToClosest,
        ],
      ] : LOCAL_SHIFT_DIRECTIONS;
      for (const shift of LOCAL_SHIFT_DISTANCES) {
        for (const [dx, dy] of directions) {
          const slot = freeShiftedSlot(dx * shift, dy * shift);
          if (slot) {
            occupy(candidate, slot);
            return;
          }
        }
      }
      if (closest) {
        // A narrow opening between leaders can fall between the sampled rays.
        // Before accepting a distant slot, fill those gaps around the old pill.
        for (const step of [16, 8, 4]) {
          const extent = Math.floor(MAX_SLOT_SHIFT / step) * step;
          let nearest: Slot | null = null;
          let nearestSquared = MAX_SLOT_SHIFT ** 2;
          for (let dy = -extent; dy <= extent; dy += step) {
            for (let dx = -extent; dx <= extent; dx += step) {
              if (step < 16 && dx % (2 * step) === 0 && dy % (2 * step) === 0) continue;
              const squared = dx * dx + dy * dy;
              if (squared >= nearestSquared) continue;
              const slot = freeShiftedSlot(dx, dy);
              if (slot) {
                nearest = slot;
                nearestSquared = squared;
              }
            }
          }
          if (nearest) {
            occupy(candidate, nearest);
            return;
          }
        }
      }
    }
    if (closest) occupy(candidate, closest);
  }

  if (preferredOffsets?.size) {
    for (const candidate of candidates) {
      const previous = preferredOffsets.get(candidate.label.id);
      if (previous && (candidate.priority || !anchorIsCovered(candidate.anchorX, candidate.anchorY))) {
        const slot = freeSlot(candidate, candidate.anchorX + previous.offsetX, candidate.anchorY + previous.offsetY);
        if (slot) {
          occupy(candidate, slot);
          continue;
        }
      }
      if (candidate.selected) placeInFreeSlot(candidate);
    }
  }
  for (const candidate of candidates) {
    if (!placed.has(candidate.label.id)) placeInFreeSlot(candidate);
  }

  return labels.map((label) => placed.get(label.id) ?? {
    id: label.id,
    lod: Math.min(4, Math.max(0, Math.round(label.minLevel ?? 0))) as SceneLabelLayoutItem["lod"],
    opacity: 0,
    interactive: false,
    adaptive: false,
    width: 0,
    height: 0,
    screenX: Number.NaN,
    screenY: Number.NaN,
    offsetX: 0,
    offsetY: 0,
    placementOrder: Number.POSITIVE_INFINITY,
  });
}
