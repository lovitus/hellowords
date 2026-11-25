import { expect, type Page } from "@playwright/test";

interface PaintedWordPoint {
  readonly id: string;
  readonly centerX: number;
  readonly centerY: number;
}

export interface PaintedWordState {
  readonly opacity: number;
  readonly interactive: boolean;
}

/** The drawn state of one word, or null when the canvas did not paint it. */
export async function paintedWordState(page: Page, labelId: string): Promise<PaintedWordState | null> {
  return page.locator(".label-canvas").evaluate((canvas, id) => {
    const painted = (canvas as HTMLCanvasElement & { paintedLabels?: Array<{
      id: string;
      opacity: number;
      interactive: boolean;
    }> }).paintedLabels ?? [];
    const label = painted.find((item) => item.id === id);
    return label ? { opacity: label.opacity, interactive: label.interactive } : null;
  }, labelId);
}

/** How many words with this text are drawn on the canvas right now. */
export async function paintedWordCount(page: Page, word: string): Promise<number> {
  return page.locator(".label-canvas").evaluate((canvas, text) => {
    const painted = (canvas as HTMLCanvasElement & { paintedLabels?: Array<{
      word: string;
      opacity: number;
    }> }).paintedLabels ?? [];
    return painted.filter((item) => item.word === text && item.opacity > 0.025).length;
  }, word);
}

/**
 * Words are drawn by the label canvas, so their DOM mirrors no longer sit at
 * the drawn position. Aim a real pointer click at the word's painted centre.
 */
export async function clickPaintedWord(page: Page, labelId: string): Promise<void> {
  const point = await page.locator(".label-canvas").evaluate((canvas, id) => {
    const painted = (canvas as HTMLCanvasElement & { paintedLabels?: PaintedWordPoint[] })
      .paintedLabels ?? [];
    const label = painted.find((item) => item.id === id);
    if (!label) return null;
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.left + label.centerX, y: bounds.top + label.centerY };
  }, labelId);
  expect(point, `word ${labelId} must be painted on the label canvas`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}
