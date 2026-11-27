import { expect, test } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { projectPhoto } from "./photo-journey";

test("the transit hub journey reads bus seat upholstery and a platform tactile tile and keeps the emergency hammer in the index", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "The reproduced journey uses the 1440 × 900 desktop overview.");
  const app = page.getByTestId("world-app");
  const map = page.getByTestId("scene-minimap");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  const card = page.getByRole("complementary", { name: / word details$/ });
  const waitForScene = async (id: string) => {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  };
  const openMap = async () => {
    const expand = map.getByRole("button", { name: "展开小地图", exact: true });
    if (await expand.isVisible()) await expand.click();
  };
  const visit = async (id: string, title: string) => {
    await openMap();
    await map.getByRole("button", { name: `进入 ${title}`, exact: true }).click();
    await waitForScene(id);
  };
  const attach = async (name: string, result: object) => {
    await testInfo.attach(`${name}-result`, { body: JSON.stringify(result), contentType: "application/json" });
    await testInfo.attach(name, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  };
  const readPhoto = async (scene: string, photo: string, x: number, y: number, word: string, meaning: string) => {
    await expect(image).toHaveAttribute("src", photo);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
      .toEqual([1600, 900]);
    const collapse = map.getByRole("button", { name: "收起小地图", exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await (await image.elementHandle()).waitForElementState("stable");
    const point = await projectPhoto(image, x, y);
    expect(point.visible, `the photographed ${word} is in view`).toBe(true);
    await page.mouse.click(point.x, point.y);
    const reading = async () => {
      const visible = await card.isVisible();
      return {
        scene: await app.getAttribute("data-scene-id"),
        word: visible ? await card.locator("strong").innerText() : null,
        meaning: visible ? await card.locator("p").first().innerText() : null,
      };
    };
    await expect.soft.poll(reading, { timeout: 2500, message: `clicking the photographed ${word} opens its word card` })
      .toEqual({ scene, word, meaning });
    await attach(word.replaceAll(" ", "-"), { photo, x, y, point, ...await reading() });
    if (await card.isVisible()) {
      await card.getByRole("button", { name: "关闭单词卡" }).click();
      await expect(card).toBeHidden();
    }
  };

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForScene("world-map");
  await visit("city-street", "City street");
  await visit("transit-hub", "Transit hub");
  await visit("electric-bus", "Electric bus");
  await readPhoto("electric-bus", "/scenes/electric-bus-premium-v2.jpg", 777, 465, "seat upholstery", "座椅面料");

  await (await image.elementHandle()).waitForElementState("stable");
  const before = await surface.evaluate(el => getComputedStyle(el).transform);
  await page.getByTestId("scene-word-index-toggle").click();
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill("emergency hammer");
  const result = index.getByRole("button").filter({ has: page.getByText("emergency hammer", { exact: true }) });
  const indexName = await result.getAttribute("aria-label");
  await result.click();
  const hammer = page.getByRole("complementary", { name: "emergency hammer word details", exact: true });
  await expect(hammer.getByText("安全锤", { exact: true })).toBeVisible();
  await (await image.elementHandle()).waitForElementState("stable");
  const details = {
    indexName,
    related: await hammer.getByText("相关词 · 图中未标注", { exact: true }).isVisible(),
    paintedMarkers: await paintedWordCount(page, "emergency hammer"),
    scene: await app.getAttribute("data-scene-id"),
    after: await surface.evaluate(el => getComputedStyle(el).transform),
  };
  await attach("emergency-hammer-index", { before, ...details });
  expect.soft(details, "the emergency hammer is index-only and preserves the bus framing").toEqual({
    indexName: "emergency hammer，安全锤，图中未标注", related: true, paintedMarkers: 0, scene: "electric-bus", after: before,
  });
  await hammer.getByRole("button", { name: "关闭单词卡" }).click();
  await expect(hammer).toBeHidden();

  await openMap();
  await map.getByTestId("scene-minimap-path").getByRole("button", { name: "Transit hub", exact: true }).click();
  await waitForScene("transit-hub");
  await visit("railway-platform", "Railway platform");
  await readPhoto("railway-platform", "/scenes/railway-platform-premium-v2.jpg", 743, 839, "tactile tile", "盲道砖");
});
