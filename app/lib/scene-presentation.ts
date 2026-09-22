import { buildLabelSemanticStyleMap, buildVocabularyZoomCues, type Scene } from "../domain";
import { SPATIAL_LEXEME_REALMS } from "../domain/spatialLexemeRealms.generated";

function buildScenePresentation(scene: Scene) {
  return {
    labelsById: new Map(scene.labels.map(label => [label.id, label])),
    labelSemanticStyles: buildLabelSemanticStyleMap(scene.labels, scene.visualRegions ?? [], SPATIAL_LEXEME_REALMS),
    vocabularyZoomCues: buildVocabularyZoomCues(scene.labels, scene.portals, scene.width, scene.height, 8, scene.detailZones),
  };
}

// Repository Scene objects are immutable snapshots. Key by object, not ID:
// refreshed data must rebuild, and evicted scenes must remain collectible.
const presentations = new WeakMap<Scene, ReturnType<typeof buildScenePresentation>>();

export function getScenePresentation(scene: Scene) {
  let presentation = presentations.get(scene);
  if (!presentation) {
    presentation = buildScenePresentation(scene);
    presentations.set(scene, presentation);
  }
  return presentation;
}
