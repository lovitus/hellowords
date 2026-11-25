import { expect, test, type Locator } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";

async function firstDifferentCameraOrOriginal(surface: Locator, original: string) {
  return surface.evaluate(async (element, expected) => {
    // A result can open its card one frame before the focus animation begins.
    const end = performance.now() + 400;
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const transform = getComputedStyle(element).transform;
      if (transform !== expected) return transform;
    } while (performance.now() < end);
    return expected;
  }, original);
}

test("a related kitchen word opens from either search language while only the photographed oven door zooms in", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 846 });
  const activate = (button: Locator) => isMobile ? button.tap() : button.click();
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const surface = viewer.locator(".scene-surface");
  const index = page.getByTestId("scene-word-index");
  const relatedWord = "oil bottle neck";

  async function chooseWord(query: string, word: string) {
    await activate(page.getByTestId("scene-word-index-toggle"));
    await index.getByRole("searchbox").fill(query);
    const result = index.getByRole("button").filter({ has: page.getByText(word, { exact: true }) });
    await expect(result).toBeVisible();
    await activate(result);
    await expect(index).toBeHidden();
    const card = page.getByRole("complementary", { name: `${word} word details`, exact: true });
    await expect(card.getByText(word, { exact: true })).toBeVisible();
    return card;
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  for (const id of ["apartment", "kitchen"]) {
    const layer = viewer.getByTestId("scene-interaction-layer");
    await expect(layer).toHaveAttribute("data-positioned", "true");
    await activate(layer.locator(`[data-testid="scene-hotspot"][data-target-scene="${id}"]`));
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  await expect(surface).toHaveCSS("transform", /^matrix/);
  const originalCamera = await surface.evaluate((element) => getComputedStyle(element).transform);
  const originalScale = Number(await surface.getAttribute("data-scene-scale"));
  expect(originalScale).toBeGreaterThan(0);

  for (const query of [relatedWord, "油瓶颈"]) {
    await test.step(`search for ${query}`, async () => {
      const card = await chooseWord(query, relatedWord);
      await expect(card.getByText("油瓶颈", { exact: true })).toBeVisible();
      expect(await firstDifferentCameraOrOriginal(surface, originalCamera),
        "opening a related kitchen word must keep the kitchen camera in place").toBe(originalCamera);
      await expect(card.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
      await expect(card.getByRole("button", { name: /听发音/ })).toBeVisible();
      if (query === relatedWord) {
        await test.info().attach("related-kitchen-word", { body: await page.screenshot(), contentType: "image/png" });
      }
      await expect(app).toHaveAttribute("data-scene-id", "kitchen");
      expect(await paintedWordCount(page, relatedWord), "the related kitchen word has no painted label").toBe(0);
      await expect(viewer.locator(`[data-testid="word-label"][data-word="${relatedWord}"]`)).toHaveCount(0);
      await activate(card.getByRole("button", { name: "关闭单词卡" }));
      await expect(card).toBeHidden();
    });
  }

  const ovenCard = await chooseWord("oven door", "oven door");
  await expect(ovenCard.getByText("烤箱门", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scene-minimap-zone").filter({ hasText: "Cooking wall" }))
    .toHaveAttribute("aria-current", "location");
  await expect.poll(async () => Number(await surface.getAttribute("data-scene-scale")),
    { message: "choosing the photographed oven door zooms in on the kitchen" }).toBeGreaterThan(originalScale * 1.1);
  await expect.poll(() => paintedWordCount(page, "oven door")).toBeGreaterThan(0);
  await expect.poll(() => viewer.locator(".label-canvas").evaluate((canvas) => {
    const labels = (canvas as HTMLCanvasElement & {
      paintedLabels?: { word: string; anchorX: number; anchorY: number }[];
    }).paintedLabels;
    const door = labels?.find((label) => label.word === "oven door");
    if (!door) return Infinity;
    const viewport = canvas.closest(".world-viewport")!;
    const photo = viewport.querySelector(".scene-art")!.getBoundingClientRect();
    // A short photograph can reach the vertical pan limit on a tall phone.
    const dx = door.anchorX - viewport.clientWidth / 2;
    const dy = photo.height >= viewport.clientHeight ? door.anchorY - viewport.clientHeight / 2 : 0;
    return Math.hypot(dx, dy);
  }), { message: "the photographed oven door comes to the center of the available pan axes" }).toBeLessThan(2);
  await expect(app).toHaveAttribute("data-scene-id", "kitchen");
});
