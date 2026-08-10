"use client";

/* SVG scene slices intentionally remain external images so their drawing nodes do not enter the app DOM. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { computeSceneLabelLayout, type Label, type Portal as ScenePortal, type Scene } from "../domain";

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
  onSelectWord: (label: Label) => void;
  onPrefetchScene: (sceneId: string) => void;
}

interface Camera {
  x: number;
  y: number;
  scale: number;
  fit: number;
}

interface Point {
  x: number;
  y: number;
}

const ENTER_SETTLE_MS = 150;
const EXIT_SCALE = 0.82;
const MAX_SCALE = 4.15;
const PORTAL_PREVIEW_LEAD = 1;
const PORTAL_ARMED_PROGRESS = 0.82;

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
  onSelectWord,
  onPrefetchScene,
}: SceneViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1, fit: 1 });
  const pointersRef = useRef(new Map<number, Point>());
  const previousPointersRef = useRef(new Map<number, Point>());
  const frameRef = useRef<number | null>(null);
  const cameraAnimationRef = useRef<number | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavigationRef = useRef(0);
  const zoomFocusRef = useRef<Point | null>(null);
  const zoomDirectionRef = useRef<"in" | "out" | null>(null);
  const portalCandidateRef = useRef<ScenePortal | null>(null);
  const previewPortalRef = useRef<ScenePortal | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewPhaseRef = useRef<"preview" | "armed">("preview");
  const committingRef = useRef(false);
  const [previewPortal, setPreviewPortal] = useState<ScenePortal | null>(null);
  const [previewPhase, setPreviewPhase] = useState<"preview" | "armed">("preview");

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
    const viewport = viewportRef.current;
    if (!surface || !viewport) return;
    const camera = (cameraRef.current = clampCamera(cameraRef.current));
    const effectiveScale = camera.fit * camera.scale;
    const zoomLevel = sceneLodLevel(camera.scale);
    surface.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${effectiveScale})`;
    surface.style.setProperty("--label-inverse", String(1 / effectiveScale));
    surface.style.setProperty("--scene-zoom", camera.scale.toFixed(3));
    surface.dataset.zoomLevel = String(zoomLevel);
    surface.dataset.lodLevel = String(zoomLevel);
    surface.dataset.sceneScale = camera.scale.toFixed(3);

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
      previewRef.current.dataset.progress = portalProgress.toFixed(3);
      previewRef.current.dataset.phase = nextPreviewPhase;
      previewRef.current.style.setProperty("--portal-progress", portalProgress.toFixed(3));
    }
    for (const region of surface.querySelectorAll<HTMLElement>(".scene-hotspot-region")) {
      const selected = region.dataset.portalId === activePortal?.id;
      region.dataset.candidate = String(selected);
      region.style.setProperty("--portal-progress", selected ? portalProgress.toFixed(3) : "0");
    }

    const layout = computeSceneLabelLayout(
      scene.labels,
      camera,
      {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        compact: viewport.clientWidth <= 900,
      },
      meaningVisibleRef.current,
    );
    const byId = new Map(layout.map((item) => [item.id, item]));
    let visibleCount = 0;
    let emergingCount = 0;
    for (const element of surface.querySelectorAll<HTMLButtonElement>(".word-label")) {
      const item = byId.get(element.dataset.labelId ?? "");
      const ownsFocus = document.activeElement === element;
      const opacity = ownsFocus ? Math.max(1, item?.opacity ?? 0) : item?.opacity ?? 0;
      const interactive = viewerInteractiveRef.current && (ownsFocus || Boolean(item?.interactive));
      const opacityStyle = opacity.toFixed(3);
      const offsetXStyle = `${(item?.offsetX ?? 0).toFixed(2)}px`;
      const offsetYStyle = `${(item?.offsetY ?? 0).toFixed(2)}px`;
      const anchorX = -(item?.offsetX ?? 0);
      const anchorY = -(item?.offsetY ?? 0);
      const displacement = Math.hypot(anchorX, anchorY);
      const leaderAngle = Math.atan2(anchorY, anchorX) * 180 / Math.PI;
      const visibleValue = String(opacity > 0.025);
      const interactiveValue = String(interactive);
      const hiddenValue = String(!interactive);
      if (element.style.getPropertyValue("--label-opacity") !== opacityStyle) {
        element.style.setProperty("--label-opacity", opacityStyle);
      }
      if (element.style.getPropertyValue("--label-offset-x") !== offsetXStyle) {
        element.style.setProperty("--label-offset-x", offsetXStyle);
      }
      if (element.style.getPropertyValue("--label-offset-y") !== offsetYStyle) {
        element.style.setProperty("--label-offset-y", offsetYStyle);
      }
      element.style.setProperty("--label-anchor-x", `${anchorX.toFixed(2)}px`);
      element.style.setProperty("--label-anchor-y", `${anchorY.toFixed(2)}px`);
      element.style.setProperty("--label-leader-length", `${displacement.toFixed(2)}px`);
      element.style.setProperty("--label-leader-angle", `${leaderAngle.toFixed(2)}deg`);
      element.dataset.displaced = String(displacement >= 14);
      if (element.dataset.visible !== visibleValue) element.dataset.visible = visibleValue;
      if (element.dataset.interactive !== interactiveValue) {
        element.dataset.interactive = interactiveValue;
      }
      const nextTabIndex = interactive ? 0 : -1;
      if (element.tabIndex !== nextTabIndex) element.tabIndex = nextTabIndex;
      if (element.getAttribute("aria-hidden") !== hiddenValue) {
        element.setAttribute("aria-hidden", hiddenValue);
      }
      if (opacity >= 0.52) visibleCount += 1;
      else if (opacity > 0.025) emergingCount += 1;
    }
    surface.dataset.visibleLabelCount = String(visibleCount);
    surface.dataset.emergingLabelCount = String(emergingCount);
  }, [clampCamera, scene.labels, showPortalPreview]);

  const requestCameraFrame = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(applyCamera);
  }, [applyCamera]);

  const resetCamera = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
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
  }, [requestCameraFrame, scene.height, scene.width, showPortalPreview]);

  const beginPortalTransition = useCallback((
    portal: ScenePortal,
    source: "zoom" | "pointer" | "keyboard",
  ) => {
    const viewport = viewportRef.current;
    if (!viewport || committingRef.current || interactionLocked) return;
    if (!onCommitScene(portal.childSceneId, source)) return;
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
  }, [interactionLocked, onCommitScene, onEnterScene, onPrefetchScene, requestCameraFrame, showPortalPreview]);

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
      requestCameraFrame();
      scheduleNavigationCheck();
    },
    [viewerInteractive, onPrefetchScene, requestCameraFrame, scene.parentId, scene.portals, scheduleNavigationCheck, showPortalPreview],
  );

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
      zoomAt(point, Math.exp(-event.deltaY * 0.0017));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (cameraAnimationRef.current !== null) cancelAnimationFrame(cameraAnimationRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewerInteractive || committingRef.current) return;
    if ((event.target as Element).closest("button")) return;
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
          <div className="label-layer" aria-label="Words in this scene">
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
                data-visible="false"
                data-interactive="false"
                style={{ left: label.x, top: label.y }}
                tabIndex={-1}
                aria-hidden="true"
                aria-label={meaningVisible ? `${label.word}，${label.translation}` : label.word}
                onClick={(event) => {
                  event.stopPropagation();
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
          {scene.portals.map((portal) => (
            <div
              key={portal.id}
              className="scene-hotspot-region"
              data-portal-id={portal.id}
              data-visual-region={portal.sourceVisualRegion}
              data-candidate="false"
              style={{ left: portal.x, top: portal.y, width: portal.width, height: portal.height }}
            >
              <button
                type="button"
                className="scene-hotspot"
                data-testid="scene-hotspot"
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
                aria-label={meaningVisible && portal.translation ? `${portal.label}，${portal.translation}` : portal.label}
              >
                <span className="scene-hotspot-icon" aria-hidden="true">＋</span>
                <span className="scene-hotspot-caption" aria-hidden="true">
                  {portalTargetTitles[portal.childSceneId] ?? portal.label}
                </span>
              </button>
            </div>
          ))}
        </div>
        <div className="viewport-vignette" aria-hidden="true" />
      </div>

      {viewerInteractive ? (
        <>
          <div className="zoom-controls" aria-label="Zoom controls">
            <button type="button" onClick={() => zoomAt(viewportCenter(), 1.34)} aria-label="Zoom in">＋</button>
            <button type="button" onClick={() => zoomAt(viewportCenter(), 0.74)} aria-label="Zoom out">−</button>
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
            <p className="gesture-hint">拖动探索 · 滚轮或双指缩放 · 对准入口查看下一层</p>
          )}
        </>
      ) : null}
    </section>
  );
}
