import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { expect, test, type Locator, type Page } from "@playwright/test";

const officePath = "/data/scenes/office-building.json";
const previousMeaning = "挡水板";
const currentMeaning = "防溅墙";

test("a normal reopening shows the updated office word after returning from the console with a fresh HTTP cache entry", async ({
  page, context, baseURL, isMobile,
}, testInfo) => {
  const upstream = new URL(baseURL!);
  const upstreamRequest = upstream.protocol === "https:" ? httpsRequest : httpRequest;
  const source = await fetch(new URL(officePath, upstream));
  expect(source.ok).toBe(true);
  const office = await source.json();
  const label = office.labels.find((item: { id: string }) => item.id === "backsplash");
  expect(label?.translation).toBe(currentMeaning);
  const deployed = { etag: '"office-1"', body: JSON.stringify(office) };
  label.translation = previousMeaning;
  const previous = { etag: '"office-0"', body: JSON.stringify(office) };
  let release = previous;
  const requests: { etag: string; ifNoneMatch: string | null; status: number }[] = [];

  // Keep the browser's native HTTP cache. Only the office JSON changes on deploy.
  const proxy = createServer((incoming, outgoing) => {
    if (incoming.url === "/previous-page") {
      outgoing.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      outgoing.end('<a href="/">Open the app</a>');
      return;
    }
    if (incoming.url?.split("?")[0] === officePath) {
      const ifNoneMatch = incoming.headers["if-none-match"] ?? null;
      const unchanged = ifNoneMatch?.split(/\s*,\s*/).some(tag => tag === "*" || tag.replace(/^W\//, "") === release.etag);
      const status = unchanged ? 304 : 200;
      requests.push({ etag: release.etag, ifNoneMatch, status });
      outgoing.writeHead(status, { ETag: release.etag, "Cache-Control": "public, max-age=3600", "Content-Type": "application/json" });
      outgoing.end(unchanged ? undefined : release.body);
      return;
    }
    const forwarded = upstreamRequest(upstream, {
      path: incoming.url, method: incoming.method, headers: { ...incoming.headers, host: upstream.host },
    }, response => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on("error", error => outgoing.destroy(error));
    incoming.pipe(forwarded);
  });

  const activate = (control: Locator) => isMobile ? control.tap() : control.click();
  const settled = async (tab: Page, id: string) => {
    const app = tab.getByTestId("world-app");
    await expect(app).toHaveAttribute("data-scene-id", id);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(tab.locator(".viewer-shell:not([data-phase])")).toHaveAttribute("data-interaction-locked", "false");
  };
  const enter = async (tab: Page, ...ids: string[]) => {
    for (const id of ids) {
      await activate(tab.getByTestId("scene-minimap").locator(`[data-testid="scene-minimap-child"][data-target-scene="${id}"]`));
      await settled(tab, id);
    }
  };
  const readCard = async (tab: Page) => {
    await activate(tab.getByTestId("scene-word-index-toggle"));
    const index = tab.getByTestId("scene-word-index");
    await index.getByRole("searchbox").fill("backsplash");
    await activate(index.locator('[data-label-id="backsplash"]'));
    const card = tab.getByRole("complementary", { name: "backsplash word details", exact: true });
    await expect(card).toBeVisible();
    return card.locator("p").first();
  };
  const defaultCachedMeaning = () => page.evaluate(async (path) => {
    const response = await fetch(path);
    const scene = await response.json();
    return scene.labels.find((item: { id: string }) => item.id === "backsplash").translation;
  }, officePath);

  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const officeRoute = ["city-street", "transit-hub", "urban-services", "office-building"];
  try {
    await page.goto(origin);
    await settled(page, "world-map");
    await enter(page, ...officeRoute);
    const oldCard = await readCard(page);
    await expect(oldCard).toHaveText(previousMeaning);
    expect(await defaultCachedMeaning()).toBe(previousMeaning);

    release = deployed;
    const previousRequestCount = requests.length;
    const cachedMeaning = await defaultCachedMeaning();
    expect(cachedMeaning, "a plain fetch still reads the previous release from the one-hour HTTP cache").toBe(previousMeaning);
    expect(requests).toHaveLength(previousRequestCount);
    await expect(oldCard).toHaveText(previousMeaning);

    const reopened = await context.newPage();
    await reopened.goto(`${origin}/previous-page`);
    await activate(reopened.getByRole("link", { name: "Open the app" }));
    await settled(reopened, "world-map");
    await enter(reopened, ...officeRoute, "conference-room", "video-conferencing-console");
    for (const id of ["conference-room", "office-building"]) {
      await activate(reopened.getByRole("button", { name: "← 返回上一层", exact: true }));
      await settled(reopened, id);
    }
    const returnedMeaning = await (await readCard(reopened)).innerText();
    await testInfo.attach("office-cache-upgrade", {
      body: JSON.stringify({ cachedMeaning, returnedMeaning, requests }), contentType: "application/json",
    });
    await testInfo.attach("office-cache-returned-card", { body: await reopened.screenshot(), contentType: "image/png" });
    expect(returnedMeaning, "the reopened office card shows the deployed translation after returning from the console").toBe(currentMeaning);
  } finally {
    const closed = once(proxy, "close");
    proxy.close();
    proxy.closeAllConnections();
    await closed;
  }
});
