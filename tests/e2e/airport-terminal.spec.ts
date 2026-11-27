import { expect, test, type Locator } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
import { checkPaintedWords, openPhotographedRoute, projectPhoto, type PhotographedWord } from "./photo-journey";

const terminalPhoto = "/scenes/airport-terminal-premium-v1.jpg";
const terminalHash = "428e5f9dbcca0f19e8fcedc540a9715362bc55b9b2e51e31d39a4659133f31e1";

// Interior photo patches on the ridged blue case (below its white sticker) and
// the bare silver island (between the belt and the planted bed).
const shell: PhotographedWord = {
  word: "luggage shell", meaning: "行李箱壳", openFromDot: true,
  assertion: "the luggage shell dot lands on the photographed navy suitcase shell",
  outlines: [[[1199, 735], [1210, 728], [1251, 746], [1243, 754], [1204, 743]]],
};
const island: PhotographedWord = {
  word: "carousel island", meaning: "转盘岛台", openFromDot: true,
  assertion: "the carousel island dot lands on the exposed silver island inside the baggage belt",
  outlines: [[[1130, 558], [1162, 550], [1225, 549], [1223, 579], [1195, 586], [1155, 577]]],
};

test("the airport terminal reads the suitcase shell and carousel island and restores its words after baggage claim", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const map = page.getByTestId("scene-minimap");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const sha256 = await openPhotographedRoute(page, isMobile, [["airport", "Airport"]], terminalPhoto, terminalHash);

  const readPhoto = async (target: PhotographedWord, x: number, y: number, attachment: string) => {
    await (await image.elementHandle()).waitForElementState("stable");
    const point = await projectPhoto(image, x, y);
    expect(point.visible, `the photographed ${target.word} is in view`).toBe(true);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    const card = page.getByRole("complementary", { name: `${target.word} word details`, exact: true });
    await expect(card.locator("p").first()).toHaveText(target.meaning);
    await expect(app).toHaveAttribute("data-scene-id", "airport");
    await testInfo.attach(attachment, { body: await page.screenshot(), contentType: "image/png" });
    await activate(card.getByRole("button", { name: "关闭单词卡" }));
    await expect(card).toBeHidden();
  };
  for (const [target, x, y] of [[shell, 1216, 739], [island, 1192, 568]] as const) {
    await checkPaintedWords(page, isMobile, testInfo, [target], sha256);
    await readPhoto(target, x, y, `${target.word.replaceAll(" ", "-")}-photo-reading`);
  }

  await activate(map.getByRole("button", { name: "进入 Baggage claim", exact: true }));
  await expect(app).toHaveAttribute("data-scene-id", "baggage-claim");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(image).toHaveAttribute("src", "/scenes/baggage-claim-premium-v1.jpg");
  await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
  await expect(app).toHaveAttribute("data-scene-id", "airport");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  await expect(image).toHaveAttribute("src", terminalPhoto);

  await activate(page.getByTestId("scene-word-index-toggle"));
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill(shell.word);
  await activate(index.getByRole("button").filter({ has: page.getByText(shell.word, { exact: true }) }));
  const card = page.getByRole("complementary", { name: "luggage shell word details", exact: true });
  await expect(card).toBeVisible();
  await (await image.elementHandle()).waitForElementState("stable");
  await activate(card.getByRole("button", { name: "关闭单词卡" }));
  await expect(card).toBeHidden();
  await readPhoto(shell, 1216, 739, "returned-terminal-shell-reading");

  await (await image.elementHandle()).waitForElementState("stable");
  const surface = viewer.locator(".scene-surface");
  const shellView = await surface.evaluate(el => getComputedStyle(el).transform);
  await activate(page.getByTestId("scene-word-index-toggle"));
  await index.getByRole("searchbox").fill("suitcase lining");
  await activate(index.getByRole("button", { name: "suitcase lining，行李箱内衬，图中未标注", exact: true }));
  const lining = page.getByRole("complementary", { name: "suitcase lining word details", exact: true });
  await expect(lining.getByText("行李箱内衬", { exact: true })).toBeVisible();
  await expect(lining.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await testInfo.attach("returned-terminal-suitcase-lining", { body: await page.screenshot(), contentType: "image/png" });
  await (await image.elementHandle()).waitForElementState("stable");
  await expect(surface).toHaveCSS("transform", shellView);
  expect(await paintedWordCount(page, "suitcase lining")).toBe(0);
  await expect(app).toHaveAttribute("data-scene-id", "airport");
});
