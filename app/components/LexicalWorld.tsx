"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  activeLexicalLabelBudget,
  computeLexicalVirtualWindow,
  createLexicalWorldRepository,
  isLatestLexicalRequest,
  nextLexicalFocusIndex,
  resolveLexicalInitialFocus,
  type LexicalInitialFocus,
  type LexicalLevelDescriptor,
  type LexicalWord,
  type LexicalWorldManifest,
} from "../lib/lexical-world-repository";
import { LEXICAL_WORLD_OVERVIEW_IMAGE } from "../lib/lexical-world-visuals";
import "./lexical-world.css";

export interface LexicalWorldProps {
  open: boolean;
  onClose: () => void;
  /** Controlled translation state shared with the scene viewer. */
  showMeanings: boolean;
  onShowMeaningsChange?: (visible: boolean) => void;
  manifestUrl?: string;
  initialQuery?: string;
  /** Auto focuses search on desktop, but the dialog itself on touch-sized screens. */
  initialFocus?: LexicalInitialFocus;
  onSelectWord?: (word: LexicalWord) => void;
}

interface LevelPayload {
  readonly id: string;
  readonly children: readonly LexicalLevelDescriptor[];
  readonly words: readonly LexicalWord[];
}

interface SeenProgress {
  readonly wordIds: Readonly<Record<string, true>>;
  readonly counts: Readonly<Record<string, number>>;
}

interface RealmVisual {
  readonly accent: string;
  readonly backgroundPosition: string;
}

const EMPTY_PROGRESS: SeenProgress = { wordIds: {}, counts: {} };
const PROGRESS_KEY = "hellowords.lexical-world.progress.v1";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const REALM_VISUALS: Readonly<Record<string, RealmVisual>> = {
  "nature-life": { accent: "#4f8a66", backgroundPosition: "8% 14%" },
  "body-daily-life": { accent: "#c96f58", backgroundPosition: "37% 12%" },
  "objects-technology": { accent: "#557da0", backgroundPosition: "66% 13%" },
  "people-society": { accent: "#a45e6d", backgroundPosition: "93% 16%" },
  "mind-values": { accent: "#7d6aaa", backgroundPosition: "9% 54%" },
  "language-culture": { accent: "#ac733e", backgroundPosition: "38% 53%" },
  "actions-events": { accent: "#c65c45", backgroundPosition: "67% 52%" },
  "space-time-measure": { accent: "#408692", backgroundPosition: "93% 55%" },
  "qualities-states": { accent: "#747d55", backgroundPosition: "16% 90%" },
  "grammar-relations": { accent: "#706f87", backgroundPosition: "58% 89%" },
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function visualFor(id: string, parentId?: string): RealmVisual {
  return REALM_VISUALS[id] ?? REALM_VISUALS[parentId ?? ""] ?? {
    accent: "#476d60",
    backgroundPosition: "50% 50%",
  };
}

function readProgress(): SeenProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<SeenProgress>;
    return {
      wordIds: parsed.wordIds && typeof parsed.wordIds === "object" ? parsed.wordIds : {},
      counts: parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {},
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(progress: SeenProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Private browsing and quota limits should never block exploration.
  }
}

function getUnexplored(descriptor: LexicalLevelDescriptor, progress: SeenProgress): number {
  return Math.max(0, descriptor.count - (progress.counts[descriptor.id] ?? 0));
}

function realmFromPath(path: readonly LexicalLevelDescriptor[]): LexicalLevelDescriptor | undefined {
  return path.find((level) => level.kind === "realm");
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
}

function LevelCard({
  descriptor,
  progress,
  realmId,
  onEnter,
  onPrefetch,
}: {
  descriptor: LexicalLevelDescriptor;
  progress: SeenProgress;
  realmId?: string;
  onEnter: (descriptor: LexicalLevelDescriptor) => void;
  onPrefetch: (descriptor: LexicalLevelDescriptor) => void;
}) {
  const visual = visualFor(descriptor.id, realmId);
  const unexplored = getUnexplored(descriptor, progress);
  const style = {
    "--lexical-accent": descriptor.color ?? visual.accent,
    "--lexical-card-position": visual.backgroundPosition,
    "--lexical-overview-image": `url(${LEXICAL_WORLD_OVERVIEW_IMAGE})`,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`lexical-world__level-card lexical-world__level-card--${descriptor.kind}`}
      style={style}
      onClick={() => onEnter(descriptor)}
      onPointerEnter={() => onPrefetch(descriptor)}
      onFocus={() => onPrefetch(descriptor)}
      aria-label={`进入${descriptor.labelZh || descriptor.labelEn}，${formatCount(descriptor.count)} 个词，${formatCount(unexplored)} 个未探索`}
    >
      <span className="lexical-world__level-photo" aria-hidden="true" />
      <span className="lexical-world__level-content">
        <span className="lexical-world__level-kicker">
          {descriptor.kind === "realm" ? "领域" : descriptor.kind === "topic" ? "主题" : "词群"}
          <i aria-hidden="true" />
        </span>
        <strong>{descriptor.labelEn}</strong>
        {descriptor.labelZh ? <span className="lexical-world__level-translation">{descriptor.labelZh}</span> : null}
        <span className="lexical-world__level-stats">
          <b>{formatCount(descriptor.count)}</b> 词
          <span>·</span>
          <em>{formatCount(unexplored)} 未探索</em>
        </span>
        {descriptor.previewWords.length ? (
          <span className="lexical-world__preview-words" aria-hidden="true">
            {descriptor.previewWords.slice(0, descriptor.kind === "realm" ? 4 : 3).map((preview) => (
              <i key={preview.id}>{preview.word}</i>
            ))}
          </span>
        ) : null}
        <span className="lexical-world__enter-cue">
          进入探索
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 4 6 6-6 6" /></svg>
        </span>
      </span>
    </button>
  );
}

function WordField({
  descriptor,
  words,
  showMeanings,
  selectedId,
  onSelect,
}: {
  descriptor: LexicalLevelDescriptor;
  words: readonly LexicalWord[];
  showMeanings: boolean;
  selectedId?: string;
  onSelect: (word: LexicalWord) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 900, height: 560, scrollTop: 0 });
  const [density, setDensity] = useState<0 | 1 | 2>(1);
  const orderedWords = useMemo(
    () => [...words].sort((left, right) => left.rank - right.rank || left.word.localeCompare(right.word)),
    [words],
  );
  const minimumCardWidth = density === 0 ? 128 : density === 1 ? 168 : 214;
  const rowHeight = (density === 0 ? 72 : density === 1 ? 90 : 116) + (showMeanings ? 28 : 0);
  const virtualWindow = computeLexicalVirtualWindow({
    itemCount: orderedWords.length,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    scrollTop: viewport.scrollTop,
    minimumCardWidth,
    rowHeight,
    budget: activeLexicalLabelBudget(viewport.width),
  });
  const visibleWords = orderedWords.slice(virtualWindow.start, virtualWindow.end);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport((current) => ({
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
      scrollTop: current.scrollTop,
    }));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    element.scrollTo({ top: 0 });
    setViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [descriptor.id]);

  useEffect(() => {
    if (!selectedId || !viewportRef.current) return;
    const index = orderedWords.findIndex((word) => word.id === selectedId);
    if (index < 0) return;
    const row = Math.floor(index / virtualWindow.columns);
    const top = Math.max(0, row * virtualWindow.rowHeight - viewport.height * 0.35);
    viewportRef.current.scrollTo({ top, behavior: "smooth" });
  }, [orderedWords, selectedId, viewport.height, virtualWindow.columns, virtualWindow.rowHeight]);

  const changeDensity = useCallback((delta: number) => {
    setDensity((current) => Math.max(0, Math.min(2, current + delta)) as 0 | 1 | 2);
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const zoom = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeDensity(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener("wheel", zoom, { passive: false });
    return () => element.removeEventListener("wheel", zoom);
  }, [changeDensity]);

  return (
    <section className="lexical-world__word-field" aria-label={`${descriptor.labelZh || descriptor.labelEn}词汇`}>
      <div className="lexical-world__word-toolbar">
        <div>
          <span>本词群全部词汇</span>
          <strong>{formatCount(words.length)}</strong>
          <small>滚动可到达全部词，界面只渲染当前视口</small>
        </div>
        <div className="lexical-world__lod-control" aria-label="词卡细节级别">
          <span>{density === 0 ? "紧凑" : density === 1 ? "标准" : "音标细节"}</span>
          <button type="button" onClick={() => changeDensity(-1)} disabled={density === 0} aria-label="缩小词卡">−</button>
          <i aria-hidden="true"><b style={{ width: `${(density + 1) * 33.333}%` }} /></i>
          <button type="button" onClick={() => changeDensity(1)} disabled={density === 2} aria-label="放大词卡显示更多细节">＋</button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="lexical-world__word-scroll"
        role="region"
        data-lod={density}
        data-active-labels={visibleWords.length}
        data-label-budget={virtualWindow.budget}
        onScroll={(event) => {
          const element = event.currentTarget;
          setViewport({ width: element.clientWidth, height: element.clientHeight, scrollTop: element.scrollTop });
        }}
        aria-label={`词汇列表，共 ${words.length} 个。上下滚动浏览，按加号减号改变细节。`}
      >
        <div className="lexical-world__virtual-canvas" style={{ height: virtualWindow.totalHeight }}>
          <div
            className="lexical-world__word-grid"
            style={{
              top: virtualWindow.top,
              gridTemplateColumns: `repeat(${virtualWindow.columns}, minmax(0, 1fr))`,
              gridAutoRows: `${Math.max(1, virtualWindow.rowHeight - 12)}px`,
            }}
          >
            {visibleWords.map((word) => {
              const selected = selectedId === word.id;
              return (
                <button
                  type="button"
                  key={word.id}
                  data-lexical-word-id={word.id}
                  className={selected ? "is-selected" : undefined}
                  onClick={() => onSelect(word)}
                  aria-label={`${word.word}${word.meaning ? `，${word.meaning.split("\n")[0]}` : ""}`}
                >
                  <span className="lexical-world__word-rank">#{word.rank}</span>
                  <strong>{word.word}</strong>
                  {density >= 1 && word.partsOfSpeech.length ? <small>{word.partsOfSpeech.slice(0, 2).join(" · ")}</small> : null}
                  {density === 2 && word.phonetic ? <span className="lexical-world__word-phonetic">/{word.phonetic}/</span> : null}
                  {showMeanings ? <em>{word.meaning.split("\n")[0] || "暂无释义"}</em> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <footer className="lexical-world__word-range">
        <span>当前 {virtualWindow.start + (words.length ? 1 : 0)}–{virtualWindow.end} / {words.length}</span>
        <span>清晰 HTML 文字 · 未使用画布缩放</span>
      </footer>
    </section>
  );
}

export function LexicalWorld({
  open,
  onClose,
  showMeanings,
  onShowMeaningsChange,
  manifestUrl,
  initialQuery = "",
  initialFocus = "auto",
  onSelectWord,
}: LexicalWorldProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef(0);
  const pathRequestRef = useRef(0);
  const [path, setPath] = useState<readonly LexicalLevelDescriptor[]>([]);
  const [payload, setPayload] = useState<LevelPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<readonly LexicalWord[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<LexicalWord | null>(null);
  const [progress, setProgress] = useState<SeenProgress>(EMPTY_PROGRESS);
  const [announcement, setAnnouncement] = useState("");
  const repository = useMemo(() => createLexicalWorldRepository(manifestUrl), [manifestUrl]);
  const current = path[path.length - 1];
  const payloadReady = Boolean(status === "ready" && current && payload?.id === current.id);
  const children = payloadReady ? payload?.children ?? [] : [];
  const words = payloadReady ? payload?.words ?? [] : [];
  const realm = realmFromPath(path);
  const visual = visualFor(realm?.id ?? current?.id ?? "");

  const requestClose = useCallback(() => {
    searchRequestRef.current += 1;
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setSearching(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setQuery(initialQuery);
      setResults([]);
      setSelected(null);
      setSearching(false);
      setProgress(readProgress());
      setPath([]);
      setPayload(null);
      setStatus("loading");
    });
    return () => {
      active = false;
    };
  }, [initialQuery, open]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => {
      const target = resolveLexicalInitialFocus(
        initialFocus,
        window.innerWidth,
        window.matchMedia("(pointer: fine)").matches,
      );
      (target === "search" ? searchRef.current : dialogRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore?.isConnected) {
        requestAnimationFrame(() => restore.focus({ preventScroll: true }));
      }
    };
  }, [initialFocus, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (selected) {
          const selectedId = selected.id;
          setSelected(null);
          requestAnimationFrame(() => {
            const target = [...(dialogRef.current?.querySelectorAll<HTMLElement>("[data-lexical-word-id]") ?? [])]
              .find((element) => element.dataset.lexicalWordId === selectedId);
            (target ?? searchRef.current)?.focus({ preventScroll: true });
          });
        } else if (results.length) {
          setResults([]);
          searchRef.current?.focus({ preventScroll: true });
        } else {
          requestClose();
        }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = focusableElements(dialogRef.current);
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = nextLexicalFocusIndex(activeIndex, focusable.length, event.shiftKey);
      if (nextIndex < 0) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      event.preventDefault();
      focusable[nextIndex].focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, requestClose, results.length, selected]);

  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() => detailCloseRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    queueMicrotask(() => setStatus("loading"));
    void repository.loadManifest(controller.signal)
      .then((manifest) => {
        setPath([manifest]);
        // The overview descriptor is ready, but its navigable payload still
        // belongs to the path request below.
        setStatus("loading");
        setAnnouncement(`万词世界已打开，共 ${formatCount(manifest.count)} 个词`);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [open, repository]);

  useEffect(() => {
    const requestId = ++pathRequestRef.current;
    if (!open || !current) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (isLatestLexicalRequest(requestId, pathRequestRef.current, controller.signal)) {
        setStatus("loading");
      }
    });
    const load = current.kind === "subcluster"
      ? repository.loadWords(current, controller.signal).then((loadedWords) => ({
          id: current.id,
          children: [] as readonly LexicalLevelDescriptor[],
          words: loadedWords,
        }))
      : repository.loadChildren(current, controller.signal).then((loadedChildren) => ({
          id: current.id,
          children: loadedChildren,
          words: [] as readonly LexicalWord[],
        }));
    void load.then((nextPayload) => {
      if (!isLatestLexicalRequest(requestId, pathRequestRef.current, controller.signal)) return;
      setPayload(nextPayload);
      setStatus("ready");
      setAnnouncement(`${current.labelZh || current.labelEn}，${formatCount(current.count)} 个词`);
    }).catch(() => {
      if (isLatestLexicalRequest(requestId, pathRequestRef.current, controller.signal)) setStatus("error");
    });
    return () => controller.abort();
  }, [current, open, repository]);

  useEffect(() => {
    if (!open) {
      searchRequestRef.current += 1;
      searchControllerRef.current?.abort();
      searchControllerRef.current = null;
      return;
    }
    const requestId = ++searchRequestRef.current;
    searchControllerRef.current?.abort();
    const normalized = query.trim();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    if (!normalized) return () => controller.abort();
    const timer = window.setTimeout(() => {
      if (!isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) return;
      setSearching(true);
      void repository.find(normalized, controller.signal)
        .then((matches) => {
          if (!isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) return;
          setResults(matches);
          setSearching(false);
          setAnnouncement(matches.length ? `找到 ${matches.length} 个匹配词` : "没有找到匹配词");
        })
        .catch(() => {
          if (isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) setSearching(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (searchControllerRef.current === controller) searchControllerRef.current = null;
    };
  }, [open, query, repository]);

  const markSeen = useCallback((word: LexicalWord, wordPath: readonly LexicalLevelDescriptor[] = path) => {
    setProgress((currentProgress) => {
      if (currentProgress.wordIds[word.id]) return currentProgress;
      const counts = { ...currentProgress.counts };
      for (const level of wordPath) counts[level.id] = (counts[level.id] ?? 0) + 1;
      const next = {
        wordIds: { ...currentProgress.wordIds, [word.id]: true as const },
        counts,
      };
      saveProgress(next);
      return next;
    });
  }, [path]);

  const selectWord = useCallback((word: LexicalWord) => {
    setSelected(word);
    markSeen(word);
    onSelectWord?.(word);
    setAnnouncement(`${word.word}，${word.meaning.split("\n")[0]}`);
  }, [markSeen, onSelectWord]);

  const selectSearchResult = useCallback((word: LexicalWord) => {
    const requestId = ++searchRequestRef.current;
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearching(true);
    setStatus("loading");
    setAnnouncement(`正在前往 ${word.word} 所在词群`);
    void repository.resolvePath(word, controller.signal)
      .then((resolvedPath) => {
        if (!isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) return;
        setPath(resolvedPath);
        setResults([]);
        setSelected(word);
        markSeen(word, resolvedPath);
        onSelectWord?.(word);
        setSearching(false);
      })
      .catch(() => {
        if (isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) {
          setSearching(false);
          setStatus("error");
        }
      });
  }, [markSeen, onSelectWord, repository]);

  const enterLevel = useCallback((descriptor: LexicalLevelDescriptor) => {
    setSelected(null);
    setResults([]);
    setStatus("loading");
    setAnnouncement(`正在打开 ${descriptor.labelZh || descriptor.labelEn}`);
    setPath((currentPath) => [...currentPath, descriptor]);
  }, []);

  const goToLevel = useCallback((index: number) => {
    setSelected(null);
    setResults([]);
    setStatus("loading");
    setPath((currentPath) => currentPath.slice(0, index + 1));
  }, []);

  const prefetch = useCallback((descriptor: LexicalLevelDescriptor) => {
    void repository.prefetch(descriptor).catch(() => undefined);
  }, [repository]);

  if (!open) return null;

  const sceneStyle = {
    "--lexical-accent": current?.color ?? visual.accent,
    "--lexical-scene-position": visual.backgroundPosition,
    "--lexical-overview-image": `url(${LEXICAL_WORLD_OVERVIEW_IMAGE})`,
  } as CSSProperties;
  const totalUnexplored = current ? getUnexplored(current, progress) : 10_000;
  const manifest = path[0]?.kind === "overview" ? path[0] as LexicalWorldManifest : null;

  return (
    <section
      ref={dialogRef}
      className="lexical-world"
      role="dialog"
      aria-modal="true"
      aria-label="一万个词的分层探索世界"
      aria-busy={status === "loading" || searching}
      tabIndex={-1}
      style={sceneStyle}
    >
      <header className="lexical-world__header">
        <div className="lexical-world__brand">
          <span>HELLOWORDS · LEXICAL WORLD</span>
          <strong>万词世界</strong>
        </div>
        <label className="lexical-world__search">
          <span className="lexical-world__sr-only">搜索一万个英文词或中文释义并直接前往词群</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
          <input
            ref={searchRef}
            type="search"
            role="combobox"
            value={query}
            aria-controls="lexical-world-search-results"
            aria-expanded={results.length > 0}
            aria-busy={searching}
            aria-autocomplete="list"
            onChange={(event) => {
              setQuery(event.target.value);
              setResults([]);
              if (!event.target.value.trim()) setSearching(false);
            }}
            placeholder="搜索 10,000 个词，直接抵达…"
          />
          {searching ? <i className="lexical-world__search-spinner" aria-label="正在搜索" /> : null}
          {query && !searching ? <button type="button" onClick={() => { setQuery(""); setResults([]); setSearching(false); }} aria-label="清空搜索">×</button> : null}
        </label>
        <div className="lexical-world__actions">
          <button
            type="button"
            className={showMeanings ? "is-active" : ""}
            onClick={() => onShowMeaningsChange?.(!showMeanings)}
            disabled={!onShowMeaningsChange}
            aria-pressed={showMeanings}
          >释义 {showMeanings ? "开" : "关"}</button>
          <button type="button" className="lexical-world__close" onClick={requestClose} aria-label="关闭万词世界">×</button>
        </div>
      </header>

      {results.length ? (
        <ol id="lexical-world-search-results" className="lexical-world__results" aria-label="全词库搜索结果">
          {results.map((word) => (
            <li key={word.id}>
              <button type="button" onClick={() => selectSearchResult(word)}>
                <strong>{word.word}</strong>
                {showMeanings ? <span>{word.meaning.split("\n")[0]}</span> : <span>{word.topicId.replaceAll("-", " ")}</span>}
                <small>#{word.rank}</small>
                <em>直达词群 →</em>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <nav className="lexical-world__breadcrumbs" aria-label="万词世界路径">
        {path.map((level, index) => (
          <span key={`${level.kind}:${level.id}`}>
            {index ? <i aria-hidden="true">/</i> : null}
            <button type="button" onClick={() => goToLevel(index)} disabled={index === path.length - 1}>
              {index === 0 ? "10,000 词" : level.labelZh || level.labelEn}
            </button>
          </span>
        ))}
        {path.length > 1 ? <button type="button" className="lexical-world__back" onClick={() => goToLevel(path.length - 2)}>← 返回上一层</button> : null}
      </nav>

      <main
        className="lexical-world__scene"
        data-level={current?.kind ?? "loading"}
        data-status={status}
        aria-busy={!payloadReady && status !== "error"}
      >
        <div className="lexical-world__scene-image" aria-hidden="true" />
        {!current || !payloadReady ? (
          status === "error"
            ? <div className="lexical-world__status is-error" role="alert">词汇世界暂时无法读取，请稍后再试。</div>
            : <div className="lexical-world__status" role="status"><i /><span>正在打开下一片词汇场景…</span></div>
        ) : current.kind === "overview" ? (
          <div className="lexical-world__overview">
            <div className="lexical-world__overview-copy">
              <span>ONE WORLD · TEN REALMS</span>
              <h1>真正可抵达的<br/><b>10,000</b> 个词</h1>
              <p>不是一张挤满标签的地图。沿着领域、主题和词群逐层进入，每一个词都有清晰路径。</p>
              <div className="lexical-world__overview-stats">
                <span><b>{manifest?.stats.realms ?? children.length}</b> 领域</span>
                <span><b>{manifest?.stats.topics ?? 44}</b> 主题</span>
                <span><b>{manifest?.stats.subclusters ?? 704}</b> 词群</span>
                <span><b>{formatCount(totalUnexplored)}</b> 未探索</span>
              </div>
            </div>
            <div className="lexical-world__level-grid lexical-world__level-grid--realms">
              {children.map((descriptor) => (
                <LevelCard key={descriptor.id} descriptor={descriptor} progress={progress} onEnter={enterLevel} onPrefetch={prefetch} />
              ))}
            </div>
          </div>
        ) : current.kind === "subcluster" ? (
          <div className="lexical-world__leaf">
            <div className="lexical-world__leaf-heading">
              <span>WORD GROUP · {formatCount(current.count)} WORDS</span>
              <h1>{current.labelEn}</h1>
              <p>{current.labelZh} · {formatCount(totalUnexplored)} 个词尚未探索</p>
            </div>
            <WordField descriptor={current} words={words} showMeanings={showMeanings} selectedId={selected?.id} onSelect={selectWord} />
          </div>
        ) : (
          <div className="lexical-world__intermediate">
            <div className="lexical-world__realm-hero">
              <span>{current.kind === "realm" ? "REALM" : "TOPIC"} · {formatCount(current.count)} WORDS</span>
              <h1>{current.labelEn}</h1>
              <p>{current.labelZh}{current.description ? ` · ${current.description}` : ""}</p>
              <div>
                <strong>{formatCount(children.length)}</strong>
                <span>{current.kind === "realm" ? "个主题入口" : "个语义词群"}</span>
                <strong>{formatCount(totalUnexplored)}</strong>
                <span>个词未探索</span>
              </div>
            </div>
            <div className="lexical-world__level-grid">
              {children.map((descriptor) => (
                <LevelCard
                  key={descriptor.id}
                  descriptor={descriptor}
                  progress={progress}
                  realmId={realm?.id}
                  onEnter={enterLevel}
                  onPrefetch={prefetch}
                />
              ))}
            </div>
          </div>
        )}

        {selected ? (
          <aside className="lexical-world__word-detail" aria-label={`${selected.word} 词汇详情`}>
            <button ref={detailCloseRef} type="button" onClick={() => setSelected(null)} aria-label="关闭词汇详情">×</button>
            <small>#{selected.rank} · {selected.partsOfSpeech.join(" · ") || "word"}</small>
            <h2>{selected.word}</h2>
            {selected.phonetic ? <p className="lexical-world__detail-phonetic">/{selected.phonetic}/</p> : null}
            <p>{selected.meaning || "暂无释义"}</p>
            <footer>词卡详情始终显示释义</footer>
          </aside>
        ) : null}
      </main>
      <p className="lexical-world__sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
}
