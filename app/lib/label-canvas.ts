import type { Label } from "../domain";
import type { LabelSemanticStyle } from "../domain/labelSemanticStyle";

/**
 * Canvas painter for scene word callouts.
 *
 * DOM pills restyle hundreds of nodes whenever the camera moves, which made
 * the scene renderer the bottleneck. This painter draws the same placement
 * result in one bitmap per frame. The DOM buttons stay as the accessible,
 * focusable mirror and never move.
 */
export interface PaintedLabel {
  readonly id: string;
  readonly label: Label;
  readonly word: string;
  readonly translation: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly interactive: boolean;
}

export interface LabelPaintState {
  readonly labels: readonly PaintedLabel[];
  readonly width: number;
  readonly height: number;
  readonly meaningVisible: boolean;
  readonly focusedId: string | null;
  readonly hoveredId: string | null;
}

interface Palette {
  readonly surface: string;
  readonly border: string;
  readonly ink: string;
  readonly muted: string;
  readonly dot: string;
}

const DEFAULT_PALETTE: Palette = {
  surface: "#f6f3ed",
  border: "#d2c9ba",
  ink: "#34312a",
  muted: "#605a4f",
  dot: "#7d7567",
};

const PILL_SURFACE_ALPHA = 0.34;
const PILL_SURFACE_ALPHA_ACTIVE = 0.9;
const HIT_PADDING = 2;
const MIN_TOUCH_TARGET = 28;
const ANCHOR_RADIUS = 4;
const ANCHOR_OUTER_RADIUS = ANCHOR_RADIUS + 1;
/** Room around a pill for the focus ring; sprites are sized to it once. */
const SPRITE_PAD = 4;
const SPRITE_CACHE_LIMIT = 500;

const fontCache = new WeakMap<HTMLCanvasElement, string>();
const widthCache = new Map<string, number>();
const spriteCache = new Map<string, HTMLCanvasElement>();
export function releaseLabelCanvas(canvas: HTMLCanvasElement): void {
  if (canvas.width) canvas.width = 0;
}

export function hitPaintedLabel(
  labels: readonly PaintedLabel[],
  x: number,
  y: number,
  pointerType = "mouse",
): PaintedLabel | null {
  let nearest: PaintedLabel | null = null;
  let nearestDistance = Infinity;
  let nearestAnchor: PaintedLabel | null = null;
  let anchorDistanceSquared = Infinity;
  const anchorHitRadius = pointerType === "touch" ? MIN_TOUCH_TARGET / 2 : ANCHOR_OUTER_RADIUS + HIT_PADDING;
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const item = labels[index];
    if (!item.interactive || item.opacity < 0.52) continue;
    const offsetX = Math.abs(x - item.centerX);
    const offsetY = Math.abs(y - item.centerY);
    const radius = item.height / 2;
    const dx = Math.max(0, offsetX - item.width / 2);
    const dy = Math.max(0, offsetY - radius);
    if (dx === 0 && dy === 0) {
      const capX = Math.max(0, offsetX - (item.width / 2 - radius));
      if (capX * capX + offsetY * offsetY <= (radius + 0.5) ** 2) return item;
    }
    const anchorDx = x - item.anchorX;
    const anchorDy = y - item.anchorY;
    const distanceToAnchor = anchorDx * anchorDx + anchorDy * anchorDy;
    if (distanceToAnchor <= anchorHitRadius * anchorHitRadius && distanceToAnchor < anchorDistanceSquared) {
      nearestAnchor = item;
      anchorDistanceSquared = distanceToAnchor;
    }
    const paddingX = pointerType === "touch" ? Math.max(HIT_PADDING, (MIN_TOUCH_TARGET - item.width) / 2) : HIT_PADDING;
    const paddingY = pointerType === "touch" ? Math.max(HIT_PADDING, (MIN_TOUCH_TARGET - item.height) / 2) : HIT_PADDING;
    const distance = dx * dx + dy * dy;
    if (dx <= paddingX && dy <= paddingY && distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  // A visible dot wins over invisible padding. A visible pill, painted above
  // the dots, already won inside the loop. Keep the existing pill touch area.
  if (anchorDistanceSquared <= ANCHOR_OUTER_RADIUS * ANCHOR_OUTER_RADIUS) return nearestAnchor;
  return nearest ?? nearestAnchor;
}

const paletteCache = new WeakMap<object, Palette>();

function paletteFor(style: LabelSemanticStyle | undefined): Palette {
  const variables = style?.cssVariables;
  if (!variables) return DEFAULT_PALETTE;
  const cached = paletteCache.get(variables);
  if (cached) return cached;
  const palette: Palette = {
    surface: variables["--label-semantic-surface"],
    border: variables["--label-semantic-border"],
    ink: variables["--label-semantic-ink"],
    muted: variables["--label-semantic-muted"],
    dot: variables["--label-semantic-dot"],
  };
  paletteCache.set(variables, palette);
  return palette;
}

function fontFor(canvas: HTMLCanvasElement): string {
  const cached = fontCache.get(canvas);
  if (cached) return cached;
  const family = getComputedStyle(canvas).fontFamily || "system-ui, sans-serif";
  const font = `750 10.5px ${family}`;
  fontCache.set(canvas, font);
  return font;
}

function measure(context: CanvasRenderingContext2D, text: string, font: string): number {
  const key = `${font}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const width = context.measureText(text).width;
  if (widthCache.size > 4000) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

function traceRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radius = height / 2;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/**
 * A pill's fill, border, focus ring and text are rasterized once per content
 * and size. Each frame then composites the sprite at the live position and
 * fade opacity, so stroked text is never re-rendered while the camera moves.
 */
function pillSprite(
  item: PaintedLabel,
  meaningVisible: boolean,
  active: boolean,
  palette: Palette,
  font: string,
  dpr: number,
): HTMLCanvasElement {
  const key = [
    dpr,
    meaningVisible ? 1 : 0,
    active ? 1 : 0,
    palette.surface,
    palette.border,
    palette.ink,
    palette.muted,
    item.width,
    item.height,
    item.word,
    meaningVisible ? item.translation : "",
  ].join("|");
  const cached = spriteCache.get(key);
  if (cached) return cached;
  if (spriteCache.size >= SPRITE_CACHE_LIMIT) spriteCache.clear();
  const sprite = document.createElement("canvas");
  const outerWidth = item.width + SPRITE_PAD * 2;
  const outerHeight = item.height + SPRITE_PAD * 2;
  sprite.width = Math.ceil(outerWidth * dpr);
  sprite.height = Math.ceil(outerHeight * dpr);
  spriteCache.set(key, sprite);
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.translate(SPRITE_PAD, SPRITE_PAD);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.font = font;
  context.textBaseline = "middle";
  context.textAlign = "left";
  traceRoundRect(context, 0, 0, item.width, item.height);
  context.globalAlpha = active ? PILL_SURFACE_ALPHA_ACTIVE : PILL_SURFACE_ALPHA;
  context.fillStyle = palette.surface;
  context.fill();
  context.globalAlpha = 0.5;
  context.lineWidth = 1;
  context.strokeStyle = palette.border;
  context.stroke();
  if (active) {
    traceRoundRect(context, -2, -2, item.width + 4, item.height + 4);
    context.globalAlpha = 0.95;
    context.lineWidth = 1.5;
    context.strokeStyle = "rgba(222, 158, 66, 0.95)";
    context.stroke();
  }
  context.globalAlpha = 1;
  const textX = 5;
  const textY = item.height / 2 + 0.5;
  context.lineWidth = 2;
  context.strokeStyle = "#ffffff";
  context.strokeText(item.word, textX, textY);
  context.fillStyle = palette.ink;
  context.fillText(item.word, textX, textY);
  if (meaningVisible && item.translation) {
    const translationX = textX + measure(context, item.word, font) + 5;
    context.strokeText(item.translation, translationX, textY);
    context.fillStyle = palette.muted;
    context.fillText(item.translation, translationX, textY);
  }
  return sprite;
}

function paintLeaders(context: CanvasRenderingContext2D, items: readonly PaintedLabel[]): void {
  let started = false;
  for (const item of items) {
    if (Math.hypot(item.centerX - item.anchorX, item.centerY - item.anchorY) <= 5) continue;
    if (!started) {
      context.beginPath();
      started = true;
    }
    context.moveTo(item.anchorX, item.anchorY);
    context.lineTo(item.centerX, item.centerY);
  }
  if (!started) return;
  context.strokeStyle = "rgba(70, 48, 18, 0.34)";
  context.lineWidth = 3;
  context.stroke();
  context.strokeStyle = "rgba(236, 172, 80, 0.96)";
  context.lineWidth = 1.6;
  context.stroke();
  context.strokeStyle = "rgba(255, 246, 214, 0.9)";
  context.lineWidth = 0.5;
  context.stroke();
}

function paintAnchors(
  context: CanvasRenderingContext2D,
  items: readonly PaintedLabel[],
  styles: ReadonlyMap<string, LabelSemanticStyle>,
): void {
  const byColor = new Map<string, PaintedLabel[]>();
  for (const item of items) {
    const color = paletteFor(styles.get(item.id)).dot;
    const group = byColor.get(color);
    if (group) group.push(item);
    else byColor.set(color, [item]);
  }
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 252, 241, 0.96)";
  for (const [color, group] of byColor) {
    context.beginPath();
    for (const item of group) {
      context.moveTo(item.anchorX + ANCHOR_RADIUS, item.anchorY);
      context.arc(item.anchorX, item.anchorY, ANCHOR_RADIUS, 0, Math.PI * 2);
    }
    context.fillStyle = color;
    context.fill();
    context.stroke();
  }
}

export function paintLabelCanvas(
  canvas: HTMLCanvasElement | null,
  state: LabelPaintState | null,
  styles: ReadonlyMap<string, LabelSemanticStyle>,
): void {
  if (!canvas) return;
  if (!state || !state.labels.some((item) => item.opacity > 0.025)) {
    releaseLabelCanvas(canvas);
    return;
  }
  // Draw on the visible canvas in the same frame as the photo transform.
  // A transferred canvas can publish its bitmap a frame later during zoom.
  const context = canvas.getContext("2d");
  if (!context) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(state.width * dpr);
  const pixelHeight = Math.round(state.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  } else {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.lineJoin = "round";
  context.lineCap = "round";
  const font = fontFor(canvas);
  context.font = font;
  context.textBaseline = "middle";
  context.textAlign = "left";

  // Leaders and anchors first, so every pill sits above every callout line.
  for (const item of state.labels) {
    if (item.opacity <= 0.025) continue;
    if (item.opacity < 0.98) {
      context.globalAlpha = item.opacity;
      paintLeaders(context, [item]);
      paintAnchors(context, [item], styles);
    }
  }
  // Fully opaque words share one batched path per style, so a steady frame has
  // a fixed number of canvas operations no matter how many words are shown.
  const solid = state.labels.filter((item) => item.opacity >= 0.98);
  context.globalAlpha = 1;
  paintLeaders(context, solid);
  paintAnchors(context, solid, styles);

  for (const item of state.labels) {
    if (item.opacity <= 0.025) continue;
    const palette = paletteFor(styles.get(item.id));
    const active = item.id === state.focusedId || item.id === state.hoveredId;
    const sprite = pillSprite(item, state.meaningVisible, active, palette, font, dpr);
    // Snap to device pixels so the pre-rasterized text stays crisp.
    const drawX = Math.round((item.centerX - item.width / 2 - SPRITE_PAD) * dpr) / dpr;
    const drawY = Math.round((item.centerY - item.height / 2 - SPRITE_PAD) * dpr) / dpr;
    context.globalAlpha = item.opacity;
    // Draw at the sprite's own device-pixel size so every blit is 1:1 and
    // never resampled.
    context.drawImage(sprite, drawX, drawY, sprite.width / dpr, sprite.height / dpr);
  }
  context.globalAlpha = 1;
}
