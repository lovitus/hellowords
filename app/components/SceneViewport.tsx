"use client";

/* SVG scene slices intentionally remain external images so their drawing nodes do not enter the app DOM. */
/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  advanceLabelDwell,
  createSceneAssetLoadState,
  buildLabelSemanticStyleMap,
  buildPortalCueProtectedRegions,
  buildSceneLabelMountWindow,
  buildVocabularyCueRevealState,
  buildVocabularyRevealSummary,
  buildVocabularyZoomCues,
  consolidateVocabularyCueBatches,
  computeSceneLabelLayout,
  advanceParentExitHysteresis,
  createParentExitHysteresisState,
  DEFAULT_PORTAL_HYSTERESIS_POLICY,
  LABEL_ENCOUNTER_OPACITY,
  maximumSceneCameraScale,
  prioritizeCurrentLabelOrder,
  reconcileSceneAssetLoad,
  resolveSceneAssets,
  sceneLabelLod,
  sceneLabelMountLimit,
  sceneLabelRevealOpacity,
  sceneVocabularyCueLimit,
  sameSceneLabelMountWindow,
  settleSceneAssetPreload,
  smoothCameraTowards,
  vocabularyCueFocusPoint,
  type Label,
  type Portal as ScenePortal,
  type Scene,
  type ResolvedSceneAsset,
  type SceneAssetLoadState,
  type SceneDetailZone,
  type SceneLabelProtectedRegion,
} from "../domain";
import { SPATIAL_LEXEME_REALMS } from "../domain/spatialLexemeRealms.generated";
import { decodedSceneAssetCache } from "../lib/decoded-scene-asset-cache";

interface SceneViewportProps {
  scene: Scene;
  meaningVisible: boolean;
  selectedLabelId?: string | null;
  portalTargetTitles: Readonly<Record<string, string>>;
  transitionPhase?: "active" | "outgoing" | "incoming";
  interactionLocked?: boolean;
  onCommitScene: (
    sceneId: string,
    source: "zoom" | "pointer" | "keyboard",
    portal?: ScenePortal,
  ) => false | "warm" | "cold";
  onEnterScene: (
    sceneId: string,
    source: "zoom" | "pointer" | "keyboard",
  ) => Promise<boolean>;
  onExitScene: () => void;
  onLabelsEncountered: (labels: readonly Label[]) => void;
  onLabelEncountered: (label: Label) => void;
  onSelectWord: (label: Label) => void;
  onExploreSemanticPlane?: (
    label: Label | null,
    source: "zoom" | "pointer" | "keyboard",
  ) => void;
  onPrefetchScene: (
    sceneId: string,
  ) => void | Scene | null | Promise<Scene | null>;
  initialView?: SceneContinuityView;
  onCameraFrame?: (snapshot: SceneViewportSnapshot) => void;
  onMotionFrozenChange?: (frozen: boolean) => void;
  onPortalNavigatorReady?: (navigator: ScenePortalNavigator | null) => void;
  onFocusTargetNavigatorReady?: (navigator: SceneFocusNavigator | null) => void;
  /** Top-level home-atlas regions, shown as quiet map targets instead of a label cloud. */
  atlasDistricts?: readonly SceneAtlasDistrict[];
  focusedDetailZoneId?: string | null;
  wordIndexOpen?: boolean;
}

export type ScenePortalNavigator = (
  portalId: string,
  source: "pointer" | "keyboard",
) => boolean;

export interface SceneFocusTarget {
  readonly id: string;
  /** Scene-space point that should land at the viewport centre. */
  readonly x: number;
  readonly y: number;
  /** Authored logical scale; the camera still clamps it to its real ceiling. */
  readonly targetScale: number;
}

export interface SceneAtlasDistrict {
  readonly id: string;
  readonly label: string;
  readonly translation: string;
  readonly labelCount: number;
  readonly labelIds: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type SceneFocusNavigator = (
  target: SceneFocusTarget,
  source: "pointer" | "keyboard",
) => boolean;

export interface SceneViewportCamera {
  x: number;
  y: number;
  scale: number;
  fit: number;
}

export interface SceneViewportSnapshot {
  readonly sceneId: string;
  readonly camera: SceneViewportCamera;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/**
 * One navigation handoff expressed in the same camera coordinate system as
 * the viewport. A forward handoff starts the child at the exact pixels drawn
 * by its parent tile. A back handoff starts the parent around the portal that
 * still contains the departing child tile.
 */
export interface SceneContinuityView {
  readonly direction: "forward" | "back";
  readonly camera: SceneViewportCamera;
  /** Stable fully-fitted frame used as the first frame for reduced motion. */
  readonly settledCamera?: SceneViewportCamera;
  readonly tileScene?: Scene;
  readonly tilePortal?: ScenePortal;
}

export function continuityViewForMotion(
  view: SceneContinuityView | undefined,
  reducedMotion: boolean,
): SceneContinuityView | undefined {
  if (!view || !reducedMotion || !view.settledCamera) return view;
  return {
    ...view,
    camera: view.settledCamera,
    tileScene: undefined,
    tilePortal: undefined,
  };
}

type Camera = SceneViewportCamera;

interface Point {
  x: number;
  y: number;
}

interface SceneRect extends Point {
  width: number;
  height: number;
}

interface SceneAssetRuntimeSnapshot {
  readonly sceneId: string;
  readonly loadState: SceneAssetLoadState;
}

function createSceneAssetRuntimeSnapshot(sceneId: string): SceneAssetRuntimeSnapshot {
  return {
    sceneId,
    loadState: createSceneAssetLoadState(),
  };
}

function sameSceneAssetLoadState(
  first: SceneAssetLoadState,
  second: SceneAssetLoadState,
): boolean {
  return first.activeTier === second.activeTier
    && first.desiredTier === second.desiredTier
    && first.preloadingTier === second.preloadingTier
    && first.readyTiers.length === second.readyTiers.length
    && first.readyTiers.every((tier, index) => tier === second.readyTiers[index])
    && first.failedTiers.length === second.failedTiers.length
    && first.failedTiers.every((tier, index) => tier === second.failedTiers[index]);
}

export function projectScenePointToScreen(point: Point, camera: SceneViewportCamera): Point {
  const effectiveScale = camera.fit * camera.scale;
  return {
    x: camera.x + point.x * effectiveScale,
    y: camera.y + point.y * effectiveScale,
  };
}

export function projectSceneRectToScreen(rect: SceneRect, camera: SceneViewportCamera): SceneRect {
  const topLeft = projectScenePointToScreen(rect, camera);
  const effectiveScale = camera.fit * camera.scale;
  return {
    ...topLeft,
    width: rect.width * effectiveScale,
    height: rect.height * effectiveScale,
  };
}

function fitScale(
  sceneWidth: number,
  sceneHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.min(viewportWidth / sceneWidth, viewportHeight / sceneHeight);
}

export function fittedSceneCamera(
  sceneSize: { readonly width: number; readonly height: number },
  viewportSize: { readonly width: number; readonly height: number },
): SceneViewportCamera {
  const fit = fitScale(
    sceneSize.width,
    sceneSize.height,
    viewportSize.width,
    viewportSize.height,
  );
  const scale = viewportSize.height > viewportSize.width * 1.25 ? 1.3 : 1;
  return {
    fit,
    scale,
    x: (viewportSize.width - sceneSize.width * fit * scale) / 2,
    y: (viewportSize.height - sceneSize.height * fit * scale) / 2,
  };
}

/** A true object-fit:contain camera used when continuity settles a scene. */
export function fullyFittedSceneCamera(
  sceneSize: { readonly width: number; readonly height: number },
  viewportSize: { readonly width: number; readonly height: number },
): SceneViewportCamera {
  const fit = fitScale(
    sceneSize.width,
    sceneSize.height,
    viewportSize.width,
    viewportSize.height,
  );
  return {
    fit,
    scale: 1,
    x: (viewportSize.width - sceneSize.width * fit) / 2,
    y: (viewportSize.height - sceneSize.height * fit) / 2,
  };
}

/** Keyboard activation must reveal its exact word; pointer activation keeps the authored region composition. */
export function vocabularyActivationFocusPoint(
  nextLabel: Pick<Label, "x" | "y">,
  authoredFocus: Point,
  keyboardTriggered: boolean,
): Point {
  if (keyboardTriggered) return { x: nextLabel.x, y: nextLabel.y };
  return {
    x: Number.isFinite(authoredFocus.x) ? authoredFocus.x : nextLabel.x,
    y: Number.isFinite(authoredFocus.y) ? authoredFocus.y : nextLabel.y,
  };
}

/** Adds one exact interaction target without exceeding or republishing the bounded window. */
export function includeSceneLabelMountTarget(
  mountedLabelIds: ReadonlySet<string>,
  targetLabelId: string,
  limit: number,
): ReadonlySet<string> {
  if (mountedLabelIds.has(targetLabelId) || mountedLabelIds.size >= limit) {
    return mountedLabelIds;
  }
  const nextMountedLabelIds = new Set(mountedLabelIds);
  nextMountedLabelIds.add(targetLabelId);
  return nextMountedLabelIds;
}

/** Keeps a promised keyboard batch honest when its preferred word is collision-blocked. */
export function resolveInteractiveVocabularyFocusTarget(
  preferredTargetLabelId: string,
  promisedBatchLabelIds: readonly string[],
  layout: readonly { readonly id: string; readonly interactive: boolean }[],
): string | null {
  const interactiveLabelIds = new Set(
    layout.filter((item) => item.interactive).map((item) => item.id),
  );
  if (interactiveLabelIds.has(preferredTargetLabelId)) return preferredTargetLabelId;
  return promisedBatchLabelIds.find((id) => interactiveLabelIds.has(id)) ?? null;
}

/** Maps an object-fit:cover child tile in a parent portal to a child camera. */
export function childCameraFromPortalTile(
  portal: SceneRect,
  parentCamera: SceneViewportCamera,
  childSize: { readonly width: number; readonly height: number },
  viewportSize: { readonly width: number; readonly height: number },
): SceneViewportCamera {
  const cover = Math.max(portal.width / childSize.width, portal.height / childSize.height);
  const childFit = fitScale(
    childSize.width,
    childSize.height,
    viewportSize.width,
    viewportSize.height,
  );
  const parentEffectiveScale = parentCamera.fit * parentCamera.scale;
  const coveredX = portal.x + (portal.width - childSize.width * cover) / 2;
  const coveredY = portal.y + (portal.height - childSize.height * cover) / 2;
  return {
    fit: childFit,
    scale: parentEffectiveScale * cover / childFit,
    x: parentCamera.x + coveredX * parentEffectiveScale,
    y: parentCamera.y + coveredY * parentEffectiveScale,
  };
}

/** Recovers the parent camera represented by the tile pixels actually painted. */
export function cameraFromRenderedPortalRect(
  portal: SceneRect,
  renderedPortal: SceneRect,
  viewportOrigin: Point,
  fit: number,
  childSize?: { readonly width: number; readonly height: number },
): SceneViewportCamera {
  const hasChildSize = Boolean(
    childSize
    && Number.isFinite(childSize.width)
    && Number.isFinite(childSize.height)
    && childSize.width > 0
    && childSize.height > 0,
  );
  const childWidth = hasChildSize ? childSize!.width : portal.width;
  const childHeight = hasChildSize ? childSize!.height : portal.height;
  const cover = hasChildSize
    ? Math.max(portal.width / childWidth, portal.height / childHeight)
    : 1;
  const coveredX = portal.x + (portal.width - childWidth * cover) / 2;
  const coveredY = portal.y + (portal.height - childHeight * cover) / 2;
  // A tile image uses object-fit: cover, so its painted bounds can extend
  // beyond the portal rectangle. Divide by the painted child dimensions and
  // subtract that crop before recovering the parent camera; otherwise the
  // child scene starts with a visible offset on aspect-ratio-mismatched tiles.
  const renderedEffectiveScale = renderedPortal.width / (childWidth * cover);
  return {
    fit,
    scale: renderedEffectiveScale / fit,
    x: renderedPortal.x - viewportOrigin.x - coveredX * renderedEffectiveScale,
    y: renderedPortal.y - viewportOrigin.y - coveredY * renderedEffectiveScale,
  };
}

export function isExactForwardPortalTile(
  tile: {
    readonly portalId?: string;
    readonly childScene?: string;
    readonly direction?: string;
  } | null | undefined,
  portal: Pick<ScenePortal, "id" | "childSceneId">,
): boolean {
  return tile?.portalId === portal.id
    && tile.childScene === portal.childSceneId
    && tile.direction === "forward";
}

/** Inverse of childCameraFromPortalTile, used for a continuous zoom-out. */
export function parentCameraFromChildTile(
  portal: SceneRect,
  childCamera: SceneViewportCamera,
  parentSize: { readonly width: number; readonly height: number },
  childSize: { readonly width: number; readonly height: number },
  viewportSize: { readonly width: number; readonly height: number },
): SceneViewportCamera {
  const cover = Math.max(portal.width / childSize.width, portal.height / childSize.height);
  const childEffectiveScale = childCamera.fit * childCamera.scale;
  const parentEffectiveScale = childEffectiveScale / cover;
  const parentFit = fitScale(
    parentSize.width,
    parentSize.height,
    viewportSize.width,
    viewportSize.height,
  );
  const coveredX = portal.x + (portal.width - childSize.width * cover) / 2;
  const coveredY = portal.y + (portal.height - childSize.height * cover) / 2;
  return {
    fit: parentFit,
    scale: parentEffectiveScale / parentFit,
    x: childCamera.x - coveredX * parentEffectiveScale,
    y: childCamera.y - coveredY * parentEffectiveScale,
  };
}

export function clampCenteredOverlayShift(
  centerX: number,
  overlayWidth: number,
  viewportWidth: number,
  padding = 12,
): number {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safePadding = Math.max(0, Math.min(padding, safeViewportWidth / 2));
  const safeOverlayWidth = Math.max(
    0,
    Math.min(overlayWidth, safeViewportWidth - safePadding * 2),
  );
  const halfWidth = safeOverlayWidth / 2;
  const minimumCenter = safePadding + halfWidth;
  const maximumCenter = Math.max(minimumCenter, safeViewportWidth - safePadding - halfWidth);
  return Math.min(maximumCenter, Math.max(minimumCenter, centerX)) - centerX;
}

export function setStylePropertyIfChanged(
  style: Pick<CSSStyleDeclaration, "getPropertyValue" | "setProperty">,
  property: string,
  value: string,
): boolean {
  if (style.getPropertyValue(property) === value) return false;
  style.setProperty(property, value);
  return true;
}

function setDatasetValueIfChanged(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

function setAttributeIfChanged(element: HTMLElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function syncMotionFrozenLayer(element: HTMLElement, frozen: boolean): void {
  setDatasetValueIfChanged(element, "motionFrozen", String(frozen));
  if (element.inert !== frozen) element.inert = frozen;
  if (frozen) {
    setAttributeIfChanged(element, "aria-hidden", "true");
  } else if (element.getAttribute("aria-hidden") === "true") {
    element.removeAttribute("aria-hidden");
  }
}

const WHEEL_RESPONSE_MS = 52;
const WHEEL_POSITION_EPSILON = 0.08;
const WHEEL_SCALE_EPSILON = 0.00045;
// Keep a just-offscreen label's last legal callout slot warm while its mounted
// overscan is still nearby. This prevents a one-frame collision fallback from
// resetting the slot when a coalesced pointer/wheel sample brings the anchor
// back into view.
const LABEL_PLACEMENT_MEMORY_OVERSCAN = 120;
const EXIT_SCALE = DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale;
const HANDOFF_WHEEL_QUIET_MS = 180;
const SEMANTIC_OVERSCROLL_THRESHOLD = 0.32;
const SEMANTIC_OVERSCROLL_WINDOW_MS = 850;
const PORTAL_PREVIEW_LEAD = 1;
const PORTAL_ARMED_PROGRESS = 0.82;

export function portalRevealProgress(cameraScale: number, enterScale = 3.6): number {
  const cueScale = Math.max(1, enterScale - PORTAL_PREVIEW_LEAD);
  return Math.min(
    1,
    Math.max(0, (cameraScale - cueScale) / Math.max(0.01, enterScale - cueScale)),
  );
}

export function shouldWriteContinuousTileProgress(
  state: "preview" | "active",
  direction: "forward" | "back",
): boolean {
  return state === "preview" || direction === "back";
}

/** The dense root atlas stays on one canvas until a portal is explicitly clicked. */
export function sceneUsesWheelPortalEntry(sceneId: string): boolean {
  return sceneId !== "world-map";
}
const VOCABULARY_REVEAL_SCALE: Readonly<Record<2 | 3 | 4, number>> = {
  2: 1.42,
  3: 2.2,
  4: 3.12,
};

export function buildViewerChromeProtectedRegions(
  width: number,
  height: number,
  wordIndexOpen = false,
): SceneLabelProtectedRegion[] {
  const compact = width <= 900;
  const phone = width <= 560;
  // Match the compact translucent scene minimap instead of reserving the old
  // multi-line title block. This gives grounded labels the rest of the
  // top-left image back without allowing pills to sit under navigation.
  const minimapRight = Math.min(width, phone ? 312 : compact ? 348 : 412);
  // The desktop minimap's rendered panel ends around 120px in the viewport.
  // Reserving the old 126px rectangle made nearby words jump to a distant
  // leader slot even when only a few pixels touched the translucent panel.
  const minimapBottom = phone ? 112 : compact ? 116 : 120;
  const regions: SceneLabelProtectedRegion[] = [{
    left: 0,
    right: minimapRight,
    top: 0,
    bottom: minimapBottom,
  }];

  if (!phone) {
    regions.push({
      left: Math.max(0, width / 2 - 205),
      right: Math.min(width, width / 2 + 205),
      top: 0,
      bottom: 82,
    });
  }
  regions.push({
    left: Math.max(0, width - (phone ? 116 : 260)),
    right: width,
    top: 0,
    bottom: phone ? 82 : 86,
  });

  // The lower controls and mobile vocabulary summary must remain readable.
  regions.push({
    left: Math.max(0, width - 184),
    right: width,
    top: Math.max(0, height - 88),
    bottom: height,
  });
  regions.push({
    left: 0,
    right: phone ? 150 : 190,
    top: Math.max(0, height - 88),
    bottom: height,
  });
  if (phone) {
    regions.push({
      left: 12,
      right: Math.max(12, width - 12),
      top: Math.max(0, height - 144),
      bottom: Math.max(0, height - 64),
    });
  }
  if (wordIndexOpen) {
    const panelWidth = Math.min(width - 24, phone ? 340 : 360);
    const panelTop = phone ? 10 : 14;
    const panelHeightLimit = phone
      ? Math.min(528, Math.max(0, height - 132))
      : Math.min(528, Math.max(0, height - 118));
    regions.push({
      left: Math.max(12, width - panelWidth - 12),
      right: Math.max(12, width - 12),
      top: panelTop,
      bottom: Math.min(height - (phone ? 86 : 24), panelTop + panelHeightLimit),
    });
  }
  return regions;
}

/**
 * A portal marker can sit beneath the compact minimap at a fitted frame (for
 * example the oxygen inset on the hemoglobin scene). Keep the map controls
 * readable, but raise the interaction layer only while a real portal overlaps
 * that translucent chrome so the marker remains directly clickable.
 */
export function portalIntersectsMinimap(
  portal: ScenePortal,
  camera: SceneViewportCamera,
  viewport: { readonly width: number; readonly height: number },
): boolean {
  const bounds = projectSceneRectToScreen(portal, camera);
  const phone = viewport.width <= 560;
  const compact = viewport.width <= 900;
  const minimapRight = Math.min(viewport.width, phone ? 312 : compact ? 348 : 412);
  const minimapBottom = phone ? 112 : compact ? 116 : 120;
  return bounds.x < minimapRight
    && bounds.x + bounds.width > 0
    && bounds.y < minimapBottom
    && bounds.y + bounds.height > 0;
}

export const WHEEL_ZOOM_SENSITIVITY = 0.00145;

export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  // WheelEvent deltas may be pixels, lines or pages depending on the device
  // and browser. Converting them to a bounded pixel-like impulse prevents a
  // mouse wheel from feeling inert and a page-mode device from jumping across
  // several LOD bands in one event.
  const pixelDelta = deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * Math.max(1, viewportHeight)
      : deltaY;
  const boundedDelta = Math.min(240, Math.max(-240, pixelDelta));
  // A standard mouse notch should feel like a deliberate step, not a jump
  // across a whole detail band. The bounded impulse still makes trackpads and
  // line/page-mode wheels equivalent while leaving room for a fresh gesture
  // to cross a portal boundary intentionally.
  return Math.exp(-boundedDelta * WHEEL_ZOOM_SENSITIVITY);
}

export function shouldResetLabelPlacementMemory(
  previous: "in" | "out" | null,
  next: "in" | "out" | null,
): boolean {
  return previous !== null && next !== null && previous !== next;
}

export interface SemanticOverscrollResult {
  readonly accumulated: number;
  readonly trigger: boolean;
}

/**
 * A deliberate extra zoom beyond a non-terminal spatial image may open the
 * semantic plane. Portal pixels always keep ownership of the gesture, and a
 * terminal scene can disable the bridge entirely. Zooming out resets the
 * accumulator so an ordinary fit/zoom cycle cannot open the atlas.
 */
export function advanceSemanticOverscroll(
  accumulated: number,
  factor: number,
  atMaximumScale: boolean,
  portalOwnsGesture: boolean,
  elapsedSincePreviousMs = 0,
  semanticEntryEnabled = true,
): SemanticOverscrollResult {
  if (!semanticEntryEnabled || !atMaximumScale || portalOwnsGesture || factor <= 1) {
    return { accumulated: 0, trigger: false };
  }
  const continuedGesture = Number.isFinite(elapsedSincePreviousMs)
    && elapsedSincePreviousMs >= 0
    && elapsedSincePreviousMs <= SEMANTIC_OVERSCROLL_WINDOW_MS;
  const next = (continuedGesture ? Math.max(0, accumulated) : 0)
    + Math.max(0, Math.log(factor));
  if (next < SEMANTIC_OVERSCROLL_THRESHOLD) {
    return { accumulated: next, trigger: false };
  }
  return { accumulated: 0, trigger: true };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sceneLodLevel(scale: number): 0 | 1 | 2 | 3 | 4 {
  if (scale < 0.82) return 0;
  if (scale < 1.2) return 1;
  if (scale < 1.65) return 2;
  if (scale < 2.3) return 3;
  return 4;
}

function portalAtScreenPoint(portals: readonly ScenePortal[], camera: Camera, point: Point): ScenePortal | undefined {
  const effectiveScale = camera.fit * camera.scale;
  const sceneX = (point.x - camera.x) / effectiveScale;
  const sceneY = (point.y - camera.y) / effectiveScale;
  return [...portals]
    .filter((portal) => (
      sceneX >= portal.x
      && sceneX <= portal.x + portal.width
      && sceneY >= portal.y
      && sceneY <= portal.y + portal.height
    ))
    .sort((first, second) => first.width * first.height - second.width * second.height)[0];
}

// One compact deterministic seed is identical during SSR and hydration. The
// first real camera frame reconciles it to genuinely painted labels under the
// bounded desktop/compact ceiling before newly mounted labels become visible.
const INITIAL_LABEL_MOUNT_VIEWPORT = {
  width: 390,
  height: 780,
  compact: true,
} as const;

// Facility scenes carry the newest high-density professional batches. Keep
// their explicitly selected crop ahead of unrelated overview labels on both
// desktop and compact screens; other scenes retain the established desktop
// collision order while compact focus still receives the same treatment.
const FOCUSED_PRIORITY_SCENES = new Set([
  "apartment",
  "kitchen",
  "bedroom",
  "bathroom",
  "city-cafe",
  "hospital",
  "pathology-lab",
  "hospital-pharmacy",
  "airport",
  "office-building",
]);

// Scene JSON objects are retained by the bounded repository while users move
// between a parent and child. Reuse the last truthful DOM window when that
// exact scene is revisited: this avoids rebuilding a compact seed and then
// expanding it in a second React commit, while the first live camera frame
// still recomputes every placement and corrects the window if needed.
const revisitedSceneLabelMountWindows = new WeakMap<
  readonly Label[],
  Map<string, ReadonlySet<string>>
>();

function adaptiveRevealScaleForScene(scene: Scene): number | undefined {
  // Keep the root atlas rich at its fitted overview. Larger child scenes use
  // their authored room/exhibit zones as the invitation to go deeper, so
  // their finest labels can enter over a few camera steps instead of adding a
  // large style/layout burst during a warm scene handoff.
  return scene.id !== "world-map" && scene.labels.length >= 96 ? 1 : undefined;
}

function sceneLabelMountWindowCacheKey(meaningVisible: boolean, compact: boolean): string {
  return `${meaningVisible ? "meaning" : "word"}:${compact ? "compact" : "desktop"}`;
}

function rememberSceneLabelMountWindow(
  labels: readonly Label[],
  meaningVisible: boolean,
  compact: boolean,
  mountedLabelIds: ReadonlySet<string>,
): void {
  const cache = revisitedSceneLabelMountWindows.get(labels) ?? new Map<string, ReadonlySet<string>>();
  cache.set(
    sceneLabelMountWindowCacheKey(meaningVisible, compact),
    new Set(mountedLabelIds),
  );
  revisitedSceneLabelMountWindows.set(labels, cache);
}

function recalledSceneLabelMountWindow(
  scene: Scene,
  meaningVisible: boolean,
  selectedLabelId: string | null,
): Set<string> | null {
  if (typeof window === "undefined") return null;
  const compact = window.innerWidth <= 900;
  const cached = revisitedSceneLabelMountWindows
    .get(scene.labels)
    ?.get(sceneLabelMountWindowCacheKey(meaningVisible, compact));
  if (!cached || cached.size > sceneLabelMountLimit({ compact })) return null;
  const validLabelIds = new Set(scene.labels.map(({ id }) => id));
  if ([...cached].some((id) => !validLabelIds.has(id))) return null;
  const recalled = new Set(cached);
  if (
    selectedLabelId
    && validLabelIds.has(selectedLabelId)
    && !recalled.has(selectedLabelId)
    && recalled.size < sceneLabelMountLimit({ compact })
  ) recalled.add(selectedLabelId);
  return recalled;
}

function initialSceneLabelMountWindow(
  scene: Scene,
  meaningVisible: boolean,
  selectedLabelId: string | null,
): Set<string> {
  const recalled = recalledSceneLabelMountWindow(scene, meaningVisible, selectedLabelId);
  if (recalled) return recalled;
  const camera = fullyFittedSceneCamera(scene, INITIAL_LABEL_MOUNT_VIEWPORT);
  const layout = computeSceneLabelLayout(
    scene.labels,
    camera,
    INITIAL_LABEL_MOUNT_VIEWPORT,
    meaningVisible,
    {
      selectedLabelId,
      adaptiveRevealScale: adaptiveRevealScaleForScene(scene),
      protectedRegions: [
        ...buildViewerChromeProtectedRegions(
          INITIAL_LABEL_MOUNT_VIEWPORT.width,
          INITIAL_LABEL_MOUNT_VIEWPORT.height,
        ),
        ...buildPortalCueProtectedRegions(
          scene.portals,
          camera,
          INITIAL_LABEL_MOUNT_VIEWPORT,
        ),
      ],
    },
  );
  return buildSceneLabelMountWindow(
    scene.labels,
    layout,
    INITIAL_LABEL_MOUNT_VIEWPORT,
    { selectedLabelId },
  );
}

export function SceneViewport({
  scene,
  meaningVisible,
  selectedLabelId = null,
  portalTargetTitles,
  transitionPhase = "active",
  interactionLocked = false,
  onCommitScene,
  onEnterScene,
  onExitScene,
  onLabelsEncountered,
  onLabelEncountered,
  onSelectWord,
  onExploreSemanticPlane,
  onPrefetchScene,
  initialView,
  onCameraFrame,
  onMotionFrozenChange,
  onPortalNavigatorReady,
  onFocusTargetNavigatorReady,
  atlasDistricts,
  focusedDetailZoneId = null,
  wordIndexOpen = false,
}: SceneViewportProps) {
  const reducedContinuityAtMount = Boolean(
    initialView
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const effectiveInitialView = continuityViewForMotion(initialView, reducedContinuityAtMount);
  const atlasOverviewMode = scene.id === "world-map" && Boolean(atlasDistricts?.length);
  const [atlasCategoryId, setAtlasCategoryId] = useState<string | null>(null);
  const [mountedLabelIds, setMountedLabelIds] = useState<ReadonlySet<string>>(
    () => atlasOverviewMode
      ? new Set<string>()
      : initialSceneLabelMountWindow(scene, meaningVisible, selectedLabelId),
  );
  const mountedLabelIdsRef = useRef(mountedLabelIds);
  const pendingLabelWindowPaintRef = useRef(false);
  const pendingKeyboardFocusLabelIdRef = useRef<string | null>(null);
  const pendingKeyboardFocusBatchLabelIdsRef = useRef<readonly string[]>([]);
  const pendingKeyboardFocusContractElementRef = useRef<HTMLButtonElement | null>(null);
  const queuedKeyboardFocusLabelIdRef = useRef<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const continuousTileRef = useRef<HTMLDivElement>(null);
  const focusedDetailZoneRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  // Camera frames address labels through their stable authored ids. Keeping
  // the mounted nodes in a ref avoids rebuilding a NodeList and re-reading a
  // data attribute for every word on every wheel/pinch animation frame.
  const labelElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1, fit: 1 });
  const resolvedSceneAssets = useMemo(() => resolveSceneAssets(scene), [scene]);
  const [sceneAssetRuntime, setSceneAssetRuntime] = useState<SceneAssetRuntimeSnapshot>(
    () => createSceneAssetRuntimeSnapshot(scene.id),
  );
  const sceneAssetRuntimeRef = useRef(sceneAssetRuntime);
  const publishedSceneAssetRuntimeRef = useRef(sceneAssetRuntime);
  const sceneAssetPreloadRequestRef = useRef(0);
  const pointersRef = useRef(new Map<number, Point>());
  const previousPointersRef = useRef(new Map<number, Point>());
  const frameRef = useRef<number | null>(null);
  const cameraAnimationRef = useRef<number | null>(null);
  const wheelAnimationRef = useRef<number | null>(null);
  const wheelTargetRef = useRef<Camera | null>(null);
  const wheelFrameTimeRef = useRef<number | null>(null);
  const navigationFrameRef = useRef<number | null>(null);
  const encounterDwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSinceRef = useRef<ReadonlyMap<string, number>>(new Map());
  const encounteredLabelIdsRef = useRef(new Set<string>());
  // Once a label has occupied a readable slot in this scene, camera panning,
  // collision resolution, or LOD retirement must not make the scene-wide
  // "remaining words" total increase again. SceneViewport is keyed by
  // scene.id, so this set naturally has the same lifetime as the scene view.
  const revealedLabelIdsRef = useRef(new Set<string>());
  const selectedLabelIdRef = useRef<string | null>(null);
  const labelPlacementOffsetsRef = useRef(new Map<string, {
    readonly offsetX: number;
    readonly offsetY: number;
  }>());
  const labelShiftTimersRef = useRef(new Map<string, number>());
  const lastNavigationRef = useRef(0);
  const zoomFocusRef = useRef<Point | null>(null);
  const zoomDirectionRef = useRef<"in" | "out" | null>(null);
  const portalCandidateRef = useRef<ScenePortal | null>(null);
  const previewPortalRef = useRef<ScenePortal | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const vocabularyAnnouncementRef = useRef<HTMLParagraphElement>(null);
  const vocabularySummaryRef = useRef<HTMLButtonElement>(null);
  const sceneWordProgressRef = useRef<HTMLParagraphElement>(null);
  const semanticOverscrollRef = useRef(0);
  const semanticOverscrollTimestampRef = useRef<number | null>(null);
  const atlasCategoryElementsRef = useRef(new Map<string, HTMLDivElement>());
  const atlasCategoryCloseTimerRef = useRef<number | null>(null);
  const previewPhaseRef = useRef<"preview" | "armed">("preview");
  const committingRef = useRef(false);
  const parentZoomPrefetchRef = useRef(false);
  const initialViewRef = useRef(effectiveInitialView);
  const initializedSceneRef = useRef<string | null>(null);
  const fittedViewportSizeRef = useRef<{ readonly width: number; readonly height: number } | null>(null);
  const continuitySettlingRef = useRef(false);
  const continuityWheelGuardRef = useRef({
    active: Boolean(effectiveInitialView),
    quietUntil: 0,
  });
  const parentExitHysteresisRef = useRef(createParentExitHysteresisState());
  const parentExitReadyRef = useRef(false);
  const continuityProgressRef = useRef(
    effectiveInitialView?.direction === "back" && effectiveInitialView.tileScene ? 1 : 0,
  );
  const forwardTileProgressRef = useRef<{
    readonly portalId: string;
    readonly childSceneId: string;
    readonly value: number;
  } | null>(null);
  const continuousTileRequestRef = useRef(0);
  const [previewPortal, setPreviewPortal] = useState<ScenePortal | null>(null);
  const [previewPhase, setPreviewPhase] = useState<"preview" | "armed">("preview");
  const [motionFrozen, setMotionFrozen] = useState(
    Boolean(effectiveInitialView && !reducedContinuityAtMount),
  );
  const [continuousTile, setContinuousTile] = useState<{
    readonly scene: Scene;
    readonly portal: ScenePortal;
  } | null>(() => (
    effectiveInitialView?.tileScene && effectiveInitialView.tilePortal
      ? { scene: effectiveInitialView.tileScene, portal: effectiveInitialView.tilePortal }
      : null
  ));
  const [continuousTileState, setContinuousTileState] = useState<"preview" | "active">(
    effectiveInitialView?.tileScene ? "active" : "preview",
  );
  const [continuousTileDirection, setContinuousTileDirection] = useState<"forward" | "back">(
    effectiveInitialView?.direction === "back" && effectiveInitialView.tileScene ? "back" : "forward",
  );
  const renderSceneAssetLoadState = sceneAssetRuntime.sceneId === scene.id
    ? sceneAssetRuntime.loadState
    : createSceneAssetLoadState();
  const activeSceneAsset = resolvedSceneAssets.find(
    ({ tier }) => tier === renderSceneAssetLoadState.activeTier,
  ) ?? resolvedSceneAssets[0]!;
  // Camera frames own this purely presentational readiness flag. Keeping it in
  // the applyCamera dependency list would rebuild resetCamera after the first
  // frame and cancel a freshly mounted reverse-continuity animation. The ref
  // guards the one low-frequency React update without making the frame callback
  // depend on that state.
  const [interactionPositioned, setInteractionPositioned] = useState(false);
  const interactionPositionedRef = useRef(false);
  const [encounterTick, setEncounterTick] = useState(0);
  const labelsById = useMemo(
    () => new Map(scene.labels.map((label) => [label.id, label])),
    [scene.labels],
  );
  const focusedDetailZone = useMemo(
    () => focusedDetailZoneId
      ? scene.detailZones?.find((zone) => zone.id === focusedDetailZoneId) ?? null
      : null,
    [focusedDetailZoneId, scene.detailZones],
  );
  // Focus navigation can start a camera animation from the previous render.
  // Keep the latest zone in a ref so every animation frame paints the active
  // focus frame instead of briefly reverting to the old (null) value.
  const focusedDetailZoneValueRef = useRef<SceneDetailZone | null>(focusedDetailZone);
  const labelSemanticStyles = useMemo(
    () => buildLabelSemanticStyleMap(
      scene.labels,
      scene.visualRegions ?? [],
      SPATIAL_LEXEME_REALMS,
    ),
    [scene.labels, scene.visualRegions],
  );
  const vocabularyZoomCues = useMemo(
    () => buildVocabularyZoomCues(
      scene.labels,
      scene.portals,
      scene.width,
      scene.height,
      8,
      scene.detailZones,
    ),
    [scene.detailZones, scene.height, scene.labels, scene.portals, scene.width],
  );
  const activeAtlasDistrict = useMemo(
    () => atlasDistricts?.find((district) => district.id === atlasCategoryId) ?? null,
    [atlasCategoryId, atlasDistricts],
  );
  const activeAtlasLabels = useMemo(() => {
    if (!activeAtlasDistrict) return [] as Label[];
    const labelIds = new Set(activeAtlasDistrict.labelIds);
    return scene.labels
      .filter((label) => labelIds.has(label.id))
      .sort((first, second) => first.priority - second.priority || first.id.localeCompare(second.id));
  }, [activeAtlasDistrict, scene.labels]);
  const activeAtlasLabelIds = useMemo(
    () => new Set(activeAtlasLabels.map((label) => label.id)),
    [activeAtlasLabels],
  );

  const cancelAtlasCategoryClose = useCallback(() => {
    if (atlasCategoryCloseTimerRef.current === null) return;
    window.clearTimeout(atlasCategoryCloseTimerRef.current);
    atlasCategoryCloseTimerRef.current = null;
  }, []);

  const activateAtlasCategory = useCallback((districtId: string) => {
    cancelAtlasCategoryClose();
    setAtlasCategoryId(districtId);
  }, [cancelAtlasCategoryClose]);

  const scheduleAtlasCategoryClose = useCallback(() => {
    cancelAtlasCategoryClose();
    atlasCategoryCloseTimerRef.current = window.setTimeout(() => {
      atlasCategoryCloseTimerRef.current = null;
      setAtlasCategoryId(null);
    }, 160);
  }, [cancelAtlasCategoryClose]);

  const setAtlasCategoryElement = useCallback((districtId: string, element: HTMLDivElement | null) => {
    if (element) atlasCategoryElementsRef.current.set(districtId, element);
    else atlasCategoryElementsRef.current.delete(districtId);
  }, []);

  const positionAtlasCategories = useCallback((camera: Camera) => {
    if (!atlasOverviewMode || !atlasDistricts) return;
    for (const district of atlasDistricts) {
      const element = atlasCategoryElementsRef.current.get(district.id);
      if (!element) continue;
      const bounds = projectSceneRectToScreen(district, camera);
      setStylePropertyIfChanged(element.style, "left", `${bounds.x.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "top", `${bounds.y.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "width", `${Math.max(0, bounds.width).toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "height", `${Math.max(0, bounds.height).toFixed(2)}px`);
      setDatasetValueIfChanged(element, "positioned", "true");
    }
  }, [atlasDistricts, atlasOverviewMode]);

  useEffect(() => () => {
    cancelAtlasCategoryClose();
  }, [cancelAtlasCategoryClose]);

  const setContinuousTileNode = useCallback((node: HTMLDivElement | null) => {
    continuousTileRef.current = node;
    if (!node || node.dataset.progress !== undefined) return;
    const state = node.dataset.state === "active" ? "active" : "preview";
    const direction = node.dataset.direction === "back" ? "back" : "forward";
    if (!shouldWriteContinuousTileProgress(state, direction)) {
      setDatasetValueIfChanged(node, "progress", "1.000");
      return;
    }
    const portal = scene.portals.find((candidate) => candidate.id === node.dataset.portalId);
    const activePortal = portalCandidateRef.current ?? previewPortalRef.current;
    const tileMatchesPortal = Boolean(
      portal
      && activePortal?.id === portal.id
      && activePortal.childSceneId === node.dataset.childScene,
    );
    let progress = 0;
    if (node.dataset.direction === "back") {
      progress = continuityProgressRef.current;
    } else if (tileMatchesPortal && portal) {
      const computed = portalRevealProgress(cameraRef.current.scale, portal.enterScale ?? 3.6);
      const previous = forwardTileProgressRef.current;
      const sameTile = previous?.portalId === portal.id
        && previous.childSceneId === portal.childSceneId;
      const mayDecrease = zoomDirectionRef.current === "out" && !committingRef.current;
      progress = mayDecrease ? computed : Math.max(sameTile ? previous.value : 0, computed);
      forwardTileProgressRef.current = {
        portalId: portal.id,
        childSceneId: portal.childSceneId,
        value: progress,
      };
    }
    const progressValue = Math.min(1, Math.max(0, progress)).toFixed(3);
    setDatasetValueIfChanged(node, "progress", progressValue);
    setStylePropertyIfChanged(node.style, "--tile-progress", progressValue);
  }, [scene.portals]);

  useEffect(() => () => {
    for (const timer of labelShiftTimersRef.current.values()) window.clearTimeout(timer);
    labelShiftTimersRef.current.clear();
  }, []);

  const viewerInteractive = transitionPhase === "active" && !interactionLocked && !motionFrozen;
  const viewerInteractiveRef = useRef(viewerInteractive);
  const meaningVisibleRef = useRef(meaningVisible);

  useEffect(() => {
    onMotionFrozenChange?.(motionFrozen);
  }, [motionFrozen, onMotionFrozenChange]);

  const commitSceneAssetLoadState = useCallback((
    sceneId: string,
    nextLoadState: SceneAssetLoadState,
  ): boolean => {
    const current = sceneAssetRuntimeRef.current;
    if (current.sceneId !== sceneId) return false;
    const published = publishedSceneAssetRuntimeRef.current;
    if (
      sameSceneAssetLoadState(current.loadState, nextLoadState)
      && published.sceneId === sceneId
      && sameSceneAssetLoadState(published.loadState, nextLoadState)
    ) return true;
    const next = { sceneId, loadState: nextLoadState };
    sceneAssetRuntimeRef.current = next;
    publishedSceneAssetRuntimeRef.current = next;
    setSceneAssetRuntime(next);
    return true;
  }, []);

  const preloadSceneAsset = useCallback((asset: ResolvedSceneAsset) => {
    const requestedSceneId = scene.id;
    const requestId = sceneAssetPreloadRequestRef.current + 1;
    sceneAssetPreloadRequestRef.current = requestId;
    const cached = decodedSceneAssetCache.getOrLoad(asset.src, async () => {
      const image = new Image();
      image.decoding = "async";
      image.src = asset.src;
      if (typeof image.decode === "function") {
        await image.decode();
      } else {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Unable to decode ${asset.src}`));
        });
      }
      return image;
    });
    const settleForCurrentScene = (decoded: boolean) => {
      if (
        sceneAssetPreloadRequestRef.current !== requestId
        || sceneAssetRuntimeRef.current.sceneId !== requestedSceneId
      ) return;
      commitSceneAssetLoadState(
        requestedSceneId,
        settleSceneAssetPreload(sceneAssetRuntimeRef.current.loadState, asset.tier, decoded),
      );
    };
    if (cached.status === "ready") {
      settleForCurrentScene(true);
      return;
    }
    void cached.promise.then(
      () => {
        settleForCurrentScene(true);
      },
      () => {
        settleForCurrentScene(false);
      },
    );
  }, [commitSceneAssetLoadState, scene.id]);

  const reconcileSceneAssetForCamera = useCallback((camera: Camera, devicePixelRatio: number) => {
    const current = sceneAssetRuntimeRef.current;
    if (current.sceneId !== scene.id) return;
    const transition = reconcileSceneAssetLoad(
      scene,
      current.loadState,
      camera,
      devicePixelRatio,
    );
    if (!commitSceneAssetLoadState(scene.id, transition.state)) return;
    if (transition.preloadAsset) preloadSceneAsset(transition.preloadAsset);
  }, [commitSceneAssetLoadState, preloadSceneAsset, scene]);

  useEffect(() => {
    const next = createSceneAssetRuntimeSnapshot(scene.id);
    sceneAssetPreloadRequestRef.current += 1;
    sceneAssetRuntimeRef.current = next;
    return () => {
      sceneAssetPreloadRequestRef.current += 1;
    };
  }, [scene.id]);

  const showPortalPreview = useCallback((portal: ScenePortal | null) => {
    if (
      committingRef.current
      && portalCandidateRef.current?.id !== portal?.id
    ) return;
    if (previewPortalRef.current?.id === portal?.id) return;
    previewPortalRef.current = portal;
    previewPhaseRef.current = "preview";
    setPreviewPhase("preview");
    setPreviewPortal(portal);
  }, []);

  const requestContinuousTile = useCallback((portal: ScenePortal) => {
    if (
      committingRef.current
      && portalCandidateRef.current?.id !== portal.id
    ) return;
    const requestId = continuousTileRequestRef.current + 1;
    continuousTileRequestRef.current = requestId;
    const prepared = onPrefetchScene(portal.childSceneId);
    const accept = (child: Scene | null | void) => {
      if (
        !child
        || child.id !== portal.childSceneId
        || continuousTileRequestRef.current !== requestId
        || continuitySettlingRef.current
        || (committingRef.current && portalCandidateRef.current?.id !== portal.id)
      ) return;
      setContinuousTileDirection("forward");
      setContinuousTileState(committingRef.current ? "active" : "preview");
      setContinuousTile({ scene: child, portal });
    };
    if (prepared && typeof (prepared as Promise<Scene | null>).then === "function") {
      void (prepared as Promise<Scene | null>).then(accept, () => undefined);
      return;
    }
    accept(prepared as Scene | null | void);
  }, [onPrefetchScene]);

  const clampCamera = useCallback(
    (camera: Camera): Camera => {
      const viewport = viewportRef.current;
      if (!viewport) return camera;
      const width = scene.width * camera.fit * camera.scale;
      const height = scene.height * camera.fit * camera.scale;
      const margin = Math.min(viewport.clientWidth, viewport.clientHeight) * 0.18;
      const minX = Math.min(margin, viewport.clientWidth - width - margin);
      const maxX = Math.max(viewport.clientWidth - width - margin, margin);
      const minY = Math.min(margin, viewport.clientHeight - height - margin);
      const maxY = Math.max(viewport.clientHeight - height - margin, margin);
      return {
        ...camera,
        x: Math.min(maxX, Math.max(minX, camera.x)),
        y: Math.min(maxY, Math.max(minY, camera.y)),
      };
    },
    [scene.height, scene.width],
  );

  const applyCamera = useCallback(() => {
    frameRef.current = null;
    const surface = surfaceRef.current;
    const labelLayer = labelLayerRef.current;
    const interactionLayer = interactionLayerRef.current;
    const viewport = viewportRef.current;
    if (!surface || !labelLayer || !interactionLayer || !viewport) return;
    // Read layout once before this frame starts mutating styles. Re-reading
    // viewport geometry after the surface/overlays have been written forces a
    // synchronous layout in every camera frame.
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const camera = (cameraRef.current = clampCamera(cameraRef.current));
    const maximumScale = maximumSceneCameraScale(camera.fit);
    const effectiveScale = camera.fit * camera.scale;
    const zoomLevel = sceneLodLevel(camera.scale);
    const sceneScaleValue = camera.scale.toFixed(3);
    setStylePropertyIfChanged(
      surface.style,
      "transform",
      `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${effectiveScale})`,
    );
    setStylePropertyIfChanged(surface.style, "--scene-zoom", sceneScaleValue);
    setDatasetValueIfChanged(surface, "zoomLevel", String(zoomLevel));
    setDatasetValueIfChanged(surface, "lodLevel", String(zoomLevel));
    setDatasetValueIfChanged(surface, "sceneScale", sceneScaleValue);
    setDatasetValueIfChanged(surface, "maximumScale", maximumScale.toFixed(3));
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    reconcileSceneAssetForCamera(camera, devicePixelRatio);

    const activePortal = portalCandidateRef.current ?? previewPortalRef.current;
    const enterScale = activePortal?.enterScale ?? 3.6;
    const portalProgress = activePortal
      ? portalRevealProgress(camera.scale, enterScale)
      : 0;
    if (continuousTileRef.current) {
      if (shouldWriteContinuousTileProgress(continuousTileState, continuousTileDirection)) {
        const tilePortalId = continuousTileRef.current.dataset.portalId;
        const tileChildSceneId = continuousTileRef.current.dataset.childScene;
        const tileMatchesPortal = activePortal?.id === tilePortalId
          && activePortal?.childSceneId === tileChildSceneId;
        let tileProgress = 0;
        if (continuousTileDirection === "back" && continuousTileState === "active") {
          tileProgress = continuityProgressRef.current;
        } else if (tileMatchesPortal && activePortal && tilePortalId && tileChildSceneId) {
          const previous = forwardTileProgressRef.current;
          const sameTile = previous?.portalId === tilePortalId
            && previous.childSceneId === tileChildSceneId;
          const mayDecrease = zoomDirectionRef.current === "out" && !committingRef.current;
          tileProgress = mayDecrease
            ? portalProgress
            : Math.max(sameTile ? previous.value : 0, portalProgress);
          forwardTileProgressRef.current = {
            portalId: tilePortalId,
            childSceneId: tileChildSceneId,
            value: tileProgress,
          };
        }
        const tileProgressValue = Math.min(1, Math.max(0, tileProgress)).toFixed(3);
        setDatasetValueIfChanged(continuousTileRef.current, "progress", tileProgressValue);
        setStylePropertyIfChanged(
          continuousTileRef.current.style,
          "--tile-progress",
          tileProgressValue,
        );
      }
    }
    const imminentParentExit = Boolean(
      scene.parentId
      && parentExitReadyRef.current
      && zoomDirectionRef.current === "out"
      && (wheelTargetRef.current?.scale ?? Number.POSITIVE_INFINITY) < EXIT_SCALE
    );
    const frameMotionFrozen = committingRef.current
      || continuitySettlingRef.current
      || imminentParentExit;
    positionAtlasCategories(camera);
    syncMotionFrozenLayer(labelLayer, frameMotionFrozen);
    syncMotionFrozenLayer(interactionLayer, frameMotionFrozen);
    if (frameMotionFrozen) {
      onCameraFrame?.({
        sceneId: scene.id,
        camera: { ...camera },
        viewportWidth,
        viewportHeight,
      });
      return;
    }

    const nextPreviewPhase = portalProgress >= PORTAL_ARMED_PROGRESS ? "armed" : "preview";
    if (activePortal && previewPortalRef.current?.id !== activePortal.id) {
      showPortalPreview(activePortal);
    }
    if (activePortal && previewPhaseRef.current !== nextPreviewPhase) {
      previewPhaseRef.current = nextPreviewPhase;
      setPreviewPhase(nextPreviewPhase);
    }
    if (previewRef.current) {
      const progressValue = portalProgress.toFixed(3);
      setDatasetValueIfChanged(previewRef.current, "progress", progressValue);
      setDatasetValueIfChanged(previewRef.current, "phase", nextPreviewPhase);
      setStylePropertyIfChanged(previewRef.current.style, "--portal-progress", progressValue);
    }
    const snapToDevicePixel = (value: number) => (
      Math.round(value * devicePixelRatio) / devicePixelRatio
    );
    const focusRegion = focusedDetailZoneRef.current;
    const activeFocusedDetailZone = focusedDetailZoneValueRef.current;
    const focusedPriorityLabelIds = activeFocusedDetailZone
      && (viewportWidth <= 900 || FOCUSED_PRIORITY_SCENES.has(scene.id))
      ? new Set(activeFocusedDetailZone.labelIds)
      : undefined;
    if (focusRegion) {
      if (activeFocusedDetailZone) {
        const bounds = projectSceneRectToScreen(activeFocusedDetailZone, camera);
        const left = snapToDevicePixel(bounds.x);
        const top = snapToDevicePixel(bounds.y);
        const right = snapToDevicePixel(bounds.x + bounds.width);
        const bottom = snapToDevicePixel(bounds.y + bounds.height);
        setStylePropertyIfChanged(focusRegion.style, "left", `${left.toFixed(2)}px`);
        setStylePropertyIfChanged(focusRegion.style, "top", `${top.toFixed(2)}px`);
        setStylePropertyIfChanged(focusRegion.style, "width", `${Math.max(0, right - left).toFixed(2)}px`);
        setStylePropertyIfChanged(focusRegion.style, "height", `${Math.max(0, bottom - top).toFixed(2)}px`);
        setDatasetValueIfChanged(focusRegion, "active", "true");
        setDatasetValueIfChanged(focusRegion, "zoneId", activeFocusedDetailZone.id);
      } else {
        setDatasetValueIfChanged(focusRegion, "active", "false");
        if (focusRegion.dataset.zoneId !== undefined) delete focusRegion.dataset.zoneId;
      }
    }
    let portalOverlapsMinimap = false;
    for (const region of interactionLayer.querySelectorAll<HTMLElement>(".scene-hotspot-region")) {
      const portal = scene.portals.find((candidate) => candidate.id === region.dataset.portalId);
      if (portal) {
        const bounds = projectSceneRectToScreen(portal, camera);
        portalOverlapsMinimap = portalOverlapsMinimap
          || portalIntersectsMinimap(portal, camera, {
            width: viewportWidth,
            height: viewportHeight,
          });
        const left = snapToDevicePixel(bounds.x);
        const top = snapToDevicePixel(bounds.y);
        const right = snapToDevicePixel(bounds.x + bounds.width);
        const bottom = snapToDevicePixel(bounds.y + bounds.height);
        const portalCenterX = bounds.x + bounds.width / 2;
        const captionWidth = Math.min(
          viewportWidth <= 700 ? 180 : 190,
          Math.max(0, viewportWidth - 24),
        );
        const captionShift = portalCenterX >= 0 && portalCenterX <= viewportWidth
          ? snapToDevicePixel(clampCenteredOverlayShift(
              portalCenterX,
              captionWidth,
              viewportWidth,
            ))
          : 0;
        setStylePropertyIfChanged(region.style, "left", `${left.toFixed(2)}px`);
        setStylePropertyIfChanged(region.style, "top", `${top.toFixed(2)}px`);
        setStylePropertyIfChanged(region.style, "width", `${Math.max(0, right - left).toFixed(2)}px`);
        setStylePropertyIfChanged(region.style, "height", `${Math.max(0, bottom - top).toFixed(2)}px`);
        setStylePropertyIfChanged(
          region.style,
          "--portal-caption-shift-x",
          `${captionShift.toFixed(2)}px`,
        );
      }
      const selected = region.dataset.portalId === activePortal?.id;
      setDatasetValueIfChanged(region, "candidate", String(selected));
      setStylePropertyIfChanged(
        region.style,
        "--portal-progress",
        selected ? portalProgress.toFixed(3) : "0",
      );
      const hotspot = region.querySelector<HTMLElement>(".scene-hotspot");
      if (hotspot) {
        setDatasetValueIfChanged(hotspot, "candidate", String(selected));
        setDatasetValueIfChanged(hotspot, "cueState", selected
          ? (nextPreviewPhase === "armed" ? "armed" : "candidate")
          : "idle");
        setDatasetValueIfChanged(
          hotspot,
          "progress",
          selected ? portalProgress.toFixed(3) : "0.000",
        );
      }
    }
    setDatasetValueIfChanged(
      interactionLayer,
      "portalOverlapsMinimap",
      String(portalOverlapsMinimap),
    );
    const viewerShell = interactionLayer.parentElement?.parentElement;
    if (viewerShell) {
      setStylePropertyIfChanged(
        viewerShell.style,
        "contain",
        portalOverlapsMinimap ? "none" : "",
      );
      setDatasetValueIfChanged(
        viewerShell,
        "portalOverlapsMinimap",
        String(portalOverlapsMinimap),
      );
    }
    setStylePropertyIfChanged(
      interactionLayer.style,
      "z-index",
      portalOverlapsMinimap ? "17" : "",
    );

    const labelsForCameraLayout: readonly Label[] = atlasOverviewMode
      ? selectedLabelId ? [] : activeAtlasLabels
      : scene.labels;
    const labelViewport = {
      width: viewportWidth,
      height: viewportHeight,
      compact: viewportWidth <= 900,
    };
    const activeElement = document.activeElement;
    const focusedLabelId = activeElement instanceof HTMLButtonElement
      && activeElement.matches(".word-label")
      ? activeElement.dataset.labelId ?? null
      : null;
    let pendingKeyboardFocusLabelId = pendingKeyboardFocusLabelIdRef.current;
    const layout = computeSceneLabelLayout(
      labelsForCameraLayout,
      camera,
      labelViewport,
      meaningVisibleRef.current,
      {
        selectedLabelId: focusedLabelId
          ?? pendingKeyboardFocusLabelId
          ?? selectedLabelIdRef.current,
        adaptiveRevealScale: adaptiveRevealScaleForScene(scene),
        revealLabelIds: activeFocusedDetailZone
          ? new Set(activeFocusedDetailZone.labelIds)
          : undefined,
        revealAtScale: activeFocusedDetailZone
          ? Math.max(1, activeFocusedDetailZone.targetScale - 0.35)
          : undefined,
        priorityLabelIds: focusedPriorityLabelIds,
        preferredOffsets: labelPlacementOffsetsRef.current,
        protectedRegions: [
          ...buildViewerChromeProtectedRegions(
            labelViewport.width,
            labelViewport.height,
            wordIndexOpen,
          ),
          ...buildPortalCueProtectedRegions(scene.portals, camera, labelViewport),
        ],
      },
    );
    if (pendingKeyboardFocusLabelId) {
      const resolvedKeyboardFocusLabelId = resolveInteractiveVocabularyFocusTarget(
        pendingKeyboardFocusLabelId,
        pendingKeyboardFocusBatchLabelIdsRef.current,
        layout,
      );
      if (
        resolvedKeyboardFocusLabelId
        && resolvedKeyboardFocusLabelId !== pendingKeyboardFocusLabelId
      ) {
        // A collision can retire the originally promised word even though a
        // sibling from the same reveal batch is readable. Lock that stable
        // fallback before building the bounded DOM window; any queued task for
        // the superseded id will fail its exact-id guard.
        pendingKeyboardFocusLabelId = resolvedKeyboardFocusLabelId;
        pendingKeyboardFocusLabelIdRef.current = resolvedKeyboardFocusLabelId;
        queuedKeyboardFocusLabelIdRef.current = null;
      }
    }
    const previousLabelPlacementOffsets = labelPlacementOffsetsRef.current;
    const nextLabelPlacementOffsets = new Map(layout
      .filter((item) => item.interactive)
      .map((item) => [item.id, {
        offsetX: item.offsetX,
        offsetY: item.offsetY,
      }]));
    // Retain a bounded warm slot for mounted labels whose authored anchor is
    // just outside the viewport or was collision-blocked in this frame. The
    // next layout can try the same object-relative slot before falling back to
    // another direction, so coalesced input does not create a visible flip.
    const memoryMargin = LABEL_PLACEMENT_MEMORY_OVERSCAN;
    for (const [labelId, offset] of previousLabelPlacementOffsets) {
      if (nextLabelPlacementOffsets.has(labelId) || !mountedLabelIdsRef.current.has(labelId)) continue;
      const label = labelsById.get(labelId);
      if (!label) continue;
      const anchorX = camera.x + label.x * effectiveScale;
      const anchorY = camera.y + label.y * effectiveScale;
      if (
        anchorX >= -memoryMargin
        && anchorX <= viewportWidth + memoryMargin
        && anchorY >= -memoryMargin
        && anchorY <= viewportHeight + memoryMargin
      ) {
        nextLabelPlacementOffsets.set(labelId, offset);
      }
    }
    labelPlacementOffsetsRef.current = nextLabelPlacementOffsets;
    const nextMountedLabelIds = buildSceneLabelMountWindow(
      labelsForCameraLayout,
      layout,
      labelViewport,
      {
        focusedLabelId: focusedLabelId ?? pendingKeyboardFocusLabelId,
        selectedLabelId: selectedLabelIdRef.current,
        preferredIds: activeFocusedDetailZone
          ? new Set(activeFocusedDetailZone.labelIds)
          : undefined,
        previousIds: mountedLabelIdsRef.current,
      },
    );
    if (!sameSceneLabelMountWindow(mountedLabelIdsRef.current, nextMountedLabelIds)) {
      mountedLabelIdsRef.current = nextMountedLabelIds;
      rememberSceneLabelMountWindow(
        labelsForCameraLayout,
        meaningVisibleRef.current,
        labelViewport.compact,
        nextMountedLabelIds,
      );
      pendingLabelWindowPaintRef.current = true;
      setMountedLabelIds(nextMountedLabelIds);
    }
    const byId = new Map(layout.map((item) => [item.id, item]));
    let visibleCount = 0;
    let emergingCount = 0;
    const dwellEligibleLabelIds: string[] = [];
    for (const item of layout) {
      const ownsFocus = item.id === focusedLabelId;
      const opacity = ownsFocus ? Math.max(1, item.opacity) : item.opacity;
      if (opacity >= LABEL_ENCOUNTER_OPACITY) visibleCount += 1;
      else if (opacity > 0.025) emergingCount += 1;
      if (
        viewerInteractiveRef.current
        && item.interactive
        && item.opacity >= LABEL_ENCOUNTER_OPACITY
      ) {
        dwellEligibleLabelIds.push(item.id);
      }
    }
    for (const [labelId, element] of labelElementsRef.current) {
      const item = byId.get(labelId);
      const ownsFocus = activeElement === element;
      const opacity = ownsFocus ? Math.max(1, item?.opacity ?? 0) : item?.opacity ?? 0;
      // The word index is a deliberate reading surface. Hide the spatial
      // pills for its entire lifetime so the panel can never flash over a
      // stale label layout while the next protected camera frame is queued.
      const interactive = !wordIndexOpen
        && viewerInteractiveRef.current
        && (ownsFocus || Boolean(item?.interactive));
      const opacityStyle = opacity.toFixed(3);
      const visibleValue = String(!wordIndexOpen && opacity > 0.025);
      const interactiveValue = String(interactive);
      const adaptiveValue = String(Boolean(item?.adaptive));
      const hiddenValue = String(!interactive);
      setStylePropertyIfChanged(element.style, "--label-opacity", opacityStyle);
      // Collision-blocked and offscreen labels are aria-hidden, unfocusable and
      // fully transparent. Their last geometry cannot be observed, so do not
      // churn transform/leader custom properties until the label is actually
      // painted again. A newly visible label receives every value in this same
      // frame before data-visible opens its CSS visibility gate.
      if (
        (opacity > 0.025 || ownsFocus)
        && item
        && Number.isFinite(item.screenX)
        && Number.isFinite(item.screenY)
      ) {
        const previousOffset = previousLabelPlacementOffsets.get(labelId);
        const offsetShift = previousOffset
          ? Math.hypot(
            item.offsetX - previousOffset.offsetX,
            item.offsetY - previousOffset.offsetY,
          )
          : 0;
        if (offsetShift >= 12) {
          setDatasetValueIfChanged(element, "layoutShift", "true");
          const previousTimer = labelShiftTimersRef.current.get(labelId);
          if (previousTimer !== undefined) window.clearTimeout(previousTimer);
          const timer = window.setTimeout(() => {
            if (labelShiftTimersRef.current.get(labelId) !== timer) return;
            labelShiftTimersRef.current.delete(labelId);
            if (element.isConnected) delete element.dataset.layoutShift;
          }, 150);
          labelShiftTimersRef.current.set(labelId, timer);
        }
        const anchorX = -item.offsetX;
        const anchorY = -item.offsetY;
        const displacement = Math.hypot(anchorX, anchorY);
        const leaderAngle = Math.atan2(anchorY, anchorX) * 180 / Math.PI;
        // The artwork keeps its single composited camera transform, while text
        // is projected into this unscaled sibling overlay. A pixel-snapped
        // translation keeps glyphs native-sized without invalidating layout.
        const screenX = snapToDevicePixel(item.screenX).toFixed(2);
        const screenY = snapToDevicePixel(item.screenY).toFixed(2);
        setStylePropertyIfChanged(
          element.style,
          "transform",
          `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`,
        );
        setStylePropertyIfChanged(element.style, "--label-anchor-x", `${anchorX.toFixed(2)}px`);
        setStylePropertyIfChanged(element.style, "--label-anchor-y", `${anchorY.toFixed(2)}px`);
        setStylePropertyIfChanged(element.style, "--label-leader-length", `${displacement.toFixed(2)}px`);
        setStylePropertyIfChanged(element.style, "--label-leader-angle", `${leaderAngle.toFixed(2)}deg`);
        setDatasetValueIfChanged(element, "displaced", String(displacement >= 4));
        setDatasetValueIfChanged(element, "leaderSpan", displacement >= 82 ? "long" : "short");
        setDatasetValueIfChanged(element, "anchorMode", displacement >= 4 ? "leader" : "stem");
      }
      setDatasetValueIfChanged(element, "visible", visibleValue);
      setDatasetValueIfChanged(element, "interactive", interactiveValue);
      setDatasetValueIfChanged(element, "adaptive", adaptiveValue);
      const nextTabIndex = interactive ? 0 : -1;
      if (element.tabIndex !== nextTabIndex) element.tabIndex = nextTabIndex;
      setAttributeIfChanged(element, "aria-hidden", hiddenValue);
    }
    const pendingKeyboardFocusLabel = pendingKeyboardFocusLabelId
      ? labelElementsRef.current.get(pendingKeyboardFocusLabelId)
      : undefined;
    if (
      pendingKeyboardFocusLabelId
      && pendingKeyboardFocusLabel
      && viewerInteractiveRef.current
      && pendingKeyboardFocusLabel.isConnected
      && pendingKeyboardFocusLabel.dataset.interactive === "true"
      && queuedKeyboardFocusLabelIdRef.current !== pendingKeyboardFocusLabelId
    ) {
      queuedKeyboardFocusLabelIdRef.current = pendingKeyboardFocusLabelId;
      queueMicrotask(() => {
        if (queuedKeyboardFocusLabelIdRef.current === pendingKeyboardFocusLabelId) {
          queuedKeyboardFocusLabelIdRef.current = null;
        }
        if (
          pendingKeyboardFocusLabelIdRef.current !== pendingKeyboardFocusLabelId
          || !viewerInteractiveRef.current
        ) return;
        const focusLabel = labelElementsRef.current.get(pendingKeyboardFocusLabelId);
        if (
          !focusLabel
          || !focusLabel.isConnected
          || focusLabel.dataset.interactive !== "true"
        ) return;
        const contractElement = pendingKeyboardFocusContractElementRef.current;
        if (contractElement?.isConnected) {
          setDatasetValueIfChanged(
            contractElement,
            "nextLabelId",
            pendingKeyboardFocusLabelId,
          );
        }
        const focusedWord = labelsById.get(pendingKeyboardFocusLabelId)?.word;
        if (vocabularyAnnouncementRef.current && focusedWord) {
          vocabularyAnnouncementRef.current.textContent = contractElement?.dataset.zoneTitle
            ? `已放大到${contractElement.dataset.zoneTitle}，聚焦 ${focusedWord}`
            : `已放大并聚焦 ${focusedWord}`;
        }
        focusLabel.focus();
        if (document.activeElement === focusLabel) {
          pendingKeyboardFocusLabelIdRef.current = null;
          pendingKeyboardFocusBatchLabelIdsRef.current = [];
          pendingKeyboardFocusContractElementRef.current = null;
          queuedKeyboardFocusLabelIdRef.current = null;
        }
      });
    }
    setDatasetValueIfChanged(surface, "visibleLabelCount", String(visibleCount));
    setDatasetValueIfChanged(surface, "emergingLabelCount", String(emergingCount));
    setDatasetValueIfChanged(labelLayer, "visibleLabelCount", String(visibleCount));
    setDatasetValueIfChanged(labelLayer, "emergingLabelCount", String(emergingCount));
    setDatasetValueIfChanged(labelLayer, "sceneScale", sceneScaleValue);
    const sceneWordProgress = sceneWordProgressRef.current;
    if (sceneWordProgress) {
      const total = scene.labels.length;
      const remaining = atlasOverviewMode ? total : Math.max(0, total - visibleCount);
      const maximumZoom = camera.scale >= maximumScale - 0.02;
      const action = atlasOverviewMode
        ? "悬停大区显示该区锚点词，放大可见更多"
        : remaining === 0
          ? maximumZoom
            ? "本景词汇已全部在当前视野，已到最大倍率"
            : "本景词汇已全部在当前视野"
          : maximumZoom
            ? `拖动探索其余 ${remaining} 个词，已到最大倍率`
            : `放大或拖动探索其余 ${remaining} 个词`;
      const compact = viewportWidth <= 560;
      const text = atlasOverviewMode
        ? compact
          ? "悬停大区查看锚点词"
          : action
        : compact
          ? `视野 ${visibleCount}/${total} · ${maximumZoom
            ? "拖动看词 / 已到最大倍率"
            : remaining === 0 ? "已全部展开" : `放大/拖动看其余 ${remaining}`}`
          : `当前视野 ${visibleCount} / 本景 ${total} 个词 · ${action}`;
      if (sceneWordProgress.textContent !== text) sceneWordProgress.textContent = text;
      setAttributeIfChanged(
        sceneWordProgress,
        "aria-label",
        atlasOverviewMode
          ? `首页有六个大类。悬停或聚焦大类查看该区锚点词，放大可见更多。`
          : `当前视野 ${visibleCount} 个词，本场景共 ${total} 个词。${action}`,
      );
      setDatasetValueIfChanged(sceneWordProgress, "current", String(visibleCount));
      setDatasetValueIfChanged(sceneWordProgress, "total", String(total));
      setDatasetValueIfChanged(sceneWordProgress, "remaining", String(remaining));
      setDatasetValueIfChanged(
        sceneWordProgress,
        "cameraMode",
        atlasOverviewMode ? "atlas-overview" : maximumZoom ? "pan" : "zoom-or-pan",
      );
      setDatasetValueIfChanged(
        sceneWordProgress,
        "nextPlane",
        atlasOverviewMode
          ? "atlas-category"
          : maximumZoom ? "spatial-terminal" : "spatial",
      );
    }

    if (encounterDwellRef.current) {
      clearTimeout(encounterDwellRef.current);
      encounterDwellRef.current = null;
    }
    const dwell = advanceLabelDwell(
      visibleSinceRef.current,
      dwellEligibleLabelIds,
      encounteredLabelIdsRef.current,
      performance.now(),
    );
    visibleSinceRef.current = dwell.visibleSince;
    if (dwell.newlyEncounteredIds.length > 0) {
      const encountered = dwell.newlyEncounteredIds.flatMap((id) => {
        const label = labelsById.get(id);
        if (!label) return [];
        encounteredLabelIdsRef.current.add(id);
        return [label];
      });
      if (encountered.length > 0) onLabelsEncountered(encountered);
    }
    if (dwell.nextCheckInMs !== null) {
      encounterDwellRef.current = setTimeout(() => {
        encounterDwellRef.current = null;
        setEncounterTick((current) => current + 1);
      }, Math.max(1, Math.ceil(dwell.nextCheckInMs)));
    }

    const visibleItemsInPlacementOrder = layout
      .filter((item) => item.interactive)
      .sort((first, second) => first.placementOrder - second.placementOrder);
    revealedLabelIdsRef.current = prioritizeCurrentLabelOrder(
      revealedLabelIdsRef.current,
      visibleItemsInPlacementOrder,
    );
    const revealSummary = buildVocabularyRevealSummary(
      labelsForCameraLayout,
      camera.scale,
      maximumScale,
      LABEL_ENCOUNTER_OPACITY,
      revealedLabelIdsRef.current,
    );
    const globallyHiddenIds = new Set(revealSummary.hiddenLabels.map((label) => label.id));
    const cueCandidates = (atlasOverviewMode ? [] : vocabularyZoomCues).flatMap((cue) => {
      const hidden = cue.labelIds
        .map((id) => labelsById.get(id))
        .filter((label): label is Label => Boolean(label))
        .filter((label) => globallyHiddenIds.has(label.id));
      if (cue.source === "authored-zone") {
        const state = buildVocabularyCueRevealState(
          cue,
          hidden,
          camera.scale,
          maximumScale,
          LABEL_ENCOUNTER_OPACITY,
        );
        if (
          state.nextLod === null
          || state.nextLod < 2
          || state.targetScale === null
          || state.hiddenLabels.length === 0
        ) return [];
        return [{
          cue,
          labels: state.hiddenLabels,
          nextLabels: state.nextLabels,
          nextLod: state.nextLod as 2 | 3 | 4,
          targetScale: state.targetScale,
        }];
      }
      const nextLod = hidden.reduce<number>(
        (lowest, label) => Math.min(lowest, sceneLabelLod(label)),
        Number.POSITIVE_INFINITY,
      );
      if (nextLod < 2 || nextLod > 4) return [];
      const fallbackTargetScale = Math.min(maximumScale, Math.max(
        camera.scale + 0.28,
        VOCABULARY_REVEAL_SCALE[nextLod as 2 | 3 | 4],
        ...hidden
          .filter((label) => sceneLabelLod(label) === nextLod)
          .map((label) => (label.minScale ?? 0) + 0.34),
      ));
      const targetScale = fallbackTargetScale;
      const revealable = hidden.filter((label) => (
        sceneLabelLod(label) === nextLod
        && sceneLabelRevealOpacity(label, targetScale) >= LABEL_ENCOUNTER_OPACITY
      ));
      if (revealable.length === 0) return [];
      return [{
        cue,
        labels: revealable,
        nextLabels: revealable,
        nextLod: nextLod as 2 | 3 | 4,
        targetScale,
      }];
    });
    const nextSceneLod = cueCandidates.reduce<number>(
      (lowest, batch) => Math.min(lowest, batch.nextLod),
      Number.POSITIVE_INFINITY,
    );
    const nextSceneScale = Number.isFinite(nextSceneLod)
      ? Math.min(maximumScale, Math.max(camera.scale + 0.28, VOCABULARY_REVEAL_SCALE[nextSceneLod as 2 | 3 | 4]))
      : maximumScale;
    const visibleSceneWidth = viewportWidth / Math.max(0.001, camera.fit * nextSceneScale);
    const visibleSceneHeight = viewportHeight / Math.max(0.001, camera.fit * nextSceneScale);
    const cueBatches = vocabularyZoomCues.some((cue) => cue.source === "authored-zone")
      ? cueCandidates.map((candidate) => ({
        ...candidate,
        sourceCueIds: [candidate.cue.id],
        mode: candidate.labels.length >= 4 ? "region" as const : "compact" as const,
      }))
      : consolidateVocabularyCueBatches(
        cueCandidates,
        4,
        visibleSceneWidth * 0.4,
        visibleSceneHeight * 0.4,
      );
    const cueLimit = sceneVocabularyCueLimit(viewportWidth);
    let activeCueCount = 0;
    for (const element of interactionLayer.querySelectorAll<HTMLButtonElement>(".vocabulary-zoom-cue")) {
      const batch = cueBatches.find((candidate) => candidate.cue.id === element.dataset.cueId);
      const active = Boolean(
        batch
        && batch.nextLod === nextSceneLod
        && activeCueCount < cueLimit
        && viewerInteractiveRef.current
        && !activePortal,
      );
      if (active && batch) {
        activeCueCount += 1;
        const nextBatchLabels = batch.nextLabels?.length ? batch.nextLabels : batch.labels;
        const centroid = {
          x: nextBatchLabels.reduce((sum, label) => sum + label.x, 0) / nextBatchLabels.length,
          y: nextBatchLabels.reduce((sum, label) => sum + label.y, 0) / nextBatchLabels.length,
        };
        const orderedNextBatchLabels = [...nextBatchLabels].sort((first, second) => (
          Math.hypot(first.x - centroid.x, first.y - centroid.y)
            - Math.hypot(second.x - centroid.x, second.y - centroid.y)
          || first.priority - second.priority
          || first.id.localeCompare(second.id)
        ));
        const nextLabel = orderedNextBatchLabels[0];
        const fallbackTargetScale = Math.min(maximumScale, Math.max(
          camera.scale + 0.28,
          VOCABULARY_REVEAL_SCALE[batch.nextLod],
          ...batch.labels.map((label) => (label.minScale ?? 0) + 0.34),
        ));
        const targetScale = batch.cue.source === "authored-zone"
          ? batch.targetScale ?? Math.min(maximumScale, Math.max(
            camera.scale + 0.28,
            batch.cue.targetScale ?? fallbackTargetScale,
          ))
          : fallbackTargetScale;
        const cueAnchor = labelsById.get(batch.cue.anchorLabelId) ?? nextLabel;
        setDatasetValueIfChanged(element, "nextLod", String(batch.nextLod));
        setDatasetValueIfChanged(element, "hiddenWordCount", String(batch.labels.length));
        setDatasetValueIfChanged(element, "nextBatchCount", String(nextBatchLabels.length));
        setDatasetValueIfChanged(element, "nextLabelId", nextLabel.id);
        setDatasetValueIfChanged(
          element,
          "nextLabelIds",
          orderedNextBatchLabels.map((label) => label.id).join(" "),
        );
        setDatasetValueIfChanged(element, "targetScale", targetScale.toFixed(3));
        setDatasetValueIfChanged(element, "cueSource", batch.cue.source);
        if (batch.cue.title) setDatasetValueIfChanged(element, "zoneTitle", batch.cue.title);
        if (batch.cue.translation) {
          setDatasetValueIfChanged(element, "zoneTranslation", batch.cue.translation);
        }
        const focusPoint = vocabularyCueFocusPoint(batch.cue, nextBatchLabels);
        if (focusPoint) {
          setDatasetValueIfChanged(element, "focusX", String(focusPoint.x));
          setDatasetValueIfChanged(element, "focusY", String(focusPoint.y));
        }
        setDatasetValueIfChanged(element, "sourceCueIds", batch.sourceCueIds.join(" "));
        setDatasetValueIfChanged(element, "cueMode", batch.mode);
        setDatasetValueIfChanged(element, "visualRegion", cueAnchor.sourceVisualRegion ?? batch.cue.id);
        setDatasetValueIfChanged(element, "anchorX", String(cueAnchor.x));
        setDatasetValueIfChanged(element, "anchorY", String(cueAnchor.y));
        const cuePosition = projectScenePointToScreen(cueAnchor, camera);
        setStylePropertyIfChanged(
          element.style,
          "left",
          `${snapToDevicePixel(cuePosition.x).toFixed(2)}px`,
        );
        setStylePropertyIfChanged(
          element.style,
          "top",
          `${snapToDevicePixel(cuePosition.y).toFixed(2)}px`,
        );
        const count = element.querySelector<HTMLElement>(".vocabulary-zoom-cue-count");
        if (count) {
          const semanticTitle = batch.cue.title
            ? meaningVisibleRef.current && batch.cue.translation
              ? `${batch.cue.title} · ${batch.cue.translation}`
              : batch.cue.title
            : null;
          const countValue = semanticTitle
            ? `${semanticTitle} · 还剩 ${batch.labels.length} 个词`
            : batch.mode === "compact"
              ? `+${batch.labels.length}`
              : `${batch.labels.length} 个词`;
          if (count.textContent !== countValue) count.textContent = countValue;
        }
        const accessibleTitle = batch.cue.title
          ? meaningVisibleRef.current && batch.cue.translation
            ? `${batch.cue.title}，${batch.cue.translation}`
            : batch.cue.title
          : "此处";
        setAttributeIfChanged(
          element,
          "aria-label",
          `${accessibleTitle}还有 ${batch.labels.length} 个词，放大查看`,
        );
      }
      setDatasetValueIfChanged(element, "active", String(active));
      const cueTabIndex = active ? 0 : -1;
      if (element.tabIndex !== cueTabIndex) element.tabIndex = cueTabIndex;
      setAttributeIfChanged(element, "aria-hidden", String(!active));
    }
    setDatasetValueIfChanged(
      surface,
      "vocabularyCueLod",
      Number.isFinite(nextSceneLod) ? String(nextSceneLod) : "none",
    );
    setDatasetValueIfChanged(surface, "visibleVocabularyCueCount", String(activeCueCount));
    setDatasetValueIfChanged(interactionLayer, "sceneScale", sceneScaleValue);
    if (!interactionPositionedRef.current) {
      interactionPositionedRef.current = true;
      setDatasetValueIfChanged(interactionLayer, "positioned", "true");
      setInteractionPositioned(true);
    }

    const summaryElement = vocabularySummaryRef.current;
    if (summaryElement) {
      const leadingLabel = revealSummary.nextLabels[0];
      const summaryActive = Boolean(
        leadingLabel
        && revealSummary.nextLod !== null
        && revealSummary.targetScale !== null
        && viewerInteractiveRef.current
        && !activePortal,
      );
      const hiddenCount = revealSummary.hiddenLabels.length;
      const summaryHidden = !summaryActive;
      if (summaryElement.hidden !== summaryHidden) summaryElement.hidden = summaryHidden;
      setDatasetValueIfChanged(summaryElement, "active", String(summaryActive));
      setDatasetValueIfChanged(summaryElement, "hiddenWordCount", String(hiddenCount));
      setDatasetValueIfChanged(summaryElement, "nextBatchCount", String(revealSummary.nextLabels.length));
      setDatasetValueIfChanged(
        summaryElement,
        "nextLod",
        revealSummary.nextLod === null ? "none" : String(revealSummary.nextLod),
      );
      if (leadingLabel && revealSummary.targetScale !== null) {
        setDatasetValueIfChanged(summaryElement, "nextLabelId", leadingLabel.id);
        setDatasetValueIfChanged(
          summaryElement,
          "nextLabelIds",
          revealSummary.nextLabels.map((label) => label.id).join(" "),
        );
        setDatasetValueIfChanged(summaryElement, "targetScale", Math.min(
          maximumScale,
          Math.max(camera.scale + 0.28, revealSummary.targetScale + 0.08),
        ).toFixed(3));
      } else {
        if (summaryElement.dataset.nextLabelId !== undefined) delete summaryElement.dataset.nextLabelId;
        if (summaryElement.dataset.nextLabelIds !== undefined) delete summaryElement.dataset.nextLabelIds;
        if (summaryElement.dataset.targetScale !== undefined) delete summaryElement.dataset.targetScale;
      }
      setAttributeIfChanged(summaryElement, "aria-label", "继续放大，显示下一批词");
    }
    onCameraFrame?.({
      sceneId: scene.id,
      camera: { ...camera },
      viewportWidth,
      viewportHeight,
    });
  }, [activeAtlasLabels, atlasOverviewMode, clampCamera, continuousTileDirection, continuousTileState, labelsById, onCameraFrame, onLabelsEncountered, positionAtlasCategories, reconcileSceneAssetForCamera, scene, selectedLabelId, showPortalPreview, vocabularyZoomCues, wordIndexOpen]);

  useLayoutEffect(() => {
    if (pendingLabelWindowPaintRef.current) {
      pendingLabelWindowPaintRef.current = false;
      // Ref callbacks have installed the new buttons. Paint their projected
      // geometry synchronously so data-visible never exposes a zero-position
      // label between the React window swap and the next browser frame.
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      applyCamera();
    }
  }, [applyCamera, mountedLabelIds]);

  const requestCameraFrame = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(applyCamera);
  }, [applyCamera]);

  useLayoutEffect(() => {
    focusedDetailZoneValueRef.current = focusedDetailZone;
    requestCameraFrame();
  }, [focusedDetailZone, requestCameraFrame]);

  // Category regions mount after the first scene frame. A layout effect gives
  // each region a concrete camera rectangle before the browser paints, so the
  // home map never flashes empty hit targets or waits for a pointer move.
  useLayoutEffect(() => {
    if (atlasOverviewMode) requestCameraFrame();
  }, [atlasCategoryId, atlasDistricts, atlasOverviewMode, requestCameraFrame]);

  const stopWheelAnimation = useCallback(() => {
    if (wheelAnimationRef.current !== null) {
      cancelAnimationFrame(wheelAnimationRef.current);
      wheelAnimationRef.current = null;
    }
    wheelTargetRef.current = null;
    wheelFrameTimeRef.current = null;
  }, []);

  const cancelCameraAnimation = useCallback(() => {
    if (cameraAnimationRef.current !== null) {
      cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }
    if (!continuitySettlingRef.current) return;
    continuitySettlingRef.current = false;
    continuityWheelGuardRef.current = { active: false, quietUntil: 0 };
    parentExitHysteresisRef.current = createParentExitHysteresisState();
    parentExitReadyRef.current = false;
    continuityProgressRef.current = 0;
    setContinuousTile(null);
    setContinuousTileState("preview");
    setContinuousTileDirection("forward");
    setMotionFrozen(false);
    requestCameraFrame();
  }, [requestCameraFrame]);

  const resetSemanticOverscroll = useCallback(() => {
    semanticOverscrollRef.current = 0;
    semanticOverscrollTimestampRef.current = null;
  }, []);

  const resetParentExitHysteresis = useCallback(() => {
    parentExitHysteresisRef.current = createParentExitHysteresisState();
    parentExitReadyRef.current = false;
  }, []);

  const sampleParentExitHysteresis = useCallback((factor: number, scale: number) => {
    const result = advanceParentExitHysteresis(parentExitHysteresisRef.current, {
      now: performance.now(),
      factor,
      scale,
      hasParent: Boolean(scene.parentId),
      continuitySettled: !continuitySettlingRef.current,
    });
    parentExitHysteresisRef.current = result.state;
    if (factor >= 1 || !scene.parentId || continuitySettlingRef.current) {
      parentExitReadyRef.current = false;
    } else if (result.exitRequested) {
      // Hold the decision through the remaining samples of this device stream
      // until the smoothed camera reaches the boundary and navigation commits.
      parentExitReadyRef.current = true;
    }
  }, [scene.parentId]);

  const updateZoomDirection = useCallback((next: "in" | "out" | null) => {
    const previous = zoomDirectionRef.current;
    if (shouldResetLabelPlacementMemory(previous, next)) {
      labelPlacementOffsetsRef.current.clear();
    }
    zoomDirectionRef.current = next;
  }, []);

  useEffect(() => {
    resetSemanticOverscroll();
    resetParentExitHysteresis();
  }, [resetParentExitHysteresis, resetSemanticOverscroll, scene.id]);

  useEffect(() => {
    if (encounterTick > 0) requestCameraFrame();
  }, [encounterTick, requestCameraFrame]);

  const resetCamera = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || committingRef.current) return;
    resetSemanticOverscroll();
    resetParentExitHysteresis();
    labelPlacementOffsetsRef.current.clear();
    stopWheelAnimation();
    cancelCameraAnimation();
    const fittedCamera = fittedSceneCamera(
      scene,
      { width: viewport.clientWidth, height: viewport.clientHeight },
    );
    fittedViewportSizeRef.current = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    };
    const continuityView = initialViewRef.current;
    initialViewRef.current = undefined;
    continuityWheelGuardRef.current = {
      active: Boolean(continuityView),
      quietUntil: continuityView ? performance.now() + HANDOFF_WHEEL_QUIET_MS : 0,
    };
    cameraRef.current = continuityView ? { ...continuityView.camera } : fittedCamera;
    continuitySettlingRef.current = Boolean(continuityView && !reducedContinuityAtMount);
    setMotionFrozen(continuitySettlingRef.current);
    continuityProgressRef.current = continuityView?.direction === "back" && continuityView.tileScene ? 1 : 0;
    zoomFocusRef.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    updateZoomDirection(null);
    portalCandidateRef.current = null;
    // ResizeObserver can fire just after keyboard focus enters a portal. Keep
    // that focus-driven target cue instead of erasing it during the initial
    // fit pass; the Fit button and ordinary resizes still clear stale cues.
    const portalHasFocus = document.activeElement instanceof HTMLElement
      && document.activeElement.matches(".scene-hotspot");
    if (!portalHasFocus && !continuityView) showPortalPreview(null);
    requestCameraFrame();
  }, [cancelCameraAnimation, reducedContinuityAtMount, requestCameraFrame, resetParentExitHysteresis, resetSemanticOverscroll, scene, showPortalPreview, stopWheelAnimation, updateZoomDirection]);

  const beginPortalTransition = useCallback((
    portal: ScenePortal,
    source: "zoom" | "pointer" | "keyboard",
  ) => {
    const viewport = viewportRef.current;
    if (!viewport || committingRef.current || interactionLocked) return;
    resetParentExitHysteresis();
    stopWheelAnimation();
    cancelCameraAnimation();
    requestContinuousTile(portal);
    const readiness = onCommitScene(portal.childSceneId, source, portal);
    if (!readiness) return;
    committingRef.current = true;
    setMotionFrozen(true);
    portalCandidateRef.current = portal;
    showPortalPreview(portal);
    previewPhaseRef.current = "armed";
    setPreviewPhase("armed");
    setContinuousTileDirection("forward");
    setContinuousTileState("active");
    if (continuousTileRef.current) {
      delete continuousTileRef.current.dataset.handoffReady;
    }

    const start = { ...cameraRef.current };
    const startFocus = zoomFocusRef.current ? { ...zoomFocusRef.current } : null;
    const startDirection = zoomDirectionRef.current;
    const enterPreparedScene = () => void onEnterScene(portal.childSceneId, source).then((entered) => {
      if (entered) return;
      committingRef.current = false;
      setMotionFrozen(false);
      setContinuousTileState("preview");
      cameraRef.current = { ...start };
      zoomFocusRef.current = startFocus ? { ...startFocus } : null;
      zoomDirectionRef.current = startDirection;
      portalCandidateRef.current = null;
      showPortalPreview(null);
      requestCameraFrame();
    });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      cameraAnimationRef.current = null;
      enterPreparedScene();
      return;
    }

    // Briefly let the portal cover the viewport before ownership moves to the
    // child. The sharp decoded child tile is recursively redrawn inside that
    // crop, so the parent raster never carries the final magnified frame.
    const portalCoverScale = Math.max(
      viewport.clientWidth / portal.width,
      viewport.clientHeight / portal.height,
    ) / start.fit;
    const targetScale = Math.max(
      start.scale + 0.28,
      (portal.enterScale ?? 3.6) + 0.38,
      portalCoverScale * 1.025,
    );
    const effective = start.fit * targetScale;
    const target = {
      ...start,
      scale: targetScale,
      x: viewport.clientWidth / 2 - (portal.x + portal.width / 2) * effective,
      y: viewport.clientHeight / 2 - (portal.y + portal.height / 2) * effective,
    };
    // A warm adjacent handoff still feels immediate, but 150ms gives the
    // portal-cover frame one full compositor beat instead of landing on the
    // edge of the input/transition race.
    const duration = source === "zoom" ? 110 : readiness === "warm" ? 150 : 170;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const linear = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - linear) ** 3;
      cameraRef.current = {
        fit: start.fit,
        scale: start.scale + (target.scale - start.scale) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
      };
      requestCameraFrame();
      if (linear < 1) {
        cameraAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      cameraRef.current = clampCamera(cameraRef.current);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      // Paint the exact portal-cover camera once before React hands ownership
      // to the child. Committing in this same rAF would unmount the parent
      // before the browser can present its final tile frame.
      applyCamera();
      const handoffCamera = { ...cameraRef.current };
      cameraAnimationRef.current = requestAnimationFrame(() => {
        const tile = continuousTileRef.current;
        const exactTile = isExactForwardPortalTile(tile?.dataset, portal) ? tile : null;
        const viewportBounds = viewport.getBoundingClientRect();
        const tileBounds = exactTile?.getBoundingClientRect();
        const tileArt = exactTile?.querySelector<HTMLImageElement>(
          '[data-testid="scene-continuous-tile-art"]',
        );
        const tileArtBounds = tileArt?.getBoundingClientRect();
        const tileArtNaturalWidth = tileArt?.naturalWidth ?? 0;
        const tileArtNaturalHeight = tileArt?.naturalHeight ?? 0;
        // getBoundingClientRect() returns the image element's box, while
        // object-fit: cover paints the child raster beyond that box whenever
        // the portal and child aspect ratios differ. Recover the painted
        // bounds so the child camera starts on exactly the pixels that were
        // visible in the outgoing tile, not on the portal container edge.
        const paintedTileArtBounds = tileArtBounds
          && tileArtNaturalWidth > 0
          && tileArtNaturalHeight > 0
          ? (() => {
              const coverScale = Math.max(
                tileArtBounds.width / tileArtNaturalWidth,
                tileArtBounds.height / tileArtNaturalHeight,
              );
              const paintedWidth = tileArtNaturalWidth * coverScale;
              const paintedHeight = tileArtNaturalHeight * coverScale;
              return {
                x: tileArtBounds.x + (tileArtBounds.width - paintedWidth) / 2,
                y: tileArtBounds.y + (tileArtBounds.height - paintedHeight) / 2,
                width: paintedWidth,
                height: paintedHeight,
              };
            })()
          : tileArtBounds;
        if (tileBounds && portal.width > 0 && portal.height > 0) {
          // A busy compositor can expose the final inline transform before its
          // descendant tile has reached that visual position. Transfer the
          // geometry the user actually sees, not the theoretical target: the
          // child-camera mapping will then reproduce this exact painted crop
          // on its first frame and settle smoothly from there.
          const renderedCamera = cameraFromRenderedPortalRect(
            portal,
            paintedTileArtBounds ?? tileBounds,
            viewportBounds,
            handoffCamera.fit,
            tileArtNaturalWidth > 0 && tileArtNaturalHeight > 0
              ? { width: tileArtNaturalWidth, height: tileArtNaturalHeight }
              : undefined,
          );
          // Keep the measured frame authoritative across the final yield. Any
          // incidental applyCamera call now republishes the rendered geometry
          // instead of restoring the older theoretical target.
          cameraRef.current = renderedCamera;
          onCameraFrame?.({
            sceneId: scene.id,
            camera: renderedCamera,
            viewportWidth: viewport.clientWidth,
            viewportHeight: viewport.clientHeight,
          });
        }
        if (exactTile) setDatasetValueIfChanged(exactTile, "handoffReady", "true");
        cameraAnimationRef.current = requestAnimationFrame(() => {
          cameraAnimationRef.current = null;
          enterPreparedScene();
        });
      });
    };
    cameraAnimationRef.current = requestAnimationFrame(animate);
  }, [applyCamera, cancelCameraAnimation, clampCamera, interactionLocked, onCameraFrame, onCommitScene, onEnterScene, requestCameraFrame, requestContinuousTile, resetParentExitHysteresis, scene.id, showPortalPreview, stopWheelAnimation]);

  useEffect(() => {
    if (!onPortalNavigatorReady) return;
    const navigateFromSceneMap: ScenePortalNavigator = (portalId, source) => {
      const portal = scene.portals.find((candidate) => candidate.id === portalId);
      if (
        !portal
        || committingRef.current
        || continuitySettlingRef.current
        || interactionLocked
        || !viewerInteractiveRef.current
      ) return false;
      beginPortalTransition(portal, source);
      return true;
    };
    onPortalNavigatorReady(navigateFromSceneMap);
    return () => onPortalNavigatorReady(null);
  }, [beginPortalTransition, interactionLocked, onPortalNavigatorReady, scene.portals]);

  const evaluateNavigation = useCallback(() => {
    if (continuitySettlingRef.current || committingRef.current) return;
    const now = performance.now();
    if (now - lastNavigationRef.current < 350) return;
    const camera = cameraRef.current;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const focus = zoomFocusRef.current ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    const candidate = portalCandidateRef.current ?? portalAtScreenPoint(scene.portals, camera, focus);
    const portal = sceneUsesWheelPortalEntry(scene.id)
      && zoomDirectionRef.current === "in"
      && candidate
      && camera.scale >= (candidate.enterScale ?? 3.6)
      ? candidate
      : undefined;
    if (portal) {
      lastNavigationRef.current = now;
      beginPortalTransition(portal, "zoom");
      return;
    }
    if (
      scene.parentId
      && parentExitReadyRef.current
      && zoomDirectionRef.current === "out"
      && camera.scale <= EXIT_SCALE
    ) {
      lastNavigationRef.current = now;
      resetParentExitHysteresis();
      onExitScene();
    }
  }, [beginPortalTransition, onExitScene, resetParentExitHysteresis, scene.id, scene.parentId, scene.portals]);

  const scheduleNavigationCheck = useCallback(() => {
    if (navigationFrameRef.current !== null) return;
    navigationFrameRef.current = requestAnimationFrame(() => {
      navigationFrameRef.current = null;
      evaluateNavigation();
    });
  }, [evaluateNavigation]);

  const trySemanticOverscroll = useCallback((
    point: Point,
    factor: number,
    portal: ScenePortal | undefined,
  ): boolean => {
    // A spatial zoom must never turn into a semantic-world jump merely because
    // the scene has some other portal. Only an explicit semantic bridge may
    // call the semantic plane; the current product has no such spatial bridge.
    // A portal under the focal point is left to evaluateNavigation, which owns
    // the scene entry and keeps the object under the user's cursor.
    if (!portal || scene.portals.length === 0) {
      resetSemanticOverscroll();
      return false;
    }
    const now = performance.now();
    const result = advanceSemanticOverscroll(
      semanticOverscrollRef.current,
      factor,
      cameraRef.current.scale >= maximumSceneCameraScale(cameraRef.current.fit) - 0.02,
      Boolean(portal),
      semanticOverscrollTimestampRef.current === null
        ? Number.POSITIVE_INFINITY
        : now - semanticOverscrollTimestampRef.current,
      scene.portals.length > 0,
    );
    semanticOverscrollRef.current = result.accumulated;
    semanticOverscrollTimestampRef.current = result.accumulated > 0 ? now : null;
    if (!result.trigger || !onExploreSemanticPlane) return false;

    const activeIds = new Set(
      [...(labelLayerRef.current?.querySelectorAll<HTMLElement>(
        '.word-label[data-interactive="true"]',
      ) ?? [])].map((element) => element.dataset.labelId),
    );
    const nearest = scene.labels
      .filter((label) => label.lexemeId && activeIds.has(label.id))
      .map((label) => ({
        label,
        distance: distance(projectScenePointToScreen(label, cameraRef.current), point),
      }))
      .filter(({ distance: labelDistance }) => labelDistance <= 190)
      .sort((a, b) => a.distance - b.distance)[0]?.label ?? null;

    stopWheelAnimation();
    cancelCameraAnimation();
    // Semantic overscroll is the tail of an inward spatial gesture. Preserve
    // that direction while the overlay is open so the first outward gesture
    // after returning clears the inward-only callout placement memory.
    updateZoomDirection("in");
    onExploreSemanticPlane(nearest, "zoom");
    return true;
  }, [cancelCameraAnimation, onExploreSemanticPlane, resetSemanticOverscroll, scene.labels, scene.portals, stopWheelAnimation, updateZoomDirection]);

  const zoomAt = useCallback(
    (point: Point, factor: number, previousPoint: Point = point) => {
      if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
      if (factor <= 1) resetSemanticOverscroll();
      stopWheelAnimation();
      cancelCameraAnimation();
      const camera = cameraRef.current;
      const previousFocus = zoomFocusRef.current;
      const minimum = scene.parentId ? 0.68 : 0.9;
      const nextScale = Math.min(
        maximumSceneCameraScale(camera.fit),
        Math.max(minimum, camera.scale * factor),
      );
      sampleParentExitHysteresis(factor, nextScale);
      const semanticPortal = factor > 1 && sceneUsesWheelPortalEntry(scene.id)
        ? portalAtScreenPoint(scene.portals, camera, previousPoint)
        : undefined;
      if (trySemanticOverscroll(point, factor, semanticPortal)) return;
      if (
        nextScale === camera.scale
        && point.x === previousPoint.x
        && point.y === previousPoint.y
      ) return;
      const ratio = nextScale / camera.scale;
      const nextCamera = {
        ...camera,
        scale: nextScale,
        x: point.x - (previousPoint.x - camera.x) * ratio,
        y: point.y - (previousPoint.y - camera.y) * ratio,
      };
      cameraRef.current = nextCamera;
      zoomFocusRef.current = point;
      if (factor > 1) updateZoomDirection("in");
      else if (factor < 1) updateZoomDirection("out");
      else updateZoomDirection(null);
      if (factor > 1) {
        const portal = portalAtScreenPoint(scene.portals, camera, previousPoint)
          ?? portalAtScreenPoint(scene.portals, nextCamera, point);
        if (portal) {
          portalCandidateRef.current = portal;
          showPortalPreview(portal);
        } else if (!previousFocus || distance(previousFocus, point) > 16) {
          portalCandidateRef.current = null;
          showPortalPreview(null);
        }
      } else if (factor < 1) {
        portalCandidateRef.current = null;
        if (nextScale < 2.45) showPortalPreview(null);
      } else {
        const portal = portalAtScreenPoint(scene.portals, nextCamera, point);
        portalCandidateRef.current = portal ?? null;
        showPortalPreview(portal ?? null);
      }
      if (factor > 1 && nextScale >= 2.65) {
        const portal = portalCandidateRef.current;
        if (portal) requestContinuousTile(portal);
      }
      if (
        factor < 1
        && scene.parentId
        && nextScale <= 1.18
        && !parentZoomPrefetchRef.current
      ) {
        parentZoomPrefetchRef.current = true;
        onPrefetchScene(scene.parentId);
      }
      requestCameraFrame();
      scheduleNavigationCheck();
    },
    [cancelCameraAnimation, resetSemanticOverscroll, sampleParentExitHysteresis, viewerInteractive, onPrefetchScene, requestCameraFrame, requestContinuousTile, scene.id, scene.parentId, scene.portals, scheduleNavigationCheck, showPortalPreview, stopWheelAnimation, trySemanticOverscroll, updateZoomDirection],
  );

  const queueWheelZoom = useCallback((point: Point, factor: number) => {
    if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
    if (factor <= 1) resetSemanticOverscroll();
    if (navigationFrameRef.current !== null) {
      cancelAnimationFrame(navigationFrameRef.current);
      navigationFrameRef.current = null;
    }
    cancelCameraAnimation();

    const base = wheelTargetRef.current ?? cameraRef.current;
    const previousFocus = zoomFocusRef.current;
    const minimum = scene.parentId ? 0.68 : 0.9;
    const nextScale = Math.min(
      maximumSceneCameraScale(base.fit),
      Math.max(minimum, base.scale * factor),
    );
    sampleParentExitHysteresis(factor, nextScale);
    const ratio = nextScale / base.scale;
    const target = clampCamera({
      ...base,
      scale: nextScale,
      x: point.x - (point.x - base.x) * ratio,
      y: point.y - (point.y - base.y) * ratio,
    });
    const semanticPortal = factor > 1 && sceneUsesWheelPortalEntry(scene.id)
      ? portalAtScreenPoint(scene.portals, cameraRef.current, point)
        ?? portalAtScreenPoint(scene.portals, base, point)
        ?? portalAtScreenPoint(scene.portals, target, point)
      : undefined;
    if (trySemanticOverscroll(point, factor, semanticPortal)) return;
    wheelTargetRef.current = target;
    zoomFocusRef.current = point;
    if (factor > 1) updateZoomDirection("in");
    else if (factor < 1) updateZoomDirection("out");

    if (factor > 1) {
      const portal = portalAtScreenPoint(scene.portals, base, point)
        ?? portalAtScreenPoint(scene.portals, target, point);
      if (portal) {
        portalCandidateRef.current = portal;
        showPortalPreview(portal);
        if (target.scale >= 2.65) requestContinuousTile(portal);
      } else if (!previousFocus || distance(previousFocus, point) > 16) {
        portalCandidateRef.current = null;
        showPortalPreview(null);
      }
    } else if (factor < 1) {
      portalCandidateRef.current = null;
      if (target.scale < 2.45) showPortalPreview(null);
      if (
        scene.parentId
        && target.scale <= 1.18
        && !parentZoomPrefetchRef.current
      ) {
        parentZoomPrefetchRef.current = true;
        onPrefetchScene(scene.parentId);
      }
    }

    // Coalesce threshold checks to the next paint. There is no post-input
    // dwell: once the camera crosses a portal/exit threshold the navigation
    // can commit on that frame.
    scheduleNavigationCheck();

    if (wheelAnimationRef.current !== null) return;
    const animate = (now: number) => {
      const nextTarget = wheelTargetRef.current;
      if (!nextTarget || committingRef.current) {
        wheelAnimationRef.current = null;
        wheelFrameTimeRef.current = null;
        return;
      }
      const previousTime = wheelFrameTimeRef.current ?? now - 16;
      wheelFrameTimeRef.current = now;
      const current = cameraRef.current;
      const smoothed = smoothCameraTowards(
        current,
        nextTarget,
        Math.min(34, Math.max(1, now - previousTime)),
        WHEEL_RESPONSE_MS,
      );
      const settled = (
        Math.abs(smoothed.x - nextTarget.x) <= WHEEL_POSITION_EPSILON
        && Math.abs(smoothed.y - nextTarget.y) <= WHEEL_POSITION_EPSILON
        && Math.abs(Math.log(smoothed.scale / nextTarget.scale)) <= WHEEL_SCALE_EPSILON
      );
      cameraRef.current = settled
        ? { ...nextTarget }
        : { ...smoothed, fit: nextTarget.fit };
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      applyCamera();
      scheduleNavigationCheck();
      if (!settled) {
        wheelAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      wheelAnimationRef.current = null;
      wheelTargetRef.current = null;
      wheelFrameTimeRef.current = null;
    };
    wheelAnimationRef.current = requestAnimationFrame(animate);
  }, [applyCamera, cancelCameraAnimation, clampCamera, onPrefetchScene, requestContinuousTile, resetSemanticOverscroll, sampleParentExitHysteresis, scene.id, scene.parentId, scene.portals, scheduleNavigationCheck, showPortalPreview, trySemanticOverscroll, updateZoomDirection, viewerInteractive]);

  const focusVocabularyTarget = useCallback((
    fallbackLabelId: string,
    element: HTMLButtonElement,
    keyboardTriggered: boolean,
  ) => {
    const viewport = viewportRef.current;
    if (!viewport || !viewerInteractive || committingRef.current || element.dataset.active !== "true") return;
    const nextLod = Number(element.dataset.nextLod);
    const nextLabelId = element.dataset.nextLabelId ?? fallbackLabelId;
    const revealedCount = Number(element.dataset.hiddenWordCount);
    const nextLabel = labelsById.get(nextLabelId);
    if (!nextLabel || !Number.isInteger(nextLod) || nextLod < 0 || nextLod > 4 || revealedCount < 1) return;
    const promisedBatchLabelIds = [...new Set([
      nextLabelId,
      ...(element.dataset.nextLabelIds ?? "").split(/\s+/).filter(Boolean),
    ])].filter((id) => labelsById.has(id));

    // A newer cue, whether pointer- or keyboard-triggered, supersedes any
    // exact-focus task left by an earlier animation.
    pendingKeyboardFocusLabelIdRef.current = null;
    pendingKeyboardFocusBatchLabelIdsRef.current = [];
    pendingKeyboardFocusContractElementRef.current = null;
    queuedKeyboardFocusLabelIdRef.current = null;

    stopWheelAnimation();
    cancelCameraAnimation();
    if (navigationFrameRef.current !== null) {
      cancelAnimationFrame(navigationFrameRef.current);
      navigationFrameRef.current = null;
    }
    portalCandidateRef.current = null;
    showPortalPreview(null);
    updateZoomDirection("in");

    const start = { ...cameraRef.current };
    const authoredTarget = Number(element.dataset.targetScale)
      || (nextLabel.minScale === undefined ? 0 : nextLabel.minScale + 0.34);
    const defaultRevealScale = nextLod >= 2
      ? VOCABULARY_REVEAL_SCALE[nextLod as 2 | 3 | 4]
      : start.scale + 0.28;
    const maximumScale = maximumSceneCameraScale(start.fit);
    const targetScale = element.dataset.cueSource === "authored-zone"
      ? Math.min(maximumScale, Math.max(start.scale + 0.28, authoredTarget))
      : Math.min(
        maximumScale,
        Math.max(start.scale + 0.28, defaultRevealScale, authoredTarget),
    );
    const authoredFocusX = Number(element.dataset.focusX);
    const authoredFocusY = Number(element.dataset.focusY);
    const { x: focusX, y: focusY } = vocabularyActivationFocusPoint(
      nextLabel,
      { x: authoredFocusX, y: authoredFocusY },
      keyboardTriggered,
    );
    const effectiveScale = start.fit * targetScale;
    const target = {
      fit: start.fit,
      scale: targetScale,
      x: viewport.clientWidth / 2 - focusX * effectiveScale,
      y: viewport.clientHeight / 2 - focusY * effectiveScale,
    };
    const focusRevealedWord = () => {
      zoomFocusRef.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      if (keyboardTriggered) {
        pendingKeyboardFocusLabelIdRef.current = nextLabelId;
        pendingKeyboardFocusBatchLabelIdsRef.current = promisedBatchLabelIds;
        pendingKeyboardFocusContractElementRef.current = element;
        const nextMountedLabelIds = includeSceneLabelMountTarget(
          mountedLabelIdsRef.current,
          nextLabelId,
          sceneLabelMountLimit({ compact: viewport.clientWidth <= 900 }),
        );
        if (nextMountedLabelIds !== mountedLabelIdsRef.current) {
          mountedLabelIdsRef.current = nextMountedLabelIds;
          setMountedLabelIds(nextMountedLabelIds);
          pendingLabelWindowPaintRef.current = true;
        }
      }
      requestCameraFrame();
      if (!keyboardTriggered && vocabularyAnnouncementRef.current) {
        vocabularyAnnouncementRef.current.textContent = element.dataset.zoneTitle
          ? `已放大到${element.dataset.zoneTitle}`
          : "已放大到下一批词汇";
      }
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      cameraRef.current = target;
      cameraAnimationRef.current = null;
      focusRevealedWord();
      return;
    }

    const startedAt = performance.now();
    const duration = 240;
    const animate = (now: number) => {
      const linear = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - linear) ** 3;
      cameraRef.current = {
        fit: start.fit,
        scale: start.scale + (target.scale - start.scale) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
      };
      requestCameraFrame();
      if (linear < 1) {
        cameraAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      cameraAnimationRef.current = null;
      focusRevealedWord();
    };
    cameraAnimationRef.current = requestAnimationFrame(animate);
  }, [cancelCameraAnimation, labelsById, requestCameraFrame, showPortalPreview, stopWheelAnimation, updateZoomDirection, viewerInteractive]);

  const focusSceneTarget = useCallback((
    focusTarget: SceneFocusTarget,
    source: "pointer" | "keyboard",
  ): boolean => {
    const viewport = viewportRef.current;
    if (
      !viewport
      || !viewerInteractive
      || committingRef.current
      || continuitySettlingRef.current
      || !Number.isFinite(focusTarget.x)
      || !Number.isFinite(focusTarget.y)
      || !Number.isFinite(focusTarget.targetScale)
    ) return false;

    stopWheelAnimation();
    cancelCameraAnimation();
    resetSemanticOverscroll();
    resetParentExitHysteresis();
    portalCandidateRef.current = null;
    showPortalPreview(null);
    updateZoomDirection("in");
    labelPlacementOffsetsRef.current.clear();
    zoomFocusRef.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    lastNavigationRef.current = performance.now();

    const start = { ...cameraRef.current };
    let targetScale = Math.min(
      maximumSceneCameraScale(start.fit),
      Math.max(start.scale, focusTarget.targetScale),
    );
    const focusedZone = scene.detailZones?.find(({ id }) => id === focusTarget.id);
    // The state update that marks a zone active lands after this pointer event,
    // while the camera animation can already be producing frames. Mirror the
    // event's exact zone into the mutable frame ref immediately so the first
    // focused frame promotes and mounts that crop's labels instead of briefly
    // laying out the previous (or null) zone.
    focusedDetailZoneValueRef.current = focusedZone ?? null;
    if (focusedZone && focusedZone.labelIds.length > 1) {
      const points = focusedZone.labelIds
        .map((labelId) => labelsById.get(labelId))
        .filter((label): label is Label => Boolean(label));
      if (points.length > 1) {
        const xs = points.map(({ x }) => x);
        const ys = points.map(({ y }) => y);
        const spanX = Math.max(1, Math.max(...xs) - Math.min(...xs));
        const spanY = Math.max(1, Math.max(...ys) - Math.min(...ys));
        // A broad authored crop should open as a readable overview of its
        // whole word batch. Cap the requested target by the scale that keeps
        // the batch inside this viewport, then let ordinary wheel zoom take
        // the user deeper into the same crop.
        const batchFitScale = Math.min(
          viewport.clientWidth / (spanX * start.fit),
          viewport.clientHeight / (spanY * start.fit),
        ) * 0.88;
        targetScale = Math.min(
          targetScale,
          // A zone click is an explicit request to inspect that whole crop.
          // If the user is already deeper in a neighbouring crop, allow a
          // small zoom-out so the newly selected batch is not clipped to one
          // edge of the viewport. Ordinary wheel zoom still starts from this
          // fitted frame and can continue inward afterwards.
          Math.max(1.05, start.scale - 0.5, batchFitScale),
        );
      }
    }
    const effectiveScale = start.fit * targetScale;
    const target = clampCamera({
      ...start,
      scale: targetScale,
      x: viewport.clientWidth / 2 - focusTarget.x * effectiveScale,
      y: viewport.clientHeight / 2 - focusTarget.y * effectiveScale,
    });
    const applyTarget = () => {
      cameraRef.current = target;
      requestCameraFrame();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyTarget();
      return true;
    }

    const startedAt = performance.now();
    const duration = source === "keyboard" ? 220 : 260;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      cameraRef.current = clampCamera({
        fit: start.fit,
        scale: start.scale + (target.scale - start.scale) * eased,
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
      });
      requestCameraFrame();
      if (progress < 1) {
        cameraAnimationRef.current = requestAnimationFrame(animate);
      } else {
        cameraAnimationRef.current = null;
        applyTarget();
      }
    };
    cameraAnimationRef.current = requestAnimationFrame(animate);
    return true;
  }, [cancelCameraAnimation, clampCamera, labelsById, requestCameraFrame, resetParentExitHysteresis, resetSemanticOverscroll, scene.detailZones, showPortalPreview, stopWheelAnimation, updateZoomDirection, viewerInteractive]);

  useEffect(() => {
    if (!onFocusTargetNavigatorReady) return;
    onFocusTargetNavigatorReady(focusSceneTarget);
    return () => onFocusTargetNavigatorReady(null);
  }, [focusSceneTarget, onFocusTargetNavigatorReady]);

  useEffect(() => {
    selectedLabelIdRef.current = selectedLabelId && labelsById.has(selectedLabelId)
      ? selectedLabelId
      : null;
    requestCameraFrame();
  }, [labelsById, requestCameraFrame, selectedLabelId]);

  useEffect(() => {
    selectedLabelIdRef.current = null;
    pendingKeyboardFocusLabelIdRef.current = null;
    pendingKeyboardFocusBatchLabelIdsRef.current = [];
    pendingKeyboardFocusContractElementRef.current = null;
    queuedKeyboardFocusLabelIdRef.current = null;
    parentZoomPrefetchRef.current = false;
    if (!scene.parentId) return;
    onPrefetchScene(scene.parentId);
  }, [onPrefetchScene, scene.id, scene.parentId]);

  useEffect(() => {
    if (continuousTile) requestCameraFrame();
  }, [continuousTile, requestCameraFrame]);

  useLayoutEffect(() => {
    if (wordIndexOpen) {
      // Hide the old frame synchronously with the panel render. The queued
      // camera pass will restore the labels after the index closes, but no
      // stale pill can flash beneath the panel during that first paint.
      for (const element of labelElementsRef.current.values()) {
        setDatasetValueIfChanged(element, "visible", "false");
        setDatasetValueIfChanged(element, "interactive", "false");
        setAttributeIfChanged(element, "aria-hidden", "true");
        if (element.tabIndex !== -1) element.tabIndex = -1;
      }
    }
    requestCameraFrame();
  }, [focusedDetailZoneId, requestCameraFrame, wordIndexOpen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (initializedSceneRef.current !== scene.id) {
      initializedSceneRef.current = scene.id;
      resetCamera();
      const continuityView = initialView;
      if (continuityView) {
        const target = continuityView.settledCamera ?? fittedSceneCamera(
          scene,
          { width: viewport.clientWidth, height: viewport.clientHeight },
        );
        const start = { ...cameraRef.current };
        if (reducedContinuityAtMount) {
          cameraRef.current = { ...target };
          continuityProgressRef.current = 0;
          continuitySettlingRef.current = false;
          continuityWheelGuardRef.current = {
            active: true,
            quietUntil: performance.now() + HANDOFF_WHEEL_QUIET_MS,
          };
          resetParentExitHysteresis();
          requestCameraFrame();
        } else {
          const startedAt = performance.now();
          // Settle the already-painted handoff promptly; the independent
          // 180ms input guard still prevents the entering wheel stream from
          // immediately reversing scene ownership.
          const duration = continuityView.direction === "back" ? 105 : 80;
          const animate = (now: number) => {
            const linear = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - (1 - linear) ** 3;
            cameraRef.current = {
              fit: start.fit + (target.fit - start.fit) * eased,
              scale: start.scale + (target.scale - start.scale) * eased,
              x: start.x + (target.x - start.x) * eased,
              y: start.y + (target.y - start.y) * eased,
            };
            if (continuityView.direction === "back") {
              continuityProgressRef.current = 1 - eased;
            }
            requestCameraFrame();
            if (linear < 1) {
              cameraAnimationRef.current = requestAnimationFrame(animate);
              return;
            }
            cameraAnimationRef.current = null;
            cameraRef.current = { ...target };
            continuitySettlingRef.current = false;
            continuityWheelGuardRef.current = {
              active: true,
              quietUntil: now + HANDOFF_WHEEL_QUIET_MS,
            };
            resetParentExitHysteresis();
            continuityProgressRef.current = 0;
            setMotionFrozen(false);
            if (continuityView.direction === "back") {
              setContinuousTile(null);
              setContinuousTileState("preview");
              setContinuousTileDirection("forward");
            }
            requestCameraFrame();
          };
          cameraAnimationRef.current = requestAnimationFrame(animate);
        }
      }
    }
    let resizeFrame: number | null = null;
    const reconcileViewportSize = () => {
      resizeFrame = null;
      const previousSize = fittedViewportSizeRef.current;
      if (
        previousSize?.width === viewport.clientWidth
        && previousSize.height === viewport.clientHeight
      ) return;
      const cameraBusy = continuitySettlingRef.current
        || committingRef.current
        || wheelAnimationRef.current !== null
        || cameraAnimationRef.current !== null
        || pointersRef.current.size > 0;
      if (cameraBusy) {
        resizeFrame = requestAnimationFrame(reconcileViewportSize);
        return;
      }
      resetCamera();
    };
    const observer = new ResizeObserver(() => {
      if (resizeFrame === null) resizeFrame = requestAnimationFrame(reconcileViewportSize);
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    };
  }, [initialView, reducedContinuityAtMount, requestCameraFrame, resetCamera, resetParentExitHysteresis, scene]);

  useEffect(() => {
    viewerInteractiveRef.current = viewerInteractive;
    meaningVisibleRef.current = meaningVisible;
    requestCameraFrame();
  }, [meaningVisible, requestCameraFrame, viewerInteractive]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      if (continuityWheelGuardRef.current.active) {
        if (now <= continuityWheelGuardRef.current.quietUntil) {
          continuityWheelGuardRef.current.quietUntil = now + HANDOFF_WHEEL_QUIET_MS;
          return;
        }
        continuityWheelGuardRef.current = { active: false, quietUntil: 0 };
      }
      const bounds = viewport.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode, viewport.clientHeight);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        zoomAt(point, factor);
      } else {
        queueWheelZoom(point, factor);
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [queueWheelZoom, zoomAt]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (cameraAnimationRef.current !== null) cancelAnimationFrame(cameraAnimationRef.current);
      if (wheelAnimationRef.current !== null) cancelAnimationFrame(wheelAnimationRef.current);
      if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
      if (encounterDwellRef.current) clearTimeout(encounterDwellRef.current);
    },
    [],
  );

  const reportClickedLabel = useCallback((label: Label) => {
    visibleSinceRef.current = new Map(
      [...visibleSinceRef.current].filter(([id]) => id !== label.id),
    );
    if (encounteredLabelIdsRef.current.has(label.id)) return;
    encounteredLabelIdsRef.current.add(label.id);
    onLabelEncountered(label);
  }, [onLabelEncountered]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
    if ((event.target as Element).closest("button")) return;
    resetSemanticOverscroll();
    stopWheelAnimation();
    cancelCameraAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    previousPointersRef.current.set(event.pointerId, point);
  };

  const updateAtlasCategoryHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!atlasOverviewMode || !atlasDistricts || !viewerInteractiveRef.current) return;
    if (pointersRef.current.has(event.pointerId)) return;
    const target = event.target instanceof Element ? event.target : null;
    const hoveredWord = target?.closest<HTMLElement>("[data-atlas-category-word=\"true\"]");
    if (hoveredWord?.dataset.categoryId === atlasCategoryId) {
      cancelAtlasCategoryClose();
      return;
    }
    const viewportBounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: event.clientX - viewportBounds.left,
      y: event.clientY - viewportBounds.top,
    };
    const hoveredDistrict = atlasDistricts.find((district) => {
      const bounds = projectSceneRectToScreen(district, cameraRef.current);
      return point.x >= bounds.x
        && point.x <= bounds.x + bounds.width
        && point.y >= bounds.y
        && point.y <= bounds.y + bounds.height;
    });
    if (hoveredDistrict) {
      activateAtlasCategory(hoveredDistrict.id);
    } else if (atlasCategoryId) {
      scheduleAtlasCategoryClose();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      updateAtlasCategoryHover(event);
      return;
    }
    if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
    const current = { x: event.clientX, y: event.clientY };
    const previous = previousPointersRef.current.get(event.pointerId) ?? current;
    pointersRef.current.set(event.pointerId, current);

    const points = [...pointersRef.current.entries()];
    if (points.length === 1) {
      resetSemanticOverscroll();
      const camera = cameraRef.current;
      cameraRef.current = {
        ...camera,
        x: camera.x + current.x - previous.x,
        y: camera.y + current.y - previous.y,
      };
      requestCameraFrame();
    } else if (points.length === 2) {
      const [[firstId, first], [secondId, second]] = points;
      const previousFirst = previousPointersRef.current.get(firstId) ?? first;
      const previousSecond = previousPointersRef.current.get(secondId) ?? second;
      const previousDistance = Math.max(1, distance(previousFirst, previousSecond));
      const nextDistance = Math.max(1, distance(first, second));
      const bounds = event.currentTarget.getBoundingClientRect();
      const previousCenter = {
        x: (previousFirst.x + previousSecond.x) / 2 - bounds.left,
        y: (previousFirst.y + previousSecond.y) / 2 - bounds.top,
      };
      const nextCenter = {
        x: (first.x + second.x) / 2 - bounds.left,
        y: (first.y + second.y) / 2 - bounds.top,
      };
      zoomAt(
        nextCenter,
        nextDistance / previousDistance,
        previousCenter,
      );
    }
    previousPointersRef.current.set(event.pointerId, current);
  };

  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    resetSemanticOverscroll();
    pointersRef.current.delete(event.pointerId);
    previousPointersRef.current.delete(event.pointerId);
    if (viewerInteractive && !committingRef.current) scheduleNavigationCheck();
  };

  const viewportCenter = () => {
    const viewport = viewportRef.current;
    return viewport
      ? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      : { x: 0, y: 0 };
  };

  const requestSteppedZoom = (factor: number) => {
    const point = viewportCenter();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      zoomAt(point, factor);
    } else {
      queueWheelZoom(point, factor);
    }
  };

  return (
    <section
      className="viewer-shell"
      data-testid={transitionPhase === "active" ? undefined : "scene-transition-layer"}
      data-phase={transitionPhase === "active" ? undefined : transitionPhase}
      data-scene-id={transitionPhase === "active" ? undefined : scene.id}
      data-interaction-locked={String(!viewerInteractive)}
      aria-hidden={transitionPhase !== "active" ? true : undefined}
      inert={!viewerInteractive ? true : undefined}
      aria-label={transitionPhase === "active" ? `${scene.title} vocabulary scene` : undefined}
    >
      <div
        ref={viewportRef}
        className="world-viewport"
        style={{ "--scene-backdrop-image": `url(${activeSceneAsset.src})` } as CSSProperties}
        data-testid="world-viewport"
        data-active-asset-tier={renderSceneAssetLoadState.activeTier}
        data-active-asset-src={activeSceneAsset.src}
        data-desired-asset-tier={renderSceneAssetLoadState.desiredTier}
        aria-busy={interactionLocked}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={scheduleAtlasCategoryClose}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onLostPointerCapture={releasePointer}
      >
        <div
          ref={surfaceRef}
          className="scene-surface"
          data-zoom-level={effectiveInitialView ? sceneLodLevel(effectiveInitialView.camera.scale) : 0}
          data-lod-level={effectiveInitialView ? sceneLodLevel(effectiveInitialView.camera.scale) : 0}
          data-scene-scale={effectiveInitialView?.camera.scale.toFixed(3)}
          style={{
            width: scene.width,
            height: scene.height,
            ...(effectiveInitialView ? {
              transform: `translate3d(${effectiveInitialView.camera.x}px, ${effectiveInitialView.camera.y}px, 0) scale(${effectiveInitialView.camera.fit * effectiveInitialView.camera.scale})`,
              "--scene-zoom": effectiveInitialView.camera.scale.toFixed(3),
            } : {}),
          } as CSSProperties}
        >
          <img
            className="scene-art"
            src={activeSceneAsset.src}
            data-asset-tier={renderSceneAssetLoadState.activeTier}
            alt=""
            draggable={false}
          />
          {continuousTile ? (
            <div
              key={`${continuousTile.portal.id}:${continuousTile.scene.id}`}
              ref={setContinuousTileNode}
              className="scene-continuous-tile"
              data-testid="scene-continuous-tile"
              data-child-scene={continuousTile.scene.id}
              data-portal-id={continuousTile.portal.id}
              data-state={continuousTileState}
              data-direction={continuousTileDirection}
              data-progress={continuousTileDirection === "back" ? "1.000" : undefined}
              aria-hidden="true"
              style={{
                left: continuousTile.portal.x,
                top: continuousTile.portal.y,
                width: continuousTile.portal.width,
                height: continuousTile.portal.height,
                "--tile-progress": continuousTileDirection === "back" ? "1.000" : undefined,
              } as CSSProperties}
            >
              <img
                className="scene-continuous-tile-art"
                data-testid="scene-continuous-tile-art"
                src={continuousTile.scene.asset}
                alt=""
                draggable={false}
              />
            </div>
          ) : null}
        </div>
        <div
          ref={interactionLayerRef}
          className="scene-interaction-layer"
          data-testid="scene-interaction-layer"
          data-coordinate-space="screen"
          data-positioned={String(interactionPositioned)}
          data-motion-frozen={String(motionFrozen)}
          inert={motionFrozen ? true : undefined}
          aria-hidden={motionFrozen ? true : undefined}
        >
          {atlasOverviewMode && atlasDistricts && !selectedLabelId ? (
            <div
              className="atlas-category-layer"
              data-testid="atlas-category-layer"
              data-active-category={atlasCategoryId ?? "none"}
              aria-label="首页大类词汇"
            >
              {atlasDistricts.map((district) => {
                const active = atlasCategoryId === district.id;
                return (
                  <div
                    key={district.id}
                    ref={(element) => setAtlasCategoryElement(district.id, element)}
                    className="atlas-category-region"
                    data-testid="atlas-category"
                    data-category-id={district.id}
                    data-active={String(active)}
                    data-positioned="false"
                  >
                    <button
                      type="button"
                      className="atlas-category-hit"
                      data-testid="atlas-category-hit"
                      data-category-id={district.id}
                      aria-expanded={active}
                      aria-label={`${district.label}，${district.translation}，${district.labelCount} 个词。悬停显示该区锚点词`}
                      disabled={!viewerInteractive}
                      onFocus={() => activateAtlasCategory(district.id)}
                      onBlur={scheduleAtlasCategoryClose}
                      onClick={() => activateAtlasCategory(district.id)}
                    >
                      <span className="atlas-category-nameplate" data-testid="atlas-category-nameplate">
                        <strong>{district.label}</strong>
                        {meaningVisible ? <small>{district.translation}</small> : null}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div
            ref={focusedDetailZoneRef}
            className="scene-zone-focus-region"
            data-testid="scene-zone-focus-region"
            data-active="false"
            aria-hidden="true"
          />
          {!atlasOverviewMode ? (
          <div className="vocabulary-zoom-layer" aria-label="可放大显示更多词的区域">
            {vocabularyZoomCues.map((cue) => {
              const anchor = labelsById.get(cue.anchorLabelId);
              return (
                <button
                  key={cue.id}
                  type="button"
                  className="vocabulary-zoom-cue"
                  data-testid="scene-vocabulary-cue"
                  data-cue-id={cue.id}
                  data-cue-kind="vocabulary"
                  data-cue-source={cue.source}
                  data-detail-zone-id={cue.detailZoneId}
                  data-zoom-action="reveal-words"
                  data-active="false"
                  data-next-label-id={cue.anchorLabelId}
                  data-next-lod={cue.minLod}
                  data-hidden-word-count="0"
                  data-zone-title={cue.title}
                  data-zone-translation={cue.translation}
                  data-target-scale={cue.targetScale}
                  data-authored-target-scale={cue.targetScale}
                  data-focus-x={cue.focusX}
                  data-focus-y={cue.focusY}
                  data-visual-region={anchor?.sourceVisualRegion ?? cue.id}
                  data-anchor-x={cue.x}
                  data-anchor-y={cue.y}
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label={cue.title ? `放大${cue.title}，显示更多词` : "放大此区域，显示更多词"}
                  onClick={(event) => {
                    event.stopPropagation();
                    focusVocabularyTarget(
                      cue.anchorLabelId,
                      event.currentTarget,
                      event.detail === 0,
                    );
                  }}
                >
                  <span className="vocabulary-zoom-cue-icon" aria-hidden="true">Aa</span>
                  <span className="vocabulary-zoom-cue-copy">
                    <span>放大 ·</span>
                    <strong className="vocabulary-zoom-cue-count">
                      {cue.title
                        ? meaningVisible && cue.translation
                          ? `${cue.title} · ${cue.translation}`
                          : cue.title
                        : "更多词"}
                    </strong>
                  </span>
                </button>
              );
            })}
          </div>
          ) : null}
          {scene.portals.map((portal) => (
            <div
              key={portal.id}
              className="scene-hotspot-region"
              data-portal-id={portal.id}
              data-portal-entry-mode={sceneUsesWheelPortalEntry(scene.id) ? "zoom-or-click" : "click"}
              data-visual-region={portal.sourceVisualRegion}
              data-candidate="false"
            >
              <button
                type="button"
                className="scene-hotspot"
                data-testid="scene-hotspot"
                data-cue-kind="portal"
                data-zoom-action="enter-scene"
                data-cue-state="idle"
                data-candidate="false"
                data-progress="0.000"
                data-portal-id={portal.id}
                data-target-scene={portal.childSceneId}
                aria-describedby={previewPortal?.id === portal.id ? `portal-preview-${scene.id}` : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  beginPortalTransition(portal, event.detail === 0 ? "keyboard" : "pointer");
                }}
                onFocus={() => {
                  showPortalPreview(portal);
                  requestCameraFrame();
                  requestContinuousTile(portal);
                }}
                onBlur={() => {
                  if (portalCandidateRef.current?.id !== portal.id) {
                    showPortalPreview(null);
                    requestCameraFrame();
                  }
                }}
                onPointerEnter={() => {
                  showPortalPreview(portal);
                  requestCameraFrame();
                  requestContinuousTile(portal);
                }}
                onPointerLeave={() => {
                  if (portalCandidateRef.current?.id !== portal.id) {
                    showPortalPreview(null);
                    requestCameraFrame();
                  }
                }}
                aria-label={`进入 ${portalTargetTitles[portal.childSceneId] ?? portal.label}${meaningVisible && portal.translation ? `，${portal.translation}` : ""}`}
              >
                <span className="scene-hotspot-icon" aria-hidden="true">↘</span>
                <span className="scene-hotspot-caption" aria-hidden="true">
                  {sceneUsesWheelPortalEntry(scene.id) ? "继续放大" : "点击进入"}
                  {" · "}{portalTargetTitles[portal.childSceneId] ?? portal.label}
                </span>
              </button>
            </div>
          ))}
        </div>
        <div
          ref={labelLayerRef}
          className="label-layer"
          data-testid="scene-label-layer"
          data-coordinate-space="screen"
          data-motion-frozen={String(motionFrozen)}
          inert={motionFrozen ? true : undefined}
          aria-hidden={motionFrozen ? true : undefined}
          aria-label="Words in this scene"
        >
          {scene.labels.filter((label) => (
            (!atlasOverviewMode || (!selectedLabelId && activeAtlasLabelIds.has(label.id)))
            && transitionPhase !== "outgoing" && mountedLabelIds.has(label.id)
          )).map((label) => {
            const semanticStyle = labelSemanticStyles.get(label.id);
            return (
              <button
                key={label.id}
                ref={(element) => {
                  if (element) {
                    labelElementsRef.current.set(label.id, element);
                    if (label.id === pendingKeyboardFocusLabelIdRef.current) {
                      requestCameraFrame();
                    }
                  } else labelElementsRef.current.delete(label.id);
                }}
                type="button"
                className="word-label"
                data-testid={atlasOverviewMode ? "atlas-category-word" : "word-label"}
                data-atlas-category-word={atlasOverviewMode ? "true" : undefined}
                data-category-id={atlasOverviewMode ? atlasCategoryId ?? undefined : undefined}
                data-label-id={label.id}
                data-word={label.word}
                data-lod={label.minLevel ?? 0}
                data-anchor-x={label.x}
                data-anchor-y={label.y}
                data-semantic-group={semanticStyle?.semanticGroup}
                data-palette-index={semanticStyle?.paletteIndex}
                data-visible="false"
                data-interactive="false"
                data-adaptive="false"
                tabIndex={-1}
                aria-hidden="true"
                onClick={(event) => {
                  event.stopPropagation();
                  if (atlasOverviewMode) setAtlasCategoryId(null);
                  selectedLabelIdRef.current = label.id;
                  requestCameraFrame();
                  reportClickedLabel(label);
                  onSelectWord(label);
                }}
                onPointerEnter={atlasOverviewMode ? cancelAtlasCategoryClose : undefined}
                onPointerLeave={atlasOverviewMode ? scheduleAtlasCategoryClose : undefined}
                onFocus={atlasOverviewMode ? cancelAtlasCategoryClose : undefined}
              >
                {label.word}
                {meaningVisible ? (
                  <span className="word-translation" data-testid="word-translation">
                    {label.translation}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="viewport-vignette" aria-hidden="true" />
      </div>

      {viewerInteractive ? (
        <>
          <button
            ref={vocabularySummaryRef}
            type="button"
            className="scene-vocabulary-summary"
            data-testid="scene-vocabulary-summary"
            data-active="false"
            data-hidden-word-count="0"
            data-next-batch-count="0"
            data-next-lod="none"
            hidden
            aria-label="继续放大，显示下一批词"
            onClick={(event) => {
              event.stopPropagation();
              const nextLabelId = event.currentTarget.dataset.nextLabelId;
              if (!nextLabelId) return;
              focusVocabularyTarget(
                nextLabelId,
                event.currentTarget,
                event.detail === 0,
              );
            }}
          >
            继续放大 · <strong>显示下一批词</strong>
          </button>
          <aside className="scene-cue-legend" data-testid="scene-cue-legend" aria-label="缩放提示图例">
            <span><i data-kind="portal" aria-hidden="true" />
              {sceneUsesWheelPortalEntry(scene.id) ? "继续放大进入细节" : "点击入口进入细节"}
            </span>
            <span><i data-kind="vocabulary" aria-hidden="true" />
              {atlasOverviewMode ? "悬停大区查看锚点词" : "放大显示更多词"}
            </span>
          </aside>
          <p ref={vocabularyAnnouncementRef} className="sr-only" aria-live="polite" />
          <div className="zoom-controls" aria-label="Zoom controls">
            <button type="button" onClick={() => requestSteppedZoom(1.34)} aria-label="Zoom in">＋</button>
            <button type="button" onClick={() => requestSteppedZoom(0.74)} aria-label="Zoom out">−</button>
            <button type="button" onClick={resetCamera} aria-label="Fit scene">⌂</button>
          </div>
          {previewPortal ? (
            <div
              id={`portal-preview-${scene.id}`}
              ref={previewRef}
              className="scene-portal-preview"
              data-testid="scene-portal-preview"
              data-target-scene={previewPortal.childSceneId}
              data-portal-id={previewPortal.id}
              data-phase={previewPhase}
              data-progress="0.000"
              aria-live="polite"
            >
              <span className="portal-progress-ring" aria-hidden="true"><span>＋</span></span>
              <span className="portal-preview-copy">
                <small>{sceneUsesWheelPortalEntry(scene.id)
                  ? previewPhase === "armed" ? "正在展开细节" : "继续放大"
                  : "点击进入细节"}</small>
                <strong>{portalTargetTitles[previewPortal.childSceneId] ?? previewPortal.label}</strong>
                {meaningVisible && previewPortal.translation ? <em>{previewPortal.translation}</em> : null}
              </span>
            </div>
          ) : (
            <p
              ref={sceneWordProgressRef}
              className="gesture-hint"
              data-testid="scene-word-progress"
              data-current="0"
              data-total={scene.labels.length}
              data-remaining={scene.labels.length}
              data-camera-mode="zoom-or-pan"
              data-next-plane="spatial"
            >
              当前视野 0 / 本景 {scene.labels.length} 个词 · 放大或拖动探索
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
