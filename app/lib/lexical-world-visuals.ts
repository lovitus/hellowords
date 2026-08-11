export interface LexicalWorldOverviewRect {
  /** Absolute source pixels in the reviewed 1600 × 900 overview artwork. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LexicalWorldFocalPoint {
  /** Absolute source pixels in the reviewed 1600 × 900 overview artwork. */
  readonly x: number;
  readonly y: number;
}

interface ApprovedLexicalWorldVisualBase {
  readonly asset: `/scenes/${string}`;
  readonly reviewStatus: "approved";
  readonly reviewedSha256: string;
  readonly width: number;
  readonly height: number;
}

export interface ApprovedLexicalWorldOverviewVisual extends ApprovedLexicalWorldVisualBase {
  readonly role: "overview";
}

export interface ApprovedLexicalWorldRealmVisual extends ApprovedLexicalWorldVisualBase {
  readonly role: "realm";
  readonly realmId: string;
  /** Reviewed island crop used to aim the semantic overview zoom. */
  readonly overviewRect: LexicalWorldOverviewRect;
  /**
   * Reviewed 16:9 field for the high-resolution realm art and deeper semantic
   * levels. It contains overviewRect without relying on object-fit cropping.
   */
  readonly detailRect: LexicalWorldOverviewRect;
  /** Salient point within overviewRect used for labels and camera focus. */
  readonly focalPoint: LexicalWorldFocalPoint;
  readonly labelEn: string;
  readonly labelZh: string;
}

export type ApprovedLexicalWorldVisual =
  | ApprovedLexicalWorldOverviewVisual
  | ApprovedLexicalWorldRealmVisual;

export interface LexicalWorldRealmTile {
  readonly realmId: string;
  readonly labelEn: string;
  readonly labelZh: string;
  readonly overviewAsset: ApprovedLexicalWorldVisualAsset;
  readonly asset: ApprovedLexicalWorldVisualAsset;
  readonly overviewRect: LexicalWorldOverviewRect;
  readonly detailRect: LexicalWorldOverviewRect;
  readonly focalPoint: LexicalWorldFocalPoint;
}

/**
 * Runtime visual manifest. New lexical-world artwork must pass review and be
 * added here before application code can reference it.
 */
export const LEXICAL_WORLD_VISUAL_MANIFEST = {
  overview: {
    role: "overview",
    asset: "/scenes/lexical-world-overview-bright-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "444ebf614c5a81d6df02bf0ad20fab35618b865d8d87a9b963e14fe04db64d17",
    width: 1600,
    height: 900,
  },
  natureLife: {
    role: "realm",
    realmId: "nature-life",
    asset: "/scenes/lexical-realm-nature-life-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "ced009411006d213280ab14d01c4a31d5416756f5f4c3629b532a746bd78647e",
    width: 1600,
    height: 900,
    overviewRect: { x: 0, y: 35, width: 505, height: 300 },
    detailRect: { x: 0, y: 0, width: 672, height: 378 },
    focalPoint: { x: 235, y: 205 },
    labelEn: "Nature & life",
    labelZh: "自然与生命",
  },
  bodyDailyLife: {
    role: "realm",
    realmId: "body-daily-life",
    asset: "/scenes/lexical-realm-body-daily-life-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "059ae0c9b551bc88434bf38ac064c56d8904de38ccff6be9283af4252f01d27f",
    width: 1600,
    height: 900,
    overviewRect: { x: 405, y: 5, width: 445, height: 325 },
    detailRect: { x: 292, y: 0, width: 672, height: 378 },
    focalPoint: { x: 640, y: 160 },
    labelEn: "Body & daily life",
    labelZh: "身体与日常",
  },
  objectsTechnology: {
    role: "realm",
    realmId: "objects-technology",
    asset: "/scenes/lexical-realm-objects-technology-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "4174a7e25465dd17912cf4107612d73511cdea8756e9aa884f85683e2b47d672",
    width: 1600,
    height: 900,
    overviewRect: { x: 1065, y: 310, width: 535, height: 315 },
    detailRect: { x: 928, y: 279, width: 672, height: 378 },
    focalPoint: { x: 1390, y: 455 },
    labelEn: "Objects & technology",
    labelZh: "物品与科技",
  },
  peopleSociety: {
    role: "realm",
    realmId: "people-society",
    asset: "/scenes/lexical-realm-people-society-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "d2e52874b9af899a57b5c5235bf01993404c7123d701745dd84a8b356eff624c",
    width: 1600,
    height: 900,
    overviewRect: { x: 820, y: 0, width: 390, height: 355 },
    detailRect: { x: 679, y: 0, width: 672, height: 378 },
    focalPoint: { x: 1015, y: 160 },
    labelEn: "People & society",
    labelZh: "人与社会",
  },
  mindValues: {
    role: "realm",
    realmId: "mind-values",
    asset: "/scenes/lexical-realm-mind-values-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "37246b30a46fc0cfb450d284a2b6446bfe8a43e858e8f899c85138483a20855e",
    width: 1600,
    height: 900,
    overviewRect: { x: 1150, y: 65, width: 450, height: 300 },
    detailRect: { x: 928, y: 26, width: 672, height: 378 },
    focalPoint: { x: 1368, y: 225 },
    labelEn: "Mind & values",
    labelZh: "心智与价值",
  },
  languageCulture: {
    role: "realm",
    realmId: "language-culture",
    asset: "/scenes/lexical-realm-language-culture-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "85d722c0d8f25f8e7487f64187d138c5c1f0dd688ccb75f9519ab0381caf95f0",
    width: 1600,
    height: 900,
    overviewRect: { x: 0, y: 530, width: 510, height: 370 },
    detailRect: { x: 0, y: 522, width: 672, height: 378 },
    focalPoint: { x: 245, y: 685 },
    labelEn: "Language & culture",
    labelZh: "语言与文化",
  },
  actionsEvents: {
    role: "realm",
    realmId: "actions-events",
    asset: "/scenes/lexical-realm-actions-events-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "d7c3becf6ca834e676d439420d86ad1f8d62efe7613c859435957d2f264c230a",
    width: 1600,
    height: 900,
    overviewRect: { x: 420, y: 535, width: 440, height: 365 },
    detailRect: { x: 304, y: 522, width: 672, height: 378 },
    focalPoint: { x: 650, y: 735 },
    labelEn: "Actions & events",
    labelZh: "动作与事件",
  },
  spaceTimeMeasure: {
    role: "realm",
    realmId: "space-time-measure",
    asset: "/scenes/lexical-realm-space-time-measure-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "5a0c2c26624eb325c21943d1aa783bc5f93f717c16af837d8ca244fde496b375",
    width: 1600,
    height: 900,
    overviewRect: { x: 0, y: 310, width: 560, height: 300 },
    detailRect: { x: 0, y: 271, width: 672, height: 378 },
    focalPoint: { x: 250, y: 425 },
    labelEn: "Space, time & measure",
    labelZh: "时空与度量",
  },
  qualitiesStates: {
    role: "realm",
    realmId: "qualities-states",
    asset: "/scenes/lexical-realm-qualities-states-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "13a934b7617e042c35d6e22c20cb359030c863dc89bffcaee3b0a4ab5a627123",
    width: 1600,
    height: 900,
    overviewRect: { x: 775, y: 530, width: 415, height: 370 },
    detailRect: { x: 647, y: 522, width: 672, height: 378 },
    focalPoint: { x: 990, y: 735 },
    labelEn: "Qualities & states",
    labelZh: "性质与状态",
  },
  grammarRelations: {
    role: "realm",
    realmId: "grammar-relations",
    asset: "/scenes/lexical-realm-grammar-relations-v2.jpg",
    reviewStatus: "approved",
    reviewedSha256: "8c69874f9975bab6833973e6883d3415f73ed4fedd15c07d2626a871943b95f4",
    width: 1600,
    height: 900,
    overviewRect: { x: 1140, y: 525, width: 460, height: 375 },
    detailRect: { x: 928, y: 522, width: 672, height: 378 },
    focalPoint: { x: 1360, y: 715 },
    labelEn: "Grammar & relations",
    labelZh: "语法与关系",
  },
} as const satisfies Readonly<Record<string, ApprovedLexicalWorldVisual>>;

const reviewedVisuals = Object.values(LEXICAL_WORLD_VISUAL_MANIFEST) as readonly ApprovedLexicalWorldVisual[];
const reviewedRealmVisuals = reviewedVisuals.filter(
  (visual): visual is ApprovedLexicalWorldRealmVisual => visual.role === "realm",
);

export const APPROVED_LEXICAL_WORLD_VISUAL_ASSETS = reviewedVisuals
  .map((visual) => visual.asset);

export type ApprovedLexicalWorldVisualAsset =
  (typeof APPROVED_LEXICAL_WORLD_VISUAL_ASSETS)[number];

const approvedAssetSet: ReadonlySet<string> = new Set(APPROVED_LEXICAL_WORLD_VISUAL_ASSETS);

/** Reject dynamic or future callers that try to bypass the reviewed manifest. */
export function requireApprovedLexicalWorldVisual(asset: string): ApprovedLexicalWorldVisualAsset {
  if (!approvedAssetSet.has(asset)) {
    throw new Error(`Unapproved lexical-world visual asset: ${asset}`);
  }
  return asset as ApprovedLexicalWorldVisualAsset;
}

export const LEXICAL_WORLD_OVERVIEW_IMAGE = requireApprovedLexicalWorldVisual(
  LEXICAL_WORLD_VISUAL_MANIFEST.overview.asset,
);

const realmVisuals = new Map<string, ApprovedLexicalWorldVisualAsset>(
  reviewedRealmVisuals
    .map((visual) => [visual.realmId, requireApprovedLexicalWorldVisual(visual.asset)]),
);

const realmTiles: readonly LexicalWorldRealmTile[] = reviewedRealmVisuals.map((visual) => ({
  realmId: visual.realmId,
  labelEn: visual.labelEn,
  labelZh: visual.labelZh,
  overviewAsset: LEXICAL_WORLD_OVERVIEW_IMAGE,
  asset: requireApprovedLexicalWorldVisual(visual.asset),
  overviewRect: visual.overviewRect,
  detailRect: visual.detailRect,
  focalPoint: visual.focalPoint,
}));
const realmTilesById = new Map(realmTiles.map((tile) => [tile.realmId, tile] as const));

/** Stable manifest-order tiles for the ten overview islands. */
export function lexicalWorldRealmTiles(): readonly LexicalWorldRealmTile[] {
  return realmTiles;
}

/** Resolves one reviewed overview island; unknown ids never silently retarget. */
export function lexicalWorldTileForRealm(realmId: string): LexicalWorldRealmTile | undefined {
  return realmTilesById.get(realmId);
}

/** Returns a reviewed realm scene, falling back to the reviewed world overview while migration continues. */
export function lexicalWorldVisualForRealm(realmId?: string): ApprovedLexicalWorldVisualAsset {
  return realmId ? (realmVisuals.get(realmId) ?? LEXICAL_WORLD_OVERVIEW_IMAGE) : LEXICAL_WORLD_OVERVIEW_IMAGE;
}
