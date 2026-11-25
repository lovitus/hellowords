import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickPaintedWord, paintedWordState } from "./canvas-words";

type Outline = [number, number][];
// Independently traced on the 1600 × 900 photograph. Only the two visible
// caster assemblies belong to the ultrasound cart. The stool has its own wheels.
const objects: { word: string; meaning: string; outlines: Outline[] }[] = [
  { word: "ultrasound cart wheel", meaning: "超声推车脚轮", outlines: [
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

function contains(outline: Outline, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[j];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
  }
  return inside;
}

async function openFromHome(page: Page, isMobile: boolean, stop: "hospital" | "radiology-suite") {
  const app = page.getByTestId("world-app");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  for (const [id, title] of [["city-street", "City street"], ["transit-hub", "Transit hub"], ["urban-services", "Urban services"],
    ["hospital", "Hospital"], ["radiology-suite", "Radiology suite"]]) {
    const entrance = page.getByTestId("scene-minimap").getByRole("button", { name: `进入 ${title}`, exact: true });
    await entrance.scrollIntoViewIfNeeded();
    if (isMobile) await entrance.tap();
    else await entrance.click();
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(page.locator(".viewer-shell:not([data-phase])")).toHaveAttribute("data-interaction-locked", "false");
    if (id === stop) return;
  }
}

function projectPhoto(image: Locator, x: number, y: number) {
  return image.evaluate((img: HTMLImageElement, point) => {
    const photo = img.getBoundingClientRect(), frame = img.closest(".world-viewport")!.getBoundingClientRect();
    const x = photo.left + point.x * photo.width / img.naturalWidth, y = photo.top + point.y * photo.height / img.naturalHeight;
    return {
      crop: Math.max(0, frame.left - photo.left, photo.right - frame.right, frame.top - photo.top, photo.bottom - frame.bottom),
      x, y, visible: x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom,
    };
  }, { x, y });
}

async function magnify(page: Page, isMobile: boolean, point: { x: number; y: number; visible: boolean }, factor: 2 | 4) {
  expect(point.visible, "the gesture starts on the photographed object").toBe(true);
  const paint = () => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  if (!isMobile) {
    await page.mouse.move(point.x, point.y);
    for (let pulse = 0; pulse < factor; pulse++) {
      await page.mouse.wheel(0, -240);
      await paint();
    }
    return;
  }
  const offset = await page.locator(".viewer-shell:not([data-phase]) .world-viewport").evaluate((room, { point, factor }) => {
    const frame = room.getBoundingClientRect();
    return [[32, 0], [0, 32], [23, 23], [-23, 23], [42, 0], [0, 42]].find(([dx, dy]) => [-1, 1].every((side) => {
      const finger = document.elementFromPoint(point.x + side * dx, point.y + side * dy);
      const x = point.x + side * factor * dx, y = point.y + side * factor * dy;
      return finger && room.contains(finger) && !finger.closest("button") && x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom;
    }));
  }, { point, factor });
  expect(offset, "two fingertips can start on the scene and finish in the viewport").toBeDefined();
  const fingers = (spread: number) => [-1, 1].map((side, id) => ({
    x: point.x + side * spread * offset![0], y: point.y + side * spread * offset![1], id: id + 1,
  }));
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(1) });
  try {
    for (let step = 1; step <= 12; step++) {
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(1 + (factor - 1) * step / 12) });
      await paint();
    }
  } finally {
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  }
}

test("hospital radiology keeps ultrasound words on the photograph through Fit, continuous zoom and hospital return", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const surface = viewer.locator(".scene-surface");
  const minimap = page.getByTestId("scene-minimap");
  const index = page.getByTestId("scene-word-index");
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const stable = async () => (await image.elementHandle()).waitForElementState("stable");
  const shot = async (name: string) => testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
  const scale = async () => Number(await surface.getAttribute("data-scene-scale"));
  const asset = "/scenes/radiology-suite-premium-v1.jpg";
  const response = page.waitForResponse((r) => r.ok() && new URL(r.url()).pathname === asset);
  await openFromHome(page, isMobile, "radiology-suite");
  const sha256 = createHash("sha256").update(await (await response).body()).digest("hex");
  expect(sha256).toBe("b61a9331f765812aabc429d86ea935ba00e947fb86b45e487743a410c01cecc5");
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => [new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight]))
    .toEqual([asset, 1600, 900]);
  await activate(minimap.getByRole("button", { name: "收起小地图" }));

  for (const target of objects) {
    const card = page.getByRole("complementary", { name: `${target.word} word details`, exact: true });
    const close = card.getByRole("button", { name: "关闭单词卡" });
    await activate(page.getByTestId("scene-word-index-toggle"));
    await index.getByRole("searchbox").fill(target.word);
    const result = index.getByRole("button").filter({ has: page.getByText(target.word, { exact: true }) });
    const id = (await result.getAttribute("data-label-id"))!;
    await activate(result);
    await expect(card).toBeVisible();
    await stable();
    const point = () => viewer.evaluate((room, id) => {
      const canvas = room.querySelector<HTMLCanvasElement & { paintedLabels?: Array<{
        id: string; anchorX: number; anchorY: number; centerX: number; centerY: number; opacity: number; interactive: boolean;
      }> }>(".label-canvas")!;
      const label = canvas.paintedLabels?.find((item) => item.id === id && item.interactive && item.opacity >= 0.52);
      if (!label) return null;
      const img = room.querySelector<HTMLImageElement>("img.scene-art")!;
      const frame = canvas.getBoundingClientRect(), photo = img.getBoundingClientRect();
      return {
        x: (frame.left + label.anchorX - photo.left) * img.naturalWidth / photo.width,
        y: (frame.top + label.anchorY - photo.top) * img.naturalHeight / photo.height,
        visible: label.anchorX >= 0 && label.anchorX < frame.width && label.anchorY >= 0 && label.anchorY < frame.height,
        clickX: frame.left + label.centerX, clickY: frame.top + label.centerY,
      };
    }, id);
    await expect.poll(point).toMatchObject({ visible: true });
    const anchor = (await point())!;
    const inside = target.outlines.some((outline) => contains(outline, anchor.x, anchor.y));
    const name = target.word.replaceAll(" ", "-");
    await testInfo.attach(`${name}-geometry`, { body: JSON.stringify({ word: target.word, sha256, ...anchor, inside, outlines: target.outlines }), contentType: "application/json" });
    await shot(`${name}-view`);
    const assertion = target.word === "ultrasound cart wheel"
      ? "ultrasound cart wheel leader must end on a photographed cart caster, clear of the blue stool"
      : `${target.word} leader must end on the photographed object`;
    expect(inside, assertion).toBe(true);
    await activate(close);
    await expect(card).toBeHidden();
    await stable();
    if (!(await point())) {
      await activate(viewer.getByRole("button", { name: "Zoom in", exact: true }));
      await stable();
    }
    await expect.poll(() => paintedWordState(page, id)).toMatchObject({ interactive: true });
    await expect.poll(point).toMatchObject({ visible: true });
    const pill = (await point())!;
    expect(target.outlines.some((outline) => contains(outline, pill.x, pill.y)), assertion).toBe(true);
    if (isMobile) await page.touchscreen.tap(pill.clickX, pill.clickY);
    else await clickPaintedWord(page, id);
    await expect(card.locator("strong")).toHaveText(target.word);
    await expect(card.locator("p").first()).toHaveText(target.meaning);
    await shot(`${name}-painted-card`);
    await activate(close);
    await expect(card).toBeHidden();
  }

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
  await expect(image).toHaveAttribute("src", asset);
  expect((await couchView()).visible, "the magnified examination couch stays in view").toBe(true);
  await shot("radiology-couch-magnified");
  const zoomed = await scale(), retreat: number[] = [];
  await expect.poll(async () => {
    if (await app.getAttribute("data-scene-id") === "radiology-suite" && await viewer.getAttribute("data-interaction-locked") === "false") {
      retreat.push(await scale());
      await activate(viewer.getByRole("button", { name: "Zoom out", exact: true }));
    }
    return app.getAttribute("data-scene-id");
  }, { intervals: [400], timeout: 8_000 }).toBe("hospital");
  expect(retreat.some((value) => value < zoomed * 0.9 && value > 0.74), "zooming out crosses an intermediate magnification").toBe(true);
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(image).toHaveAttribute("src", "/scenes/hospital-atrium-premium-v1.jpg");
  await shot("hospital-return");
});

test("hospital console and couch stay in the hospital while magnifying the scanner enters radiology", async ({ page, isMobile }, testInfo) => {
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const scale = async () => Number(await viewer.locator(".scene-surface").getAttribute("data-scene-scale"));
  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const asset = "/scenes/hospital-atrium-premium-v1.jpg";
  const [original] = await Promise.all([
    page.waitForResponse((r) => r.ok() && new URL(r.url()).pathname === asset),
    openFromHome(page, isMobile, "hospital"),
  ]);
  expect(createHash("sha256").update(await original.body()).digest("hex")).toBe("027bfd9596fe551b513c8cd68ebe487553c1d75f21609c7519b88296460116a8");
  await activate(page.getByRole("button", { name: "收起小地图" }));
  for (const [object, x, y, destination] of [
    ["console-monitor", 766, 452, "hospital"], ["padded-couch-end", 806, 536, "hospital"],
    ["scanner-bore", 900, 483, "radiology-suite"],
  ] as const) {
    await test.step(object, async () => {
      await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
      await (await image.elementHandle()).waitForElementState("stable");
      await expect(image).toHaveAttribute("src", asset);
      const point = await projectPhoto(image, x, y);
      await magnify(page, isMobile, point, 4);
      // A wrong early transition is also a completed gesture. Keep its image
      // and scene identity before asserting which object should open radiology.
      let previous = "";
      await expect.poll(async () => {
        const scene = await app.getAttribute("data-scene-id"), zoom = await scale();
        const ready = await app.getAttribute("data-transition-state") === "idle" && (scene !== "hospital" || zoom >= 3.4);
        const current = `${scene}/${zoom}`, settled = ready && current === previous;
        previous = ready ? current : "";
        return settled;
      }, { intervals: [150], message: "the magnified photograph or its destination has settled" }).toBe(true);
      await testInfo.attach(`${object}-gesture`, {
        body: JSON.stringify({ asset, x, y, screen: point, scene: await app.getAttribute("data-scene-id"), scale: await scale() }),
        contentType: "application/json",
      });
      await testInfo.attach(`${object}-end`, { body: await page.screenshot(), contentType: "image/png" });
      await expect(app).toHaveAttribute("data-transition-state", "idle");
      await expect(app, `magnifying the photographed ${object} must leave ${destination} open`).toHaveAttribute("data-scene-id", destination);
      if (destination === "hospital") {
        expect(await scale(), "the ordinary device was inspected past the scanner entry threshold").toBeGreaterThanOrEqual(3.4);
        expect((await projectPhoto(image, x, y)).visible, "the inspected device remains on screen").toBe(true);
      } else {
        await expect(image).toHaveAttribute("src", "/scenes/radiology-suite-premium-v1.jpg");
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1600)).toBe(true);
      }
    });
  }
});
