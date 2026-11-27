import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { magnify, openPhotographedRoute, projectPhoto } from "./photo-journey";

const radiology = "/scenes/radiology-suite-premium-v1.jpg";

function visibleCards(page: Page) {
  return page.getByRole("complementary", { name: / word details$/ }).evaluateAll(cards => cards.map(card => ({
    word: card.querySelector("strong")?.textContent,
    meaning: card.querySelector("p")?.textContent,
  })));
}

async function readPhotoWord(
  page: Page, image: Locator, isMobile: boolean, testInfo: TestInfo,
  word: string, meaning: string, x: number, y: number, stage: string,
) {
  await (await image.elementHandle()).waitForElementState("stable");
  const point = await projectPhoto(image, x, y);
  expect(point.visible, `${word} is on screen in the photograph`).toBe(true);
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  const cards = page.getByRole("complementary", { name: / word details$/ });
  try {
    await expect(cards.locator("strong"), `touching the photographed ${word} opens its own card`).toHaveText(word);
    await expect(cards.locator("p").first()).toHaveText(meaning);
  } finally {
    await testInfo.attach(`${stage}-result`, {
      body: JSON.stringify({
        scene: await page.getByTestId("world-app").getAttribute("data-scene-id"),
        photo: await image.getAttribute("src"), x, y, point, cards: await visibleCards(page),
      }),
      contentType: "application/json",
    });
    await testInfo.attach(stage, { body: await page.screenshot(), contentType: "image/png" });
  }
  const close = cards.getByRole("button", { name: "关闭单词卡" });
  if (isMobile) await close.tap();
  else await close.click();
  await expect(cards).toBeHidden();
}

async function inspectTerminal(page: Page, viewer: Locator, isMobile: boolean, testInfo: TestInfo) {
  const app = page.getByTestId("world-app");
  const room = viewer.getByTestId("world-viewport");
  const image = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  await expect(page.getByTestId("scene-minimap")).toHaveAttribute("data-terminal", "true");
  await expect(surface).toHaveAttribute("data-maximum-scale", /\d/);
  const max = Number(await surface.getAttribute("data-maximum-scale"));
  const scale = async () => Number(await surface.getAttribute("data-scene-scale"));
  const center = await room.evaluate(el => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2, visible: true };
  });
  for (let gesture = 0; gesture < 4 && await scale() < max - 0.021; gesture++) {
    const before = await scale();
    await magnify(page, isMobile, center, 4);
    await expect.poll(scale, { message: "an inward gesture zooms into the exam-room photograph" }).toBeGreaterThan(before);
    await (await image.elementHandle()).waitForElementState("stable");
  }
  expect(await scale(), "the photograph reaches its responsive zoom limit").toBeGreaterThanOrEqual(max - 0.021);
  await expect(viewer.getByTestId("scene-word-progress")).toHaveAttribute("data-next-plane", "spatial-terminal");
  await magnify(page, isMobile, center, 2);
  await (await image.elementHandle()).waitForElementState("stable");
  await expect(app).toHaveAttribute("data-scene-id", "ultrasound-exam-room");
  await expect(app).toHaveAttribute("data-semantic-transition-state", "idle");
  await expect(page.getByRole("dialog", { name: "一万个词的分层探索世界" })).toHaveCount(0);
  await testInfo.attach("exam-room-at-maximum-zoom-result", {
    body: JSON.stringify({
      scene: await app.getAttribute("data-scene-id"), photo: await image.getAttribute("src"),
      maximumScale: max, scale: await scale(), semanticState: await app.getAttribute("data-semantic-transition-state"),
      nextPlane: await viewer.getByTestId("scene-word-progress").getAttribute("data-next-plane"),
    }),
    contentType: "application/json",
  });
  await testInfo.attach("exam-room-at-maximum-zoom", { body: await page.screenshot(), contentType: "image/png" });
}

test("the photographed ultrasound machine opens its exam room and remains readable after returning to radiology", async ({ page, isMobile }, testInfo) => {
  if (isMobile) await page.setViewportSize({ width: 385, height: 705 });
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const settled = async (scene: string) => {
    await expect(app).toHaveAttribute("data-scene-id", scene);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  };
  await openPhotographedRoute(page, isMobile, [
    ["hospital", "Hospital"], ["radiology-suite", "Radiology suite"],
  ], radiology, "b61a9331f765812aabc429d86ea935ba00e947fb86b45e487743a410c01cecc5");
  const bilingual = page.getByTestId("meaning-toggle");
  if (await bilingual.getAttribute("aria-pressed") !== "true") await activate(bilingual);
  await activate(page.getByRole("button", { name: "收起小地图", exact: true }));
  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await readPhotoWord(page, image, isMobile, testInfo, "ultrasound machine", "超声机", 652, 612, "radiology-machine-before-entering");

  const entrance = viewer.locator('[data-testid="scene-hotspot"][data-target-scene="ultrasound-exam-room"]');
  const x = 676, y = 736;
  const point = await projectPhoto(image, x, y);
  const sourceScene = await app.getAttribute("data-scene-id"), sourcePhoto = await image.getAttribute("src");
  const entranceCount = await entrance.count();
  const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)
    ?.closest('[data-testid="scene-hotspot"]')?.getAttribute("data-target-scene") ?? null, point);
  expect(point.visible, "the ultrasound machine's front cabinet is on screen").toBe(true);
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  try {
    expect(entranceCount, "the ultrasound machine in the radiology photograph has a visible exam-room entrance").toBe(1);
    expect(hitTarget, "the front cabinet on the machine is the actual exam-room entrance").toBe("ultrasound-exam-room");
    await settled("ultrasound-exam-room");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => [
      img.currentSrc && new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight,
    ])).toEqual(["/scenes/ultrasound-exam-room-v1.jpg", 1600, 900]);
  } finally {
    await testInfo.attach("radiology-machine-entrance-result", {
      body: JSON.stringify({
        sourceScene, sourcePhoto, entranceCount, x, y, point, hitTarget,
        scene: await app.getAttribute("data-scene-id"), photo: await image.getAttribute("src"), cards: await visibleCards(page),
      }),
      contentType: "application/json",
    });
    await testInfo.attach("radiology-machine-entrance", { body: await page.screenshot(), contentType: "image/png" });
  }

  await readPhotoWord(page, image, isMobile, testInfo, "trackball", "轨迹球", 617, 393, "exam-room-trackball");
  await inspectTerminal(page, viewer, isMobile, testInfo);
  await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
  await settled("radiology-suite");
  await expect(image).toHaveAttribute("src", radiology);
  await expect(bilingual).toHaveAttribute("aria-pressed", "true");
  await readPhotoWord(page, image, isMobile, testInfo, "ultrasound machine", "超声机", 652, 612, "radiology-machine-after-return");
});
