import { createHash } from "node:crypto";
import { expect, test, type Locator, type Response } from "@playwright/test";
import type { PaintedLabel } from "../../app/lib/label-canvas";
import { clickPaintedWord } from "./canvas-words";
import { checkMagnifiedObject, openPhotographedRoute, projectPhoto, zoomBack } from "./photo-journey";

const breakRoom = "office-break-room";
const roomPhoto = "/scenes/office-break-room-premium-v1.jpg";
const roomHash = "1fe63b2f3ca69e6a33f655c583c01655118ad4400b8b0d95342f04ab75f0f53d";
const route = [["office-building", "Office building"], [breakRoom, "Office break room"]] as const;
type PhotoWord = { word: string; meaning: string; x: number; y: number };

const stations = [
  {
    name: "coffee", scene: "office-coffee-station", sha256: "9bac4f9ebef7c21d37e2c1bec3f1d2652c9741482862eae17fad1939b7e9fff0",
    entrance: { object: "coffee-maker-housing", x: 550, y: 246 },
    detail: { word: "coffee pot", meaning: "咖啡壶", x: 758, y: 367 },
    onReturn: { word: "coffee carafe", meaning: "咖啡玻璃壶", x: 558, y: 295 },
  },
  {
    name: "tea", scene: "office-tea-station", sha256: "f4c375d1de6f57b65aa1ceee0dede02e702f60eb5841a8bf086c5130f98358ff",
    entrance: { object: "tea-packet", x: 752, y: 312 },
    detail: { word: "glass teapot", meaning: "玻璃茶壶", x: 807, y: 714 },
    onReturn: { word: "electric kettle", meaning: "电热水壶", x: 648, y: 293 },
  },
] as const;

for (const station of stations) {
  test(`the office break room opens the ${station.name} station and returns to the break room by zoom`, async ({ page, isMobile }, testInfo) => {
    test.setTimeout(100_000);
    const app = page.getByTestId("world-app");
    const viewer = page.locator(".viewer-shell:not([data-phase])");
    const image = viewer.locator("img.scene-art");
    const stationPhoto = `/scenes/${station.scene}-premium-v1.jpg`;
    const activate = (control: Locator) => isMobile ? control.tap() : control.click();
    const screenshot = async (key: string) =>
      testInfo.attach(key, { body: await page.screenshot(), contentType: "image/png" });

    const readPhotoWord = async ({ word, meaning, x, y }: PhotoWord, key: string) => {
      await (await image.elementHandle()).waitForElementState("stable");
      const dot = await projectPhoto(image, x, y);
      expect(dot.visible, `${word} is visible before opening the index or zooming`).toBe(true);
      await screenshot(`${key}-before`);
      const labelId = () => viewer.locator(".label-canvas").evaluate((canvas, word) => {
        const labels = (canvas as HTMLCanvasElement & { paintedLabels?: PaintedLabel[] }).paintedLabels ?? [];
        return labels.find(label => label.word === word && label.interactive && label.opacity >= 0.52)?.id ?? null;
      }, word);
      await expect.poll(labelId, { message: `${word} is painted on the current photograph` }).not.toBeNull();
      const id = (await labelId())!;
      const card = page.getByRole("complementary", { name: `${word} word details`, exact: true });
      for (const hit of ["dot", "word"] as const) {
        if (hit === "word") await clickPaintedWord(page, id, isMobile ? "touch" : "mouse");
        else if (isMobile) await page.touchscreen.tap(dot.x, dot.y);
        else await page.mouse.click(dot.x, dot.y);
        await expect(card).toBeVisible();
        await screenshot(`${key}-${hit}`);
        await expect(card.locator("strong")).toHaveText(word);
        await expect(card.locator("p").first()).toHaveText(meaning);
        await activate(card.getByRole("button", { name: "关闭单词卡" }));
        await expect(card).toBeHidden();
      }
    };

    let stationResponse: Response | undefined;
    page.on("response", response => {
      if (response.ok() && new URL(response.url()).pathname === stationPhoto) stationResponse = response;
    });
    await openPhotographedRoute(page, isMobile, route, roomPhoto, roomHash);
    await activate(page.getByTestId("scene-minimap").getByRole("button", { name: "收起小地图" }));
    const meaningToggle = page.getByTestId("meaning-toggle");
    await activate(meaningToggle);
    await expect(meaningToggle).toHaveAttribute("aria-pressed", "true");

    await test.step("magnify the photographed entrance in the break room", async () => {
      await checkMagnifiedObject(page, isMobile, testInfo, {
        ...station.entrance, scene: breakRoom, asset: roomPhoto, destination: station.scene,
        destinationAsset: stationPhoto, threshold: 3.4,
      });
      expect(stationResponse, "the browser loaded the station photograph").toBeDefined();
      const sha256 = createHash("sha256").update(await stationResponse!.body()).digest("hex");
      const size = await image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
      await testInfo.attach("station-photo", { body: JSON.stringify({ asset: stationPhoto, sha256, size }), contentType: "application/json" });
      expect(sha256).toBe(station.sha256);
      expect(size).toEqual([1600, 900]);
    });
    await test.step("read the station object and inspect it at higher magnification", async () => {
      await readPhotoWord(station.detail, "station-object-arrival");
      await checkMagnifiedObject(page, isMobile, testInfo, {
        object: "station-object", x: station.detail.x, y: station.detail.y, scene: station.scene, asset: stationPhoto,
        destination: station.scene, destinationAsset: stationPhoto, threshold: 3.4,
      });
    });
    await test.step("zoom back and read the object on the break room counter", async () => {
      const scales = await zoomBack(page, isMobile, station.scene, breakRoom, roomPhoto, station.detail);
      await testInfo.attach("station-return", { body: JSON.stringify(scales), contentType: "application/json" });
      await readPhotoWord(station.onReturn, "break-room-object-return");
      if (station.name === "coffee") {
        await readPhotoWord({ word: "drip coffee maker", meaning: "滴滤式咖啡机", x: 589, y: 249 }, "break-room-brewer-return");
      }
      await expect(app).toHaveAttribute("data-scene-id", breakRoom);
    });
  });
}
