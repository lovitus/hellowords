import { expect, test, type Locator } from "@playwright/test";
import { openPhotographedRoute, projectPhoto } from "./photo-journey";

const airport = { id: "airport", photo: "/scenes/airport-terminal-premium-v1.jpg" };
const security = { id: "security-checkpoint", photo: "/scenes/airport-security-checkpoint-premium-v1.jpg" };
const gate = { id: "boarding-gate", photo: "/scenes/airport-boarding-gate-premium-v1.jpg" };
const bridge = { id: "passenger-boarding-bridge", photo: "/scenes/airport-boarding-bridge-premium-v1.jpg" };
const cabin = { id: "aircraft-cabin", photo: "/scenes/aircraft-cabin-premium-v1.jpg" };
const clock = { word: "gate wall clock", meaning: "登机区挂钟", x: 315, y: 213 };
const handset = { word: "emergency phone handset", meaning: "应急电话听筒", x: 347, y: 291 };
const aisle = { word: "cabin center aisle", meaning: "客舱中央过道", x: 883, y: 760 };

test("the boarding gate clock and bridge handset stay readable on the route to the aircraft cabin and back", async ({ page, isMobile }, testInfo) => {
  if (isMobile) await page.setViewportSize({ width: 385, height: 705 });
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  const image = viewer.locator("img.scene-art");
  const canvas = viewer.locator(".label-canvas");
  const cards = page.getByRole("complementary", { name: / word details$/ });
  const bilingual = page.getByTestId("meaning-toggle");
  const activate = (button: Locator) => isMobile ? button.tap() : button.click();
  const steady = async () => (await image.elementHandle()).waitForElementState("stable");
  const state = async () => ({
    scene: await app.getAttribute("data-scene-id"),
    photo: await image.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname),
    readable: Number(await canvas.getAttribute("data-readable-count")),
    cards: await cards.evaluateAll(elements => elements.map(el => ({
      word: el.querySelector("strong")?.textContent,
      meaning: el.querySelector("p")?.textContent,
    }))),
  });
  const save = async (name: string, details: object) => {
    await testInfo.attach(`${name}-result`, {
      body: JSON.stringify({ ...details, ...await state() }), contentType: "application/json",
    });
    await testInfo.attach(name, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
  };
  const settled = async (scene: typeof airport) => {
    await expect(app).toHaveAttribute("data-scene-id", scene.id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(viewer).toHaveAttribute("data-interaction-locked", "false");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => [
      img.currentSrc && new URL(img.currentSrc).pathname, img.naturalWidth, img.naturalHeight,
    ])).toEqual([scene.photo, 1600, 900]);
    await steady();
  };
  const touch = async (x: number, y: number) => {
    await steady();
    const point = await projectPhoto(image, x, y);
    expect(point.visible, `the photographic point (${x}, ${y}) is visible`).toBe(true);
    const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)
      ?.closest('[data-testid="scene-hotspot"]')?.getAttribute("data-target-scene") ?? null, point);
    if (isMobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    return { x, y, point, hitTarget };
  };
  const enter = async (destination: typeof airport, x: number, y: number) => {
    const source = await state();
    const point = await touch(x, y);
    try {
      expect(point.hitTarget, `the visible entry point leads from ${source.scene} to ${destination.id}`).toBe(destination.id);
      await settled(destination);
    } finally {
      await save(`enter-${destination.id}`, { sourceScene: source.scene, sourcePhoto: source.photo, ...point });
    }
  };
  const bilingualInk = (target: typeof clock) => canvas.evaluate((element, { word, meaning }) => {
    type Pill = { word: string; translation: string; width: number; centerX: number; opacity: number };
    const painted = element as HTMLCanvasElement & { paintedLabels?: Pill[] };
    const pill = painted.paintedLabels?.find(item => item.word === word && item.opacity >= 0.52);
    const context = painted.getContext("2d");
    if (!pill || !context) return { word, meaning, painted: false, fits: false };
    const english = context.measureText(word);
    const chinese = context.measureText(meaning);
    // The label painter starts 5 CSS px inside the pill, leaves another 5 px
    // between runs, and draws a 2 px outline centered on each glyph's edge.
    const gap = 5, outline = 1;
    const run = (metrics: TextMetrics, origin: number) => ({
      origin, advance: metrics.width,
      left: origin - metrics.actualBoundingBoxLeft - outline,
      right: origin + metrics.actualBoundingBoxRight + outline,
    });
    const en = run(english, 5);
    const zh = run(chinese, en.origin + en.advance + gap);
    const inkLeft = Math.min(en.left, zh.left), inkRight = Math.max(en.right, zh.right);
    const pillLeft = pill.centerX - pill.width / 2;
    const canvasWidth = painted.getBoundingClientRect().width;
    return {
      word, meaning, painted: true, translated: pill.translation, font: context.font, align: context.textAlign,
      pillWidth: pill.width, english: en, chinese: zh, gap, outline, inkLeft, inkRight,
      remaining: pill.width - inkRight, pillLeft, canvasWidth,
      fits: pill.translation === meaning && inkLeft >= 0 && inkRight <= pill.width &&
        pillLeft + inkLeft >= 0 && pillLeft + inkRight <= canvasWidth,
    };
  }, target);
  const read = async (stage: string, word: typeof clock) => {
    const ink = isMobile && word !== aisle ? await bilingualInk(word) : null;
    if (ink) await save(`${stage}-bilingual-ink`, ink);
    const point = await touch(word.x, word.y);
    try {
      await expect(cards.locator("strong"), `the photograph at (${word.x}, ${word.y}) reads ${word.word}`).toHaveText(word.word);
      await expect(cards.locator("p").first()).toHaveText(word.meaning);
      await expect(bilingual).toHaveAttribute("aria-pressed", "true");
    } finally {
      await save(stage, { expectedWord: word.word, expectedMeaning: word.meaning, ...point });
    }
    if (ink) expect(ink.fits, `the entire bilingual ${word.word} label is visible inside its painted pill`).toBe(true);
    await activate(cards.getByRole("button", { name: "关闭单词卡" }));
    await expect(cards).toBeHidden();
  };
  const back = async (scene: typeof airport) => {
    await activate(page.getByRole("button", { name: "← 返回上一层", exact: true }));
    await settled(scene);
  };

  await openPhotographedRoute(page, isMobile, [["airport", "Airport"]], airport.photo,
    "428e5f9dbcca0f19e8fcedc540a9715362bc55b9b2e51e31d39a4659133f31e1");
  if (await bilingual.getAttribute("aria-pressed") !== "true") await activate(bilingual);
  await activate(page.getByRole("button", { name: "收起小地图", exact: true }));
  await activate(viewer.getByRole("button", { name: "Fit scene", exact: true }));
  await enter(security, 530, 465);
  await enter(gate, 1394, 353);
  await read("gate-clock", clock);
  await enter(bridge, 915, 536);
  await read("bridge-handset", handset);
  await enter(cabin, 756, 325);
  await read("cabin-aisle", aisle);
  await back(bridge);
  await read("returned-bridge-handset", handset);
  await back(gate);
  await read("returned-gate-clock", clock);
  await back(security);
  await back(airport);
  await save("returned-airport", {});
});
