"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SceneViewport } from "./SceneViewport";
import { SemanticAtlas } from "./SemanticAtlas";
import {
  loadScene,
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
  const [history, setHistory] = useState<Scene[]>([]);
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitionKey, setTransitionKey] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const navigationRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedMeaningVisible = window.localStorage.getItem(MEANING_KEY) === "true";
    queueMicrotask(() => setMeaningVisible(storedMeaningVisible));
    const controller = new AbortController();
    void loadSceneManifest(controller.signal)
      .then((manifest) => prepareScene(manifest.rootSceneId, controller.signal))
      .then((initialScene) => {
        setScene(initialScene);
        setHistory([initialScene]);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Scene failed to load");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

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
          <span className="discovery-count" aria-label={`已遇见 ${discoveredCount} 个词`}>
            <i aria-hidden="true" /><span>已遇见</span><b>{discoveredCount}</b>
          </span>
          <button type="button" className="atlas-button" onClick={() => setAtlasOpen(true)} aria-label="打开 10,000+ 词汇宇宙">
            <span aria-hidden="true">⌕</span><span className="atlas-button-label">10,000+ 词汇宇宙</span>
          </button>
          <button
            type="button"
            className="meaning-toggle"
            data-testid="meaning-toggle"
            aria-pressed={meaningVisible}
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
            onSelectWord={setSelectedLabel}
            onPrefetchScene={prefetchScene}
          />
        ) : (
          <div className="opening-state"><span /><p>正在展开词汇世界…</p></div>
        )}
        {loading && scene ? <div className="loading-pill" role="status">正在进入下一层…</div> : null}
        {loadError ? <div className="error-pill" role="alert">{loadError}</div> : null}
        {history.length > 1 ? (
          <button type="button" className="back-button" onClick={goBack} disabled={loading}>← 返回上一层</button>
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
        {scene ? `Entered ${scene.title}` : ""}
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
