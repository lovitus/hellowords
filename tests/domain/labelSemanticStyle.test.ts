import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLabelSemanticStyleMap,
  LABEL_SEMANTIC_PALETTES,
  LABEL_SEMANTIC_REALMS,
  resolveLabelSemanticStyle,
  semanticNodeVisual,
  type Label,
  type VisualRegion,
} from "../../app/domain";

const label: Label = {
  id: "oak",
  word: "oak",
  translation: "橡树",
  x: 100,
  y: 100,
  priority: 1,
  lexemeId: "lexeme-oak",
  sourceVisualRegion: "oak-part",
};

const regions: readonly VisualRegion[] = [
  { id: "scene", description: "Whole scene", kind: "whole", x: 0, y: 0, width: 400, height: 300 },
  { id: "oak", description: "Whole oak", kind: "object", x: 20, y: 20, width: 300, height: 250 },
  { id: "oak-part", description: "One oak part", kind: "part", x: 80, y: 80, width: 100, height: 100 },
  { id: "diagram", description: "Diagram region", kind: "diagram", x: 0, y: 0, width: 80, height: 80 },
];

function rgb(hex: string): readonly [number, number, number] {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function luminance(hex: string): number {
  const values = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function contrast(left: string, right: string): number {
  const light = Math.max(luminance(left), luminance(right));
  const dark = Math.min(luminance(left), luminance(right));
  return (light + 0.05) / (dark + 0.05);
}

test("all ten lexical realms have a stable first-class semantic palette", () => {
  assert.equal(LABEL_SEMANTIC_REALMS.length, 10);
  for (const [paletteIndex, realmId] of LABEL_SEMANTIC_REALMS.entries()) {
    const style = resolveLabelSemanticStyle(label, regions, new Map([[label.lexemeId!, realmId]]));
    assert.equal(style.semanticGroup, realmId);
    assert.equal(style.paletteIndex, paletteIndex);
    assert.equal(style.source, "realm");
    assert.equal(style.realmId, realmId);
    assert.equal(style.visualRegionKind, undefined);
  }
});

test("unlinked labels use their audited visual-region kind instead of guessing from text", () => {
  for (const [index, kind] of (["whole", "object", "part", "diagram"] as const).entries()) {
    const sourceVisualRegion = kind === "whole"
      ? "scene"
      : kind === "object"
        ? "oak"
        : kind === "part"
          ? "oak-part"
          : "diagram";
    const style = resolveLabelSemanticStyle({ ...label, lexemeId: undefined, sourceVisualRegion }, regions);
    assert.equal(style.semanticGroup, `visual-${kind}`);
    assert.equal(style.paletteIndex, LABEL_SEMANTIC_REALMS.length + index);
    assert.equal(style.source, "visual-region");
    assert.equal(style.visualRegionKind, kind);
  }
});

test("an authored district realm gently groups unlinked labels while a real lexeme realm wins", () => {
  const authored = resolveLabelSemanticStyle({
    ...label,
    lexemeId: undefined,
    semanticRealmId: "nature-life",
  }, regions);
  assert.equal(authored.semanticGroup, "nature-life");
  assert.equal(authored.source, "authored-realm");
  assert.equal(authored.realmId, "nature-life");
  assert.equal(authored.visualRegionKind, undefined);

  const lexemeWins = resolveLabelSemanticStyle({
    ...label,
    semanticRealmId: "nature-life",
  }, regions, new Map([[label.lexemeId!, "objects-technology"]]));
  assert.equal(lexemeWins.semanticGroup, "objects-technology");
  assert.equal(lexemeWins.source, "realm");
});

test("semantic overview nodes consume the same realm palette through a pure contract", () => {
  const node = semanticNodeVisual("topic", "objects-technology", 2);
  const palette = LABEL_SEMANTIC_PALETTES[2];
  assert.equal(node.semanticGroup, "objects-technology");
  assert.equal(node.paletteIndex, 2);
  assert.equal(node.color, palette["--label-semantic-dot"]);
  assert.equal(node.background, palette["--label-semantic-surface"]);
  assert.equal(node.borderColor, palette["--label-semantic-border"]);
  assert.equal(node.textColor, palette["--label-semantic-ink"]);
  assert.equal(node.mutedTextColor, palette["--label-semantic-muted"]);
  assert.equal(node.radiusScale, 0.98);

  const fallback = semanticNodeVisual("unknown", "not-a-realm", Number.NaN);
  assert.equal(fallback.semanticGroup, "visual-diagram");
  assert.equal(fallback.paletteIndex, 13);
  assert.equal(fallback.radiusScale, 1);
});

test("unknown realms and missing regions fall back deterministically", () => {
  const unknownRealm = resolveLabelSemanticStyle(label, regions, { "lexeme-oak": "not-a-realm" });
  assert.equal(unknownRealm.semanticGroup, "visual-part");
  assert.equal(unknownRealm.source, "visual-region");

  const missingRegion = { ...label, lexemeId: undefined, sourceVisualRegion: "missing" };
  const first = resolveLabelSemanticStyle(missingRegion, regions);
  const second = resolveLabelSemanticStyle(missingRegion, []);
  assert.deepEqual(first, second);
  assert.match(first.semanticGroup, /^visual-(?:whole|object|part|diagram)$/);
  assert.equal(first.source, "stable-default");
});

test("style maps preserve one deterministic contract per label", () => {
  const map = buildLabelSemanticStyleMap(
    [label, { ...label, id: "scene", lexemeId: undefined, sourceVisualRegion: "scene" }],
    regions,
    (lexemeId) => lexemeId === "lexeme-oak" ? "nature-life" : undefined,
  );
  assert.equal(map.size, 2);
  assert.equal(map.get("oak")?.semanticGroup, "nature-life");
  assert.equal(map.get("scene")?.semanticGroup, "visual-whole");
  const sameRealm = resolveLabelSemanticStyle(
    { ...label, id: "oak-two" },
    regions,
    () => "nature-life",
  );
  assert.strictEqual(
    map.get("oak")?.cssVariables,
    sameRealm.cssVariables,
    "labels in one palette share its immutable renderer-neutral value object",
  );
});

test("all fourteen spatial rules mirror only the three category differentiators", async () => {
  const css = await readFile(resolve(import.meta.dirname, "../../app/globals.css"), "utf8");
  const indices = [...css.matchAll(/\.word-label\[data-palette-index="(\d+)"\]\s*\{/g)]
    .map((match) => Number(match[1]));
  assert.deepEqual(indices, LABEL_SEMANTIC_PALETTES.map(({ paletteIndex }) => paletteIndex));

  const spatialVariables = [
    "--label-semantic-surface",
    "--label-semantic-border",
    "--label-semantic-dot",
  ] as const;
  const triples = new Set<string>();
  for (const palette of LABEL_SEMANTIC_PALETTES) {
    const selector = `.word-label[data-palette-index="${palette.paletteIndex}"] {`;
    const start = css.indexOf(selector);
    const end = css.indexOf("}", start);
    assert.ok(start >= 0 && end > start, `${palette.group} static rule exists`);
    const rule = css.slice(start, end);
    const declarations = [...rule.matchAll(/(--label-semantic-[\w-]+):/g)]
      .map((match) => match[1]);
    assert.deepEqual(declarations, spatialVariables, `${palette.group} has only three overrides`);
    for (const variable of spatialVariables) {
      const actual = rule.match(new RegExp(`${variable}:\\s*([^;]+);`))?.[1]?.trim();
      assert.equal(actual, palette[variable], `${palette.group} ${variable}`);
    }
    triples.add(spatialVariables.map((variable) => palette[variable]).join("|"));
  }
  assert.equal(triples.size, LABEL_SEMANTIC_PALETTES.length, "all spatial triples remain distinct");

  const baseRule = css.match(/\.word-label\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const commonVariables = {
    "--label-semantic-surface-hover": "#fdfbf7",
    "--label-semantic-ink": "#34312a",
    "--label-semantic-muted": "#605a4f",
    "--label-semantic-leader": "var(--label-semantic-dot)",
    "--label-semantic-leader-fade": "rgba(52, 49, 42, 0.24)",
  } as const;
  for (const [variable, expected] of Object.entries(commonVariables)) {
    const actual = baseRule.match(new RegExp(`${variable}:\\s*([^;]+);`))?.[1]?.trim();
    assert.equal(actual, expected, `${variable} remains one shared high-contrast value`);
  }
  assert.doesNotMatch(baseRule, /--label-semantic-ring/, "the existing border owns the focus ring");

  for (const palette of LABEL_SEMANTIC_PALETTES) {
    const surface = palette["--label-semantic-surface"];
    assert.ok(contrast(surface, commonVariables["--label-semantic-ink"]) >= 7);
    assert.ok(contrast(surface, commonVariables["--label-semantic-muted"]) >= 4.5);
    assert.ok(contrast(
      commonVariables["--label-semantic-surface-hover"],
      commonVariables["--label-semantic-ink"],
    ) >= 7);
  }
});

test("dense spatial labels reveal artwork without losing semantic tint or focus contrast", async () => {
  const css = await readFile(resolve(import.meta.dirname, "../../app/globals.css"), "utf8");
  const baseRule = css.match(/\.word-label\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(baseRule, /--label-surface-opacity:\s*56%;/);
  assert.match(baseRule, /--label-border-opacity:\s*58%;/);
  assert.match(
    baseRule,
    /background:\s*color-mix\([\s\S]*?var\(--label-semantic-surface\) var\(--label-surface-opacity\)[\s\S]*?transparent[\s\S]*?\);/,
  );
  assert.match(baseRule, /min-height:\s*15px;/);
  assert.match(baseRule, /-webkit-text-stroke:\s*0\.45px #fff;/);
  assert.match(baseRule, /paint-order:\s*stroke fill;/);
  assert.match(baseRule, /text-shadow:\s*0 1px 2px rgba\(20, 40, 36, 0\.34\);/);
  assert.doesNotMatch(baseRule, /backdrop-filter/, "dense pills do not create one filter layer each");
  assert.doesNotMatch(baseRule, /filter:/, "dense pills avoid per-node filter work");

  const homeRule = css.match(
    /\.world-app\[data-scene-id="world-map"\] \.word-label\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  assert.match(homeRule, /--label-surface-opacity:\s*58%;/);
  assert.match(homeRule, /--label-border-opacity:\s*64%;/);
  assert.match(homeRule, /background:\s*rgba\(246, 243, 237, 0\.58\);/);
  assert.doesNotMatch(homeRule, /backdrop-filter/);

  const activeRule = css.match(
    /\.word-label\[data-interactive="true"\]:hover,[\s\S]*?\.word-label\[data-interactive="true"\]:focus-visible\s*\{([\s\S]*?)\n\}/,
  )?.[1] ?? "";
  assert.match(activeRule, /--label-surface-opacity:\s*92%;/);
  assert.match(activeRule, /--label-border-opacity:\s*84%;/);
  assert.match(activeRule, /var\(--label-semantic-surface-hover\)/);
});

test("every complete domain palette stays readable for semantic zoom consumers", () => {
  assert.equal(LABEL_SEMANTIC_PALETTES.length, 14);
  const reservedAccents = new Set(["#d99a36", "#236f55"]);
  for (const palette of LABEL_SEMANTIC_PALETTES) {
    assert.equal(
      Object.keys(palette).filter((key) => key.startsWith("--label-semantic-")).length,
      9,
      `${palette.group} keeps all nine renderer-neutral colors`,
    );
    const surface = palette["--label-semantic-surface"];
    const hover = palette["--label-semantic-surface-hover"];
    const ink = palette["--label-semantic-ink"];
    const muted = palette["--label-semantic-muted"];
    assert.ok(contrast(surface, ink) >= 7, `${palette.group} primary text contrast`);
    assert.ok(contrast(hover, ink) >= 7, `${palette.group} hover text contrast`);
    assert.ok(contrast(surface, muted) >= 4.5, `${palette.group} translation contrast`);
    assert.ok(!reservedAccents.has(palette["--label-semantic-dot"].toLocaleLowerCase()));
  }
});

test("global CSS consumes the semantic variables only on word labels", async () => {
  const css = await readFile(resolve(import.meta.dirname, "../../app/globals.css"), "utf8");
  for (const variable of [
    "--label-semantic-surface",
    "--label-semantic-surface-hover",
    "--label-semantic-border",
    "--label-semantic-ink",
    "--label-semantic-muted",
    "--label-semantic-dot",
    "--label-semantic-leader",
  ]) {
    assert.match(css, new RegExp(`\\.word-label[\\s\\S]*var\\(${variable}\\)`));
  }
  const portalCss = css.slice(css.indexOf(".scene-hotspot-region"), css.indexOf(".viewport-vignette"));
  assert.doesNotMatch(portalCss, /--label-semantic-/);
});
