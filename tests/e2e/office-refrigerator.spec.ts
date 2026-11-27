import { createHash } from "node:crypto";
import { expect, test, type Locator, type Response } from "@playwright/test";
import type { PaintedLabel } from "../../app/lib/label-canvas";
import { clickPaintedWord } from "./canvas-words";
import { checkMagnifiedObject, openPhotographedRoute, projectPhoto, zoomBack } from "./photo-journey";

const room = "office-break-room", refrigerator = "office-refrigerator-interior";
const roomPhoto = "/scenes/office-break-room-premium-v1.jpg";
const refrigeratorPhoto = "/scenes/office-refrigerator-interior-premium-v1.jpg";
const roomHash = "1fe63b2f3ca69e6a33f655c583c01655118ad4400b8b0d95342f04ab75f0f53d";
const refrigeratorHash = "b4ea5c5e7306c5950adce3166de9acd8e917d67e78be2dc2788e402119664d6d";
const roomRoute = [["office-building", "Office building"], [room, "Office break room"]] as const;

test("the office break room opens the refrigerator interior and returns to the break room by zoom", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(100_000);
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (button: Locator) => isMobile ? button.tap() : button.click();
  const screenshot = async (name: string) =>
    testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const read = async (word: string, meaning: string, x: number, y: number, key: string) => {
    await (await image.elementHandle()).waitForElementState("stable");
    const dot = await projectPhoto(image, x, y);
    expect(dot.visible, `${word} is visible on the photograph`).toBe(true);
    await screenshot(`${key}-before`);
    const id = () => viewer.locator(".label-canvas").evaluate((canvas, word) => {
      const labels = (canvas as HTMLCanvasElement & { paintedLabels?: PaintedLabel[] }).paintedLabels ?? [];
      return labels.find(label => label.word === word && label.interactive && label.opacity >= 0.52)?.id ?? null;
    }, word);
    await expect.poll(id, { message: `${word} has a readable label before the first tap` }).not.toBeNull();
    const labelId = (await id())!;
    const card = page.getByRole("complementary", { name: `${word} word details`, exact: true });
    for (const hit of ["dot", "word"] as const) {
      if (hit === "word") await clickPaintedWord(page, labelId, isMobile ? "touch" : "mouse");
      else if (isMobile) await page.touchscreen.tap(dot.x, dot.y);
      else await page.mouse.click(dot.x, dot.y);
      await expect(card).toBeVisible();
      await screenshot(`${key}-${hit}`);
      await expect(card.locator("strong")).toHaveText(word);
      await expect(card.locator("p").first()).toHaveText(meaning);
      await activate(card.getByRole("button", { name: "关闭单词卡" }));
      await expect(card).toBeHidden();
    }
  };

  let interiorResponse: Response | undefined;
  page.on("response", response => {
    if (response.ok() && new URL(response.url()).pathname === refrigeratorPhoto) interiorResponse = response;
  });
  await openPhotographedRoute(page, isMobile, roomRoute, roomPhoto, roomHash);
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  const meanings = page.getByTestId("meaning-toggle");
  await activate(meanings);
  await expect(meanings).toHaveAttribute("aria-pressed", "true");

  await test.step("magnify the ceiling light in the open refrigerator", async () => {
    await checkMagnifiedObject(page, isMobile, testInfo, {
      object: "refrigerator-ceiling-light", x: 372, y: 87,
      scene: room, asset: roomPhoto, destination: refrigerator, destinationAsset: refrigeratorPhoto, threshold: 3.4,
    });
    expect(interiorResponse, "the browser loaded the refrigerator photograph").toBeDefined();
    const sha256 = createHash("sha256").update(await interiorResponse!.body()).digest("hex");
    const size = await image.evaluate((photo: HTMLImageElement) => [photo.naturalWidth, photo.naturalHeight]);
    await testInfo.attach("refrigerator-interior-photo", {
      body: JSON.stringify({ asset: refrigeratorPhoto, sha256, size }), contentType: "application/json",
    });
    expect(sha256).toBe(refrigeratorHash);
    expect(size).toEqual([1600, 900]);
  });

  const food = { word: "red bell pepper", meaning: "红甜椒", x: 848, y: 375 };
  await test.step("read the food on the shelf and magnify it in the refrigerator", async () => {
    await read(food.word, food.meaning, food.x, food.y, "refrigerator-object-arrival");
    await checkMagnifiedObject(page, isMobile, testInfo, {
      object: "refrigerator-object", x: food.x, y: food.y,
      scene: refrigerator, asset: refrigeratorPhoto, destination: refrigerator, destinationAsset: refrigeratorPhoto, threshold: 3.4,
    });
  });
  await test.step("zoom out and read the refrigerator in the break room photograph", async () => {
    const scales = await zoomBack(page, isMobile, refrigerator, room, roomPhoto, food);
    await testInfo.attach("refrigerator-return", { body: JSON.stringify(scales), contentType: "application/json" });
    await read("open refrigerator", "敞开的冰箱", 452, 166, "break-room-object-return");
    await expect(app).toHaveAttribute("data-scene-id", room);
  });
});
