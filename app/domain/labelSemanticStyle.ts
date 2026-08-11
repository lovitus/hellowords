import type { Label, VisualRegion } from "./types";

/** The ten stable top-level groups authored by the 10,000-word lexical world. */
export const LABEL_SEMANTIC_REALMS = [
  "nature-life",
  "body-daily-life",
  "objects-technology",
  "people-society",
  "mind-values",
  "language-culture",
  "actions-events",
  "space-time-measure",
  "qualities-states",
  "grammar-relations",
] as const;

export type LabelSemanticRealm = (typeof LABEL_SEMANTIC_REALMS)[number];
export type LabelVisualFallbackGroup = `visual-${VisualRegion["kind"]}`;
export type LabelSemanticGroup = LabelSemanticRealm | LabelVisualFallbackGroup;
export type LabelSemanticSource = "realm" | "visual-region" | "stable-default";

export interface LabelSemanticCssVariables {
  readonly "--label-semantic-surface": string;
  readonly "--label-semantic-surface-hover": string;
  readonly "--label-semantic-border": string;
  readonly "--label-semantic-ink": string;
  readonly "--label-semantic-muted": string;
  readonly "--label-semantic-dot": string;
  readonly "--label-semantic-leader": string;
  readonly "--label-semantic-leader-fade": string;
  readonly "--label-semantic-ring": string;
}

export interface LabelSemanticPalette extends LabelSemanticCssVariables {
  readonly group: LabelSemanticGroup;
  readonly paletteIndex: number;
}

export interface LabelSemanticStyle {
  readonly semanticGroup: LabelSemanticGroup;
  readonly paletteIndex: number;
  readonly source: LabelSemanticSource;
  readonly realmId?: LabelSemanticRealm;
  readonly visualRegionKind?: VisualRegion["kind"];
  readonly cssVariables: LabelSemanticCssVariables;
}

/** Minimal renderer-neutral contract for semantic overview nodes. */
export interface SemanticNodeVisual {
  readonly semanticGroup: LabelSemanticGroup;
  readonly paletteIndex: number;
  readonly color: string;
  readonly background: string;
  readonly borderColor: string;
  readonly textColor: string;
  readonly mutedTextColor: string;
  readonly radiusScale: number;
}

export type LexemeRealmLookup =
  | ReadonlyMap<string, string | undefined>
  | Readonly<Record<string, string | undefined>>
  | ((lexemeId: string) => string | undefined);

type PaletteColors = Omit<LabelSemanticPalette, "group" | "paletteIndex">;

const PALETTE_COLORS: Readonly<Record<LabelSemanticGroup, PaletteColors>> = {
  "nature-life": {
    "--label-semantic-surface": "#f1f5ef",
    "--label-semantic-surface-hover": "#fbfdf9",
    "--label-semantic-border": "#b9c9b5",
    "--label-semantic-ink": "#243825",
    "--label-semantic-muted": "#4f6250",
    "--label-semantic-dot": "#6b8069",
    "--label-semantic-leader": "rgba(78, 100, 76, 0.72)",
    "--label-semantic-leader-fade": "rgba(78, 100, 76, 0.2)",
    "--label-semantic-ring": "rgba(107, 128, 105, 0.23)",
  },
  "body-daily-life": {
    "--label-semantic-surface": "#f7f1ed",
    "--label-semantic-surface-hover": "#fdfaf7",
    "--label-semantic-border": "#d6c2b7",
    "--label-semantic-ink": "#3b2c26",
    "--label-semantic-muted": "#68534a",
    "--label-semantic-dot": "#936f60",
    "--label-semantic-leader": "rgba(122, 88, 74, 0.7)",
    "--label-semantic-leader-fade": "rgba(122, 88, 74, 0.19)",
    "--label-semantic-ring": "rgba(147, 111, 96, 0.22)",
  },
  "objects-technology": {
    "--label-semantic-surface": "#eef4f4",
    "--label-semantic-surface-hover": "#f9fcfc",
    "--label-semantic-border": "#b8cccc",
    "--label-semantic-ink": "#203638",
    "--label-semantic-muted": "#4a6264",
    "--label-semantic-dot": "#607f82",
    "--label-semantic-leader": "rgba(69, 99, 102, 0.71)",
    "--label-semantic-leader-fade": "rgba(69, 99, 102, 0.2)",
    "--label-semantic-ring": "rgba(96, 127, 130, 0.22)",
  },
  "people-society": {
    "--label-semantic-surface": "#f7f0ee",
    "--label-semantic-surface-hover": "#fdf9f7",
    "--label-semantic-border": "#d8c0ba",
    "--label-semantic-ink": "#3b2926",
    "--label-semantic-muted": "#68514c",
    "--label-semantic-dot": "#956b62",
    "--label-semantic-leader": "rgba(126, 84, 76, 0.7)",
    "--label-semantic-leader-fade": "rgba(126, 84, 76, 0.19)",
    "--label-semantic-ring": "rgba(149, 107, 98, 0.22)",
  },
  "mind-values": {
    "--label-semantic-surface": "#f3f1f6",
    "--label-semantic-surface-hover": "#fbfafd",
    "--label-semantic-border": "#cbc5d4",
    "--label-semantic-ink": "#332e3c",
    "--label-semantic-muted": "#5c5569",
    "--label-semantic-dot": "#7b728d",
    "--label-semantic-leader": "rgba(96, 86, 112, 0.7)",
    "--label-semantic-leader-fade": "rgba(96, 86, 112, 0.19)",
    "--label-semantic-ring": "rgba(123, 114, 141, 0.22)",
  },
  "language-culture": {
    "--label-semantic-surface": "#f6f0f3",
    "--label-semantic-surface-hover": "#fdf9fb",
    "--label-semantic-border": "#d5c0ca",
    "--label-semantic-ink": "#3a2931",
    "--label-semantic-muted": "#67515b",
    "--label-semantic-dot": "#906a7a",
    "--label-semantic-leader": "rgba(120, 82, 98, 0.7)",
    "--label-semantic-leader-fade": "rgba(120, 82, 98, 0.19)",
    "--label-semantic-ring": "rgba(144, 106, 122, 0.22)",
  },
  "actions-events": {
    "--label-semantic-surface": "#eef4f2",
    "--label-semantic-surface-hover": "#f9fcfb",
    "--label-semantic-border": "#b9cbc6",
    "--label-semantic-ink": "#203633",
    "--label-semantic-muted": "#4b625e",
    "--label-semantic-dot": "#647f79",
    "--label-semantic-leader": "rgba(71, 99, 93, 0.71)",
    "--label-semantic-leader-fade": "rgba(71, 99, 93, 0.2)",
    "--label-semantic-ring": "rgba(100, 127, 121, 0.22)",
  },
  "space-time-measure": {
    "--label-semantic-surface": "#eef3f6",
    "--label-semantic-surface-hover": "#fafcfd",
    "--label-semantic-border": "#bdcbd4",
    "--label-semantic-ink": "#22343e",
    "--label-semantic-muted": "#4d606b",
    "--label-semantic-dot": "#637d8c",
    "--label-semantic-leader": "rgba(72, 95, 108, 0.71)",
    "--label-semantic-leader-fade": "rgba(72, 95, 108, 0.2)",
    "--label-semantic-ring": "rgba(99, 125, 140, 0.22)",
  },
  "qualities-states": {
    "--label-semantic-surface": "#f5f3ed",
    "--label-semantic-surface-hover": "#fcfbf8",
    "--label-semantic-border": "#d3cbb9",
    "--label-semantic-ink": "#373329",
    "--label-semantic-muted": "#625c4d",
    "--label-semantic-dot": "#82775f",
    "--label-semantic-leader": "rgba(105, 94, 72, 0.7)",
    "--label-semantic-leader-fade": "rgba(105, 94, 72, 0.19)",
    "--label-semantic-ring": "rgba(130, 119, 95, 0.22)",
  },
  "grammar-relations": {
    "--label-semantic-surface": "#f2f2f6",
    "--label-semantic-surface-hover": "#fbfbfd",
    "--label-semantic-border": "#c7c7d2",
    "--label-semantic-ink": "#30313b",
    "--label-semantic-muted": "#595b69",
    "--label-semantic-dot": "#727587",
    "--label-semantic-leader": "rgba(87, 89, 106, 0.7)",
    "--label-semantic-leader-fade": "rgba(87, 89, 106, 0.19)",
    "--label-semantic-ring": "rgba(114, 117, 135, 0.22)",
  },
  "visual-whole": {
    "--label-semantic-surface": "#f6f3ed",
    "--label-semantic-surface-hover": "#fdfbf7",
    "--label-semantic-border": "#d2c9ba",
    "--label-semantic-ink": "#34312a",
    "--label-semantic-muted": "#605a4f",
    "--label-semantic-dot": "#7d7567",
    "--label-semantic-leader": "rgba(99, 91, 77, 0.7)",
    "--label-semantic-leader-fade": "rgba(99, 91, 77, 0.19)",
    "--label-semantic-ring": "rgba(125, 117, 103, 0.22)",
  },
  "visual-object": {
    "--label-semantic-surface": "#f0f4f4",
    "--label-semantic-surface-hover": "#fafcfc",
    "--label-semantic-border": "#c0cdcc",
    "--label-semantic-ink": "#263737",
    "--label-semantic-muted": "#506262",
    "--label-semantic-dot": "#687e7c",
    "--label-semantic-leader": "rgba(78, 99, 97, 0.7)",
    "--label-semantic-leader-fade": "rgba(78, 99, 97, 0.19)",
    "--label-semantic-ring": "rgba(104, 126, 124, 0.22)",
  },
  "visual-part": {
    "--label-semantic-surface": "#f2f5f1",
    "--label-semantic-surface-hover": "#fbfdf9",
    "--label-semantic-border": "#c4cfc0",
    "--label-semantic-ink": "#293829",
    "--label-semantic-muted": "#536252",
    "--label-semantic-dot": "#70816d",
    "--label-semantic-leader": "rgba(84, 102, 81, 0.7)",
    "--label-semantic-leader-fade": "rgba(84, 102, 81, 0.19)",
    "--label-semantic-ring": "rgba(112, 129, 109, 0.22)",
  },
  "visual-diagram": {
    "--label-semantic-surface": "#f3f2f6",
    "--label-semantic-surface-hover": "#fbfafd",
    "--label-semantic-border": "#cbc7d2",
    "--label-semantic-ink": "#33313b",
    "--label-semantic-muted": "#5c5968",
    "--label-semantic-dot": "#797587",
    "--label-semantic-leader": "rgba(94, 90, 108, 0.7)",
    "--label-semantic-leader-fade": "rgba(94, 90, 108, 0.19)",
    "--label-semantic-ring": "rgba(121, 117, 135, 0.22)",
  },
};

const VISUAL_FALLBACK_KINDS = ["whole", "object", "part", "diagram"] as const;
const REALM_SET = new Set<string>(LABEL_SEMANTIC_REALMS);
const GROUP_ORDER: readonly LabelSemanticGroup[] = [
  ...LABEL_SEMANTIC_REALMS,
  ...VISUAL_FALLBACK_KINDS.map((kind) => `visual-${kind}` as const),
];

export const LABEL_SEMANTIC_PALETTES: readonly LabelSemanticPalette[] = GROUP_ORDER.map(
  (group, paletteIndex) => ({ group, paletteIndex, ...PALETTE_COLORS[group] }),
);

const PALETTE_BY_GROUP = new Map(
  LABEL_SEMANTIC_PALETTES.map((palette) => [palette.group, palette] as const),
);

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function realmForLexeme(
  lexemeId: string | undefined,
  lookup: LexemeRealmLookup | undefined,
): LabelSemanticRealm | undefined {
  if (!lexemeId || !lookup) return undefined;
  let realm: string | undefined;
  if (typeof lookup === "function") realm = lookup(lexemeId);
  else if (typeof (lookup as ReadonlyMap<string, string | undefined>).get === "function") {
    realm = (lookup as ReadonlyMap<string, string | undefined>).get(lexemeId);
  } else {
    realm = (lookup as Readonly<Record<string, string | undefined>>)[lexemeId];
  }
  return realm && REALM_SET.has(realm) ? realm as LabelSemanticRealm : undefined;
}

function visualKindForLabel(
  label: Pick<Label, "id" | "sourceVisualRegion">,
  regions: readonly VisualRegion[],
): { kind: VisualRegion["kind"]; source: Exclude<LabelSemanticSource, "realm"> } {
  const authored = label.sourceVisualRegion
    ? regions.find((region) => region.id === label.sourceVisualRegion)
    : undefined;
  if (authored) return { kind: authored.kind, source: "visual-region" };
  const index = stableHash(`${label.id}:${label.sourceVisualRegion ?? ""}`) % VISUAL_FALLBACK_KINDS.length;
  return { kind: VISUAL_FALLBACK_KINDS[index], source: "stable-default" };
}

function cssVariablesOf(palette: LabelSemanticPalette): LabelSemanticCssVariables {
  return {
    "--label-semantic-surface": palette["--label-semantic-surface"],
    "--label-semantic-surface-hover": palette["--label-semantic-surface-hover"],
    "--label-semantic-border": palette["--label-semantic-border"],
    "--label-semantic-ink": palette["--label-semantic-ink"],
    "--label-semantic-muted": palette["--label-semantic-muted"],
    "--label-semantic-dot": palette["--label-semantic-dot"],
    "--label-semantic-leader": palette["--label-semantic-leader"],
    "--label-semantic-leader-fade": palette["--label-semantic-leader-fade"],
    "--label-semantic-ring": palette["--label-semantic-ring"],
  };
}

// The DOM consumes paletteIndex through static CSS. Keep this renderer-neutral
// contract for other consumers, but share fourteen immutable objects instead
// of allocating nine-property style payloads for every authored word.
const CSS_VARIABLES_BY_GROUP = new Map(
  LABEL_SEMANTIC_PALETTES.map((palette) => [
    palette.group,
    Object.freeze(cssVariablesOf(palette)),
  ] as const),
);

const NODE_LEVEL_RADIUS_SCALE: Readonly<Record<string, number>> = {
  overview: 1.08,
  realm: 1.06,
  topic: 1.03,
  subcluster: 1,
  word: 0.96,
};

/**
 * Returns a pure, screen-renderer-neutral palette for one lexical overview node.
 * Unknown realm ids deliberately use the diagram fallback instead of guessing a
 * meaning from display text. Depth only changes geometry, never semantic color.
 */
export function semanticNodeVisual(
  level: string,
  realmId?: string,
  depth = 0,
): SemanticNodeVisual {
  const semanticGroup: LabelSemanticGroup = realmId && REALM_SET.has(realmId)
    ? realmId as LabelSemanticRealm
    : "visual-diagram";
  const palette = PALETTE_BY_GROUP.get(semanticGroup)!;
  const levelScale = NODE_LEVEL_RADIUS_SCALE[level] ?? 1;
  const depthAdjustment = Math.min(6, Math.max(0, Number.isFinite(depth) ? depth : 0)) * 0.025;

  return {
    semanticGroup,
    paletteIndex: palette.paletteIndex,
    color: palette["--label-semantic-dot"],
    background: palette["--label-semantic-surface"],
    borderColor: palette["--label-semantic-border"],
    textColor: palette["--label-semantic-ink"],
    mutedTextColor: palette["--label-semantic-muted"],
    radiusScale: Math.max(0.84, levelScale - depthAdjustment),
  };
}

/**
 * Resolves the light semantic tint for one screen-space word label.
 *
 * A known 10k lexeme realm always wins. Unlinked or unresolved words reuse the
 * audited visual-region kind, so styling remains deterministic without a new
 * network request or a second semantic guess from the display word.
 */
export function resolveLabelSemanticStyle(
  label: Pick<Label, "id" | "lexemeId" | "sourceVisualRegion">,
  regions: readonly VisualRegion[] = [],
  realmLookup?: LexemeRealmLookup,
): LabelSemanticStyle {
  const realmId = realmForLexeme(label.lexemeId, realmLookup);
  if (realmId) {
    const palette = PALETTE_BY_GROUP.get(realmId)!;
    return {
      semanticGroup: realmId,
      paletteIndex: palette.paletteIndex,
      source: "realm",
      realmId,
      cssVariables: CSS_VARIABLES_BY_GROUP.get(realmId)!,
    };
  }

  const fallback = visualKindForLabel(label, regions);
  const semanticGroup: LabelVisualFallbackGroup = `visual-${fallback.kind}`;
  const palette = PALETTE_BY_GROUP.get(semanticGroup)!;
  return {
    semanticGroup,
    paletteIndex: palette.paletteIndex,
    source: fallback.source,
    visualRegionKind: fallback.kind,
    cssVariables: CSS_VARIABLES_BY_GROUP.get(semanticGroup)!,
  };
}

/** Creates one stable lookup for renderers without adding fields to scene JSON. */
export function buildLabelSemanticStyleMap(
  labels: readonly Pick<Label, "id" | "lexemeId" | "sourceVisualRegion">[],
  regions: readonly VisualRegion[] = [],
  realmLookup?: LexemeRealmLookup,
): ReadonlyMap<string, LabelSemanticStyle> {
  return new Map(labels.map((label) => [
    label.id,
    resolveLabelSemanticStyle(label, regions, realmLookup),
  ]));
}
