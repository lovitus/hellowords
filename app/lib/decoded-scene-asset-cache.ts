export type SharedAsyncResource<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "loading"; readonly promise: Promise<T> };

type LoadingCacheEntry<T> = Extract<SharedAsyncResource<T>, { readonly status: "loading" }> & {
  readonly token: symbol;
};
type CacheEntry<T> =
  | Extract<SharedAsyncResource<T>, { readonly status: "ready" }>
  | LoadingCacheEntry<T>;

/**
 * A small strong-reference LRU for expensive decoded resources.
 *
 * Loading entries are shared just like ready entries. Evicting an in-flight
 * entry only detaches it from this cache; it deliberately does not cancel a
 * loader that another mounted consumer may still be awaiting.
 */
export class BoundedAsyncResourceCache<T> {
  readonly limit: number;
  readonly #entries = new Map<string, CacheEntry<T>>();

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("cache limit must be a positive integer");
    }
    this.limit = limit;
  }

  get size(): number {
    return this.#entries.size;
  }

  keys(): readonly string[] {
    return [...this.#entries.keys()];
  }

  peek(key: string): SharedAsyncResource<T> | undefined {
    return this.#entries.get(key);
  }

  getOrLoad(key: string, loader: () => Promise<T>): SharedAsyncResource<T> {
    const existing = this.#entries.get(key);
    if (existing) {
      this.#touch(key, existing);
      return existing;
    }

    this.#makeRoom();
    const token = Symbol(key);
    const promise = Promise.resolve()
      .then(loader)
      .then(
        (value) => {
          const current = this.#entries.get(key);
          if (current?.status === "loading" && current.token === token) {
            const ready = { status: "ready", value } as const;
            this.#entries.delete(key);
            this.#entries.set(key, ready);
          }
          return value;
        },
        (error: unknown) => {
          const current = this.#entries.get(key);
          if (current?.status === "loading" && current.token === token) {
            this.#entries.delete(key);
          }
          throw error;
        },
      );
    const loading: LoadingCacheEntry<T> = { status: "loading", promise, token };
    this.#entries.set(key, loading);
    return loading;
  }

  clear(): void {
    this.#entries.clear();
  }

  #touch(key: string, entry: CacheEntry<T>): void {
    this.#entries.delete(key);
    this.#entries.set(key, entry);
  }

  #makeRoom(): void {
    while (this.#entries.size >= this.limit) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.#entries.delete(oldest);
    }
  }
}

/** Current and immediately previous high-density scenes stay decoded. */
export const DECODED_SCENE_ASSET_CACHE_LIMIT = 2;

/** Shared across keyed SceneViewport instances for the lifetime of this page. */
export const decodedSceneAssetCache = new BoundedAsyncResourceCache<HTMLImageElement>(
  DECODED_SCENE_ASSET_CACHE_LIMIT,
);
