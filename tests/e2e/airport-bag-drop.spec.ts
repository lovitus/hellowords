import { createHash } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";

type Point = readonly [number, number];
type Outline = readonly Point[];

// Traced on the original 1600 × 900 photograph. The dark weighing surface
// sits inside the steel base. Each suitcase has its own visible silhouette.
const objects: { word: string; meaning: string; outline: Outline; assertion: string }[] = [
  {
    word: "left baggage scale", meaning: "左侧行李秤",
    outline: [[216, 677], [464, 642], [550, 735], [553, 801], [542, 817], [278, 866], [260, 860], [218, 718]],
    assertion: "left baggage scale leader must end on the photographed floor scale, clear of the cabinet door",
  },
  {
    word: "left scale platform", meaning: "左侧秤台",
    outline: [[245, 705], [469, 669], [531, 732], [277, 776]],
    assertion: "left scale platform leader must end on the dark weighing surface",
  },
  {
    word: "drop conveyor suitcase", meaning: "托运传送带行李箱",
    outline: [[450, 354], [470, 343], [513, 338], [542, 342], [601, 361], [616, 383], [621, 449],
      [618, 469], [602, 475], [495, 482], [485, 477], [485, 464], [498, 461], [497, 447],
      [469, 446], [469, 376]],
    assertion: "drop conveyor suitcase leader must end on the ribbed suitcase on the left belt",
  },
  {
    word: "second conveyor suitcase", meaning: "第二只传送带行李箱",
    outline: [[872, 355], [877, 345], [902, 338], [936, 334], [964, 338], [1039, 360], [1050, 376],
      [1055, 397], [1052, 449], [1047, 458], [1029, 465], [979, 471], [938, 461], [890, 445], [870, 431]],
    assertion: "second conveyor suitcase leader must end on the right suitcase shell",
  },
  {
    word: "right baggage scale", meaning: "右侧行李秤",
    outline: [[1276, 550], [1454, 520], [1556, 550], [1571, 565], [1571, 609], [1561, 618],
      [1400, 648], [1384, 640], [1276, 593]],
    assertion: "right baggage scale leader must end on the weighing unit to the right of the rollers",
  },
];

function containsPoint(outline: Outline, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[j];
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
  }
  return inside;
}

type PaintedLabel = {
  word: string; opacity: number; interactive: boolean;
  anchorX: number; anchorY: number; centerX: number; centerY: number;
};

function paintedPoint(viewer: Locator, word: string) {
  return viewer.evaluate((room, text) => {
    const canvas = room.querySelector<HTMLCanvasElement & { paintedLabels?: PaintedLabel[] }>(".label-canvas")!;
    const label = canvas.paintedLabels?.find((item) => item.word === text && item.interactive && item.opacity >= 0.52);
    if (!label) return null;
    const image = room.querySelector<HTMLImageElement>("img.scene-art")!;
    const photo = image.getBoundingClientRect();
    const frame = canvas.getBoundingClientRect();
    const x = frame.left + label.anchorX, y = frame.top + label.anchorY;
    return {
      photoX: (x - photo.left) * image.naturalWidth / photo.width,
      photoY: (y - photo.top) * image.naturalHeight / photo.height,
      anchorVisible: x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom,
      clickX: frame.left + label.centerX, clickY: frame.top + label.centerY,
    };
  }, word);
}

test("airport bag drop keeps photographed scale, platform and suitcase words on their objects and zooms back to check-in", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90_000);
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const photoWidth = () => image.evaluate((node) => node.getBoundingClientRect().width);
  const minimap = page.getByRole("complementary", { name: "场景小地图" });
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const screenshot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const original = "/scenes/baggage-drop-station-premium-v1.jpg";
  const station = "baggage-drop-station";
  const conveyor = "airport-baggage-conveyor";
  const touch = isMobile ? await page.context().newCDPSession(page) : null;

  async function expectScene(id: string) {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect(viewer.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }

  async function focusFromIndex(word: string, query = word) {
    await activate(page.getByTestId("scene-word-index-toggle"));
    const index = page.getByTestId("scene-word-index");
    await index.getByRole("searchbox").fill(query);
    await activate(index.getByRole("button").filter({ has: page.getByText(word, { exact: true }) }));
    await expect(index).toBeHidden();
    const card = page.getByRole("complementary", { name: `${word} word details`, exact: true });
    await expect(card).toBeVisible();
    await (await image.elementHandle()).waitForElementState("stable");
    return card;
  }

  async function zoomIn() {
    const before = await photoWidth();
    await activate(viewer.getByRole("button", { name: "Zoom in", exact: true }));
    await expect.poll(photoWidth, { message: "zoom in magnifies the baggage-drop photograph" }).toBeGreaterThan(before * 1.1);
    await (await image.elementHandle()).waitForElementState("stable");
    await expectScene(station);
  }

  async function fitScene() {
    await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
    await (await image.elementHandle()).waitForElementState("stable");
  }

  function photoPoint(x: number, y: number) {
    return image.evaluate((img: HTMLImageElement, point) => {
      const photo = img.getBoundingClientRect();
      const frame = img.closest(".world-viewport")!.getBoundingClientRect();
      const screenX = photo.left + point.x * photo.width / img.naturalWidth;
      const screenY = photo.top + point.y * photo.height / img.naturalHeight;
      return { x: screenX, y: screenY, visible: screenX >= frame.left && screenX < frame.right && screenY >= frame.top && screenY < frame.bottom };
    }, { x, y });
  }

  async function magnifyAt(x: number, y: number) {
    const point = await photoPoint(x, y);
    expect(point.visible, `photographed target (${x}, ${y}) is in view`).toBe(true);
    if (!touch) {
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, -260);
      return;
    }
    // Start both fingers on the viewport surface, on opposite sides of the
    // target. A finger starting on the portal's small button is a button tap.
    const fingers = await viewer.evaluate((room, center) => {
      const viewport = room.querySelector(".world-viewport")!;
      for (const radius of [34, 48, 24, 60]) {
        for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
          const dx = radius * Math.cos(angle), dy = radius * Math.sin(angle);
          const startsOnScene = [-1, 1].every((sign) => {
            const element = document.elementFromPoint(center.x + sign * dx, center.y + sign * dy);
            return element && viewport.contains(element) && !element.closest("button");
          });
          if (startsOnScene) return { dx, dy };
        }
      }
      return null;
    }, point);
    expect(fingers, "two fingertips fit around the object on the photograph").not.toBeNull();
    const positions = (factor: number) => [-1, 1].map((sign, id) => ({
      id: id + 1, x: point.x + sign * fingers!.dx * factor, y: point.y + sign * fingers!.dy * factor,
    }));
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: positions(1) });
    for (const factor of [1.12, 1.24, 1.36, 1.48]) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: positions(factor) });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  async function zoomBack(from: string, to: string) {
    await fitScene();
    const outward = viewer.getByRole("button", { name: "Zoom out", exact: true });
    await expect.poll(async () => {
      if (await app.getAttribute("data-scene-id") === from && await viewer.getAttribute("data-interaction-locked") === "false") {
        await activate(outward);
      }
      return app.getAttribute("data-scene-id");
    }, { intervals: [400], timeout: 8_000, message: `zooming out of ${from} returns to ${to}` }).toBe(to);
    await expectScene(to);
  }

  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === original && r.ok()),
    (async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expectScene("world-map");
      for (const [id, title] of [
        ["city-street", "City street"], ["transit-hub", "Transit hub"], ["urban-services", "Urban services"],
        ["airport", "Airport"], ["check-in-counter", "Check-in counter"], [station, "Baggage-drop station"],
      ]) {
        const entrance = minimap.getByRole("button", { name: `进入 ${title}`, exact: true });
        await entrance.scrollIntoViewIfNeeded();
        await expect(entrance).toBeInViewport();
        await activate(entrance);
        await expectScene(id);
      }
    })(),
  ]);
  const sha256 = createHash("sha256").update(await response.body()).digest("hex");
  expect(sha256).toBe("ae99367a4eadff96cac480b88e6dcc41f585b2078615786283116bd8bd117e90");
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => [
    new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight,
  ])).toEqual([original, 1600, 900]);
  await activate(minimap.getByRole("button", { name: "收起小地图" }));
  const fittedPlatforms = {
    left: await photoPoint(381, 726), right: await photoPoint(1400, 565),
  };
  await screenshot("baggage-drop-fit-both-platforms");

  for (const [i, target] of objects.entries()) {
    await test.step(target.word, async () => {
      const card = await focusFromIndex(target.word);
      const close = card.getByRole("button", { name: "关闭单词卡" });
      const name = target.word.replaceAll(" ", "-");

      // Keep both pieces of evidence even on the first failing baseline.
      await expect.poll(() => paintedPoint(viewer, target.word)).toMatchObject({ anchorVisible: true });
      const point = (await paintedPoint(viewer, target.word))!;
      const onObject = (p: typeof point) => containsPoint(target.outline, p.photoX, p.photoY);
      await testInfo.attach(`${name}-geometry`, {
        body: JSON.stringify({ word: target.word, original, sha256, outline: target.outline, ...point, onObject: onObject(point) }),
        contentType: "application/json",
      });
      await screenshot(`${name}-view`);
      expect(onObject(point), target.assertion).toBe(true);
      if (i === 0) {
        expect(fittedPlatforms, "arrival shows both photographed weighing platforms before any camera control").toMatchObject({
          left: { visible: true }, right: { visible: true },
        });
      }

      await activate(close);
      await expect(card).toBeHidden();
      await (await image.elementHandle()).waitForElementState("stable");
      // On a phone the close-up separates nearby labels that share space in
      // the overview. Re-center the chosen object after magnifying the view.
      for (let step = 0; step < 3 && !(await paintedPoint(viewer, target.word))?.anchorVisible; step++) {
        await zoomIn();
        await focusFromIndex(target.word);
        await activate(close);
        await expect(card).toBeHidden();
      }
      await expect.poll(() => paintedPoint(viewer, target.word)).toMatchObject({ anchorVisible: true });
      const pill = (await paintedPoint(viewer, target.word))!;
      expect(onObject(pill), target.assertion).toBe(true);
      if (isMobile) await page.touchscreen.tap(pill.clickX, pill.clickY);
      else await page.mouse.click(pill.clickX, pill.clickY);
      await expect(card).toBeVisible();
      await expect(card.locator("strong")).toHaveText(target.word);
      await expect(card.locator("p").first()).toHaveText(target.meaning);
      await expectScene(station);
      await screenshot(`${name}-painted-card`);
      await activate(close);
      await expect(card).toBeHidden();
    });
  }

  // The right suitcase shell and the silver rollers belong to different
  // objects. Aim the two gestures at those pixels in the same original image.
  await fitScene();
  const surface = viewer.locator(".scene-surface");
  await expect.poll(async () => {
    await expect(app, "inspecting the right suitcase stays at baggage drop").toHaveAttribute("data-scene-id", station, { timeout: 500 });
    await magnifyAt(955, 407);
    return Number(await surface.getAttribute("data-scene-scale"));
  }, { intervals: [400], timeout: 8_000, message: "the right suitcase magnifies past the conveyor entry scale" }).toBeGreaterThan(3.5);
  await (await image.elementHandle()).waitForElementState("stable");
  await expectScene(station);
  expect((await photoPoint(955, 407)).visible, "the same right suitcase stays in the magnified frame").toBe(true);
  await screenshot("right-suitcase-magnified");
  const suitcaseCamera = await surface.evaluate((node) => getComputedStyle(node).transform);
  const related = await focusFromIndex("bag-drop queue belt", "行李托运隔离带");
  await expect(related.getByText("行李托运隔离带", { exact: true })).toBeVisible();
  await expect(surface).toHaveCSS("transform", suitcaseCamera);
  await activate(related.getByRole("button", { name: "关闭单词卡" }));
  await expect(related).toBeHidden();
  await fitScene();
  await expectScene(station);
  await expect.poll(async () => {
    if (await app.getAttribute("data-scene-id") === station && await viewer.getAttribute("data-interaction-locked") === "false") {
      await magnifyAt(1080, 551);
    }
    return app.getAttribute("data-scene-id");
  }, { intervals: [400], timeout: 8_000, message: "magnifying the silver rollers enters the baggage conveyor" }).toBe(conveyor);
  await expectScene(conveyor);
  await expect(image).toHaveAttribute("src", "/scenes/airport-baggage-conveyor-premium-v1.jpg");
  await screenshot("silver-rollers-conveyor-entry");
  await zoomBack(conveyor, station);
  await expect(image).toHaveAttribute("src", original);
  await screenshot("baggage-drop-return");
  await zoomBack(station, "check-in-counter");
  await expect(minimap.getByRole("heading", { name: /^Check-in counter\b/ })).toBeVisible();
  await expect(image).toHaveAttribute("src", "/scenes/check-in-counter-premium-v1.jpg");
  await screenshot("check-in-counter-return");
  await touch?.detach();
});
