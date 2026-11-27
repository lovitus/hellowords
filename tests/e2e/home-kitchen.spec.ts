import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkPaintedWords } from "./photo-journey";

type Point = readonly [number, number];
type Mask = readonly (readonly Point[])[];

// Traced on the 1600 × 900 photograph, independently of scene JSON. The
// sink polygon follows the metal basins; the stone counter is outside it.
// Separate faucet silhouettes keep the window visible inside the arch.
const objects: { word: string; meaning: string; zone: string; mask: Mask }[] = [
  { word: "sink", meaning: "水槽", zone: "washing-area", mask: [
    [[41, 470], [232, 434], [342, 443], [254, 465], [170, 484], [143, 482], [52, 474]],
  ] },
  { word: "faucet", meaning: "水龙头", zone: "washing-area", mask: [
    [[131, 447], [134, 404], [137, 401], [137, 348], [139, 337], [145, 325], [153, 318],
      [162, 314], [171, 313], [181, 316], [190, 322], [197, 333], [201, 347], [206, 368],
      [196, 370], [192, 346], [190, 337], [184, 328], [177, 323], [169, 321], [161, 322],
      [153, 327], [147, 337], [145, 347], [145, 402], [148, 405], [150, 447]],
    [[146, 416], [159, 413], [160, 394], [164, 394], [165, 418], [160, 423], [146, 427]],
  ] },
  { word: "refrigerator", meaning: "冰箱", zone: "coffee-nook", mask: [
    [[1227, 107], [1393, 100], [1393, 520], [1343, 514], [1300, 434], [1226, 424]],
  ] },
];

function onObject(x: number, y: number, polygons: Mask) {
  return polygons.some((polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[i], [bx, by] = polygon[j];
      if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
    }
    return inside;
  });
}

type Painted = {
  word: string; interactive: boolean; opacity: number;
  centerX: number; centerY: number; anchorX: number; anchorY: number;
};

async function drawnWord(page: Page, word: string) {
  return page.locator(".viewer-shell:not([data-phase]) .label-canvas").evaluate((node, text) => {
    const canvas = node as HTMLCanvasElement & { paintedLabels?: Painted[] };
    const item = canvas.paintedLabels?.find((label) => label.word === text && label.interactive && label.opacity >= 0.52);
    const image = canvas.closest(".world-viewport")?.querySelector<HTMLImageElement>(".scene-art");
    if (!item || !image?.naturalWidth) return null;
    const frame = canvas.getBoundingClientRect();
    const photo = image.getBoundingClientRect();
    const x = frame.left + item.anchorX, y = frame.top + item.anchorY;
    return {
      clickX: frame.left + item.centerX, clickY: frame.top + item.centerY,
      anchorX: x, anchorY: y,
      anchorVisible: x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom,
      photoX: (x - photo.left) * image.naturalWidth / photo.width,
      photoY: (y - photo.top) * image.naturalHeight / photo.height,
    };
  }, word);
}

function observeHingeFocus(button: HTMLElement | SVGElement) {
  const viewer = document.querySelector(".viewer-shell:not([data-phase])")!;
  const photo = viewer.querySelector<HTMLImageElement>(".scene-art")!;
  const canvas = viewer.querySelector<HTMLCanvasElement>(".label-canvas")!;
  const crop = document.createElement("canvas");
  crop.width = crop.height = 11;
  const context = crop.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;
  type Sample = { point: Point; color: number[]; ring: number };
  type Frame = { ms: number; photoWidth: number; samples: Sample[] };
  const frames: Frame[] = [];
  const recent: Point[] = [];
  const done = new Promise<Frame[]>((resolve) => {
    button.addEventListener("click", () => {
      const start = performance.now();
      function sample() {
        const image = photo.getBoundingClientRect(), bounds = canvas.getBoundingClientRect();
        const point: Point = [image.x + 1246 * image.width / photo.naturalWidth,
          image.y + 556 * image.height / photo.naturalHeight];
        const frame: Frame = { ms: performance.now() - start, photoWidth: image.width, samples: [] };
        if (canvas.width > 1 && canvas.height > 1 && canvas.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          const sx = canvas.width / bounds.width, sy = canvas.height / bounds.height;
          for (const [x, y] of [point, ...recent]) {
            context.clearRect(0, 0, 11, 11);
            context.drawImage(canvas, (x - bounds.x - 5.5) * sx, (y - bounds.y - 5.5) * sy,
              11 * sx, 11 * sy, 0, 0, 11, 11);
            const pixels = context.getImageData(0, 0, 11, 11).data;
            const rgba = (dx: number, dy: number) => {
              const offset = ((5 + dy) * 11 + 5 + dx) * 4;
              return Array.from(pixels.slice(offset, offset + 4));
            };
            // The leader ends in a colored disc with a light rim four CSS pixels out.
            const ring = [[-4, 0], [4, 0], [0, -4], [0, 4]]
              .filter(([dx, dy]) => rgba(dx, dy).every(value => value > 205)).length;
            frame.samples.push({ point: [x, y], color: rgba(0, 0), ring });
          }
        }
        frames.push(frame);
        recent.unshift(point);
        if (recent.length > 3) recent.pop();
        if (frame.ms < 550) requestAnimationFrame(sample);
        else resolve(frames);
      }
      sample();
    }, { once: true, capture: true });
  });
  return { done };
}

function misplacedHingePins(frames: Awaited<ReturnType<typeof observeHingeFocus>["done"]>) {
  const last = frames[frames.length - 1];
  const steady = last.samples[0];
  if (!steady) return { steadyPin: false, movingPinFrames: 0, misplaced: [] };
  const isPin = (sample: typeof steady) => sample.ring >= 2 && sample.color[3] >= 220
    && sample.color.slice(0, 3).every((value, i) => Math.abs(value - steady.color[i]) <= 10);
  const misplaced = [];
  let movingPinFrames = 0;
  let previousWidth = frames[0].photoWidth;
  for (const { ms, photoWidth, samples } of frames) {
    const [current, ...earlier] = samples;
    if (photoWidth > previousWidth + 1 && photoWidth < last.photoWidth - 1 && current && isPin(current)) {
      movingPinFrames++;
    }
    previousWidth = photoWidth;
    if (!current || isPin(current)) continue;
    // Look for the same ring at a former photo position, far enough away
    // that the two discs cannot cover the same photographed hinge.
    const stale = earlier.find(sample => Math.hypot(sample.point[0] - current.point[0],
      sample.point[1] - current.point[1]) > 8 && isPin(sample));
    if (stale) misplaced.push({ ms, photographedHinge: current.point, paintedDot: stale.point });
  }
  return { steadyPin: isPin(steady) && steady.color.slice(0, 3).some(value => value < 195), movingPinFrames, misplaced };
}

test("kitchen object anchor stays on each photographed object from home entry through card selection and apartment return", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const minimap = page.getByTestId("scene-minimap");
  const toggle = page.getByTestId("scene-minimap-toggle");
  const art = page.locator(".viewer-shell:not([data-phase]) .scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const original = "/scenes/kitchen-premium-v3.jpg";
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === original && r.ok()),
    (async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(app).toHaveAttribute("data-scene-id", "world-map");
      for (const id of ["apartment", "kitchen"]) {
        const layer = page.locator(".viewer-shell:not([data-phase])").getByTestId("scene-interaction-layer");
        await expect(layer).toHaveAttribute("data-positioned", "true");
        await activate(layer.locator(`[data-testid="scene-hotspot"][data-target-scene="${id}"]`));
        await expect(app).toHaveAttribute("data-scene-id", id);
        await expect(app).toHaveAttribute("data-transition-state", "idle");
      }
    })(),
  ]);
  expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(
    "7623db6c6b87f6f386f6201d5a913de9f31eb016f0894b0a33eec52dc94a7f2e",
  );
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => [
    img.currentSrc && new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight,
  ])).toEqual([original, 1600, 900]);
  await expect(page.locator(".viewer-shell:not([data-phase])")).toHaveAttribute("data-interaction-locked", "false");
  const fittedWidth = await art.evaluate((element) => element.getBoundingClientRect().width);

  let zone = "";
  for (const target of objects) {
    await test.step(target.word, async () => {
      if (zone !== target.zone) {
        if (zone) await activate(toggle);
        const region = minimap.locator(`[data-testid="scene-minimap-zone"][data-zone-id="${target.zone}"]`);
        await activate(region);
        await expect(region).toHaveAttribute("aria-current", "location");
        await activate(toggle);
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect.poll(() => art.evaluate((element) => element.getBoundingClientRect().width))
          .toBeGreaterThan(fittedWidth * 1.05);
        zone = target.zone;
      }
      await (await art.elementHandle()).waitForElementState("stable");
      await expect.poll(() => drawnWord(page, target.word), { message: `${target.word} has a readable on-image label` })
        .toMatchObject({ anchorVisible: true });
      const point = (await drawnWord(page, target.word))!;
      await testInfo.attach(`${target.word}-geometry`, { body: JSON.stringify(point), contentType: "application/json" });
      await testInfo.attach(`${target.word}-view`, { body: await page.screenshot(), contentType: "image/png" });
      expect.soft(onObject(point.photoX, point.photoY, target.mask),
        `kitchen object anchor: ${target.word} at (${point.photoX.toFixed(1)}, ${point.photoY.toFixed(1)})`).toBe(true);
      if (isMobile) await page.touchscreen.tap(point.clickX, point.clickY);
      else await page.mouse.click(point.clickX, point.clickY);
      const card = page.getByRole("complementary", { name: `${target.word} word details` });
      await expect(card).toBeVisible();
      await expect(card.locator("strong")).toHaveText(target.word);
      await expect(card.locator("p").first()).toHaveText(target.meaning);
      await expect(app).toHaveAttribute("data-scene-id", "kitchen");
      if (target.word === "refrigerator") {
        // Let a mistakenly committed portal finish its handoff while the
        // reader leaves the card open. Checking only its first paint misses it.
        await page.waitForTimeout(800);
        await expect(app, "reading the refrigerator card must keep the kitchen open")
          .toHaveAttribute("data-scene-id", "kitchen", { timeout: 1000 });
        await expect(card).toBeVisible();
        await testInfo.attach("refrigerator-card", { body: await page.screenshot(), contentType: "image/png" });
      }
      await activate(card.getByRole("button", { name: "关闭单词卡" }));
      await expect(card).toBeHidden();
      await expect(app).toHaveAttribute("data-scene-id", "kitchen");
      if (target.word === "faucet") {
        const before = await art.evaluate((image) => image.getBoundingClientRect().width);
        await activate(page.getByRole("button", { name: "Zoom in", exact: true }));
        await expect.poll(() => art.evaluate((image) => image.getBoundingClientRect().width))
          .toBeGreaterThan(before * 1.2);
        await (await art.elementHandle()).waitForElementState("stable");
        const faucetVisible = await art.evaluate((node, anchor) => {
          const image = node as HTMLImageElement;
          const photo = image.getBoundingClientRect();
          const viewport = image.closest(".world-viewport")!.getBoundingClientRect();
          const x = photo.left + anchor.photoX * photo.width / image.naturalWidth;
          const y = photo.top + anchor.photoY * photo.height / image.naturalHeight;
          return x >= viewport.left && x < viewport.right && y >= viewport.top && y < viewport.bottom;
        }, point);
        expect(faucetVisible, "the magnified faucet stays in view").toBe(true);
        await expect(app).toHaveAttribute("data-scene-id", "kitchen");
      }
    });
  }
  if (isMobile) {
    await test.step("tap the coffee machine dot, then enter using its arrow", async () => {
      const entry = page.locator('.viewer-shell:not([data-phase]) [data-testid="scene-hotspot"][data-target-scene="coffee-machine"]');
      const dot = await drawnWord(page, "coffee machine");
      expect(dot?.anchorVisible, "the coffee machine anchor is inside the Coffee nook viewport").toBe(true);
      await expect(entry).toBeInViewport();
      await testInfo.attach("coffee-machine-dot-and-entry", {
        body: JSON.stringify({ dot, entry: await entry.boundingBox() }), contentType: "application/json",
      });
      await testInfo.attach("coffee-machine-before-tap", { body: await page.screenshot(), contentType: "image/png" });
      await page.touchscreen.tap(dot!.anchorX, dot!.anchorY);
      const card = page.getByRole("complementary", { name: "coffee machine word details", exact: true });
      const child = page.locator('[data-testid="world-app"][data-scene-id="coffee-machine"]');
      await page.getByRole("complementary", { name: /word details/ }).or(child).first().waitFor();
      await testInfo.attach("coffee-machine-dot-result", { body: await page.screenshot(), contentType: "image/png" });
      const state = await app.evaluate((root) => {
        const word = root.querySelector<HTMLElement>('aside[aria-label$="word details"] strong');
        return {
          scene: root.getAttribute("data-scene-id"),
          word: word?.checkVisibility({ visibilityProperty: true, opacityProperty: true }) ? word.innerText.trim() : null,
        };
      });
      await testInfo.attach("coffee-machine-tap-state", { body: JSON.stringify(state), contentType: "application/json" });
      expect(state.scene, "tapping the coffee machine word dot must keep the kitchen open").toBe("kitchen");
      await expect(card).toBeVisible();
      await expect(card.locator("p").first()).toHaveText("咖啡机");
      await activate(card.getByRole("button", { name: "关闭单词卡" }));
      await activate(entry);
      await expect(app).toHaveAttribute("data-scene-id", "coffee-machine");
      await expect(app).toHaveAttribute("data-transition-state", "idle");
      await testInfo.attach("coffee-machine-entry-result", { body: await page.screenshot(), contentType: "image/png" });
      await activate(page.getByRole("button", { name: /返回上一层/ }));
      await expect(app).toHaveAttribute("data-scene-id", "kitchen");
      await expect(app).toHaveAttribute("data-transition-state", "idle");
    });
  }
  const surface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  const outward = page.getByRole("button", { name: "Zoom out", exact: true });
  await activate(page.getByRole("button", { name: "Fit scene", exact: true }));
  await expect(surface).toHaveAttribute("data-scene-scale", "1.000");
  await activate(outward);
  await expect(surface).toHaveAttribute("data-scene-scale", "0.740");
  await expect(app).toHaveAttribute("data-scene-id", "kitchen");
  // The overview and the exit must be two independent gestures.
  await page.waitForTimeout(240);
  await activate(outward);
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(art).toHaveAttribute("src", "/scenes/apartment-bright-v2.jpg");
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test("apartment search distinguishes the photographed shower hinge from the unpictured remote control", async ({ page, isMobile }, testInfo) => {
  const activate = (button: Locator) => isMobile ? button.tap() : button.click();
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  await page.goto("/");
  const entrance = viewer.getByTestId("scene-interaction-layer");
  await expect(entrance).toHaveAttribute("data-positioned", "true");
  await activate(entrance.locator('[data-testid="scene-hotspot"][data-target-scene="apartment"]'));
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  const finder = page.getByTestId("scene-word-index");
  const finderButton = page.getByTestId("scene-word-index-toggle");
  await activate(finderButton);
  await expect(finder.getByTestId("scene-word-index-summary")).toContainText("173 个词");
  await finder.getByRole("searchbox").fill("遥控器");
  const remote = finder.getByTestId("scene-word-index-result");
  await expect(remote).toHaveText(/remote control/);
  expect(await remote.getAttribute("data-label-id"), "the remote control must be listed without a photo pin").toBeNull();
  await activate(remote);
  const remoteCard = page.getByRole("complementary", { name: "remote control word details" });
  await expect(remoteCard.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await expect(viewer.locator(".scene-surface")).toHaveAttribute("data-scene-scale", "1.000");
  await activate(remoteCard.getByRole("button", { name: "关闭单词卡" }));

  await activate(finderButton);
  await finder.getByRole("searchbox").fill("door hinge");
  const result = finder.getByRole("button", { name: "door hinge，门铰链", exact: true });
  const observation = isMobile ? await result.evaluateHandle(observeHingeFocus) : null;
  await activate(result);
  const hingeCard = page.getByRole("complementary", { name: "door hinge word details" });
  await expect(hingeCard.getByText("门铰链", { exact: true })).toBeVisible();
  if (observation) {
    const frames = await observation.evaluate(record => record.done);
    await observation.dispose();
    const { steadyPin, movingPinFrames, misplaced } = misplacedHingePins(frames);
    await testInfo.attach("apartment-shower-hinge-focus-frames", {
      body: JSON.stringify({ frames, movingPinFrames, misplaced }), contentType: "application/json",
    });
    expect(steadyPin, "the selected hinge has a painted dot and rim after focus settles").toBe(true);
    expect(misplaced, "during mobile focus the painted dot must follow the photographed hinge").toEqual([]);
    expect(movingPinFrames, "at least two moving camera frames must show the selected hinge pin").toBeGreaterThanOrEqual(2);
  }
  // The black upper hinge occupies this small patch on the shower glass.
  await expect.poll(async () => {
    const point = await drawnWord(page, "door hinge");
    return point?.anchorVisible && point.photoX >= 1243 && point.photoX <= 1249
      && point.photoY >= 550 && point.photoY <= 561;
  }).toBe(true);
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await testInfo.attach("apartment-shower-hinge", { body: await page.screenshot(), contentType: "image/png" });
});

test("apartment furniture and its parts open separate word cards on the photograph", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(100_000);
  const photo = page.waitForResponse(response =>
    response.ok() && new URL(response.url()).pathname === "/scenes/apartment-bright-v2.jpg",
  );
  await page.goto("/");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const entrance = viewer.locator('[data-testid="scene-hotspot"][data-target-scene="apartment"]');
  if (isMobile) await entrance.tap();
  else await entrance.click();
  await expect(page.getByTestId("world-app")).toHaveAttribute("data-scene-id", "apartment");
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  const hash = createHash("sha256").update(await (await photo).body()).digest("hex");
  expect(hash).toBe("90b90990ed24ec4324aa0b9345a0db650baf1a8bd03267ab6f53d5984d8c5ff2");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const image = viewer.locator("img.scene-art");
  const bedCard = page.getByRole("complementary", { name: "bed word details", exact: true });
  await activate(page.getByTestId("scene-word-index-toggle"));
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill("bed");
  await activate(index.locator('[data-testid="scene-word-index-result"][data-word="bed"]'));
  await expect(bedCard).toBeVisible();
  await (await image.elementHandle()).waitForElementState("stable");
  await activate(bedCard.getByRole("button", { name: "关闭单词卡" }));
  await expect(bedCard).toBeHidden();
  await (await image.elementHandle()).waitForElementState("stable");
  await expect.poll(() => drawnWord(page, "bed")).toMatchObject({ anchorVisible: true });
  const bed = (await drawnWord(page, "bed"))!;
  if (isMobile) await page.touchscreen.tap(bed.anchorX, bed.anchorY);
  else await page.mouse.click(bed.anchorX, bed.anchorY);
  const anyCard = page.getByRole("complementary", { name: / word details$/ });
  await anyCard.or(page.locator('[data-testid="world-app"]:not([data-scene-id="apartment"])')).first().waitFor();
  await testInfo.attach("apartment-bed-dot-result", { body: await page.screenshot(), contentType: "image/png" });
  expect({
    scene: await page.getByTestId("world-app").getAttribute("data-scene-id"),
    word: await anyCard.count() ? await anyCard.locator("strong").first().innerText() : null,
  }, "reading the bed dot after closing its card must open bed in the apartment").toEqual({ scene: "apartment", word: "bed" });
  await activate(bedCard.getByRole("button", { name: "关闭单词卡" }));
  const meaning = page.getByTestId("meaning-toggle");
  await activate(meaning);
  await expect(meaning).toHaveAttribute("aria-pressed", "true");

  // Interior patches traced on the cutaway: the exposed timber footboard,
  // white duvet, wardrobe plinth and door, and three stainless-steel surfaces.
  await checkPaintedWords(page, isMobile, testInfo, [
    { word: "bed", meaning: "床", openFromDot: true,
      assertion: "the bed dot must land on the exposed timber footboard",
      outlines: [[[182,791],[414,791],[425,806],[180,808]]] },
    { word: "duvet", meaning: "被子", openFromDot: true,
      outlines: [[[215,739],[397,739],[410,783],[188,783]]] },
    { word: "wardrobe", meaning: "衣柜", openFromDot: true,
      outlines: [[[527,758],[596,758],[596,769],[527,769]]] },
    { word: "wardrobe door", meaning: "衣柜门", openFromDot: true,
      outlines: [[[634,545],[680,545],[680,624],[634,624]]] },
    { word: "wardrobe handle", meaning: "衣柜把手", openFromDot: true,
      outlines: [[[579,632],[584,632],[584,663],[579,663]]] },
    { word: "refrigerator", meaning: "冰箱", openFromDot: true,
      outlines: [[[943,357],[1047,357],[1047,424],[943,424]]] },
    { word: "refrigerator door", meaning: "冰箱门", openFromDot: true,
      outlines: [[[1011,194],[1048,194],[1048,334],[1011,334]]] },
    { word: "refrigerator handle", meaning: "冰箱把手", openFromDot: true,
      outlines: [[[988,214],[995,214],[995,318],[988,318]]] },
  ], hash);
  await expect(page.getByTestId("world-app")).toHaveAttribute("data-scene-id", "apartment");
});
