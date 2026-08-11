import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import test from "node:test";
import {
  APPROVED_LEXICAL_WORLD_VISUAL_ASSETS,
  LEXICAL_WORLD_OVERVIEW_IMAGE,
  LEXICAL_WORLD_VISUAL_MANIFEST,
  lexicalWorldRealmTiles,
  lexicalWorldTileForRealm,
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

const expectedRealmTiles = [
  ["nature-life", "Nature & life", "自然与生命", 0, 35, 505, 300, 0, 0, 672, 378, 235, 205],
  ["body-daily-life", "Body & daily life", "身体与日常", 405, 5, 445, 325, 292, 0, 672, 378, 640, 160],
  ["objects-technology", "Objects & technology", "物品与科技", 1065, 310, 535, 315, 928, 279, 672, 378, 1390, 455],
  ["people-society", "People & society", "人与社会", 820, 0, 390, 355, 679, 0, 672, 378, 1015, 160],
  ["mind-values", "Mind & values", "心智与价值", 1150, 65, 450, 300, 928, 26, 672, 378, 1368, 225],
  ["language-culture", "Language & culture", "语言与文化", 0, 530, 510, 370, 0, 522, 672, 378, 245, 685],
  ["actions-events", "Actions & events", "动作与事件", 420, 535, 440, 365, 304, 522, 672, 378, 650, 735],
  ["space-time-measure", "Space, time & measure", "时空与度量", 0, 310, 560, 300, 0, 271, 672, 378, 250, 425],
  ["qualities-states", "Qualities & states", "性质与状态", 775, 530, 415, 370, 647, 522, 672, 378, 990, 735],
  ["grammar-relations", "Grammar & relations", "语法与关系", 1140, 525, 460, 375, 928, 522, 672, 378, 1360, 715],
] as const;

function intersectionArea(
  left: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  right: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

async function runtimeSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(entryPath);
    return runtimeExtensions.has(extname(entry.name)) ? [entryPath] : [];
  }));
  return files.flat();
}

test("every packaged lexical-world visual is reviewed and immutable", async () => {
  assert.deepEqual([...APPROVED_LEXICAL_WORLD_VISUAL_ASSETS].sort(), [
    "/scenes/lexical-realm-actions-events-v2.jpg",
    "/scenes/lexical-realm-body-daily-life-v2.jpg",
    "/scenes/lexical-realm-grammar-relations-v2.jpg",
    "/scenes/lexical-realm-language-culture-v2.jpg",
    "/scenes/lexical-realm-mind-values-v2.jpg",
    "/scenes/lexical-realm-nature-life-v2.jpg",
    "/scenes/lexical-realm-objects-technology-v2.jpg",
    "/scenes/lexical-realm-people-society-v2.jpg",
    "/scenes/lexical-realm-qualities-states-v2.jpg",
    "/scenes/lexical-realm-space-time-measure-v2.jpg",
    "/scenes/lexical-world-overview-bright-v2.jpg",
  ].sort());
  assert.equal(LEXICAL_WORLD_OVERVIEW_IMAGE, APPROVED_LEXICAL_WORLD_VISUAL_ASSETS[0]);

  for (const review of Object.values(LEXICAL_WORLD_VISUAL_MANIFEST)) {
    assert.equal(review.reviewStatus, "approved");
    assert.equal(review.width, 1600);
    assert.equal(review.height, 900);
    const assetPath = resolve(projectRoot, `public${review.asset}`);
    assert((await stat(assetPath)).isFile());
    const digest = createHash("sha256").update(await readFile(assetPath)).digest("hex");
    assert.equal(digest, review.reviewedSha256, `${review.asset} bytes changed`);
  }

  const packagedLexicalAssets = (await readdir(scenesRoot))
    .filter((name) => /^lexical-.*\.(?:avif|jpe?g|png|svg|webp)$/iu.test(name))
    .map((name) => `/scenes/${name}`)
    .sort();
  assert.deepEqual(packagedLexicalAssets, [...APPROVED_LEXICAL_WORLD_VISUAL_ASSETS].sort());
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

  assert.deepEqual([...references.keys()].sort(), [...APPROVED_LEXICAL_WORLD_VISUAL_ASSETS].sort());
  for (const asset of references.keys()) assert.equal(requireApprovedLexicalWorldVisual(asset), asset);
  for (const rejected of rejectedCandidates) {
    assert.equal(references.has(rejected), false, `${rejected} is referenced by runtime source`);
    assert.throws(() => requireApprovedLexicalWorldVisual(rejected), /Unapproved lexical-world visual asset/);
  }
});

test("the overview exposes ten stable, bounded and visually distinct realm tiles", () => {
  const tiles = lexicalWorldRealmTiles();
  assert.equal(tiles.length, 10);
  assert.equal(new Set(tiles.map((tile) => tile.realmId)).size, 10);
  assert.equal(new Set(tiles.map((tile) => tile.asset)).size, 10);

  assert.deepEqual(tiles.map((tile) => [
    tile.realmId,
    tile.labelEn,
    tile.labelZh,
    tile.overviewRect.x,
    tile.overviewRect.y,
    tile.overviewRect.width,
    tile.overviewRect.height,
    tile.detailRect.x,
    tile.detailRect.y,
    tile.detailRect.width,
    tile.detailRect.height,
    tile.focalPoint.x,
    tile.focalPoint.y,
  ]), expectedRealmTiles);

  for (const tile of tiles) {
    const { overviewRect: rect, detailRect, focalPoint: focal } = tile;
    assert.equal(tile.overviewAsset, LEXICAL_WORLD_OVERVIEW_IMAGE);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.width > 0 && rect.height > 0);
    assert.ok(rect.x + rect.width <= LEXICAL_WORLD_VISUAL_MANIFEST.overview.width);
    assert.ok(rect.y + rect.height <= LEXICAL_WORLD_VISUAL_MANIFEST.overview.height);
    assert.ok(focal.x >= rect.x && focal.x <= rect.x + rect.width);
    assert.ok(focal.y >= rect.y && focal.y <= rect.y + rect.height);
    assert.ok(detailRect.x >= 0 && detailRect.y >= 0);
    assert.ok(detailRect.width > 0 && detailRect.height > 0);
    assert.ok(detailRect.x + detailRect.width <= LEXICAL_WORLD_VISUAL_MANIFEST.overview.width);
    assert.ok(detailRect.y + detailRect.height <= LEXICAL_WORLD_VISUAL_MANIFEST.overview.height);
    assert.equal(detailRect.width * 9, detailRect.height * 16, `${tile.realmId} detail field must be 16:9`);
    assert.ok(detailRect.x <= rect.x && detailRect.y <= rect.y);
    assert.ok(detailRect.x + detailRect.width >= rect.x + rect.width);
    assert.ok(detailRect.y + detailRect.height >= rect.y + rect.height);
    assert.ok(focal.x >= detailRect.x && focal.x <= detailRect.x + detailRect.width);
    assert.ok(focal.y >= detailRect.y && focal.y <= detailRect.y + detailRect.height);
    assert.strictEqual(lexicalWorldTileForRealm(tile.realmId), tile);

    for (const other of tiles) {
      if (other === tile) continue;
      const otherFocalInside = other.focalPoint.x >= rect.x
        && other.focalPoint.x <= rect.x + rect.width
        && other.focalPoint.y >= rect.y
        && other.focalPoint.y <= rect.y + rect.height;
      assert.equal(otherFocalInside, false, `${tile.realmId} must not capture ${other.realmId}'s focal point`);

      const smallerArea = Math.min(rect.width * rect.height, other.overviewRect.width * other.overviewRect.height);
      assert.ok(
        intersectionArea(rect, other.overviewRect) / smallerArea < 0.3,
        `${tile.realmId} and ${other.realmId} overlap too much`,
      );
    }
  }

  assert.equal(lexicalWorldTileForRealm("unknown-realm"), undefined);
});
