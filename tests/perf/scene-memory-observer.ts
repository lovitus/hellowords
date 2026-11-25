import { readFile, writeFile } from "node:fs/promises";
import type { Browser, Page } from "@playwright/test";

type Shape = { kind: string; ref: WeakRef<Element> };
type Inventory = { seen: WeakSet<Element>; items: Shape[] };
declare global {
  interface Window { sceneMemoryInventory: Inventory }
}

export async function installInventory(page: Page) {
  await page.addInitScript(() => {
    const seen = new WeakSet<Element>();
    const items: Shape[] = [];
    window.sceneMemoryInventory = { seen, items };
    const prototype = HTMLCanvasElement.prototype;
    const getContext = prototype.getContext;
    prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (!seen.has(this)) {
        seen.add(this);
        items.push({ kind: this.classList.contains("label-canvas") ? "label-canvas" : "other-canvas", ref: new WeakRef(this) });
      }
      return Reflect.apply(getContext, this, args);
    } as typeof getContext;
    new MutationObserver(() => {
      for (const element of document.querySelectorAll(".viewer-shell, .scene-art, .scene-continuous-tile img")) {
        if (seen.has(element)) continue;
        seen.add(element);
        const kind = element.matches(".viewer-shell") ? "shell" : element.matches(".scene-art") ? "art" : "tile-image";
        items.push({ kind, ref: new WeakRef(element) });
      }
    }).observe(document, { subtree: true, childList: true });
  });
}

export async function startMemoryTrace(browser: Browser, page: Page, directory: string) {
  const control = await browser.newBrowserCDPSession();
  const target = await page.context().newCDPSession(page);
  const checkpoints: unknown[] = [];
  const dumps: Array<{ pid: number; guid: string; data: Record<string, unknown> }> = [];
  let rendererPid: number | undefined;
  control.on("Tracing.dataCollected", ({ value }) => {
    for (const event of value) {
      if (event.name === "hellowords-memory-renderer") rendererPid = event.pid;
      if (event.args?.dumps && event.id !== undefined) {
        dumps.push({ pid: event.pid, guid: String(event.id), data: event.args.dumps });
      }
    }
  });
  await control.send("Tracing.start", {
    categories: "-*,disabled-by-default-memory-infra,blink.user_timing",
    transferMode: "ReportEvents",
  });
  await page.evaluate(() => performance.mark("hellowords-memory-renderer").name);
  async function checkpoint(name: string) {
    const visible = await page.evaluate(() => {
      const counts: Record<string, { observed: number; live: number; attached: number; livePixels: number }> = {};
      for (const { kind, ref } of window.sceneMemoryInventory.items) {
        const stats = counts[kind] ??= { observed: 0, live: 0, attached: 0, livePixels: 0 };
        stats.observed++;
        const node = ref.deref();
        if (!node) continue;
        stats.live++;
        if (node.isConnected) stats.attached++;
        if (node instanceof HTMLCanvasElement) stats.livePixels += node.width * node.height;
      }
      return { scene: document.querySelector<HTMLElement>('[data-testid="world-app"]')?.dataset.sceneId, counts };
    });
    const [dom, heap, processList] = await Promise.all([
      target.send("Memory.getDOMCounters"), target.send("Runtime.getHeapUsage"), control.send("SystemInfo.getProcessInfo"),
    ]);
    const memory = await Promise.all(processList.processInfo.map(async ({ id, type }) => {
      try {
        const record = await readFile(`/proc/${id}/smaps_rollup`, "utf8");
        const pss = record.match(/^Pss:\s+(\d+) kB$/m);
        return { id, type, pssKiB: pss ? Number(pss[1]) : null };
      } catch { return { id, type, pssKiB: null }; }
    }));
    const dump = await control.send("Tracing.requestMemoryDump", { levelOfDetail: "detailed", deterministic: false });
    checkpoints.push({ name, visible, dom, heap, memory, dump });
    await writeFile(`${directory}/checkpoints.json`, JSON.stringify(checkpoints));
    if (!dump.success) throw new Error(`No memory dump at ${name}`);
  }
  return {
    checkpoint,
    collect: () => target.send("HeapProfiler.collectGarbage"),
    pressure: () => target.send("Memory.simulatePressureNotification", { level: "critical" }),
    async finish() {
      const finished = new Promise<void>((resolve) => control.once("Tracing.tracingComplete", () => resolve()));
      await control.send("Tracing.end");
      await finished;
      await writeFile(`${directory}/dumps.json`, JSON.stringify({ rendererPid, dumps }));
      await target.detach();
      await control.detach();
      if (!rendererPid || !dumps.some(({ pid, data }) => pid === rendererPid && data.allocators)) {
        throw new Error("Trace did not identify the target renderer and its allocator dump");
      }
    },
  };
}
