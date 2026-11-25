import { expect, test, type Locator } from "@playwright/test";
import { checkMagnifiedObject, checkPaintedWords, magnify, openPhotographedRoute, projectPhoto, zoomBack, type PhotographedWord } from "./photo-journey";

const hospital = "/scenes/hospital-atrium-premium-v1.jpg";
const radiology = "/scenes/radiology-suite-premium-v1.jpg";
const hospitalRoute = [["hospital", "Hospital"]] as const;

// Independently traced on the 1600 × 900 photograph. Only the two visible
// caster assemblies belong to the ultrasound cart. The stool has its own wheels.
const objects: PhotographedWord[] = [
  { word: "ultrasound cart wheel", meaning: "超声推车脚轮",
    assertion: "ultrasound cart wheel leader must end on a photographed cart caster, clear of the blue stool", outlines: [
    [[630, 805], [634, 802], [645, 803], [650, 807], [652, 818], [649, 824], [640, 828], [634, 826], [630, 821], [628, 811]],
    [[716, 783], [720, 779], [729, 778], [735, 782], [738, 792], [736, 800], [729, 804], [721, 804], [717, 799], [715, 790]],
  ] },
  { word: "ultrasound monitor", meaning: "超声监视器", outlines: [
    [[615, 523], [619, 518], [704, 512], [709, 516], [709, 575], [705, 579], [620, 587], [615, 583]],
  ] },
  { word: "exam couch cushion", meaning: "检查床垫", outlines: [
    [[746, 616], [752, 605], [812, 590], [826, 589], [842, 594], [879, 632], [880, 638], [889, 639],
      [961, 716], [964, 723], [971, 726], [1027, 783], [1033, 795], [1030, 809], [1022, 817],
      [947, 840], [923, 839], [908, 832], [781, 679], [777, 668], [749, 631]],
  ] },
];

test("hospital radiology keeps ultrasound words on the photograph through Fit, continuous zoom and hospital return", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const scale = async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"));
  const sha256 = await openPhotographedRoute(page, isMobile, [...hospitalRoute, ["radiology-suite", "Radiology suite"]], radiology,
    "b61a9331f765812aabc429d86ea935ba00e947fb86b45e487743a410c01cecc5");
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  await checkPaintedWords(page, isMobile, testInfo, objects, sha256);

  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await stable();
  const couchView = () => projectPhoto(image, 865, 683);
  const fit = await couchView();
  await shot("radiology-fit");
  expect(fit.crop, "Fit reveals all four edges of the radiology photograph").toBeLessThanOrEqual(1);
  const fittedScale = await scale();
  await magnify(page, isMobile, fit, 2);
  await expect.poll(scale).toBeGreaterThan(fittedScale * 1.6);
  await stable();
  await expect(app).toHaveAttribute("data-scene-id", "radiology-suite");
  await expect(image).toHaveAttribute("src", radiology);
  expect((await couchView()).visible, "the magnified examination couch stays in view").toBe(true);
  await shot("radiology-couch-magnified");
  await zoomBack(page, isMobile, "radiology-suite", "hospital", hospital);
  await shot("hospital-return");
});

test("hospital console and couch stay in the hospital while magnifying the scanner enters radiology", async ({ page, isMobile }, testInfo) => {
  await openPhotographedRoute(page, isMobile, hospitalRoute, hospital, "027bfd9596fe551b513c8cd68ebe487553c1d75f21609c7519b88296460116a8");
  const collapse = page.getByRole("button", { name: "收起小地图" });
  if (isMobile) await collapse.tap();
  else await collapse.click();
  for (const [object, x, y, destination] of [
    ["console-monitor", 766, 452, "hospital"], ["padded-couch-end", 806, 536, "hospital"],
    ["scanner-bore", 900, 483, "radiology-suite"],
  ] as const) {
    await test.step(object, () => checkMagnifiedObject(page, isMobile, testInfo, {
      object, x, y, scene: "hospital", asset: hospital, destination, destinationAsset: radiology, threshold: 3.4,
    }));
  }
});
