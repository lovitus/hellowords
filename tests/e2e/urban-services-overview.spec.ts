import { expect, test, type Locator } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { checkPaintedWords, openPhotographedRoute, projectPhoto, type PhotographedWord } from "./photo-journey";

const overviewPhoto = "/scenes/urban-services-overview-premium-v1.jpg";
const overviewHash = "0cc4d2fc02d402b2f5b215711e72d7d93635e889064891bf42477d42e063a19d";
const roof: PhotographedWord = {
  word: "terminal roof", meaning: "航站楼屋顶", openFromDot: true,
  assertion: "the terminal roof dot lands on the photographed silver terminal roof",
  // The curved silver panel above the glass facade, in the 1600 × 900 photograph.
  outlines: [[[686, 342], [721, 322], [765, 311], [808, 311], [852, 317], [900, 335],
    [905, 376], [859, 361], [807, 355], [759, 355], [716, 365], [681, 380]]],
};

test("urban services reads the photographed terminal roof and returns from all three destinations", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const map = page.getByTestId("scene-minimap");
  const index = page.getByTestId("scene-word-index");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const sha256 = await openPhotographedRoute(page, isMobile, [], overviewPhoto, overviewHash);
  await checkPaintedWords(page, isMobile, testInfo, [roof], sha256);

  const roofCard = page.getByRole("complementary", { name: "terminal roof word details", exact: true });
  const anyCard = page.getByRole("complementary", { name: / word details$/ });
  const close = roofCard.getByRole("button", { name: "关闭单词卡" });
  const readRoof = async (attachment: string) => {
    await stable();
    const point = await projectPhoto(image, 800, 350);
    expect(point.visible, "the silver roof of the airport terminal is in view").toBe(true);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await anyCard.or(page.locator('[data-testid="world-app"]:not([data-scene-id="urban-services"])')).first().waitFor();
    const reading = {
      scene: await app.getAttribute("data-scene-id"),
      word: await anyCard.isVisible() ? await anyCard.locator("strong").innerText() : null,
    };
    await testInfo.attach(`${attachment}-result`, { body: JSON.stringify({ point, ...reading }), contentType: "application/json" });
    await testInfo.attach(attachment, { body: await page.screenshot(), contentType: "image/png" });
    expect(reading, "tapping the silver roof opens terminal roof in the urban services overview")
      .toEqual({ scene: "urban-services", word: "terminal roof" });
    await expect(roofCard.getByText("航站楼屋顶", { exact: true })).toBeVisible();
    await activate(close);
    await expect(roofCard).toBeHidden();
  };
  await readRoof("silver-roof-reading");

  for (const [id, name, photo] of [
    ["hospital", "Hospital", "/scenes/hospital-atrium-premium-v1.jpg"],
    ["office-building", "Office building", "/scenes/office-atrium-premium-v1.jpg"],
    ["airport", "Airport", "/scenes/airport-terminal-premium-v1.jpg"],
  ] as const) {
    await activate(map.getByRole("button", { name: `进入 ${name}`, exact: true }));
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(image).toHaveAttribute("src", photo);
    await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
    await expect(app).toHaveAttribute("data-scene-id", "urban-services");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect(image).toHaveAttribute("src", overviewPhoto);
  }

  await readRoof("silver-roof-after-airport");

  await stable();
  const surface = viewer.locator(".scene-surface");
  const roofView = await surface.evaluate(el => getComputedStyle(el).transform);
  await activate(page.getByTestId("scene-word-index-toggle"));
  await index.getByRole("searchbox").fill("jet bridge seal");
  await activate(index.getByRole("button", { name: "jet bridge seal，登机桥密封条，图中未标注", exact: true }));
  const sealCard = page.getByRole("complementary", { name: "jet bridge seal word details", exact: true });
  await expect(sealCard.getByText("登机桥密封条", { exact: true })).toBeVisible();
  await expect(sealCard.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await testInfo.attach("urban-services-related-seal", { body: await page.screenshot(), contentType: "image/png" });
  await stable();
  await expect(surface).toHaveCSS("transform", roofView);
  expect(await paintedWordCount(page, "jet bridge seal")).toBe(0);
  await expect(app).toHaveAttribute("data-scene-id", "urban-services");
});

test("the bilingual phone reads the silver terminal roof after returning through the photographed airport entrance", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "This journey uses a 385 × 705 touch viewport.");
  await page.setViewportSize({ width: 385, height: 705 });
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const buttonMap = page.getByTestId("scene-minimap");
  const meanings = page.getByTestId("meaning-toggle");
  const settled = async (scene: string) => {
    await expect(app).toHaveAttribute("data-scene-id", scene);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await (await image.elementHandle()).waitForElementState("stable");
  };

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await settled("world-map");
  await meanings.tap();
  await expect(meanings).toHaveAttribute("aria-pressed", "true");
  for (const [id, title] of [["city-street", "City street"], ["transit-hub", "Transit hub"], ["urban-services", "Urban services"]]) {
    await buttonMap.getByRole("button", { name: `进入 ${title}`, exact: true }).tap();
    await settled(id);
  }
  await viewer.locator('[data-testid="scene-hotspot"][data-target-scene="airport"]').tap();
  await settled("airport");
  await page.getByRole("button", { name: "← 返回上一层", exact: true }).tap();
  await settled("urban-services");
  await expect(image).toHaveAttribute("src", overviewPhoto);
  await expect(meanings).toHaveAttribute("aria-pressed", "true");

  const point = await projectPhoto(image, 800, 350);
  expect(point.visible, "the silver roof is visible on return from the airport").toBe(true);
  await testInfo.attach("bilingual-roof-before-tap", { body: await page.screenshot(), contentType: "image/png" });
  await page.touchscreen.tap(point.x, point.y);
  const card = page.getByRole("complementary", { name: / word details$/ });
  await expect(card).toBeVisible();
  const reading = {
    scene: await app.getAttribute("data-scene-id"),
    word: await card.locator("strong").innerText(),
    meaning: await card.locator("p").first().innerText(),
  };
  await testInfo.attach("bilingual-roof-reading", { body: JSON.stringify({ point, ...reading }), contentType: "application/json" });
  await testInfo.attach("bilingual-roof-card", { body: await page.screenshot(), contentType: "image/png" });
  expect(reading, "tapping the silver roof after the airport round trip reads terminal roof in bilingual phone view")
    .toEqual({ scene: "urban-services", word: "terminal roof", meaning: "航站楼屋顶" });
});
