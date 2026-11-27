import { expect, test, type Locator, type Page } from "@playwright/test";
import type { PaintedLabel } from "../../app/lib/label-canvas";
import { clickPaintedWord } from "./canvas-words";
import { checkMagnifiedObject, checkPaintedWords, openPhotographedRoute, projectPhoto, zoomBack, type PhotographedWord } from "./photo-journey";

const bedspace = "hospital-inpatient-bedspace";
const emergency = "emergency-department";
const bedPhoto = "/scenes/hospital-inpatient-bedspace-premium-v1.jpg";
const bedPhotoHash = "237730a426a5b8406f6b152f1fd719e98c619685e28616eac4731c71fb4df54f";
const emergencyPhoto = "/scenes/emergency-department-premium-v1.jpg";
const route = [["hospital", "Hospital"], [emergency, "Emergency department"], [bedspace, "Hospital inpatient bedspace"]] as const;

// Measured on the 1600×900 photograph: the upright below the wooden tray and
// the front-right wheel below the footboard. Keep these independent of scene data.
const objects = [
  { name: "table-leg", word: "Bedspace table support leg", meaning: "床位区床旁桌支腿", x: 864, y: 652 },
  { name: "foot-caster", word: "Bedspace foot-end caster", meaning: "床位区床尾脚轮", x: 1346, y: 755 },
] as const;

async function openBilingualBedspace(page: Page, isMobile: boolean) {
  await openPhotographedRoute(page, isMobile, route, bedPhoto, bedPhotoHash);
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const minimap = page.getByTestId("scene-minimap");
  await activate(minimap.getByRole("button", { name: "收起小地图" }));
  await expect(minimap).toHaveAttribute("data-collapsed", "true");
  const meaning = page.getByTestId("meaning-toggle");
  await activate(meaning);
  await expect(meaning).toHaveAttribute("aria-pressed", "true");
}

test("the inpatient bedspace opens the photographed table leg and foot caster and zooms back to emergency", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(100_000);
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const canvas = viewer.locator(".label-canvas");
  const card = page.getByRole("complementary", { name: / word details$/ });
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const screenshot = async (name: string) =>
    testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const paintedWords = () => canvas.evaluate((element) => {
    const labels = (element as HTMLCanvasElement & { paintedLabels?: PaintedLabel[] }).paintedLabels ?? [];
    const bounds = element.getBoundingClientRect();
    return labels.filter(label => label.opacity > 0.025).map(label => ({
      id: label.id, word: label.word, meaning: label.translation,
      opacity: label.opacity, canRead: label.interactive && label.opacity >= 0.52,
      dot: { x: bounds.left + label.anchorX, y: bounds.top + label.anchorY },
      pill: { x: bounds.left + label.centerX, y: bounds.top + label.centerY },
    }));
  });

  await openBilingualBedspace(page, isMobile);
  await expect(viewer.locator(".scene-surface")).toHaveAttribute("data-scene-scale", "1.000");
  await (await image.elementHandle()).waitForElementState("stable");
  await screenshot("bedspace-bilingual-overview");
  const overview = await paintedWords();
  await testInfo.attach("bedspace-overview-words", {
    body: JSON.stringify({ asset: bedPhoto, sha256: bedPhotoHash, labels: overview }), contentType: "application/json",
  });
  const pointerLog = await page.evaluateHandle(() => {
    const events: { type: string; x: number; y: number }[] = [];
    document.addEventListener("pointerdown", event => {
      events.push({ type: event.pointerType, x: event.clientX, y: event.clientY });
    }, { capture: true, passive: true });
    return events;
  });

  for (const target of objects) {
    await test.step(`read the photographed ${target.name} and its painted word`, async () => {
      const photoPoint = await projectPhoto(image, target.x, target.y);
      expect(photoPoint.visible, `${target.name} is visible in the 1× photograph`).toBe(true);
      const label = overview.find(item => item.word === target.word && item.canRead);
      expect.soft(label, `${target.word} has a visible interactive word pill in the bilingual 1× overview`).toBeDefined();

      for (const hit of ["dot", "word"] as const) {
        if (hit === "word") {
          if (!label) continue;
          await clickPaintedWord(page, label.id, isMobile ? "touch" : "mouse");
        } else if (isMobile) {
          await page.touchscreen.tap(photoPoint.x, photoPoint.y);
        } else {
          await page.mouse.click(photoPoint.x, photoPoint.y);
        }

        const key = `${target.name}-${hit}`;
        await expect.soft(card, `${key} opens a word card`).toBeVisible();
        await screenshot(key);
        const hasCard = await card.isVisible();
        const actual = hasCard ? [await card.locator("strong").innerText(), await card.locator("p").first().innerText()] : null;
        const pointer = await pointerLog.evaluate(events => events[events.length - 1]);
        await testInfo.attach(`${key}-hit`, {
          body: JSON.stringify({ pointer, photo: [target.x, target.y], photoPoint, label, actual }),
          contentType: "application/json",
        });
        if (hasCard) {
          expect.soft(actual, `${key} opens the photographed object's bilingual card`).toEqual([target.word, target.meaning]);
          await activate(card.getByRole("button", { name: "关闭单词卡" }));
          await expect(card).toBeHidden();
        }
      }
    });
  }

  const tabletop = { x: 982, y: 449 };
  await checkMagnifiedObject(page, isMobile, testInfo, {
    object: "overbed-tabletop", ...tabletop, scene: bedspace, asset: bedPhoto,
    destination: bedspace, destinationAsset: bedPhoto, threshold: 3.4,
  });
  const scales = await zoomBack(page, isMobile, bedspace, emergency, emergencyPhoto, tabletop);
  await expect.poll(() => image.evaluate((img: HTMLImageElement, asset) =>
    img.complete && img.naturalWidth === 1600 && new URL(img.currentSrc).pathname === asset, emergencyPhoto
  )).toBe(true);
  await expect.soft.poll(paintedWords, { message: "the returned emergency photograph paints words" }).not.toHaveLength(0);
  await screenshot("emergency-return");
  const returnedWords = await paintedWords();
  await testInfo.attach("emergency-return-words", {
    body: JSON.stringify({ asset: emergencyPhoto, scales, words: returnedWords }), contentType: "application/json",
  });
  expect.soft(returnedWords.some(label => label.canRead && label.id.startsWith(`${emergency}-`)),
    "the returned emergency photograph has a readable emergency word").toBe(true);
  expect(returnedWords.filter(label => !label.id.startsWith(`${emergency}-`)),
    "the returned emergency photograph has no visible words from another scene").toEqual([]);
});

// Traced on the same source photograph. The clear jug sits left of the blue
// tumbler. The white handset hangs left of the separate red pull cord.
const bedsideObjects: (PhotographedWord & { x: number; y: number })[] = [
  {
    word: "Bedspace bedside water jug", meaning: "床位区床旁水壶", openFromDot: true, x: 1218, y: 332,
    outlines: [[[1209, 304], [1228, 304], [1232, 339], [1231, 355], [1207, 355], [1207, 324]]],
    assertion: "the water-jug dot lands on the clear jug body on the bedside cabinet",
  },
  {
    word: "Bedspace nurse-call handset", meaning: "床位区护士呼叫手柄", openFromDot: true, x: 1101, y: 235,
    outlines: [[[1092, 202], [1109, 202], [1110, 224], [1108, 249], [1104, 254], [1095, 253], [1092, 244]]],
    assertion: "the nurse-call dot lands on the white handset with the coiled cord",
  },
];

for (const target of bedsideObjects) {
  test(`the inpatient bedspace places the ${target.word} dot on the photographed object`, async ({ page, isMobile }, testInfo) => {
    await openBilingualBedspace(page, isMobile);
    await checkMagnifiedObject(page, isMobile, testInfo, {
      object: target.word, x: target.x, y: target.y, scene: bedspace, asset: bedPhoto,
      destination: bedspace, destinationAsset: bedPhoto, threshold: 3.4,
    });
    await checkPaintedWords(page, isMobile, testInfo, [target], bedPhotoHash);
  });
}
