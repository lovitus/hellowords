import { assertSceneAssetContract, type Scene } from "../domain";

export type { Scene } from "../domain";

export interface SceneManifestEntry {
  id: string;
  title: string;
  parentId: string | null;
}

export interface SceneManifest {
  schemaVersion: number;
  rootSceneId: string;
  scenes: SceneManifestEntry[];
}

const MAX_RESIDENT_SCENES = 3;
const MAX_RESIDENT_IMAGES = 3;

type CacheStatus = "pending" | "resolved";

interface SceneCacheEntry {
  promise: Promise<Scene>;
  status: CacheStatus;
  asset?: string;
  value?: Scene;
}

interface ImageCacheEntry {
  image: HTMLImageElement;
  promise: Promise<void>;
  status: CacheStatus;
  evicted: boolean;
}

export interface SceneCacheSnapshot {
  residentSceneIds: readonly string[];
  scenes: readonly {
    sceneId: string;
    status: CacheStatus;
    asset?: string;
  }[];
  images: readonly {
    asset: string;
    status: CacheStatus;
    retainedImage: boolean;
  }[];
  limits: {
    scenes: number;
    images: number;
  };
}

const sceneCache = new Map<string, SceneCacheEntry>();
const imageCache = new Map<string, ImageCacheEntry>();
let residentSceneIds = new Set<string>();
let manifestCache: Promise<SceneManifest> | null = null;

/**
 * Sites keeps public JSON at stable paths, so a CDN can legitimately retain a
 * previous response after a new version is deployed. The published page
 * already carries a short cachebuster (`?v=...`); reuse it for scene data so a
 * fresh public artifact cannot hydrate an older scene definition. Local SSR
 * and unit-test callers have no browser location and intentionally keep the
 * canonical path unchanged.
 */
export function sceneDataCacheSuffix(search?: string): string {
  const currentSearch = search ?? (typeof window === "undefined" ? "" : window.location.search);
  const version = new URLSearchParams(currentSearch).get("v");
  return version ? `?v=${encodeURIComponent(version)}` : "";
}

export function sceneDataUrl(path: string, search?: string): string {
  return `${path}${sceneDataCacheSuffix(search)}`;
}

function assertFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid scene field: ${field}`);
  }
}

function validateScene(value: unknown, requestedId: string): Scene {
  if (!value || typeof value !== "object") throw new Error("Scene data is not an object");
  const scene = value as Scene;
  if (scene.id !== requestedId) throw new Error(`Scene ID mismatch for ${requestedId}`);
  if (!scene.title || !scene.asset || !Array.isArray(scene.labels) || !Array.isArray(scene.portals)) {
    throw new Error(`Scene ${requestedId} is incomplete`);
  }
  assertFinitePositive(scene.width, "width");
  assertFinitePositive(scene.height, "height");
  assertSceneAssetContract(scene);
  return scene;
}

function validateManifest(value: unknown): SceneManifest {
  if (!value || typeof value !== "object") throw new Error("Scene manifest is not an object");
  const manifest = value as SceneManifest;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.rootSceneId !== "string" ||
    !manifest.rootSceneId ||
    !Array.isArray(manifest.scenes) ||
    !manifest.scenes.some((scene) => scene.id === manifest.rootSceneId && scene.parentId === null)
  ) {
    throw new Error("Scene manifest is incomplete");
  }
  return manifest;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

/**
 * A caller can stop waiting without cancelling the shared fetch/decode. This
 * keeps one navigation's AbortController from poisoning a request that an
 * adjacent-scene prefetch or a second navigation is already using.
 */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function pruneCaches(): void {
  for (const [sceneId] of sceneCache) {
    if (!residentSceneIds.has(sceneId)) sceneCache.delete(sceneId);
  }

  const retainedAssets = new Set<string>();
  for (const sceneId of residentSceneIds) {
    const asset = sceneCache.get(sceneId)?.asset;
    if (asset) retainedAssets.add(asset);
  }
  for (const [asset, entry] of imageCache) {
    if (retainedAssets.has(asset)) continue;
    imageCache.delete(asset);
    // Do not clear the source of a decode that is already in flight: browsers
    // do not consistently settle image.decode() after that cancellation. Mark
    // it for release on settlement instead, while removing it from the bounded
    // resident map immediately.
    entry.evicted = true;
    if (entry.status === "resolved") entry.image.src = "";
  }
}

/**
 * Pins exactly the useful navigation neighborhood: current scene, its parent,
 * and one preferred child. Passing a new preferred child (for example from
 * portal focus/hover) replaces the older speculative child immediately.
 */
export function retainSceneNeighborhood(
  currentId: string,
  parentId: string | null,
  preferredChildId?: string | null,
): void {
  const next = new Set<string>();
  for (const id of [currentId, parentId, preferredChildId]) {
    if (id && next.size < MAX_RESIDENT_SCENES) next.add(id);
  }
  residentSceneIds = next;
  pruneCaches();
}

export function loadSceneManifest(signal?: AbortSignal): Promise<SceneManifest> {
  if (!manifestCache) {
    const request = fetch(sceneDataUrl("/data/scenes/manifest.json"))
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the world map");
        return validateManifest(await response.json());
      })
      .catch((error) => {
        if (manifestCache === request) manifestCache = null;
        throw error;
      });
    manifestCache = request;
  }
  return waitFor(manifestCache, signal);
}

export function loadScene(sceneId: string, signal?: AbortSignal): Promise<Scene> {
  let entry = sceneCache.get(sceneId);
  if (!entry) {
    entry = {
      status: "pending",
      promise: Promise.resolve(null as unknown as Scene),
    };
    const ownedEntry = entry;
    ownedEntry.promise = fetch(
      sceneDataUrl(`/data/scenes/${encodeURIComponent(sceneId)}.json`),
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load scene ${sceneId}`);
        const scene = validateScene(await response.json(), sceneId);
        ownedEntry.status = "resolved";
        ownedEntry.asset = scene.asset;
        ownedEntry.value = scene;
        pruneCaches();
        return scene;
      })
      .catch((error) => {
        if (sceneCache.get(sceneId) === ownedEntry) sceneCache.delete(sceneId);
        throw error;
      });
    sceneCache.set(sceneId, ownedEntry);
    // Callers outside WorldApp can still load a scene, but they do not get to
    // grow the persistent cache beyond the active three-scene neighborhood.
    if (residentSceneIds.size > 0 && !residentSceneIds.has(sceneId)) pruneCaches();
  }
  return waitFor(entry.promise, signal);
}

export function decodeSceneImage(asset: string, signal?: AbortSignal): Promise<void> {
  let entry = imageCache.get(asset);
  if (!entry) {
    const image = new Image();
    image.decoding = "async";
    entry = {
      image,
      status: "pending",
      evicted: false,
      promise: Promise.resolve(),
    };
    const ownedEntry = entry;
    ownedEntry.promise = new Promise<void>((resolve, reject) => {
      let decodeStarted = false;
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };
      const decode = () => {
        if (decodeStarted) return;
        decodeStarted = true;
        void image.decode().then(
          () => {
            cleanup();
            ownedEntry.status = "resolved";
            if (ownedEntry.evicted) image.src = "";
            resolve();
          },
          (error: unknown) => {
            cleanup();
            reject(error);
          },
        );
      };
      image.onload = decode;
      image.onerror = () => {
        cleanup();
        reject(new Error(`Unable to decode ${asset}`));
      };
      image.src = asset;
      if (image.complete && image.naturalWidth > 0) decode();
    })
      .catch((error) => {
        if (imageCache.get(asset) === ownedEntry) imageCache.delete(asset);
        throw error;
      })
      .finally(pruneCaches);
    imageCache.set(asset, ownedEntry);
    if (residentSceneIds.size > 0) pruneCaches();
  }
  return waitFor(entry.promise, signal);
}

export async function prepareScene(sceneId: string, signal?: AbortSignal): Promise<Scene> {
  const scene = await loadScene(sceneId, signal);
  // A speculative child can be replaced while its JSON is in flight. Do not
  // start an orphan image decode after that scene has lost its one bounded
  // neighborhood slot. If it becomes preferred again, the current request for
  // that ID will warm it normally.
  if (residentSceneIds.size > 0 && !residentSceneIds.has(sceneId)) return scene;
  await decodeSceneImage(scene.asset, signal);
  return scene;
}

export function prefetchScene(sceneId: string): void {
  void prepareScene(sceneId).catch(() => undefined);
}

export function isScenePrepared(sceneId: string): boolean {
  return getPreparedScene(sceneId) !== null;
}

/**
 * Returns a scene synchronously only when both its data and decoded artwork
 * are resident. Navigation can therefore swap to a warm parent/child in the
 * same input turn instead of paying an artificial promise/transition delay.
 */
export function getPreparedScene(sceneId: string): Scene | null {
  const sceneEntry = sceneCache.get(sceneId);
  if (
    sceneEntry?.status !== "resolved"
    || !sceneEntry.value
    || !sceneEntry.asset
    || imageCache.get(sceneEntry.asset)?.status !== "resolved"
  ) {
    return null;
  }
  return sceneEntry.value;
}

export function getSceneCacheSnapshot(): SceneCacheSnapshot {
  return {
    residentSceneIds: [...residentSceneIds],
    scenes: [...sceneCache].map(([sceneId, entry]) => ({
      sceneId,
      status: entry.status,
      ...(entry.asset ? { asset: entry.asset } : {}),
    })),
    images: [...imageCache].map(([asset, entry]) => ({
      asset,
      status: entry.status,
      retainedImage: entry.image instanceof Image,
    })),
    limits: { scenes: MAX_RESIDENT_SCENES, images: MAX_RESIDENT_IMAGES },
  };
}

export function resetSceneRepositoryForTests(): void {
  for (const entry of imageCache.values()) entry.image.src = "";
  sceneCache.clear();
  imageCache.clear();
  residentSceneIds = new Set();
  manifestCache = null;
}
