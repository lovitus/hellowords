import { expect, test, type Locator } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { magnify, openPhotographedRoute, projectPhoto } from "./photo-journey";

const hospital = { id: "hospital", photo: "/scenes/hospital-atrium-premium-v1.jpg" };
const reception = { id: "hospital-reception", photo: "/scenes/hospital-reception-v1.jpg" };
const dialysis = { id: "hemodialysis-unit", photo: "/scenes/hemodialysis-unit-premium-v1.jpg" };

test("the hospital reception desk leads through its dialysis doorway and both photographs remain readable on return", async ({ page, isMobile }, testInfo) => {
  if (isMobile) await page.setViewportSize({ width: 385, height: 705 });
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  const cards = page.getByRole("complementary", { name: / word details$/ });
  const bilingual = page.getByTestId("meaning-toggle");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const observe = async () => ({
    scene: await app.getAttribute("data-scene-id"),
    photo: await image.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname),
    readable: Number(await viewer.locator(".label-canvas").getAttribute("data-readable-count")),
    cards: await cards.evaluateAll(elements => elements.map(card => ({
      word: card.querySelector("strong")?.textContent, meaning: card.querySelector("p")?.textContent,
    }))),
  });
  const save = async (name: string, evidence: object) => {
    await testInfo.attach(`${name}-result`, {
      body: JSON.stringify({ ...evidence, ...await observe() }), contentType: "application/json",
    });
    await testInfo.attach(name, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  };
  const settled = async ({ id, photo }: typeof hospital) => {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => [
      img.currentSrc && new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight,
    ])).toEqual([photo, 1600, 900]);
  };
  const touchPhoto = async (x: number, y: number) => {
    await stable();
    const point = await projectPhoto(image, x, y);
    expect(point.visible, `photo point (${x}, ${y}) is in view`).toBe(true);
    const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)
      ?.closest('[data-testid="scene-hotspot"]')?.getAttribute("data-target-scene") ?? null, point);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    return { x, y, point, hitTarget };
  };
  const enter = async (destination: typeof hospital, x: number, y: number) => {
    const source = await observe();
    const entranceCount = await viewer.locator(`[data-testid="scene-hotspot"][data-target-scene="${destination.id}"]`).count();
    const touch = await touchPhoto(x, y);
    try {
      expect(entranceCount, `the photograph in ${source.scene} has an entrance to ${destination.id}`).toBe(1);
      expect(touch.hitTarget, "the learner touches the entrance on the photographed object").toBe(destination.id);
      await settled(destination);
    } finally {
      await save(`enter-${destination.id}`, { sourceScene: source.scene, sourcePhoto: source.photo, entranceCount, ...touch });
    }
  };
  const read = async (stage: string, word: string, meaning: string, x: number, y: number) => {
    const touch = await touchPhoto(x, y);
    try {
      await expect(cards.locator("strong"), `touching the photographed ${word} opens its own card`).toHaveText(word);
      await expect(cards.locator("p").first()).toHaveText(meaning);
      await expect(bilingual).toHaveAttribute("aria-pressed", "true");
    } finally {
      await save(stage, touch);
    }
    await activate(cards.getByRole("button", { name: "关闭单词卡" }));
    await expect(cards).toBeHidden();
  };
  const back = async (destination: typeof hospital) => {
    await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
    await settled(destination);
  };

  await openPhotographedRoute(page, isMobile, [["hospital", "Hospital"]], hospital.photo,
    "027bfd9596fe551b513c8cd68ebe487553c1d75f21609c7519b88296460116a8");
  if (await bilingual.getAttribute("aria-pressed") !== "true") await activate(bilingual);
  await activate(page.getByRole("button", { name: "收起小地图", exact: true }));
  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await enter(reception, 123, 651);
  await read("reception-service-bell", "service bell", "服务铃", 134, 664);
  await enter(dialysis, 1391, 526);
  await read("dialysis-reclining-chair", "reclining dialysis chair", "透析躺椅", 344, 430);

  await expect(page.getByTestId("scene-minimap")).toHaveAttribute("data-terminal", "true");
  const progress = viewer.getByTestId("scene-word-progress");
  await expect(surface).toHaveAttribute("data-maximum-scale", /\d/);
  const maximumScale = Number(await surface.getAttribute("data-maximum-scale"));
  const scale = async () => Number(await surface.getAttribute("data-scene-scale"));
  const center = await viewer.getByTestId("world-viewport").evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: true };
  });
  for (let gesture = 0; gesture < 4 && await scale() < maximumScale - 0.021; gesture++) {
    const before = await scale();
    await magnify(page, isMobile, center, 4);
    await expect.poll(scale).toBeGreaterThan(before);
    await stable();
  }
  expect(await scale(), "inward gestures reach the treatment room's responsive zoom limit").toBeGreaterThanOrEqual(maximumScale - 0.021);
  await magnify(page, isMobile, center, 2);
  await stable();
  await expect(app).toHaveAttribute("data-scene-id", dialysis.id);
  await expect(progress).toHaveAttribute("data-next-plane", "spatial-terminal");
  await expect(app).toHaveAttribute("data-semantic-transition-state", "idle");
  await expect(page.getByRole("dialog", { name: "一万个词的分层探索世界" })).toHaveCount(0);
  const finalScale = await scale();
  expect(finalScale, "another inward gesture keeps the camera at its zoom limit").toBeCloseTo(maximumScale, 1);
  await save("dialysis-maximum-zoom", { maximumScale, scale: finalScale, nextPlane: await progress.getAttribute("data-next-plane") });

  const camera = () => surface.evaluate(element => getComputedStyle(element).transform);
  const cameraBefore = await camera();
  const index = page.getByTestId("scene-word-index");
  await activate(page.getByTestId("scene-word-index-toggle"));
  await index.getByRole("searchbox").fill("chronic kidney disease");
  await activate(index.getByRole("button", { name: "chronic kidney disease，慢性肾脏病，图中未标注", exact: true }));
  await expect(cards.locator("strong")).toHaveText("chronic kidney disease");
  await expect(cards.getByText("慢性肾脏病", { exact: true })).toBeVisible();
  await expect(cards.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await stable();
  const cameraAfter = await camera();
  const markerCount = await paintedWordCount(page, "chronic kidney disease");
  await save("dialysis-chronic-kidney-disease-index", { cameraBefore, cameraAfter, markerCount });
  expect(cameraAfter, "reading the disease in the index keeps the same view of the room").toBe(cameraBefore);
  expect(markerCount, "the photograph has no marker for chronic kidney disease").toBe(0);
  await activate(cards.getByRole("button", { name: "关闭单词卡" }));
  await expect(cards).toBeHidden();
  if (await index.isVisible()) await activate(index.getByTestId("scene-word-index-close"));

  await back(reception);
  await read("reception-service-bell-after-return", "service bell", "服务铃", 134, 664);
  await back(hospital);
  await read("hospital-reception-desk-after-return", "reception desk", "接待台", 81, 614);
});
