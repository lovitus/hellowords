"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SceneViewport } from "./SceneViewport";
import { VocabularyAtlas } from "./VocabularyAtlas";
import { loadScene, prefetchScene, prepareScene, type Scene } from "../lib/scene-repository";

const ROOT_SCENE = "apartment";
const MEANING_KEY = "hellowords:meaning-visible";

export function WorldApp() {
  const [scene, setScene] = useState<Scene | null>(null);
  const [history, setHistory] = useState<Scene[]>([]);
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitionKey, setTransitionKey] = useState(0);
  const navigationRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedMeaningVisible = window.localStorage.getItem(MEANING_KEY) === "true";
    queueMicrotask(() => setMeaningVisible(storedMeaningVisible));
    const controller = new AbortController();
    void prepareScene(ROOT_SCENE, controller.signal)
      .then((initialScene) => {
        setScene(initialScene);
        setHistory([initialScene]);
        initialScene.portals.slice(0, 1).forEach((portal) => prefetchScene(portal.childSceneId));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Scene failed to load");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

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

  const navigate = useCallback(
    async (targetId: string, direction: "forward" | "back") => {
      if (!scene || targetId === scene.id) return;
      navigationRef.current?.abort();
      const controller = new AbortController();
      navigationRef.current = controller;
      const startedAt = performance.now();
      performance.mark("scene-transition-start");
      setLoading(true);
      setLoadError(null);
      try {
        const nextScene = await prepareScene(targetId, controller.signal);
        if (controller.signal.aborted) return;
        setScene(nextScene);
        setHistory((current) =>
          direction === "forward" ? [...current, nextScene] : current.slice(0, -1),
        );
        setTransitionKey((key) => key + 1);
        nextScene.portals.slice(0, 1).forEach((portal) => prefetchScene(portal.childSceneId));
        settleScene(scene.id, nextScene, startedAt);
      } catch (error: unknown) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Scene failed to load");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [scene, settleScene],
  );

  const goBack = useCallback(() => {
    if (history.length < 2) return;
    void navigate(history[history.length - 2].id, "back");
  }, [history, navigate]);

  const goToBreadcrumb = useCallback(
    (index: number) => {
      if (index === history.length - 1 || !scene || loading) return;
      const target = history[index];
      navigationRef.current?.abort();
      const startedAt = performance.now();
      performance.mark("scene-transition-start");
      setLoading(true);
      void loadScene(target.id)
        .then((nextScene) => {
          setScene(nextScene);
          setHistory((current) => current.slice(0, index + 1));
          setTransitionKey((key) => key + 1);
          settleScene(scene.id, nextScene, startedAt);
        })
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Scene failed to load"))
        .finally(() => setLoading(false));
    },
    [history, loading, scene, settleScene],
  );

  const sceneTitle = useMemo(() => {
    if (!scene) return "Opening the world";
    return meaningVisible && scene.translation ? `${scene.title} · ${scene.translation}` : scene.title;
  }, [meaningVisible, scene]);

  return (
    <main
      className="world-app"
      data-testid="world-app"
      data-scene-id={scene?.id ?? "loading"}
      data-scene-loading={String(loading)}
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
              <button type="button" onClick={() => goToBreadcrumb(index)} disabled={loading || index === history.length - 1}>
                {item.title}
              </button>
            </span>
          ))}
        </nav>
        <div className="header-actions">
          <button type="button" className="atlas-button" onClick={() => setAtlasOpen(true)} aria-label="10,000+ 词汇地图">
            <span aria-hidden="true">⌕</span><span className="atlas-button-label">10,000+ 词汇地图</span>
          </button>
          <button
            type="button"
            className="meaning-toggle"
            data-testid="meaning-toggle"
            aria-pressed={meaningVisible}
            onClick={() => {
              const next = !meaningVisible;
              setMeaningVisible(next);
              window.localStorage.setItem(MEANING_KEY, String(next));
            }}
          >
            <span className="toggle-track"><span /></span>
            释义
          </button>
        </div>
      </header>

      <section id="world" className="world-stage">
        <div className="scene-heading">
          <span className="eyebrow">EXPLORE / {String(history.length).padStart(2, "0")}</span>
          <h1>{sceneTitle}</h1>
          <p>{scene?.subtitle ?? "Loading a quiet place…"}</p>
        </div>
        {scene ? (
          <SceneViewport
            scene={scene}
            meaningVisible={meaningVisible}
            transitionKey={transitionKey}
            onEnterScene={(sceneId) => void navigate(sceneId, "forward")}
            onExitScene={goBack}
          />
        ) : (
          <div className="opening-state"><span /><p>正在展开词汇世界…</p></div>
        )}
        {loading && scene ? <div className="loading-pill" role="status">正在进入下一层…</div> : null}
        {loadError ? <div className="error-pill" role="alert">{loadError}</div> : null}
        {history.length > 1 ? (
          <button type="button" className="back-button" onClick={goBack} disabled={loading}>← 返回上一层</button>
        ) : null}
      </section>

      <div className="scene-announcement sr-only" aria-live="polite">
        {scene ? `Entered ${scene.title}` : ""}
      </div>
      <VocabularyAtlas open={atlasOpen} onClose={() => setAtlasOpen(false)} />
      {atlasOpen ? <button className="atlas-scrim" type="button" onClick={() => setAtlasOpen(false)} aria-label="Close vocabulary atlas" /> : null}
    </main>
  );
}
