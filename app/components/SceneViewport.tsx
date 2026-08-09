"use client";

/* SVG scene slices intentionally remain external images so their drawing nodes do not enter the app DOM. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef } from "react";
import type { Portal as ScenePortal, Scene } from "../domain";

interface SceneViewportProps {
  scene: Scene;
  meaningVisible: boolean;
  transitionKey: number;
  onEnterScene: (sceneId: string) => void;
  onExitScene: () => void;
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

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function SceneViewport({
  scene,
  meaningVisible,
  transitionKey,
  onEnterScene,
  onExitScene,
}: SceneViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, scale: 1, fit: 1 });
  const pointersRef = useRef(new Map<number, Point>());
  const previousPointersRef = useRef(new Map<number, Point>());
  const frameRef = useRef<number | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNavigationRef = useRef(0);

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
    if (!surface) return;
    const camera = (cameraRef.current = clampCamera(cameraRef.current));
    const effectiveScale = camera.fit * camera.scale;
    const zoomLevel = camera.scale < 1.48 ? 0 : camera.scale < 2.25 ? 1 : 2;
    surface.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${effectiveScale})`;
    surface.style.setProperty("--label-inverse", String(1 / effectiveScale));
    surface.dataset.zoomLevel = String(zoomLevel);
  }, [clampCamera]);

  const requestCameraFrame = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(applyCamera);
  }, [applyCamera]);

  const resetCamera = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fit = Math.min(viewport.clientWidth / scene.width, viewport.clientHeight / scene.height);
    const initialScale = viewport.clientHeight > viewport.clientWidth * 1.25 ? 1.55 : 1;
    cameraRef.current = {
      fit,
      scale: initialScale,
      x: (viewport.clientWidth - scene.width * fit * initialScale) / 2,
      y: (viewport.clientHeight - scene.height * fit * initialScale) / 2,
    };
    requestCameraFrame();
  }, [requestCameraFrame, scene.height, scene.width]);

  const portalNearFocus = useCallback(
    (portal: ScenePortal): boolean => {
      const viewport = viewportRef.current;
      if (!viewport) return false;
      const camera = cameraRef.current;
      const effective = camera.fit * camera.scale;
      const projected = {
        x: camera.x + (portal.x + portal.width / 2) * effective,
        y: camera.y + (portal.y + portal.height / 2) * effective,
      };
      const center = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      return distance(projected, center) <= Math.min(viewport.clientWidth, viewport.clientHeight) * 0.34;
    },
    [],
  );

  const evaluateNavigation = useCallback(() => {
    const now = performance.now();
    if (now - lastNavigationRef.current < 350) return;
    const camera = cameraRef.current;
    const portal = scene.portals.find(
      (candidate) => camera.scale >= (candidate.enterScale ?? 3.6) && portalNearFocus(candidate),
    );
    if (portal) {
      lastNavigationRef.current = now;
      onEnterScene(portal.childSceneId);
      return;
    }
    if (scene.parentId && camera.scale < EXIT_SCALE) {
      lastNavigationRef.current = now;
      onExitScene();
    }
  }, [onEnterScene, onExitScene, portalNearFocus, scene.parentId, scene.portals]);

  const scheduleNavigationCheck = useCallback(() => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(evaluateNavigation, ENTER_SETTLE_MS);
  }, [evaluateNavigation]);

  const zoomAt = useCallback(
    (point: Point, factor: number) => {
      const camera = cameraRef.current;
      const minimum = scene.parentId ? 0.68 : 0.9;
      const nextScale = Math.min(MAX_SCALE, Math.max(minimum, camera.scale * factor));
      if (nextScale === camera.scale) return;
      const ratio = nextScale / camera.scale;
      cameraRef.current = {
        ...camera,
        scale: nextScale,
        x: point.x - (point.x - camera.x) * ratio,
        y: point.y - (point.y - camera.y) * ratio,
      };
      requestCameraFrame();
      scheduleNavigationCheck();
    },
    [requestCameraFrame, scene.parentId, scheduleNavigationCheck],
  );

  useEffect(() => {
    resetCamera();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(resetCamera);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [resetCamera, scene.id, transitionKey]);

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
      if (settleRef.current) clearTimeout(settleRef.current);
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    previousPointersRef.current.set(event.pointerId, point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
      zoomAt(
        {
          x: (first.x + second.x) / 2 - bounds.left,
          y: (first.y + second.y) / 2 - bounds.top,
        },
        nextDistance / previousDistance,
      );
    }
    previousPointersRef.current.set(event.pointerId, current);
  };

  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    previousPointersRef.current.delete(event.pointerId);
    scheduleNavigationCheck();
  };

  const focusPortal = (portal: ScenePortal) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const camera = cameraRef.current;
      const targetScale = Math.max((portal.enterScale ?? 3.6) + 0.05, camera.scale);
    const effective = camera.fit * targetScale;
    cameraRef.current = {
      ...camera,
      scale: targetScale,
      x: viewport.clientWidth / 2 - (portal.x + portal.width / 2) * effective,
      y: viewport.clientHeight / 2 - (portal.y + portal.height / 2) * effective,
    };
    requestCameraFrame();
    if (settleRef.current) clearTimeout(settleRef.current);
    onEnterScene(portal.childSceneId);
  };

  const viewportCenter = () => {
    const viewport = viewportRef.current;
    return viewport
      ? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      : { x: 0, y: 0 };
  };

  return (
    <section className="viewer-shell" aria-label={`${scene.title} vocabulary scene`}>
      <div
        ref={viewportRef}
        className="world-viewport"
        data-testid="world-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onLostPointerCapture={releasePointer}
      >
        <div
          ref={surfaceRef}
          className="scene-surface scene-enter"
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
                data-min-level={label.minLevel ?? 0}
                style={{ left: label.x, top: label.y }}
                aria-label={meaningVisible ? `${label.word}，${label.translation}` : label.word}
              >
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
            <button
              key={portal.id}
              type="button"
              className="scene-hotspot"
              data-testid="scene-hotspot"
              data-target-scene={portal.childSceneId}
              style={{ left: portal.x, top: portal.y, width: portal.width, height: portal.height }}
              onClick={(event) => {
                event.stopPropagation();
                focusPortal(portal);
              }}
              aria-label={meaningVisible && portal.translation ? `${portal.label}，${portal.translation}` : portal.label}
            >
              <span aria-hidden="true">＋</span>
            </button>
          ))}
        </div>
        <div className="viewport-vignette" aria-hidden="true" />
      </div>

      <div className="zoom-controls" aria-label="Zoom controls">
        <button type="button" onClick={() => zoomAt(viewportCenter(), 1.34)} aria-label="Zoom in">＋</button>
        <button type="button" onClick={() => zoomAt(viewportCenter(), 0.74)} aria-label="Zoom out">−</button>
        <button type="button" onClick={resetCamera} aria-label="Fit scene">⌂</button>
      </div>
      <p className="gesture-hint">拖动探索 · 滚轮或双指缩放 · 放大物体进入下一层</p>
    </section>
  );
}
