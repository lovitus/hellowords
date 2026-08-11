export const SEMANTIC_BACKDROP_MOTIFS = [
  "number-line",
  "grid",
  "timeline",
  "tree",
  "network",
  "body",
  "nature",
  "action",
  "language",
  "spectrum",
  "object",
  "orbit",
] as const;

export type SemanticBackdropMotif = (typeof SEMANTIC_BACKDROP_MOTIFS)[number];

/**
 * The complete reviewed 44-topic index. Keeping this explicit makes the
 * diagram choice stable across sessions and independent of load order.
 */
export const SEMANTIC_BACKDROP_TOPIC_MOTIFS = {
  "animals": "nature",
  "earth-weather": "nature",
  "ecology-substances": "network",
  "plants": "tree",
  "water-space": "orbit",
  "body": "body",
  "clothing-care": "object",
  "food-cooking": "object",
  "health-medicine": "body",
  "home-buildings": "grid",
  "materials": "spectrum",
  "technology-computing": "network",
  "tools-machines": "object",
  "transport": "action",
  "community": "network",
  "economy-work": "grid",
  "education": "tree",
  "family-relationships": "network",
  "government-law": "grid",
  "people-identity": "body",
  "sports-games": "action",
  "emotions": "spectrum",
  "goals-beliefs": "tree",
  "senses-perception": "spectrum",
  "thinking-learning": "tree",
  "arts-entertainment": "spectrum",
  "language": "language",
  "media-writing": "language",
  "consumption-use": "action",
  "events-processes": "timeline",
  "interaction-contact": "network",
  "making-changing": "action",
  "movement": "action",
  "number-measure": "number-line",
  "places": "grid",
  "shape-position": "grid",
  "time": "timeline",
  "comparison-degree": "spectrum",
  "qualities": "spectrum",
  "states-conditions": "spectrum",
  "auxiliaries-modals": "language",
  "connectors-relations": "network",
  "determiners-pronouns": "language",
  "function-adverbs": "language",
} as const satisfies Readonly<Record<string, SemanticBackdropMotif>>;

export const SEMANTIC_BACKDROP_TOPIC_IDS = Object.freeze(
  Object.keys(SEMANTIC_BACKDROP_TOPIC_MOTIFS),
);

export interface SemanticBackdropSelection {
  readonly topicId: string;
  readonly topicLabelEn: string;
  readonly topicLabelZh: string;
  readonly subclusterId?: string;
  readonly subclusterLabelEn?: string;
  readonly subclusterLabelZh?: string;
  readonly subclusterIds?: readonly string[];
}

export interface SemanticBackdropModel {
  readonly topicId: string;
  readonly motif: SemanticBackdropMotif;
  readonly topicLabelEn: string;
  readonly topicLabelZh: string;
  readonly topicOrdinal: number;
  readonly topicTotal: number;
  readonly titleEn: string;
  readonly titleZh: string;
  readonly subclusterOrdinal?: number;
  readonly subclusterTotal?: number;
  readonly ordinalLabel: string;
}

export interface SemanticBackdropMark {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly label?: string;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackMotif(topicId: string): SemanticBackdropMotif {
  const generalMotifs = SEMANTIC_BACKDROP_MOTIFS.filter((motif) => motif !== "number-line");
  return generalMotifs[stableHash(topicId) % generalMotifs.length];
}

export function semanticBackdropMotif(
  topicId: string,
  subclusterId = "",
  subclusterLabelEn = "",
): SemanticBackdropMotif {
  const numericLeaf = `${subclusterId} ${subclusterLabelEn}`.toLowerCase();
  if (/\b(integer|number|numeral|quantity|measurement|unit|linear-unit)\b/u.test(numericLeaf)) {
    return "number-line";
  }
  return SEMANTIC_BACKDROP_TOPIC_MOTIFS[
    topicId as keyof typeof SEMANTIC_BACKDROP_TOPIC_MOTIFS
  ] ?? fallbackMotif(topicId);
}

export function semanticBackdropModel(
  selection: SemanticBackdropSelection,
): SemanticBackdropModel {
  const topicOrdinal = SEMANTIC_BACKDROP_TOPIC_IDS.indexOf(selection.topicId) + 1;
  const subclusterIndex = selection.subclusterId
    ? selection.subclusterIds?.indexOf(selection.subclusterId) ?? -1
    : -1;
  const hasSubclusterOrdinal = subclusterIndex >= 0 && Boolean(selection.subclusterIds?.length);
  const topicPosition = topicOrdinal > 0 ? `${topicOrdinal}/${SEMANTIC_BACKDROP_TOPIC_IDS.length}` : "—/44";
  const subclusterPosition = hasSubclusterOrdinal
    ? `${subclusterIndex + 1}/${selection.subclusterIds?.length ?? 0}`
    : undefined;
  return {
    topicId: selection.topicId,
    motif: semanticBackdropMotif(
      selection.topicId,
      selection.subclusterId,
      selection.subclusterLabelEn,
    ),
    topicLabelEn: selection.topicLabelEn,
    topicLabelZh: selection.topicLabelZh,
    topicOrdinal,
    topicTotal: SEMANTIC_BACKDROP_TOPIC_IDS.length,
    titleEn: selection.subclusterLabelEn || selection.topicLabelEn,
    titleZh: selection.subclusterLabelZh || selection.topicLabelZh,
    subclusterOrdinal: hasSubclusterOrdinal ? subclusterIndex + 1 : undefined,
    subclusterTotal: hasSubclusterOrdinal ? selection.subclusterIds?.length : undefined,
    ordinalLabel: subclusterPosition
      ? `TOPIC ${topicPosition} · WORD GROUP ${subclusterPosition}`
      : `TOPIC ${topicPosition}`,
  };
}

const NUMBER_LINE_LABELS = ["−∞", "−100", "−10", "−1", "0", "1", "10", "100", "+∞"] as const;
const LANGUAGE_LABELS = ["Aa", "文", "?!", "→", "Bb", "语", "…", "Cc", "意", "()", "Dd", "声"] as const;

/** Native-pixel motif marks shared by CSS; every coordinate is a percentage. */
export function semanticBackdropMarks(motif: SemanticBackdropMotif): readonly SemanticBackdropMark[] {
  if (motif === "number-line") {
    return NUMBER_LINE_LABELS.map((label, index) => ({
      x: 8 + index * 10.5,
      y: 52,
      rotation: 0,
      label,
    }));
  }
  if (motif === "grid") {
    return Array.from({ length: 12 }, (_, index) => ({
      x: 20 + (index % 4) * 20,
      y: 25 + Math.floor(index / 4) * 25,
      rotation: 0,
    }));
  }
  if (motif === "timeline") {
    return Array.from({ length: 12 }, (_, index) => ({
      x: 9 + index * 7.4,
      y: index % 2 ? 58 : 43,
      rotation: 0,
    }));
  }
  if (motif === "tree") {
    const points = [[50, 16], [32, 36], [68, 36], [21, 57], [42, 57], [59, 57], [80, 57], [14, 80], [28, 80], [40, 80], [66, 80], [84, 80]];
    return points.map(([x, y]) => ({ x, y, rotation: 0 }));
  }
  if (motif === "body") {
    const points = [[50, 13], [36, 30], [64, 30], [25, 46], [75, 46], [43, 49], [57, 49], [39, 69], [61, 69], [31, 88], [69, 88], [50, 36]];
    return points.map(([x, y]) => ({ x, y, rotation: 0 }));
  }
  if (motif === "action") {
    return Array.from({ length: 12 }, (_, index) => ({
      x: 10 + index * 7.2,
      y: 80 - index * 5.1 + (index % 3) * 4,
      rotation: -32,
    }));
  }
  if (motif === "language") {
    return LANGUAGE_LABELS.map((label, index) => ({
      x: 18 + (index % 4) * 21,
      y: 22 + Math.floor(index / 4) * 29,
      rotation: index % 2 ? -2 : 2,
      label,
    }));
  }
  if (motif === "spectrum") {
    return Array.from({ length: 12 }, (_, index) => ({
      x: 8 + index * 7.6,
      y: 50,
      rotation: 0,
    }));
  }
  if (motif === "object") {
    const points = [[20, 22], [50, 22], [80, 22], [20, 50], [50, 50], [80, 50], [20, 78], [50, 78], [80, 78], [35, 36], [65, 64], [65, 36]];
    return points.map(([x, y], index) => ({ x, y, rotation: index % 2 ? 45 : 0 }));
  }
  if (motif === "orbit") {
    return Array.from({ length: 12 }, (_, index) => {
      const angle = index * Math.PI / 6;
      const radius = index % 2 ? 34 : 24;
      return {
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
        rotation: index * 30,
      };
    });
  }
  if (motif === "nature") {
    return Array.from({ length: 12 }, (_, index) => {
      const angle = index * Math.PI / 6 - Math.PI / 2;
      const radius = 18 + (index % 4) * 5;
      return {
        x: 50 + Math.cos(angle) * radius,
        y: 52 + Math.sin(angle) * radius,
        rotation: index * 30,
      };
    });
  }
  return Array.from({ length: 12 }, (_, index) => ({
    x: 12 + (stableHash(`${motif}:x:${index}`) % 76),
    y: 15 + (stableHash(`${motif}:y:${index}`) % 70),
    rotation: stableHash(`${motif}:r:${index}`) % 90,
  }));
}
