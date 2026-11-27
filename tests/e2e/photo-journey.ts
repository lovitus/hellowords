import { createHash } from "node:crypto";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { clickPaintedWord, paintedWordState } from "./canvas-words";

type Outline = [number, number][];
export interface PhotographedWord {
  word: string;
  meaning: string;
  outlines: Outline[];
  assertion?: string;
  openFromDot?: boolean;
}

function contains(outline: Outline, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[j];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
  }
  return inside;
}

type Route = readonly (readonly [id: string, title: string])[];

async function openFromHome(page: Page, isMobile: boolean, stepsAfterUrbanServices: Route) {
  const app = page.getByTestId("world-app");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  const common: Route = [["city-street", "City street"], ["transit-hub", "Transit hub"], ["urban-services", "Urban services"]];
  for (const [id, title] of [...common, ...stepsAfterUrbanServices]) {
    const entrance = page.getByTestId("scene-minimap").getByRole("button", { name: `进入 ${title}`, exact: true });
    await entrance.scrollIntoViewIfNeeded();
    if (isMobile) await entrance.tap();
    else await entrance.click();
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(page.locator(".viewer-shell:not([data-phase])")).toHaveAttribute("data-interaction-locked", "false");
  }
}

export function projectPhoto(image: Locator, x: number, y: number) {
  return image.evaluate((img: HTMLImageElement, point) => {
    const photo = img.getBoundingClientRect(), frame = img.closest(".world-viewport")!.getBoundingClientRect();
    const x = photo.left + point.x * photo.width / img.naturalWidth, y = photo.top + point.y * photo.height / img.naturalHeight;
    return {
      crop: Math.max(0, frame.left - photo.left, photo.right - frame.right, frame.top - photo.top, photo.bottom - frame.bottom),
      x, y, visible: x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom,
    };
  }, { x, y });
}

async function paint(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

type Point = { x: number; y: number };

export async function pinch(page: Page, first: Point, second: Point, factor: number) {
  const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const fingers = (spread: number) => [first, second].map((p, index) => ({
    x: center.x + (p.x - center.x) * spread, y: center.y + (p.y - center.y) * spread, id: index + 1,
  }));
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(1) });
  try {
    for (let step = 1; step <= 12; step++) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(1 + (factor - 1) * step / 12) });
      await paint(page);
    }
  } finally {
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  }
}

async function zoomPhoto(page: Page, isMobile: boolean, point: Point & { visible: boolean }, factor: 0.7 | 2 | 4) {
  expect(point.visible, "the gesture starts on the photographed object").toBe(true);
  if (!isMobile) {
    await page.mouse.move(point.x, point.y);
    const pulses = factor < 1 ? 1 : factor;
    for (let pulse = 0; pulse < pulses; pulse++) {
      await page.mouse.wheel(0, factor < 1 ? 240 : -240);
      await paint(page);
    }
    return;
  }
  const offset = await page.locator(".viewer-shell:not([data-phase]) .world-viewport").evaluate((room, { point, factor }) => {
    const frame = room.getBoundingClientRect();
    return [[32, 0], [0, 32], [23, 23], [-23, 23], [42, 0], [0, 42]].find(([dx, dy]) => [-1, 1].every((side) => {
      const finger = document.elementFromPoint(point.x + side * dx, point.y + side * dy);
      const x = point.x + side * factor * dx, y = point.y + side * factor * dy;
      return finger && room.contains(finger) && !finger.closest("button") && x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom;
    }));
  }, { point, factor });
  expect(offset, "two fingertips can start on the scene and finish in the viewport").toBeDefined();
  const [dx, dy] = offset!;
  await pinch(page, { x: point.x - dx, y: point.y - dy }, { x: point.x + dx, y: point.y + dy }, factor);
}

export function magnify(page: Page, isMobile: boolean, point: Point & { visible: boolean }, factor: 2 | 4) {
  return zoomPhoto(page, isMobile, point, factor);
}

export async function openPhotographedRoute(page: Page, isMobile: boolean, route: Route, asset: string, expectedHash: string) {
  const response = page.waitForResponse((r) => r.ok() && new URL(r.url()).pathname === asset);
  await openFromHome(page, isMobile, route);
  const sha256 = createHash("sha256").update(await (await response).body()).digest("hex");
  expect(sha256).toBe(expectedHash);
  const image = page.locator(".viewer-shell:not([data-phase]) img.scene-art");
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => [img.currentSrc && new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight]))
    .toEqual([asset, 1600, 900]);
  return sha256;
}

export async function checkPaintedWords(page: Page, isMobile: boolean, testInfo: TestInfo, objects: PhotographedWord[], sha256: string) {
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const index = page.getByTestId("scene-word-index");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });

  for (const target of objects) {
    const card = page.getByRole("complementary", { name: `${target.word} word details`, exact: true });
    const close = card.getByRole("button", { name: "关闭单词卡" });
    await activate(page.getByTestId("scene-word-index-toggle"));
    await index.getByRole("searchbox").fill(target.word);
    const result = index.getByRole("button").filter({ has: page.getByText(target.word, { exact: true }) });
    const id = (await result.getAttribute("data-label-id"))!;
    await activate(result);
    await expect(card).toBeVisible();
    await stable();
    const point = () => viewer.evaluate((room, id) => {
      const canvas = room.querySelector<HTMLCanvasElement & { paintedLabels?: Array<{
        id: string; anchorX: number; anchorY: number; centerX: number; centerY: number; width: number; height: number; opacity: number; interactive: boolean;
      }> }>(".label-canvas")!;
      const labels = canvas.paintedLabels ?? [];
      const label = labels.find((item) => item.id === id && item.interactive && item.opacity >= 0.52);
      if (!label) return null;
      const img = room.querySelector<HTMLImageElement>("img.scene-art")!;
      const frame = canvas.getBoundingClientRect(), photo = img.getBoundingClientRect();
      const dotX = frame.left + label.anchorX, dotY = frame.top + label.anchorY;
      const hit = document.elementFromPoint(dotX, dotY);
      const viewport = img.closest(".world-viewport")!;
      const underPill = labels.some(item => item.opacity > 0.025 &&
        Math.abs(label.anchorX - item.centerX) <= item.width / 2 + 1 && Math.abs(label.anchorY - item.centerY) <= item.height / 2 + 1);
      const sharesDot = labels.some(item => item.id !== id && item.opacity > 0.025 &&
        Math.hypot(label.anchorX - item.anchorX, label.anchorY - item.anchorY) < 5);
      return {
        x: (dotX - photo.left) * img.naturalWidth / photo.width,
        y: (dotY - photo.top) * img.naturalHeight / photo.height,
        visible: label.anchorX >= 0 && label.anchorX < frame.width && label.anchorY >= 0 && label.anchorY < frame.height,
        clickX: frame.left + label.centerX, clickY: frame.top + label.centerY,
        dotX, dotY, underPill, sharesDot,
        dotExposed: label.anchorX >= 5 && label.anchorX <= frame.width - 5 && label.anchorY >= 5 && label.anchorY <= frame.height - 5 &&
          !!hit && viewport.contains(hit) && !hit.closest("button, a, input, select, textarea") && !underPill && !sharesDot,
      };
    }, id);
    await expect.poll(point).toMatchObject({ visible: true });
    const anchor = (await point())!;
    const inside = target.outlines.some((outline) => contains(outline, anchor.x, anchor.y));
    const name = target.word.replaceAll(" ", "-");
    await testInfo.attach(`${name}-geometry`, { body: JSON.stringify({ word: target.word, sha256, ...anchor, inside, outlines: target.outlines }), contentType: "application/json" });
    await shot(`${name}-view`);
    const assertion = target.assertion ?? `${target.word} leader must end on the photographed object`;
    expect(inside, assertion).toBe(true);
    await activate(close);
    await expect(card).toBeHidden();
    await stable();
    if (!(await point())) {
      await activate(viewer.getByRole("button", { name: "Zoom in", exact: true }));
      await stable();
    }
    await expect.poll(() => paintedWordState(page, id)).toMatchObject({ interactive: true });
    await expect.poll(point).toMatchObject({ visible: true });
    const pill = (await point())!;
    expect(target.outlines.some((outline) => contains(outline, pill.x, pill.y)), assertion).toBe(true);
    if (isMobile) await page.touchscreen.tap(pill.clickX, pill.clickY);
    else await clickPaintedWord(page, id);
    await expect(card).toBeVisible();
    await expect(card.locator("strong")).toHaveText(target.word);
    await expect(card.locator("p").first()).toHaveText(target.meaning);
    await shot(`${name}-painted-card`);
    await activate(close);
    await expect(card).toBeHidden();
    if (target.openFromDot) {
      await stable();
      if (!(await point())?.dotExposed) {
        await activate(viewer.getByRole("button", { name: "Zoom in", exact: true }));
        await stable();
      }
      await expect.poll(point, { message: `${target.word} has an exposed, distinct anchor dot on the photograph` })
        .toMatchObject({ dotExposed: true });
      const dot = (await point())!;
      await testInfo.attach(`${name}-dot-geometry`, { body: JSON.stringify(dot), contentType: "application/json" });
      expect(target.outlines.some(outline => contains(outline, dot.x, dot.y)), assertion).toBe(true);
      if (isMobile) await page.touchscreen.tap(dot.dotX, dot.dotY);
      else await page.mouse.click(dot.dotX, dot.dotY);
      await expect(card).toBeVisible();
      await expect(card.locator("strong")).toHaveText(target.word);
      await expect(card.locator("p").first()).toHaveText(target.meaning);
      await shot(`${name}-dot-card`);
      await activate(close);
      await expect(card).toBeHidden();
    }
  }
}

export async function zoomBack(page: Page, isMobile: boolean, child: string, parent: string, parentAsset: string, gestureFocus?: Point) {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const readView = () => app.evaluate(root => {
    const active = root.querySelector<HTMLElement>(".viewer-shell:not([data-phase])");
    return {
      scene: root.dataset.sceneId,
      ready: root.dataset.transitionState === "idle" && active?.dataset.interactionLocked === "false",
      scale: Number(active?.querySelector<HTMLElement>(".scene-surface")?.dataset.sceneScale),
    };
  });
  await expect(app).toHaveAttribute("data-scene-id", child);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  const retreat: number[] = [];
  for (let action = 0; action < 16; action++) {
    // Separate outward gestures so reaching the overview can arm the next one.
    if (action > 0) await page.waitForTimeout(400);
    const before = await readView();
    if (before.scene !== child || !before.ready) break;
    retreat.push(before.scale);
    if (gestureFocus) {
      const point = await projectPhoto(viewer.locator("img.scene-art"), gestureFocus.x, gestureFocus.y);
      await zoomPhoto(page, isMobile, point, 0.7);
    } else {
      const control = viewer.getByRole("button", { name: "Zoom out", exact: true });
      if (isMobile) await control.tap();
      else await control.click();
    }
    // At the scale floor, the camera can stay put while the parent opens.
    await expect.poll(async () => {
      const after = await readView();
      return after.scene !== child || !after.ready || after.scale < before.scale;
    }, { message: `zoom out from ${before.scale}× in ${child} reduces the scale or starts the return` }).toBe(true);
  }
  await expect(app, `zooming out of ${child} opens ${parent}`).toHaveAttribute("data-scene-id", parent);
  expect(retreat.some((value) => value < retreat[0] * 0.9 && value > 0.74), "zooming out crosses an intermediate magnification").toBe(true);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  await expect(viewer.locator("img.scene-art")).toHaveAttribute("src", parentAsset);
  return retreat;
}

export async function checkMagnifiedObject(page: Page, isMobile: boolean, testInfo: TestInfo, subject: {
  object: string; x: number; y: number; scene: string; asset: string; destination: string; destinationAsset: string; threshold: number;
}) {
  const { object, x, y, scene, asset, destination, destinationAsset, threshold } = subject;
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const scale = async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"));
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await (await image.elementHandle()).waitForElementState("stable");
  await expect(image).toHaveAttribute("src", asset);
  const point = await projectPhoto(image, x, y);
  await magnify(page, isMobile, point, 4);
  // Save the result of a wrong transition as well as a successful gesture.
  let previous = "";
  await expect.poll(async () => {
    const currentScene = await app.getAttribute("data-scene-id"), zoom = await scale();
    const ready = await app.getAttribute("data-transition-state") === "idle" && (currentScene !== scene || zoom >= threshold);
    const current = `${currentScene}/${zoom}`, settled = ready && current === previous;
    previous = ready ? current : "";
    return settled;
  }, { intervals: [150], message: "the magnified photograph or its destination has settled" }).toBe(true);
  await testInfo.attach(`${object}-gesture`, {
    body: JSON.stringify({ asset, x, y, screen: point, scene: await app.getAttribute("data-scene-id"), scale: await scale() }),
    contentType: "application/json",
  });
  await testInfo.attach(`${object}-end`, { body: await page.screenshot(), contentType: "image/png" });
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(app, `magnifying the photographed ${object} must leave ${destination} open`).toHaveAttribute("data-scene-id", destination);
  await expect(image).toHaveAttribute("src", destination === scene ? asset : destinationAsset);
  if (destination === scene) {
    expect(await scale(), "the ordinary object was inspected past the entry threshold").toBeGreaterThanOrEqual(threshold);
    expect((await projectPhoto(image, x, y)).visible, "the inspected object remains on screen").toBe(true);
  } else {
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1600)).toBe(true);
  }
}
