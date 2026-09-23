import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCENE_CONVERSATIONS } from "../../app/domain/sceneConversations";

test("scene practice supplies 474 original bilingual turns in thirty-five reachable scenes", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../public/data/scenes/manifest.json", import.meta.url), "utf8"));
  const scenes = manifest.scenes as Array<{ id: string; parentId: string | null }>;
  const parentById = new Map(scenes.map(({ id, parentId }) => [id, parentId] as const));
  const reachesRoot = (sceneId: string) => {
    const visited = new Set<string>();
    let current: string | null | undefined = sceneId;
    while (current && current !== manifest.rootSceneId && !visited.has(current)) {
      visited.add(current);
      current = parentById.get(current);
    }
    return current === manifest.rootSceneId;
  };
  const sentences = new Set<string>();
  const expandedMedicalScenes = new Set([
    "hospital-pharmacy",
    "emergency-department",
    "emergency-triage-reception",
    "emergency-assessment-bay",
    "hospital-inpatient-bedspace",
    "intensive-care-unit",
    "operating-theatre",
    "radiology-suite",
    "pathology-lab",
  ]);
  assert.equal(Object.keys(SCENE_CONVERSATIONS).length, 35);
  for (const [sceneId, conversations] of Object.entries(SCENE_CONVERSATIONS)) {
    assert.ok(reachesRoot(sceneId), `${sceneId} must lead back to ${manifest.rootSceneId}`);
    assert.equal(conversations.length, expandedMedicalScenes.has(sceneId) ? 3 : 2);
    for (const conversation of conversations) {
      assert.equal(conversation.roles.length, 2);
      assert.equal(conversation.lines.length, 6);
      for (const [english, chinese] of conversation.lines) {
        assert.ok(english.trim());
        assert.match(chinese, /\p{Script=Han}/u);
        assert.ok(!sentences.has(english), english);
        sentences.add(english);
      }
    }
  }
  assert.equal(sentences.size, 474);
  assert.ok(SCENE_CONVERSATIONS["school-locker-bank"]);
  assert.ok(SCENE_CONVERSATIONS["airport-conveyor-drive-unit"]);
  assert.ok(SCENE_CONVERSATIONS["office-network-rack"]);
  assert.ok(SCENE_CONVERSATIONS["passenger-boarding-bridge"]);
  assert.ok(SCENE_CONVERSATIONS["office-elevator-car"]);
  assert.ok(SCENE_CONVERSATIONS["emergency-triage-reception"]);
  assert.ok(SCENE_CONVERSATIONS["emergency-assessment-bay"]);
  assert.equal(SCENE_CONVERSATIONS["world-map"], undefined);
});
