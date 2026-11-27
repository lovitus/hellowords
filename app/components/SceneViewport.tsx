"use client";

/* SVG scene slices intentionally remain external images so their drawing nodes do not enter the app DOM. */
/* eslint-disable @next/next/no-img-element */

import {
  Fragment,
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
  buildPortalCueProtectedRegions,
  COMPACT_PORTAL_CUE_SIZE,
  portalCueProtectedRegion,
  portalMarkerOffset,
  portraitPortalButtonSize,
  buildSceneLabelMountWindow,
  buildVocabularyCueRevealStateFromSummary,
  buildVocabularyRevealSummary,
  consolidateVocabularyCueBatches,
  computeScenePlacements,
  advanceParentExitHysteresis,
  createParentExitHysteresisState,
  DEFAULT_PARENT_EXIT_HYSTERESIS_POLICY,
  DEFAULT_PORTAL_HYSTERESIS_POLICY,
  LABEL_ENCOUNTER_OPACITY,
  interpolateZoomCamera,
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
  vocabularyCueFocusPoint,
  type Label,
  type Portal as ScenePortal,
  type Scene,
  type ResolvedSceneAsset,
  type SceneAssetLoadState,
  type SceneDetailZone,
  type SceneLabelLayoutItem,
  type SceneLabelProtectedRegion,
} from "../domain";
import { getScenePresentation } from "../lib/scene-presentation";
import { decodedSceneAssetCache } from "../lib/decoded-scene-asset-cache";
import {
  hitPaintedLabel,
  paintLabelCanvas,
  releaseLabelCanvas,
  type LabelPaintState,
  type PaintedLabel,
} from "../lib/label-canvas";

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
  /** The top-left mini-map is folded to its title pill, freeing room for words. */
  minimapCollapsed?: boolean;
}

export type ScenePortalNavigator = (
  portalId: string,
  source: "pointer" | "keyboard",
) => boolean;

export interface SceneFocusTarget {
  readonly kind: "region" | "word";
  readonly zoneId?: string;
  readonly atlasDistrictId?: string;
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
  /** Resting view used as the first frame for reduced motion. */
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

type LabelView = Pick<SceneViewportSnapshot, "camera" | "viewportWidth" | "viewportHeight"> & {
  readonly meaningVisible: boolean;
  readonly pointerLabelId?: string;
  readonly placementLabelId: string | null;
};

type PaintedSceneView = LabelPaintState & { camera: Camera; placementLabelId: string | null };

function stationaryLabelView(state: PaintedSceneView, pointerLabelId?: string): LabelView {
  return {
    camera: state.camera, viewportWidth: state.width, viewportHeight: state.height,
    meaningVisible: state.meaningVisible, placementLabelId: state.placementLabelId, pointerLabelId,
  };
}

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

type FrameSize = Pick<Scene, "width" | "height">;

function centeredSceneCamera(
  sceneSize: FrameSize,
  viewportSize: FrameSize,
  scale: number,
): SceneViewportCamera {
  const fit = fitScale(
    sceneSize.width,
    sceneSize.height,
    viewportSize.width,
    viewportSize.height,
  );
  return {
    fit,
    scale,
    x: (viewportSize.width - sceneSize.width * fit * scale) / 2,
    y: (viewportSize.height - sceneSize.height * fit * scale) / 2,
  };
}

export function fittedSceneCamera(sceneSize: FrameSize, viewportSize: FrameSize): SceneViewportCamera {
  return centeredSceneCamera(sceneSize, viewportSize, viewportSize.height > viewportSize.width * 1.25 ? 1.3 : 1);
}

export function fullyFittedSceneCamera(sceneSize: FrameSize, viewportSize: FrameSize): SceneViewportCamera {
  return centeredSceneCamera(sceneSize, viewportSize, 1);
}

function usesPortraitPhotoBounds(scene: Scene, viewport: FrameSize): boolean {
  return (scene.id === "apartment" || scene.parentId === "apartment"
    || scene.id === "baggage-drop-station" || scene.id === "baggage-claim"
    || scene.id === "baggage-service-desk" || scene.id === "suitcase-packing-table" || scene.id === "hospital"
    || scene.id === "aircraft-cabin" || scene.id === "passenger-seat-row" || scene.id === "inflight-meal-tray"
    || scene.id === "office-break-room" || scene.parentId === "office-break-room"
    || scene.id === "radiology-suite" || scene.id === "pathology-lab" || scene.id === "hospital-inpatient-bedspace"
    || scene.id === "hospital-pharmacy" || scene.id === "tablet-counting-bench"
    || scene.id === "office-building" || scene.id === "conference-room" || scene.id === "video-conferencing-console")
    && viewport.width <= 560 && viewport.height > viewport.width;
}

export function sceneEntryCamera(scene: Scene, viewport: FrameSize): SceneViewportCamera {
  if (scene.id === "office-building" && usesPortraitPhotoBounds(scene, viewport)) {
    // Frame the row of entrances from reception to the service core. The
    // first and last buttons need a full touch target inside the photograph.
    const centers = scene.portals.map(portal => portal.x + portal.width / 2);
    const left = Math.min(...centers);
    const right = Math.max(...centers);
    const full = fullyFittedSceneCamera(scene, viewport);
    if (right > left) {
      const effectiveScale = Math.min(
        (viewport.width - COMPACT_PORTAL_CUE_SIZE) / (right - left),
        viewport.height / scene.height,
      );
      if (effectiveScale > full.fit) {
        const camera = centeredSceneCamera(scene, viewport, effectiveScale / full.fit);
        const x = (viewport.width - (left + right) * effectiveScale) / 2;
        return { ...camera, x: Math.max(viewport.width - scene.width * effectiveScale, Math.min(0, x)) };
      }
    }
    return full;
  }
  // The apartment is a floor plan: keep all four rooms in view. Inside a
  // room, show more of the furnishings while leaving space for the map and controls.
  if ((scene.parentId === "apartment" || scene.id === "conference-room") && usesPortraitPhotoBounds(scene, viewport)) {
    const fit = fitScale(scene.width, scene.height, viewport.width, viewport.height);
    const scale = Math.max(1, viewport.height * 0.6 / (scene.height * fit));
    return centeredSceneCamera(scene, viewport, scale);
  }
  // Keep both foreground microphones and the touch panel in the first phone
  // view. Fit still reveals the chairs and cabinets at the edges of the room.
  if (scene.id === "video-conferencing-console" && usesPortraitPhotoBounds(scene, viewport)) {
    return centeredSceneCamera(scene, viewport, 1.4);
  }
  return fullyFittedSceneCamera(scene, viewport);
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

// Quartic ease-out has the previous 52ms initial response and a finite end.
const WHEEL_SETTLE_MS = 208;
const PORTAL_AIM_SLOP = 16;
type ZoomInput = "pinch" | "wheel" | "step";

// Project only the visible part of this image axis. The remaining displacement
// is affine in the source coordinate, so its largest magnitude is at an edge.
function visibleAxisTravel(
  origin: number, targetOrigin: number, scale: number, targetScale: number,
  imageExtent: number, viewportExtent: number,
): number {
  const first = Math.max(0, -origin / scale);
  const last = Math.min(imageExtent, (viewportExtent - origin) / scale);
  const translation = targetOrigin - origin;
  const dilation = targetScale - scale;
  return Math.max(Math.abs(translation + first * dilation), Math.abs(translation + last * dilation));
}

/**
 * Per-user direction: the "还剩 N 个词" hints are off. Every word that has a
 * free, non-overlapping callout is shown directly, so no count-style cue is
 * needed to reach it. Set to true only to bring the old cue system back.
 */
const VOCABULARY_HINTS_ENABLED = false;
const EXIT_SCALE = DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale;
const HANDOFF_WHEEL_QUIET_MS = 180;
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

/**
 * Footprint of the translucent top-left mini-map. Words avoid only this
 * rectangle; a collapsed map reserves just its title pill.
 */
function minimapFootprint(width: number, collapsed: boolean): { right: number; bottom: number } {
  const phone = width <= 560;
  const compact = width <= 900;
  if (collapsed) {
    return {
      right: Math.min(width, phone ? 170 : 180),
      bottom: 52,
    };
  }
  // Measured rendered panel (stage coordinates, see globals.css .scene-minimap):
  // desktop 236x155, compact 320x151, phone 220x127, each with a few px margin.
  return {
    right: Math.min(width, phone ? 240 : compact ? 340 : 262),
    bottom: phone ? 144 : compact ? 160 : 178,
  };
}

export function buildViewerChromeProtectedRegions(
  width: number,
  height: number,
  wordIndexOpen = false,
  minimapCollapsed = false,
): SceneLabelProtectedRegion[] {
  const phone = width <= 560;
  const minimap = minimapFootprint(width, minimapCollapsed);
  const regions: SceneLabelProtectedRegion[] = [{
    left: 0,
    right: minimap.right,
    top: 0,
    bottom: minimap.bottom,
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
  const minimap = minimapFootprint(viewport.width, false);
  return bounds.x < minimap.right
    && bounds.x + bounds.width > 0
    && bounds.y < minimap.bottom
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

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cameraAnimationProgress(frameTime: number, startedAt: number, duration: number): number {
  // A callback can receive the start time of a frame already in progress
  // when the gesture started. Keep that frame at the starting camera.
  return Math.max(0, Math.min(1, (frameTime - startedAt) / duration));
}

function sceneLodLevel(scale: number): 0 | 1 | 2 | 3 | 4 {
  if (scale < 0.82) return 0;
  if (scale < 1.2) return 1;
  if (scale < 1.65) return 2;
  if (scale < 2.3) return 3;
  return 4;
}

function portraitOverviewLabelIds(scene: Scene, viewport: FrameSize, scale: number) {
  if (scene.portraitOverviewLabelIds && usesPortraitPhotoBounds(scene, viewport) && sceneLodLevel(scale) <= 2) {
    return getScenePresentation(scene).portraitOverviewLabelIds;
  }
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

// A directly rendered scene needs the same bounded seed for SSR and hydration.
// Navigation already supplies a real camera, so it can skip this provisional layout.
const INITIAL_LABEL_MOUNT_VIEWPORT = { width: 390, height: 780, compact: true } as const;
function initialSceneLabelMountWindow(scene: Scene, meaningVisible: boolean, selectedLabelId: string | null) {
  const viewport = INITIAL_LABEL_MOUNT_VIEWPORT;
  const camera = sceneEntryCamera(scene, viewport);
  const layout = computeScenePlacements(scene.labels, camera, viewport, meaningVisible, {
    photoSize: usesPortraitPhotoBounds(scene, viewport) ? scene : undefined,
    priorityLabelIds: portraitOverviewLabelIds(scene, viewport, camera.scale),
    selectedLabelId,
    protectedRegions: buildViewerChromeProtectedRegions(viewport.width, viewport.height),
    portalCueRegions: buildPortalCueProtectedRegions(scene.portals, camera, viewport),
  });
  return buildSceneLabelMountWindow(scene.labels, layout, viewport, { selectedLabelId });
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
  onPrefetchScene,
  initialView,
  onCameraFrame,
  onMotionFrozenChange,
  onPortalNavigatorReady,
  onFocusTargetNavigatorReady,
  atlasDistricts,
  focusedDetailZoneId = null,
  wordIndexOpen = false,
  minimapCollapsed = false,
}: SceneViewportProps) {
  const reducedContinuityAtMount = Boolean(
    initialView
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const effectiveInitialView = continuityViewForMotion(initialView, reducedContinuityAtMount);
  // React seeds the surface on mount. Clearing the handoff must not remove
  // the transform and scale that the camera has since painted on this node.
  const [initialSurfaceCamera] = useState(() => effectiveInitialView?.camera);
  const atlasOverviewMode = scene.id === "world-map" && Boolean(atlasDistricts?.length);
  const transitionPhaseRef = useRef(transitionPhase);
  const [atlasCategoryId, setAtlasCategoryId] = useState<string | null>(null);
  const sceneLabelIds = useMemo(
    () => atlasOverviewMode ? new Set<string>() : new Set(scene.labels.map((label) => label.id)),
    [atlasOverviewMode, scene.labels],
  );
  const [mountedLabelIds, setMountedLabelIds] = useState<ReadonlySet<string>>(
    () => atlasOverviewMode || initialView
      ? sceneLabelIds
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
  const minimapCollapsedRef = useRef(minimapCollapsed);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const attachLabelCanvas = useCallback((node: HTMLCanvasElement | null) => {
    const previous = labelCanvasRef.current;
    if (previous && previous !== node) releaseLabelCanvas(previous);
    labelCanvasRef.current = node;
  }, []);
  const hoveredLabelIdRef = useRef<string | null>(null);
  const labelPaintStateRef = useRef<PaintedSceneView | null>(null);
  const stationaryWordViewRef = useRef<LabelView | null>(null);
  const tapStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressPortalClickRef = useRef(false);
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
  const pinchFrameRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const cameraAnimationRef = useRef<number | null>(null);
  const wheelAnimationRef = useRef<number | null>(null);
  const wheelTargetRef = useRef<Camera | null>(null);
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
  const retainManualZoomSlotsRef = useRef(false);
  const lastNavigationRef = useRef(0);
  const zoomFocusRef = useRef<Point | null>(null);
  const zoomDirectionRef = useRef<"in" | "out" | null>(null);
  const portalCandidateRef = useRef<ScenePortal | null>(null);
  const portalGestureRef = useRef<{
    input: ZoomInput;
    origin: Point;
    portal: ScenePortal | undefined;
    lastInputAt: number;
  } | null>(null);
  const previewPortalRef = useRef<ScenePortal | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const vocabularyAnnouncementRef = useRef<HTMLParagraphElement>(null);
  const vocabularySummaryRef = useRef<HTMLButtonElement>(null);
  const sceneWordProgressRef = useRef<HTMLParagraphElement>(null);
  const atlasCategoryElementsRef = useRef(new Map<string, HTMLDivElement>());
  const pendingAtlasHoverRef = useRef<{ timer: number; districtId: string | null } | null>(null);
  const previewPhaseRef = useRef<"preview" | "armed">("preview");
  const committingRef = useRef(false);
  const parentZoomPrefetchRef = useRef(false);
  const initialViewRef = useRef(effectiveInitialView);
  const initializedSceneRef = useRef<string | null>(null);
  const fittedViewportSizeRef = useRef<(FrameSize & { followEntry: boolean }) | null>(null);
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
  const { labelsById, labelSemanticStyles, vocabularyZoomCues } = getScenePresentation(scene);
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
  const sceneWordCandidates = atlasOverviewMode ? activeAtlasLabels : scene.labels;
  const labelsForRender = useMemo(() => {
    if (transitionPhase === "outgoing") return [];
    return sceneWordCandidates.filter((label) => mountedLabelIds.has(label.id));
  }, [mountedLabelIds, sceneWordCandidates, transitionPhase]);

  const cancelAtlasHover = useCallback(() => {
    if (!pendingAtlasHoverRef.current) return;
    window.clearTimeout(pendingAtlasHoverRef.current.timer);
    pendingAtlasHoverRef.current = null;
  }, []);

  const activateAtlasCategory = useCallback((districtId: string) => {
    cancelAtlasHover();
    setAtlasCategoryId(districtId);
  }, [cancelAtlasHover]);

  const scheduleAtlasHover = useCallback((districtId: string | null) => {
    if (pendingAtlasHoverRef.current?.districtId === districtId) return;
    cancelAtlasHover();
    const timer = window.setTimeout(() => {
      pendingAtlasHoverRef.current = null;
      setAtlasCategoryId(districtId);
    }, 160);
    pendingAtlasHoverRef.current = { timer, districtId };
  }, [cancelAtlasHover]);

  const setAtlasCategoryElement = useCallback((districtId: string, element: HTMLDivElement | null) => {
    if (element) atlasCategoryElementsRef.current.set(districtId, element);
    else atlasCategoryElementsRef.current.delete(districtId);
  }, []);

  const positionAtlasCategories = useCallback((
    camera: Camera, viewportWidth: number, viewportHeight: number,
    chromeRegions: readonly SceneLabelProtectedRegion[],
  ) => {
    if (!atlasOverviewMode || !atlasDistricts) return;
    const occupied: SceneLabelProtectedRegion[] = [];
    const selectedId = selectedLabelIdRef.current;
    const selected = selectedId && activeAtlasDistrict?.labelIds.includes(selectedId)
      ? labelsById.get(selectedId) : undefined;
    const scale = camera.fit * camera.scale;
    const anchor = selected ? { x: camera.x + selected.x * scale, y: camera.y + selected.y * scale } : null;
    const gap = viewportWidth <= 900 ? 10 : 3;
    // Read the six intrinsic hit-box sizes before writing any projected positions.
    const titles = atlasDistricts.map(({ id }) => {
      const button = atlasCategoryElementsRef.current.get(id)?.firstElementChild;
      return button instanceof HTMLButtonElement
        ? { button, width: button.offsetWidth, height: button.offsetHeight } : null;
    });
    for (const [index, district] of atlasDistricts.entries()) {
      const element = atlasCategoryElementsRef.current.get(district.id);
      if (!element) continue;
      const bounds = projectSceneRectToScreen(district, camera);
      const title = titles[index];
      if (title) {
        const defaultX = bounds.x + bounds.width / 2;
        const defaultY = bounds.y + bounds.height / 2;
        const halfWidth = title.width / 2 + gap;
        const halfHeight = title.height / 2 + gap;
        let centerX = defaultX;
        let centerY = defaultY;
        // Use the empty margin on the outside of each atlas row. Keep the title
        // within its own column and clear of the minimap and navigation controls.
        const upperRow = district.y + district.height / 2 < scene.height / 2;
        const marginY = upperRow ? bounds.y - halfHeight : bounds.y + bounds.height + halfHeight;
        const firstX = Math.max(bounds.x, 0) + title.width / 2;
        const lastX = Math.min(bounds.x + bounds.width, viewportWidth) - title.width / 2;
        if (firstX <= lastX && marginY >= halfHeight && marginY + halfHeight <= viewportHeight) {
          for (const x of [Math.max(firstX, Math.min(lastX, defaultX)), lastX, firstX]) {
            const covered = chromeRegions.some(region =>
              x + halfWidth > region.left && x - halfWidth < region.right
              && marginY + halfHeight > region.top && marginY - halfHeight < region.bottom);
            if (covered) continue;
            centerX = x;
            centerY = marginY;
            break;
          }
        }
        if (anchor && Math.abs(anchor.x - centerX) < halfWidth && Math.abs(anchor.y - centerY) < halfHeight) {
          // Put the nearest edge of the title clear of the photographed object.
          centerY = anchor.y >= centerY ? anchor.y - halfHeight : anchor.y + halfHeight;
        }
        const shift = centerY - defaultY;
        setStylePropertyIfChanged(title.button.style, "margin-left", centerX !== defaultX ? `${(centerX - defaultX).toFixed(2)}px` : "");
        setStylePropertyIfChanged(title.button.style, "margin-top", shift ? `${shift.toFixed(2)}px` : "");
        occupied.push({
          left: centerX - halfWidth, right: centerX + halfWidth,
          top: centerY - halfHeight, bottom: centerY + halfHeight,
        });
      }
      setStylePropertyIfChanged(element.style, "left", `${bounds.x.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "top", `${bounds.y.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "width", `${Math.max(0, bounds.width).toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "height", `${Math.max(0, bounds.height).toFixed(2)}px`);
      setDatasetValueIfChanged(element, "positioned", "true");
    }
    return occupied;
  }, [activeAtlasDistrict, atlasDistricts, atlasOverviewMode, labelsById, scene.height]);

  useEffect(() => () => {
    cancelAtlasHover();
  }, [cancelAtlasHover]);

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

  const viewerInteractive = transitionPhase === "active" && !interactionLocked && !motionFrozen;
  const viewerInteractiveRef = useRef(viewerInteractive);
  const meaningVisibleRef = useRef(meaningVisible);
  const canEncounterWords = viewerInteractive && !wordIndexOpen;
  const updateLabelDwell = useCallback(function advance(visibleIds: Iterable<string>) {
    if (encounterDwellRef.current !== null) {
      clearTimeout(encounterDwellRef.current);
      encounterDwellRef.current = null;
    }
    const dwell = advanceLabelDwell(
      visibleSinceRef.current, visibleIds, encounteredLabelIdsRef.current, performance.now(),
    );
    visibleSinceRef.current = dwell.visibleSince;
    if (dwell.newlyEncounteredIds.length) {
      const encountered = dwell.newlyEncounteredIds.flatMap((id) => {
        const label = labelsById.get(id);
        if (!label) return [];
        encounteredLabelIdsRef.current.add(id);
        return [label];
      });
      if (encountered.length) onLabelsEncountered(encountered);
    }
    if (dwell.nextCheckInMs !== null) {
      // A camera frame replaces this set when the visible words change. While
      // the picture is still, only their remaining reading time can change.
      encounterDwellRef.current = setTimeout(() => {
        encounterDwellRef.current = null;
        advance(visibleSinceRef.current.keys());
      }, Math.ceil(dwell.nextCheckInMs));
    }
  }, [labelsById, onLabelsEncountered]);

  useLayoutEffect(() => {
    if (canEncounterWords) return () => updateLabelDwell([]);
  }, [canEncounterWords, updateLabelDwell]);

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

  const reconcileSceneAssetForCamera = useCallback((
    camera: Camera,
    devicePixelRatio: number,
    allowHighTier: boolean,
  ) => {
    const current = sceneAssetRuntimeRef.current;
    if (current.sceneId !== scene.id) return;
    const transition = reconcileSceneAssetLoad(
      scene,
      current.loadState,
      camera,
      devicePixelRatio,
      allowHighTier,
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
    (camera: Camera, viewportWidth?: number, viewportHeight?: number): Camera => {
      const viewport = viewportRef.current;
      if (!viewport) return camera;
      const frameWidth = viewportWidth ?? viewport.clientWidth;
      const frameHeight = viewportHeight ?? viewport.clientHeight;
      const width = scene.width * camera.fit * camera.scale;
      const height = scene.height * camera.fit * camera.scale;
      const margin = Math.min(frameWidth, frameHeight) * 0.18;
      const minX = Math.min(margin, frameWidth - width - margin);
      const maxX = Math.max(frameWidth - width - margin, margin);
      const minY = Math.min(margin, frameHeight - height - margin);
      const maxY = Math.max(frameHeight - height - margin, margin);
      return {
        ...camera,
        x: Math.min(maxX, Math.max(minX, camera.x)),
        y: Math.min(maxY, Math.max(minY, camera.y)),
      };
    },
    [scene.height, scene.width],
  );

  const applyCamera = useCallback((wheelFrame?: { camera: Camera; width: number; height: number; dpr: number }) => {
    frameRef.current = null;
    const surface = surfaceRef.current;
    const labelLayer = labelLayerRef.current;
    const interactionLayer = interactionLayerRef.current;
    const viewport = viewportRef.current;
    if (!surface || !labelLayer || !interactionLayer || !viewport) return;
    // Read layout once before this frame starts mutating styles. Re-reading
    // viewport geometry after the surface/overlays have been written forces a
    // synchronous layout in every camera frame.
    const viewportWidth = wheelFrame?.width ?? viewport.clientWidth;
    const viewportHeight = wheelFrame?.height ?? viewport.clientHeight;
    const camera = wheelFrame?.camera ?? clampCamera(cameraRef.current, viewportWidth, viewportHeight);
    cameraRef.current = camera;
    const maximumScale = maximumSceneCameraScale(camera.fit);
    const effectiveScale = camera.fit * camera.scale;
    const zoomLevel = sceneLodLevel(camera.scale);
    const sceneScaleValue = camera.scale.toFixed(3);
    setStylePropertyIfChanged(
      surface.style,
      "transform",
      `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${effectiveScale})`,
    );
    setDatasetValueIfChanged(surface, "zoomLevel", String(zoomLevel));
    setDatasetValueIfChanged(surface, "lodLevel", String(zoomLevel));
    setDatasetValueIfChanged(surface, "sceneScale", sceneScaleValue);
    setDatasetValueIfChanged(surface, "maximumScale", maximumScale.toFixed(3));
    const activePortal = portalCandidateRef.current ?? previewPortalRef.current;
    const enterScale = activePortal?.enterScale ?? 3.6;
    const portalProgress = activePortal
      ? portalRevealProgress(camera.scale, enterScale)
      : 0;
    const devicePixelRatio = Math.max(1, wheelFrame?.dpr ?? (window.devicePixelRatio || 1));
    // Once a matching child preview covers most of the portal, high-resolution
    // parent art is immediately hidden beneath that tile. Avoid decoding and
    // rasterizing it for the final approach and handoff; ordinary inspection
    // still regains automatic high-tier selection as soon as the preview recedes.
    const tile = continuousTileRef.current;
    const tileMatchesPortal = Boolean(
      tile
      && activePortal?.id === tile.dataset.portalId
      && activePortal?.childSceneId === tile.dataset.childScene,
    );
    const previewTileOwnsCrop = Boolean(
      tile
      && tileMatchesPortal
      && tile.dataset.state === "preview"
      && tile.dataset.direction === "forward"
      && portalProgress >= PORTAL_ARMED_PROGRESS
    );
    const activeHandoffOwnsCrop = Boolean(
      tile
      && tile.dataset.state === "active"
      && (committingRef.current || continuitySettlingRef.current)
    );
    const handoffTileOwnsCrop = previewTileOwnsCrop || activeHandoffOwnsCrop;
    const allowHighTier = !(handoffTileOwnsCrop);
    // While returning through a child tile the enlarged parent camera is
    // transient. Choose the raster that the settled view actually needs.
    const returningToParent = initialView?.direction === "back"
      && (initializedSceneRef.current !== scene.id || continuitySettlingRef.current);
    const assetCamera = returningToParent
      ? initialView.settledCamera ?? fittedSceneCamera(scene, { width: viewportWidth, height: viewportHeight })
      : camera;
    reconcileSceneAssetForCamera(
      assetCamera,
      devicePixelRatio,
      allowHighTier,
    );

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
    syncMotionFrozenLayer(labelLayer, frameMotionFrozen);
    syncMotionFrozenLayer(interactionLayer, frameMotionFrozen);
    // During a scene handoff these overlays are hidden by the transition
    // layer. Keep the camera snapshot current, but avoid resolving collisions
    // and rewriting hundreds of label/portal styles that cannot be painted.
    if (frameMotionFrozen || transitionPhaseRef.current !== "active") {
      if (encounterDwellRef.current !== null) updateLabelDwell([]);
      onCameraFrame?.({
        sceneId: scene.id,
        camera: { ...camera },
        viewportWidth,
        viewportHeight,
      });
      return;
    }
    const protectedRegions = buildViewerChromeProtectedRegions(
      viewportWidth, viewportHeight, wordIndexOpen, minimapCollapsedRef.current,
    );
    const titleRegions = positionAtlasCategories(camera, viewportWidth, viewportHeight, protectedRegions);

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
    const labelViewport = {
      width: viewportWidth,
      height: viewportHeight,
      compact: viewportWidth <= 900,
    };
    const portalCueRegions: SceneLabelProtectedRegion[] = [];
    let portalOverlapsMinimap = false;
    for (const region of interactionLayer.querySelectorAll<HTMLElement>(".scene-hotspot-region")) {
      const portal = scene.portals.find((candidate) => candidate.id === region.dataset.portalId);
      const hotspot = region.querySelector<HTMLElement>(".scene-hotspot");
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
        const markerOffset = portalMarkerOffset(portal, camera.fit * camera.scale, labelViewport);
        const size = portraitPortalButtonSize(portal, camera.fit * camera.scale, labelViewport);
        if (portal.portraitMarker?.scaleToObject) {
          setDatasetValueIfChanged(region, "sizedMarker", String(size !== undefined));
          setStylePropertyIfChanged(region.style, "--portal-button-size", size === undefined ? "" : `${size}px`);
        }
        // The button and its label exclusion share the same snapped grid origin.
        const cue = portalCueProtectedRegion(
          (left + right) / 2 + markerOffset.x, (top + bottom) / 2 + markerOffset.y, labelViewport,
          size === undefined ? undefined : size + 2,
        );
        if (cue) portalCueRegions.push(cue);
        if (portal.portraitMarker && hotspot) {
          setStylePropertyIfChanged(hotspot.style, "left", `${markerOffset.x.toFixed(2)}px`);
          setStylePropertyIfChanged(hotspot.style, "top", `${markerOffset.y.toFixed(2)}px`);
        }
        const captionWidth = Math.min(
          viewportWidth <= 700 ? 180 : 190,
          Math.max(0, viewportWidth - 24),
        );
        const portalCenterX = bounds.x + bounds.width / 2 + markerOffset.x;
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

    const activeElement = document.activeElement;
    const focusedLabelId = activeElement instanceof HTMLButtonElement
      && activeElement.dataset.labelId
      && labelElementsRef.current.get(activeElement.dataset.labelId) === activeElement
      ? activeElement.dataset.labelId
      : null;
    let pendingKeyboardFocusLabelId = pendingKeyboardFocusLabelIdRef.current;
    const wordView = stationaryWordViewRef.current;
    if (wordView && (
      wordView.camera.x !== camera.x || wordView.camera.y !== camera.y
      || wordView.camera.scale !== camera.scale || wordView.camera.fit !== camera.fit
      || wordView.viewportWidth !== viewportWidth || wordView.viewportHeight !== viewportHeight
      || wordView.meaningVisible !== meaningVisibleRef.current
    )) {
      stationaryWordViewRef.current = null;
    }
    const stationary = stationaryWordViewRef.current;
    const retainedFocusLabelId = stationary ? null : focusedLabelId;
    // Reading a painted word must keep its slot when the card opens and closes.
    // Index selections and a changed view still get normal placement priority.
    const placementLabelId = retainedFocusLabelId ?? pendingKeyboardFocusLabelId
      ?? (stationary ? stationary.placementLabelId : selectedLabelIdRef.current);
    if (titleRegions?.length) protectedRegions.push(...titleRegions);
    const layout = computeScenePlacements(
      sceneWordCandidates,
      camera,
      labelViewport,
      meaningVisibleRef.current,
      {
        photoSize: usesPortraitPhotoBounds(scene, labelViewport) ? scene : undefined,
        selectedLabelId: placementLabelId,
        preserveAtlasAnchors: atlasOverviewMode && !activeFocusedDetailZone,
        priorityLabelIds: activeFocusedDetailZone
          ? new Set(activeFocusedDetailZone.labelIds)
          : portraitOverviewLabelIds(scene, labelViewport, camera.scale),
        preferredOffsets: !labelViewport.compact && !atlasOverviewMode && retainManualZoomSlotsRef.current
          ? labelPlacementOffsetsRef.current
          : undefined,
        protectedRegions,
        portalCueRegions,
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
    // Only visible desktop words need a claim on the next zoom frame.
    const previousSlots = labelPlacementOffsetsRef.current;
    previousSlots.clear();
    if (!labelViewport.compact && !atlasOverviewMode) {
      for (const item of layout) {
        if (item.interactive) previousSlots.set(item.id, item);
      }
    }
    // Words are painted by the canvas, so every word of an ordinary scene keeps
    // its keyboard mirror mounted. A camera-driven window would commit a React
    // update (re-rendering every mirror) each time a word crossed the edge.
    // The root atlas keeps the bounded window because it has 1,289 words.
    const nextMountedLabelIds = atlasOverviewMode
      ? buildSceneLabelMountWindow(
        sceneWordCandidates,
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
      )
      : sceneLabelIds;
    if (nextMountedLabelIds !== mountedLabelIdsRef.current
      && !sameSceneLabelMountWindow(mountedLabelIdsRef.current, nextMountedLabelIds)) {
      mountedLabelIdsRef.current = nextMountedLabelIds;
      pendingLabelWindowPaintRef.current = true;
      setMountedLabelIds(nextMountedLabelIds);
    }
    const byId = new Map<string, SceneLabelLayoutItem>();
    for (const item of layout) byId.set(item.id, item);
    let visibleCount = 0;
    let emergingCount = 0;
    const dwellEligibleLabelIds: string[] = [];
    for (const item of layout) {
      const ownsFocus = item.id === retainedFocusLabelId;
      const opacity = ownsFocus ? Math.max(1, item.opacity) : item.opacity;
      if (opacity >= LABEL_ENCOUNTER_OPACITY) visibleCount += 1;
      else if (opacity > 0.025) emergingCount += 1;
    }
    // Every placed word is painted from the layout result, including words
    // whose DOM mirror is not mounted. The DOM buttons only carry state for
    // keyboard and assistive technology; they no longer move per frame.
    const cameraScale = camera.fit * camera.scale;
    const paintedLabels: PaintedLabel[] = [];
    for (const item of layout) {
      const label = labelsById.get(item.id);
      if (!label || !Number.isFinite(item.screenX) || !Number.isFinite(item.screenY)) continue;
      const ownsFocus = item.id === retainedFocusLabelId;
      const opacity = ownsFocus ? Math.max(1, item.opacity) : item.opacity;
      if (opacity <= 0.025) continue;
      const interactive = !wordIndexOpen && viewerInteractiveRef.current && (ownsFocus || item.interactive);
      if (interactive && opacity >= LABEL_ENCOUNTER_OPACITY) dwellEligibleLabelIds.push(item.id);
      paintedLabels.push({
        id: item.id,
        label,
        word: label.word,
        translation: label.translation ?? "",
        anchorX: camera.x + label.x * cameraScale,
        anchorY: camera.y + label.y * cameraScale,
        centerX: item.screenX,
        centerY: item.screenY,
        width: item.width,
        height: item.height,
        // The word index is a deliberate reading surface; hide the spatial
        // words for its entire lifetime.
        opacity: wordIndexOpen ? 0 : opacity,
        interactive,
      });
    }
    const paintState = {
      camera,
      placementLabelId,
      labels: paintedLabels,
      width: viewportWidth,
      height: viewportHeight,
      meaningVisible: meaningVisibleRef.current,
      focusedId: focusedLabelId,
      hoveredId: hoveredLabelIdRef.current,
    };
    labelPaintStateRef.current = paintState;
    paintLabelCanvas(labelCanvasRef.current, paintState, labelSemanticStyles);
    // The canvas owns every visible word, so its readable count is the only
    // truthful on-screen count. Tests read this attribute instead of the
    // transparent keyboard mirrors.
    if (labelCanvasRef.current) {
      setDatasetValueIfChanged(
        labelCanvasRef.current,
        "readableCount",
        String(paintedLabels.filter((label) => label.interactive && label.opacity >= 0.52).length),
      );
      // The painted geometry stays on the element object (not in the DOM) so
      // browser tests can aim real pointer clicks at a word's drawn position.
      (labelCanvasRef.current as HTMLCanvasElement & { paintedLabels?: PaintedLabel[] })
        .paintedLabels = paintedLabels;
    }
    for (const [labelId, element] of labelElementsRef.current) {
      const item = byId.get(labelId);
      const ownsFocus = labelId === retainedFocusLabelId;
      const opacity = ownsFocus ? Math.max(1, item?.opacity ?? 0) : item?.opacity ?? 0;
      // The word index is a deliberate reading surface. Hide the spatial
      // pills for its entire lifetime so the panel can never flash over a
      // stale label layout while the next protected camera frame is queued.
      const interactive = !wordIndexOpen
        && viewerInteractiveRef.current
        && (ownsFocus || Boolean(item?.interactive));
      const visibleValue = String(!wordIndexOpen && opacity > 0.025);
      const interactiveValue = String(interactive);
      const adaptiveValue = String(Boolean(item?.adaptive));
      const hiddenValue = String(!interactive);
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
      // Per-user direction: no "本景还有 N 个词" count in ordinary scenes. The
      // home atlas keeps a one-line instruction for the current selection.
      sceneWordProgress.hidden = wordIndexOpen || !(atlasOverviewMode || VOCABULARY_HINTS_ENABLED);
      const total = scene.labels.length;
      const remaining = atlasOverviewMode ? total : Math.max(0, total - visibleCount);
      const maximumZoom = camera.scale >= maximumScale - 0.02;
      const action = atlasOverviewMode
        ? (visibleCount > 0 ? "点圆点或单词看释义" : "点分区名查看单词")
        : remaining === 0
          ? maximumZoom
            ? "本景词汇已全部在当前视野，已到最大倍率"
            : "本景词汇已全部在当前视野"
          : maximumZoom
            ? `拖动探索其余 ${remaining} 个词，已到最大倍率`
            : `放大或拖动探索其余 ${remaining} 个词`;
      const compact = viewportWidth <= 560;
      const text = atlasOverviewMode
        ? action
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
          ? "选择分区查看区内单词，选择实物圆点或词牌查看释义。放大可见更多。"
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

    if (canEncounterWords) updateLabelDwell(dwellEligibleLabelIds);

    setDatasetValueIfChanged(interactionLayer, "sceneScale", sceneScaleValue);
    if (!interactionPositionedRef.current) {
      interactionPositionedRef.current = true;
      setDatasetValueIfChanged(interactionLayer, "positioned", "true");
      setInteractionPositioned(true);
    }
    onCameraFrame?.({
      sceneId: scene.id,
      camera: { ...camera },
      viewportWidth,
      viewportHeight,
    });
    // Disabled hint controls retain their initial hidden state. In particular,
    // a wheel or pinch frame shouldn't compute a batch of words for them.
    if (!VOCABULARY_HINTS_ENABLED) return;

    const visibleItemsInPlacementOrder = layout
      .filter((item) => item.interactive)
      .sort((first, second) => first.placementOrder - second.placementOrder);
    revealedLabelIdsRef.current = prioritizeCurrentLabelOrder(
      revealedLabelIdsRef.current,
      visibleItemsInPlacementOrder,
    );
    const revealSummary = buildVocabularyRevealSummary(
      sceneWordCandidates,
      camera.scale,
      maximumScale,
      LABEL_ENCOUNTER_OPACITY,
      revealedLabelIdsRef.current,
    );
    const globallyHiddenIds = new Set(revealSummary.hiddenLabels.map((label) => label.id));
    const cueCandidates = (atlasOverviewMode ? [] : vocabularyZoomCues).flatMap((cue) => {
      if (cue.source === "authored-zone") {
        const state = buildVocabularyCueRevealStateFromSummary(
          cue,
          revealSummary,
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
      const hidden = cue.labelIds
        .map((id) => labelsById.get(id))
        .filter((label): label is Label => Boolean(label))
        .filter((label) => globallyHiddenIds.has(label.id));
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
    const cueLimit = VOCABULARY_HINTS_ENABLED ? sceneVocabularyCueLimit(viewportWidth) : 0;
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

    const summaryElement = vocabularySummaryRef.current;
    if (summaryElement) {
      const leadingLabel = revealSummary.nextLabels[0];
      const summaryActive = VOCABULARY_HINTS_ENABLED && Boolean(
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
  }, [atlasOverviewMode, canEncounterWords, clampCamera, continuousTileDirection, continuousTileState, initialView, labelSemanticStyles, labelsById, onCameraFrame, positionAtlasCategories, reconcileSceneAssetForCamera, scene, sceneLabelIds, sceneWordCandidates, showPortalPreview, updateLabelDwell, vocabularyZoomCues, wordIndexOpen]);

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

  // A search starts its camera animation while the word index is still open.
  // Every frame, including the last one, must paint with the current UI state.
  const framePainterRef = useRef(applyCamera);
  const requestCameraFrame = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(() => framePainterRef.current());
  }, []);
  useLayoutEffect(() => {
    framePainterRef.current = applyCamera;
    requestCameraFrame();
  }, [applyCamera, requestCameraFrame]);

  useLayoutEffect(() => {
    const previousPhase = transitionPhaseRef.current;
    transitionPhaseRef.current = transitionPhase;
    if (previousPhase !== transitionPhase && transitionPhase === "active") {
      requestCameraFrame();
    }
  }, [requestCameraFrame, transitionPhase]);

  useLayoutEffect(() => {
    focusedDetailZoneValueRef.current = focusedDetailZone;
    requestCameraFrame();
  }, [focusedDetailZone, requestCameraFrame]);

  // The mini-map reserves less room when collapsed, so words must re-place
  // as soon as the user folds or unfolds it.
  useLayoutEffect(() => {
    if (minimapCollapsedRef.current === minimapCollapsed) return;
    minimapCollapsedRef.current = minimapCollapsed;
    requestCameraFrame();
  }, [minimapCollapsed, requestCameraFrame]);

  // Category regions mount after the first scene frame. A layout effect gives
  // each region a concrete camera rectangle before the browser paints, so the
  // home map never flashes empty hit targets or waits for a pointer move.
  useLayoutEffect(() => {
    if (atlasOverviewMode) requestCameraFrame();
  }, [atlasCategoryId, atlasDistricts, atlasOverviewMode, requestCameraFrame]);

  const stopWheelAnimation = useCallback((keepPortalAim = false) => {
    if (!keepPortalAim) portalGestureRef.current = null;
    if (wheelAnimationRef.current !== null) {
      cancelAnimationFrame(wheelAnimationRef.current);
      wheelAnimationRef.current = null;
    }
    wheelTargetRef.current = null;
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

  const updateZoomDirection = useCallback((next: "in" | "out" | null, manual = false) => {
    // On either leg of a wheel gesture, recheck the last painted slots
    // against the new camera before looking on the other side of an object.
    retainManualZoomSlotsRef.current = manual && next !== null;
    const previous = zoomDirectionRef.current;
    if (!manual && shouldResetLabelPlacementMemory(previous, next)) {
      labelPlacementOffsetsRef.current.clear();
    }
    zoomDirectionRef.current = next;
  }, []);

  useEffect(() => {
    resetParentExitHysteresis();
  }, [resetParentExitHysteresis, scene.id]);

  const resetCamera = useCallback((framing: "fit" | "entry" = "fit") => {
    const viewport = viewportRef.current;
    if (!viewport || committingRef.current) return;
    resetParentExitHysteresis();
    stationaryWordViewRef.current = null;
    labelPlacementOffsetsRef.current.clear();
    stopWheelAnimation();
    cancelCameraAnimation();
    const size = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    };
    let fittedCamera = fittedSceneCamera(scene, size);
    const fitPhoto = usesPortraitPhotoBounds(scene, size);
    if (fitPhoto || scene.id === "airport") {
      fittedCamera = framing === "entry" ? sceneEntryCamera(scene, size) : fullyFittedSceneCamera(scene, size);
    }
    fittedViewportSizeRef.current = { ...size, followEntry: framing === "entry" };
    viewport.toggleAttribute("data-portrait-room", fitPhoto);
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
    zoomFocusRef.current = { x: size.width / 2, y: size.height / 2 };
    updateZoomDirection(null);
    portalCandidateRef.current = null;
    // ResizeObserver can fire just after keyboard focus enters a portal. Keep
    // that focus-driven target cue instead of erasing it during the initial
    // fit pass; the Fit button and ordinary resizes still clear stale cues.
    const portalHasFocus = document.activeElement instanceof HTMLElement
      && document.activeElement.matches(".scene-hotspot");
    if (!portalHasFocus && !continuityView) showPortalPreview(null);
    requestCameraFrame();
  }, [cancelCameraAnimation, reducedContinuityAtMount, requestCameraFrame, resetParentExitHysteresis, scene, showPortalPreview, stopWheelAnimation, updateZoomDirection]);

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
    // The three explicit compositor yields below already preserve the exact
    // portal-cover frame. Keep the visible approach brisk; the independent
    // 180ms wheel guard still prevents the entering gesture from reversing.
    const duration = source === "zoom" ? 90 : readiness === "warm" ? 110 : 130;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const linear = cameraAnimationProgress(now, startedAt, duration);
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
    // Only the zoom gesture can nominate a portal. A minimap focus can
    // center the same object at entry scale while the user reads its words.
    const candidate = portalCandidateRef.current;
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
  }, [beginPortalTransition, onExitScene, resetParentExitHysteresis, scene.id, scene.parentId]);

  const scheduleNavigationCheck = useCallback(() => {
    if (navigationFrameRef.current !== null) return;
    navigationFrameRef.current = requestAnimationFrame(() => {
      navigationFrameRef.current = null;
      evaluateNavigation();
    });
  }, [evaluateNavigation]);

  const portalForZoom = useCallback((input: ZoomInput, camera: Camera, point: Point, previousPoint = point) => {
    const now = performance.now();
    const gesture = portalGestureRef.current;
    const continuing = gesture && gesture.input === input && input !== "step"
      && (input === "pinch" || now - gesture.lastInputAt < DEFAULT_PARENT_EXIT_HYSTERESIS_POLICY.gestureGapMs);
    // Camera clamping can move a narrow belt away from stationary fingers.
    // Measure intentional retargeting from the original aim, not the last sample.
    if (continuing && distance(gesture.origin, point) <= PORTAL_AIM_SLOP) {
      gesture.lastInputAt = now;
      return gesture.portal;
    }
    const origin = continuing || distance(previousPoint, point) > PORTAL_AIM_SLOP ? point : previousPoint;
    const portal = portalAtScreenPoint(scene.portals, camera, origin);
    portalGestureRef.current = { input, origin, portal, lastInputAt: now };
    return portal;
  }, [scene.portals]);

  const zoomAt = useCallback(
    (point: Point, factor: number, input: ZoomInput, previousPoint: Point = point) => {
      if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
      stopWheelAnimation(true);
      cancelCameraAnimation();
      const camera = cameraRef.current;
      const minimum = scene.parentId ? 0.68 : 0.9;
      const nextScale = Math.min(
        maximumSceneCameraScale(camera.fit),
        Math.max(minimum, camera.scale * factor),
      );
      sampleParentExitHysteresis(factor, nextScale);
      // At either scale limit the input can still nominate a portal or request
      // a parent exit. Only a stationary, neutral sample has nothing to do.
      if (factor === 1 && point.x === previousPoint.x && point.y === previousPoint.y) return;
      const ratio = nextScale / camera.scale;
      const nextCamera = {
        ...camera,
        scale: nextScale,
        x: point.x - (previousPoint.x - camera.x) * ratio,
        y: point.y - (previousPoint.y - camera.y) * ratio,
      };
      cameraRef.current = nextCamera;
      zoomFocusRef.current = point;
      if (factor > 1) updateZoomDirection("in", true);
      else if (factor < 1) updateZoomDirection("out", true);
      else updateZoomDirection(null);
      if (factor > 1) {
        const portal = portalForZoom(input, camera, point, previousPoint);
        if (portal) {
          portalCandidateRef.current = portal;
          showPortalPreview(portal);
          if (scene.parentId && nextScale < 2.65) void onPrefetchScene(portal.childSceneId);
        } else {
          portalCandidateRef.current = null;
          showPortalPreview(null);
        }
      } else if (factor < 1) {
        portalGestureRef.current = null;
        portalCandidateRef.current = null;
        if (nextScale < 2.45) showPortalPreview(null);
      } else {
        const portal = portalForZoom(input, camera, point, previousPoint);
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
      if (input === "pinch") evaluateNavigation();
      else scheduleNavigationCheck();
    },
    [cancelCameraAnimation, evaluateNavigation, portalForZoom, sampleParentExitHysteresis, viewerInteractive, onPrefetchScene, requestCameraFrame, requestContinuousTile, scene.parentId, scheduleNavigationCheck, showPortalPreview, stopWheelAnimation, updateZoomDirection],
  );

  const queueWheelZoom = useCallback((point: Point, factor: number, input: "wheel" | "step") => {
    if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
    if (navigationFrameRef.current !== null) {
      cancelAnimationFrame(navigationFrameRef.current);
      navigationFrameRef.current = null;
    }
    cancelCameraAnimation();

    const base = wheelTargetRef.current ?? cameraRef.current;
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
    wheelTargetRef.current = target;
    zoomFocusRef.current = point;
    if (factor > 1) updateZoomDirection("in", true);
    else if (factor < 1) updateZoomDirection("out", true);

    if (factor > 1) {
      const portal = portalForZoom(input, cameraRef.current, point);
      if (portal) {
        portalCandidateRef.current = portal;
        showPortalPreview(portal);
        if (target.scale >= 2.65) requestContinuousTile(portal);
        else if (scene.parentId) void onPrefetchScene(portal.childSceneId);
      } else {
        portalCandidateRef.current = null;
        showPortalPreview(null);
      }
    } else if (factor < 1) {
      portalGestureRef.current = null;
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
    let motion: { from: Camera; to: Camera; startedAt: number } | null = null;
    let previousFrameTime: number | null = null;
    const animate = (now: number) => {
      const nextTarget = wheelTargetRef.current;
      const viewport = viewportRef.current;
      if (!nextTarget || committingRef.current || !viewport) {
        wheelAnimationRef.current = null;
        return;
      }
      const current = cameraRef.current;
      if (!motion || motion.to.scale !== nextTarget.scale
        || motion.to.x !== nextTarget.x || motion.to.y !== nextTarget.y) {
        motion = { from: current, to: nextTarget, startedAt: previousFrameTime ?? now - 16 };
      }
      previousFrameTime = now;
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const target = clampCamera(nextTarget, width, height);
      const currentScale = current.fit * current.scale;
      const targetScale = target.fit * target.scale;
      const dx = visibleAxisTravel(current.x, target.x, currentScale, targetScale, scene.width, width);
      const dy = visibleAxisTravel(current.y, target.y, currentScale, targetScale, scene.height, height);
      // Both axis maxima meet at a corner of the visible image rectangle.
      const progress = cameraAnimationProgress(now, motion.startedAt, WHEEL_SETTLE_MS);
      const settled = progress === 1 || Math.hypot(dx, dy) * dpr < 1;
      const camera = settled ? target : clampCamera({
        ...interpolateZoomCamera(motion.from, target, 1 - (1 - progress) ** 4),
        fit: target.fit,
      }, width, height);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      framePainterRef.current({ camera, width, height, dpr });
      scheduleNavigationCheck();
      if (!settled) {
        wheelAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      wheelAnimationRef.current = null;
      wheelTargetRef.current = null;
    };
    wheelAnimationRef.current = requestAnimationFrame(animate);
  }, [cancelCameraAnimation, clampCamera, onPrefetchScene, portalForZoom, requestContinuousTile, sampleParentExitHysteresis, scene.height, scene.parentId, scene.width, scheduleNavigationCheck, showPortalPreview, updateZoomDirection, viewerInteractive]);

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
      const linear = cameraAnimationProgress(now, startedAt, duration);
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

    if (focusTarget.atlasDistrictId) activateAtlasCategory(focusTarget.atlasDistrictId);
    stopWheelAnimation();
    cancelCameraAnimation();
    resetParentExitHysteresis();
    portalCandidateRef.current = null;
    showPortalPreview(null);
    updateZoomDirection("in");
    stationaryWordViewRef.current = null;
    labelPlacementOffsetsRef.current.clear();
    zoomFocusRef.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    lastNavigationRef.current = performance.now();

    const start = { ...cameraRef.current };
    const viewportSize = { width: viewport.clientWidth, height: viewport.clientHeight };
    // On a narrow phone, a room may already open beyond a word's authored
    // scale. Give object searches a closer view without compounding repeat searches.
    const detailScale = focusTarget.kind === "word" && usesPortraitPhotoBounds(scene, viewportSize)
      ? sceneEntryCamera(scene, viewportSize).scale * 1.2 : 1;
    let targetScale = Math.min(
      maximumSceneCameraScale(start.fit),
      Math.max(start.scale, focusTarget.targetScale, detailScale),
    );
    const focusedZone = scene.detailZones?.find(({ id }) => id === focusTarget.zoneId);
    // The state update that marks a zone active lands after this pointer event,
    // while the camera animation can already be producing frames. Mirror the
    // event's exact zone into the mutable frame ref immediately so the first
    // focused frame promotes and mounts that crop's labels instead of briefly
    // laying out the previous (or null) zone.
    focusedDetailZoneValueRef.current = focusedZone ?? null;
    if (focusTarget.kind === "region" && focusedZone && focusedZone.labelIds.length > 1) {
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
      const progress = cameraAnimationProgress(now, startedAt, duration);
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
  }, [activateAtlasCategory, cancelCameraAnimation, clampCamera, labelsById, requestCameraFrame, resetParentExitHysteresis, scene, showPortalPreview, stopWheelAnimation, updateZoomDirection, viewerInteractive]);

  useEffect(() => {
    if (!onFocusTargetNavigatorReady) return;
    onFocusTargetNavigatorReady(focusSceneTarget);
    return () => onFocusTargetNavigatorReady(null);
  }, [focusSceneTarget, onFocusTargetNavigatorReady]);

  useEffect(() => {
    const view = stationaryWordViewRef.current;
    const state = labelPaintStateRef.current;
    if (selectedLabelId && view?.pointerLabelId !== selectedLabelId) {
      stationaryWordViewRef.current = null;
    } else if (!selectedLabelId && !view && !atlasOverviewMode && state?.placementLabelId
      && state.placementLabelId === selectedLabelIdRef.current) {
      // Closing a search result leaves the reader on this photograph. Give
      // its dot the same slot until the camera, viewport or language changes.
      stationaryWordViewRef.current = stationaryLabelView(state);
    }
    selectedLabelIdRef.current = selectedLabelId && labelsById.has(selectedLabelId)
      ? selectedLabelId
      : null;
    requestCameraFrame();
  }, [atlasOverviewMode, labelsById, requestCameraFrame, selectedLabelId]);

  useEffect(() => {
    stationaryWordViewRef.current = null;
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
      resetCamera("entry");
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
          const duration = continuityView.direction === "back" ? 80 : 60;
          const animate = (now: number) => {
            const linear = cameraAnimationProgress(now, startedAt, duration);
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
    let pendingSize: FrameSize;
    const reconcileViewportSize = () => {
      resizeFrame = null;
      const cameraBusy = continuitySettlingRef.current
        || committingRef.current
        || wheelAnimationRef.current !== null
        || cameraAnimationRef.current !== null
        || pointersRef.current.size > 0;
      if (cameraBusy) {
        resizeFrame = requestAnimationFrame(reconcileViewportSize);
        return;
      }
      const previousSize = fittedViewportSizeRef.current;
      const size = pendingSize;
      if (!previousSize || !usesPortraitPhotoBounds(scene, previousSize) || !usesPortraitPhotoBounds(scene, size)) {
        resetCamera();
        return;
      }
      const current = cameraRef.current;
      const entry = sceneEntryCamera(scene, previousSize);
      if (
        previousSize.followEntry
        && Math.abs(current.scale - entry.scale) < 0.000001
        && Math.abs(current.x - entry.x) < 0.01
        && Math.abs(current.y - entry.y) < 0.01
      ) {
        resetCamera("entry");
        return;
      }
      // Fit and user-adjusted views retain their zoom and the scene point at
      // the viewport center as the available space changes.
      const fit = fitScale(scene.width, scene.height, size.width, size.height);
      const ratio = fit / current.fit;
      cameraRef.current = {
        ...current,
        fit,
        x: size.width / 2 - (previousSize.width / 2 - current.x) * ratio,
        y: size.height / 2 - (previousSize.height / 2 - current.y) * ratio,
      };
      fittedViewportSizeRef.current = { ...size, followEntry: false };
      requestCameraFrame();
    };
    const observer = new ResizeObserver(() => {
      const previousSize = fittedViewportSizeRef.current;
      if (previousSize?.width === viewport.clientWidth && previousSize.height === viewport.clientHeight) {
        if (resizeFrame === null) return;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
        pendingSize = previousSize;
      } else {
        pendingSize = { width: viewport.clientWidth, height: viewport.clientHeight };
        if (resizeFrame === null) resizeFrame = requestAnimationFrame(reconcileViewportSize);
      }
      viewport.toggleAttribute("data-portrait-room", usesPortraitPhotoBounds(scene, pendingSize));
    });
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    };
  }, [initialView, reducedContinuityAtMount, requestCameraFrame, resetCamera, resetParentExitHysteresis, scene]);

  useLayoutEffect(() => {
    const wasInteractive = viewerInteractiveRef.current;
    viewerInteractiveRef.current = viewerInteractive;
    if (meaningVisibleRef.current !== meaningVisible) retainManualZoomSlotsRef.current = false;
    meaningVisibleRef.current = meaningVisible;
    if (viewerInteractive && !wasInteractive) {
      // The first clickable frame must use the settled camera for both the
      // photograph and its words, even if an animation frame is still queued.
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      framePainterRef.current();
    } else {
      requestCameraFrame();
    }
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
        zoomAt(point, factor, "wheel");
      } else {
        queueWheelZoom(point, factor, "wheel");
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
      if (pinchFrameRef.current !== null) cancelAnimationFrame(pinchFrameRef.current);
      if (navigationFrameRef.current !== null) cancelAnimationFrame(navigationFrameRef.current);
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

  const paintWordFocus = useCallback((focusedId: string | null) => {
    const state = labelPaintStateRef.current;
    if (!state || state.focusedId === focusedId) return;
    const next = { ...state, focusedId };
    labelPaintStateRef.current = next;
    paintLabelCanvas(labelCanvasRef.current, next, labelSemanticStyles);
  }, [labelSemanticStyles]);

  const focusWord = useCallback((id: string) => {
    stationaryWordViewRef.current = null;
    if (atlasOverviewMode) cancelAtlasHover();
    const state = labelPaintStateRef.current;
    if (!pendingKeyboardFocusLabelIdRef.current
      && state?.labels.some((word) => word.id === id && word.interactive)) {
      // Tabbing between words already on the canvas must preserve their spatial
      // layout and tab order. Camera movement resumes normal focus retention.
      stationaryWordViewRef.current = stationaryLabelView(state);
      paintWordFocus(id);
    } else {
      requestCameraFrame();
    }
  }, [atlasOverviewMode, cancelAtlasHover, paintWordFocus, requestCameraFrame]);

  const blurWord = useCallback((event: React.FocusEvent<HTMLButtonElement>) => {
    const hadStationaryFocus = stationaryWordViewRef.current !== null;
    if (!stationaryWordViewRef.current?.pointerLabelId) stationaryWordViewRef.current = null;
    const next = event.relatedTarget;
    if (next instanceof HTMLButtonElement && next.dataset.labelId
      && labelElementsRef.current.get(next.dataset.labelId) === next) return;
    if (atlasOverviewMode) scheduleAtlasHover(null);
    if (hadStationaryFocus) paintWordFocus(null);
    else requestCameraFrame();
  }, [atlasOverviewMode, paintWordFocus, requestCameraFrame, scheduleAtlasHover]);

  const wordButtons = useMemo(() => labelsForRender.map((label) => {
    const semanticStyle = labelSemanticStyles.get(label.id);
    return (
      <button
        key={label.id}
        ref={(element) => {
          if (element) {
            labelElementsRef.current.set(label.id, element);
            if (label.id === pendingKeyboardFocusLabelIdRef.current) requestCameraFrame();
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
          if (atlasOverviewMode) cancelAtlasHover();
          selectedLabelIdRef.current = label.id;
          requestCameraFrame();
          reportClickedLabel(label);
          onSelectWord(label);
        }}
        onFocus={() => focusWord(label.id)}
        onBlur={blurWord}
      >
        {label.word}
        {meaningVisible ? (
          <span className="word-translation" data-testid="word-translation">
            {label.translation}
          </span>
        ) : null}
      </button>
    );
  }), [atlasCategoryId, atlasOverviewMode, blurWord, cancelAtlasHover, focusWord, labelSemanticStyles,
    labelsForRender, meaningVisible, onSelectWord, reportClickedLabel, requestCameraFrame]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
    if (pointersRef.current.size > 0) tapStartRef.current = null;
    const target = event.target as Element;
    const button = target.closest("button");
    if (button && !button.matches(".scene-hotspot")) return;
    stopWheelAnimation();
    portalCandidateRef.current = null;
    cancelCameraAnimation();
    // Keep the native button click target while its gestures bubble to the viewport.
    (button ? target : event.currentTarget).setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    tapStartRef.current = event.isPrimary && event.button === 0 && pointersRef.current.size === 0
      ? { pointerId: event.pointerId, ...point }
      : null;
    pointersRef.current.set(event.pointerId, point);
    previousPointersRef.current.set(event.pointerId, point);
  };

  const updateCanvasLabelHover = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = labelPaintStateRef.current;
    if (!state) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const hit = hitPaintedLabel(state.labels, event.clientX - bounds.left, event.clientY - bounds.top);
    const nextId = hit?.id ?? null;
    if (nextId === hoveredLabelIdRef.current) return;
    hoveredLabelIdRef.current = nextId;
    const next = { ...state, hoveredId: nextId };
    labelPaintStateRef.current = next;
    paintLabelCanvas(labelCanvasRef.current, next, labelSemanticStyles);
    event.currentTarget.style.cursor = hit ? "pointer" : "";
  };

  // Canvas words are hit-tested by pointer on release. Keyboard users reach the
  // focusable DOM mirror buttons, whose own click handlers stay in place.
  const activateCanvasLabel = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = labelPaintStateRef.current;
    if (!state) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const hit = hitPaintedLabel(state.labels, event.clientX - bounds.left, event.clientY - bounds.top, event.pointerType);
    if (!hit) return false;
    if (atlasOverviewMode) cancelAtlasHover();
    else {
      stationaryWordViewRef.current = stationaryLabelView(state, hit.id);
    }
    selectedLabelIdRef.current = hit.id;
    requestCameraFrame();
    reportClickedLabel(hit.label);
    onSelectWord(hit.label);
    return true;
  };

  const updateAtlasCategoryHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!atlasOverviewMode || !atlasDistricts || !viewerInteractiveRef.current) return;
    if (pointersRef.current.has(event.pointerId)) return;
    const target = event.target instanceof Element ? event.target : null;
    const nameplate = target?.closest<HTMLElement>(".atlas-category-hit");
    if (nameplate?.dataset.categoryId) {
      activateAtlasCategory(nameplate.dataset.categoryId);
      return;
    }
    if (target?.closest("button")) {
      scheduleAtlasHover(null);
      return;
    }
    if (atlasCategoryId && hoveredLabelIdRef.current) {
      cancelAtlasHover();
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
    const districtId = hoveredDistrict?.id ?? null;
    if (districtId === atlasCategoryId) {
      cancelAtlasHover();
    } else if (!atlasCategoryId && districtId) {
      activateAtlasCategory(districtId);
    } else {
      // A placed word can sit across the district boundary from its anchor.
      // Give the pointer time to reach it before replacing the word layer.
      scheduleAtlasHover(districtId);
    }
  };

  const applyPinch = () => {
    pinchFrameRef.current = null;
    const viewport = viewportRef.current;
    if (!viewport || pointersRef.current.size !== 2) return;
    const [[firstId, first], [secondId, second]] = pointersRef.current;
    const previousFirst = previousPointersRef.current.get(firstId) ?? first;
    const previousSecond = previousPointersRef.current.get(secondId) ?? second;
    const bounds = viewport.getBoundingClientRect();
    const midpoint = (a: Point, b: Point) => ({
      x: (a.x + b.x) / 2 - bounds.left,
      y: (a.y + b.y) / 2 - bounds.top,
    });
    zoomAt(
      midpoint(first, second),
      Math.max(1, distance(first, second)) / Math.max(1, distance(previousFirst, previousSecond)),
      "pinch",
      midpoint(previousFirst, previousSecond),
    );
    previousPointersRef.current.set(firstId, first);
    previousPointersRef.current.set(secondId, second);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) updateCanvasLabelHover(event);
    if (!pointersRef.current.has(event.pointerId)) {
      updateAtlasCategoryHover(event);
      return;
    }
    if (!viewerInteractive || committingRef.current || continuitySettlingRef.current) return;
    const current = { x: event.clientX, y: event.clientY };
    const start = tapStartRef.current;
    if (start && Math.hypot(current.x - start.x, current.y - start.y) > 6) tapStartRef.current = null;
    const previous = previousPointersRef.current.get(event.pointerId) ?? current;
    pointersRef.current.set(event.pointerId, current);

    if (pointersRef.current.size === 2) {
      // The browser reports each finger separately, even for one symmetric
      // pinch. Sample the pair together so a half-updated midpoint cannot retarget it.
      if (pinchFrameRef.current === null) pinchFrameRef.current = requestAnimationFrame(applyPinch);
      return;
    }
    if (pointersRef.current.size === 1) {
      const camera = cameraRef.current;
      if (current.x !== previous.x || current.y !== previous.y) retainManualZoomSlotsRef.current = false;
      cameraRef.current = {
        ...camera,
        x: camera.x + current.x - previous.x,
        y: camera.y + current.y - previous.y,
      };
      requestCameraFrame();
    }
    previousPointersRef.current.set(event.pointerId, current);
  };

  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    if (pointersRef.current.size === 2) {
      if (pinchFrameRef.current !== null) {
        cancelAnimationFrame(pinchFrameRef.current);
        pinchFrameRef.current = null;
        // Process a final movement that arrived in the same frame as lift.
        if (event.type === "pointerup") applyPinch();
      }
      if (event.type === "pointerup") evaluateNavigation();
      portalGestureRef.current = null;
      if (!committingRef.current) {
        portalCandidateRef.current = null;
        showPortalPreview(null);
      }
    }
    const start = tapStartRef.current;
    const isTap = event.type === "pointerup" && start?.pointerId === event.pointerId
      && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 6
      && viewerInteractive && !committingRef.current && !continuitySettlingRef.current && !event.defaultPrevented;
    const control = (event.target as Element).closest<HTMLElement>("button, a, input, textarea, select");
    if (control?.matches(".scene-hotspot")) {
      suppressPortalClickRef.current = !isTap;
      // Touch target adjustment can send a tap on a painted dot to a nearby
      // button. Use the actual pointer position while it is still available.
      if (isTap && event.pointerType === "touch" && control.closest('[data-sized-marker="true"]')) {
        const { left, top, right, bottom } = control.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
          suppressPortalClickRef.current = activateCanvasLabel(event);
        }
      }
    } else if (isTap && !control) {
      activateCanvasLabel(event);
    }
    tapStartRef.current = null;
    pointersRef.current.delete(event.pointerId);
    previousPointersRef.current.delete(event.pointerId);
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
      zoomAt(point, factor, "step");
    } else {
      queueWheelZoom(point, factor, "step");
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
        onPointerLeave={atlasOverviewMode ? (event) => {
          if (event.pointerType !== "touch") scheduleAtlasHover(null);
        } : undefined}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onLostPointerCapture={releasePointer}
      >
        <div
          ref={surfaceRef}
          className="scene-surface"
          data-zoom-level={initialSurfaceCamera ? sceneLodLevel(initialSurfaceCamera.scale) : 0}
          data-lod-level={initialSurfaceCamera ? sceneLodLevel(initialSurfaceCamera.scale) : 0}
          data-scene-scale={initialSurfaceCamera?.scale.toFixed(3)}
          style={{
            width: scene.width,
            height: scene.height,
            ...(initialSurfaceCamera ? {
              transform: `translate3d(${initialSurfaceCamera.x}px, ${initialSurfaceCamera.y}px, 0) scale(${initialSurfaceCamera.fit * initialSurfaceCamera.scale})`,
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
          {atlasOverviewMode && atlasDistricts ? (
            <div
              className="atlas-category-layer"
              data-testid="atlas-category-layer"
              data-active-category={atlasCategoryId ?? "none"}
              aria-label="首页大类词汇"
            >
              {atlasDistricts.map((district) => {
                const active = atlasCategoryId === district.id;
                return (
                  <Fragment key={district.id}>
                    <div
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
                        aria-label={`${district.label}，${district.translation}，${district.labelCount} 个词。选择后显示区内单词`}
                        disabled={!viewerInteractive}
                        onFocus={() => activateAtlasCategory(district.id)}
                        onBlur={() => scheduleAtlasHover(null)}
                        onClick={() => activateAtlasCategory(district.id)}
                      >
                        <span className="atlas-category-nameplate" data-testid="atlas-category-nameplate">
                          <strong>{district.label}</strong>
                          {meaningVisible ? <small>{district.translation}</small> : null}
                        </span>
                      </button>
                    </div>
                    {active ? wordButtons : null}
                  </Fragment>
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
                  if (event.detail !== 0 && suppressPortalClickRef.current) return;
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
          data-paint="canvas"
          data-motion-frozen={String(motionFrozen)}
          inert={motionFrozen ? true : undefined}
          aria-hidden={motionFrozen ? true : undefined}
          aria-label="Words in this scene"
        >
          <canvas ref={attachLabelCanvas} width={0} height={0} className="label-canvas" aria-hidden="true" />
          {atlasOverviewMode ? null : wordButtons}
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
              {atlasOverviewMode ? "圆点标出实物" : "放大显示更多词"}
            </span>
          </aside>
          <p ref={vocabularyAnnouncementRef} className="sr-only" aria-live="polite" />
          <div className="zoom-controls" aria-label="Zoom controls">
            <button type="button" onClick={() => requestSteppedZoom(1.34)} aria-label="Zoom in">＋</button>
            <button type="button" onClick={() => requestSteppedZoom(0.74)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => resetCamera()} aria-label="Fit scene">⌂</button>
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
              hidden={!VOCABULARY_HINTS_ENABLED}
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
