import type { Label } from "./types";

export interface SceneLabelCamera {
  readonly x: number;
  readonly y: number;
  readonly fit: number;
  readonly scale: number;
}

export interface SceneLabelViewport {
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
}

export interface SceneLabelLayoutItem {
  readonly id: string;
  readonly opacity: number;
  readonly interactive: boolean;
  readonly screenX: number;
  readonly screenY: number;
}

const DEFAULT_REVEAL_BANDS = [
  { start: 0.7, end: 0.9 },
  { start: 0.76, end: 0.98 },
  { start: 1.34, end: 2.02 },
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(start: number, end: number, value: number): number {
  const progress = clamp((value - start) / Math.max(0.001, end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function sceneLabelRevealOpacity(label: Label, scale: number): number {
  const authoredMinimum = label.minScale;
  const band = DEFAULT_REVEAL_BANDS[label.minLevel ?? 0];
  const start = authoredMinimum ?? band.start;
  const end = authoredMinimum === undefined ? band.end : authoredMinimum + 0.28;
  const fadeIn = smoothstep(start, end, scale);
  if (label.maxScale === undefined) return fadeIn;
  const fadeOut = 1 - smoothstep(Math.max(start, label.maxScale - 0.28), label.maxScale, scale);
  return fadeIn * fadeOut;
}

function estimatedLabelSize(label: Label, meaningVisible: boolean): { width: number; height: number } {
  const wordWidth = Math.max(28, Array.from(label.word).length * 7.45);
  const translationWidth = meaningVisible ? Array.from(label.translation).length * 11.5 + 16 : 0;
  return {
    width: Math.min(250, 38 + wordWidth + translationWidth),
    height: 34,
  };
}

function overlaps(
  first: { left: number; right: number; top: number; bottom: number },
  second: { left: number; right: number; top: number; bottom: number },
  padding: number,
): boolean {
  return !(
    first.right + padding <= second.left
    || first.left >= second.right + padding
    || first.bottom + padding <= second.top
    || first.top >= second.bottom + padding
  );
}

/**
 * Projects at most a few dozen authored labels into screen space, then removes
 * collisions by priority. Opacity remains continuous with camera scale; CSS
 * only eases the final collision changes, so zoom never has a hard density cut.
 */
export function computeSceneLabelLayout(
  labels: readonly Label[],
  camera: SceneLabelCamera,
  viewport: SceneLabelViewport,
  meaningVisible: boolean,
): SceneLabelLayoutItem[] {
  const effectiveScale = camera.fit * camera.scale;
  const candidates = labels
    .map((label) => {
      const opacity = sceneLabelRevealOpacity(label, camera.scale);
      const screenX = camera.x + label.x * effectiveScale;
      const screenY = camera.y + label.y * effectiveScale;
      const size = estimatedLabelSize(label, meaningVisible);
      return { label, opacity, screenX, screenY, ...size };
    })
    .filter(({ opacity, screenX, screenY, width, height }) => (
      opacity > 0.025
      && screenX + width / 2 >= 8
      && screenX - width / 2 <= viewport.width - 8
      && screenY + height / 2 >= 8
      && screenY - height / 2 <= viewport.height - 8
    ))
    .sort((first, second) => (
      first.label.priority - second.label.priority
      || second.opacity - first.opacity
      || first.label.id.localeCompare(second.label.id)
    ));

  const accepted: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const visible = new Map<string, SceneLabelLayoutItem>();
  const padding = viewport.compact ? 3 : 6;
  for (const candidate of candidates) {
    const bounds = {
      left: candidate.screenX - candidate.width / 2,
      right: candidate.screenX + candidate.width / 2,
      top: candidate.screenY - candidate.height / 2,
      bottom: candidate.screenY + candidate.height / 2,
    };
    const blocked = accepted.some((placed) => overlaps(bounds, placed, padding));
    const opacity = blocked ? 0 : candidate.opacity;
    if (!blocked) accepted.push(bounds);
    visible.set(candidate.label.id, {
      id: candidate.label.id,
      opacity,
      interactive: !blocked && opacity >= 0.52,
      screenX: candidate.screenX,
      screenY: candidate.screenY,
    });
  }

  return labels.map((label) => visible.get(label.id) ?? {
    id: label.id,
    opacity: 0,
    interactive: false,
    screenX: Number.NaN,
    screenY: Number.NaN,
  });
}
