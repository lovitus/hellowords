import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  SEMANTIC_BACKDROP_MOTIFS,
  SEMANTIC_BACKDROP_TOPIC_IDS,
  SEMANTIC_BACKDROP_TOPIC_MOTIFS,
  semanticBackdropMarks,
  semanticBackdropModel,
  semanticBackdropMotif,
} from "../../app/domain/semanticBackdrop";

const ROOT = new URL("../../", import.meta.url);

test("all 44 production topics have one deterministic code-native motif", () => {
  const realmsDirectory = new URL("public/data/lexical-world/realms/", ROOT);
  const topicIds = readdirSync(realmsDirectory)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const realm = JSON.parse(readFileSync(new URL(name, realmsDirectory), "utf8")) as {
        children: Array<{ id: string }>;
      };
      return realm.children.map(({ id }) => id);
    })
    .sort();
  assert.equal(topicIds.length, 44);
  assert.deepEqual([...SEMANTIC_BACKDROP_TOPIC_IDS].sort(), topicIds);
  assert.equal(Object.keys(SEMANTIC_BACKDROP_TOPIC_MOTIFS).length, 44);
  assert.ok(Object.values(SEMANTIC_BACKDROP_TOPIC_MOTIFS).every((motif) => (
    SEMANTIC_BACKDROP_MOTIFS.includes(motif)
  )));
});

test("Integer and every number-measure leaf resolve to a labeled number line", () => {
  assert.equal(semanticBackdropMotif("number-measure"), "number-line");
  assert.equal(
    semanticBackdropMotif("unknown", "number-measure--integer", "Integer"),
    "number-line",
  );
  const marks = semanticBackdropMarks("number-line");
  assert.deepEqual(marks.map(({ label }) => label), ["−∞", "−100", "−10", "−1", "0", "1", "10", "100", "+∞"]);
  assert.ok(marks.every(({ x, y }) => x >= 0 && x <= 100 && y >= 0 && y <= 100));
});

test("backdrop copy exposes complete topic and leaf names with ordinals", () => {
  const model = semanticBackdropModel({
    topicId: "number-measure",
    topicLabelEn: "Number & measure",
    topicLabelZh: "数字与度量",
    subclusterId: "number-measure--integer",
    subclusterLabelEn: "Integer",
    subclusterLabelZh: "整数",
    subclusterIds: ["number-measure--quantity", "number-measure--integer", "number-measure--unit"],
  });
  assert.equal(model.topicTotal, 44);
  assert.ok(model.topicOrdinal > 0);
  assert.equal(model.titleEn, "Integer");
  assert.equal(model.titleZh, "整数");
  assert.equal(model.subclusterOrdinal, 2);
  assert.equal(model.subclusterTotal, 3);
  assert.match(model.ordinalLabel, /^TOPIC \d+\/44 · WORD GROUP 2\/3$/u);
});

test("Field contracts photo overview/topic and diagram subcluster/word modes", () => {
  const source = readFileSync(new URL("app/components/SemanticZoomField.tsx", ROOT), "utf8");
  const css = readFileSync(new URL("app/components/semantic-zoom-field.css", ROOT), "utf8");
  assert.match(source, /displayLevel === "subcluster" \|\| displayLevel === "word"/u);
  assert.match(source, /data-visual-mode=\{visualMode\}/u);
  assert.match(source, /data-motif=\{backdrop\?\.motif \?\? "photo"\}/u);
  assert.match(source, /data-topic=\{selectedTopic\?\.id \?\? ""\}/u);
  assert.match(source, /data-active-asset=\{visualMode === "photo" \? activeAsset : undefined\}/u);
  assert.match(source, /visualMode === "photo" && leaderLength > 8/u);
  assert.match(css, /data-visual-mode="diagram"[^}]*semantic-zoom-field__plane[^}]*opacity: 0;/u);
});
