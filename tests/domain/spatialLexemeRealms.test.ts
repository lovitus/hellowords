import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  LABEL_SEMANTIC_REALMS,
  resolveLabelSemanticStyle,
  type Scene,
} from "../../app/domain";
import {
  SPATIAL_LEXEME_LINK_COUNT,
  SPATIAL_LEXEME_REALMS,
} from "../../app/domain/spatialLexemeRealms.generated";

const projectRoot = resolve(import.meta.dirname, "../..");
const lookup: Readonly<Record<string, string | undefined>> = SPATIAL_LEXEME_REALMS;

test("the compact spatial realm index covers every authored lexeme link", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(projectRoot, "public/data/scenes/manifest.json"), "utf8"),
  ) as { scenes: Array<{ id: string }> };
  const scenes = await Promise.all(manifest.scenes.map(async ({ id }) => JSON.parse(
    await readFile(resolve(projectRoot, `public/data/scenes/${id}.json`), "utf8"),
  ) as Scene));
  const linkedLabels = scenes.flatMap((scene) => scene.labels
    .filter((label) => label.lexemeId)
    .map((label) => ({ label, regions: scene.visualRegions ?? [] })));

  assert.equal(linkedLabels.length, SPATIAL_LEXEME_LINK_COUNT);
  assert.equal(linkedLabels.length, 249);
  assert.equal(Object.keys(SPATIAL_LEXEME_REALMS).length, 159);

  let realmPaletteCount = 0;
  let fallbackPaletteCount = 0;
  for (const { label, regions } of linkedLabels) {
    assert.ok(label.lexemeId);
    assert.ok(lookup[label.lexemeId], `missing realm for ${label.lexemeId}`);
    const style = resolveLabelSemanticStyle(label, regions, SPATIAL_LEXEME_REALMS);
    if (style.paletteIndex < LABEL_SEMANTIC_REALMS.length) realmPaletteCount += 1;
    else fallbackPaletteCount += 1;
    assert.equal(style.source, "realm", `${label.id} must use its lexical realm`);
  }
  assert.equal(realmPaletteCount, linkedLabels.length);
  assert.equal(fallbackPaletteCount, 0);

  const generatedFile = await stat(resolve(
    projectRoot,
    "app/domain/spatialLexemeRealms.generated.ts",
  ));
  assert.ok(generatedFile.size <= 16 * 1024, `realm index is ${generatedFile.size} bytes`);
});

test("unknown or unlinked lexemes keep the visual-region fallback", () => {
  const regions = [
    { id: "object", description: "Visible object", kind: "object" as const, x: 0, y: 0, width: 100, height: 100 },
  ];
  const unknown = resolveLabelSemanticStyle({
    id: "unknown",
    lexemeId: "en-not-in-spatial-index",
    sourceVisualRegion: "object",
  }, regions, SPATIAL_LEXEME_REALMS);
  const unlinked = resolveLabelSemanticStyle({
    id: "unlinked",
    lexemeId: undefined,
    sourceVisualRegion: "object",
  }, regions, SPATIAL_LEXEME_REALMS);

  assert.equal(unknown.source, "visual-region");
  assert.equal(unknown.semanticGroup, "visual-object");
  assert.equal(unlinked.source, "visual-region");
  assert.equal(unlinked.semanticGroup, "visual-object");
});
