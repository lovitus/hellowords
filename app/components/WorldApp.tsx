"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SceneViewport } from "./SceneViewport";
import { SemanticAtlas } from "./SemanticAtlas";
import {
  loadSceneManifest,
  prefetchScene,
  prepareScene,
  type Scene,
} from "../lib/scene-repository";
import type { Label } from "../domain";

const MEANING_KEY = "hellowords:meaning-visible";
const DISCOVERED_KEY = "hellowords:discovered-words";

export function WorldApp() {
  const [scene, setScene] = useState<Scene | null>(null);
  const [outgoingScene, setOutgoingScene] = useState<Scene | null>(null);
  const [history, setHistory] = useState<Scene[]>([]);
  const [sceneTitles, setSceneTitles] = useState<Record<string, string>>({});
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitionState, setTransitionState] = useState<"loading" | "incoming" | "idle">("loading");
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const [announcedSceneTitle, setAnnouncedSceneTitle] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const navigationRef = useRef<AbortController | null>(null);
  const sceneHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterNavigationRef = useRef(false);
  const navigationPhaseRef = useRef<"idle" | "committing" | "navigating">("idle");
  const transitionTargetIdRef = useRef<string | null>(null);
  const transitionStartedAtRef = useRef(0);

  useEffect(() => {
    const storedMeaningVisible = window.localStorage.getItem(MEANING_KEY) === "true";
    queueMicrotask(() => setMeaningVisible(storedMeaningVisible));
    const controller = new AbortController();
    void loadSceneManifest(controller.signal)
      .then((manifest) => {
        setSceneTitles(Object.fromEntries(manifest.scenes.map((item) => [item.id, item.title])));
        return prepareScene(manifest.rootSceneId, controller.signal);
      })
      .then((initialScene) => {
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
    let discovered: string[] = [];
    try {
      const stored = JSON.parse(window.localStorage.getItem(DISCOVERED_KEY) ?? "[]") as unknown;
      if (Array.isArray(stored)) discovered = stored.filter((word): word is string => typeof word === "string");
    } catch {
      discovered = [];
    }
    const next = new Set(discovered);
    scene.labels.forEach((label) => next.add(label.word.toLocaleLowerCase()));
    const serialized = [...next].sort();
    window.localStorage.setItem(DISCOVERED_KEY, JSON.stringify(serialized));
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setDiscoveredCount(serialized.length);
      setSelectedLabel(null);
    });
    return () => {
      active = false;
    };
  }, [scene]);

  useEffect(() => {
    if (!scene || scene.portals.length !== 1) return;
    const target = scene.portals[0].childSceneId;
    const prefetch = () => prefetchScene(target);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(prefetch, { timeout: 1_500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(prefetch, 900);
    return () => window.clearTimeout(handle);
  }, [scene]);

  const settleScene = useCallback((from: string, nextScene: Scene, startedAt: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const finishedAt = performance.now();
        performance.measure("scene-transition", { start: startedAt, end: finishedAt });
        window.dispatchEvent(
          new CustomEvent("world:scene-settled", {
            detail: { from, to: nextScene.id, durationMs: finishedAt - startedAt },
          }),
        );
      });
    });
  }, []);

  const beginSceneCommit = useCallback((
    targetId: string,
    source: "zoom" | "pointer" | "keyboard",
  ): boolean => {
    if (navigationPhaseRef.current !== "idle") return false;
    navigationPhaseRef.current = "committing";
    transitionTargetIdRef.current = targetId;
    transitionStartedAtRef.current = performance.now();
    performance.mark("scene-transition-start");
    focusHeadingAfterNavigationRef.current = source === "keyboard";
    setTransitionTarget(sceneTitles[targetId] ?? targetId);
    setTransitionState("loading");
    setLoading(true);
    setLoadError(null);
    return true;
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
      try {
        // Keep the committed target visible for at least one paint, even when
        // the decoded child scene is already in memory.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const nextScene = await prepareScene(targetId, controller.signal);
        if (controller.signal.aborted) return false;
        setOutgoingScene(scene);
        setScene(nextScene);
        setHistory((current) =>
          direction === "forward"
            ? [...current, nextScene]
            : current.slice(0, historyIndex === undefined ? -1 : historyIndex + 1),
        );
        setTransitionState("incoming");
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        await new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 80 : 220));
        if (controller.signal.aborted) return false;
        setOutgoingScene(null);
        setTransitionState("idle");
        setTransitionTarget(null);
        setLoading(false);
        setAnnouncedSceneTitle(nextScene.title);
        navigationPhaseRef.current = "idle";
        transitionTargetIdRef.current = null;
        transitionStartedAtRef.current = 0;
        settleScene(scene.id, nextScene, startedAt);
        if (focusHeadingAfterNavigationRef.current) {
          requestAnimationFrame(() => sceneHeadingRef.current?.focus({ preventScroll: true }));
        }
        return true;
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Scene failed to load");
          setTransitionState("idle");
          setTransitionTarget(null);
          setOutgoingScene(null);
          setLoading(false);
          navigationPhaseRef.current = "idle";
          transitionTargetIdRef.current = null;
          transitionStartedAtRef.current = 0;
        }
        return false;
      } finally {
        if (navigationRef.current === controller) navigationRef.current = null;
      }
    },
    [beginSceneCommit, scene, settleScene],
  );

  const goBack = useCallback((source: "zoom" | "pointer" | "keyboard" = "pointer") => {
    if (history.length < 2) return;
    void navigate(history[history.length - 2].id, "back", source);
  }, [history, navigate]);

  const goToBreadcrumb = useCallback(
    (index: number, source: "pointer" | "keyboard") => {
      if (index === history.length - 1 || !scene || loading) return;
      const target = history[index];
      void navigate(target.id, "back", source, index);
    },
    [history, loading, navigate, scene],
  );

  const sceneTitle = useMemo(() => {
    if (!scene) return "Opening the world";
    return meaningVisible && scene.translation ? `${scene.title} · ${scene.translation}` : scene.title;
  }, [meaningVisible, scene]);

  const setMeaningPreference = useCallback((visible: boolean) => {
    setMeaningVisible(visible);
    window.localStorage.setItem(MEANING_KEY, String(visible));
  }, []);

  return (
    <main
      className="world-app"
      data-testid="world-app"
      data-scene-id={scene?.id ?? "loading"}
      data-scene-loading={String(loading)}
      data-transition-state={transitionState}
      aria-busy={loading}
    >
      <header className="app-header">
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
                disabled={loading || index === history.length - 1}
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
          <button type="button" className="atlas-button" onClick={() => setAtlasOpen(true)} aria-label="打开 10,000+ 词汇宇宙" disabled={loading}>
            <span aria-hidden="true">⌕</span><span className="atlas-button-label">10,000+ 词汇宇宙</span>
          </button>
          <button
            type="button"
            className="meaning-toggle"
            data-testid="meaning-toggle"
            aria-pressed={meaningVisible}
            disabled={loading}
            onClick={() => setMeaningPreference(!meaningVisible)}
          >
            <span className="toggle-track"><span /></span>
            释义
          </button>
        </div>
      </header>

      <section id="world" className="world-stage">
        <div className="scene-heading">
          <span className="eyebrow">EXPLORE / {String(history.length).padStart(2, "0")}</span>
          <h1 ref={sceneHeadingRef} tabIndex={-1}>{sceneTitle}</h1>
          <p>{scene?.subtitle ?? "Loading a quiet place…"}</p>
        </div>
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
              interactionLocked={loading}
              onCommitScene={beginSceneCommit}
              onEnterScene={(sceneId, source) => navigate(sceneId, "forward", source)}
              onExitScene={() => goBack("zoom")}
              onSelectWord={setSelectedLabel}
              onPrefetchScene={prefetchScene}
            />
          </>
        ) : (
          <div className="opening-state"><span /><p>正在展开词汇世界…</p></div>
        )}
        {loading && scene ? (
          <div className="loading-pill" role="status">
            {transitionTarget ? `正在进入 ${transitionTarget}…` : "正在展开下一层…"}
          </div>
        ) : null}
        {transitionState !== "idle" && transitionTarget ? (
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
            disabled={loading}
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
          </aside>
        ) : null}
      </section>

      <div className="scene-announcement sr-only" aria-live="polite">
        {announcedSceneTitle ? `Entered ${announcedSceneTitle}` : ""}
      </div>
      <SemanticAtlas
        open={atlasOpen}
        onClose={() => setAtlasOpen(false)}
        showMeanings={meaningVisible}
        onShowMeaningsChange={setMeaningPreference}
      />
    </main>
  );
}
