"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LexicalWorld } from "./LexicalWorld";
import {
  childCameraFromPortalTile,
  fittedSceneCamera,
  parentCameraFromChildTile,
  SceneViewport,
  type ScenePortalNavigator,
  type SceneContinuityView,
  type SceneViewportSnapshot,
} from "./SceneViewport";
import {
  getPreparedScene,
  loadSceneManifest,
  prefetchScene,
  prepareScene,
  retainSceneNeighborhood,
  type Scene,
} from "../lib/scene-repository";
import {
  parseDiscoveredEntries,
  recordDiscoveredLabels,
  serializeDiscoveredEntries,
  type Label,
  type Portal,
} from "../domain";
import { SPATIAL_LEXEME_REALMS } from "../domain/spatialLexemeRealms.generated";

const MEANING_KEY = "hellowords:meaning-visible";
// v1 counted every label as soon as its scene loaded, including words the user
// never saw. Keep that data untouched, but start the truthful dwell-based model
// in a new namespace so existing inflated totals do not leak into the UI.
const DISCOVERED_KEY = "hellowords:encountered-labels:v2";
const SPATIAL_REALM_BY_LEXEME: Readonly<Record<string, string | undefined>> = SPATIAL_LEXEME_REALMS;

export type SceneTransitionCacheReadiness = "warm" | "cold";

export interface WorldSceneSettledDetail {
  readonly from: string;
  readonly to: string;
  readonly durationMs: number;
  /** Time until React received the scene swap; warm paths stay in the input turn. */
  readonly commitMs: number;
  readonly cache: SceneTransitionCacheReadiness;
}

declare global {
  interface WindowEventMap {
    "world:scene-settled": CustomEvent<WorldSceneSettledDetail>;
  }
}

export function WorldApp() {
  const [scene, setScene] = useState<Scene | null>(null);
  const [outgoingScene, setOutgoingScene] = useState<Scene | null>(null);
  const [history, setHistory] = useState<Scene[]>([]);
  const [sceneTitles, setSceneTitles] = useState<Record<string, string>>({});
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [lexicalWorldOpen, setLexicalWorldOpen] = useState(false);
  const [lexicalWorldInitialFocus, setLexicalWorldInitialFocus] = useState<"auto" | "search" | "dialog">("auto");
  const [lexicalWorldEntry, setLexicalWorldEntry] = useState<{
    readonly realmId: string;
    readonly word: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitionState, setTransitionState] = useState<"loading" | "incoming" | "idle">("loading");
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const [transitionCache, setTransitionCache] = useState<"idle" | SceneTransitionCacheReadiness>("idle");
  const [announcedSceneTitle, setAnnouncedSceneTitle] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [sceneContinuityView, setSceneContinuityView] = useState<SceneContinuityView | undefined>();
  const [continuousTransitionActive, setContinuousTransitionActive] = useState(false);
  const [viewportMotionFrozen, setViewportMotionFrozen] = useState(false);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const navigationRef = useRef<AbortController | null>(null);
  const sceneHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterNavigationRef = useRef(false);
  const navigationPhaseRef = useRef<"idle" | "committing" | "navigating" | "settling">("idle");
  const transitionTargetIdRef = useRef<string | null>(null);
  const transitionStartedAtRef = useRef(0);
  const transitionWasWarmRef = useRef(false);
  const transitionSequenceRef = useRef(0);
  const preferredChildRef = useRef<string | null>(null);
  const activeViewportSnapshotRef = useRef<SceneViewportSnapshot | null>(null);
  const pendingPortalRef = useRef<Portal | null>(null);
  const activePortalNavigatorRef = useRef<ScenePortalNavigator | null>(null);
  const pendingContinuitySettleRef = useRef<(() => void) | null>(null);
  const transitionUsesContinuityRef = useRef(false);
  const discoveredEntriesRef = useRef<ReadonlySet<string>>(new Set());
  const sceneControlsLocked = loading || continuousTransitionActive || viewportMotionFrozen;

  useEffect(() => {
    const storedMeaningVisible = window.localStorage.getItem(MEANING_KEY) === "true";
    const discoveredEntries = parseDiscoveredEntries(window.localStorage.getItem(DISCOVERED_KEY));
    discoveredEntriesRef.current = discoveredEntries;
    queueMicrotask(() => {
      setMeaningVisible(storedMeaningVisible);
      setDiscoveredCount(discoveredEntries.size);
    });
    const controller = new AbortController();
    void loadSceneManifest(controller.signal)
      .then((manifest) => {
        setSceneTitles(Object.fromEntries(manifest.scenes.map((item) => [item.id, item.title])));
        retainSceneNeighborhood(manifest.rootSceneId, null);
        return prepareScene(manifest.rootSceneId, controller.signal);
      })
      .then((initialScene) => {
        preferredChildRef.current = initialScene.portals[0]?.childSceneId ?? null;
        retainSceneNeighborhood(
          initialScene.id,
          initialScene.parentId ?? null,
          initialScene.portals[0]?.childSceneId,
        );
        if (preferredChildRef.current) prefetchScene(preferredChildRef.current);
        setScene(initialScene);
        setHistory([initialScene]);
        setAnnouncedSceneTitle(initialScene.title);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Scene failed to load");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setTransitionState("idle");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => navigationRef.current?.abort(), []);

  useEffect(() => {
    if (!scene) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelectedLabel(null);
    });
    return () => {
      active = false;
    };
  }, [scene]);

  useEffect(() => {
    if (!scene) return;
    const preferredIsChild = scene.portals.some((portal) => portal.childSceneId === preferredChildRef.current);
    const target = preferredIsChild ? preferredChildRef.current : scene.portals[0]?.childSceneId;
    preferredChildRef.current = target ?? null;
    retainSceneNeighborhood(scene.id, scene.parentId ?? null, target);
    if (!target) return;
    // The neighborhood is deliberately tiny, so warming its single child is
    // cheap and should begin immediately. Deferring this to idle time made a
    // quick first zoom pay the complete network/decode cost.
    prefetchScene(target);
  }, [scene]);

  const prefetchPreferredScene = useCallback((targetId: string) => {
    if (!scene) return null;
    const rememberedChild = scene.portals.some((portal) => portal.childSceneId === preferredChildRef.current)
      ? preferredChildRef.current
      : scene.portals[0]?.childSceneId ?? null;
    if (targetId === scene.parentId) {
      // SceneViewport also warms the exit path. The parent already occupies
      // its own cache slot and must not replace the preferred child slot.
      retainSceneNeighborhood(scene.id, scene.parentId ?? null, rememberedChild);
      return getPreparedScene(targetId) ?? prepareScene(targetId).catch(() => null);
    }
    if (!scene.portals.some((portal) => portal.childSceneId === targetId)) return null;
    // Focus/hover is a stronger intent signal than portal order. Replacing the
    // speculative child here keeps multi-portal scenes fast without retaining
    // every branch in memory.
    preferredChildRef.current = targetId;
    retainSceneNeighborhood(scene.id, scene.parentId ?? null, targetId);
    return getPreparedScene(targetId) ?? prepareScene(targetId).catch(() => null);
  }, [scene]);

  const settleScene = useCallback((
    from: string,
    nextScene: Scene,
    startedAt: number,
    committedAt: number,
    cache: SceneTransitionCacheReadiness,
    transitionSequence: number,
  ) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const finishedAt = performance.now();
        performance.measure("scene-transition", { start: startedAt, end: finishedAt });
        window.dispatchEvent(
          new CustomEvent<WorldSceneSettledDetail>("world:scene-settled", {
            detail: {
              from,
              to: nextScene.id,
              durationMs: finishedAt - startedAt,
              commitMs: committedAt - startedAt,
              cache,
            },
          }),
        );
        if (transitionSequenceRef.current === transitionSequence) setTransitionCache("idle");
      });
    });
  }, []);

  const beginSceneCommit = useCallback((
    targetId: string,
    source: "zoom" | "pointer" | "keyboard",
    portal?: Portal,
  ): false | "warm" | "cold" => {
    if (navigationPhaseRef.current !== "idle") return false;
    navigationPhaseRef.current = "committing";
    transitionSequenceRef.current += 1;
    transitionTargetIdRef.current = targetId;
    transitionStartedAtRef.current = performance.now();
    transitionWasWarmRef.current = getPreparedScene(targetId) !== null;
    pendingPortalRef.current = portal ?? null;
    transitionUsesContinuityRef.current = Boolean(portal);
    setContinuousTransitionActive(Boolean(portal));
    const cacheReadiness = transitionWasWarmRef.current ? "warm" : "cold";
    setTransitionCache(cacheReadiness);
    performance.mark("scene-transition-start");
    focusHeadingAfterNavigationRef.current = source === "keyboard";
    setLoadError(null);
    if (!transitionWasWarmRef.current) {
      setTransitionTarget(sceneTitles[targetId] ?? targetId);
      setTransitionState("loading");
      setLoading(true);
    }
    return transitionWasWarmRef.current ? "warm" : "cold";
  }, [sceneTitles]);

  const navigate = useCallback(
    async (
      targetId: string,
      direction: "forward" | "back",
      source: "zoom" | "pointer" | "keyboard" = "pointer",
      historyIndex?: number,
    ): Promise<boolean> => {
      if (!scene || targetId === scene.id) return false;
      const alreadyCommitted = navigationPhaseRef.current === "committing"
        && transitionTargetIdRef.current === targetId;
      if (!alreadyCommitted && !beginSceneCommit(targetId, source)) return false;
      if (navigationPhaseRef.current !== "committing") return false;
      navigationPhaseRef.current = "navigating";
      navigationRef.current?.abort();
      const controller = new AbortController();
      navigationRef.current = controller;
      const startedAt = transitionStartedAtRef.current || performance.now();
      const wasWarm = transitionWasWarmRef.current;
      const cacheReadiness: SceneTransitionCacheReadiness = wasWarm ? "warm" : "cold";
      let usesContinuity = transitionUsesContinuityRef.current;
      const transitionSequence = transitionSequenceRef.current;
      const historyTarget = history.find((item) => item.id === targetId);
      const targetParentId = direction === "forward" ? scene.id : historyTarget?.parentId ?? null;
      const backPreferredChild = direction === "back"
        ? historyIndex === undefined ? scene.id : history[historyIndex + 1]?.id ?? null
        : null;
      retainSceneNeighborhood(targetId, targetParentId, backPreferredChild);
      try {
        // A decoded neighbor is available synchronously. Avoid even a promise
        // microtask here so clicking a warm child or returning to its parent
        // replaces the scene in the same input turn.
        const preparedScene = getPreparedScene(targetId);
        const nextScene = preparedScene ?? await prepareScene(targetId, controller.signal);
        if (controller.signal.aborted) return false;
        if (!wasWarm && transitionUsesContinuityRef.current) {
          // Let the newly decoded child tile paint inside the still-mounted
          // parent portal once before transferring scene ownership.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          if (controller.signal.aborted) return false;
        }
        const nextPreferredChild = direction === "back"
          ? backPreferredChild
          : nextScene.portals[0]?.childSceneId;
        preferredChildRef.current = nextPreferredChild ?? null;
        retainSceneNeighborhood(nextScene.id, nextScene.parentId ?? null, nextPreferredChild);
        if (nextPreferredChild) prefetchScene(nextPreferredChild);
        const snapshot = activeViewportSnapshotRef.current;
        let nextContinuityView: SceneContinuityView | undefined;
        if (snapshot?.sceneId === scene.id) {
          const viewportSize = {
            width: snapshot.viewportWidth,
            height: snapshot.viewportHeight,
          };
          if (direction === "forward") {
            const portal = pendingPortalRef.current;
            if (portal?.childSceneId === nextScene.id) {
              nextContinuityView = {
                direction: "forward",
                camera: childCameraFromPortalTile(portal, snapshot.camera, nextScene, viewportSize),
                settledCamera: fittedSceneCamera(nextScene, viewportSize),
              };
            }
          } else {
            const returnPortal = nextScene.portals.find((portal) => portal.childSceneId === scene.id);
            if (returnPortal) {
              nextContinuityView = {
                direction: "back",
                camera: parentCameraFromChildTile(
                  returnPortal,
                  snapshot.camera,
                  nextScene,
                  scene,
                  viewportSize,
                ),
                settledCamera: fittedSceneCamera(nextScene, viewportSize),
                tileScene: scene,
                tilePortal: returnPortal,
              };
            }
          }
        }
        usesContinuity = Boolean(nextContinuityView);
        transitionUsesContinuityRef.current = usesContinuity;
        setContinuousTransitionActive(usesContinuity);
        const committedAt = performance.now();
        setSceneContinuityView(nextContinuityView);
        setOutgoingScene(wasWarm || usesContinuity ? null : scene);
        setScene(nextScene);
        setHistory((current) =>
          direction === "forward"
            ? [...current, nextScene]
            : current.slice(0, historyIndex === undefined ? -1 : historyIndex + 1),
        );
        if (!wasWarm && !usesContinuity) {
          setTransitionState("incoming");
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          await new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 80 : 220));
          if (controller.signal.aborted) return false;
          setOutgoingScene(null);
          setTransitionState("idle");
          setTransitionTarget(null);
          setLoading(false);
        }
        setAnnouncedSceneTitle(nextScene.title);
        navigationPhaseRef.current = usesContinuity ? "settling" : "idle";
        transitionTargetIdRef.current = null;
        transitionStartedAtRef.current = 0;
        transitionWasWarmRef.current = false;
        pendingPortalRef.current = null;
        if (wasWarm || usesContinuity) {
          // These are normally already idle/false for a warm swap; keeping the
          // assignments here also heals state after a superseded cold attempt.
          setTransitionState("idle");
          setTransitionTarget(null);
          setLoading(false);
        }
        if (!usesContinuity) setContinuousTransitionActive(false);
        const dispatchSettled = () => settleScene(
          scene.id,
          nextScene,
          startedAt,
          committedAt,
          cacheReadiness,
          transitionSequence,
        );
        if (usesContinuity) {
          pendingContinuitySettleRef.current = dispatchSettled;
        } else {
          dispatchSettled();
        }
        if (focusHeadingAfterNavigationRef.current) {
          requestAnimationFrame(() => sceneHeadingRef.current?.focus({ preventScroll: true }));
        }
        return true;
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          retainSceneNeighborhood(scene.id, scene.parentId ?? null, scene.portals[0]?.childSceneId);
          setLoadError(error instanceof Error ? error.message : "Scene failed to load");
          setTransitionState("idle");
          setTransitionTarget(null);
          setOutgoingScene(null);
          setLoading(false);
          navigationPhaseRef.current = "idle";
          transitionTargetIdRef.current = null;
          transitionStartedAtRef.current = 0;
          transitionWasWarmRef.current = false;
          pendingPortalRef.current = null;
          transitionUsesContinuityRef.current = false;
          pendingContinuitySettleRef.current = null;
          setContinuousTransitionActive(false);
          setTransitionCache("idle");
        }
        return false;
      } finally {
        if (navigationRef.current === controller) navigationRef.current = null;
      }
    },
    [beginSceneCommit, history, scene, settleScene],
  );

  const goBack = useCallback((source: "zoom" | "pointer" | "keyboard" = "pointer") => {
    if (history.length < 2 || sceneControlsLocked) return;
    void navigate(history[history.length - 2].id, "back", source);
  }, [history, navigate, sceneControlsLocked]);

  const goToBreadcrumb = useCallback(
    (index: number, source: "pointer" | "keyboard") => {
      if (index === history.length - 1 || !scene || sceneControlsLocked) return;
      const target = history[index];
      void navigate(target.id, "back", source, index);
    },
    [history, navigate, scene, sceneControlsLocked],
  );

  const enterPortalFromMinimap = useCallback((
    portal: Portal,
    source: "pointer" | "keyboard",
  ) => {
    if (sceneControlsLocked) return;
    activePortalNavigatorRef.current?.(portal.id, source);
  }, [sceneControlsLocked]);

  const registerPortalNavigator = useCallback((navigator: ScenePortalNavigator | null) => {
    activePortalNavigatorRef.current = navigator;
  }, []);

  const handleViewportMotionFrozen = useCallback((frozen: boolean) => {
    setViewportMotionFrozen(frozen);
    if (frozen || navigationPhaseRef.current !== "settling") return;
    navigationPhaseRef.current = "idle";
    setContinuousTransitionActive(false);
    setSceneContinuityView(undefined);
    const dispatchSettled = pendingContinuitySettleRef.current;
    pendingContinuitySettleRef.current = null;
    dispatchSettled?.();
  }, []);

  const sceneTitle = useMemo(() => {
    if (!scene) return "Opening the world";
    return meaningVisible && scene.translation ? `${scene.title} · ${scene.translation}` : scene.title;
  }, [meaningVisible, scene]);

  const setMeaningPreference = useCallback((visible: boolean) => {
    setMeaningVisible(visible);
    window.localStorage.setItem(MEANING_KEY, String(visible));
  }, []);

  const recordEncounteredLabels = useCallback((labels: readonly Label[]) => {
    if (labels.length === 0) return;
    const next = recordDiscoveredLabels(discoveredEntriesRef.current, labels);
    const serialized = serializeDiscoveredEntries(next);
    discoveredEntriesRef.current = next;
    try {
      window.localStorage.setItem(DISCOVERED_KEY, serialized);
    } catch {
      // The in-memory count remains truthful when storage is unavailable.
    }
    setDiscoveredCount(next.size);
  }, []);

  const recordEncounteredLabel = useCallback((label: Label) => {
    recordEncounteredLabels([label]);
  }, [recordEncounteredLabels]);

  const recordViewportSnapshot = useCallback((snapshot: SceneViewportSnapshot) => {
    activeViewportSnapshotRef.current = snapshot;
  }, []);

  const openLexicalOverview = useCallback((source: "pointer" | "keyboard") => {
    setLexicalWorldEntry(null);
    setLexicalWorldInitialFocus(source === "keyboard" ? "search" : "auto");
    setLexicalWorldOpen(true);
  }, []);

  const selectedLabelRealmId = selectedLabel?.lexemeId
    ? SPATIAL_REALM_BY_LEXEME[selectedLabel.lexemeId]
    : undefined;

  return (
    <main
      className="world-app"
      data-testid="world-app"
      data-scene-id={scene?.id ?? "loading"}
      data-scene-loading={String(loading)}
      data-transition-state={transitionState}
      data-transition-cache={transitionCache}
      aria-busy={loading}
    >
      <header
        className="app-header"
        inert={lexicalWorldOpen ? true : undefined}
        aria-hidden={lexicalWorldOpen ? true : undefined}
      >
        <a href="#world" className="brand" aria-label="HelloWords home">
          <span className="brand-mark">H</span>
          <span><strong>HelloWords</strong><small>词境</small></span>
        </a>
        <nav className="breadcrumbs" aria-label="Scene breadcrumb">
          {history.map((item, index) => (
            <span key={`${item.id}-${index}`}>
              {index > 0 ? <i aria-hidden="true">/</i> : null}
              <button
                type="button"
                onClick={(event) => goToBreadcrumb(index, event.detail === 0 ? "keyboard" : "pointer")}
                disabled={sceneControlsLocked || index === history.length - 1}
              >
                {item.title}
              </button>
            </span>
          ))}
        </nav>
        <div className="header-actions">
          <span className="discovery-count" aria-label={`已遇见 ${discoveredCount} 个词`}>
            <i aria-hidden="true" /><span>已遇见</span><b>{discoveredCount}</b>
          </span>
          <button
            type="button"
            className="atlas-button"
            onClick={(event) => openLexicalOverview(event.detail === 0 ? "keyboard" : "pointer")}
            aria-label="打开 10 个视觉领域、758 个分层入口和 10,000 个词"
            aria-haspopup="dialog"
            aria-expanded={lexicalWorldOpen}
            disabled={sceneControlsLocked}
          >
            <span aria-hidden="true">万</span>
            <span className="atlas-button-label atlas-button-label--desktop">10 领域 · 10,000 词</span>
            <span className="atlas-button-label atlas-button-label--mobile">10,000 词</span>
          </button>
          <button
            type="button"
            className="meaning-toggle"
            data-testid="meaning-toggle"
            aria-pressed={meaningVisible}
            disabled={sceneControlsLocked}
            onClick={() => setMeaningPreference(!meaningVisible)}
          >
            <span className="toggle-track"><span /></span>
            释义
          </button>
        </div>
      </header>

      <section
        id="world"
        className="world-stage"
        inert={lexicalWorldOpen ? true : undefined}
        aria-hidden={lexicalWorldOpen ? true : undefined}
      >
        <aside
          className="scene-minimap"
          data-testid="scene-minimap"
          data-scene-id={scene?.id ?? "loading"}
          data-child-count={scene?.portals.length ?? 0}
          data-terminal={String(Boolean(scene && scene.portals.length === 0))}
          data-continuous={sceneContinuityView ? "true" : undefined}
          aria-label="场景小地图"
        >
          <div className="scene-minimap__heading">
            <span aria-hidden="true">{String(history.length).padStart(2, "0")}</span>
            <h1
              key={`title-${scene?.id ?? "loading"}`}
              ref={sceneHeadingRef}
              data-testid="scene-minimap-title"
              tabIndex={-1}
            >
              {sceneTitle}
            </h1>
          </div>
          <nav
            className="scene-minimap__path"
            data-testid="scene-minimap-path"
            aria-label="Current scene path"
          >
            {history.map((item, index) => {
              const current = index === history.length - 1;
              return (
                <span key={`map-${item.id}-${index}`}>
                  {index > 0 ? <i aria-hidden="true">›</i> : null}
                  {current ? (
                    <em
                      data-testid="scene-minimap-breadcrumb"
                      data-scene-id={item.id}
                      data-current="true"
                      aria-current="page"
                    >
                      {item.title}
                    </em>
                  ) : (
                    <button
                      type="button"
                      data-testid="scene-minimap-breadcrumb"
                      data-scene-id={item.id}
                      data-current="false"
                      onClick={(event) => goToBreadcrumb(
                        index,
                        event.detail === 0 ? "keyboard" : "pointer",
                      )}
                      disabled={sceneControlsLocked}
                    >
                      {item.title}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <div
            className="scene-minimap__children"
            data-testid="scene-minimap-children"
            data-child-count={scene?.portals.length ?? 0}
            aria-label="Direct child scenes"
          >
            {scene?.portals.length ? scene.portals.map((portal) => {
              const targetTitle = sceneTitles[portal.childSceneId] ?? portal.label;
              return (
                <button
                  key={portal.id}
                  type="button"
                  data-testid="scene-minimap-child"
                  data-portal-id={portal.id}
                  data-target-scene={portal.childSceneId}
                  data-navigation="portal-continuity"
                  onPointerEnter={() => { void prefetchPreferredScene(portal.childSceneId); }}
                  onFocus={() => { void prefetchPreferredScene(portal.childSceneId); }}
                  onClick={(event) => enterPortalFromMinimap(
                    portal,
                    event.detail === 0 ? "keyboard" : "pointer",
                  )}
                  disabled={sceneControlsLocked}
                  aria-label={`进入 ${targetTitle}`}
                >
                  <span aria-hidden="true">↘</span>{targetTitle}
                </button>
              );
            }) : scene ? (
              <span className="scene-minimap__terminal" data-testid="scene-minimap-terminal">
                <i aria-hidden="true" />已到最深层
              </span>
            ) : null}
            {scene ? (
              <button
                type="button"
                className="scene-minimap__lexical"
                data-testid="scene-minimap-lexical"
                onClick={(event) => openLexicalOverview(event.detail === 0 ? "keyboard" : "pointer")}
                disabled={sceneControlsLocked}
                aria-label="打开由 10 个彩色领域组成的 10,000 词语义大图"
              >
                <span aria-hidden="true" />万词大图 <b>10,000</b>
              </button>
            ) : null}
          </div>
        </aside>
        {scene ? (
          <>
            {outgoingScene ? (
              <SceneViewport
                key={outgoingScene.id}
                scene={outgoingScene}
                meaningVisible={meaningVisible}
                portalTargetTitles={sceneTitles}
                transitionPhase="outgoing"
                interactionLocked
                onCommitScene={() => false}
                onEnterScene={async () => false}
                onExitScene={() => undefined}
                onLabelsEncountered={() => undefined}
                onLabelEncountered={() => undefined}
                onSelectWord={() => undefined}
                onPrefetchScene={() => undefined}
              />
            ) : null}
            <SceneViewport
              key={scene.id}
              scene={scene}
              meaningVisible={meaningVisible}
              portalTargetTitles={sceneTitles}
              transitionPhase={outgoingScene ? "incoming" : "active"}
              interactionLocked={sceneControlsLocked}
              onCommitScene={beginSceneCommit}
              onEnterScene={(sceneId, source) => navigate(sceneId, "forward", source)}
              onExitScene={() => goBack("zoom")}
              onLabelsEncountered={recordEncounteredLabels}
              onLabelEncountered={recordEncounteredLabel}
              onSelectWord={setSelectedLabel}
              onPrefetchScene={prefetchPreferredScene}
              initialView={sceneContinuityView}
              onCameraFrame={recordViewportSnapshot}
              onMotionFrozenChange={handleViewportMotionFrozen}
              onPortalNavigatorReady={registerPortalNavigator}
            />
          </>
        ) : (
          <div className="opening-state"><span /><p>正在展开词汇世界…</p></div>
        )}
        {loading && scene && transitionState === "loading" && transitionCache === "cold" ? (
          <div className="loading-pill" role="status">
            {transitionTarget ? `正在展开 ${transitionTarget} 的细节…` : "正在展开细节…"}
          </div>
        ) : null}
        {transitionState !== "idle" && transitionTarget && !continuousTransitionActive ? (
          <div className="scene-transition-veil" data-state={transitionState} aria-hidden="true">
            <span />
            <strong>{transitionTarget}</strong>
          </div>
        ) : null}
        {loadError ? <div className="error-pill" role="alert">{loadError}</div> : null}
        {history.length > 1 ? (
          <button
            type="button"
            className="back-button"
            onClick={(event) => goBack(event.detail === 0 ? "keyboard" : "pointer")}
            disabled={sceneControlsLocked}
          >
            ← 返回上一层
          </button>
        ) : null}
        {selectedLabel ? (
          <aside className="word-dock" aria-label={`${selectedLabel.word} word details`}>
            <button
              type="button"
              className="word-dock-close"
              onClick={() => setSelectedLabel(null)}
              aria-label="关闭单词卡"
            >
              ×
            </button>
            <span className="eyebrow">WORD ENCOUNTER</span>
            <strong>{selectedLabel.word}</strong>
            <p>{selectedLabel.translation}</p>
            <button
              type="button"
              className="listen-button"
              onClick={() => {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(selectedLabel.word);
                utterance.lang = "en-US";
                utterance.rate = 0.86;
                window.speechSynthesis.speak(utterance);
              }}
            >
              <span aria-hidden="true">◖))</span> 听发音
            </button>
            {selectedLabelRealmId ? (
              <button
                type="button"
                className="lexical-bridge-button"
                onClick={() => {
                  setLexicalWorldEntry({ realmId: selectedLabelRealmId, word: selectedLabel.word });
                  setLexicalWorldInitialFocus("dialog");
                  setLexicalWorldOpen(true);
                }}
                aria-label={`从实景词 ${selectedLabel.word} 进入万词世界的相关语义领域`}
              >
                <span aria-hidden="true">↗</span>
                从这个实景词进入相关词域
              </button>
            ) : null}
          </aside>
        ) : null}
      </section>

      <div
        className="scene-announcement sr-only"
        aria-live="polite"
        aria-hidden={lexicalWorldOpen ? true : undefined}
      >
        {announcedSceneTitle ? `Entered ${announcedSceneTitle}` : ""}
      </div>
      <LexicalWorld
        open={lexicalWorldOpen}
        onClose={() => setLexicalWorldOpen(false)}
        showMeanings={meaningVisible}
        onShowMeaningsChange={setMeaningPreference}
        initialFocus={lexicalWorldInitialFocus}
        initialRealmId={lexicalWorldEntry?.realmId}
        spatialEntryWord={lexicalWorldEntry?.word}
      />
    </main>
  );
}
