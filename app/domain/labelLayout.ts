import type { Label, Portal, SceneDetailZone } from "./types";

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
  /** True when spare screen space lets a future authored LOD appear early. */
  readonly adaptive: boolean;
  /** Estimated native screen-pixel footprint used by the collision pass. */
  readonly width: number;
  readonly height: number;
  readonly screenX: number;
  readonly screenY: number;
  /** Small screen-pixel displacement used to resolve a local collision. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Stable collision ownership order for retaining placements across frames. */
  readonly placementOrder: number;
}

export interface SceneLabelProtectedRegion {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface SceneLabelLayoutOptions {
  /** A selected or keyboard-focused word always wins its local collision. */
  readonly selectedLabelId?: string | null;
  /**
   * Optional first scale at which future higher-LOD labels may use spare
   * overview space. Dense scene transitions can keep their deepest pills out
   * of the first frame while preserving the complete authored label set for
   * zoom and pan.
   */
  readonly adaptiveRevealScale?: number;
  /** Screen-space controls, such as portal cues, that word pills must avoid. */
  readonly protectedRegions?: readonly SceneLabelProtectedRegion[];
  /** Previous interactive slots retained during one continuous camera direction. */
  readonly preferredOffsets?: ReadonlyMap<string, {
    readonly offsetX: number;
    readonly offsetY: number;
  }>;
}

export interface SceneLabelMountWindowOptions {
  readonly selectedLabelId?: string | null;
  readonly focusedLabelId?: string | null;
  /** The previous window is retained as overscan while its anchors remain nearby. */
  readonly previousIds?: ReadonlySet<string>;
}

// The dense home atlas reaches 249 painted/interactive labels during legal
// desktop pan/zoom sweeps. The ceiling bounds hidden overscan, never real
// readable vocabulary; compact sweeps peak at 124 before chrome reservations.
export const DESKTOP_SCENE_LABEL_MOUNT_LIMIT = 256;
export const COMPACT_SCENE_LABEL_MOUNT_LIMIT = 128;

export interface VocabularyZoomCue {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** A real authored object point used as the cue's visual anchor. */
  readonly anchorLabelId: string;
  readonly labelIds: readonly string[];
  readonly minLod: 2 | 3 | 4;
  /** Authored semantic zones always take precedence over inferred grid cells. */
  readonly source: "authored-zone" | "fallback-grid";
  readonly detailZoneId?: string;
  readonly title?: string;
  readonly translation?: string;
  readonly targetScale?: number;
  /** Camera focus can use the authored crop center without pretending it is an object anchor. */
  readonly focusX?: number;
  readonly focusY?: number;
}

export interface VocabularyCueBatchCandidate {
  readonly cue: VocabularyZoomCue;
  /** Exact remaining labels represented by the cue. */
  readonly labels: readonly Label[];
  /** Nearest batch reached by this activation; defaults to `labels` for grid cues. */
  readonly nextLabels?: readonly Label[];
  readonly nextLod: 2 | 3 | 4;
  readonly targetScale?: number;
}

export interface VocabularyCueRevealBatch extends VocabularyCueBatchCandidate {
  /** Includes absorbed small cues, which must be hidden while this cue owns them. */
  readonly sourceCueIds: readonly string[];
  /** Sparse batches stay perceivable without pretending to be a large region. */
  readonly mode: "region" | "compact";
}

export interface VocabularyRevealSummary {
  /** Every currently hidden label that can really cross the visibility gate at a deeper scale. */
  readonly hiddenLabels: readonly Label[];
  /** The nearest authored LOD among those hidden labels. */
  readonly nextLabels: readonly Label[];
  readonly nextLod: LabelLod | null;
  /** First scale at which the leading label in the next LOD really becomes visible. */
  readonly targetScale: number | null;
}

export interface VocabularyCueRevealState extends VocabularyRevealSummary {
  /** Exact remaining count for this cue; distinct from the next batch reached by one zoom. */
  readonly hiddenLabels: readonly Label[];
  /** Camera scale that honors the authored crop and can reveal the nearest hidden batch. */
  readonly targetScale: number | null;
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

type LabelLod = SceneLabelLayoutItem["lod"];

const revealScaleCache = new WeakMap<Label, Map<string, number | null>>();
const estimatedSizeCache = new WeakMap<Label, Readonly<{
  desktopHiddenMeaning: { readonly width: number; readonly height: number };
  desktopVisibleMeaning: { readonly width: number; readonly height: number };
  compactHiddenMeaning: { readonly width: number; readonly height: number };
  compactVisibleMeaning: { readonly width: number; readonly height: number };
}>>();
const placementOffsetCache = new Map<string, ReadonlyArray<readonly [number, number]>>();

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
  // Zoom is cumulative disclosure: once a grounded word is revealed it stays
  // available. Only an explicit authored maxScale may retire a label.
  if (authoredMaximum === undefined) return fadeIn;
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

function nextVocabularyRevealScale(
  label: Label,
  currentScale: number,
  maximumScale: number,
  visibilityThreshold: number,
): number | null {
  if (sceneLabelRevealOpacity(label, currentScale) >= visibilityThreshold) return null;
  const maximum = Math.max(currentScale, maximumScale);
  const cacheKey = `${maximum.toFixed(3)}:${visibilityThreshold.toFixed(3)}`;
  const labelCache = revealScaleCache.get(label) ?? new Map<string, number | null>();
  if (!revealScaleCache.has(label)) revealScaleCache.set(label, labelCache);
  const cached = labelCache.get(cacheKey);
  if (cached !== undefined) return cached !== null && cached > currentScale ? cached : null;

  const step = 0.02;
  let before = 0;
  for (let probe = step; probe < maximum + step; probe += step) {
    const scale = Math.min(maximum, probe);
    if (sceneLabelRevealOpacity(label, scale) >= visibilityThreshold) {
      let lower = before;
      let upper = scale;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const middle = (lower + upper) / 2;
        if (sceneLabelRevealOpacity(label, middle) >= visibilityThreshold) upper = middle;
        else lower = middle;
      }
      labelCache.set(cacheKey, upper);
      return upper > currentScale ? upper : null;
    }
    if (scale === maximum) break;
    before = scale;
  }
  labelCache.set(cacheKey, null);
  return null;
}

/**
 * Describes vocabulary that zooming can still reveal. This intentionally scans
 * every scene label rather than the bounded spatial cue set, so a cue limit,
 * portal overlap, or sparse grid cell can never make hidden vocabulary silent.
 */
export function buildVocabularyRevealSummary(
  labels: readonly Label[],
  currentScale: number,
  maximumScale: number,
  visibilityThreshold = 0.52,
  visibleLabelIds?: ReadonlySet<string>,
): VocabularyRevealSummary {
  const revealScales = new Map<string, number>();
  const unique = new Map<string, Label>();
  for (const label of labels) {
    if (visibleLabelIds?.has(label.id)) continue;
    const revealScale = nextVocabularyRevealScale(
      label,
      currentScale,
      maximumScale,
      visibilityThreshold,
    );
    if (revealScale === null) continue;
    const previousScale = revealScales.get(label.id);
    if (previousScale !== undefined && previousScale <= revealScale) continue;
    unique.set(label.id, label);
    revealScales.set(label.id, revealScale);
  }

  const hiddenLabels = [...unique.values()].sort((first, second) => (
    sceneLabelLod(first) - sceneLabelLod(second)
    || (revealScales.get(first.id) ?? maximumScale) - (revealScales.get(second.id) ?? maximumScale)
    || first.priority - second.priority
    || first.id.localeCompare(second.id)
  ));
  const nextLod = hiddenLabels.length > 0 ? sceneLabelLod(hiddenLabels[0]) : null;
  const nextLabels = nextLod === null
    ? []
    : hiddenLabels.filter((label) => sceneLabelLod(label) === nextLod);
  const leadingLabel = nextLabels[0];
  return {
    hiddenLabels,
    nextLabels,
    nextLod,
    targetScale: leadingLabel ? revealScales.get(leadingLabel.id) ?? null : null,
  };
}

export function buildVocabularyCueRevealState(
  cue: VocabularyZoomCue,
  labels: readonly Label[],
  currentScale: number,
  maximumScale: number,
  visibilityThreshold = 0.52,
): VocabularyCueRevealState {
  const cueLabelIds = new Set(cue.labelIds);
  const unique = new Map<string, Label>();
  for (const label of labels) {
    if (cueLabelIds.has(label.id)) unique.set(label.id, label);
  }
  const summary = buildVocabularyRevealSummary(
    [...unique.values()],
    currentScale,
    maximumScale,
    visibilityThreshold,
  );
  if (summary.nextLod === null || summary.targetScale === null) return summary;
  return {
    ...summary,
    targetScale: Math.min(maximumScale, Math.max(
      currentScale + 0.28,
      summary.targetScale + 0.08,
      cue.targetScale ?? 0,
    )),
  };
}

/**
 * Focus an authored cue on the vocabulary it is about to reveal. A detail
 * zone's authored centre can be far from its remaining labels after earlier
 * words have already appeared, which would make a truthful cue zoom to empty
 * space. The bounding-box centre keeps the next batch in the camera target.
 */
export function vocabularyCueFocusPoint(
  cue: Pick<VocabularyZoomCue, "source" | "focusX" | "focusY">,
  nextLabels: readonly Pick<Label, "x" | "y">[],
): { x: number; y: number } | null {
  if (cue.source === "authored-zone" && nextLabels.length > 0) {
    const xs = nextLabels.map((label) => label.x);
    const ys = nextLabels.map((label) => label.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  if (cue.focusX === undefined || cue.focusY === undefined) return null;
  return { x: cue.focusX, y: cue.focusY };
}

/**
 * A conservative first-screen density target for readable native-size pills.
 * The collision pass remains authoritative: this value is useful for content
 * QA and disclosure summaries, but it must never hide a label that has a safe
 * screen-space slot.
 */
export function sceneLabelVisibilityBudget(
  viewport: SceneLabelViewport,
  meaningVisible: boolean,
): number {
  const area = Math.max(0, viewport.width) * Math.max(0, viewport.height);
  const areaPerLabel = viewport.compact
    ? (meaningVisible ? 26_000 : 17_000)
    : (meaningVisible ? 31_000 : 20_000);
  const minimum = viewport.compact ? 12 : 20;
  const maximum = viewport.compact ? 28 : 56;
  return Math.round(clamp(Math.floor(area / areaPerLabel), minimum, maximum));
}

/** The number of readable pills the current zoom should try to expose. */
export function sceneLabelDensityTarget(
  viewport: SceneLabelViewport,
  meaningVisible: boolean,
  scale: number,
  firstScreenTarget = sceneLabelVisibilityBudget(viewport, meaningVisible),
): number {
  const maximum = Math.max(1, Math.floor(firstScreenTarget));
  const fill = 0.7 + 0.3 * smoothstep(0.9, 2.8, scale);
  return Math.max(1, Math.ceil(maximum * fill));
}

/** Keeps spatial navigation cues useful without covering the vocabulary plane. */
export function sceneVocabularyCueLimit(viewportWidth: number): number {
  return viewportWidth <= 700 ? 2 : 3;
}

/**
 * Converts authored portal rectangles to the screen-space footprint of their
 * gold button and caption. Protecting only the cue (rather than the whole
 * object region) keeps nearby object vocabulary available.
 */
export function buildPortalCueProtectedRegions(
  portals: readonly Portal[],
  camera: SceneLabelCamera,
  viewport: SceneLabelViewport,
): SceneLabelProtectedRegion[] {
  const effectiveScale = camera.fit * camera.scale;
  const cueWidth = viewport.compact ? 154 : 204;
  const cueTop = viewport.compact ? 30 : 32;
  const cueBottom = viewport.compact ? 56 : 62;
  return portals.flatMap((portal) => {
    const centerX = camera.x + (portal.x + portal.width / 2) * effectiveScale;
    const centerY = camera.y + (portal.y + portal.height / 2) * effectiveScale;
    if (
      centerX < -cueWidth / 2
      || centerX > viewport.width + cueWidth / 2
      || centerY < -cueBottom
      || centerY > viewport.height + cueTop
    ) return [];
    return [{
      left: centerX - cueWidth / 2,
      right: centerX + cueWidth / 2,
      top: centerY - cueTop,
      bottom: centerY + cueBottom,
    }];
  });
}

function estimatedLabelSize(
  label: Label,
  meaningVisible: boolean,
  lod: LabelLod,
  compact: boolean,
): { width: number; height: number } {
  const cached = estimatedSizeCache.get(label);
  const cacheKey = compact
    ? meaningVisible ? "compactVisibleMeaning" : "compactHiddenMeaning"
    : meaningVisible ? "desktopVisibleMeaning" : "desktopHiddenMeaning";
  if (cached) return cached[cacheKey];
  const detailed = lod >= 3;
  // Font-weight 750 makes Latin glyphs slightly wider than a regular canvas
  // estimate. Keep a conservative buffer so the collision model agrees with
  // actual DOM geometry on high-DPR mobile Chromium.
  const wordWidth = Math.max(24, Array.from(label.word).length * (detailed ? 6.55 : 7.15));
  const translationWidth = Array.from(label.translation).length * (detailed ? 9.8 : 10.65) + 15;
  // Spatial pills stay compact enough to preserve the artwork while the
  // mobile stylesheet keeps its separate 28px touch target. The estimates
  // mirror the desktop CSS box (font line plus border and minimal padding).
  const desktopHeight = detailed ? 13 : 15;
  const compactHeight = 28;
  const hiddenWidth = Math.min(250, (detailed ? 27 : 31) + wordWidth);
  const visibleWidth = Math.min(250, (detailed ? 27 : 31) + wordWidth + translationWidth);
  const desktopHiddenMeaning = {
    width: hiddenWidth,
    height: desktopHeight,
  };
  const desktopVisibleMeaning = {
    width: visibleWidth,
    height: desktopHeight,
  };
  const compactHiddenMeaning = {
    width: hiddenWidth,
    height: compactHeight,
  };
  const compactVisibleMeaning = {
    width: visibleWidth,
    height: compactHeight,
  };
  const sizes = {
    desktopHiddenMeaning,
    desktopVisibleMeaning,
    compactHiddenMeaning,
    compactVisibleMeaning,
  };
  estimatedSizeCache.set(label, sizes);
  return sizes[cacheKey];
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

/**
 * Creates a small, stable set of spatial hints for vocabulary that will be
 * revealed by zooming without entering a child scene. Labels inside a portal
 * are intentionally excluded: the portal's gold entry marker owns that area,
 * so a green "more words" marker cannot contradict it.
 */
function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildVocabularyZoomCues(
  labels: readonly Label[],
  portals: readonly Portal[],
  sceneWidth: number,
  sceneHeight: number,
  maxCues = 4,
  detailZones: readonly SceneDetailZone[] = [],
): VocabularyZoomCue[] {
  const isInsidePortal = (label: Label) => portals.some((portal) => (
    label.x >= portal.x
    && label.x <= portal.x + portal.width
    && label.y >= portal.y
    && label.y <= portal.y + portal.height
  ));
  const cueLimit = Math.max(0, maxCues);
  const orderedGroup = (group: readonly Label[]) => [...group].sort((first, second) => (
    sceneLabelLod(first) - sceneLabelLod(second)
    || first.priority - second.priority
    || first.id.localeCompare(second.id)
  ));
  const closestRealAnchor = (group: readonly Label[], x: number, y: number) => (
    [...group].sort((first, second) => (
      Math.hypot(first.x - x, first.y - y) - Math.hypot(second.x - x, second.y - y)
      || first.priority - second.priority
      || first.id.localeCompare(second.id)
    ))[0]
  );

  if (detailZones.length > 0) {
    const labelById = new Map(labels.map((label) => [label.id, label]));
    return detailZones.flatMap((zone) => {
      const group = zone.labelIds
        .map((labelId) => labelById.get(labelId))
        .filter((label): label is Label => Boolean(label))
        .filter((label) => sceneLabelLod(label) >= 2 && !isInsidePortal(label));
      if (group.length === 0) return [];
      const ordered = orderedGroup(group);
      const focusX = zone.x + zone.width / 2;
      const focusY = zone.y + zone.height / 2;
      const anchor = closestRealAnchor(group, focusX, focusY);
      return [{
        id: `detail-zone-${zone.id}`,
        x: anchor.x,
        y: anchor.y,
        anchorLabelId: anchor.id,
        labelIds: ordered.map((label) => label.id),
        minLod: sceneLabelLod(ordered[0]) as 2 | 3 | 4,
        source: "authored-zone" as const,
        detailZoneId: zone.id,
        title: zone.title,
        translation: zone.translation,
        targetScale: zone.targetScale,
        focusX,
        focusY,
      } satisfies VocabularyZoomCue];
    }).slice(0, cueLimit);
  }

  const columns = 4;
  const rows = 3;
  const cellWidth = sceneWidth / columns;
  const cellHeight = sceneHeight / rows;
  const groups = new Map<string, Label[]>();

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
      const ordered = orderedGroup(group);
      const minLod = sceneLabelLod(ordered[0]) as 2 | 3 | 4;
      const centroid = {
        x: group.reduce((sum, label) => sum + label.x, 0) / group.length,
        y: group.reduce((sum, label) => sum + label.y, 0) / group.length,
      };
      const anchor = closestRealAnchor(group, centroid.x, centroid.y);
      return {
        id: `vocabulary-${cell}`,
        x: anchor.x,
        y: anchor.y,
        anchorLabelId: anchor.id,
        labelIds: ordered.map((label) => label.id),
        minLod,
        source: "fallback-grid",
      } satisfies VocabularyZoomCue;
    })
    .sort((first, second) => (
      second.labelIds.length - first.labelIds.length
      || first.minLod - second.minLod
      || first.y - second.y
      || first.x - second.x
    ))
    .slice(0, cueLimit);
}

function uniqueBatchLabels(batches: readonly VocabularyCueBatchCandidate[]): Label[] {
  const labels = new Map<string, Label>();
  for (const batch of batches) {
    for (const label of batch.labels) labels.set(label.id, label);
  }
  return [...labels.values()].sort((first, second) => (
    first.priority - second.priority || first.id.localeCompare(second.id)
  ));
}

function batchFitsSpan(labels: readonly Label[], maximumSpanX: number, maximumSpanY: number): boolean {
  if (labels.length < 2) return true;
  const xs = labels.map((label) => label.x);
  const ys = labels.map((label) => label.y);
  return Math.max(...xs) - Math.min(...xs) <= maximumSpanX
    && Math.max(...ys) - Math.min(...ys) <= maximumSpanY;
}

/**
 * Produces truthful green zoom batches. Only the currently nearest LOD is
 * eligible. A cue with fewer than `minimumWordCount` labels is merged when
 * possible and otherwise returned as a compact cue; no real hidden batch is
 * silently discarded. Returned counts are always exact, deduplicated labels.
 */
export function consolidateVocabularyCueBatches(
  candidates: readonly VocabularyCueBatchCandidate[],
  minimumWordCount = 4,
  maximumSpanX = Number.POSITIVE_INFINITY,
  maximumSpanY = Number.POSITIVE_INFINITY,
): VocabularyCueRevealBatch[] {
  const minimum = Math.max(1, Math.floor(minimumWordCount));
  const nextLod = candidates.reduce<number>(
    (lowest, candidate) => Math.min(lowest, candidate.nextLod),
    Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(nextLod)) return [];

  const eligible = candidates
    .filter((candidate) => candidate.nextLod === nextLod)
    .map((candidate) => ({
      ...candidate,
      labels: uniqueBatchLabels([candidate]),
    }));
  const ready: VocabularyCueRevealBatch[] = eligible
    .filter((candidate) => candidate.labels.length >= minimum)
    .map((candidate) => ({
      ...candidate,
      sourceCueIds: [candidate.cue.id],
      mode: "region" as const,
    }));
  let small = eligible.filter((candidate) => candidate.labels.length < minimum);

  while (small.length > 1) {
    const combinations: Array<{
      batches: VocabularyCueBatchCandidate[];
      labels: Label[];
      mask: number;
      spanArea: number;
    }> = [];
    for (let mask = 1; mask < 2 ** small.length; mask += 1) {
      if ((mask & (mask - 1)) === 0) continue;
      const batches = small.filter((_, index) => (mask & (1 << index)) !== 0);
      const labels = uniqueBatchLabels(batches);
      if (labels.length < minimum || !batchFitsSpan(labels, maximumSpanX, maximumSpanY)) continue;
      const xs = labels.map((label) => label.x);
      const ys = labels.map((label) => label.y);
      combinations.push({
        batches,
        labels,
        mask,
        spanArea: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)),
      });
    }
    const selected = combinations.sort((first, second) => (
      first.labels.length - second.labels.length
      || first.spanArea - second.spanArea
      || first.batches.length - second.batches.length
      || first.batches.map((batch) => batch.cue.id).join("|")
        .localeCompare(second.batches.map((batch) => batch.cue.id).join("|"))
    ))[0];
    if (!selected) break;

    const primary = [...selected.batches].sort((first, second) => (
      second.labels.length - first.labels.length
      || first.cue.id.localeCompare(second.cue.id)
    ))[0];
    ready.push({
      cue: primary.cue,
      labels: selected.labels,
      nextLod: primary.nextLod,
      sourceCueIds: selected.batches.map((batch) => batch.cue.id).sort(),
      mode: "region",
    });
    small = small.filter((_, index) => (selected.mask & (1 << index)) === 0);
  }

  for (const candidate of small) {
    ready.push({
      ...candidate,
      sourceCueIds: [candidate.cue.id],
      mode: "compact",
    });
  }

  return ready.sort((first, second) => (
    first.nextLod - second.nextLod
    || first.cue.y - second.cue.y
    || first.cue.x - second.cue.x
    || first.cue.id.localeCompare(second.cue.id)
  ));
}

function placementOffsets(
  id: string,
  width: number,
  height: number,
  compact: boolean,
  includeSmoothRings = false,
): ReadonlyArray<readonly [number, number]> {
  const cacheKey = `${id}:${width.toFixed(2)}:${height.toFixed(2)}:${compact ? 1 : 0}:${includeSmoothRings ? 1 : 0}`;
  const cached = placementOffsetCache.get(cacheKey);
  if (cached) return cached;
  const horizontal = Math.min(compact ? 58 : 72, Math.max(30, width * 0.54));
  const vertical = height + (compact ? 2 : 4);
  const maximumLeader = compact ? 100 : 150;
  const wideHorizontal = Math.min(
    maximumLeader,
    Math.max(horizontal * 1.85, width * 0.62),
  );
  const wideVertical = Math.min(maximumLeader, vertical * 3);
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
  // The eight compass slots above are deliberately stable, but they leave a
  // large angular gap when a remembered diagonal is blocked by a neighbour.
  // Add a few finer rings as deterministic alternatives. This is the same
  // variable-placement idea used by map label engines, kept bounded here so
  // the collision pass remains cheap and repeatable rather than simulated.
  const ringRadius = Math.max(horizontal, vertical * 1.5);
  const smoothRings = [0.72, 1, 1.28, 1.5].flatMap((radiusScale) => (
    Array.from({ length: 16 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 8;
      return [
        ringRadius * radiusScale * Math.cos(angle),
        ringRadius * radiusScale * Math.sin(angle),
      ] as const;
    })
  ));
  const rotation = stableHash(id) % firstRing.length;
  const rotated = firstRing.slice(rotation).concat(firstRing.slice(0, rotation));
  const candidates: ReadonlyArray<readonly [number, number]> = [
    // Keep the short upward stem as the stable default. Alternative directions
    // remain deterministic, and the placement pass only changes direction
    // when the default would collide with a pill or another leader.
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
    ...(includeSmoothRings ? smoothRings : []),
    // A final bounded ring can use genuinely empty screen space. It is only a
    // fallback after every near-anchor slot fails, and the DOM draws a leader
    // all the way back to the audited object point so the semantic attachment
    // never changes.
    [-wideHorizontal, 0],
    [wideHorizontal, 0],
    [0, -wideVertical],
    [0, wideVertical],
    [-wideHorizontal * 0.68, -wideVertical * 0.68],
    [wideHorizontal * 0.68, -wideVertical * 0.68],
    [-wideHorizontal * 0.68, wideVertical * 0.68],
    [wideHorizontal * 0.68, wideVertical * 0.68],
  ];
  const unique = new Map<string, readonly [number, number]>();
  for (const [x, y] of candidates) {
    const distance = Math.hypot(x, y);
    const ratio = distance <= maximumLeader ? 1 : maximumLeader / distance;
    const bounded = [x * ratio, y * ratio] as const;
    unique.set(`${bounded[0].toFixed(2)}:${bounded[1].toFixed(2)}`, bounded);
  }
  const offsets = [...unique.values()];
  placementOffsetCache.set(cacheKey, offsets);
  return offsets;
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
      // A pill usually spans several grid cells. De-duplicate those references
      // inside one query so dense overview frames do not compare the same two
      // bounds repeatedly for every shared cell.
      const visited = new Set<LabelBounds>();
      return visitCells(bounds, padding, (cell) => {
        for (const placed of cell) {
          if (visited.has(placed)) continue;
          visited.add(placed);
          if (overlaps(bounds, placed, padding)) return true;
        }
        return false;
      });
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

/** Keeps current labels first in the cumulative scene encounter history. */
export function prioritizeCurrentLabelOrder(
  retainedLabelIds: ReadonlySet<string>,
  layout: readonly Pick<SceneLabelLayoutItem, "id" | "interactive" | "placementOrder">[],
): Set<string> {
  const current = [...layout]
    .filter((item) => item.interactive)
    .sort((first, second) => first.placementOrder - second.placementOrder);
  const prioritized = new Set(current.map((item) => item.id));
  for (const id of retainedLabelIds) prioritized.add(id);
  return prioritized;
}

export function sceneLabelMountLimit(viewport: Pick<SceneLabelViewport, "compact">): number {
  return viewport.compact
    ? COMPACT_SCENE_LABEL_MOUNT_LIMIT
    : DESKTOP_SCENE_LABEL_MOUNT_LIMIT;
}

/** Membership equality keeps camera frames from publishing no-op React state. */
export function sameSceneLabelMountWindow(
  first: ReadonlySet<string>,
  second: ReadonlySet<string>,
): boolean {
  if (first.size !== second.size) return false;
  for (const id of first) if (!second.has(id)) return false;
  return true;
}

/**
 * Selects the bounded DOM window for a complete scene layout.
 *
 * Layout still owns all authored labels. Every painted/interactive label and
 * the active keyboard/selection targets enter first. Previous candidates then
 * remain as stable overscan while they have a finite projection. Hidden
 * candidates are never mounted merely to fill unused capacity.
 */
export function buildSceneLabelMountWindow(
  labels: readonly Pick<Label, "id" | "priority">[],
  layout: readonly SceneLabelLayoutItem[],
  viewport: Pick<SceneLabelViewport, "compact">,
  options: SceneLabelMountWindowOptions = {},
): Set<string> {
  const limit = sceneLabelMountLimit(viewport);
  const labelIds = new Set(labels.map(({ id }) => id));
  const layoutById = new Map(layout.map((item) => [item.id, item]));
  const labelPriority = new Map(labels.map(({ id, priority }, index) => [
    id,
    { priority, index },
  ]));
  const mounted = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (!id || mounted.size >= limit || !labelIds.has(id)) return;
    mounted.add(id);
  };

  add(options.focusedLabelId);
  add(options.selectedLabelId);

  const stableOrder = (first: SceneLabelLayoutItem, second: SceneLabelLayoutItem) => (
    first.placementOrder - second.placementOrder
    || (labelPriority.get(first.id)?.priority ?? Number.POSITIVE_INFINITY)
      - (labelPriority.get(second.id)?.priority ?? Number.POSITIVE_INFINITY)
    || (labelPriority.get(first.id)?.index ?? Number.POSITIVE_INFINITY)
      - (labelPriority.get(second.id)?.index ?? Number.POSITIVE_INFINITY)
    || first.id.localeCompare(second.id)
  );
  const essential = layout
    .filter((item) => item.interactive || item.opacity > 0.025)
    .sort(stableOrder);
  for (const item of essential) add(item.id);

  // A production collision pass stays below the corresponding hard limit.
  // If malformed external layout data exceeds it, focus/selection and the
  // stable highest-priority painted subset still keep the DOM bounded.
  if (mounted.size >= limit) return mounted;

  for (const id of options.previousIds ?? []) {
    const item = layoutById.get(id);
    if (item && Number.isFinite(item.screenX) && Number.isFinite(item.screenY)) add(id);
  }
  return mounted;
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
  options: SceneLabelLayoutOptions = {},
): SceneLabelLayoutItem[] {
  const effectiveScale = camera.fit * camera.scale;
  const candidates = labels
    .flatMap((label) => {
      const lod = sceneLabelLod(label);
      const screenX = camera.x + label.x * effectiveScale;
      const screenY = camera.y + label.y * effectiveScale;
      // Future-reveal probing is a small binary search over the authored
      // scale bands. Screen-space culling must happen first so a large scene
      // does not spend that work on labels that cannot enter this frame or
      // the bounded DOM window.
      if (
        screenX < -18
        || screenX > viewport.width + 18
        || screenY < -18
        || screenY > viewport.height + 18
      ) return [];
      const naturalOpacity = sceneLabelRevealOpacity(label, camera.scale);
      const futureRevealScale = nextVocabularyRevealScale(
        label,
        camera.scale,
        4.15,
        0.52,
      );
      const size = estimatedLabelSize(label, meaningVisible, lod, viewport.compact);
      return [{
        label,
        lod,
        naturalOpacity,
        futureRevealScale,
        screenX,
        screenY,
        ...size,
      }];
    })
    .filter(({ label, naturalOpacity, futureRevealScale }) => (
      (naturalOpacity > 0.025
        || futureRevealScale !== null
        || label.id === options.selectedLabelId)
    ))
    .sort((first, second) => {
      const selected = Number(second.label.id === options.selectedLabelId)
        - Number(first.label.id === options.selectedLabelId);
      if (selected !== 0) return selected;
      // Camera history must not decide collision ownership. A stable authored
      // order makes an exact zoom round trip reproduce both the same labels
      // and the same callout directions.
      return first.label.priority - second.label.priority
        || first.lod - second.lod
        || first.label.id.localeCompare(second.label.id);
    });

  const collisionIndex = createCollisionIndex(viewport.compact ? 40 : 48);
  for (const region of options.protectedRegions ?? []) collisionIndex.add(region);
  const padding = viewport.compact ? 1 : 2;
  const edgeMargin = viewport.compact ? 3 : 6;
  const reservedPreferredOffsets = new Map<string, readonly [number, number]>();
  // Reserve every still-legal interactive slot before ordinary first-fit.
  // Otherwise an earlier label can briefly borrow a later label's old slot,
  // choose another final slot itself, and make the later callout visibly flip
  // even though its previous position ends the frame empty.
  for (const candidate of candidates) {
    const preferred = options.preferredOffsets?.get(candidate.label.id);
    const remainsInteractive = candidate.label.id === options.selectedLabelId
      || candidate.naturalOpacity >= 0.52
      || candidate.futureRevealScale !== null;
    if (
      !preferred
      || !remainsInteractive
      || !Number.isFinite(preferred.offsetX)
      || !Number.isFinite(preferred.offsetY)
    ) continue;
    const bounds = boundsAt(
      candidate.screenX + preferred.offsetX,
      candidate.screenY + preferred.offsetY,
      candidate.width,
      candidate.height,
    );
    if (!insideViewport(bounds, viewport, edgeMargin) || collisionIndex.overlaps(bounds, 0)) continue;
    collisionIndex.add(bounds);
    reservedPreferredOffsets.set(candidate.label.id, [preferred.offsetX, preferred.offsetY]);
  }
  const visible = new Map<string, SceneLabelLayoutItem>();
  for (const [placementOrder, candidate] of candidates.entries()) {
    const selected = candidate.label.id === options.selectedLabelId;
    const naturallyInteractive = candidate.naturalOpacity >= 0.52;
    // A free, readable slot is more useful than an artificial "more words"
    // counter. Authored LOD still describes disclosure depth, but the density
    // target is never a hard gate while a deterministic safe slot exists.
    const adaptiveScale = options.adaptiveRevealScale === undefined
      ? 0
      : options.adaptiveRevealScale + Math.max(0, (candidate.lod - 2) * 0.48);
    const adaptive = !naturallyInteractive
      && camera.scale >= adaptiveScale
      && (selected || candidate.futureRevealScale !== null);
    const candidateOpacity = selected
      ? Math.max(1, candidate.naturalOpacity)
      : adaptive
        ? Math.max(0.82, candidate.naturalOpacity)
        : candidate.naturalOpacity;
    if (candidateOpacity <= 0.025) continue;
    const preferredOffset = options.preferredOffsets?.get(candidate.label.id);
    const hasPreferredOffset = Boolean(
      preferredOffset
      && Number.isFinite(preferredOffset.offsetX)
      && Number.isFinite(preferredOffset.offsetY),
    );
    const canonicalOffsets = placementOffsets(
      candidate.label.id,
      candidate.width,
      candidate.height,
      viewport.compact,
      hasPreferredOffset,
    );
    const preferredAlternatives = hasPreferredOffset
      ? canonicalOffsets
        .filter(([offsetX, offsetY]) => (
          offsetX !== preferredOffset!.offsetX || offsetY !== preferredOffset!.offsetY
        ))
        .sort((first, second) => (
          Math.hypot(
            first[0] - preferredOffset!.offsetX,
            first[1] - preferredOffset!.offsetY,
          )
          - Math.hypot(
            second[0] - preferredOffset!.offsetX,
            second[1] - preferredOffset!.offsetY,
          )
          || first[1] - second[1]
          || first[0] - second[0]
        ))
      : canonicalOffsets;
    // A collision can make the remembered slot unavailable even though the
    // anchor is still on screen. Try a few bounded points on the path toward
    // the nearest canonical slots before taking the full ring jump; this keeps
    // the leader moving locally while the collision pass remains authoritative.
    const transitionalOffsets = hasPreferredOffset
      ? preferredAlternatives
        .slice(0, 8)
        .flatMap(([offsetX, offsetY]) => [0.5, 0.78].map((progress) => (
          [
            preferredOffset!.offsetX + (offsetX - preferredOffset!.offsetX) * progress,
            preferredOffset!.offsetY + (offsetY - preferredOffset!.offsetY) * progress,
          ] as const
        )))
      : [];
    const authoredOffsets = hasPreferredOffset
      ? [
          [preferredOffset!.offsetX, preferredOffset!.offsetY] as const,
          ...transitionalOffsets,
          ...preferredAlternatives,
        ]
      : preferredAlternatives;
    const reservedPlacement = reservedPreferredOffsets.get(candidate.label.id);
    const placement = reservedPlacement ?? authoredOffsets.find(([offsetX, offsetY]) => {
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
    if (!blocked && !reservedPlacement) {
      collisionIndex.add(boundsAt(
        candidate.screenX + offsetX,
        candidate.screenY + offsetY,
        candidate.width,
        candidate.height,
      ));
    }
    const opacity = blocked ? 0 : candidateOpacity;
    const interactive = !blocked && opacity >= 0.52;
    visible.set(candidate.label.id, {
      id: candidate.label.id,
      lod: candidate.lod,
      opacity,
      interactive,
      adaptive: !blocked && adaptive,
      width: candidate.width,
      height: candidate.height,
      screenX: candidate.screenX + offsetX,
      screenY: candidate.screenY + offsetY,
      offsetX,
      offsetY,
      placementOrder,
    });
  }

  return labels.map((label) => visible.get(label.id) ?? {
    id: label.id,
    lod: sceneLabelLod(label),
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
