import { createHash } from "node:crypto";
import { expect, test, type Response } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { projectPhoto } from "./photo-journey";

const scenes = {
  "city-street": {
    title: "City street", photo: "/scenes/city-street-bright-v4.jpg",
    hash: "e280b0047e7bf0dbcf7f1ff392c38d5b88f06e11bb6304f3d998f47f37438fdf",
    x: 361, y: 422, word: "column shaft", meaning: "柱身",
  },
  "transit-hub": {
    title: "Transit hub", photo: "/scenes/transit-hub-premium-v2.jpg",
    hash: "0404f4a4fcfef1cba37b54231530085b708e498b1e21dd94e5585477f68652f9",
    x: 1051, y: 510, word: "escalator side panel", meaning: "扶梯侧板",
  },
} as const;
type SceneId = keyof typeof scenes;

test("the street and transit round trip reads the museum column shaft and silver escalator side panel and keeps the pediment in the word index", async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, "The reproduced journey uses the 1440 × 900 desktop overview.");
  const app = page.getByTestId("world-app");
  const map = page.getByTestId("scene-minimap");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  const anyCard = page.getByRole("complementary", { name: / word details$/ });
  const loadedPhotos = new Map<string, Response>();
  page.on("response", response => {
    const src = new URL(response.url()).pathname;
    if (response.ok() && Object.values(scenes).some(scene => scene.photo === src)) {
      loadedPhotos.set(src, response);
    }
  });

  const settled = async (id: SceneId | "world-map") => {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    if (id !== "world-map") {
      await expect(image).toHaveAttribute("src", scenes[id].photo);
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
        .toEqual([1600, 900]);
    }
    await (await image.elementHandle()).waitForElementState("stable");
  };
  const enter = async (id: SceneId) => {
    const expand = map.getByRole("button", { name: "展开小地图", exact: true });
    if (await expand.isVisible()) await expand.click();
    await map.getByRole("button", { name: `进入 ${scenes[id].title}`, exact: true }).click();
    await settled(id);
  };
  const readObject = async (id: SceneId, visit: string) => {
    const subject = scenes[id];
    const collapse = map.getByRole("button", { name: "收起小地图", exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await (await image.elementHandle()).waitForElementState("stable");
    const point = await projectPhoto(image, subject.x, subject.y);
    expect(point.visible, `${subject.word} is visible in the photograph`).toBe(true);
    await page.mouse.click(point.x, point.y);
    const reading = async () => ({
      scene: await app.getAttribute("data-scene-id"),
      word: await anyCard.isVisible() ? await anyCard.locator("strong").innerText() : null,
      meaning: await anyCard.isVisible() ? await anyCard.locator("p").first().innerText() : null,
    });
    await expect.soft.poll(reading, { timeout: 2500, message: `${visit} reads the photographed ${subject.word}` })
      .toEqual({ scene: id, word: subject.word, meaning: subject.meaning });
    await testInfo.attach(`${visit}-result`, {
      body: JSON.stringify({ photo: subject.photo, x: subject.x, y: subject.y, point, ...await reading() }),
      contentType: "application/json",
    });
    await testInfo.attach(visit, { body: await page.screenshot(), contentType: "image/png" });
    if (await anyCard.isVisible()) {
      await anyCard.getByRole("button", { name: "关闭单词卡" }).click();
      await expect(anyCard).toBeHidden();
    }
  };

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await settled("world-map");
  await enter("city-street");
  await readObject("city-street", "street-arrival");
  await enter("transit-hub");
  await readObject("transit-hub", "transit-arrival");
  await page.getByRole("button", { name: "← 返回上一层", exact: true }).click();
  await settled("city-street");
  await readObject("city-street", "street-return");

  const framing = await surface.evaluate(el => getComputedStyle(el).transform);
  await page.getByTestId("scene-word-index-toggle").click();
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill("museum pediment");
  const result = index.getByRole("button").filter({ has: page.getByText("museum pediment", { exact: true }) });
  await expect.soft(result).toHaveAccessibleName("museum pediment，博物馆山花，图中未标注", { timeout: 2500 });
  await result.click();
  const pediment = page.getByRole("complementary", { name: "museum pediment word details", exact: true });
  await expect(pediment.getByText("博物馆山花", { exact: true })).toBeVisible();
  await expect.soft(pediment.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible({ timeout: 2500 });
  await (await image.elementHandle()).waitForElementState("stable");
  expect.soft(await surface.evaluate(el => getComputedStyle(el).transform), "the related word preserves the street framing").toBe(framing);
  expect.soft(await paintedWordCount(page, "museum pediment"), "the photograph has no museum pediment marker").toBe(0);
  await testInfo.attach("pediment-search-card", { body: await page.screenshot(), contentType: "image/png" });
  await pediment.getByRole("button", { name: "关闭单词卡" }).click();
  await expect(pediment).toBeHidden();
  await enter("transit-hub");
  await readObject("transit-hub", "transit-reentry");

  for (const scene of Object.values(scenes)) {
    const response = loadedPhotos.get(scene.photo);
    expect(response, `the trip loaded ${scene.photo}`).toBeDefined();
    expect(createHash("sha256").update(await response!.body()).digest("hex")).toBe(scene.hash);
  }
});
