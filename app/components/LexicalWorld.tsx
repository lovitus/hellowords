"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createLexicalWorldRepository,
  isLatestLexicalRequest,
  nextLexicalFocusIndex,
  resolveLexicalInitialFocus,
  type LexicalInitialFocus,
  type LexicalWord,
} from "../lib/lexical-world-repository";
import { SemanticZoomField } from "./SemanticZoomField";
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
  /** Exact reviewed realm supplied by a spatial scene label. */
  initialRealmId?: string;
  /** Drawn source word shown as provenance for the semantic transition. */
  spatialEntryWord?: string;
}

interface SeenProgress {
  readonly wordIds: Readonly<Record<string, true>>;
  readonly counts: Readonly<Record<string, number>>;
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
    // Progress must never block exploration in private browsing or low quota.
  }
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
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
  initialRealmId,
  spatialEntryWord,
}: LexicalWorldProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchRequestRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<readonly LexicalWord[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<LexicalWord | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const repository = useMemo(() => createLexicalWorldRepository(manifestUrl), [manifestUrl]);

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
      setAnnouncement(spatialEntryWord
        ? `已从实景词 ${spatialEntryWord} 进入相关词域；其余词按语义关系组织`
        : "万词语义世界已打开，可滚动、拖动或使用键盘逐层探索");
    });
    return () => {
      active = false;
    };
  }, [initialQuery, open, spatialEntryWord]);

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
      if (restore?.isConnected) requestAnimationFrame(() => restore.focus({ preventScroll: true }));
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
        } else requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = focusableElements(dialogRef.current);
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = nextLexicalFocusIndex(activeIndex, focusable.length, event.shiftKey);
      event.preventDefault();
      if (nextIndex < 0) dialogRef.current.focus({ preventScroll: true });
      else focusable[nextIndex].focus({ preventScroll: true });
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
      // Search is the explicit exception that may inspect all lexical shards.
      void repository.find(normalized, controller.signal)
        .then((matches) => {
          if (!isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) return;
          setResults(matches);
          setSearching(false);
          setAnnouncement(matches.length ? `找到 ${matches.length} 个匹配词` : "没有找到匹配词");
        })
        .catch(() => {
          if (isLatestLexicalRequest(requestId, searchRequestRef.current, controller.signal)) {
            setSearching(false);
            setAnnouncement("搜索暂时不可用，请稍后重试");
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (searchControllerRef.current === controller) searchControllerRef.current = null;
    };
  }, [open, query, repository]);

  const markSeen = useCallback((word: LexicalWord) => {
    const current = readProgress();
    if (current.wordIds[word.id]) return;
    const counts = { ...current.counts };
    for (const id of ["lexical-world", word.realmId, word.topicId, word.subclusterId]) {
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    saveProgress({
      wordIds: { ...current.wordIds, [word.id]: true },
      counts,
    });
  }, []);

  const selectWord = useCallback((word: LexicalWord) => {
    setSelected(word);
    setResults([]);
    setSearching(false);
    markSeen(word);
    onSelectWord?.(word);
    setAnnouncement(`${word.word}，${word.meaning.split("\n")[0]}`);
  }, [markSeen, onSelectWord]);

  if (!open) return null;

  return (
    <section
      ref={dialogRef}
      className="lexical-world lexical-world--semantic"
      role="dialog"
      aria-modal="true"
      aria-label="一万个词的分层探索世界"
      aria-busy={searching}
      tabIndex={-1}
    >
      <header className="lexical-world__header">
        <div className="lexical-world__brand">
          <span>HELLOWORDS · SEMANTIC ZOOM</span>
          <strong>万词世界</strong>
        </div>
        <label className="lexical-world__search">
          <span className="lexical-world__sr-only">搜索一万个英文词或中文释义并查看词卡</span>
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
            placeholder="搜索 10,000 个词…"
          />
          {searching ? <i className="lexical-world__search-spinner" aria-label="正在搜索" /> : null}
          {query && !searching ? (
            <button type="button" onClick={() => { setQuery(""); setResults([]); setSearching(false); }} aria-label="清空搜索">×</button>
          ) : null}
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
              <button type="button" onClick={() => selectWord(word)}>
                <strong>{word.word}</strong>{" "}
                {showMeanings ? <span>{word.meaning.split("\n")[0]}</span> : <span>{word.topicId.replaceAll("-", " ")}</span>}{" "}
                <small>#{word.rank}</small>{" "}
                <em>查看词卡 →</em>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <main className="lexical-world__scene lexical-world__scene--semantic" data-level="semantic-zoom">
        <SemanticZoomField
          open={open}
          showMeanings={showMeanings}
          onSelectWord={selectWord}
          repository={repository}
          initialRealmId={initialRealmId}
          spatialEntryWord={spatialEntryWord}
        />

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
