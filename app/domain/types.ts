/** A point in either scene or viewport coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Camera transform applied as `screen = scene * scale + (x, y)`.
 * Keeping this convention explicit avoids the common pan/zoom sign ambiguity.
 */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface Label {
  readonly id: string;
  readonly word: string;
  readonly translation: string;
  readonly x: number;
  readonly y: number;
  readonly priority: number;
  /**
   * Authored level-of-detail band. Five bands let a scene progress from its
   * overview vocabulary to fine material/process words without a single large
   * density jump. Runtime opacity remains continuous inside each band.
   */
  readonly minLevel?: 0 | 1 | 2 | 3 | 4;
  /** Optional continuous equivalent for future scene authoring tools. */
  readonly minScale?: number;
  readonly maxScale?: number;
  /** Optional stable reference into the global lexicon. */
  readonly lexemeId?: string;
  /** Optional stable reference when one lexeme has multiple senses. */
  readonly senseId?: string;
  /**
   * Audited visual region that contains the exact object or part named by this
   * label. The coordinate remains the real anchor point; runtime layout may
   * move the pill but draws a leader back to this point.
   */
  readonly sourceVisualRegion?: string;
}

export interface VisualRegion {
  readonly id: string;
  readonly description: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "whole" | "object" | "part" | "diagram";
}

/**
 * An authored crop inside a high-resolution scene. Detail zones let the world
 * expose several truthful, locally dense word batches without pretending that
 * one source image is many unrelated scenes. Coordinates stay in the shared
 * 1600 x 900 scene space; a future viewport can focus this rectangle at
 * `targetScale` while keeping the labels as crisp screen-space HTML.
 */
export interface SceneDetailZone {
  readonly id: string;
  readonly title: string;
  readonly translation: string;
  readonly description: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly targetScale: number;
  /** Stable authored word batch; every referenced anchor lies inside the crop. */
  readonly labelIds: readonly string[];
}

export interface Portal {
  readonly id: string;
  readonly label: string;
  readonly translation?: string;
  readonly childSceneId: string;
  /** Audited visual region containing the object that opens this child scene. */
  readonly sourceVisualRegion?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly enterScale?: number;
  readonly entryCamera?: Camera;
  /** Runtime override; normally supplied by the navigation policy. */
  readonly exitScale?: number;
}

export interface SceneAnchorAudit {
  readonly status: "human-verified";
  readonly policy: "visible-object-or-part-only";
  readonly reviewedAsset: string;
  /** Pins audited anchors to the exact reviewed raster bytes when available. */
  readonly reviewedAssetSha256?: string;
  readonly rationale: string;
  readonly previousLabelCount: number;
  readonly retainedLabelCount: number;
  readonly removedLabelCount: number;
  readonly removedExamples: readonly string[];
}

export type SceneAssetTier = "base" | "high";

/** Immutable raster bytes reviewed for one spatial-scene resolution. */
export interface SceneAssetDescriptor {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

/**
 * Optional multi-resolution enhancement. `asset` remains the canonical legacy
 * base URL, so existing scene JSON and callers continue to work unchanged.
 */
export interface SceneAssetSet {
  readonly base: SceneAssetDescriptor;
  readonly high?: SceneAssetDescriptor;
}

export interface Scene {
  readonly id: string;
  readonly title: string;
  readonly translation?: string;
  readonly subtitle: string;
  readonly asset: string;
  readonly assets?: SceneAssetSet;
  readonly width: number;
  readonly height: number;
  readonly parentId?: string | null;
  readonly initialCamera?: Camera;
  /** Human-audited image regions used to verify word-to-object placement. */
  readonly visualRegions?: readonly VisualRegion[];
  /** Authored local crops that turn a premium image into several explorations. */
  readonly detailZones?: readonly SceneDetailZone[];
  readonly anchorAudit?: SceneAnchorAudit;
  readonly labels: readonly Label[];
  readonly portals: readonly Portal[];
}

export type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "determiner"
  | "interjection"
  | "numeral"
  | "particle"
  | "auxiliary"
  | "other";

export interface LexemeSource {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly url?: string;
}

export interface LexemeSense {
  readonly id: string;
  /** Short target-language explanation, when the source provides one. */
  readonly gloss?: string;
  /** BCP 47 language tag to translated meaning, for example `zh-CN`. */
  readonly translations: Readonly<Record<string, string>>;
}

/** One stable dictionary concept; aliases never inflate the unique-entry count. */
export interface Lexeme {
  readonly id: string;
  readonly lemma: string;
  readonly partOfSpeech: PartOfSpeech;
  readonly frequencyRank: number;
  readonly sourceId: string;
  readonly senses: readonly LexemeSense[];
}
