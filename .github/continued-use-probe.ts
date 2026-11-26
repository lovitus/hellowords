// The launcher prepends the frozen performance test's imports and navigation helpers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession } from "@playwright/test";

declare global {
  interface Window {
    __CONTINUED_ROUTE__: { count: number; unexpected: number };
  }
}
const steps = ["warm", "mid", "end", "quiet", "gc"] as const;
type Step = typeof steps[number];
type ProcessRow = { pid: number; role: string; pssKiB: number | null };
type HeapFields = Record<string, { value: string; units: string }>;
type Allocators = Record<string, { attrs?: HeapFields }>;
type MemoryTraceEvent = {
  name: string; ph: string; pid: number; ts: number;
  args?: { dumps?: { level_of_detail?: string; allocators?: Allocators } };
};
const allocatorNames = [
  "blink_gc/main/heap", "v8/main/heap", "v8/main/heap/new_space", "v8/main/heap/old_space",
  "v8/main/heap/large_object_space", "malloc", "partition_alloc",
  "canvas", "skia", "cc/image_memory", "cc/tile_memory", "gpu/transfer_buffer_memory",
];
const byteFields = ["size", "effective_size", "allocated_objects_size", "committed_size", "pooled_size"];
function whitelistedBytes(allocators: Allocators) {
  return Object.fromEntries(allocatorNames.map(name => {
    const attrs = allocators[name]?.attrs;
    return [name, attrs ? Object.fromEntries(byteFields.filter(key =>
      attrs[key]?.units === "bytes" && /^[0-9a-f]+$/i.test(attrs[key].value))
      .map(key => [key, Number.parseInt(attrs[key].value, 16)])) : null];
  }));
}

// Retain only user-timing coordinates and fixed numeric counters from the trace stream.
async function traceAllocators(control: CDPSession) {
  const prefix = "continued-memory-stage-";
  const marks: { name: string; pid: number; ts: number }[] = [];
  const inventories: { pid: number; ts: number; counters: ReturnType<typeof whitelistedBytes> }[] = [];
  control.on("Tracing.dataCollected", ({ value }) => {
    for (const e of value as unknown as MemoryTraceEvent[]) {
      if (steps.some(s => e.name === prefix + s)) marks.push({ name: e.name, pid: e.pid, ts: e.ts });
      const dump = e.args?.dumps;
      if (e.ph === "v" && dump?.level_of_detail === "detailed" && dump.allocators) {
        inventories.push({ pid: e.pid, ts: e.ts, counters: whitelistedBytes(dump.allocators) });
      }
    }
  });
  await control.send("Tracing.start", {
    transferMode: "ReportEvents", traceConfig: {
      includedCategories: ["disabled-by-default-memory-infra", "blink.user_timing"],
      excludedCategories: ["*"], recordMode: "recordContinuously",
      memoryDumpConfig: { triggers: [] } as unknown as Record<string, string>,
    },
  });
  return {
    async capture(page: Page, step: Step) {
      await page.evaluate(mark => window.performance.mark(mark).name, prefix + step);
      const dump = await control.send("Tracing.requestMemoryDump", { levelOfDetail: "detailed", deterministic: false });
      assert(dump.success && dump.dumpGuid);
    },
    async finish() {
      const complete = new Promise<boolean>(done =>
        control.once("Tracing.tracingComplete", event => done(!event.dataLossOccurred)));
      await control.send("Tracing.end");
      assert(await complete, "Chromium reported dropped trace data");
      const ordered = steps.map(s => {
        const matches = marks.filter(m => m.name === prefix + s);
        assert.equal(matches.length, 1);
        return matches[0];
      });
      assert.equal(new Set(ordered.map(m => m.pid)).size, 1);
      return Object.fromEntries(steps.map((step, i) => {
        const start = ordered[i];
        const end = ordered[i + 1]?.ts ?? Infinity;
        assert(end > start.ts);
        const found = inventories.filter(v => v.pid === start.pid && v.ts >= start.ts && v.ts < end);
        assert.equal(found.length, 1);
        const { counters } = found[0];
        assert((counters["blink_gc/main/heap"]?.committed_size ?? 0) > 0);
        assert((counters["blink_gc/main/heap"]?.allocated_objects_size ?? 0) > 0);
        assert((counters["v8/main/heap"]?.size ?? 0) > 0);
        return [step, { pageRendererPid: start.pid, bytes: counters }];
      }));
    },
  };
}

async function processRollups(control: CDPSession): Promise<ProcessRow[]> {
  const { processInfo } = await control.send("SystemInfo.getProcessInfo");
  return Promise.all(processInfo.map(async ({ id, type }) => {
    let pssKiB: number | null = null;
    if (Number.isSafeInteger(id) && id > 0) {
      try {
        const data = await readFile(`/proc/${id}/smaps_rollup`, "utf8");
        const match = /^Pss:\s+(\d+)\s+kB$/m.exec(data);
        if (match) pssKiB = Number(match[1]);
      } catch {
        // Preserve missing values in the failing checkpoint; do not total partial inventories.
      }
    }
    return { pid: id, role: /^[\w.-]+$/.test(type) ? type : "invalid-role", pssKiB };
  }));
}

function requireCompletePss(rows: ProcessRow[]) {
  for (const row of rows) {
    assert(Number.isSafeInteger(row.pid) && row.pid > 0);
    assert(row.role !== "invalid-role");
    assert(row.pssKiB !== null && Number.isSafeInteger(row.pssKiB) && row.pssKiB > 0);
  }
  assert.equal(new Set(rows.map(p => p.pid)).size, rows.length);
  // These four CDP roles are present in the frozen hosted baseline's inventory.
  for (const role of ["browser", "renderer", "GPU", "network.mojom.NetworkService"]) {
    assert(rows.some(p => p.role === role), `Absent ${role}`);
  }
  assert.equal(rows.filter(p => p.role === "browser").length, 1);
}

test("compare continued apartment round trips with time spent on the home map", async ({ browser, context, page }) => {
  test.setTimeout(200_000);
  const group = process.env.MEMORY_GROUP!;
  const traced = group.startsWith("allocators-");
  const active = group.endsWith("-active");
  const reversePair = group.startsWith("main-2-");
  const quietMs = Number(process.env.MEMORY_QUIET_MS);
  const out = process.env.MEMORY_EVIDENCE!;
  const checkpoints: Partial<Record<Step, {
    route: { count: number; unexpected: number }; scene: string | null; processes: ProcessRow[];
    totalPssKiB: number | null; byRoleKiB: Record<string, number>; elapsedMs: number;
    intervalSamplesBeforeCheckpoint: number;
    heapBytes: Awaited<ReturnType<typeof heap>>; dom: Awaited<ReturnType<typeof dom>>;
    liveElements: number;
  }>> = {};
  const record = {
    group, product: process.env.PERF_SOURCE_SHA, chromium: browser.version(), traced, checkpoints,
    status: "running", stage: "opening-chromium-sessions", failureKind: null as string | null, pageErrors: 0, cycle: 0,
    targetMs: null as number | null, branchMs: null as number | null, quietMs: null as number | null,
    routeMs: null as number | null, paddingMs: 0, uniqueMainRendererPid: null as number | null,
    intervalSamples: 0, dumps: null as Record<string, { pageRendererPid: number; bytes: unknown }> | null,
  };
  const save = () => writeFile(join(out, `${group}.json`), JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  await save();
  const started = performance.now();
  const control = await browser.newBrowserCDPSession();
  const target = await context.newCDPSession(page);
  function heap() { return target.send("Runtime.getHeapUsage"); }
  function dom() { return target.send("Memory.getDOMCounters"); }
  let runningSampler: BrowserMetricsSampler | undefined;
  page.on("pageerror", () => { record.pageErrors++; });
  try {
    assert.equal(process.platform, "linux");
    assert.equal(quietMs, 3000);
    if (reversePair || !active) {
      record.stage = "reading-matched-active-duration";
      const reference = reversePair ? "main-1-active" : group.replace(/-idle$/, "-active");
      const partner = JSON.parse(await readFile(join(out, `${reference}.json`), "utf8"));
      assert.equal(partner.status, "complete");
      assert(partner.branchMs > 0 && Number.isFinite(partner.branchMs));
      record.targetMs = reversePair ? Math.ceil(partner.branchMs * 1.05) : partner.branchMs;
    }
    record.stage = "opening-world-map";
    await preparePage(page);
    await page.addInitScript(() => {
      window.__CONTINUED_ROUTE__ = { count: 0, unexpected: 0 };
      window.addEventListener("world:scene-settled", event => {
        const { from, to } = (event as CustomEvent).detail;
        const ledger = window.__CONTINUED_ROUTE__;
        const forward = ledger.count % 2 === 0;
        if (from !== (forward ? "world-map" : "apartment") || to !== (forward ? "apartment" : "world-map")) {
          ledger.unexpected++;
        }
        ledger.count++;
      });
    });
    const coldSampler = new BrowserMetricsSampler(browser, page);
    await coldSampler.start();
    runningSampler = coldSampler;
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const app = await waitForWorld(page);
    await expect(app).toHaveAttribute("data-scene-id", "world-map");
    await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await coldSampler.stop(); // Replicate the frozen performance run's cold-stage collection.
    runningSampler = undefined;
    const layout = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    assert.deepEqual(layout, [1440, 900, 1]);

    async function trips(n: number, expected: number) {
      for (let i = 1; i <= n; i++) {
        record.cycle = i;
        assert.equal((await enterFirstChild(page, app)).target, "apartment");
        await exitToParent(page, app, "world-map");
      }
      // The application emits a settled transition from inside a double animation frame.
      await page.waitForFunction(count => window.__CONTINUED_ROUTE__.count >= count, expected, { timeout: 8000 });
    }
    record.stage = "warming-route";
    await trips(1, 2);
    await page.evaluate(() => {
      window.__WORLD_PERF__.longTasks = [];
      window.__WORLD_PERF__.sceneTransitions = [];
    });
    const sampler = new BrowserMetricsSampler(browser, page);
    await sampler.start();
    runningSampler = sampler;
    const trace = traced ? await traceAllocators(control) : null;
    async function capture(step: Step, count: number) {
      record.stage = `checkpoint-${step}`;
      const elapsedMs = performance.now() - started;
      const intervalSamplesBeforeCheckpoint = sampler.samples.length;
      const processes = await processRollups(control);
      const [heapBytes, counters, pageState] = await Promise.all([
        heap(), dom(), page.evaluate(() => ({
          scene: document.querySelector('[data-testid="world-app"]')?.getAttribute("data-scene-id") ?? null,
          route: { ...window.__CONTINUED_ROUTE__ }, liveElements: document.querySelectorAll("*").length,
        })),
      ]);
      const point = checkpoints[step] = {
        ...pageState, elapsedMs, intervalSamplesBeforeCheckpoint, processes, heapBytes, dom: counters,
        totalPssKiB: null as number | null, byRoleKiB: {} as Record<string, number>,
      };
      assert.equal(point.scene, "world-map");
      assert.deepEqual(point.route, { count, unexpected: 0 });
      assert.equal(record.pageErrors, 0);
      requireCompletePss(processes);
      if (!traced) {
        const renderers = processes.filter(p => p.role === "renderer").map(p => p.pid);
        assert.equal(renderers.length, 1, "The main checkpoint must identify a single renderer");
        record.uniqueMainRendererPid ??= renderers[0];
        assert.equal(renderers[0], record.uniqueMainRendererPid);
      }
      for (const p of processes) point.byRoleKiB[p.role] = (point.byRoleKiB[p.role] ?? 0) + p.pssKiB!;
      point.totalPssKiB = Object.values(point.byRoleKiB).reduce((sum, v) => sum + v, 0);
      assert(Number.isSafeInteger(point.totalPssKiB) && point.totalPssKiB > 0);
      assert(Number.isFinite(heapBytes.usedSize) && heapBytes.usedSize > 0 && heapBytes.totalSize >= heapBytes.usedSize);
      assert(counters.documents > 0 && counters.nodes > 0 && point.liveElements > 0);
      await save();
      if (trace) {
        record.stage = `allocator-dump-${step}`;
        await trace.capture(page, step);
      }
    }
    await capture("warm", 2);
    record.stage = "common-20-trips";
    await trips(20, 42);
    await capture("mid", 42);
    record.stage = "matched-branch";
    const branchStart = performance.now();
    if (active) {
      await trips(20, 82);
      record.routeMs = performance.now() - branchStart;
      if (record.targetMs !== null && record.targetMs > record.routeMs) {
        await page.waitForTimeout(record.targetMs - record.routeMs);
        record.paddingMs = performance.now() - branchStart - record.routeMs;
      }
    } else {
      await page.waitForTimeout(record.targetMs!);
    }
    record.branchMs = performance.now() - branchStart;
    const finalCount = active ? 82 : 42;
    await capture("end", finalCount);
    record.stage = "common-idle";
    const quietStart = performance.now();
    await page.waitForTimeout(quietMs);
    record.quietMs = performance.now() - quietStart;
    await capture("quiet", finalCount);
    record.stage = "common-page-gc";
    const monitored = await sampler.stop(); // Exactly one explicit GC here, after the pre-GC endpoint.
    runningSampler = undefined;
    await capture("gc", finalCount);
    record.intervalSamples = monitored.samples.length;
    // The conventional sampler can skip PSS between scheduled ticks. Export complete PSS
    // ticks with process membership; the checkpoint totals above always require every PID.
    const timeSeries = monitored.samples.flatMap((s, index) => {
      if (!s.processes.length || s.processes.some(p => p.pssKiB === null || !Number.isFinite(p.pssKiB) || p.pssKiB <= 0)) return [];
      return [{ index, msFromSamplerStart: s.monotonicMs, totalPssKiB: s.totalPssKiB,
        processes: s.processes.map(p => ({
          pid: p.id, role: /^[\w.-]+$/.test(p.type) ? p.type : "invalid-role", pssKiB: p.pssKiB,
        })),
      }];
    });
    assert(timeSeries.length > 1);
    await writeFile(join(out, `${group}-series.json`), JSON.stringify(timeSeries) + "\n", { mode: 0o600 });
    if (!traced) {
      record.stage = "verifying-renderer-throughout-sampling";
      for (const tick of monitored.samples) assert.deepEqual(
        tick.processes.filter(p => p.type === "renderer").map(p => p.id), [record.uniqueMainRendererPid],
        "The same single renderer must be present at every sampler tick",
      );
    }
    if (trace) {
      record.stage = "resolving-renderer-dumps";
      record.dumps = await trace.finish();
      for (const s of steps) assert(checkpoints[s]!.processes.some(p =>
        p.role === "renderer" && p.pid === record.dumps![s].pageRendererPid));
    }
    assert.equal(new Set(steps.map(s => checkpoints[s]!.processes.find(p => p.role === "browser")!.pid)).size, 1);
    assert.equal(record.pageErrors, 0);
    record.status = "complete";
    record.stage = "complete";
    await save();
  } catch (error) {
    record.status = "failed";
    record.failureKind = error instanceof assert.AssertionError ? "assertion" :
      error instanceof Error && error.name === "TimeoutError" ? "timeout" : "probe-or-browser";
    await save();
    throw error;
  } finally {
    if (runningSampler) await runningSampler.stop().catch(() => undefined);
    await Promise.allSettled([control.detach(), target.detach()]);
  }
});
