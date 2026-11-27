import { createHash } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { checkPaintedWords, projectPhoto } from "./photo-journey";

test("bathroom fixtures open their own words on the photograph and return to the apartment", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (button: Locator) => isMobile ? button.tap() : button.click();
  const bathroomAsset = "/scenes/bathroom-premium-v1.jpg";
  const photo = page.waitForResponse(response => response.ok() && new URL(response.url()).pathname === bathroomAsset);
  await page.goto("/");
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  for (const scene of ["apartment", "bathroom"]) {
    await activate(viewer.locator(`[data-testid="scene-hotspot"][data-target-scene="${scene}"]`));
    await expect(app).toHaveAttribute("data-scene-id", scene);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  }
  await expect(image).toHaveAttribute("src", bathroomAsset);
  const sha256 = createHash("sha256").update(await (await photo).body()).digest("hex");
  expect(sha256).toBe("8b5e929be4f6fec90630342e9c31d1d40e4dfd4f7b207a1fb1c6108f5eb82f22");

  // Interior patches on the native 1600 × 900 photo distinguish the ceramic foot
  // below the bowl, the inset wooden door panel and the narrow vertical metal pull.
  await checkPaintedWords(page, isMobile, testInfo, [
    { word: "toilet base", meaning: "马桶底座", openFromDot: true,
      assertion: "the toilet base is on the photographed ceramic pedestal",
      outlines: [[[980, 689], [1052, 689], [1053, 740], [1048, 752], [990, 748], [979, 731]]] },
  ], sha256);
  await (await image.elementHandle()).waitForElementState("stable");
  const pedestal = await projectPhoto(image, 1022, 744);
  expect(pedestal.visible, "the photographed ceramic pedestal remains in view").toBe(true);
  if (isMobile) await page.touchscreen.tap(pedestal.x, pedestal.y);
  else await page.mouse.click(pedestal.x, pedestal.y);
  const baseCard = page.getByRole("complementary", { name: "toilet base word details", exact: true });
  await expect(baseCard.locator("p").first()).toHaveText("马桶底座");
  await testInfo.attach("toilet-base-photo-reading", { body: await page.screenshot(), contentType: "image/png" });
  await activate(baseCard.getByRole("button", { name: "关闭单词卡" }));
  await expect(baseCard).toBeHidden();

  await checkPaintedWords(page, isMobile, testInfo, [
    { word: "cabinet door", meaning: "柜门", openFromDot: true,
      outlines: [[[493, 522], [548, 522], [548, 637], [493, 637]]] },
    { word: "cabinet handle", meaning: "柜门把手", openFromDot: true,
      outlines: [[[560, 519], [565, 519], [565, 570], [560, 570]]] },
  ], sha256);

  await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  await expect(image).toHaveAttribute("src", "/scenes/apartment-bright-v2.jpg");
});
