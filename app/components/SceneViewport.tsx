"use client";

/* SVG scene slices intentionally remain external images so their drawing nodes do not enter the app DOM. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceLabelDwell,
  buildPortalCueProtectedRegions,
  buildVocabularyRevealSummary,
  buildVocabularyZoomCues,
  consolidateVocabularyCueBatches,
  computeSceneLabelLayout,
  LABEL_ENCOUNTER_OPACITY,
  sceneLabelLod,
  sceneLabelRevealOpacity,
  smoothCameraTowards,
  type Label,
  type Portal as ScenePortal,
  type Scene,
} from "../domain";

interface SceneViewportProps {
  scene: Scene;
  meaningVisible: boolean;
  portalTargetTitles: Readonly<Record<string, string>>;
  transitionPhase?: "active" | "outgoing" | "incoming";
  interactionLocked?: boolean;
  onCommitScene: (
    sceneId: string,
    source: "zoom" | "pointer" | "keyboard",
  ) => boolean;
  onEnterScene: (
    sceneId: string,
    source: "zoom" | "pointer" | "keyboard",
  ) => Promise<boolean>;
  onExitScene: () => void;
  onLabelsEncountered: (labels: readonly Label[]) => void;
  onLabelEncountered: (label: Label) => void;
  onSelectWord: (label: Label) => void;
  onPrefetchScene: (sceneId: string) => void;
}

export interface SceneViewportCamera {
  x: number;
  y: number;
  scale: number;
  fit: number;
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

const ENTER_SETTLE_MS = 150;
const WHEEL_RESPONSE_MS = 52;
const WHEEL_POSITION_EPSILON = 0.08;
const WHEEL_SCALE_EPSILON = 0.00045;
const EXIT_SCALE = 0.82;
const MAX_SCALE = 4.15;
const PORTAL_PREVIEW_LEAD = 1;
const PORTAL_ARMED_PROGRESS = 0.82;
const VOCABULARY_REVEAL_SCALE: Readonly<Record<2 | 3 | 4, number>> = {
  2: 1.42,
  3: 2.2,
  4: 3.12,
};

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

export function SceneViewport({
  scene,
  meaningVisible,
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
}: SceneViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const interactionLayerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1, fit: 1 });
  const pointersRef = useRef(new Map<number, Point>());
  const previousPointersRef = useRef(new Map<number, Point>());
  const frameRef = useRef<number | null>(null);
  const cameraAnimationRef = useRef<number | null>(null);
  const wheelAnimationRef = useRef<number | null>(null);
  const wheelTargetRef = useRef<Camera | null>(null);
  const wheelFrameTimeRef = useRef<number | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encounterDwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSinceRef = useRef<ReadonlyMap<string, number>>(new Map());
  const encounteredLabelIdsRef = useRef(new Set<string>());
  const selectedLabelIdRef = useRef<string | null>(null);
  const lastNavigationRef = useRef(0);
  const zoomFocusRef = useRef<Point | null>(null);
  const zoomDirectionRef = useRef<"in" | "out" | null>(null);
  const portalCandidateRef = useRef<ScenePortal | null>(null);
  const previewPortalRef = useRef<ScenePortal | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const vocabularyAnnouncementRef = useRef<HTMLParagraphElement>(null);
  const vocabularySummaryRef = useRef<HTMLButtonElement>(null);
  const previewPhaseRef = useRef<"preview" | "armed">("preview");
  const committingRef = useRef(false);
  const parentZoomPrefetchRef = useRef(false);
  const [previewPortal, setPreviewPortal] = useState<ScenePortal | null>(null);
  const [previewPhase, setPreviewPhase] = useState<"preview" | "armed">("preview");
  const [interactionPositioned, setInteractionPositioned] = useState(false);
  const [encounterTick, setEncounterTick] = useState(0);
  const labelsById = useMemo(
    () => new Map(scene.labels.map((label) => [label.id, label])),
    [scene.labels],
  );
  const vocabularyZoomCues = useMemo(
    () => buildVocabularyZoomCues(scene.labels, scene.portals, scene.width, scene.height, 8),
    [scene.height, scene.labels, scene.portals, scene.width],
  );

  const viewerInteractive = transitionPhase === "active" && !interactionLocked;
  const viewerInteractiveRef = useRef(viewerInteractive);
  const meaningVisibleRef = useRef(meaningVisible);

  const showPortalPreview = useCallback((portal: ScenePortal | null) => {
    if (previewPortalRef.current?.id === portal?.id) return;
    previewPortalRef.current = portal;
    previewPhaseRef.current = "preview";
    setPreviewPhase("preview");
    setPreviewPortal(portal);
  }, []);

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
    const camera = (cameraRef.current = clampCamera(cameraRef.current));
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

    const activePortal = portalCandidateRef.current ?? previewPortalRef.current;
    const enterScale = activePortal?.enterScale ?? 3.6;
    const cueScale = Math.max(1, enterScale - PORTAL_PREVIEW_LEAD);
    const portalProgress = activePortal
      ? Math.min(1, Math.max(0, (camera.scale - cueScale) / Math.max(0.01, enterScale - cueScale)))
      : 0;
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
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const snapToDevicePixel = (value: number) => (
      Math.round(value * devicePixelRatio) / devicePixelRatio
    );
    for (const region of interactionLayer.querySelectorAll<HTMLElement>(".scene-hotspot-region")) {
      const portal = scene.portals.find((candidate) => candidate.id === region.dataset.portalId);
      if (portal) {
        const bounds = projectSceneRectToScreen(portal, camera);
        const left = snapToDevicePixel(bounds.x);
        const top = snapToDevicePixel(bounds.y);
        const right = snapToDevicePixel(bounds.x + bounds.width);
        const bottom = snapToDevicePixel(bounds.y + bounds.height);
        setStylePropertyIfChanged(region.style, "left", `${left.toFixed(2)}px`);
        setStylePropertyIfChanged(region.style, "top", `${top.toFixed(2)}px`);
        setStylePropertyIfChanged(region.style, "width", `${Math.max(0, right - left).toFixed(2)}px`);
        setStylePropertyIfChanged(region.style, "height", `${Math.max(0, bottom - top).toFixed(2)}px`);
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

    const labelViewport = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      compact: viewport.clientWidth <= 900,
    };
    const activeElement = document.activeElement;
    const focusedLabelId = activeElement instanceof HTMLButtonElement
      && activeElement.matches(".word-label")
      ? activeElement.dataset.labelId ?? null
      : null;
    const layout = computeSceneLabelLayout(
      scene.labels,
      camera,
      labelViewport,
      meaningVisibleRef.current,
      {
        selectedLabelId: focusedLabelId ?? selectedLabelIdRef.current,
        protectedRegions: buildPortalCueProtectedRegions(
          scene.portals,
          camera,
          labelViewport,
        ),
      },
    );
    const byId = new Map(layout.map((item) => [item.id, item]));
    let visibleCount = 0;
    let emergingCount = 0;
    const dwellEligibleLabelIds: string[] = [];
    for (const element of labelLayer.querySelectorAll<HTMLButtonElement>(".word-label")) {
      const item = byId.get(element.dataset.labelId ?? "");
      const ownsFocus = activeElement === element;
      const opacity = ownsFocus ? Math.max(1, item?.opacity ?? 0) : item?.opacity ?? 0;
      const interactive = viewerInteractiveRef.current && (ownsFocus || Boolean(item?.interactive));
      const opacityStyle = opacity.toFixed(3);
      const anchorX = -(item?.offsetX ?? 0);
      const anchorY = -(item?.offsetY ?? 0);
      const displacement = Math.hypot(anchorX, anchorY);
      const leaderAngle = Math.atan2(anchorY, anchorX) * 180 / Math.PI;
      const visibleValue = String(opacity > 0.025);
      const interactiveValue = String(interactive);
      const adaptiveValue = String(Boolean(item?.adaptive));
      const hiddenValue = String(!interactive);
      setStylePropertyIfChanged(element.style, "--label-opacity", opacityStyle);
      if (item && Number.isFinite(item.screenX) && Number.isFinite(item.screenY)) {
        // The artwork keeps its single composited camera transform, while text
        // is projected into this unscaled sibling overlay. Pixel-snapped
        // left/top values let the browser rasterize glyphs at their native
        // size instead of repeatedly scaling an already-rasterized label.
        const leftStyle = `${snapToDevicePixel(item.screenX).toFixed(2)}px`;
        const topStyle = `${snapToDevicePixel(item.screenY).toFixed(2)}px`;
        setStylePropertyIfChanged(element.style, "left", leftStyle);
        setStylePropertyIfChanged(element.style, "top", topStyle);
      }
      setStylePropertyIfChanged(element.style, "--label-anchor-x", `${anchorX.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "--label-anchor-y", `${anchorY.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "--label-leader-length", `${displacement.toFixed(2)}px`);
      setStylePropertyIfChanged(element.style, "--label-leader-angle", `${leaderAngle.toFixed(2)}deg`);
      setDatasetValueIfChanged(element, "displaced", String(displacement >= 4));
      setDatasetValueIfChanged(element, "leaderSpan", displacement >= 82 ? "long" : "short");
      setDatasetValueIfChanged(element, "anchorMode", displacement >= 4 ? "leader" : "stem");
      setDatasetValueIfChanged(element, "visible", visibleValue);
      setDatasetValueIfChanged(element, "interactive", interactiveValue);
      setDatasetValueIfChanged(element, "adaptive", adaptiveValue);
      const nextTabIndex = interactive ? 0 : -1;
      if (element.tabIndex !== nextTabIndex) element.tabIndex = nextTabIndex;
      setAttributeIfChanged(element, "aria-hidden", hiddenValue);
      if (opacity >= LABEL_ENCOUNTER_OPACITY) visibleCount += 1;
      else if (opacity > 0.025) emergingCount += 1;
      if (
        viewerInteractiveRef.current
        && item?.interactive
        && item.opacity >= LABEL_ENCOUNTER_OPACITY
      ) {
        dwellEligibleLabelIds.push(item.id);
      }
    }
    setDatasetValueIfChanged(surface, "visibleLabelCount", String(visibleCount));
    setDatasetValueIfChanged(surface, "emergingLabelCount", String(emergingCount));
    setDatasetValueIfChanged(labelLayer, "visibleLabelCount", String(visibleCount));
    setDatasetValueIfChanged(labelLayer, "emergingLabelCount", String(emergingCount));
    setDatasetValueIfChanged(labelLayer, "sceneScale", sceneScaleValue);

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

    const actuallyVisibleLabelIds = new Set(
      layout.filter((item) => item.interactive).map((item) => item.id),
    );
    const revealSummary = buildVocabularyRevealSummary(
      scene.labels,
      camera.scale,
      MAX_SCALE,
      LABEL_ENCOUNTER_OPACITY,
      actuallyVisibleLabelIds,
    );
    const globallyHiddenIds = new Set(revealSummary.hiddenLabels.map((label) => label.id));
    const cueCandidates = vocabularyZoomCues.flatMap((cue) => {
      const hidden = cue.labelIds
        .map((id) => labelsById.get(id))
        .filter((label): label is Label => Boolean(label))
        .filter((label) => globallyHiddenIds.has(label.id));
      const nextLod = hidden.reduce<number>(
        (lowest, label) => Math.min(lowest, sceneLabelLod(label)),
        Number.POSITIVE_INFINITY,
      );
      if (nextLod < 2 || nextLod > 4) return [];
      const targetScale = Math.min(MAX_SCALE, Math.max(
        camera.scale + 0.28,
        VOCABULARY_REVEAL_SCALE[nextLod as 2 | 3 | 4],
        ...hidden
          .filter((label) => sceneLabelLod(label) === nextLod)
          .map((label) => (label.minScale ?? 0) + 0.34),
      ));
      const revealable = hidden.filter((label) => (
        sceneLabelLod(label) === nextLod
        && sceneLabelRevealOpacity(label, targetScale) >= LABEL_ENCOUNTER_OPACITY
      ));
      if (revealable.length === 0) return [];
      return [{
        cue,
        labels: revealable,
        nextLod: nextLod as 2 | 3 | 4,
      }];
    });
    const nextSceneLod = cueCandidates.reduce<number>(
      (lowest, batch) => Math.min(lowest, batch.nextLod),
      Number.POSITIVE_INFINITY,
    );
    const nextSceneScale = Number.isFinite(nextSceneLod)
      ? Math.min(MAX_SCALE, Math.max(camera.scale + 0.28, VOCABULARY_REVEAL_SCALE[nextSceneLod as 2 | 3 | 4]))
      : MAX_SCALE;
    const visibleSceneWidth = viewport.clientWidth / Math.max(0.001, camera.fit * nextSceneScale);
    const visibleSceneHeight = viewport.clientHeight / Math.max(0.001, camera.fit * nextSceneScale);
    const cueBatches = consolidateVocabularyCueBatches(
      cueCandidates,
      4,
      visibleSceneWidth * 0.4,
      visibleSceneHeight * 0.4,
    );
    const cueLimit = viewport.clientWidth <= 700 ? 4 : 6;
    let activeCueCount = 0;
    for (const element of interactionLayer.querySelectorAll<HTMLButtonElement>(".vocabulary-zoom-cue")) {
      const batch = cueBatches.find((candidate) => candidate.cue.id === element.dataset.cueId);
      const active = Boolean(
        batch
        && batch.nextLod === nextSceneLod
        && activeCueCount < cueLimit
        && viewerInteractiveRef.current,
      );
      if (active && batch) {
        activeCueCount += 1;
        const centroid = {
          x: batch.labels.reduce((sum, label) => sum + label.x, 0) / batch.labels.length,
          y: batch.labels.reduce((sum, label) => sum + label.y, 0) / batch.labels.length,
        };
        const nextLabel = [...batch.labels].sort((first, second) => (
          Math.hypot(first.x - centroid.x, first.y - centroid.y)
            - Math.hypot(second.x - centroid.x, second.y - centroid.y)
          || first.priority - second.priority
          || first.id.localeCompare(second.id)
        ))[0];
        const targetScale = Math.min(MAX_SCALE, Math.max(
          camera.scale + 0.28,
          VOCABULARY_REVEAL_SCALE[batch.nextLod],
          ...batch.labels.map((label) => (label.minScale ?? 0) + 0.34),
        ));
        setDatasetValueIfChanged(element, "nextLod", String(batch.nextLod));
        setDatasetValueIfChanged(element, "hiddenWordCount", String(batch.labels.length));
        setDatasetValueIfChanged(element, "nextLabelId", nextLabel.id);
        setDatasetValueIfChanged(element, "targetScale", targetScale.toFixed(3));
        setDatasetValueIfChanged(element, "sourceCueIds", batch.sourceCueIds.join(" "));
        setDatasetValueIfChanged(element, "cueMode", batch.mode);
        setDatasetValueIfChanged(element, "visualRegion", nextLabel.sourceVisualRegion ?? batch.cue.id);
        setDatasetValueIfChanged(element, "anchorX", String(nextLabel.x));
        setDatasetValueIfChanged(element, "anchorY", String(nextLabel.y));
        const cuePosition = projectScenePointToScreen(nextLabel, camera);
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
          const countValue = batch.mode === "compact"
            ? `+${batch.labels.length}`
            : `${batch.labels.length} 个词`;
          if (count.textContent !== countValue) count.textContent = countValue;
        }
        setAttributeIfChanged(element, "aria-label", `此处还有 ${batch.labels.length} 个词，放大查看`);
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
    if (!interactionPositioned) setInteractionPositioned(true);

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
        setDatasetValueIfChanged(summaryElement, "targetScale", Math.min(
          MAX_SCALE,
          Math.max(camera.scale + 0.28, revealSummary.targetScale + 0.08),
        ).toFixed(3));
      } else {
        if (summaryElement.dataset.nextLabelId !== undefined) delete summaryElement.dataset.nextLabelId;
        if (summaryElement.dataset.targetScale !== undefined) delete summaryElement.dataset.targetScale;
      }
      const count = summaryElement.querySelector<HTMLElement>("strong");
      if (count && count.textContent !== String(hiddenCount)) count.textContent = String(hiddenCount);
      setAttributeIfChanged(summaryElement, "aria-label", `本场景还有 ${hiddenCount} 个词，继续放大`);
    }
  }, [clampCamera, interactionPositioned, labelsById, onLabelsEncountered, scene.labels, scene.portals, showPortalPreview, vocabularyZoomCues]);

  const requestCameraFrame = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(applyCamera);
  }, [applyCamera]);

  const stopWheelAnimation = useCallback(() => {
    if (wheelAnimationRef.current !== null) {
      cancelAnimationFrame(wheelAnimationRef.current);
      wheelAnimationRef.current = null;
    }
    wheelTargetRef.current = null;
    wheelFrameTimeRef.current = null;
  }, []);

  useEffect(() => {
    if (encounterTick > 0) requestCameraFrame();
  }, [encounterTick, requestCameraFrame]);

  const resetCamera = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    stopWheelAnimation();
    const fit = Math.min(viewport.clientWidth / scene.width, viewport.clientHeight / scene.height);
    const initialScale = viewport.clientHeight > viewport.clientWidth * 1.25 ? 1.3 : 1;
    cameraRef.current = {
      fit,
      scale: initialScale,
      x: (viewport.clientWidth - scene.width * fit * initialScale) / 2,
      y: (viewport.clientHeight - scene.height * fit * initialScale) / 2,
    };
    zoomFocusRef.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    zoomDirectionRef.current = null;
    portalCandidateRef.current = null;
    committingRef.current = false;
    // ResizeObserver can fire just after keyboard focus enters a portal. Keep
    // that focus-driven target cue instead of erasing it during the initial
    // fit pass; the Fit button and ordinary resizes still clear stale cues.
    const portalHasFocus = document.activeElement instanceof HTMLElement
      && document.activeElement.matches(".scene-hotspot");
    if (!portalHasFocus) showPortalPreview(null);
    requestCameraFrame();
  }, [requestCameraFrame, scene.height, scene.width, showPortalPreview, stopWheelAnimation]);

  const beginPortalTransition = useCallback((
    portal: ScenePortal,
    source: "zoom" | "pointer" | "keyboard",
  ) => {
    const viewport = viewportRef.current;
    if (!viewport || committingRef.current || interactionLocked) return;
    if (!onCommitScene(portal.childSceneId, source)) return;
    stopWheelAnimation();
    committingRef.current = true;
    portalCandidateRef.current = portal;
    showPortalPreview(portal);
    previewPhaseRef.current = "armed";
    setPreviewPhase("armed");
    onPrefetchScene(portal.childSceneId);
    if (settleRef.current) clearTimeout(settleRef.current);

    const start = { ...cameraRef.current };
    const startFocus = zoomFocusRef.current ? { ...zoomFocusRef.current } : null;
    const startDirection = zoomDirectionRef.current;
    const finishCommit = () => {
      void onEnterScene(portal.childSceneId, source).then((entered) => {
        if (entered) return;
        committingRef.current = false;
        cameraRef.current = { ...start };
        zoomFocusRef.current = startFocus ? { ...startFocus } : null;
        zoomDirectionRef.current = startDirection;
        portalCandidateRef.current = null;
        showPortalPreview(null);
        requestCameraFrame();
      });
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      cameraAnimationRef.current = null;
      finishCommit();
      return;
    }

    const targetScale = Math.min(
      MAX_SCALE,
      Math.max(start.scale + 0.28, (portal.enterScale ?? 3.6) + 0.38),
    );
    const effective = start.fit * targetScale;
    const target = {
      ...start,
      scale: targetScale,
      x: viewport.clientWidth / 2 - (portal.x + portal.width / 2) * effective,
      y: viewport.clientHeight / 2 - (portal.y + portal.height / 2) * effective,
    };
    const duration = source === "zoom" ? 170 : 220;
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
      cameraAnimationRef.current = null;
      finishCommit();
    };
    cameraAnimationRef.current = requestAnimationFrame(animate);
  }, [interactionLocked, onCommitScene, onEnterScene, onPrefetchScene, requestCameraFrame, showPortalPreview, stopWheelAnimation]);

  const evaluateNavigation = useCallback(() => {
    const now = performance.now();
    if (now - lastNavigationRef.current < 350) return;
    const camera = cameraRef.current;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const focus = zoomFocusRef.current ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    const candidate = portalCandidateRef.current ?? portalAtScreenPoint(scene.portals, camera, focus);
    const portal = zoomDirectionRef.current === "in" && candidate && camera.scale >= (candidate.enterScale ?? 3.6)
      ? candidate
      : undefined;
    if (portal) {
      lastNavigationRef.current = now;
      beginPortalTransition(portal, "zoom");
      return;
    }
    if (scene.parentId && zoomDirectionRef.current === "out" && camera.scale < EXIT_SCALE) {
      lastNavigationRef.current = now;
      onExitScene();
    }
  }, [beginPortalTransition, onExitScene, scene.parentId, scene.portals]);

  const scheduleNavigationCheck = useCallback(() => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(evaluateNavigation, ENTER_SETTLE_MS);
  }, [evaluateNavigation]);

  const zoomAt = useCallback(
    (point: Point, factor: number, previousPoint: Point = point) => {
      if (!viewerInteractive || committingRef.current) return;
      stopWheelAnimation();
      const camera = cameraRef.current;
      const previousFocus = zoomFocusRef.current;
      const minimum = scene.parentId ? 0.68 : 0.9;
      const nextScale = Math.min(MAX_SCALE, Math.max(minimum, camera.scale * factor));
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
      if (factor > 1) zoomDirectionRef.current = "in";
      else if (factor < 1) zoomDirectionRef.current = "out";
      else zoomDirectionRef.current = null;
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
        if (portal) onPrefetchScene(portal.childSceneId);
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
    [viewerInteractive, onPrefetchScene, requestCameraFrame, scene.parentId, scene.portals, scheduleNavigationCheck, showPortalPreview, stopWheelAnimation],
  );

  const queueWheelZoom = useCallback((point: Point, factor: number) => {
    if (!viewerInteractive || committingRef.current) return;
    if (settleRef.current) clearTimeout(settleRef.current);
    if (cameraAnimationRef.current !== null) {
      cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }

    const base = wheelTargetRef.current ?? cameraRef.current;
    const previousFocus = zoomFocusRef.current;
    const minimum = scene.parentId ? 0.68 : 0.9;
    const nextScale = Math.min(MAX_SCALE, Math.max(minimum, base.scale * factor));
    const ratio = nextScale / base.scale;
    const target = clampCamera({
      ...base,
      scale: nextScale,
      x: point.x - (point.x - base.x) * ratio,
      y: point.y - (point.y - base.y) * ratio,
    });
    wheelTargetRef.current = target;
    zoomFocusRef.current = point;
    if (factor > 1) zoomDirectionRef.current = "in";
    else if (factor < 1) zoomDirectionRef.current = "out";

    if (factor > 1) {
      const portal = portalAtScreenPoint(scene.portals, base, point)
        ?? portalAtScreenPoint(scene.portals, target, point);
      if (portal) {
        portalCandidateRef.current = portal;
        showPortalPreview(portal);
        if (target.scale >= 2.65) onPrefetchScene(portal.childSceneId);
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

    // Continuous wheel input keeps resetting this timer. Once the user pauses,
    // navigation can commit after the existing intent dwell without waiting
    // for the final sub-pixel tail of the camera interpolation.
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
      if (!settled) {
        wheelAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      wheelAnimationRef.current = null;
      wheelTargetRef.current = null;
      wheelFrameTimeRef.current = null;
      scheduleNavigationCheck();
    };
    wheelAnimationRef.current = requestAnimationFrame(animate);
  }, [applyCamera, clampCamera, onPrefetchScene, scene.parentId, scene.portals, scheduleNavigationCheck, showPortalPreview, viewerInteractive]);

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

    stopWheelAnimation();
    if (cameraAnimationRef.current !== null) cancelAnimationFrame(cameraAnimationRef.current);
    if (settleRef.current) clearTimeout(settleRef.current);
    portalCandidateRef.current = null;
    showPortalPreview(null);
    zoomDirectionRef.current = null;

    const start = { ...cameraRef.current };
    const authoredTarget = Number(element.dataset.targetScale)
      || (nextLabel.minScale === undefined ? 0 : nextLabel.minScale + 0.34);
    const defaultRevealScale = nextLod >= 2
      ? VOCABULARY_REVEAL_SCALE[nextLod as 2 | 3 | 4]
      : start.scale + 0.28;
    const targetScale = Math.min(
      MAX_SCALE,
      Math.max(start.scale + 0.28, defaultRevealScale, authoredTarget),
    );
    const effectiveScale = start.fit * targetScale;
    const target = {
      fit: start.fit,
      scale: targetScale,
      x: viewport.clientWidth / 2 - nextLabel.x * effectiveScale,
      y: viewport.clientHeight / 2 - nextLabel.y * effectiveScale,
    };
    const focusRevealedWord = () => {
      zoomFocusRef.current = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      requestCameraFrame();
      if (vocabularyAnnouncementRef.current) {
        vocabularyAnnouncementRef.current.textContent = "已放大到下一批词汇";
      }
      if (!keyboardTriggered) return;
      requestAnimationFrame(() => {
        const word = labelLayerRef.current?.querySelector<HTMLButtonElement>(
          `.word-label[data-label-id="${CSS.escape(nextLabelId)}"]`,
        );
        const fallback = labelLayerRef.current?.querySelector<HTMLButtonElement>(
          ".word-label[data-interactive=\"true\"]",
        );
        if (word?.tabIndex === 0) word.focus();
        else fallback?.focus();
      });
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
  }, [labelsById, requestCameraFrame, showPortalPreview, stopWheelAnimation, viewerInteractive]);

  useEffect(() => {
    selectedLabelIdRef.current = null;
    parentZoomPrefetchRef.current = false;
    if (!scene.parentId) return;
    onPrefetchScene(scene.parentId);
  }, [onPrefetchScene, scene.id, scene.parentId]);

  useEffect(() => {
    resetCamera();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(resetCamera);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [resetCamera, scene.id]);

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
      const bounds = viewport.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const factor = Math.exp(-event.deltaY * 0.0017);
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
      if (settleRef.current) clearTimeout(settleRef.current);
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
    if (!viewerInteractive || committingRef.current) return;
    if ((event.target as Element).closest("button")) return;
    stopWheelAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    previousPointersRef.current.set(event.pointerId, point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewerInteractive || committingRef.current) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    const current = { x: event.clientX, y: event.clientY };
    const previous = previousPointersRef.current.get(event.pointerId) ?? current;
    pointersRef.current.set(event.pointerId, current);

    const points = [...pointersRef.current.entries()];
    if (points.length === 1) {
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
        data-testid="world-viewport"
        aria-busy={interactionLocked}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onLostPointerCapture={releasePointer}
      >
        <div
          ref={surfaceRef}
          className="scene-surface"
          data-zoom-level="0"
          style={{ width: scene.width, height: scene.height }}
        >
          <img className="scene-art" src={scene.asset} alt="" draggable={false} />
        </div>
        <div
          ref={labelLayerRef}
          className="label-layer"
          data-testid="scene-label-layer"
          data-coordinate-space="screen"
          aria-label="Words in this scene"
        >
          {scene.labels.map((label) => (
            <button
              key={label.id}
              type="button"
              className="word-label"
              data-testid="word-label"
              data-label-id={label.id}
              data-min-level={label.minLevel ?? 0}
              data-lod={label.minLevel ?? 0}
              data-priority={label.priority}
              data-visual-region={label.sourceVisualRegion}
              data-anchor-x={label.x}
              data-anchor-y={label.y}
              data-anchor-mode="stem"
              data-leader-span="short"
              data-visible="false"
              data-interactive="false"
              data-adaptive="false"
              tabIndex={-1}
              aria-hidden="true"
              aria-label={meaningVisible ? `${label.word}，${label.translation}` : label.word}
              onClick={(event) => {
                event.stopPropagation();
                selectedLabelIdRef.current = label.id;
                requestCameraFrame();
                reportClickedLabel(label);
                onSelectWord(label);
              }}
            >
              <span className="word-anchor-marker" aria-hidden="true" />
              <span>{label.word}</span>
              {meaningVisible ? (
                <span className="word-translation" data-testid="word-translation">
                  {label.translation}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div
          ref={interactionLayerRef}
          className="scene-interaction-layer"
          data-testid="scene-interaction-layer"
          data-coordinate-space="screen"
          data-positioned={String(interactionPositioned)}
        >
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
                  data-zoom-action="reveal-words"
                  data-active="false"
                  data-next-label-id={cue.anchorLabelId}
                  data-next-lod={cue.minLod}
                  data-hidden-word-count="0"
                  data-visual-region={anchor?.sourceVisualRegion ?? cue.id}
                  data-anchor-x={cue.x}
                  data-anchor-y={cue.y}
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label="放大此区域，显示更多词"
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
                    <strong className="vocabulary-zoom-cue-count">更多词</strong>
                  </span>
                </button>
              );
            })}
          </div>
          {scene.portals.map((portal) => (
            <div
              key={portal.id}
              className="scene-hotspot-region"
              data-portal-id={portal.id}
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
                data-progress="0.000"
                data-target-scene={portal.childSceneId}
                aria-describedby={previewPortal?.id === portal.id ? `portal-preview-${scene.id}` : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  beginPortalTransition(portal, event.detail === 0 ? "keyboard" : "pointer");
                }}
                onFocus={() => {
                  showPortalPreview(portal);
                  requestCameraFrame();
                  onPrefetchScene(portal.childSceneId);
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
                  onPrefetchScene(portal.childSceneId);
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
                  进入 · {portalTargetTitles[portal.childSceneId] ?? portal.label}
                </span>
              </button>
            </div>
          ))}
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
            aria-label="本场景没有待显示的词"
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
            本场景还有 <strong>0</strong> 个词 · 继续放大
          </button>
          <aside className="scene-cue-legend" data-testid="scene-cue-legend" aria-label="缩放提示图例">
            <span><i data-kind="portal" aria-hidden="true" />进入下一场景</span>
            <span><i data-kind="vocabulary" aria-hidden="true" />放大显示更多词</span>
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
                <small>{previewPhase === "armed" ? "即将进入" : "继续放大进入"}</small>
                <strong>{portalTargetTitles[previewPortal.childSceneId] ?? previewPortal.label}</strong>
                {meaningVisible && previewPortal.translation ? <em>{previewPortal.translation}</em> : null}
              </span>
            </div>
          ) : (
            <p className="gesture-hint">拖动探索 · 滚轮或双指缩放 · 选择彩色提示</p>
          )}
        </>
      ) : null}
    </section>
  );
}
