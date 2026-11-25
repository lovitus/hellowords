import { expect, test } from "@playwright/test";

const kitchenData = "/data/scenes/kitchen.json";
const kitchenArt = "/scenes/kitchen-premium-v3.jpg";

interface KitchenTrace {
  data: { id: string; asset: string; width: number; height: number } | null;
  decodeStarts: number;
  decodedSize: number[] | null;
}

declare global {
  interface Window {
    kitchenPrefetchTrace: KitchenTrace;
  }
}

test("apartment reads kitchen data and warms its original artwork on minimap focus", async ({ page }) => {
  let artworkRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === kitchenArt) artworkRequests++;
  });

  await page.addInitScript(({ dataPath, artPath }) => {
    const trace: KitchenTrace = { data: null, decodeStarts: 0, decodedSize: null };
    window.kitchenPrefetchTrace = trace;

    // Observe the page consuming its own HTTP response. Issuing a fetch from
    // the test would pass even if the application stopped prefetching the JSON.
    const readJson = Response.prototype.json;
    Response.prototype.json = function (this: Response) {
      const result = readJson.call(this);
      if (this.ok && this.url && new URL(this.url).pathname === dataPath) {
        void result.then(({ id, asset, width, height }) => {
          trace.data = { id, asset, width, height };
        }, () => undefined);
      }
      return result;
    };

    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      const result = decode.call(this);
      const src = this.currentSrc || this.src;
      if (src && new URL(src, location.href).pathname === artPath) {
        trace.decodeStarts++;
        void result.then(() => {
          trace.decodedSize = [this.naturalWidth, this.naturalHeight];
        }, () => undefined);
      }
      return result;
    };
  }, { dataPath: kitchenData, artPath: kitchenArt });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  const apartment = page.locator('[data-testid="scene-minimap-child"][data-target-scene="apartment"]');
  await expect(apartment).toBeEnabled();
  // Keyboard entry leaves the pointer clear of the apartment's new buttons.
  await apartment.focus();
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const kitchen = page.locator('[data-testid="scene-minimap-child"][data-target-scene="kitchen"]');
  await expect(kitchen).toBeEnabled();
  await expect(kitchen).not.toBeFocused();
  await expect.poll(() => page.evaluate(() => window.kitchenPrefetchTrace.data), {
    message: "the apartment consumes the real kitchen JSON before focus",
  }).toEqual({ id: "kitchen", asset: kitchenArt, width: 1600, height: 900 });

  // The JSON observer may run before the application's own promise reaction.
  // Give its continuation and the browser's image loader time to issue a request.
  const decodeStarts = await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return window.kitchenPrefetchTrace.decodeStarts;
  });
  expect({ requests: artworkRequests, decodeStarts }, "unvisited kitchen artwork")
    .toEqual({ requests: 0, decodeStarts: 0 });

  await kitchen.focus();
  await expect(kitchen).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.kitchenPrefetchTrace.decodedSize), {
    message: "focusing the kitchen button loads and decodes its original image before entry",
  }).toEqual([1600, 900]);
  expect(artworkRequests).toBeGreaterThan(0);
  await expect(app).toHaveAttribute("data-scene-id", "apartment");

  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene-id", "kitchen");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const art = page.locator(".viewer-shell:not([data-phase]) .scene-art");
  await expect(art).toBeVisible();
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => ({
    path: image.currentSrc && new URL(image.currentSrc).pathname,
    complete: image.complete,
    size: [image.naturalWidth, image.naturalHeight],
  }))).toEqual({ path: kitchenArt, complete: true, size: [1600, 900] });
});
