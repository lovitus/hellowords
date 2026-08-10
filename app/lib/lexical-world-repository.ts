/**
 * Repository for the deliberately stepped 10,000-word world.
 *
 * The overview and intermediate documents are tiny navigation indexes. Word
 * payloads remain in the existing semantic topic shards and are fetched only
 * after a learner enters a leaf (or explicitly searches the whole lexicon).
 */

export type LexicalLevelKind = "overview" | "realm" | "topic" | "subcluster";

export interface LexicalPreviewWord {
  readonly id: string;
  readonly word: string;
}

export interface LexicalNodeMatch {
  readonly field: string;
  readonly value: string;
}

export interface LexicalNodeSource {
  readonly path: string;
  readonly collection: "nodes";
  readonly idField: "id";
  readonly match: LexicalNodeMatch;
}

export interface LexicalShardDescriptor {
  readonly path: string;
  readonly count: number;
  readonly bytes?: number;
  readonly sha256?: string;
}

export interface LexicalLevelDescriptor {
  readonly id: string;
  readonly kind: LexicalLevelKind;
  readonly labelEn: string;
  readonly labelZh: string;
  readonly count: number;
  readonly path?: string;
  readonly childrenCount?: number;
  readonly children?: readonly LexicalLevelDescriptor[];
  readonly previewWords: readonly LexicalPreviewWord[];
  readonly semanticShard?: LexicalShardDescriptor;
  readonly nodeSource?: LexicalNodeSource;
  readonly description?: string;
  readonly color?: string;
}

export interface LexicalWorldManifest extends LexicalLevelDescriptor {
  readonly kind: "overview";
  readonly schemaVersion: number;
  readonly stats: {
    readonly realms: number;
    readonly topics: number;
    readonly subclusters: number;
    readonly nodes: number;
  };
  readonly source: {
    readonly semanticManifest: string;
  };
}

export interface LexicalWord {
  readonly id: string;
  readonly word: string;
  readonly meaning: string;
  readonly phonetic: string | null;
  readonly partsOfSpeech: readonly string[];
  readonly rank: number;
  readonly realmId: string;
  readonly topicId: string;
  readonly subclusterId: string;
}

interface RawDescriptor {
  id?: unknown;
  kind?: unknown;
  labelEn?: unknown;
  labelZh?: unknown;
  label?: unknown;
  translation?: unknown;
  count?: unknown;
  path?: unknown;
  childrenCount?: unknown;
  children?: unknown;
  previewWords?: unknown;
  semanticShard?: unknown;
  nodeSource?: unknown;
  description?: unknown;
  color?: unknown;
}

interface RawManifest extends RawDescriptor {
  schemaVersion?: unknown;
  stats?: unknown;
  source?: unknown;
  entryCount?: unknown;
}

interface RawSemanticManifest {
  shards?: Array<{ path?: unknown; clusterIds?: unknown }>;
}

interface RawSemanticNode {
  id?: unknown;
  word?: unknown;
  lemma?: unknown;
  meaning?: unknown;
  phonetic?: unknown;
  partsOfSpeech?: unknown;
  rank?: unknown;
  realmId?: unknown;
  topicId?: unknown;
  clusterId?: unknown;
  subclusterId?: unknown;
}

interface RawSemanticShard {
  nodes?: RawSemanticNode[];
  entries?: RawSemanticNode[];
  words?: RawSemanticNode[];
}

export interface LexicalVirtualWindow {
  readonly start: number;
  readonly end: number;
  readonly columns: number;
  readonly rowHeight: number;
  readonly top: number;
  readonly totalHeight: number;
  readonly budget: number;
}

export interface LexicalVirtualWindowInput {
  readonly itemCount: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly scrollTop: number;
  readonly minimumCardWidth: number;
  readonly rowHeight: number;
  readonly gap?: number;
  readonly overscanRows?: number;
  readonly budget?: number;
}

export type LexicalInitialFocus = "auto" | "search" | "dialog";

export const DEFAULT_LEXICAL_WORLD_MANIFEST = "/data/lexical-world/manifest.json";

const DEFAULT_STATS = { realms: 10, topics: 44, subclusters: 704, nodes: 10_000 } as const;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asCount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function normalizePreviewWords(value: unknown): LexicalPreviewWord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as { id?: unknown; word?: unknown };
    const id = asString(record.id);
    const word = asString(record.word);
    return id && word ? [{ id, word }] : [];
  });
}

function normalizeNodeSource(value: unknown): LexicalNodeSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as {
    path?: unknown;
    collection?: unknown;
    idField?: unknown;
    match?: { field?: unknown; value?: unknown };
  };
  const path = asString(record.path);
  const field = asString(record.match?.field);
  const matchValue = asString(record.match?.value);
  if (!path || !field || !matchValue) return undefined;
  return {
    path,
    collection: asString(record.collection, "nodes") === "nodes" ? "nodes" : "nodes",
    idField: asString(record.idField, "id") === "id" ? "id" : "id",
    match: { field, value: matchValue },
  };
}

function normalizeShardDescriptor(value: unknown): LexicalShardDescriptor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const path = asString(record.path);
  if (!path) return undefined;
  return {
    path,
    count: asCount(record.count),
    bytes: asCount(record.bytes) || undefined,
    sha256: asString(record.sha256) || undefined,
  };
}

export function normalizeLexicalDescriptor(raw: RawDescriptor): LexicalLevelDescriptor {
  const id = asString(raw.id);
  const rawKind = asString(raw.kind);
  if (!id || !["overview", "realm", "topic", "subcluster"].includes(rawKind)) {
    throw new Error("Invalid lexical-world descriptor");
  }
  const kind = rawKind as LexicalLevelKind;
  const children = Array.isArray(raw.children)
    ? raw.children
        .filter((child): child is RawDescriptor => Boolean(child) && typeof child === "object")
        .map((child) => normalizeLexicalDescriptor(child))
    : undefined;
  return {
    id,
    kind,
    labelEn: asString(raw.labelEn, asString(raw.label, id)),
    labelZh: asString(raw.labelZh, asString(raw.translation)),
    count: asCount(raw.count),
    path: asString(raw.path) || undefined,
    childrenCount: asCount(raw.childrenCount, children?.length ?? 0),
    children,
    previewWords: normalizePreviewWords(raw.previewWords),
    semanticShard: normalizeShardDescriptor(raw.semanticShard),
    nodeSource: normalizeNodeSource(raw.nodeSource),
    description: asString(raw.description) || undefined,
    color: asString(raw.color) || undefined,
  };
}

function normalizeManifest(raw: RawManifest): LexicalWorldManifest {
  const descriptor = normalizeLexicalDescriptor({
    ...raw,
    kind: "overview",
    count: raw.count ?? raw.entryCount,
  });
  const rawStats = raw.stats && typeof raw.stats === "object"
    ? raw.stats as Record<string, unknown>
    : {};
  const rawSource = raw.source && typeof raw.source === "object"
    ? raw.source as Record<string, unknown>
    : {};
  const semanticManifest = asString(rawSource.semanticManifest, "/data/semantic/manifest.json");
  return {
    ...descriptor,
    kind: "overview",
    schemaVersion: asCount(raw.schemaVersion, 1),
    count: descriptor.count || asCount(rawStats.nodes, DEFAULT_STATS.nodes),
    stats: {
      realms: asCount(rawStats.realms, descriptor.children?.length ?? DEFAULT_STATS.realms),
      topics: asCount(rawStats.topics, DEFAULT_STATS.topics),
      subclusters: asCount(rawStats.subclusters, DEFAULT_STATS.subclusters),
      nodes: asCount(rawStats.nodes, descriptor.count || DEFAULT_STATS.nodes),
    },
    source: { semanticManifest },
  };
}

function normalizeWord(raw: RawSemanticNode): LexicalWord | null {
  const id = asString(raw.id);
  const word = asString(raw.word, asString(raw.lemma));
  const topicId = asString(raw.topicId, asString(raw.clusterId));
  const subclusterId = asString(raw.subclusterId);
  if (!id || !word || !topicId || !subclusterId) return null;
  return {
    id,
    word,
    meaning: asString(raw.meaning),
    phonetic: typeof raw.phonetic === "string" && raw.phonetic ? raw.phonetic : null,
    partsOfSpeech: Array.isArray(raw.partsOfSpeech)
      ? raw.partsOfSpeech.filter((part): part is string => typeof part === "string")
      : [],
    rank: Math.max(1, asCount(raw.rank, 10_000)),
    realmId: asString(raw.realmId),
    topicId,
    subclusterId,
  };
}

function directoryOf(url: string): string {
  const slash = url.lastIndexOf("/");
  return slash >= 0 ? url.slice(0, slash + 1) : "";
}

function resolvePath(path: string, parentUrl: string): string {
  if (/^(?:https?:)?\/\//.test(path) || path.startsWith("/")) return path;
  return `${directoryOf(parentUrl)}${path}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load lexical-world data: ${response.status}`);
  return response.json() as Promise<T>;
}

function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export function activeLexicalLabelBudget(viewportWidth: number): 40 | 80 {
  return viewportWidth < 820 ? 40 : 80;
}

/** Keyboard openings are explicit; pointer openings avoid a mobile keyboard. */
export function resolveLexicalInitialFocus(
  preference: LexicalInitialFocus,
  viewportWidth: number,
  hasFinePointer: boolean,
): "search" | "dialog" {
  if (preference !== "auto") return preference;
  return viewportWidth >= 820 && hasFinePointer ? "search" : "dialog";
}

/** Circular focus movement used by the modal's Tab trap. */
export function nextLexicalFocusIndex(
  activeIndex: number,
  focusableCount: number,
  backwards: boolean,
): number {
  if (focusableCount <= 0) return -1;
  if (activeIndex < 0 || activeIndex >= focusableCount) return backwards ? focusableCount - 1 : 0;
  return (activeIndex + (backwards ? -1 : 1) + focusableCount) % focusableCount;
}

export function isLatestLexicalRequest(
  requestId: number,
  latestRequestId: number,
  signal?: AbortSignal,
): boolean {
  return requestId === latestRequestId && !signal?.aborted;
}

/**
 * Calculates a DOM window whose active word-label count never exceeds the
 * requested device budget. The returned totalHeight still represents every
 * word, so all entries remain reachable by scrolling.
 */
export function computeLexicalVirtualWindow(input: LexicalVirtualWindowInput): LexicalVirtualWindow {
  const itemCount = Math.max(0, Math.floor(input.itemCount));
  const width = Math.max(1, input.viewportWidth);
  const height = Math.max(1, input.viewportHeight);
  const gap = Math.max(0, input.gap ?? 12);
  const rowHeight = Math.max(1, input.rowHeight);
  const budget = Math.max(1, Math.floor(input.budget ?? activeLexicalLabelBudget(width)));
  const visibleRows = Math.max(1, Math.ceil(height / rowHeight));
  const columnsAllowedByBudget = Math.max(1, Math.floor(budget / visibleRows));
  const columns = Math.max(1, Math.min(
    budget,
    columnsAllowedByBudget,
    Math.floor((width + gap) / (Math.max(1, input.minimumCardWidth) + gap)),
  ));
  const rows = Math.ceil(itemCount / columns);
  const totalHeight = rows * rowHeight;
  if (!itemCount) return { start: 0, end: 0, columns, rowHeight, top: 0, totalHeight: 0, budget };

  // Browsers clamp scrollTop to scrollHeight - clientHeight. Mirroring that
  // real range keeps the final partial row in the same window whether callers
  // pass the measured maxScroll or an accidentally overscrolled value.
  const maximumScrollTop = Math.max(0, totalHeight - height);
  const scrollTop = Math.min(maximumScrollTop, Math.max(0, input.scrollTop));
  const firstVisibleRow = Math.floor(scrollTop / rowHeight);
  const maximumRows = Math.max(1, Math.floor(budget / columns));
  const overscan = Math.max(0, Math.floor(input.overscanRows ?? 1));
  const windowRows = Math.min(maximumRows, visibleRows + overscan * 2);
  const availableOverscanRows = Math.max(0, windowRows - visibleRows);
  const beforeOverscanRows = Math.min(overscan, availableOverscanRows);
  const maxStartRow = Math.max(0, rows - windowRows);
  const startRow = Math.min(maxStartRow, Math.max(0, firstVisibleRow - beforeOverscanRows));
  const start = startRow * columns;
  const end = Math.min(itemCount, start + windowRows * columns, start + budget);
  return {
    start,
    end,
    columns,
    rowHeight,
    top: startRow * rowHeight,
    totalHeight,
    budget,
  };
}

export function nodeMatches(node: LexicalWord, match: LexicalNodeMatch): boolean {
  const value = (node as unknown as Record<string, unknown>)[match.field];
  return value === match.value;
}

export class LexicalWorldRepository {
  private manifestValue: LexicalWorldManifest | null = null;
  private manifestPromise: Promise<LexicalWorldManifest> | null = null;
  private readonly documentCache = new Map<string, Promise<LexicalLevelDescriptor>>();
  private readonly shardCache = new Map<string, Promise<LexicalWord[]>>();
  private allWordsPromise: Promise<LexicalWord[]> | null = null;

  constructor(private readonly manifestUrl = DEFAULT_LEXICAL_WORLD_MANIFEST) {}

  get manifest(): LexicalWorldManifest | null {
    return this.manifestValue;
  }

  async loadManifest(signal?: AbortSignal): Promise<LexicalWorldManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = fetchJson<RawManifest>(this.manifestUrl)
        .then((raw) => {
          const manifest = normalizeManifest(raw);
          if (manifest.count !== 10_000 || manifest.stats.nodes !== 10_000) {
            throw new Error(`Lexical world must account for 10,000 words; received ${manifest.count}`);
          }
          this.manifestValue = manifest;
          return manifest;
        })
        .catch((error) => {
          this.manifestPromise = null;
          throw error;
        });
    }
    return waitFor(this.manifestPromise, signal);
  }

  async loadDocument(descriptor: LexicalLevelDescriptor, signal?: AbortSignal): Promise<LexicalLevelDescriptor> {
    if (descriptor.children?.length || !descriptor.path) return descriptor;
    const url = resolvePath(descriptor.path, this.manifestUrl);
    let pending = this.documentCache.get(url);
    if (!pending) {
      pending = fetchJson<RawDescriptor>(url)
        .then(normalizeLexicalDescriptor)
        .catch((error) => {
          this.documentCache.delete(url);
          throw error;
        });
      this.documentCache.set(url, pending);
    }
    return waitFor(pending, signal);
  }

  async loadChildren(descriptor: LexicalLevelDescriptor, signal?: AbortSignal): Promise<readonly LexicalLevelDescriptor[]> {
    const document = await this.loadDocument(descriptor, signal);
    return document.children ?? [];
  }

  async loadWords(descriptor: LexicalLevelDescriptor, signal?: AbortSignal): Promise<LexicalWord[]> {
    const source = descriptor.nodeSource;
    const shardPath = source?.path ?? descriptor.semanticShard?.path;
    if (!shardPath) throw new Error(`Subcluster ${descriptor.id} has no node source`);
    const words = await this.loadSemanticShard(shardPath, signal);
    return source ? words.filter((word) => nodeMatches(word, source.match)) : words;
  }

  async prefetch(descriptor: LexicalLevelDescriptor): Promise<void> {
    if (descriptor.kind === "subcluster") await this.loadWords(descriptor);
    else await this.loadDocument(descriptor);
  }

  async find(query: string, signal?: AbortSignal): Promise<LexicalWord[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const words = await this.loadAllWords(signal);
    return words
      .filter((word) => (
        word.word.toLocaleLowerCase().includes(normalized)
        || word.meaning.toLocaleLowerCase().includes(normalized)
      ))
      .sort((left, right) => {
        const leftWord = left.word.toLocaleLowerCase();
        const rightWord = right.word.toLocaleLowerCase();
        return Number(rightWord === normalized) - Number(leftWord === normalized)
          || Number(rightWord.startsWith(normalized)) - Number(leftWord.startsWith(normalized))
          || left.rank - right.rank;
      })
      .slice(0, 16);
  }

  async resolvePath(word: LexicalWord, signal?: AbortSignal): Promise<readonly LexicalLevelDescriptor[]> {
    const manifest = await this.loadManifest(signal);
    const realms = manifest.children ?? [];
    let realm = realms.find((candidate) => candidate.id === word.realmId);
    if (!realm) {
      for (const candidate of realms) {
        const topics = await this.loadChildren(candidate, signal);
        if (topics.some((topic) => topic.id === word.topicId)) {
          realm = candidate;
          break;
        }
      }
    }
    if (!realm) throw new Error(`Unable to resolve realm for ${word.word}`);
    const topics = await this.loadChildren(realm, signal);
    const topic = topics.find((candidate) => candidate.id === word.topicId);
    if (!topic) throw new Error(`Unable to resolve topic for ${word.word}`);
    const subclusters = await this.loadChildren(topic, signal);
    const subcluster = subclusters.find((candidate) => candidate.id === word.subclusterId);
    if (!subcluster) throw new Error(`Unable to resolve word group for ${word.word}`);
    return [manifest, realm, topic, subcluster];
  }

  cacheSnapshot(): { documents: number; shards: number; allWordsReady: boolean } {
    return {
      documents: this.documentCache.size,
      shards: this.shardCache.size,
      allWordsReady: this.allWordsPromise !== null,
    };
  }

  private async loadSemanticShard(path: string, signal?: AbortSignal): Promise<LexicalWord[]> {
    const url = resolvePath(path, this.manifestUrl);
    let pending = this.shardCache.get(url);
    if (!pending) {
      pending = fetchJson<RawSemanticShard>(url)
        .then((shard) => (shard.nodes ?? shard.entries ?? shard.words ?? [])
          .map(normalizeWord)
          .filter((word): word is LexicalWord => word !== null))
        .catch((error) => {
          this.shardCache.delete(url);
          throw error;
        });
      this.shardCache.set(url, pending);
    }
    return waitFor(pending, signal);
  }

  private async loadAllWords(signal?: AbortSignal): Promise<LexicalWord[]> {
    if (!this.allWordsPromise) {
      this.allWordsPromise = this.loadManifest()
        .then((manifest) => fetchJson<RawSemanticManifest>(manifest.source.semanticManifest)
          .then(async (semanticManifest) => {
            const paths = (semanticManifest.shards ?? [])
              .map((shard) => asString(shard.path))
              .filter(Boolean)
              .map((path) => resolvePath(path, manifest.source.semanticManifest));
            const groups = await Promise.all(paths.map((path) => this.loadSemanticShard(path)));
            const unique = new Map(groups.flat().map((word) => [word.id, word]));
            return [...unique.values()];
          }))
        .catch((error) => {
          this.allWordsPromise = null;
          throw error;
        });
    }
    return waitFor(this.allWordsPromise, signal);
  }
}

export function createLexicalWorldRepository(
  manifestUrl = DEFAULT_LEXICAL_WORLD_MANIFEST,
): LexicalWorldRepository {
  return new LexicalWorldRepository(manifestUrl);
}
