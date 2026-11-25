import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { checkMagnifiedObject, checkPaintedWords, magnify, openPhotographedRoute, pinch, projectPhoto, zoomBack, type PhotographedWord } from "./photo-journey";

const room = "conference-room";
const consoleScene = "video-conferencing-console";
const roomAsset = "/scenes/conference-room-premium-v1.jpg";
const roomHash = "d12438f3e95d9d580d0beb21b18baa7547d921ce18f205a61b279219a82533e1";
const consoleAsset = "/scenes/video-conferencing-console-premium-v1.jpg";
const roomRoute = [["office-building", "Office building"], [room, "Conference room"]] as const;

// Traced independently on the 1600 × 900 close-up. The microphone outline
// stops at its body, and the tilted touch screen stops inside its black bezel.
const devices: PhotographedWord[] = [
  { word: "right microphone pod", meaning: "右侧麦克风单元", openFromDot: true,
    assertion: "right microphone pod leader must end on the photographed front-right microphone body",
    outlines: [[[1196, 779], [1200, 774], [1212, 767], [1232, 763], [1251, 762], [1273, 762],
      [1296, 764], [1317, 770], [1332, 777], [1342, 785], [1345, 793], [1344, 816],
      [1337, 826], [1320, 834], [1298, 839], [1274, 840], [1252, 838], [1231, 833],
      [1212, 825], [1202, 815], [1197, 803]]] },
  { word: "meeting console screen", meaning: "会议触控台屏幕",
    outlines: [[[951, 646], [1091, 669], [1041, 788], [906, 750]]] },
  { word: "conference video bar", meaning: "会议视频条",
    outlines: [[[694, 458], [698, 454], [958, 454], [962, 458], [962, 492],
      [959, 496], [698, 496], [694, 492]]] },
];

async function pinchFromEntrance(page: Page, testInfo: TestInfo) {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const fit = viewer.getByRole("button", { name: "Fit scene", exact: true });
  const scale = async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"));
  await fit.tap();
  await (await image.elementHandle()).waitForElementState("stable");
  const before = await scale();
  const button = viewer.locator(`[data-testid="scene-hotspot"][data-target-scene="${consoleScene}"]`);
  const start = await button.evaluate((entrance) => {
    const viewport = entrance.closest(".world-viewport")!;
    const frame = viewport.getBoundingClientRect();
    const photo = viewport.querySelector("img.scene-art")!.getBoundingClientRect();
    const bounds = entrance.getBoundingClientRect();
    const first = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    if (!entrance.contains(document.elementFromPoint(first.x, first.y))) return null;
    for (const [dx, dy] of [[64, 0], [-64, 0], [0, 64], [0, -64]]) {
      const second = { x: first.x + dx, y: first.y + dy };
      const hit = document.elementFromPoint(second.x, second.y);
      if (!hit || !viewport.contains(hit) || hit.closest("button, a, input")) continue;
      if (second.x <= photo.left || second.x >= photo.right || second.y <= photo.top || second.y >= photo.bottom) continue;
      // A 1.8× spread finishes 40% farther out at each end.
      if ([-0.4, 1.4].every(k => first.x + k * dx > frame.left && first.x + k * dx < frame.right &&
        first.y + k * dy > frame.top && first.y + k * dy < frame.bottom)) return { first, second };
    }
    return null;
  });
  expect(start, "one fingertip starts on the gold entrance button and one on the adjacent photograph").toBeTruthy();
  await pinch(page, start!.first, start!.second, 1.8);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await (await image.elementHandle()).waitForElementState("stable");
  const after = await scale(), scene = await app.getAttribute("data-scene-id");
  await testInfo.attach("display-button-pinch-geometry", { body: JSON.stringify({ start, before, after, scene }), contentType: "application/json" });
  await testInfo.attach("display-button-pinch-end", { body: await page.screenshot(), contentType: "image/png" });
  expect(scene === room && after > before * 1.4 && after < 3.45,
    "pinching from the gold display entrance must magnify the conference room without opening the console").toBe(true);
  await fit.tap();
  await expect.poll(scale).toBeCloseTo(before);
}

test("office console keeps the painted microphone, touch screen and video bar on their devices and zooms back to the conference room", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const scale = async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"));
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const sha256 = await openPhotographedRoute(page, isMobile, [...roomRoute, [consoleScene, "Video-conferencing console"]], consoleAsset,
    "191dcac69bbc53f5ec57497dc078f00d48c06104051886102b4fbf1ab0e863a5");

  await stable();
  const entryScale = await scale();
  const entryDevices = [];
  for (const [device, left, top, right, bottom] of [
    ["left-front-microphone", 367, 741, 506, 816], ["right-front-microphone", 1195, 762, 1346, 840],
    ["touch-console", 885, 628, 1122, 839],
  ] as const) {
    entryDevices.push({ device, topLeft: await projectPhoto(image, left, top), bottomRight: await projectPhoto(image, right, bottom) });
  }
  await testInfo.attach("console-entry-geometry", { body: JSON.stringify({ sha256, entryScale, entryDevices }), contentType: "application/json" });
  await shot("console-entry");
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  await checkPaintedWords(page, isMobile, testInfo, devices, sha256);
  for (const { device, topLeft, bottomRight } of entryDevices) {
    expect(topLeft.visible && bottomRight.visible, `the entry photograph shows the whole ${device}`).toBe(true);
  }

  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await stable();
  const touchScreen = () => projectPhoto(image, 1003, 714);
  const fit = await touchScreen();
  const fitScale = await scale();
  await shot("console-fit");
  expect(fit.crop, "Fit reveals all four edges of the console photograph").toBeLessThanOrEqual(1);
  if (isMobile) expect(entryScale, "phone entry brings the microphones closer than Fit").toBeGreaterThan(fitScale);
  await magnify(page, isMobile, fit, 2);
  await expect.poll(scale).toBeGreaterThan(fitScale * 1.6);
  await stable();
  await expect(app).toHaveAttribute("data-scene-id", consoleScene);
  await expect(image).toHaveAttribute("src", consoleAsset);
  const magnified = await touchScreen();
  expect(magnified.visible, "the magnified touch screen stays in view").toBe(true);
  const wordCard = page.getByRole("complementary", { name: / word details$/ });
  await expect(wordCard, "magnifying the touch screen leaves its word cards closed").toHaveCount(0);
  await shot("console-touch-screen-magnified");

  if (isMobile) {
    const touch = await page.context().newCDPSession(page);
    const finger = (dx: number) => [{ id: 1, x: magnified.x + dx, y: magnified.y }];
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: finger(0) });
    try {
      for (const dx of [8, 16, 24, 32]) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: finger(dx) });
    } finally {
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await touch.detach();
    }
  } else {
    await page.mouse.move(magnified.x, magnified.y);
    await page.mouse.down();
    await page.mouse.move(magnified.x + 32, magnified.y, { steps: 4 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await touchScreen()).x - magnified.x, { message: "dragging across the touch screen pans the photograph" })
    .toBeGreaterThan(20);
  await expect(wordCard, "panning the photograph leaves its word cards closed").toHaveCount(0);

  const conversationButton = page.getByRole("button", { name: "情景会话", exact: true });
  const tapEvidence = await conversationButton.evaluateHandle(button => {
    const bounds = button.getBoundingClientRect();
    const evidence = {
      centerHitsButton: button.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)),
      events: [] as Array<{ type: string; onButton: boolean; x: number; y: number }>,
    };
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"]) {
      document.addEventListener(type, event => {
        const pointer = event as MouseEvent;
        evidence.events.push({ type, onButton: button.contains(event.target as Node), x: pointer.clientX, y: pointer.clientY });
      }, { capture: true, once: true });
    }
    return evidence;
  });
  await activate(conversationButton);
  const dialog = page.getByRole("dialog", { name: "在这里怎么说" });
  try {
    await expect(dialog, "one tap opens the device conversation after panning").toBeVisible();
  } finally {
    await testInfo.attach("conversation-trigger-input", { body: JSON.stringify(await tapEvidence.jsonValue()), contentType: "application/json" });
    await tapEvidence.dispose();
  }
  const line = dialog.getByRole("listitem").filter({ hasText: "Use the tilted touch panel between the two round microphones." });
  await expect(line.locator('p[lang="en"]')).toBeVisible();
  await expect(line.locator('p[lang="zh-CN"]')).toHaveText("用两个圆形麦克风之间那块倾斜的触控屏。");
  await expect(line.locator('p[lang="zh-CN"]')).toBeVisible();
  await shot("console-conversation");
  await activate(dialog.getByRole("button", { name: "关闭情景会话" }));
  await expect(dialog).toBeHidden();
  const retreat = await zoomBack(page, isMobile, consoleScene, room, roomAsset, { x: 1003, y: 714 });
  await testInfo.attach("console-retreat-gesture", {
    body: JSON.stringify({ input: isMobile ? "pinch" : "wheel", retreat, scene: await app.getAttribute("data-scene-id") }),
    contentType: "application/json",
  });
  await shot("conference-room-return");
  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await stable();
  const roomFit = await projectPhoto(image, 940, 280);
  await shot("conference-room-fit");
  expect(roomFit.crop, "Fit reveals all four edges of the conference room photograph").toBeLessThanOrEqual(1);
});

test("office conference room keeps the bare tabletop and wall in view while magnifying the wall display opens its console", async ({ page, isMobile }, testInfo) => {
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  await openPhotographedRoute(page, isMobile, roomRoute, roomAsset, roomHash);
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  // The plain tabletop and the wall below the video bar are both inside
  // the old entrance rectangle. The display face is identifiable in both photos.
  for (const [object, x, y, destination] of [
    ["bare-tabletop", 890, 552, room], ["wall-below-video-bar", 930, 406, room], ["wall-display", 940, 280, consoleScene],
  ] as const) {
    if (isMobile && object === "wall-display") await pinchFromEntrance(page, testInfo);
    await test.step(object, () => checkMagnifiedObject(page, isMobile, testInfo, {
      object, x, y, scene: room, asset: roomAsset, destination, destinationAsset: consoleAsset, threshold: 3.45,
    }));
  }
});

test("mobile pinch from the gold display entrance stays in the conference room", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "This gesture starts with two fingers.");
  await openPhotographedRoute(page, isMobile, roomRoute, roomAsset, roomHash);
  await page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }).tap();
  await pinchFromEntrance(page, testInfo);
});

test("conference room returns to a readable photograph and labels the photographed chair and credenza", async ({ page, isMobile }, testInfo) => {
  await openPhotographedRoute(page, isMobile, roomRoute, roomAsset, roomHash);
  const minimap = page.getByTestId("scene-minimap");
  const collapse = minimap.getByRole("button", { name: "收起小地图" });
  if (isMobile) await collapse.tap();
  else await collapse.click();
  await checkPaintedWords(page, isMobile, testInfo, [
    { word: "far chair backrest", meaning: "远侧椅背", assertion: "far chair backrest ends on the farthest left chair back",
      outlines: [[[776, 386], [782, 383], [808, 383], [820, 429], [782, 438]]] },
    { word: "meeting-room plant pot", meaning: "会议室植物盆",
      outlines: [[[474, 365], [510, 365], [506, 391], [478, 393]]] },
    { word: "credenza drawer handle", meaning: "边柜抽屉把手",
      outlines: [[[95, 573], [105, 572], [137, 565], [141, 565], [141, 567], [105, 576], [95, 576]]] },
  ], roomHash);
});

test("phone returns to the furnished room before Fit", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "Portrait phone composition");
  await openPhotographedRoute(page, true, [...roomRoute, [consoleScene, "Video-conferencing console"]], consoleAsset,
    "191dcac69bbc53f5ec57497dc078f00d48c06104051886102b4fbf1ab0e863a5");
  await page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }).tap();
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  await zoomBack(page, true, consoleScene, room, roomAsset, { x: 1003, y: 714 });
  await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
  await (await image.elementHandle()).waitForElementState("stable");
  const coverage = await image.evaluate(img => {
    const photo = img.getBoundingClientRect();
    const frame = img.closest(".world-viewport")!.getBoundingClientRect();
    const w = Math.min(frame.right, photo.right) - Math.max(frame.left, photo.left);
    const h = Math.min(frame.bottom, photo.bottom) - Math.max(frame.top, photo.top);
    return w * h / (frame.width * frame.height);
  });
  const display = await projectPhoto(image, 940, 280);
  const tabletop = await projectPhoto(image, 890, 552);
  await testInfo.attach("returned-room-framing", {
    body: JSON.stringify({ coverage, display, tabletop }), contentType: "application/json",
  });
  await testInfo.attach("returned-room-portrait", { body: await page.screenshot(), contentType: "image/png" });
  expect(coverage, "the returned photograph fills half of the exploration area").toBeGreaterThanOrEqual(0.5);
  expect(display.visible && tabletop.visible, "the front display and conference table stay in view").toBe(true);
  await viewer.getByRole("button", { name: "Fit scene", exact: true }).tap();
  await (await image.elementHandle()).waitForElementState("stable");
  expect((await projectPhoto(image, 940, 280)).crop, "Fit shows all four edges").toBeLessThanOrEqual(1);
});
