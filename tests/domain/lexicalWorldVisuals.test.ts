import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import test from "node:test";
import {
  APPROVED_LEXICAL_WORLD_VISUAL_ASSETS,
  LEXICAL_WORLD_OVERVIEW_IMAGE,
  LEXICAL_WORLD_VISUAL_MANIFEST,
  requireApprovedLexicalWorldVisual,
} from "../../app/lib/lexical-world-visuals";

const projectRoot = resolve(import.meta.dirname, "../..");
const appRoot = resolve(projectRoot, "app");
const scenesRoot = resolve(projectRoot, "public/scenes");
const runtimeExtensions = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const lexicalAssetPattern = /\/scenes\/lexical-[^\s"'()`]+\.(?:avif|jpe?g|png|svg|webp)/giu;
const rejectedCandidates = [
  "/scenes/lexical-realm-body-daily-life-v1.jpg",
  "/scenes/lexical-realm-grammar-relations-v1.jpg",
  "/scenes/lexical-realm-nature-life-v1.jpg",
  "/scenes/lexical-realm-qualities-states-v1.jpg",
  "/scenes/lexical-realm-space-time-measure-v1.jpg",
  "/scenes/lexical-world-overview-v1.jpg",
] as const;

async function runtimeSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(entryPath);
    return runtimeExtensions.has(extname(entry.name)) ? [entryPath] : [];
  }));
  return files.flat();
}

test("the reviewed lexical-world overview is the only packaged visual", async () => {
  assert.deepEqual(APPROVED_LEXICAL_WORLD_VISUAL_ASSETS, [
    "/scenes/lexical-world-overview-bright-v2.jpg",
  ]);
  assert.equal(LEXICAL_WORLD_OVERVIEW_IMAGE, APPROVED_LEXICAL_WORLD_VISUAL_ASSETS[0]);

  const review = LEXICAL_WORLD_VISUAL_MANIFEST.overview;
  assert.equal(review.reviewStatus, "approved");
  assert.equal(review.width, 1600);
  assert.equal(review.height, 900);

  const assetPath = resolve(projectRoot, `public${review.asset}`);
  assert((await stat(assetPath)).isFile());
  const digest = createHash("sha256").update(await readFile(assetPath)).digest("hex");
  assert.equal(digest, review.reviewedSha256, "the reviewed image bytes changed");

  const packagedLexicalAssets = (await readdir(scenesRoot))
    .filter((name) => /^lexical-.*\.(?:avif|jpe?g|png|svg|webp)$/iu.test(name))
    .map((name) => `/scenes/${name}`)
    .sort();
  assert.deepEqual(packagedLexicalAssets, [...APPROVED_LEXICAL_WORLD_VISUAL_ASSETS]);
});

test("runtime lexical-world image references cannot bypass the approved allowlist", async () => {
  const sourceFiles = await runtimeSourceFiles(appRoot);
  const references = new Map<string, string[]>();

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    for (const match of source.matchAll(lexicalAssetPattern)) {
      const asset = match[0];
      const owners = references.get(asset) ?? [];
      owners.push(relative(projectRoot, sourceFile));
      references.set(asset, owners);
    }
  }

  assert.deepEqual([...references.keys()].sort(), [...APPROVED_LEXICAL_WORLD_VISUAL_ASSETS]);
  for (const asset of references.keys()) assert.equal(requireApprovedLexicalWorldVisual(asset), asset);
  for (const rejected of rejectedCandidates) {
    assert.equal(references.has(rejected), false, `${rejected} is referenced by runtime source`);
    assert.throws(() => requireApprovedLexicalWorldVisual(rejected), /Unapproved lexical-world visual asset/);
  }
});
