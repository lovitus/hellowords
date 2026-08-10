import type { Label } from "./types";

export const LABEL_ENCOUNTER_OPACITY = 0.52;
export const LABEL_ENCOUNTER_DWELL_MS = 600;

const LABEL_ENTRY_PREFIX = "label:";
const LEXEME_ENTRY_PREFIX = "lexeme:";

function normalizeLegacyWord(word: string): string {
  return word.trim().toLocaleLowerCase();
}

function isStableEntry(entry: string): boolean {
  return entry.startsWith(LABEL_ENTRY_PREFIX) || entry.startsWith(LEXEME_ENTRY_PREFIX);
}

/**
 * Reads both the original flat word array and the stable-id entries written by
 * the current encounter model. Keeping the on-disk value as a string array
 * also lets older clients continue to read it.
 */
export function parseDiscoveredEntries(serialized: string | null): Set<string> {
  if (!serialized) return new Set();
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!Array.isArray(value)) return new Set();
    return new Set(value.flatMap((entry) => {
      if (typeof entry !== "string") return [];
      const normalized = isStableEntry(entry) ? entry.trim() : normalizeLegacyWord(entry);
      return normalized ? [normalized] : [];
    }));
  } catch {
    return new Set();
  }
}

export function serializeDiscoveredEntries(entries: ReadonlySet<string>): string {
  return JSON.stringify([...entries].sort());
}

/** Scene label ids are authored as stable semantic ids across scene slices. */
export function labelDiscoveryKey(label: Pick<Label, "id" | "lexemeId">): string {
  return label.lexemeId
    ? `${LEXEME_ENTRY_PREFIX}${label.lexemeId}`
    : `${LABEL_ENTRY_PREFIX}${label.id}`;
}

/**
 * Replaces a matching legacy word entry with its stable label key so an
 * upgrade does not increase the counter merely because the storage format
 * changed.
 */
export function recordDiscoveredLabels(
  current: ReadonlySet<string>,
  labels: readonly Pick<Label, "id" | "lexemeId" | "word">[],
): Set<string> {
  const next = new Set(current);
  for (const label of labels) {
    next.delete(normalizeLegacyWord(label.word));
    next.add(labelDiscoveryKey(label));
  }
  return next;
}

export interface LabelDwellAdvance {
  readonly visibleSince: ReadonlyMap<string, number>;
  readonly newlyEncounteredIds: readonly string[];
  /** Milliseconds until the next unresolved visible label reaches the gate. */
  readonly nextCheckInMs: number | null;
}

/**
 * Advances a continuous-visibility dwell gate. A label that leaves the
 * viewport loses its partial dwell time; already reported labels are ignored.
 */
export function advanceLabelDwell(
  previousVisibleSince: ReadonlyMap<string, number>,
  visibleLabelIds: Iterable<string>,
  alreadyEncounteredIds: ReadonlySet<string>,
  now: number,
  dwellMs = LABEL_ENCOUNTER_DWELL_MS,
): LabelDwellAdvance {
  const visibleSince = new Map<string, number>();
  const newlyEncounteredIds: string[] = [];
  let nextCheckInMs = Number.POSITIVE_INFINITY;

  for (const id of new Set(visibleLabelIds)) {
    if (alreadyEncounteredIds.has(id)) continue;
    const since = previousVisibleSince.get(id) ?? now;
    const elapsed = Math.max(0, now - since);
    if (elapsed >= dwellMs) {
      newlyEncounteredIds.push(id);
      continue;
    }
    visibleSince.set(id, since);
    nextCheckInMs = Math.min(nextCheckInMs, dwellMs - elapsed);
  }

  return {
    visibleSince,
    newlyEncounteredIds,
    nextCheckInMs: Number.isFinite(nextCheckInMs) ? nextCheckInMs : null,
  };
}
