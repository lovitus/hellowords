import assert from "node:assert/strict";
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

test("the fourteen spatial palettes stay distinct and keep ink readable on their surfaces", () => {
  const triples = new Set<string>();
  for (const palette of LABEL_SEMANTIC_PALETTES) {
    triples.add([
      palette["--label-semantic-surface"],
      palette["--label-semantic-border"],
      palette["--label-semantic-dot"],
    ].join("|"));
    assert.ok(contrast(palette["--label-semantic-surface"], "#34312a") >= 7, `${palette.group} ink contrast`);
    assert.ok(contrast(palette["--label-semantic-surface"], "#605a4f") >= 4.5, `${palette.group} muted contrast`);
  }
  assert.equal(triples.size, LABEL_SEMANTIC_PALETTES.length, "all spatial triples remain distinct");
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
