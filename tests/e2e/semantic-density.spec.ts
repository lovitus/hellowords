import { expect, test, type Locator, type Page } from "@playwright/test";

const ENTRY_LABEL = "打开 10 个视觉领域、758 个分层入口和 10,000 个词";
const DIALOG_LABEL = "一万个词的分层探索世界";
const SEARCH_PLACEHOLDER = "搜索 10,000 个词，直接抵达…";

async function openLexicalWorld(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: ENTRY_LABEL }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_LABEL });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".lexical-world__overview")).toBeVisible();
  await expect(page.locator(".app-header")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".world-stage")).toHaveAttribute("aria-hidden", "true");
  expect(await page.locator(".app-header").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  expect(await page.locator(".world-stage").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  return dialog;
}

function countFromEntryLabel(label: string | null): number {
  const match = label?.match(/，([\d,]+) 个词，/);
  if (!match) throw new Error(`Unable to read the leaf count from: ${label ?? "<missing>"}`);
  return Number(match[1].replaceAll(",", ""));
}

test("the lexical world accounts for 10,000 words and reaches every word in a leaf", async ({ page }, testInfo) => {
  const dialog = await openLexicalWorld(page);
  const scene = dialog.locator(".lexical-world__scene");
  const overviewStats = dialog.locator(".lexical-world__overview-stats");

  await expect(overviewStats).toContainText(/10\s*领域/);
  await expect(overviewStats).toContainText(/44\s*主题/);
  await expect(overviewStats).toContainText(/704\s*词群/);
  await expect(overviewStats).toContainText(/10,000\s*未探索/);
  await expect(dialog.locator(".lexical-world__level-card--realm")).toHaveCount(10);

  await dialog.locator(".lexical-world__level-card--realm").first().click();
  await expect(scene).toHaveAttribute("data-level", "realm");
  const topic = dialog.locator(".lexical-world__level-card--topic").first();
  await expect(topic).toBeVisible();
  await topic.click();

  await expect(scene).toHaveAttribute("data-level", "topic");
  const subcluster = dialog.locator(".lexical-world__level-card--subcluster").first();
  await expect(subcluster).toBeVisible();
  const leafWordCount = countFromEntryLabel(await subcluster.getAttribute("aria-label"));
  expect(leafWordCount).toBeGreaterThan(0);
  await subcluster.click();

  await expect(scene).toHaveAttribute("data-level", "subcluster");
  const wordField = dialog.locator(".lexical-world__word-field");
  const wordScroll = dialog.locator(".lexical-world__word-scroll");
  await expect(wordField).toBeVisible();
  await expect(wordField.locator(".lexical-world__word-toolbar strong")).toHaveText(
    leafWordCount.toLocaleString("en-US"),
  );
  await expect(wordScroll).toHaveAttribute(
    "aria-label",
    new RegExp(`共 ${leafWordCount.toLocaleString("en-US")} 个`),
  );

  const expectedBudget = testInfo.project.name === "mobile-chromium" ? 40 : 80;
  await expect(wordScroll).toHaveAttribute("data-label-budget", String(expectedBudget));
  const activeWordCards = dialog.locator(".lexical-world__word-grid > button");
  await expect.poll(() => activeWordCards.count()).toBeGreaterThan(0);
  expect(await activeWordCards.count()).toBeLessThanOrEqual(expectedBudget);
  expect(Number(await wordScroll.getAttribute("data-active-labels"))).toBe(
    await activeWordCards.count(),
  );

  await wordScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(dialog.locator(".lexical-world__word-range span").first()).toContainText(
    new RegExp(`–${leafWordCount} / ${leafWordCount}`),
  );
  await expect(dialog.locator("canvas")).toHaveCount(0);
});

test("searching coffee jumps to its complete path and reveals Chinese only in details", async ({ page }) => {
  const dialog = await openLexicalWorld(page);
  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
  await search.fill("coffee");

  const result = dialog.locator(".lexical-world__results li").filter({ hasText: /coffee/i }).first();
  await expect(result).toContainText(/coffee/i);
  await result.getByRole("button").click();

  await expect(dialog.locator(".lexical-world__scene")).toHaveAttribute("data-level", "subcluster");
  await expect(dialog.locator(".lexical-world__breadcrumbs > span")).toHaveCount(4);
  const detail = dialog.getByRole("complementary", { name: /coffee 词汇详情/i });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(/coffee/i);
  await expect(detail.locator("p").last()).toContainText(/\p{Script=Han}/u);
  await expect(detail.locator("footer")).toHaveText("词卡详情始终显示释义");

  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: "释义 关" })).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.locator(".lexical-world__word-grid em")).toHaveCount(0);
});

test("scene word labels remain native-size siblings of the zoomed artwork", async ({ page }) => {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const viewport = page.getByTestId("world-viewport");
  const surface = viewport.locator(":scope > .scene-surface");
  const labelLayer = viewport.locator(":scope > [data-testid='scene-label-layer']");
  await expect(surface).toBeVisible();
  await expect(labelLayer).toHaveAttribute("data-coordinate-space", "screen");

  const relationship = await viewport.evaluate((element) => {
    const artwork = element.querySelector<HTMLElement>(":scope > .scene-surface");
    const labels = element.querySelector<HTMLElement>(":scope > .label-layer");
    const word = labels?.querySelector<HTMLElement>(".word-label");
    return {
      artworkParentIsViewport: artwork?.parentElement === element,
      labelsParentIsViewport: labels?.parentElement === element,
      artworkContainsLabels: Boolean(artwork?.contains(labels ?? null)),
      layerTransform: labels ? getComputedStyle(labels).transform : "missing",
      wordTransform: word ? getComputedStyle(word).transform : "missing",
    };
  });

  expect(relationship).toEqual({
    artworkParentIsViewport: true,
    labelsParentIsViewport: true,
    artworkContainsLabels: false,
    layerTransform: "none",
    wordTransform: expect.stringMatching(/^matrix\(1, 0, 0, 1,/),
  });
});
