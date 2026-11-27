import { expect, test, type Locator } from "@playwright/test";
import { openPhotographedRoute, projectPhoto } from "./photo-journey";

declare global {
  interface Window {
    readBilingualSprite: ReturnType<typeof installPaintRecorder>;
  }
}

// Observe the native draws on each sprite and the sprites actually composited
// into the label canvas. Layout metadata cannot tell us if a glyph was cut off.
function installPaintRecorder() {
  type Box = { left: number; right: number; top: number; bottom: number };
  type Run = { text: string; font: string; x: number; y: number; ink: Box; clippedByMaxWidth: boolean };
  type Sprite = { runs: Run[]; body?: Box; cornerRadius?: number };
  type Draw = { sprite: HTMLCanvasElement; x: number; y: number; w: number; h: number; opacity: number };
  const sprites = new WeakMap<HTMLCanvasElement, Sprite>();
  const frames = new WeakMap<HTMLCanvasElement, Draw[]>();
  const proto = CanvasRenderingContext2D.prototype;
  const spriteFor = (canvas: HTMLCanvasElement) => {
    let sprite = sprites.get(canvas);
    if (!sprite) { sprite = { runs: [] }; sprites.set(canvas, sprite); }
    return sprite;
  };
  // The first corner of the rounded background connects the top and right
  // edges. Keep its bounds in the same bitmap pixel coordinates as the ink.
  const arcTo = proto.arcTo;
  proto.arcTo = function (x1, y1, x2, y2, radius) {
    arcTo.call(this, x1, y1, x2, y2, radius);
    if (this.canvas.isConnected || x1 !== x2 || y1 !== 0 || y2 <= 0) return;
    const sprite = spriteFor(this.canvas), m = this.getTransform();
    if (!sprite.body) {
      sprite.body = { left: m.e, top: m.f, right: m.e + x1 * m.a, bottom: m.f + y2 * m.d };
      sprite.cornerRadius = radius;
    }
  };
  const fillText = proto.fillText;
  proto.fillText = function (text, x, y, maxWidth) {
    if (maxWidth === undefined) fillText.call(this, text, x, y);
    else fillText.call(this, text, x, y, maxWidth);
    if (this.canvas.isConnected) return;
    const metrics = this.measureText(text), m = this.getTransform(), outline = this.lineWidth / 2;
    spriteFor(this.canvas).runs.push({
      text, font: this.font, x, y, clippedByMaxWidth: maxWidth !== undefined && maxWidth < metrics.width,
      ink: {
        left: m.e + (x - metrics.actualBoundingBoxLeft - outline) * m.a,
        right: m.e + (x + metrics.actualBoundingBoxRight + outline) * m.a,
        top: m.f + (y - metrics.actualBoundingBoxAscent - outline) * m.d,
        bottom: m.f + (y + metrics.actualBoundingBoxDescent + outline) * m.d,
      },
    });
  };
  const clearRect = proto.clearRect;
  proto.clearRect = function (x, y, w, h) {
    clearRect.call(this, x, y, w, h);
    if (this.canvas.matches(".label-canvas")) frames.set(this.canvas, []);
  };
  proto.drawImage = new Proxy(proto.drawImage, {
    apply(nativeDraw, ctx: CanvasRenderingContext2D, args) {
      const result = Reflect.apply(nativeDraw, ctx, args);
      const [sprite, x, y, w, h] = args;
      if (ctx.canvas.matches(".label-canvas") && args.length === 5 && sprite instanceof HTMLCanvasElement && sprites.has(sprite)) {
        let frame = frames.get(ctx.canvas);
        if (!frame) { frame = []; frames.set(ctx.canvas, frame); }
        const m = ctx.getTransform();
        frame.push({ sprite, x: x * m.a + m.e, y: y * m.d + m.f, w: w * m.a, h: h * m.d, opacity: ctx.globalAlpha });
      }
      return result;
    },
  });
  function read(word: string) {
    const canvas = document.querySelector<HTMLCanvasElement>(".viewer-shell:not([data-phase]) .label-canvas");
    if (!canvas) return null;
    const frame = frames.get(canvas) ?? [], rect = canvas.getBoundingClientRect();
    const hasChinese = (text: string) => /[\u3400-\u9FFF]/.test(text);
    const englishOf = (runs: Run[]) => runs.filter(run => !hasChinese(run.text)).map(run => run.text).join(" ");
    const index = frame.findLastIndex(draw => draw.opacity >= 0.9 && englishOf(sprites.get(draw.sprite)!.runs) === word);
    if (index < 0) return null;
    const draw = frame[index], { runs, body, cornerRadius } = sprites.get(draw.sprite)!;
    if (!body) return null;
    const screen = (d: Draw, box: Box): Box => {
      const x = (value: number) => rect.left + (d.x + value * d.w / d.sprite.width) * rect.width / canvas!.width;
      const y = (value: number) => rect.top + (d.y + value * d.h / d.sprite.height) * rect.height / canvas!.height;
      return { left: x(box.left), right: x(box.right), top: y(box.top), bottom: y(box.bottom) };
    };
    const pill = screen(draw, body);
    const intersect = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const later = frame.slice(index + 1).filter(other => other.opacity >= 0.52 && sprites.get(other.sprite)?.body);
    const overlays = [...document.querySelectorAll<HTMLElement>(
      'aside:not(.sr-only), [data-testid="scene-minimap"], .zoom-controls, .world-header',
    )].filter(el => el.checkVisibility({ checkOpacity: true }));
    const observed = runs.map(run => {
      const ink = screen(draw, run.ink);
      const overlaid = later.filter(other => intersect(ink, screen(other, sprites.get(other.sprite)!.body!)))
        .map(other => sprites.get(other.sprite)!.runs.map(item => item.text).join(" "));
      const coveredBy = overlays.filter(el => intersect(ink, el.getBoundingClientRect())).map(el => el.className);
      const clipped = ink.left < Math.max(rect.left, 0, pill.left) || ink.right > Math.min(rect.right, innerWidth, pill.right)
        || ink.top < Math.max(rect.top, 0) || ink.bottom > Math.min(rect.bottom, innerHeight)
        || run.ink.top < 0 || run.ink.bottom > draw.sprite.height || run.clippedByMaxWidth;
      return { text: run.text, font: run.font, baseline: run.y, ink, clipped, overlaid, coveredBy };
    });
    return { pill, cornerRadius, runs: observed, rows: new Set(runs.map(run => run.y)).size,
      translation: runs.filter(run => hasChinese(run.text)).map(run => run.text).join(""),
      readable: observed.every(run => !run.clipped && !run.overlaid.length && !run.coveredBy.length),
    };
  }
  Object.assign(window, { readBilingualSprite: read });
  return read;
}

async function waitForPhotoToSettle(image: HTMLImageElement) {
  let previous = "";
  let stationarySince = performance.now();
  await new Promise<void>(done => {
    function observe(now: number) {
      const { x, y, width, height } = image.getBoundingClientRect();
      const current = `${x},${y},${width},${height}`;
      if (current !== previous) {
        previous = current;
        stationarySince = now;
      }
      if (now - stationarySince >= 300) done();
      else requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  });
}

const targets = [
  { name: "long-button", word: "Elevator-car upper-middle raised center", meaning: "电梯轿厢上中排按钮凸面", x: 1305, y: 374 },
  { name: "short-button", word: "Elevator-car center button", meaning: "电梯轿厢中排按钮", x: 1305, y: 423 },
];

test("the elevator photograph keeps the full bilingual button labels readable when meanings change", async ({ page, isMobile }, testInfo) => {
  if (isMobile) await page.setViewportSize({ width: 385, height: 705 });
  await page.addInitScript(installPaintRecorder);
  await openPhotographedRoute(page, isMobile, [
    ["office-building", "Office building"], ["office-reception-lobby", "Office reception lobby"], ["office-elevator-car", "Office elevator car"],
  ], "/scenes/office-elevator-car-premium-v1.jpg", "991fbda7b0bd3bf0527cb65600655fda73cbbf9ec3865aec0a75718a1593cd3b");
  const image = page.locator(".viewer-shell:not([data-phase]) img.scene-art");
  const index = page.getByTestId("scene-word-index");
  const cards = page.getByRole("complementary", { name: / word details$/ });
  const toggle = page.getByTestId("meaning-toggle");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const close = async () => {
    await activate(cards.getByRole("button", { name: "关闭单词卡" }));
    await expect(cards).toBeHidden();
  };
  if (await toggle.getAttribute("aria-pressed") !== "true") await activate(toggle);
  await activate(page.getByRole("button", { name: "收起小地图", exact: true }));

  for (const [i, target] of targets.entries()) {
    await activate(page.getByTestId("scene-word-index-toggle"));
    await index.getByRole("searchbox").fill(target.word);
    await activate(index.getByRole("button", { name: `${target.word}，${target.meaning}`, exact: true }));
    await expect(cards.locator("strong")).toHaveText(target.word);
    await expect(cards.locator("p").first()).toHaveText(target.meaning);
    await image.evaluate(waitForPhotoToSettle);
    const inspect = async (stage: string, translation: string, rows: number) => {
      const snapshot = () => page.evaluate(word => window.readBilingualSprite(word), target.word);
      let last: Awaited<ReturnType<typeof snapshot>> = null;
      try {
        await expect.poll(async () => {
          last = await snapshot();
          return last && {
            translation: last.translation, readable: last.readable, rows: last.rows, cornerRadius: last.cornerRadius,
            normalFont: last.runs.every(run => /(?:^| )10\.5px /.test(run.font)),
          };
        }, { message: `the composited ${stage} sprite contains complete, unobstructed ink` })
          .toMatchObject({ translation, readable: true, rows, normalFont: true, ...(rows > 1 ? { cornerRadius: 5 } : {}) });
      } finally {
        await testInfo.attach(`${stage}-result`, { body: JSON.stringify(last), contentType: "application/json" });
        await testInfo.attach(stage, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
      }
    };
    await inspect(target.name, target.meaning, i === 0 ? 2 : 1);
    if (i === 0) {
      await activate(toggle);
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await inspect("long-button-english", "", 1);
      await activate(toggle);
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await inspect("long-button-restored", target.meaning, 2);
    }
    if (await cards.isVisible()) await close();
    await image.evaluate(waitForPhotoToSettle);
    const point = await projectPhoto(image, target.x, target.y);
    expect(point.visible).toBe(true);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    try {
      await expect(cards.locator("strong"), `the photographed button opens ${target.word}`).toHaveText(target.word);
      await expect(cards.locator("p").first()).toHaveText(target.meaning);
    } finally {
      const actual = await cards.evaluateAll(elements => elements.map(el => ({
        word: el.querySelector("strong")?.textContent, meaning: el.querySelector("p")?.textContent,
      })));
      await testInfo.attach(`${target.name}-photo-result`, { body: JSON.stringify({ point, actual }), contentType: "application/json" });
      await testInfo.attach(`${target.name}-photo`, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
    }
    await close();
  }
});
