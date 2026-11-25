import { expect, test, type Locator } from "@playwright/test";

interface PaintedWord {
  word: string;
  opacity: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

async function readRoomFrame(viewer: Locator) {
  return viewer.evaluate(async (room) => {
    const image = room.querySelector<HTMLImageElement>("img.scene-art")!;
    const canvas = room.querySelector<HTMLCanvasElement & {
      paintedLabels?: PaintedWord[];
    }>(".label-canvas")!;
    // IntersectionObserver includes clipping by every ancestor, even if the
    // room renderer occupies just a narrow strip of an otherwise empty page.
    const clipped = await new Promise<IntersectionObserverEntry>((resolve) => {
      const observer = new IntersectionObserver(([entry]) => {
        observer.disconnect();
        resolve(entry);
      });
      observer.observe(image);
    });
    const screen = window.visualViewport;
    const screenLeft = screen?.offsetLeft ?? 0;
    const screenTop = screen?.offsetTop ?? 0;
    const screenWidth = screen?.width ?? window.innerWidth;
    const screenRight = screenLeft + screenWidth;
    const screenBottom = screenTop + (screen?.height ?? window.innerHeight);
    const explorationTop = Math.max(screenTop, document.querySelector("header")!.getBoundingClientRect().bottom);
    const explorationArea = screenWidth * (screenBottom - explorationTop);

    const box = clipped.boundingClientRect;
    const style = getComputedStyle(image);
    let width = box.width;
    let height = box.height;
    if (style.objectFit === "cover" || style.objectFit === "contain" || style.objectFit === "scale-down") {
      const fitX = width / image.naturalWidth;
      const fitY = height / image.naturalHeight;
      const noUpscale = style.objectFit === "scale-down" ? box.width / image.clientWidth : Infinity;
      const fit = style.objectFit === "cover" ? Math.max(fitX, fitY) : Math.min(fitX, fitY, noUpscale);
      width = image.naturalWidth * fit;
      height = image.naturalHeight * fit;
    }
    // A contained image can have empty space inside its box. A covered one
    // can extend beyond its box even when that element fits on screen.
    const [x, y] = style.objectPosition.split(" ");
    const offset = (position: string, space: number) => position.endsWith("%")
      ? space * parseFloat(position) / 100 : parseFloat(position);
    const contentLeft = box.left + offset(x, box.width - width);
    const contentTop = box.top + offset(y, box.height - height);
    const clip = clipped.intersectionRect;
    const left = Math.max(clip.left, screenLeft, contentLeft);
    const right = Math.min(clip.right, screenRight, contentLeft + width);
    const top = Math.max(clip.top, explorationTop, contentTop);
    const bottom = Math.min(clip.bottom, screenBottom, contentTop + height);
    const photoArea = Math.max(0, right - left) * Math.max(0, bottom - top);

    const frame = canvas.getBoundingClientRect();
    const words = (canvas.paintedLabels ?? []).filter((label) => label.opacity > 0.025);
    const centersOutside: string[] = [];
    const edgesOutside: string[] = [];
    // The canvas snaps sprites to device pixels when drawing them.
    const tolerance = 1 / window.devicePixelRatio;
    for (const word of words) {
      const cx = frame.left + word.centerX;
      const cy = frame.top + word.centerY;
      if (cx < left || cx > right || cy < top || cy > bottom) centersOutside.push(word.word);
      if (cx - word.width / 2 < left - tolerance || cx + word.width / 2 > right + tolerance
        || cy - word.height / 2 < top - tolerance || cy + word.height / 2 > bottom + tolerance) {
        edgesOutside.push(word.word);
      }
    }
    return {
      photo: { left, top, right, bottom },
      exploration: { left: screenLeft, top: explorationTop, right: screenRight, bottom: screenBottom },
      coverage: photoArea / explorationArea,
      maxCroppedEdge: Math.max(left - contentLeft, top - contentTop,
        contentLeft + width - right, contentTop + height - bottom),
      aspectRatioError: Math.abs((width / height) / (image.naturalWidth / image.naturalHeight) - 1),
      paintedCount: words.length,
      centersOutside,
      edgesOutside,
    };
  });
}

test("portrait apartment entrances lead into a readable kitchen and zoom back to the apartment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "This journey uses the portrait phone and touch controls.");
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");

  async function expectRoom(id: string) {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect(viewer.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
      .toBe(true);
  }

  async function screenshot(name: string) {
    await testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectRoom("world-map");
  await viewer.getByRole("button", { name: "进入 Apartment", exact: true }).tap();
  await expectRoom("apartment");
  const apartmentEntry = await readRoomFrame(viewer);
  await screenshot("portrait-apartment-entrances");
  await viewer.getByRole("button", { name: "进入 Kitchen", exact: true }).tap();
  await expectRoom("kitchen");

  const geometry = await readRoomFrame(viewer);
  await screenshot("portrait-kitchen-entry");
  await testInfo.attach("portrait-kitchen-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
  expect(geometry.coverage, "portrait kitchen photograph covers at least half of the visible exploration area")
    .toBeGreaterThanOrEqual(0.5);
  expect(geometry.exploration.bottom - geometry.exploration.top)
    .toBeGreaterThan(geometry.exploration.right - geometry.exploration.left);
  expect(geometry.aspectRatioError, "the kitchen photo keeps its original proportions").toBeLessThan(0.01);
  expect(geometry.paintedCount, "the kitchen photo has visible vocabulary").toBeGreaterThan(0);
  expect(geometry.centersOutside, "word pill centers stay on the visible kitchen photo").toEqual([]);
  expect(geometry.edgesOutside, "word pill edges stay on the visible kitchen photo").toEqual([]);
  expect(apartmentEntry.maxCroppedEdge, "the apartment opens with all four rooms in view").toBeLessThanOrEqual(1);

  const screen = page.viewportSize()!;
  await page.setViewportSize({ width: screen.width, height: screen.height - 40 });
  await expect.poll(async () => (await readRoomFrame(viewer)).coverage,
    { message: "a change in phone height preserves the room's entry framing" }).toBeCloseTo(geometry.coverage, 2);

  const photoWidth = () => image.evaluate((node) => node.getBoundingClientRect().width);
  const entryWidth = await photoWidth();
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).tap();
  await expect.poll(photoWidth).toBeGreaterThan(entryWidth * 1.2);
  await (await image.elementHandle()).waitForElementState("stable");
  const zoomedWidth = await photoWidth();
  await page.setViewportSize(screen);
  await expect.poll(photoWidth, { message: "phone height changes keep the manual zoom" }).toBeCloseTo(zoomedWidth, 0);

  await viewer.getByRole("button", { name: "Fit scene", exact: true }).tap();
  await expect(image).toBeVisible();
  await expect.poll(async () => (await readRoomFrame(viewer)).maxCroppedEdge,
    { message: "Fit scene reveals all four edges of the kitchen photograph" }).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: screen.width, height: screen.height - 40 });
  await expect.poll(async () => (await readRoomFrame(viewer)).maxCroppedEdge,
    { message: "a change in phone height preserves the manually fitted kitchen" }).toBeLessThanOrEqual(1);
  const coffeeMachine = viewer.getByRole("button", { name: "进入 Coffee machine", exact: true });
  await expect(coffeeMachine).toBeInViewport();
  await screenshot("portrait-kitchen-fit");
  await coffeeMachine.tap();
  await expectRoom("coffee-machine");
  const back = page.getByRole("button", { name: /返回上一层/ });
  await back.tap();
  await expectRoom("kitchen");

  const outward = viewer.getByRole("button", { name: "Zoom out", exact: true });
  await expect.poll(async () => {
    const id = await app.getAttribute("data-scene-id");
    if (id === "kitchen" && await viewer.getAttribute("data-interaction-locked") === "false") await outward.tap();
    return app.getAttribute("data-scene-id");
  }, { intervals: [400], timeout: 8_000, message: "successive zoom-out taps return to the apartment" }).toBe("apartment");
  await expectRoom("apartment");
  await expect(page.getByRole("heading", { name: "Apartment", exact: true })).toBeVisible();
  await expect.poll(async () => (await readRoomFrame(viewer)).maxCroppedEdge,
    { message: "zooming back restores the entire apartment" }).toBeLessThanOrEqual(1);
  await screenshot("portrait-apartment-return");

  const map = page.getByRole("complementary", { name: "场景小地图" });
  const expand = map.getByRole("button", { name: "展开小地图" });
  if (await expand.isVisible()) await expand.tap();
  for (const room of ["Bedroom", "Bathroom"]) {
    const listed = map.getByRole("button", { name: `进入 ${room}`, exact: true });
    const entrance = await listed.isVisible() ? listed : viewer.getByRole("button", { name: `进入 ${room}`, exact: true });
    await entrance.scrollIntoViewIfNeeded();
    await expect(entrance).toBeInViewport();
    await expect(entrance).toContainText(room);
    await entrance.tap();
    await expectRoom(room.toLowerCase());
    await expect(page.getByRole("heading", { name: room, exact: true })).toBeVisible();
    const frame = await readRoomFrame(viewer);
    expect(frame.coverage, `${room} opens on its photograph`).toBeGreaterThanOrEqual(0.5);
    expect(frame.paintedCount, `${room} opens with readable words`).toBeGreaterThan(0);
    expect(frame.edgesOutside, `${room} word pills stay on the photograph`).toEqual([]);
    await back.tap();
    await expectRoom("apartment");
  }
});
