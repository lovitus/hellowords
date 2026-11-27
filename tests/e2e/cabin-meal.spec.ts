import { expect, test } from "@playwright/test";
import { clickPaintedWord } from "./canvas-words";
import { checkMagnifiedObject, magnify, openPhotographedRoute, projectPhoto, zoomBack } from "./photo-journey";

const cabin = "aircraft-cabin", row = "passenger-seat-row", meal = "inflight-meal-tray";
const cabinPhoto = "/scenes/aircraft-cabin-premium-v1.jpg";
const rowPhoto = "/scenes/passenger-seat-row-premium-v1.jpg";
const mealPhoto = "/scenes/inflight-meal-tray-premium-v1.jpg";
const cabinRoute = [
  ["airport", "Airport"], ["security-checkpoint", "Security checkpoint"], ["boarding-gate", "Boarding gate"],
  ["passenger-boarding-bridge", "Passenger boarding bridge"], [cabin, "Aircraft cabin"],
] as const;

test("aircraft cabin opens the passenger seat row and meal tray, then restores both parent scenes", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(100_000);
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const card = page.locator('aside[aria-label$="word details"]');
  const input = isMobile ? "touch" : "mouse";

  // At scene entry and on return, tap the original photograph before opening
  // the index or changing the camera. Then independently tap its drawn word.
  const readWord = async (word: string, meaning: string, x: number, y: number, key: string) => {
    await (await image.elementHandle()).waitForElementState("stable");
    const point = await projectPhoto(image, x, y);
    expect(point.visible, `the photographed ${word} is in the current view`).toBe(true);
    await testInfo.attach(`${key}-before`, { body: await page.screenshot(), contentType: "image/png" });
    const readCard = async (hit: string) => {
      await expect(card).toBeVisible();
      await testInfo.attach(`${key}-${hit}`, { body: await page.screenshot(), contentType: "image/png" });
      await expect(card.locator("strong"), `the ${hit} on the photograph reads ${word}`).toHaveText(word);
      await expect(card.locator("p").first()).toHaveText(meaning);
      const close = card.getByRole("button", { name: "关闭单词卡" });
      if (isMobile) await close.tap();
      else await close.click();
      await expect(card).toBeHidden();
    };
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await readCard("dot");
    const visibleId = () => viewer.locator(".label-canvas").evaluate((canvas, word) => {
      type Painted = { id: string; word: string; interactive: boolean; opacity: number };
      return (canvas as HTMLCanvasElement & { paintedLabels?: Painted[] }).paintedLabels
        ?.find(label => label.word === word && label.interactive && label.opacity >= 0.52)?.id ?? null;
    }, word);
    await expect.poll(visibleId, { message: `${word} has a readable word on the photograph` }).not.toBeNull();
    await clickPaintedWord(page, (await visibleId())!, input);
    await readCard("word");
  };

  await openPhotographedRoute(page, isMobile, cabinRoute, cabinPhoto,
    "43bc4ae1927274df211288acce769e17f16975ddfea8e0c57d8ce5349f697dbc");
  const collapse = page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" });
  const meanings = page.getByTestId("meaning-toggle");
  if (isMobile) {
    await collapse.tap();
    await meanings.tap();
  } else {
    await collapse.click();
    await meanings.click();
  }
  await expect(meanings).toHaveAttribute("aria-pressed", "true");

  await test.step("magnify the blue seat back and read the neck pillow", async () => {
    await checkMagnifiedObject(page, isMobile, testInfo, {
      object: "seat-back-panel", x: 795, y: 452,
      scene: cabin, asset: cabinPhoto, destination: row, destinationAsset: rowPhoto, threshold: 3.4,
    });
    await readWord("neck pillow", "颈枕", 1050, 375, "neck-pillow-arrival");
  });
  await test.step("read the foil dish at fit scale before entering the meal tray", async () => {
    expect(Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"))).toBe(1);
    await readWord("foil dish", "铝箔餐盒", 529, 518, "foil-dish-fit");
    await expect(page.getByTestId("world-app")).toHaveAttribute("data-scene-id", row);
  });
  await test.step("magnify the front edge of the dark blue meal tray", () =>
    checkMagnifiedObject(page, isMobile, testInfo, {
      object: "meal-tray-edge", x: 478, y: 550,
      scene: row, asset: rowPhoto, destination: meal, destinationAsset: mealPhoto, threshold: 3.4,
    }));
  const food = { word: "broccoli floret", meaning: "西兰花小朵", x: 798, y: 613 };
  await test.step("read the food on the photograph and inspect it at a higher magnification", async () => {
    await readWord(food.word, food.meaning, food.x, food.y, "meal-food-arrival");
    await checkMagnifiedObject(page, isMobile, testInfo, {
      object: "meal-food", x: food.x, y: food.y,
      scene: meal, asset: mealPhoto, destination: meal, destinationAsset: mealPhoto, threshold: 3.4,
    });
  });
  await test.step("zoom out to the seat row, then to the carpeted cabin aisle", async () => {
    const seatReturn = await zoomBack(page, isMobile, meal, row, rowPhoto, food);
    await testInfo.attach("meal-tray-return", { body: JSON.stringify(seatReturn), contentType: "application/json" });
    await readWord("neck pillow", "颈枕", 1050, 375, "neck-pillow-return");
    const pillow = { x: 1050, y: 375 };
    await magnify(page, isMobile, await projectPhoto(image, pillow.x, pillow.y), 2);
    await expect.poll(async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"))).toBeGreaterThan(1.6);
    const cabinReturn = await zoomBack(page, isMobile, row, cabin, cabinPhoto, pillow);
    await testInfo.attach("seat-row-return", { body: JSON.stringify(cabinReturn), contentType: "application/json" });
    await readWord("cabin center aisle", "客舱中央过道", 883, 760, "cabin-aisle-return");
  });
});
