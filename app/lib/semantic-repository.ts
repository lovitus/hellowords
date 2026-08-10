/**
 * Data and layout layer for the canvas vocabulary universe.
 *
 * The preferred data contract is `/data/semantic/manifest.json` with spatial
 * shards. Until those authored shards exist, the repository transparently
 * adapts the existing ranked vocabulary shards into the same contract. The
 * adapter is deterministic: a word always receives the same cluster and point.
 */

export interface SemanticBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SemanticCluster {
  readonly id: string;
  readonly title: string;
  readonly translation: string;
  readonly realmId?: string;
  readonly count?: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
}

export interface SemanticSubcluster {
  readonly id: string;
  readonly label: string;
  readonly topicId: string;
  readonly count: number;
  readonly x: number;
  readonly y: number;
}

export interface SemanticNode {
  readonly id: string;
  readonly word: string;
  readonly meaning: string;
  readonly phonetic: string | null;
  readonly partsOfSpeech: readonly string[];
  readonly rank: number;
  readonly clusterId: string;
  readonly realmId?: string;
  readonly topicId?: string;
  readonly subclusterId?: string;
  readonly x: number;
  readonly y: number;
  /** 0..1; used by the renderer when labels compete for screen space. */
  readonly importance: number;
}

export interface SemanticShardDescriptor {
  readonly path: string;
  readonly count: number;
  readonly bounds?: SemanticBounds;
  readonly clusterIds?: readonly string[];
}

export interface SemanticManifest {
  readonly schemaVersion: number;
  readonly entryCount: number;
  readonly world: SemanticBounds;
  readonly clusters: readonly SemanticCluster[];
  readonly subclusters: readonly SemanticSubcluster[];
  readonly shards: readonly SemanticShardDescriptor[];
  readonly source: "semantic" | "vocabulary-adapter";
}

type RawBounds = Partial<SemanticBounds> & {
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
};

interface RawManifest {
  schemaVersion?: number;
  entryCount?: number;
  count?: number;
  totalCount?: number;
  world?: SemanticBounds;
  clusters?: SemanticCluster[];
  subclusters?: Array<{
    id: string;
    label: string;
    topicId: string;
    count: number;
    center: [number, number];
  }>;
  shards?: Array<{
    path: string;
    count: number;
    bounds?: RawBounds;
    clusterIds?: string[];
  }>;
}

interface RawVocabularyEntry {
  id: string;
  displayWord?: string;
  word?: string;
  meaning?: string;
  phonetic?: string | null;
  partsOfSpeech?: string[];
  rank: number;
  clusterId?: string;
  realmId?: string;
  topicId?: string;
  subclusterId?: string;
  x?: number;
  y?: number;
  importance?: number;
}

interface RawShard {
  entries?: RawVocabularyEntry[];
  words?: RawVocabularyEntry[];
  nodes?: RawVocabularyEntry[];
}

export const DEFAULT_SEMANTIC_MANIFEST = "/data/semantic/manifest.json";
export const FALLBACK_VOCABULARY_MANIFEST = "/data/vocabulary/manifest.json";
export const SEMANTIC_WORLD: SemanticBounds = { x: 0, y: 0, width: 7200, height: 4800 };

export const DEFAULT_CLUSTERS: readonly SemanticCluster[] = [
  { id: "foundations", title: "FOUNDATIONS", translation: "语言基石", x: 900, y: 820, radius: 690, color: "#d7a951" },
  { id: "people", title: "PEOPLE & SOCIETY", translation: "人与社会", x: 2600, y: 720, radius: 720, color: "#d56f58" },
  { id: "home", title: "HOME & OBJECTS", translation: "生活与器物", x: 4450, y: 800, radius: 720, color: "#b88455" },
  { id: "nature", title: "LIVING WORLD", translation: "自然万物", x: 6250, y: 850, radius: 700, color: "#679b77" },
  { id: "action", title: "ACTION & MOTION", translation: "行动与运动", x: 1600, y: 2450, radius: 780, color: "#4c8b8e" },
  { id: "mind", title: "MIND & FEELING", translation: "思想与感受", x: 3600, y: 2350, radius: 800, color: "#8179a5" },
  { id: "language", title: "LANGUAGE & STORY", translation: "语言与叙事", x: 5650, y: 2450, radius: 780, color: "#af6e87" },
  { id: "time", title: "TIME & PLACE", translation: "时间与空间", x: 1000, y: 4000, radius: 660, color: "#638aa2" },
  { id: "science", title: "SCIENCE & MAKING", translation: "科学与创造", x: 3100, y: 3980, radius: 720, color: "#588779" },
  { id: "culture", title: "CULTURE & WORLD", translation: "文化与世界", x: 5500, y: 3970, radius: 770, color: "#aa7a4e" },
] as const;

const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  home: ["home", "house", "room", "food", "table", "door", "chair", "clothes", "kitchen", "drink", "car", "phone", "物", "房", "食", "衣", "车", "器"],
  nature: ["animal", "plant", "water", "earth", "tree", "bird", "fish", "weather", "nature", "动物", "植物", "鸟", "鱼", "水", "天气", "自然"],
  people: ["person", "family", "child", "woman", "man", "social", "government", "friend", "人", "家庭", "社会", "政府", "朋友"],
  action: ["move", "walk", "run", "make", "take", "give", "work", "act", "运动", "移动", "做", "给予", "工作"],
  mind: ["think", "feel", "love", "fear", "know", "believe", "idea", "思想", "感", "爱", "知道", "相信"],
  language: ["say", "speak", "write", "read", "word", "book", "music", "说", "写", "读", "语言", "书", "音乐"],
  time: ["time", "day", "year", "place", "where", "before", "after", "时间", "日", "年", "地点", "之前", "之后"],
  science: ["science", "technology", "energy", "computer", "material", "system", "科学", "技术", "能量", "计算机", "材料", "系统"],
  culture: ["country", "world", "art", "history", "law", "business", "国家", "世界", "艺术", "历史", "法律", "商业"],
};

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Semantic fallback for current non-spatial vocabulary data. */
export function inferCluster(entry: Pick<RawVocabularyEntry, "displayWord" | "word" | "meaning" | "partsOfSpeech">): string {
  const text = `${entry.displayWord ?? entry.word ?? ""} ${entry.meaning ?? ""}`.toLocaleLowerCase();
  for (const [cluster, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return cluster;
  }
  const parts = entry.partsOfSpeech ?? [];
  if (parts.some((part) => part === "verb")) return "action";
  if (parts.some((part) => part === "adjective" || part === "adverb")) return "mind";
  if (parts.some((part) => part === "pronoun" || part === "conjunction" || part === "preposition" || part === "determiner" || part === "auxiliary")) return "foundations";
  return "culture";
}

export function layoutVocabularyEntry(
  entry: RawVocabularyEntry,
  clusters: readonly SemanticCluster[] = DEFAULT_CLUSTERS,
): SemanticNode {
  const clusterId = entry.clusterId ?? inferCluster(entry);
  const cluster = clusters.find((candidate) => candidate.id === clusterId) ?? clusters[clusters.length - 1];
  const hash = stableHash(entry.id);
  const secondHash = stableHash(`${entry.id}:radius`);
  const angle = ((hash % 100_003) / 100_003) * Math.PI * 2;
  // Sqrt creates an even area distribution; common words sit slightly closer
  // to a cluster's centre so the overview remains useful.
  const randomRadius = Math.sqrt((secondHash % 100_003) / 100_003);
  const rankBias = Math.min(1, Math.log10(Math.max(1, entry.rank)) / 4);
  const radius = cluster.radius * (0.12 + randomRadius * (0.52 + rankBias * 0.26));
  const word = entry.displayWord ?? entry.word ?? entry.id;
  return {
    id: entry.id,
    word,
    meaning: entry.meaning ?? "",
    phonetic: entry.phonetic ?? null,
    partsOfSpeech: entry.partsOfSpeech ?? [],
    rank: entry.rank,
    clusterId: cluster.id,
    realmId: entry.realmId,
    topicId: entry.topicId,
    subclusterId: entry.subclusterId,
    x: entry.x ?? cluster.x + Math.cos(angle) * radius,
    y: entry.y ?? cluster.y + Math.sin(angle) * radius * 0.72,
    importance: entry.importance ?? Math.max(0, 1 - Math.log10(Math.max(1, entry.rank)) / 4.2),
  };
}

export class SemanticSpatialIndex {
  private readonly cells = new Map<string, SemanticNode[]>();
  private readonly known = new Set<string>();

  constructor(private readonly cellSize = 320) {}

  add(nodes: readonly SemanticNode[]): void {
    for (const node of nodes) {
      if (this.known.has(node.id)) continue;
      this.known.add(node.id);
      const key = this.key(node.x, node.y);
      const cell = this.cells.get(key);
      if (cell) cell.push(node);
      else this.cells.set(key, [node]);
    }
  }

  query(bounds: SemanticBounds): SemanticNode[] {
    const minColumn = Math.floor(bounds.x / this.cellSize);
    const maxColumn = Math.floor((bounds.x + bounds.width) / this.cellSize);
    const minRow = Math.floor(bounds.y / this.cellSize);
    const maxRow = Math.floor((bounds.y + bounds.height) / this.cellSize);
    const visible: SemanticNode[] = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const cell = this.cells.get(`${column}:${row}`);
        if (!cell) continue;
        for (const node of cell) {
          if (node.x >= bounds.x && node.x <= bounds.x + bounds.width && node.y >= bounds.y && node.y <= bounds.y + bounds.height) {
            visible.push(node);
          }
        }
      }
    }
    return visible;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
}

function directoryOf(url: string): string {
  return url.slice(0, url.lastIndexOf("/") + 1);
}

function normalizeBounds(bounds: RawBounds | undefined): SemanticBounds | undefined {
  if (!bounds) return undefined;
  const value = bounds as SemanticBounds & {
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
  };
  if ([value.x, value.y, value.width, value.height].every(Number.isFinite)) {
    return { x: value.x!, y: value.y!, width: value.width!, height: value.height! };
  }
  if ([value.minX, value.minY, value.maxX, value.maxY].every(Number.isFinite)) {
    return {
      x: value.minX!,
      y: value.minY!,
      width: value.maxX! - value.minX!,
      height: value.maxY! - value.minY!,
    };
  }
  return undefined;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return (await response.json()) as T;
}

export class SemanticRepository {
  readonly index = new SemanticSpatialIndex();
  private manifestValue: SemanticManifest | null = null;
  private manifestUrl = DEFAULT_SEMANTIC_MANIFEST;
  private loaded = new Map<string, SemanticNode[]>();
  private inFlight = new Map<string, Promise<SemanticNode[]>>();

  constructor(private readonly preferredManifestUrl = DEFAULT_SEMANTIC_MANIFEST) {}

  get manifest(): SemanticManifest | null {
    return this.manifestValue;
  }

  get loadedNodes(): SemanticNode[] {
    return Array.from(this.loaded.values()).flat();
  }

  async loadManifest(signal?: AbortSignal): Promise<SemanticManifest> {
    if (this.manifestValue) return this.manifestValue;
    let raw: RawManifest;
    let source: SemanticManifest["source"] = "semantic";
    try {
      raw = await fetchJson<RawManifest>(this.preferredManifestUrl, signal);
      this.manifestUrl = this.preferredManifestUrl;
    } catch (error) {
      if (signal?.aborted) throw error;
      raw = await fetchJson<RawManifest>(FALLBACK_VOCABULARY_MANIFEST, signal);
      this.manifestUrl = FALLBACK_VOCABULARY_MANIFEST;
      source = "vocabulary-adapter";
    }
    if (!raw.shards?.length) throw new Error("Semantic manifest has no shards");
    const clusters = raw.clusters?.length ? raw.clusters : [...DEFAULT_CLUSTERS];
    this.manifestValue = {
      schemaVersion: raw.schemaVersion ?? 1,
      entryCount: raw.entryCount ?? raw.count ?? raw.totalCount ?? raw.shards.reduce((total, shard) => total + shard.count, 0),
      world: raw.world
        ? { x: raw.world.x ?? 0, y: raw.world.y ?? 0, width: raw.world.width, height: raw.world.height }
        : SEMANTIC_WORLD,
      clusters,
      subclusters: (raw.subclusters ?? []).map((subcluster) => ({
        id: subcluster.id,
        label: subcluster.label,
        topicId: subcluster.topicId,
        count: subcluster.count,
        x: subcluster.center[0],
        y: subcluster.center[1],
      })),
      shards: raw.shards.map((shard) => ({
        ...shard,
        bounds: normalizeBounds(shard.bounds),
      })),
      source,
    };
    return this.manifestValue;
  }

  async loadShard(descriptor: SemanticShardDescriptor, signal?: AbortSignal): Promise<SemanticNode[]> {
    const cached = this.loaded.get(descriptor.path);
    if (cached) return cached;
    const pending = this.inFlight.get(descriptor.path);
    if (pending) return pending;
    const request = fetchJson<RawShard>(`${directoryOf(this.manifestUrl)}${descriptor.path}`, signal)
      .then((shard) => {
        const manifest = this.manifestValue;
        if (!manifest) throw new Error("Manifest must be loaded before a shard");
        const rawEntries = shard.nodes ?? shard.entries ?? shard.words ?? [];
        const nodes = rawEntries.map((entry) => layoutVocabularyEntry(entry, manifest.clusters));
        this.loaded.set(descriptor.path, nodes);
        this.index.add(nodes);
        this.inFlight.delete(descriptor.path);
        return nodes;
      })
      .catch((error) => {
        this.inFlight.delete(descriptor.path);
        throw error;
      });
    this.inFlight.set(descriptor.path, request);
    return request;
  }

  /** Load authored shards intersecting the viewport; fallback data starts with its most common band. */
  async loadViewport(bounds: SemanticBounds, signal?: AbortSignal): Promise<SemanticNode[]> {
    const manifest = await this.loadManifest(signal);
    let candidates = manifest.shards.filter((shard, index) => {
      if (!shard.bounds) return index === 0 || this.loaded.has(shard.path);
      return intersects(bounds, shard.bounds);
    });
    const worldArea = manifest.world.width * manifest.world.height;
    const visibleAreaRatio = worldArea > 0 ? (bounds.width * bounds.height) / worldArea : 1;
    if (manifest.source === "semantic" && visibleAreaRatio > 0.45) {
      // A world-scale viewport uses the deliberately balanced overview sample;
      // loading every intersecting topic here would defeat semantic sharding.
      candidates = candidates.filter((shard) => this.loaded.has(shard.path));
    }
    const groups = await Promise.all(candidates.map((shard) => this.loadShard(shard, signal)));
    return groups.flat();
  }

  /** Load a few small, spatially representative topics per semantic realm. */
  async loadOverview(signal?: AbortSignal): Promise<SemanticNode[]> {
    const manifest = await this.loadManifest(signal);
    if (manifest.source !== "semantic") return this.loadShard(manifest.shards[0], signal);
    const realmByCluster = new Map(manifest.clusters.map((cluster) => [cluster.id, cluster.realmId ?? cluster.id]));
    const grouped = new Map<string, SemanticShardDescriptor[]>();
    for (const shard of manifest.shards) {
      const realmId = shard.clusterIds?.map((clusterId) => realmByCluster.get(clusterId)).find(Boolean);
      if (!realmId) continue;
      const entries = grouped.get(realmId) ?? [];
      entries.push(shard);
      grouped.set(realmId, entries);
    }
    // Two modest topics per realm create an evenly distributed overview. The
    // four broadest realms contribute a third topic, yielding 24 spatially
    // distinct word neighborhoods without loading their largest shards.
    const descriptors = grouped.size
      ? [...grouped.values()].flatMap((entries) => [...entries]
          .sort((left, right) => Math.abs(left.count - 80) - Math.abs(right.count - 80))
          .slice(0, entries.length >= 5 ? 3 : 2))
      : manifest.shards.slice(0, 10);
    const groups = await Promise.all(descriptors.map((descriptor) => this.loadShard(descriptor, signal)));
    return groups.flat();
  }

  /** Intentional search and idle hydration are the only paths that fetch every shard. */
  async loadAll(signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void): Promise<SemanticNode[]> {
    const manifest = await this.loadManifest(signal);
    for (let index = 0; index < manifest.shards.length; index += 1) {
      await this.loadShard(manifest.shards[index], signal);
      onProgress?.(this.loadedNodes.length, manifest.entryCount);
    }
    return this.loadedNodes;
  }

  async find(query: string, signal?: AbortSignal): Promise<SemanticNode[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    await this.loadAll(signal);
    return this.loadedNodes
      .filter((node) => node.word.toLocaleLowerCase().includes(normalized) || node.meaning.includes(normalized))
      .sort((a, b) => {
        const aExact = a.word.toLocaleLowerCase() === normalized ? -1 : 0;
        const bExact = b.word.toLocaleLowerCase() === normalized ? -1 : 0;
        return aExact - bExact || a.rank - b.rank;
      })
      .slice(0, 12);
  }
}

export function intersects(a: SemanticBounds, b: SemanticBounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function createSemanticRepository(manifestUrl = DEFAULT_SEMANTIC_MANIFEST): SemanticRepository {
  return new SemanticRepository(manifestUrl);
}
