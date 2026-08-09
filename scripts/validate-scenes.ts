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
const MIN_MATURE_SCENES = 18;
const MIN_NATURAL_ANCHORS = 430;
const MIN_ROOT_BRANCHES = 3;

async function main() {
  const manifestBytes = await readFile(resolve(dataRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as SceneManifest;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported scene manifest schema");
  if (!manifest.rootSceneId) throw new Error("Scene manifest has no root");

  const scenes = await Promise.all(
    manifest.scenes.map(async (manifestScene) => {
      const { id } = manifestScene;
      const bytes = await readFile(resolve(dataRoot, `${id}.json`));
      const scene = JSON.parse(bytes.toString("utf8")) as Scene;
      if (scene.id !== id) throw new Error(`Scene file ID mismatch: ${id}`);
      if (scene.title !== manifestScene.title) {
        throw new Error(`Manifest title mismatch for ${id}`);
      }
      if ((scene.parentId ?? null) !== manifestScene.parentId) {
        throw new Error(`Manifest parent mismatch for ${id}`);
      }
      const assetPath = resolve(publicRoot, scene.asset.replace(/^\//, ""));
      const assetStat = await stat(assetPath);
      if (!assetStat.isFile()) throw new Error(`Missing scene asset: ${scene.asset}`);
      if (scene.labels.length > 24) throw new Error(`Scene ${id} exceeds the 24-label DOM budget`);
      if (scene.labels.length < 18) throw new Error(`Scene ${id} is too sparse for mature content`);
      if (!scene.translation?.trim()) throw new Error(`Scene ${id} has no translation`);
      const densityBands = new Set(scene.labels.map((label) => label.minLevel));
      if (![0, 1, 2].every((level) => densityBands.has(level as 0 | 1 | 2))) {
        throw new Error(`Scene ${id} does not cover all three label-density bands`);
      }
      for (const label of scene.labels) {
        if (!label.translation.trim()) throw new Error(`Label ${id}/${label.id} has no translation`);
        if (!/^[a-z][a-z -]*$/i.test(label.word)) {
          throw new Error(`Label ${id}/${label.id} is not a natural English display term`);
        }
      }
      for (const portal of scene.portals) {
        if (!portal.translation?.trim()) throw new Error(`Portal ${id}/${portal.id} has no translation`);
      }
      const asset = await readFile(assetPath);
      if (scene.asset.endsWith(".svg")) {
        const source = asset.toString("utf8");
        const expectedViewBox = `viewBox="0 0 ${scene.width} ${scene.height}"`;
        if (!source.includes(expectedViewBox)) throw new Error(`Asset ${scene.asset} has the wrong viewBox`);
        if (!source.includes("<title") || !source.includes("<desc")) {
          throw new Error(`Asset ${scene.asset} needs an accessible title and description`);
        }
      } else if (scene.asset.endsWith(".jpg") || scene.asset.endsWith(".jpeg")) {
        if (asset[0] !== 0xff || asset[1] !== 0xd8 || asset[2] !== 0xff) {
          throw new Error(`Asset ${scene.asset} is not a valid JPEG`);
        }
      } else {
        throw new Error(`Unsupported scene asset type: ${scene.asset}`);
      }
      return { scene, assetBytes: assetStat.size };
    }),
  );

  assertValidSceneGraph(scenes.map(({ scene }) => scene));
  const root = scenes.find(({ scene }) => scene.id === manifest.rootSceneId)?.scene;
  if (!root || root.parentId != null) throw new Error("Manifest root is not a root scene");
  if (scenes.length < MIN_MATURE_SCENES) {
    throw new Error(`World has ${scenes.length} scenes; expected at least ${MIN_MATURE_SCENES}`);
  }
  const labelCount = scenes.reduce((sum, { scene }) => sum + scene.labels.length, 0);
  if (labelCount < MIN_NATURAL_ANCHORS) {
    throw new Error(`World has ${labelCount} anchors; expected at least ${MIN_NATURAL_ANCHORS}`);
  }
  if (root.portals.length < MIN_ROOT_BRANCHES) {
    throw new Error(`World root has ${root.portals.length} branches; expected at least ${MIN_ROOT_BRANCHES}`);
  }
  const portalCount = scenes.reduce((sum, { scene }) => sum + scene.portals.length, 0);
  if (portalCount !== scenes.length - 1) {
    throw new Error("The world must remain a deterministic tree with one portal per non-root scene");
  }

  const sceneById = new Map(scenes.map(({ scene }) => [scene.id, scene]));
  const descendants = (id: string): number => {
    const scene = sceneById.get(id);
    if (!scene) return 0;
    return 1 + scene.portals.reduce((sum, portal) => sum + descendants(portal.childSceneId), 0);
  };
  const branchCoverage = Object.fromEntries(
    root.portals.map((portal) => [portal.childSceneId, descendants(portal.childSceneId)]),
  );
  if (Object.values(branchCoverage).some((count) => count < 4)) {
    throw new Error("Every root branch must contain at least four explorable scene levels");
  }

  const report = {
    schemaVersion: 1,
    rootSceneId: manifest.rootSceneId,
    sceneCount: scenes.length,
    labelCount,
    portalCount,
    rootBranchCount: root.portals.length,
    branchCoverage,
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
