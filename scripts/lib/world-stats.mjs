import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function manifestSceneIds(manifest) {
  return manifest.scenes.map((entry) => typeof entry === "string" ? entry : entry.id);
}
export async function collectWorldStats(projectRoot) {
  const sceneDataRoot = resolve(projectRoot, "public/data/scenes");
  const manifest = JSON.parse(await readFile(resolve(sceneDataRoot, "manifest.json"), "utf8"));
  const sceneIds = manifestSceneIds(manifest);
  const distinctTerms = new Set();
  let anchors = 0;
  let detailZones = 0;
  let linkedAnchors = 0;
  let portals = 0;
  let rasterScenes = 0;
  let svgScenes = 0;

  for (const sceneId of sceneIds) {
    const scene = JSON.parse(await readFile(resolve(sceneDataRoot, `${sceneId}.json`), "utf8"));
    anchors += scene.labels.length;
    detailZones += scene.detailZones?.length ?? 0;
    portals += scene.portals.length;
    linkedAnchors += scene.labels.filter((label) => Boolean(label.lexemeId)).length;
    for (const label of scene.labels) distinctTerms.add(label.word.trim().toLocaleLowerCase("en-US"));
    if (/\.svg$/i.test(scene.asset)) svgScenes += 1;
    else rasterScenes += 1;
  }

  return {
    scenes: sceneIds.length,
    portals,
    anchors,
    distinctTerms: distinctTerms.size,
    detailZones,
    linkedAnchors,
    rasterScenes,
    svgScenes,
  };
}
