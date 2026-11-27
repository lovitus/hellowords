import { expect, test, type Locator } from "@playwright/test";
import { paintedWordCount } from "./canvas-words";
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

test("hospital reads the photographed microscope and keeps cancer in the index on department round trips", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90_000);
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const camera = () => viewer.locator(".scene-surface").evaluate(el => getComputedStyle(el).transform);
  const sha256 = await openPhotographedRoute(page, isMobile, hospitalRoute, hospital, "027bfd9596fe551b513c8cd68ebe487553c1d75f21609c7519b88296460116a8");
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));

  // The two foreground microscopes sit behind the laboratory window, with a
  // glass mullion between them. The colored tubes stand in front of the bench.
  const microscope: PhotographedWord = {
    word: "microscope", meaning: "显微镜",
    assertion: "the microscope dot must land on the photographed microscope behind the laboratory window",
    outlines: [
      [[433, 447], [441, 448], [451, 447], [452, 461], [450, 464], [456, 465], [461, 470],
        [457, 474], [462, 477], [467, 485], [467, 527], [459, 528], [434, 528], [413, 527],
        [426, 524], [429, 511], [429, 492], [443, 488], [441, 478], [429, 484], [425, 488],
        [418, 490], [423, 481], [435, 473], [443, 468], [442, 465], [437, 464]],
      [[569, 457], [573, 456], [581, 461], [582, 457], [587, 456], [589, 466], [587, 469],
        [594, 471], [604, 478], [611, 485], [612, 490], [612, 520], [617, 521], [621, 528],
        [618, 530], [604, 532], [586, 531], [583, 530], [584, 520], [587, 517], [583, 509],
        [583, 504], [594, 504], [595, 498], [583, 498], [571, 495], [571, 492], [579, 492],
        [583, 484], [580, 481], [570, 478], [571, 476], [580, 473], [577, 470]],
    ],
  };
  const readMicroscope = async () => {
    await checkPaintedWords(page, isMobile, testInfo, [microscope], sha256);
    await stable();
    // Several microscope parts sit within a few CSS pixels on a phone. Tap
    // the whole instrument's painted dot and check which card actually opens.
    const canvas = viewer.locator(".label-canvas");
    const paintedDot = () => canvas.evaluate((element, word) => {
      type Label = { word: string; interactive: boolean; opacity: number; anchorX: number; anchorY: number };
      const dot = (element as HTMLCanvasElement & { paintedLabels?: Label[] }).paintedLabels
        ?.find(label => label.word === word && label.interactive && label.opacity >= 0.52);
      if (!dot) return null;
      const frame = element.getBoundingClientRect();
      return { x: frame.left + dot.anchorX, y: frame.top + dot.anchorY };
    }, microscope.word);
    await expect.poll(paintedDot, { message: "the microscope dot remains painted after its word card closes" }).not.toBeNull();
    const point = (await paintedDot())!;
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    const card = page.getByRole("complementary", { name: "microscope word details", exact: true });
    await expect(card.locator("strong")).toHaveText(microscope.word);
    await expect(card.getByText(microscope.meaning, { exact: true })).toBeVisible();
    await testInfo.attach("microscope-dot-card", { body: await page.screenshot(), contentType: "image/png" });
    await activate(card.getByRole("button", { name: "关闭单词卡" }));
    await expect(card).toBeHidden();
  };
  await test.step("read the microscope in the hospital photograph", readMicroscope);

  await stable();
  const before = await camera();
  await activate(page.getByTestId("scene-word-index-toggle"));
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill("cancer");
  await activate(index.getByRole("button").filter({ has: page.getByText("cancer", { exact: true }) }));
  const related = page.getByRole("complementary", { name: "cancer word details", exact: true });
  await expect(related.getByText("癌症", { exact: true })).toBeVisible();
  await expect(related.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await stable();
  expect(await camera(), "reading cancer keeps the same view of the microscope").toBe(before);
  expect(await paintedWordCount(page, "cancer"), "cancer has no word painted on the hospital photograph").toBe(0);
  await testInfo.attach("hospital-cancer-index", { body: await page.screenshot(), contentType: "image/png" });
  await activate(related.getByRole("button", { name: "关闭单词卡" }));
  await expect(related).toBeHidden();

  for (const [id, entrance] of [["pathology-lab", /^进入 Pathology lab\b/], ["radiology-suite", /^进入 Radiology suite\b/]] as const) {
    await test.step(`enter ${id} and read the microscope after returning`, async () => {
      await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
      await stable();
      await activate(viewer.getByRole("button", { name: entrance }));
      await expect(app).toHaveAttribute("data-scene-id", id);
      await expect(app).toHaveAttribute("data-transition-state", "idle");
      await activate(page.getByRole("button", { name: /返回上一层/ }));
      await expect(app).toHaveAttribute("data-scene-id", "hospital");
      await expect(app).toHaveAttribute("data-transition-state", "idle");
      await expect(image).toHaveAttribute("src", hospital);
      await readMicroscope();
    });
  }
  for (const [word, meaning, x, y] of [
    ["patient bed", "病床", 201, 535],
    ["medication shelf", "药品货架", 1242, 452],
  ] as const) {
    await test.step(`read ${word} from the photograph after closing its search result`, async () => {
      await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
      await stable();
      await activate(page.getByTestId("scene-word-index-toggle"));
      await index.getByRole("searchbox").fill(word);
      await activate(index.getByRole("button").filter({ has: page.getByText(word, { exact: true }) }));
      const card = page.getByRole("complementary", { name: `${word} word details`, exact: true });
      await expect(card.getByText(meaning, { exact: true })).toBeVisible();
      await stable();
      await activate(card.getByRole("button", { name: "关闭单词卡" }));
      await expect(card).toBeHidden();
      await expect.poll(() => paintedWordCount(page, word)).toBeGreaterThan(0);
      const point = await projectPhoto(image, x, y);
      expect(point.visible).toBe(true);
      if (isMobile) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect(card.getByText(meaning, { exact: true })).toBeVisible();
      await testInfo.attach(`hospital-${word.replaceAll(" ", "-")}-card`, { body: await page.screenshot(), contentType: "image/png" });
      await activate(card.getByRole("button", { name: "关闭单词卡" }));
    });
  }
});

test("pathology lab reads the photographed microtome and keeps histopathology in the index on workstation round trips", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(90_000);
  const labPhoto = "/scenes/pathology-lab-premium-v1.jpg";
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const camera = () => viewer.locator(".scene-surface").evaluate(el => getComputedStyle(el).transform);
  const sha256 = await openPhotographedRoute(page, isMobile, [...hospitalRoute, ["pathology-lab", "Pathology lab"]],
    labPhoto, "1b841750b386bf6d6072971c04a44f15bfcd863413fe0fca8066995bd26a6d7b");
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));

  // Outer edge of the foreground microtome on the 1600 × 900 photograph.
  // The small enclosure behind it and the specimen bottles to its left have their own outlines.
  const microtome: PhotographedWord = {
    word: "microtome", meaning: "切片机", openFromDot: true,
    assertion: "the microtome dot must land on the photographed sectioning instrument at the right of the bench",
    outlines: [
      [[1168, 691], [1171, 688], [1267, 655], [1267, 643], [1293, 639], [1305, 638],
        [1304, 631], [1288, 622], [1307, 593], [1313, 588], [1300, 581], [1302, 568],
        [1306, 563], [1321, 562], [1326, 553], [1332, 520], [1335, 510], [1341, 506],
        [1417, 487], [1425, 486], [1592, 500], [1599, 503], [1599, 678], [1586, 690],
        [1529, 721], [1409, 787], [1401, 788], [1397, 791], [1387, 792], [1373, 790],
        [1373, 787], [1198, 749], [1194, 751], [1183, 750], [1175, 746], [1166, 736]],
    ],
  };
  const readMicrotome = () => checkPaintedWords(page, isMobile, testInfo, [microtome], sha256);
  await test.step("read the microtome in the pathology photograph", readMicrotome);

  await stable();
  const before = await camera();
  await activate(page.getByTestId("scene-word-index-toggle"));
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill("histopathology");
  await activate(index.getByRole("button").filter({ has: page.getByText("histopathology", { exact: true }) }));
  const related = page.getByRole("complementary", { name: "histopathology word details", exact: true });
  await expect(related.getByText("组织病理学", { exact: true })).toBeVisible();
  await expect(related.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await stable();
  expect(await camera(), "reading histopathology keeps the same view of the lab bench").toBe(before);
  expect(await paintedWordCount(page, "histopathology"), "histopathology has no painted word on the lab photograph").toBe(0);
  await testInfo.attach("histopathology-index", { body: await page.screenshot(), contentType: "image/png" });
  await activate(related.getByRole("button", { name: "关闭单词卡" }));
  await expect(related).toBeHidden();

  for (const [id, entrance] of [
    ["microscope-workstation", /^进入 Microscope workstation\b/],
    ["histology-sectioning-workstation", /^进入 Histology sectioning workstation\b/],
  ] as const) {
    await test.step(`enter ${id} and read the microtome on return`, async () => {
      await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
      await stable();
      await activate(viewer.getByRole("button", { name: entrance }));
      await expect(app).toHaveAttribute("data-scene-id", id);
      await expect(app).toHaveAttribute("data-transition-state", "idle");
      await activate(page.getByRole("button", { name: /返回上一层/ }));
      await expect(app).toHaveAttribute("data-scene-id", "pathology-lab");
      await expect(app).toHaveAttribute("data-transition-state", "idle");
      await expect(image).toHaveAttribute("src", labPhoto);
      await readMicrotome();
    });
  }
  await test.step("magnifying the pass-through window stays in the pathology lab", () =>
    checkMagnifiedObject(page, isMobile, testInfo, {
      object: "pass-through-window", x: 189, y: 375,
      scene: "pathology-lab", asset: labPhoto, destination: "pathology-lab", destinationAsset: labPhoto, threshold: 3.4,
    }));
});

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
