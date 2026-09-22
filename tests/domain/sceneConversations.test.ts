import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCENE_CONVERSATIONS } from "../../app/domain/sceneConversations";

test("scene practice supplies 72 original bilingual turns in six reachable scenes", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../public/data/scenes/manifest.json", import.meta.url), "utf8"));
  const sceneIds = new Set(manifest.scenes.map((scene: { id: string }) => scene.id));
  const sentences = new Set<string>();
  assert.equal(Object.keys(SCENE_CONVERSATIONS).length, 6);
  for (const [sceneId, conversations] of Object.entries(SCENE_CONVERSATIONS)) {
    assert.ok(sceneIds.has(sceneId), sceneId);
    assert.equal(conversations.length, 2);
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
  assert.equal(sentences.size, 72);
  assert.equal(SCENE_CONVERSATIONS["world-map"], undefined);
});
