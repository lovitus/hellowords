import { expect, test, type Locator } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { magnify, openPhotographedRoute, projectPhoto } from "./photo-journey";

const terminalPhoto = "/scenes/airport-terminal-premium-v1.jpg";
const terminalHash = "428e5f9dbcca0f19e8fcedc540a9715362bc55b9b2e51e31d39a4659133f31e1";
const apronPhoto = "/scenes/airport-apron-v1.jpg";
const cartPhoto = "/scenes/airport-baggage-cart-v1.jpg";

test("the airport ground vehicle leads through the apron to the baggage cart and both photographs remain readable on return", async ({ page, isMobile }, testInfo) => {
  if (isMobile) await page.setViewportSize({ width: 385, height: 705 });
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const photo = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  const map = page.getByTestId("scene-minimap");
  const cards = page.getByRole("complementary", { name: / word details$/ });
  const bilingual = page.getByTestId("meaning-toggle");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await photo.elementHandle()).waitForElementState("stable");
  const sceneId = () => app.getAttribute("data-scene-id");
  const photoPath = () => photo.evaluate((el: HTMLImageElement) => new URL(el.currentSrc).pathname);
  const scale = async () => Number(await surface.getAttribute("data-scene-scale"));

  const save = async (name: string, evidence: object) => {
    const result = {
      ...evidence, scene: await sceneId(), photo: await photoPath(), scale: await scale(),
      readable: Number(await viewer.locator(".label-canvas").getAttribute("data-readable-count")),
      cards: await cards.evaluateAll(elements => elements.map(el => ({
        word: el.querySelector("strong")?.textContent, meaning: el.querySelector("p")?.textContent,
      }))),
    };
    await testInfo.attach(`${name}-result`, { body: JSON.stringify(result), contentType: "application/json" });
    await testInfo.attach(name, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  };
  const settle = async (id: string, path: string) => {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect.poll(() => photo.evaluate((el: HTMLImageElement) => [
      el.currentSrc && new URL(el.currentSrc).pathname, el.naturalWidth, el.naturalHeight,
    ])).toEqual([path, 1600, 900]);
    await stable();
  };
  const touchPhoto = async (x: number, y: number) => {
    await stable();
    const point = await projectPhoto(photo, x, y);
    expect(point.visible, `the photographed point (${x}, ${y}) is on screen`).toBe(true);
    const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)
      ?.closest('[data-testid="scene-hotspot"]')?.getAttribute("data-target-scene") ?? null, point);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    return { x, y, point, hitTarget };
  };
  const enter = async (destination: string, path: string, x: number, y: number) => {
    const sourceScene = await sceneId();
    const sourcePhoto = await photoPath();
    const entranceCount = await viewer.locator(`[data-testid="scene-hotspot"][data-target-scene="${destination}"]`).count();
    const touch = await touchPhoto(x, y);
    try {
      expect(entranceCount, `the photograph in ${sourceScene} has an entrance to ${destination}`).toBe(1);
      expect(touch.hitTarget, "the photographed vehicle is the entrance").toBe(destination);
      await settle(destination, path);
    } finally {
      await save(`enter-${destination}`, { sourceScene, sourcePhoto, entranceCount, ...touch });
    }
  };
  const back = async (id: string, path: string) => {
    await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
    await settle(id, path);
  };
  const closeCard = async () => {
    await activate(cards.getByRole("button", { name: "关闭单词卡" }));
    await expect(cards).toBeHidden();
  };
  const readPhoto = async (name: string, word: string, meaning: string, x: number, y: number) => {
    const touch = await touchPhoto(x, y);
    try {
      await expect(cards.locator("strong"), `the photographed ${word} opens its own card`).toHaveText(word);
      await expect(cards.locator("p").first()).toHaveText(meaning);
      await expect(bilingual).toHaveAttribute("aria-pressed", "true");
    } finally {
      await save(name, touch);
    }
    await closeCard();
  };
  const readRelated = async (word: string, meaning: string) => {
    const camera = () => surface.evaluate(el => getComputedStyle(el).transform);
    const cameraBefore = await camera();
    const index = page.getByTestId("scene-word-index");
    await activate(page.getByTestId("scene-word-index-toggle"));
    await index.getByRole("searchbox").fill(word);
    const indexName = `${word}，${meaning}，图中未标注`;
    await activate(index.getByRole("button", { name: indexName, exact: true }));
    await expect(cards.locator("strong")).toHaveText(word);
    await expect(cards.getByText(meaning, { exact: true })).toBeVisible();
    await expect(cards.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
    await stable();
    const cameraAfter = await camera();
    const markerCount = await paintedWordCount(page, word);
    await save("baggage-cart-related-index", { indexName, cameraBefore, cameraAfter, markerCount });
    expect(cameraAfter, "the index card preserves the baggage cart camera position").toBe(cameraBefore);
    expect(markerCount, "the concept has no marker on the photograph").toBe(0);
    await closeCard();
    if (await index.isVisible()) await activate(index.getByTestId("scene-word-index-close"));
  };

  await openPhotographedRoute(page, isMobile, [["airport", "Airport"]], terminalPhoto, terminalHash);
  if (await bilingual.getAttribute("aria-pressed") !== "true") await activate(bilingual);
  await activate(map.getByRole("button", { name: "收起小地图", exact: true }));
  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await enter("airport-apron", apronPhoto, 885, 457);
  await readPhoto("apron-wheel-chock", "wheel chock", "轮挡", 1213, 492);
  await enter("airport-baggage-cart", cartPhoto, 808, 715);
  await readPhoto("baggage-cart-first-object", "duffel bag", "旅行袋", 1155, 475);

  await expect(map).toHaveAttribute("data-terminal", "true");
  const maximumScale = Number(await surface.getAttribute("data-maximum-scale"));
  expect(maximumScale).toBeGreaterThan(await scale());
  const center = await viewer.getByTestId("world-viewport").evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: true };
  });
  const zoomSteps: number[] = [];
  for (let gesture = 0; gesture < 4 && await scale() < maximumScale - 0.021; gesture++) {
    const before = await scale();
    await magnify(page, isMobile, center, 4);
    await expect.poll(scale).toBeGreaterThan(before);
    await stable();
    zoomSteps.push(await scale());
  }
  expect(Math.abs(await scale() - maximumScale), "the baggage cart reaches its zoom limit").toBeLessThan(0.021);
  await magnify(page, isMobile, center, 2);
  await stable();
  const progress = viewer.getByTestId("scene-word-progress");
  await expect(app).toHaveAttribute("data-scene-id", "airport-baggage-cart");
  await expect(progress).toHaveAttribute("data-next-plane", "spatial-terminal");
  await expect(app).toHaveAttribute("data-semantic-transition-state", "idle");
  const dialogs = await page.getByRole("dialog", { name: "一万个词的分层探索世界" }).count();
  await save("baggage-cart-maximum-zoom", { maximumScale, zoomSteps, nextPlane: await progress.getAttribute("data-next-plane"), dialogs });
  expect(dialogs).toBe(0);
  expect(Math.abs(await scale() - maximumScale), "one more inward gesture preserves the maximum zoom").toBeLessThan(0.021);

  await readRelated("baggage allowance", "行李限额");
  await back("airport-apron", apronPhoto);
  await readPhoto("apron-wheel-chock-after-return", "wheel chock", "轮挡", 1213, 492);
  await back("airport", terminalPhoto);
  await readPhoto("terminal-ground-vehicle-after-return", "ground vehicle", "地面车辆", 1029, 479);
});
