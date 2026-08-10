import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  projectScenePointToScreen,
  projectSceneRectToScreen,
  SceneViewport,
  setStylePropertyIfChanged,
} from "../../app/components/SceneViewport";
import { computeSceneLabelLayout, type Label, type Scene } from "../../app/domain";

const ROOT = new URL("../../", import.meta.url);

function matchingDivClose(markup: string, openIndex: number): number {
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = openIndex;
  let depth = 0;
  for (let match = tags.exec(markup); match; match = tags.exec(markup)) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return tags.lastIndex;
  }
  throw new Error("scene surface has no matching closing div");
}

test("camera frames skip redundant inline-style writes", () => {
  const values = new Map<string, string>();
  let writes = 0;
  const style: Pick<CSSStyleDeclaration, "getPropertyValue" | "setProperty"> = {
    getPropertyValue(property) {
      return values.get(property) ?? "";
    },
    setProperty(property, value) {
      writes += 1;
      values.set(property, value ?? "");
    },
  };

  assert.equal(setStylePropertyIfChanged(style, "left", "120.00px"), true);
  assert.equal(setStylePropertyIfChanged(style, "left", "120.00px"), false);
  assert.equal(setStylePropertyIfChanged(style, "left", "120.50px"), true);
  assert.equal(writes, 2, "a settled camera does not repeat the same DOM style mutation");
});

test("scene anchors project into screen coordinates while labels remain outside the scaled surface", () => {
  const detail: Label = {
    id: "grain",
    word: "grain",
    translation: "纹理",
    x: 120,
    y: 80,
    priority: 1,
    minLevel: 4,
  };
  const viewport = { width: 900, height: 600, compact: false };
  for (const scale of [2.55, 3] as const) {
    const camera = { x: 13, y: -9, fit: 0.75, scale };
    const [placed] = computeSceneLabelLayout([detail], camera, viewport, false);
    assert.equal(placed.screenX - placed.offsetX, camera.x + detail.x * camera.fit * scale);
    assert.equal(placed.screenY - placed.offsetY, camera.y + detail.y * camera.fit * scale);
    assert.deepEqual(projectScenePointToScreen(detail, camera), {
      x: camera.x + detail.x * camera.fit * scale,
      y: camera.y + detail.y * camera.fit * scale,
    });
    assert.deepEqual(
      projectSceneRectToScreen({ x: 40, y: 50, width: 160, height: 90 }, camera),
      {
        x: camera.x + 40 * camera.fit * scale,
        y: camera.y + 50 * camera.fit * scale,
        width: 160 * camera.fit * scale,
        height: 90 * camera.fit * scale,
      },
      "portal bounds use the same scene camera as the artwork",
    );
  }

  const scene: Scene = {
    id: "screen-space-contract",
    title: "Screen space",
    subtitle: "Crisp labels",
    asset: "/scene.svg",
    width: 900,
    height: 600,
    labels: [detail],
    portals: [{
      id: "enter-detail",
      label: "Enter detail",
      childSceneId: "detail",
      x: 40,
      y: 50,
      width: 160,
      height: 90,
    }],
  };
  const markup = renderToStaticMarkup(createElement(SceneViewport, {
    scene,
    meaningVisible: false,
    portalTargetTitles: {},
    onCommitScene: () => true,
    onEnterScene: async () => true,
    onExitScene: () => undefined,
    onLabelsEncountered: () => undefined,
    onLabelEncountered: () => undefined,
    onSelectWord: () => undefined,
    onPrefetchScene: () => undefined,
  }));
  const surfaceStart = markup.indexOf('<div class="scene-surface"');
  const layerStart = markup.indexOf('<div class="label-layer"');
  const interactionStart = markup.indexOf('<div class="scene-interaction-layer"');
  assert.ok(
    surfaceStart >= 0 && layerStart >= 0 && interactionStart >= 0,
    "artwork, labels and interaction cues render in distinct layers",
  );
  const surfaceClose = matchingDivClose(markup, surfaceStart);
  assert.ok(
    layerStart >= surfaceClose,
    "the label layer is a sibling after the scaled scene surface, never its descendant",
  );
  assert.equal(markup.slice(surfaceClose, layerStart).trim(), "");
  const labelClose = matchingDivClose(markup, layerStart);
  assert.equal(markup.slice(labelClose, interactionStart).trim(), "");
  assert.ok(
    interactionStart >= labelClose,
    "portal and vocabulary cues are a sibling overlay after the word labels",
  );
  assert.match(markup, /class="label-layer"[^>]*data-coordinate-space="screen"/);
  assert.match(markup, /class="scene-interaction-layer"[^>]*data-coordinate-space="screen"/);

  const css = readFileSync(new URL("app/globals.css", ROOT), "utf8");
  const wordRule = css.match(/\.word-label\s*\{([\s\S]*?)\}/)?.[1];
  assert.ok(wordRule, "word-label CSS rule exists");
  assert.doesNotMatch(wordRule, /scale\s*\(/, "camera scale must never enter a word transform");
  assert.match(wordRule, /transform:\s*translate\(-50%, -50%\)/);
  assert.match(markup, /class="word-anchor-marker"/, "every pill renders its exact object anchor");
  assert.match(
    css,
    /\.word-label\[data-displaced="true"\]::after\s*\{[\s\S]*?--label-leader-length/,
    "a displaced pill draws a screen-space leader back to that anchor",
  );
  assert.match(
    css,
    /\.word-label\[data-leader-span="long"\]::after\s*\{[\s\S]*?repeating-linear-gradient/,
    "long bounded fallbacks strengthen the leader instead of looking like a new object anchor",
  );

  const surfaceRule = css.match(/\.scene-surface\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const labelLayerRule = css.match(/\.label-layer\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const interactionLayerRule = css.match(/\.scene-interaction-layer\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const surfaceZ = Number(surfaceRule.match(/z-index:\s*(\d+)/)?.[1]);
  const labelZ = Number(labelLayerRule.match(/z-index:\s*(\d+)/)?.[1]);
  const interactionZ = Number(interactionLayerRule.match(/z-index:\s*(\d+)/)?.[1]);
  assert.ok(labelZ > surfaceZ, "labels stay above the artwork surface");
  assert.ok(interactionZ > labelZ, "portal and vocabulary cues always stack above words");

  const vocabularyCueRule = css.match(/\.vocabulary-zoom-cue\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const hotspotRule = css.match(/\.scene-hotspot\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.doesNotMatch(vocabularyCueRule, /scale\s*\(/);
  assert.doesNotMatch(hotspotRule, /scale\s*\(/);
});
