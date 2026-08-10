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
}

export interface Portal {
  readonly id: string;
  readonly label: string;
  readonly translation?: string;
  readonly childSceneId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly enterScale?: number;
  readonly entryCamera?: Camera;
  /** Runtime override; normally supplied by the navigation policy. */
  readonly exitScale?: number;
}

export interface Scene {
  readonly id: string;
  readonly title: string;
  readonly translation?: string;
  readonly subtitle: string;
  readonly asset: string;
  readonly width: number;
  readonly height: number;
  readonly parentId?: string | null;
  readonly initialCamera?: Camera;
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
