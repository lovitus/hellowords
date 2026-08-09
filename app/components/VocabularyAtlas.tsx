"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface VocabularyEntry {
  id: string;
  displayWord: string;
  rank: number;
  meaning: string;
  phonetic: string | null;
  partsOfSpeech: string[];
  atlasGroup: string;
}

interface VocabularyShard {
  words?: VocabularyEntry[];
  entries?: VocabularyEntry[];
}

interface VocabularyManifest {
  entryCount?: number;
  count?: number;
  totalCount?: number;
  shards: Array<{ path: string; count: number }>;
}

interface VocabularyAtlasProps {
  open: boolean;
  onClose: () => void;
}

function entriesFromShard(shard: VocabularyShard): VocabularyEntry[] {
  return shard.words ?? shard.entries ?? [];
}

export function VocabularyAtlas({ open, onClose }: VocabularyAtlasProps) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    queueMicrotask(() => setStatus("loading"));
    void fetch("/data/vocabulary/manifest.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Vocabulary manifest is unavailable");
        return (await response.json()) as VocabularyManifest;
      })
      .then(async (manifest) => {
        setTotal(manifest.entryCount ?? manifest.count ?? manifest.totalCount ?? manifest.shards.reduce((sum, shard) => sum + shard.count, 0));
        const shards = await Promise.all(
          manifest.shards.map(async (shard) => {
            const response = await fetch(`/data/vocabulary/${shard.path}`);
            if (!response.ok) throw new Error(`Vocabulary shard failed: ${shard.path}`);
            return entriesFromShard((await response.json()) as VocabularyShard);
          }),
        );
        setEntries(shards.flat().sort((a, b) => a.rank - b.rank));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries.slice(0, 80);
    return entries
      .filter(
        (entry) =>
          entry.displayWord.toLocaleLowerCase().includes(normalized) || entry.meaning.includes(normalized),
      )
      .slice(0, 80);
  }, [entries, query]);

  if (!open) return null;

  return (
    <aside className="atlas-panel" role="dialog" aria-label="Vocabulary atlas" aria-modal="true">
      <div className="atlas-header">
        <div>
          <span className="eyebrow">VOCABULARY ATLAS</span>
          <h2>词汇地图</h2>
          <p>{total ? `${total.toLocaleString()} 个常用词，按需载入` : "正在打开世界索引…"}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close vocabulary atlas">×</button>
      </div>
      <label className="atlas-search">
        <span className="sr-only">搜索英文或中文</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索英文或中文…"
        />
        <span>{results.length}</span>
      </label>
      {status === "loading" ? <p className="atlas-status">正在展开词汇地图…</p> : null}
      {status === "error" ? <p className="atlas-status error">词汇数据暂时无法读取。</p> : null}
      {status === "ready" ? (
        <ol className="atlas-results">
          {results.map((entry) => (
            <li key={entry.id}>
              <span className="atlas-rank">{entry.rank}</span>
              <span className="atlas-word">
                <strong>{entry.displayWord}</strong>
                {entry.phonetic ? <small>/{entry.phonetic}/</small> : null}
              </span>
              <span className="atlas-meaning">{entry.meaning}</span>
              <span className="atlas-group">{entry.atlasGroup}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <footer className="atlas-footer">场景标签经过人工定位；其余词汇收录在可搜索的主题词群中。</footer>
    </aside>
  );
}
