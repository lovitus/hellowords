import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const SCENE_ASSET_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
    }),
  );
  return nested.flat();
}

export function findOrphanSceneAssets(assetPaths, referenceTexts) {
  return assetPaths
    .filter((assetPath) => SCENE_ASSET_PATTERN.test(assetPath))
    .filter((assetPath) => {
      const normalizedPath = assetPath.split(sep).join("/");
      const publicPath = `/${normalizedPath.replace(/^public\//u, "")}`;
      return !referenceTexts.some((contents) => contents.includes(publicPath));
    })
    .sort();
}

export async function scanOrphanSceneAssets(projectRoot) {
  const publicRoot = resolve(projectRoot, "public");
  const sceneRoot = resolve(publicRoot, "scenes");
  const referenceRoots = [resolve(projectRoot, "app"), resolve(publicRoot, "data")];
  const [assetFiles, ...referenceFilesByRoot] = await Promise.all([
    walk(sceneRoot),
    ...referenceRoots.map((directory) => walk(directory)),
  ]);
  const referenceTexts = await Promise.all(
    referenceFilesByRoot.flat().map((path) => readFile(path, "utf8")),
  );
  const assetPaths = assetFiles.map((path) =>
    relative(projectRoot, path).split(sep).join("/"),
  );

  return findOrphanSceneAssets(assetPaths, referenceTexts);
}
