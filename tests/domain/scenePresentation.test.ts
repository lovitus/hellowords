import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLabelSemanticStyleMap, buildVocabularyZoomCues, type Scene } from "../../app/domain";
import { SPATIAL_LEXEME_REALMS } from "../../app/domain/spatialLexemeRealms.generated";
import { getScenePresentation } from "../../app/lib/scene-presentation";

test("scene presentation reuses immutable snapshots without changing labels or cues", () => {
  const scene = JSON.parse(readFileSync(new URL("../../public/data/scenes/world-map.json", import.meta.url), "utf8")) as Scene;
  const presentation = getScenePresentation(scene);
  assert.equal(getScenePresentation(scene), presentation);
  assert.equal(presentation.labelsById.size, scene.labels.length);
  assert.deepEqual(presentation.labelSemanticStyles,
    buildLabelSemanticStyleMap(scene.labels, scene.visualRegions ?? [], SPATIAL_LEXEME_REALMS));
  assert.deepEqual(presentation.vocabularyZoomCues,
    buildVocabularyZoomCues(scene.labels, scene.portals, scene.width, scene.height, 8, scene.detailZones));
  const refreshed = { ...scene, labels: scene.labels.slice(1) };
  const refreshedPresentation = getScenePresentation(refreshed);
  assert.notEqual(refreshedPresentation, presentation);
  assert.equal(refreshedPresentation.labelsById.has(scene.labels[0].id), false);
  assert.equal(getScenePresentation(scene), presentation);
});
