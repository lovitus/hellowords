import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { checkMagnifiedObject, checkPaintedWords, magnify, openPhotographedRoute, pinch, projectPhoto, zoomBack, type PhotographedWord } from "./photo-journey";

const room = "conference-room";
const consoleScene = "video-conferencing-console";
const roomAsset = "/scenes/conference-room-premium-v1.jpg";
const roomHash = "d12438f3e95d9d580d0beb21b18baa7547d921ce18f205a61b279219a82533e1";
const consoleAsset = "/scenes/video-conferencing-console-premium-v1.jpg";
const roomRoute = [["office-building", "Office building"], [room, "Conference room"]] as const;
const workstation = "open-plan-workstation";
const workstationRoute = [roomRoute[0], [workstation, "Open-plan workstation"]] as const;
const workstationAsset = "/scenes/open-plan-workstation-premium-v1.jpg";
const workstationHash = "9acbbe66dd5fb56faa58562c07219f723bb39d12d535648fa7be6e3abcd7f1df";

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

test("open-plan workstation labels its photographed mouse, drawer handle and shared printer before returning to the office", async ({ page, isMobile }, testInfo) => {
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const sha256 = await openPhotographedRoute(page, isMobile, workstationRoute, workstationAsset, workstationHash);
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  await checkPaintedWords(page, isMobile, testInfo, [
    { word: "Open-plan left mouse", meaning: "左侧工位鼠标",
      assertion: "left mouse leader ends on the mouse body above its pad",
      outlines: [[[303, 491], [304, 488], [307, 486], [312, 484], [318, 484], [323, 486],
        [325, 488], [325, 490], [322, 492], [316, 494], [304, 494]]] },
    { word: "Open-plan center drawer handle", meaning: "中央工位抽屉拉手",
      assertion: "center drawer handle leader ends on a black pull of the center pedestal",
      outlines: [
        [[1002, 581], [1005, 581], [1006, 582], [1033, 582], [1034, 581], [1038, 581], [1038, 585], [1002, 585]],
        [[1002, 627], [1005, 627], [1006, 628], [1033, 628], [1034, 627], [1038, 627], [1038, 632], [1002, 632]],
        [[1002, 672], [1005, 672], [1006, 673], [1033, 673], [1034, 672], [1038, 672], [1038, 677], [1002, 677]],
      ] },
    { word: "Shared open-plan printer", meaning: "共享办公打印机",
      assertion: "shared printer leader ends on the printer inside the wooden cubby",
      outlines: [[[499, 425], [508, 421], [522, 419], [580, 419], [584, 422],
        [584, 467], [575, 474], [499, 474]]] },
  ], sha256);
  await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-id", "office-building");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(".viewer-shell:not([data-phase]) img.scene-art")).toHaveAttribute("src", "/scenes/office-atrium-premium-v1.jpg");
});

test("open-plan workstation zoom keeps the printer and chair caster in the room and opens desktop equipment from the keyboard", async ({ page, isMobile }, testInfo) => {
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const equipment = "desktop-workstation-equipment";
  await openPhotographedRoute(page, isMobile, workstationRoute, workstationAsset, workstationHash);
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  for (const [object, x, y, destination] of [
    ["shared printer", 543, 447, workstation],
    ["chair caster", 682, 743, workstation],
    ["center keyboard", 853, 487, equipment],
  ] as const) {
    await test.step(object, () => checkMagnifiedObject(page, isMobile, testInfo, {
      object, x, y, scene: workstation, asset: workstationAsset, destination,
      destinationAsset: "/scenes/desktop-workstation-equipment-premium-v1.jpg", threshold: 3.2,
    }));
  }
  await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-id", workstation);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(".viewer-shell:not([data-phase]) img.scene-art")).toHaveAttribute("src", workstationAsset);
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

test("zooming into the office counter and rear monitor follows the photographed entrances", async ({ page, isMobile }, testInfo) => {
  const office = "office-building";
  const officeAsset = "/scenes/office-atrium-premium-v1.jpg";
  const app = page.getByTestId("world-app");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  await openPhotographedRoute(page, isMobile, [roomRoute[0]], officeAsset,
    "9403fc42abf40af87d59f9a12401e5dcff76256fc13870a7780e79ae8e3a7cdf");
  await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
  for (const [object, x, y, destination, destinationAsset] of [
    ["reception-counter", 335, 672, "office-reception-lobby", "/scenes/office-reception-lobby-premium-v1.jpg"],
    ["rear-monitor", 473, 497, "open-plan-workstation", "/scenes/open-plan-workstation-premium-v1.jpg"],
    ["wheel-caster", 483, 577, office, officeAsset],
    ["chair-back", 190, 590, office, officeAsset],
  ] as const) {
    await test.step(object, async () => {
      await checkMagnifiedObject(page, isMobile, testInfo, {
        object, x, y, scene: office, asset: officeAsset, destination, destinationAsset, threshold: 3.5,
      });
      if (destination !== office) {
        await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
        await expect(app).toHaveAttribute("data-scene-id", office);
        await expect(app).toHaveAttribute("data-transition-state", "idle");
        await expect(page.locator(".viewer-shell:not([data-phase])")).toHaveAttribute("data-interaction-locked", "false");
      }
    });
  }
});

test("phone can switch between the photographed rack and its light with a word card open", async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, "Portrait phone word card");
  await openPhotographedRoute(page, true, [roomRoute[0]], "/scenes/office-atrium-premium-v1.jpg",
    "9403fc42abf40af87d59f9a12401e5dcff76256fc13870a7780e79ae8e3a7cdf");
  await page.getByTestId("scene-minimap").getByRole("button", { name: /^聚焦 Service core，/ }).tap();
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  await expect(viewer.locator(".scene-surface")).toHaveAttribute("data-scene-scale", "1.800");
  const canvas = viewer.locator(".label-canvas");
  const geometry = (id: string) => canvas.evaluate((el, id) => {
    const label = (el as HTMLCanvasElement & { paintedLabels?: Array<{
      id: string; centerX: number; centerY: number; width: number; height: number;
      anchorX: number; anchorY: number; opacity: number; interactive: boolean;
    }> }).paintedLabels?.find(word => word.id === id && word.interactive && word.opacity >= 0.52);
    if (!label) return null;
    const frame = el.getBoundingClientRect();
    const x = frame.left + label.centerX, y = frame.top + label.centerY;
    const dotX = frame.left + label.anchorX, dotY = frame.top + label.anchorY;
    const dock = document.querySelector(".word-dock")?.getBoundingClientRect();
    const dotClearance = dock ? Math.hypot(Math.max(dock.left - dotX, dotX - dock.right, 0),
      Math.max(dock.top - dotY, dotY - dock.bottom, 0)) : null;
    const pillClear = !dock || x + label.width / 2 <= dock.left || x - label.width / 2 >= dock.right ||
      y + label.height / 2 <= dock.top || y - label.height / 2 >= dock.bottom;
    return { x, y, dotX, dotY, dotClearance, pillClear };
  }, id);

  for (const [id, word, meaning] of [
    ["server-rack", "server rack", "服务器机架"],
    ["rack-light", "rack light", "机架指示灯"],
    ["server-rack", "server rack", "服务器机架"],
  ] as const) {
    await expect.poll(() => geometry(id)).not.toBeNull();
    const tap = (await geometry(id))!;
    await page.touchscreen.tap(tap.x, tap.y);
    const card = page.getByRole("complementary", { name: `${word} word details`, exact: true });
    await expect(card.getByText(meaning, { exact: true })).toBeVisible();
    await (await card.elementHandle()).waitForElementState("stable");
    const after = (await geometry(id))!;
    await testInfo.attach(`${id}-position`, { body: JSON.stringify(after), contentType: "application/json" });
    await testInfo.attach(`${id}-card`, { body: await page.screenshot(), contentType: "image/png" });
    expect(after.dotClearance, "the open card leaves the whole five-pixel anchor ring visible").toBeGreaterThanOrEqual(5);
    expect(after.pillClear, "the selected word is visible on the photograph").toBe(true);
  }
  await page.getByRole("button", { name: "关闭单词卡" }).tap();
  await expect(page.getByRole("complementary", { name: /word details$/ })).toHaveCount(0);
  await expect(viewer.locator(".scene-surface")).toHaveAttribute("data-scene-scale", "1.800");
});

test("returning to the office restores the atrium photograph and its own object labels", async ({ page, isMobile }, testInfo) => {
  const office = "office-building";
  const officeAsset = "/scenes/office-atrium-premium-v1.jpg";
  if (!isMobile) await page.setViewportSize({ width: 1125, height: 610 });
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const minimap = page.getByTestId("scene-minimap");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const paintedIds = () => viewer.locator("canvas.label-canvas").evaluate(canvas => {
    const { paintedLabels = [] } = canvas as HTMLCanvasElement & { paintedLabels?: Array<{ id: string; opacity: number }> };
    return paintedLabels.filter(label => label.opacity > 0.025).map(label => label.id);
  });
  const settled = async (id: string, asset: string) => {
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) =>
      [img.currentSrc && new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight]
    )).toEqual([asset, 1600, 900]);
    await (await image.elementHandle()).waitForElementState("stable");
  };

  const [officeResponse, sha256] = await Promise.all([
    page.waitForResponse(response => response.ok() && new URL(response.url()).pathname === "/data/scenes/office-building.json"),
    openPhotographedRoute(page, isMobile, [roomRoute[0]], officeAsset,
      "9403fc42abf40af87d59f9a12401e5dcff76256fc13870a7780e79ae8e3a7cdf"),
  ]);
  const officeData: { id: string; labels: Array<{ id: string }> } = await officeResponse.json();
  expect(officeData.id).toBe(office);
  const officeIds = new Set(officeData.labels.map(label => label.id));
  const meanings = page.getByTestId("meaning-toggle");
  if (await meanings.getAttribute("aria-pressed") === "false") await activate(meanings);
  await shot("office-atrium-entry");
  for (const [id, title, asset] of [
    [room, "Conference room", roomAsset], [consoleScene, "Video-conferencing console", consoleAsset],
  ] as const) {
    await activate(minimap.getByRole("button", { name: `进入 ${title}`, exact: true }));
    await settled(id, asset);
    await expect.poll(async () => (await paintedIds()).some(labelId => labelId.startsWith(`${id}-`))).toBe(true);
  }
  const back = page.getByRole("button", { name: "← 返回上一层", exact: true });
  for (const [id, asset] of [[room, roomAsset], [office, officeAsset]] as const) {
    await activate(back);
    await settled(id, asset);
  }

  await expect.poll(paintedIds).not.toHaveLength(0);
  const returnedIds = await paintedIds();
  await shot("office-atrium-return");
  await activate(minimap.getByRole("button", { name: "收起小地图" }));

  await activate(page.getByTestId("scene-word-index-toggle"));
  const index = page.getByTestId("scene-word-index");
  await index.getByRole("searchbox").fill("camera lens");
  const lensResult = index.getByRole("button").filter({ has: page.getByText("camera lens", { exact: true }) });
  const spatialId = await lensResult.getAttribute("data-label-id");
  await shot("office-camera-lens-index");
  await activate(lensResult);
  const lensCard = page.getByRole("complementary", { name: "camera lens word details", exact: true });
  await expect(lensCard).toBeVisible();
  const afterLensIds = await paintedIds();
  const observedIds = new Set([...returnedIds, ...afterLensIds]);
  const foreignIds = [...observedIds].filter(id => !officeIds.has(id));
  const cameraLensPinned = spatialId !== null || observedIds.has("camera-lens");
  await testInfo.attach("office-return-words", {
    body: JSON.stringify({ sha256, returnedIds, afterLensIds, spatialId, foreignIds, cameraLensPinned }),
    contentType: "application/json",
  });
  await shot("office-camera-lens-card");
  expect(cameraLensPinned, "the office overview does not pin a camera lens on the atrium").toBe(false);
  expect(foreignIds, "every painted ID belongs to the returned office photograph").toEqual([]);
  expect(spatialId, "the searchable camera lens has no spatial target").toBeNull();
  await expect(lensCard.getByText("相关词 · 图中未标注", { exact: true })).toBeVisible();
  await expect(lensCard.getByText("摄像头镜头", { exact: true })).toBeVisible();
  await activate(lensCard.getByRole("button", { name: "关闭单词卡" }));
  await expect(lensCard).toBeHidden();
  const legend = await viewer.getByTestId("scene-cue-legend").boundingBox();
  const conversation = await page.getByRole("button", { name: "情景会话", exact: true }).boundingBox();
  expect(legend && conversation && (legend.x + legend.width <= conversation.x ||
    legend.y >= conversation.y + conversation.height), "the zoom legend leaves the conversation button clear").toBe(true);

  // The black monitor on the open-plan desk is visible through the left side of the atrium.
  await checkPaintedWords(page, isMobile, testInfo, [
    { word: "monitor", meaning: "显示器", outlines: [[[459, 486], [491, 485], [491, 507], [459, 508]]] },
  ], sha256);
});
