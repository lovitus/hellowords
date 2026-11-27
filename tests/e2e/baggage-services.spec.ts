import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { checkMagnifiedObject, checkPaintedWords, magnify, openPhotographedRoute, projectPhoto, zoomBack, type PhotographedWord } from "./photo-journey";

const claim = "baggage-claim", desk = "baggage-service-desk", table = "suitcase-packing-table";
const claimPhoto = "/scenes/baggage-claim-premium-v1.jpg";
const deskPhoto = "/scenes/baggage-service-desk-premium-v1.jpg";
const tablePhoto = "/scenes/suitcase-packing-table-premium-v1.jpg";

// Independent outlines on the 1600 × 900 photographs. Keep the counter front
// clear of the monitor and floor, and the bell clear of the printed claim slips.
const serviceCounter: PhotographedWord = {
  word: "baggage services desk", meaning: "行李服务台", openFromDot: true,
  assertion: "the baggage services desk dot must land on the curved wooden counter at the left of baggage claim",
  outlines: [
    [[44, 324], [112, 319], [198, 308], [279, 298], [325, 290], [344, 282],
      [344, 331], [331, 338], [296, 348], [233, 358], [150, 370], [65, 383], [43, 378]],
  ],
};
const bell: PhotographedWord = {
  word: "desk bell", meaning: "柜台铃", openFromDot: true,
  assertion: "the desk bell dot must land on the metal service bell beside the claim slips",
  outlines: [
    [[1044, 295], [1047, 287], [1052, 284], [1054, 272], [1061, 262], [1075, 259],
      [1078, 254], [1078, 249], [1085, 249], [1087, 258], [1098, 261], [1107, 269],
      [1111, 282], [1112, 287], [1116, 293], [1115, 299], [1102, 302], [1066, 301], [1044, 298]],
  ],
};
// The pink folded shirt is below the blue button-down. Its grey retaining
// strap runs diagonally between these two visible patches of pink fabric.
const shirt: PhotographedWord = {
  word: "T-shirt", meaning: "T恤", openFromDot: true,
  assertion: "the T-shirt dot must land on the folded pink fabric beneath the blue shirt",
  outlines: [
    [[717, 539], [750, 500], [769, 495], [819, 500], [981, 744], [940, 751],
      [722, 752], [716, 747], [716, 674], [713, 641]],
    [[866, 501], [936, 498], [975, 489], [1016, 501], [1018, 625], [1008, 685]],
  ],
};

async function photoHash(page: Page, asset: string) {
  const response = await page.request.get(asset);
  expect(response.ok()).toBe(true);
  return createHash("sha256").update(await response.body()).digest("hex");
}

test("baggage services opens the wooden counter and the open suitcase, then restores both parent scenes", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(100_000);
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const readOnArrival = async (target: PhotographedWord, x: number, y: number, key: string) => {
    await (await image.elementHandle()).waitForElementState("stable");
    const point = await projectPhoto(image, x, y);
    expect(point.visible).toBe(true);
    await testInfo.attach(`${key}-before`, { body: await page.screenshot(), contentType: "image/png" });
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    const card = page.locator('aside[aria-label$="word details"]');
    await expect(card).toBeVisible();
    await testInfo.attach(`${key}-card`, { body: await page.screenshot(), contentType: "image/png" });
    await expect(card.locator("strong"), `tapping the photographed ${target.word} before opening the index reads ${target.word}`).toHaveText(target.word);
    await expect(card.locator("p").first()).toHaveText(target.meaning);
    const close = card.getByRole("button", { name: "关闭单词卡" });
    if (isMobile) await close.tap();
    else await close.click();
    await expect(card).toBeHidden();
  };
  const claimHash = await openPhotographedRoute(page, isMobile, [["airport", "Airport"], [claim, "Baggage claim"]], claimPhoto,
    "867f17349b32d7c2802e2710a9b765117e50480301c30e0dea5ee7a4f10457c0");
  const collapse = page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" });
  if (isMobile) await collapse.tap();
  else await collapse.click();
  const meaning = page.getByTestId("meaning-toggle");
  if (isMobile) await meaning.tap();
  else await meaning.click();
  await expect(meaning).toHaveAttribute("aria-pressed", "true");
  await test.step("magnify the wooden front panel of the curved counter at the left", () =>
    checkMagnifiedObject(page, isMobile, testInfo, {
      object: "service-desk-counter", x: 260, y: 340,
      scene: claim, asset: claimPhoto, destination: desk, destinationAsset: deskPhoto, threshold: 3.4,
    }));
  const deskHash = await photoHash(page, deskPhoto);
  await test.step("read the service bell on the counter photograph", async () => {
    await readOnArrival(bell, 1082, 274, "desk-bell-arrival");
    await checkPaintedWords(page, isMobile, testInfo, [bell], deskHash);
  });
  await test.step("magnify the turquoise front shell of the open suitcase", () =>
    checkMagnifiedObject(page, isMobile, testInfo, {
      object: "open-suitcase-shell", x: 1260, y: 744,
      scene: desk, asset: deskPhoto, destination: table, destinationAsset: tablePhoto, threshold: 3.4,
    }));
  const tableHash = await photoHash(page, tablePhoto);
  await test.step("read the folded shirt and inspect its fabric in the packing photograph", async () => {
    await readOnArrival(shirt, 810, 683, "shirt-arrival");
    await checkPaintedWords(page, isMobile, testInfo, [shirt], tableHash);
    await checkMagnifiedObject(page, isMobile, testInfo, {
      object: "folded-shirt-fabric", x: 813, y: 667,
      scene: table, asset: tablePhoto, destination: table, destinationAsset: tablePhoto, threshold: 3.4,
    });
  });

  await test.step("zoom out to the desk and read the service bell again", async () => {
    const scales = await zoomBack(page, isMobile, table, desk, deskPhoto, { x: 813, y: 667 });
    await testInfo.attach("packing-table-return", { body: JSON.stringify(scales), contentType: "application/json" });
    await readOnArrival(bell, 1082, 274, "desk-bell-return");
  });
  await test.step("zoom out of the desk and read the counter in baggage claim", async () => {
    const point = await projectPhoto(image, 1082, 274);
    await magnify(page, isMobile, point, 2);
    await expect.poll(async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"))).toBeGreaterThan(1.6);
    const scales = await zoomBack(page, isMobile, desk, claim, claimPhoto, { x: 1082, y: 274 });
    await testInfo.attach("baggage-service-desk-return", { body: JSON.stringify(scales), contentType: "application/json" });
    await readOnArrival(serviceCounter, 100, 348, "claim-counter-return");
    await checkPaintedWords(page, isMobile, testInfo, [serviceCounter], claimHash);
  });
});
