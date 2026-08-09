import type { Scene } from "../domain";

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

const sceneCache = new Map<string, Promise<Scene>>();
const imageCache = new Map<string, Promise<void>>();
let manifestCache: Promise<SceneManifest> | null = null;

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

export function loadSceneManifest(signal?: AbortSignal): Promise<SceneManifest> {
  if (manifestCache) return manifestCache;
  manifestCache = fetch("/data/scenes/manifest.json", { signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load the world map");
      return validateManifest(await response.json());
    })
    .catch((error) => {
      manifestCache = null;
      throw error;
    });
  return manifestCache;
}

export function loadScene(sceneId: string, signal?: AbortSignal): Promise<Scene> {
  const cached = sceneCache.get(sceneId);
  if (cached) return cached;

  const request = fetch(`/data/scenes/${encodeURIComponent(sceneId)}.json`, { signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load scene ${sceneId}`);
      return validateScene(await response.json(), sceneId);
    })
    .catch((error) => {
      sceneCache.delete(sceneId);
      throw error;
    });

  sceneCache.set(sceneId, request);
  return request;
}

export function decodeSceneImage(asset: string): Promise<void> {
  const cached = imageCache.get(asset);
  if (cached) return cached;

  const request = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to decode ${asset}`));
    image.src = asset;
    if (image.complete) {
      image.decode().then(resolve, reject);
    }
  }).catch((error) => {
    imageCache.delete(asset);
    throw error;
  });

  imageCache.set(asset, request);
  return request;
}

export async function prepareScene(sceneId: string, signal?: AbortSignal): Promise<Scene> {
  const scene = await loadScene(sceneId, signal);
  await decodeSceneImage(scene.asset);
  return scene;
}

export function prefetchScene(sceneId: string): void {
  void loadScene(sceneId)
    .then((scene) => decodeSceneImage(scene.asset))
    .catch(() => undefined);
}
