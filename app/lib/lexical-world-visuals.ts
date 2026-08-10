export interface ApprovedLexicalWorldVisual {
  readonly role: "overview";
  readonly asset: `/scenes/${string}`;
  readonly reviewStatus: "approved";
  readonly reviewedSha256: string;
  readonly width: number;
  readonly height: number;
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
} as const satisfies Readonly<Record<string, ApprovedLexicalWorldVisual>>;

export const APPROVED_LEXICAL_WORLD_VISUAL_ASSETS = [
  LEXICAL_WORLD_VISUAL_MANIFEST.overview.asset,
] as const;

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
