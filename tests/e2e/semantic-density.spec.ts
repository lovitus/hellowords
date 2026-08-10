import { expect, test } from "@playwright/test";

async function openUniverse(page: import("@playwright/test").Page) {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await page.getByRole("button", { name: /10,000\+ 词汇宇宙/ }).click();
  const dialog = page.getByRole("dialog", { name: "可缩放语义词汇宇宙" });
  await expect(dialog).toBeVisible();
  return dialog.locator("canvas");
}

async function numericAttribute(locator: import("@playwright/test").Locator, name: string): Promise<number> {
  return Number(await locator.getAttribute(name));
}

test("semantic universe exposes four dense zoom layers", async ({ page }, testInfo) => {
  const canvas = await openUniverse(page);
  const mobile = testInfo.project.name === "mobile-chromium";

  await expect(canvas).toHaveAttribute("data-zoom-tier", "realms");
  await expect.poll(() => numericAttribute(canvas, "data-rendered-label-count")).toBeGreaterThanOrEqual(mobile ? 20 : 50);

  await canvas.focus();
  for (let index = 0; index < 12 && await canvas.getAttribute("data-zoom-tier") === "realms"; index += 1) {
    await page.keyboard.press("+");
    await canvas.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  await expect(canvas).toHaveAttribute("data-zoom-tier", "topics");

  for (let index = 0; index < 12 && await canvas.getAttribute("data-zoom-tier") !== "subclusters"; index += 1) {
    await page.keyboard.press("+");
    await canvas.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  await expect(canvas).toHaveAttribute("data-zoom-tier", "subclusters");

  const search = page.getByPlaceholder("搜索 10,000 个词…");
  await search.fill("coffee");
  await page.locator(".semantic-atlas__results li").first().getByRole("button").click();
  await expect(canvas).toHaveAttribute("data-zoom-tier", "words");
  await expect.poll(() => numericAttribute(canvas, "data-rendered-subcluster-count")).toBeGreaterThan(0);
  await expect.poll(() => numericAttribute(canvas, "data-candidate-count")).toBeGreaterThanOrEqual(100);
  await expect.poll(() => numericAttribute(canvas, "data-rendered-label-count")).toBeGreaterThanOrEqual(mobile ? 20 : 40);
  await expect(page.locator(".semantic-atlas__viewport")).toHaveAttribute("data-zoom-tier", /词汇/);
});
