import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertValidSceneGraph, type Scene } from "../app/domain/index";

interface SceneManifest {
  schemaVersion: number;
  rootSceneId: string;
  scenes: Array<{ id: string; title: string; parentId: string | null }>;
}

const projectRoot = resolve(import.meta.dirname, "..");
const dataRoot = resolve(projectRoot, "public/data/scenes");
const publicRoot = resolve(projectRoot, "public");

async function main() {
  const manifestBytes = await readFile(resolve(dataRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as SceneManifest;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported scene manifest schema");
  if (!manifest.rootSceneId) throw new Error("Scene manifest has no root");

  const scenes = await Promise.all(
    manifest.scenes.map(async ({ id }) => {
      const bytes = await readFile(resolve(dataRoot, `${id}.json`));
      const scene = JSON.parse(bytes.toString("utf8")) as Scene;
      if (scene.id !== id) throw new Error(`Scene file ID mismatch: ${id}`);
      const assetPath = resolve(publicRoot, scene.asset.replace(/^\//, ""));
      const assetStat = await stat(assetPath);
      if (!assetStat.isFile()) throw new Error(`Missing scene asset: ${scene.asset}`);
      if (scene.labels.length > 24) throw new Error(`Scene ${id} exceeds the 24-label DOM budget`);
      return { scene, assetBytes: assetStat.size };
    }),
  );

  assertValidSceneGraph(scenes.map(({ scene }) => scene));
  const root = scenes.find(({ scene }) => scene.id === manifest.rootSceneId)?.scene;
  if (!root || root.parentId != null) throw new Error("Manifest root is not a root scene");

  const report = {
    schemaVersion: 1,
    rootSceneId: manifest.rootSceneId,
    sceneCount: scenes.length,
    labelCount: scenes.reduce((sum, { scene }) => sum + scene.labels.length, 0),
    portalCount: scenes.reduce((sum, { scene }) => sum + scene.portals.length, 0),
    assetBytes: scenes.reduce((sum, { assetBytes }) => sum + assetBytes, 0),
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  };
  await mkdir(resolve(projectRoot, "artifacts/correctness"), { recursive: true });
  await writeFile(
    resolve(projectRoot, "artifacts/correctness/scene-integrity.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

await main();
