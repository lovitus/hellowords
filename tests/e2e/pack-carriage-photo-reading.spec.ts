import { expect, test } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { projectPhoto } from "./photo-journey";

test("the transit journey reads the battery mounting hole and carriage equipment hatch and keeps the lid hinge index-only", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "This regression uses the 1440 × 900 desktop overview.");
  const app = page.getByTestId("world-app");
  const map = page.getByTestId("scene-minimap");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  const card = page.getByRole("complementary", { name: / word details$/ });
  const index = page.getByTestId("scene-word-index");

  const settled = async (id: string) => {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  };
  const navigate = async (button: string, id: string) => {
    const expand = map.getByRole("button", { name: "展开小地图", exact: true });
    if (await expand.isVisible()) await expand.click();
    await map.getByRole("button", { name: button, exact: true }).click();
    await settled(id);
  };
  const back = async (id: string, photo: string) => {
    await page.getByRole("button", { name: "← 返回上一层", exact: true }).click();
    await settled(id);
    await expect(image).toHaveAttribute("src", photo);
  };
  const readCard = async () => {
    const visible = await card.isVisible();
    return {
      scene: await app.getAttribute("data-scene-id"),
      word: visible ? await card.locator("strong").innerText() : null,
      meaning: visible ? await card.locator("p").first().innerText() : null,
    };
  };
  const closeCard = async () => {
    if (await card.isVisible()) {
      await card.getByRole("button", { name: "关闭单词卡" }).click();
      await expect(card).toBeHidden();
    }
  };
  const save = async (name: string, result: object) => {
    await testInfo.attach(`${name}-result`, { body: JSON.stringify(result), contentType: "application/json" });
    await testInfo.attach(name, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  };
  const readObject = async (scene: string, photo: string, x: number, y: number, word: string, meaning: string) => {
    await expect(image).toHaveAttribute("src", photo);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
      .toEqual([1600, 900]);
    const collapse = map.getByRole("button", { name: "收起小地图", exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await (await image.elementHandle()).waitForElementState("stable");
    const point = await projectPhoto(image, x, y);
    if (point.visible) await page.mouse.click(point.x, point.y);
    await expect.soft.poll(async () => ({ visible: point.visible, ...await readCard() }), {
      timeout: 2500, message: `clicking the photographed ${word} opens its word card`,
    }).toEqual({ visible: true, scene, word, meaning });
    await save(word.replaceAll(" ", "-"), { photo, x, y, point, ...await readCard() });
    await closeCard();
  };

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await settled("world-map");
  await navigate("进入 City street", "city-street");
  await navigate("进入 Transit hub", "transit-hub");
  await navigate("进入 Electric bus", "electric-bus");
  await navigate("进入 Battery pack", "battery");
  await readObject("battery", "/scenes/battery-premium-v2.jpg", 816, 797, "mounting hole", "安装孔");

  await (await image.elementHandle()).waitForElementState("stable");
  const before = await surface.evaluate(element => getComputedStyle(element).transform);
  await page.getByTestId("scene-word-index-toggle").click();
  await index.getByRole("searchbox").fill("lid hinge");
  const result = index.getByRole("button").filter({ has: page.getByText("lid hinge", { exact: true }) });
  const indexName = await result.getAttribute("aria-label", { timeout: 2500 }).catch(error => {
    if (error.name === "TimeoutError") return null;
    throw error;
  });
  if (indexName !== null) await result.click();
  await (await image.elementHandle()).waitForElementState("stable");
  const hinge = {
    ...await readCard(),
    indexName,
    related: await card.getByText("相关词 · 图中未标注", { exact: true }).isVisible(),
    paintedMarkers: await paintedWordCount(page, "lid hinge"),
    after: await surface.evaluate(element => getComputedStyle(element).transform),
  };
  await save("lid-hinge-index", { before, ...hinge });
  expect.soft(hinge, "the lid hinge is index-only and preserves the battery pack framing").toEqual({
    scene: "battery", word: "lid hinge", meaning: "上盖铰链", indexName: "lid hinge，上盖铰链，图中未标注",
    related: true, paintedMarkers: 0, after: before,
  });
  await closeCard();
  if (await index.isVisible()) await index.getByTestId("scene-word-index-close").click();

  await back("electric-bus", "/scenes/electric-bus-premium-v2.jpg");
  await navigate("Transit hub", "transit-hub");
  await navigate("进入 Railway platform", "railway-platform");
  await navigate("进入 Train carriage", "train-carriage");
  await readObject("train-carriage", "/scenes/train-carriage-premium-v2.jpg", 1353, 582, "equipment hatch", "设备舱盖");
  await back("railway-platform", "/scenes/railway-platform-premium-v2.jpg");
});
