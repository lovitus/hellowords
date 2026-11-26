import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type CDPSession, type Page } from "@playwright/test";

const shell = '.viewer-shell:not([data-phase])';
const rounds = 20;
const stageNames = ["warm", "after20"] as const;
const marker = (stage: string) => `memory-stage-${stage}`;

function activeScene(page: Page, scene: string) {
  return page.locator(`[data-testid="world-app"][data-scene-id="${scene}"][data-scene-loading="false"][data-transition-state="idle"] ${shell} .scene-interaction-layer[data-motion-frozen="false"][data-positioned="true"]`);
}

async function shrinkAtCenter(page: Page) {
  await page.locator(`${shell} [data-testid="world-viewport"]`).evaluate(element => {
    const rect = element.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      element.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true, cancelable: true, deltaY: 240,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
    }
  });
}

async function roundTrip(page: Page) {
  await page.locator(`${shell} [data-testid="scene-hotspot"][data-target-scene="apartment"]`).click();
  await activeScene(page, "apartment").waitFor({ state: "attached" });
  await page.mouse.move(720, 496);
  await page.waitForTimeout(350);
  await shrinkAtCenter(page);
  await page.waitForTimeout(450);
  await expect(page.locator(`${shell} .scene-surface`)).toHaveAttribute("data-scene-scale", "0.680");
  await shrinkAtCenter(page);
  await activeScene(page, "world-map").waitFor({ state: "attached" });
  await page.waitForTimeout(230);
}

const smapsFields = ["Pss", "Rss", "Pss_Anon", "Pss_File", "Pss_Shmem", "Private_Clean", "Private_Dirty", "SwapPss"];

async function sampleRenderers(cdp: CDPSession) {
  const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
  const samples = new Map<number, Record<string, number>>();
  for (const { type, id } of processInfo) {
    if (type !== "renderer") continue;
    try {
      const rollup = await readFile(`/proc/${id}/smaps_rollup`, "utf8");
      const values: Record<string, number> = {};
      for (const line of rollup.split("\n")) {
        const match = /^(\w+):\s+(\d+) kB$/.exec(line);
        if (match && smapsFields.includes(match[1])) values[match[1]] = Number(match[2]);
      }
      samples.set(id, values);
    } catch {
      // Other renderers can exit. The traced page's own PSS is mandatory below.
    }
  }
  return samples;
}

type Attribute = { value: string; units: string };
type Allocators = Record<string, { attrs?: Record<string, Attribute> }>;
type Dump = {
  level_of_detail?: string;
  process_totals?: { private_footprint_bytes?: string };
  allocators?: Allocators;
};
type TraceEvent = { name: string; pid: number; ts: number; id?: string; args?: { dumps?: Dump } };

// Whitelist stable category names and counters. The full trace contains URLs,
// address-bearing allocator names and ownership edges for shared resources.
const rendererGroups = [
  "canvas", "skia", "cc/image_memory", "cc/tile_memory", "gpu/transfer_buffer_memory",
  "gpu/mapped_memory", "malloc", "partition_alloc", "blink_gc/main/heap",
  "v8/main/heap", "v8/main/heap/new_space", "v8/main/heap/old_space", "shared_memory",
];
const byteFields = ["size", "effective_size", "allocated_objects_size", "committed_size", "pooled_size"];
function groupBytes(allocators: Allocators, name: string) {
  const attrs = allocators[name]?.attrs;
  if (!attrs) return null;
  return Object.fromEntries(byteFields.filter(key => attrs[key]?.units === "bytes")
    .map(key => [key, Number.parseInt(attrs[key].value, 16)]));
}

async function readEvents(cdp: CDPSession): Promise<TraceEvent[]> {
  const done = new Promise<string>(resolve => cdp.once("Tracing.tracingComplete", event => resolve(event.stream)));
  await cdp.send("Tracing.end");
  const handle = await done;
  const chunks: Buffer[] = [];
  let eof = false;
  while (!eof) {
    const part = await cdp.send("IO.read", { handle });
    chunks.push(Buffer.from(part.data, part.base64Encoded ? "base64" : "utf8"));
    eof = part.eof;
  }
  await cdp.send("IO.close", { handle });
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")).traceEvents;
  } catch {
    throw new Error("Chromium returned an unreadable memory trace");
  }
}

test("attribute memory for the same renderer after twenty apartment round trips", async ({ browser, context, page }) => {
  const temp = process.env.RUNNER_TEMP!;
  const stage = (message: string) => writeFile(join(temp, "ownership-stage.txt"), message + "\n");
  await stage("Opening the production world map");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await activeScene(page, "world-map").waitFor({ state: "attached" });
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  await stage("Warming up the apartment route");
  await roundTrip(page);
  const cdp = await browser.newBrowserCDPSession();
  const pageCdp = await context.newCDPSession(page);
  const { gpu } = await cdp.send("SystemInfo.getInfo");
  await pageCdp.send("Performance.enable");
  await stage("Enabling Chromium memory instrumentation");
  await cdp.send("Tracing.start", {
    traceConfig: {
      includedCategories: ["disabled-by-default-memory-infra", "blink.user_timing"],
      excludedCategories: ["*"], recordMode: "recordContinuously",
      // The protocol describes an untyped dictionary. Chrome accepts an empty trigger list.
      memoryDumpConfig: { triggers: [] } as unknown as Record<string, string>,
    },
    transferMode: "ReturnAsStream",
  });

  async function capture(name: typeof stageNames[number]) {
    await stage(`Capturing the ${name} homepage dump and renderer smaps_rollup`);
    await activeScene(page, "world-map").waitFor({ state: "attached" });
    const pageState = await page.evaluate(async mark => {
      await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      performance.mark(mark);
      return { liveElements: document.querySelectorAll("*").length, dpr: devicePixelRatio,
        viewport: [innerWidth, innerHeight] };
    }, marker(name));
    const dom = await pageCdp.send("Memory.getDOMCounters");
    const { metrics } = await pageCdp.send("Performance.getMetrics");
    const rollups = await sampleRenderers(cdp);
    const result = await cdp.send("Tracing.requestMemoryDump", { levelOfDetail: "detailed", deterministic: false });
    expect(result.success, "Chromium accepted the detailed dump").toBe(true);
    return { name, pageState, dom, jsHeapUsedBytes: metrics.find(m => m.name === "JSHeapUsedSize")?.value, rollups };
  }
  const warm = await capture("warm");
  await stage("Completing twenty apartment round trips");
  for (let i = 0; i < rounds; i++) await roundTrip(page);
  const after20 = await capture("after20");
  await stage("Resolving the marked page renderer and its two detailed dumps");
  const events = await readEvents(cdp);
  const marks = stageNames.map(name => {
    const matches = events.filter(e => e.name === marker(name));
    expect(matches.length).toBe(1);
    return matches[0];
  });
  const pid = marks[0].pid;
  expect(marks[1].pid, "the page renderer survives both samples").toBe(pid);
  expect(marks[1].ts).toBeGreaterThan(marks[0].ts);
  await stage("Checking that Linux supplied PSS for the traced page PID at both samples");
  for (const sample of [warm, after20]) {
    expect(sample.rollups.get(pid)?.Pss, `readable ${sample.name} PSS from the marked renderer`).toBeGreaterThan(0);
  }
  await stage("Checking the two detailed renderer allocator inventories");
  const stages = [warm, after20].map(({ name, pageState, dom, jsHeapUsedBytes, rollups }, index) => {
    const marked = marks[index];
    const window = events.filter(e => e.pid === pid && e.ts >= marked.ts && e.ts < (marks[index + 1]?.ts ?? Infinity)
      && e.args?.dumps?.level_of_detail === "detailed");
    const allocations = window.filter(e => e.args?.dumps?.allocators);
    expect(allocations.length, `one ${name} renderer allocator inventory`).toBe(1);
    const allocators = allocations[0].args!.dumps!.allocators!;
    expect(Boolean(allocators["blink_gc/main/heap"] && allocators["v8/main/heap"])).toBe(true);
    const totals = window.find(e => e.id === allocations[0].id && e.args?.dumps?.process_totals);
    const footprint = totals?.args?.dumps?.process_totals?.private_footprint_bytes;
    const smapsRollupKiB = rollups.get(pid)!;
    const names = Object.keys(allocators);
    const transferBuffers = names.filter(k => /^gpu\/transfer_buffer_memory\/buffer_[^/]+$/.test(k));
    return {
      stage: name, rendererPid: pid, smapsRollupKiB, pageState, dom, jsHeapUsedBytes,
      chromiumPrivateFootprintBytes: footprint ? Number.parseInt(footprint, 16) : null,
      allocatorBytes: Object.fromEntries(rendererGroups.map(k => [k, groupBytes(allocators, k)])),
      canvasResourceProviders: allocators.canvas ? names.filter(k => /^canvas\/ResourceProvider_[^/]+$/.test(k)).length : null,
      transferBufferSizesBytes: transferBuffers.map(k => groupBytes(allocators, k)?.size).filter(v => v !== undefined)
        .sort((a, b) => b - a),
    };
  });
  await writeFile(join(temp, "renderer-ownership.json"), JSON.stringify({
    product: process.env.PRODUCT, buildRun: process.env.BUILD_RUN, diagnosticCommit: process.env.GITHUB_SHA,
    chromium: browser.version(), platform: process.platform, rounds, warmupRounds: 1, forcedGC: false,
    meaningsEnabled: false, route: ["world-map", "apartment", "apartment at 0.680", "world-map"],
    graphics: { canvas: gpu.featureStatus?.["2d_canvas"], raster: gpu.featureStatus?.rasterization },
    note: "PSS is read from smaps_rollup. Allocator values are separate attribution counters and are not summed with one another or with PSS. Missing providers are null.",
    stages,
    rendererPssDeltaKiB: stages[1].smapsRollupKiB.Pss - stages[0].smapsRollupKiB.Pss,
  }, null, 2) + "\n", { mode: 0o600 });
});
