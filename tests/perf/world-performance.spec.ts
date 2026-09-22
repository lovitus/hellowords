import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  BrowserMetricsSampler,
  type BrowserMetricsSummary,
} from "./browser-metrics";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const cycles = Number(process.env.PERF_SCENE_CYCLES ?? 20);

const budgets = {
  coldLcpMs: Number(process.env.PERF_MAX_COLD_LCP_MS ?? 2500),
  warmTransitionP95Ms: Number(process.env.PERF_MAX_TRANSITION_P95_MS ?? 650),
  // Playwright's pinned headless Chromium composites the 1440p raster scenes
  // through SwiftShader in CI and on macOS. Keep this all-process ceiling as a
  // regression guard for that deterministic software-rendered workload; the
  // renderer main-thread budget below remains the user-input responsiveness
  // gate.
  browserCpuMsPerTransition: Number(process.env.PERF_MAX_CPU_MS_PER_TRANSITION ?? 750),
  rendererTaskMsPerTransition: Number(process.env.PERF_MAX_TASK_MS_PER_TRANSITION ?? 75),
  peakJsHeapMiB: Number(process.env.PERF_MAX_JS_HEAP_MIB ?? 96),
  peakPssMiB: Number(process.env.PERF_MAX_PSS_MIB ?? 350),
  retainedPssDeltaMiB: Number(process.env.PERF_MAX_RETAINED_PSS_DELTA_MIB ?? 40),
  peakDomNodes: Number(process.env.PERF_MAX_DOM_NODES ?? 1500),
};

type BrowserPerfState = {
  lcpMs: number | null;
  longTasks: number[];
  sceneTransitions: number[];
};

declare global {
  interface Window {
    __WORLD_PERF__: BrowserPerfState;
  }
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function preparePage(page: Page) {
  await page.addInitScript(() => {
    window.__WORLD_PERF__ = { lcpMs: null, longTasks: [], sceneTransitions: [] };
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__WORLD_PERF__.lcpMs = entries.at(-1)?.startTime ?? null;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      window.__WORLD_PERF__.longTasks.push(
        ...list.getEntries().map(({ duration }) => duration),
      );
    }).observe({ type: "longtask", buffered: true });
    window.addEventListener("world:scene-settled", (event) => {
      const duration = Number((event as CustomEvent).detail?.durationMs);
      if (Number.isFinite(duration)) window.__WORLD_PERF__.sceneTransitions.push(duration);
    });
  });
}

async function waitForWorld(page: Page) {
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  await expect(app).not.toHaveAttribute("data-scene-id", "");
  return app;
}

async function currentScene(app: Locator) {
  const scene = await app.getAttribute("data-scene-id");
  expect(scene).toBeTruthy();
  return scene as string;
}

async function enterFirstChild(page: Page, app: Locator) {
  const hotspot = page.locator('[data-testid="scene-hotspot"]').first();
  await expect(hotspot).toBeVisible();
  const target = await hotspot.getAttribute("data-target-scene");
  expect(target).toBeTruthy();
  const box = await hotspot.boundingBox();
  expect(box).not.toBeNull();
  const started = performance.now();
  await hotspot.click();
  const viewport = page.locator(VIEWPORT);
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(
    viewportBox!.x + viewportBox!.width / 2,
    viewportBox!.y + viewportBox!.height / 2,
  );
  await expect
    .poll(
      async () => {
        if ((await app.getAttribute("data-scene-id")) !== target) {
          await page.mouse.wheel(0, -24);
        }
        return app.getAttribute("data-scene-id");
      },
      { intervals: [220], timeout: 8_000 },
    )
    .toBe(target);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  return { target: target as string, durationMs: performance.now() - started };
}

async function exitToParent(page: Page, app: Locator, parent: string) {
  const viewport = page.locator(VIEWPORT);
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const started = performance.now();
  await expect
    .poll(
      async () => {
        if ((await app.getAttribute("data-scene-id")) !== parent) {
          await page.mouse.wheel(0, 120);
        }
        return app.getAttribute("data-scene-id");
      },
      { intervals: [220], timeout: 8_000 },
    )
    .toBe(parent);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  return performance.now() - started;
}

function scenarioSummary(metrics: BrowserMetricsSummary, transitionMs: number[]) {
  const transitions = transitionMs.length;
  return {
    transitions,
    transitionMs: {
      p50: percentile(transitionMs, 0.5),
      p95: percentile(transitionMs, 0.95),
      max: transitionMs.length ? Math.max(...transitionMs) : null,
    },
    browserCpuMs: metrics.browserCpuMs,
    browserCpuMsPerTransition: transitions ? metrics.browserCpuMs / transitions : null,
    rendererTaskMs: (metrics.pageMetrics.TaskDuration ?? 0) * 1000,
    rendererTaskMsPerTransition: transitions
      ? ((metrics.pageMetrics.TaskDuration ?? 0) * 1000) / transitions
      : null,
    memory: {
      peakRssMiB: metrics.peakRssMiB,
      peakPssMiB: metrics.peakPssMiB,
      initialRssMiB: metrics.initialRssMiB,
      initialPssMiB: metrics.initialPssMiB,
      finalRssMiB: metrics.finalRssMiB,
      finalPssMiB: metrics.finalPssMiB,
      rssDeltaMiB:
        metrics.initialRssMiB === null || metrics.finalRssMiB === null
          ? null
          : metrics.finalRssMiB - metrics.initialRssMiB,
      pssDeltaMiB:
        metrics.initialPssMiB === null || metrics.finalPssMiB === null
          ? null
          : metrics.finalPssMiB - metrics.initialPssMiB,
      jsHeapUsedMiB: (metrics.finalPageMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024,
      peakJsHeapUsedMiB: (metrics.peakPageMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024,
      jsHeapDeltaMiB: (metrics.pageMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024,
    },
    dom: metrics.dom,
    pageMetrics: metrics.pageMetrics,
  };
}

test.describe.configure({ mode: "serial" });

test("scene slices stay within CPU and memory budgets", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "performance");
  await preparePage(page);
  const coldSampler = new BrowserMetricsSampler(browser, page);
  await coldSampler.start();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = await waitForWorld(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const coldMetrics = await coldSampler.stop();
  const parent = await currentScene(app);

  const warmup = await enterFirstChild(page, app);
  await exitToParent(page, app, parent);
  expect(warmup.target).not.toBe(parent);
  await page.evaluate(() => {
    window.__WORLD_PERF__.longTasks = [];
    window.__WORLD_PERF__.sceneTransitions = [];
  });

  const sampler = new BrowserMetricsSampler(browser, page);
  await sampler.start();
  const measuredTransitions: number[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const entered = await enterFirstChild(page, app);
    measuredTransitions.push(entered.durationMs);
    measuredTransitions.push(await exitToParent(page, app, parent));
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const metrics = await sampler.stop();
  const browserState = await page.evaluate(() => ({
    ...window.__WORLD_PERF__,
    userTiming: performance
      .getEntriesByName("scene-transition", "measure")
      .map(({ duration, startTime }) => ({ duration, startTime })),
  }));
  const cold = scenarioSummary(coldMetrics, []);
  const liveDomNodes = await page.evaluate(() => document.querySelectorAll("*").length);
  const visualTransitionP95Ms = percentile(browserState.sceneTransitions, 0.95);
  const summary = {
    schemaVersion: 1,
    gitSha: process.env.PERF_SOURCE_SHA ?? process.env.GITHUB_SHA ?? null,
    environment: {
      platform: process.platform,
      release: release(),
      architecture: process.arch,
      logicalCores: cpus().length,
      cpuModel: cpus()[0]?.model ?? "unknown",
      totalMemoryMiB: totalmem() / 1024 / 1024,
      node: process.version,
      browser: browser.version(),
      runnerImage: process.env.ImageOS ?? null,
    },
    scenario: {
      name: "warm-scene-navigation",
      version: 1,
      cycles,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    },
    cold: {
      lcpMs: browserState.lcpMs,
      browserCpuMs: coldMetrics.browserCpuMs,
      memory: cold.memory,
      dom: cold.dom,
      pageMetrics: cold.pageMetrics,
    },
    result: scenarioSummary(metrics, measuredTransitions),
    liveDomNodes,
    visualTransitionP95Ms,
    browserState,
    budgets,
  };

  await mkdir("artifacts/perf", { recursive: true });
  await writeFile(
    "artifacts/perf/summary.json",
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    "artifacts/perf/samples.ndjson",
    `${[
      ...coldMetrics.samples.map((sample) => ({ phase: "cold", ...sample })),
      ...metrics.samples.map((sample) => ({ phase: "warm", ...sample })),
    ]
      .map((sample) => JSON.stringify(sample))
      .join("\n")}\n`,
  );
  const markdown = [
    "## Runtime performance",
    "",
    `- Cold LCP: ${summary.cold.lcpMs?.toFixed(1) ?? "n/a"} ms`,
    `- Scene transitions: ${summary.result.transitions}`,
    `- Visual transition p95: ${summary.visualTransitionP95Ms?.toFixed(1) ?? "n/a"} ms`,
    `- Harness navigation p95: ${summary.result.transitionMs.p95?.toFixed(1)} ms`,
    `- Browser CPU/transition: ${summary.result.browserCpuMsPerTransition?.toFixed(1)} ms`,
    `- Renderer task/transition: ${summary.result.rendererTaskMsPerTransition?.toFixed(1)} ms`,
    `- Peak RSS: ${summary.result.memory.peakRssMiB?.toFixed(1) ?? "n/a"} MiB`,
    `- Peak PSS: ${summary.result.memory.peakPssMiB?.toFixed(1) ?? "n/a"} MiB`,
    `- Live DOM nodes: ${summary.liveDomNodes}`,
    `- Retained CDP nodes after GC: ${summary.result.dom.nodes}`,
    "",
  ].join("\n");
  await writeFile("artifacts/perf/summary.md", markdown);
  // Keep the measured bottleneck readable in failed-step logs even when the
  // account cannot retain Actions artifacts. This does not change any budget.
  console.log("SCENE_PERFORMANCE", JSON.stringify({
    gitSha: summary.gitSha,
    environment: summary.environment,
    cold: summary.cold,
    result: summary.result,
    visualTransitionP95Ms: summary.visualTransitionP95Ms,
    liveDomNodes: summary.liveDomNodes,
    budgets,
  }));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  expect(summary.visualTransitionP95Ms).not.toBeNull();
  expect(summary.cold.lcpMs).not.toBeNull();
  expect(summary.cold.lcpMs!).toBeLessThanOrEqual(budgets.coldLcpMs);
  expect(summary.visualTransitionP95Ms!).toBeLessThanOrEqual(
    budgets.warmTransitionP95Ms,
  );
  expect(summary.result.browserCpuMsPerTransition!).toBeLessThanOrEqual(
    budgets.browserCpuMsPerTransition,
  );
  expect(summary.result.rendererTaskMsPerTransition!).toBeLessThanOrEqual(
    budgets.rendererTaskMsPerTransition,
  );
  expect(summary.result.memory.peakJsHeapUsedMiB).toBeLessThanOrEqual(
    budgets.peakJsHeapMiB,
  );
  if (process.platform === "linux") {
    expect(summary.cold.memory.peakPssMiB).not.toBeNull();
    expect(summary.cold.memory.peakPssMiB!).toBeLessThanOrEqual(budgets.peakPssMiB);
    expect(summary.result.memory.peakPssMiB).not.toBeNull();
    expect(summary.result.memory.peakPssMiB!).toBeLessThanOrEqual(budgets.peakPssMiB);
    expect(summary.result.memory.pssDeltaMiB).not.toBeNull();
    expect(summary.result.memory.pssDeltaMiB!).toBeLessThanOrEqual(
      budgets.retainedPssDeltaMiB,
    );
  }
  expect(summary.liveDomNodes).toBeLessThanOrEqual(budgets.peakDomNodes);
  expect(browserState.longTasks.filter((duration) => duration > 50).length).toBeLessThanOrEqual(
    2,
  );
});

test("the lexical world searches 44 shards without duplicate requests or an unbounded DOM", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "performance");
  const requestedData: string[] = [];
  const requestedTopicShards: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/data\/(?:lexical-world|semantic)\/.+\.json$/.test(pathname)) requestedData.push(pathname);
    if (/\/data\/semantic\/topics\/.+\.json$/.test(pathname)) requestedTopicShards.push(pathname);
  });
  await preparePage(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForWorld(page);
  const backgroundDomNodes = await page.evaluate(() => document.querySelectorAll("*").length);

  const sampler = new BrowserMetricsSampler(browser, page);
  await sampler.start();
  await page.getByRole("button", { name: "打开 10 个视觉领域、758 个分层入口和 10,000 个词" }).click();
  const dialog = page.getByRole("dialog", { name: "一万个词的分层探索世界" });
  await expect(dialog).toBeVisible();
  const field = dialog.getByTestId("semantic-zoom-field");
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("aria-busy", "false");
  const realmNodes = field.locator('[data-testid="semantic-zoom-node"][data-level="realm"]');
  await expect(realmNodes).toHaveCount(10);
  expect(await realmNodes.evaluateAll((nodes) => nodes.reduce(
    (sum, node) => sum + Number((node as HTMLElement).dataset.count),
    0,
  ))).toBe(10_000);

  await field.locator(
    '[data-testid="semantic-zoom-node"][data-level="realm"][data-id="qualities-states"]',
  ).click();
  await expect(field).toHaveAttribute("data-level", "topic");
  await field.locator(
    '[data-testid="semantic-zoom-node"][data-level="topic"][data-id="qualities"]',
  ).click();
  await expect(field).toHaveAttribute("data-level", "subcluster");
  const largeLeaf = field.locator(
    '[data-testid="semantic-zoom-node"][data-level="subcluster"][data-id="qualities--general-all"]',
  );
  await expect(largeLeaf).toHaveAttribute("data-count", "1013");
  await largeLeaf.click();
  await expect(field).toHaveAttribute("data-level", "word");
  const wordNodes = field.locator('[data-testid="semantic-zoom-node"][data-level="word"]');
  await expect.poll(() => wordNodes.count()).toBeGreaterThan(0);
  expect(await wordNodes.count()).toBeLessThanOrEqual(80);
  await expect(field).toHaveAttribute("data-live-count", /^(?:[1-9]|[1-7]\d|80)$/);

  const search = page.getByPlaceholder("搜索 10,000 个词…");
  await search.fill("just");
  const result = dialog.locator(".lexical-world__results li").first();
  await expect(result.locator("strong")).toHaveText(/^just$/i);
  await expect.poll(
    () => new Set(requestedTopicShards).size,
    { timeout: 15_000 },
  ).toBe(44);
  await result.getByRole("button").click();
  await expect(field).toHaveAttribute("data-level", "word");
  await expect(dialog.getByRole("complementary", { name: /just 词汇详情/i })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const metrics = await sampler.stop();
  const liveDomNodes = await page.evaluate(() => document.querySelectorAll("*").length);
  const lexicalDomNodes = await dialog.locator("*").count();
  const activeWordNodes = await wordNodes.count();
  const longTasks = await page.evaluate(() => window.__WORLD_PERF__.longTasks);
  const lexicalSummary = {
    schemaVersion: 1,
    entryCount: 10_000,
    liveDomNodes,
    backgroundDomNodes,
    semanticDomDelta: Math.max(0, liveDomNodes - backgroundDomNodes),
    lexicalDomNodes,
    activeWordNodes,
    requestedFiles: [...new Set(requestedData)].length,
    requestedTopicShards: [...new Set(requestedTopicShards)].length,
    duplicateRequests: requestedData.length - new Set(requestedData).size,
    browserCpuMs: metrics.browserCpuMs,
    peakJsHeapMiB: (metrics.peakPageMetrics.JSHeapUsedSize ?? 0) / 1024 / 1024,
    peakRssMiB: metrics.peakRssMiB,
    peakPssMiB: metrics.peakPssMiB,
    longTasks,
  };
  await mkdir("artifacts/perf", { recursive: true });
  await writeFile(
    "artifacts/perf/semantic-summary.json",
    `${JSON.stringify(lexicalSummary, null, 2)}\n`,
  );

  expect(lexicalSummary.requestedTopicShards).toBe(44);
  expect(lexicalSummary.activeWordNodes).toBeGreaterThan(0);
  expect(lexicalSummary.activeWordNodes).toBeLessThanOrEqual(80);
  expect(lexicalSummary.lexicalDomNodes).toBeLessThanOrEqual(450);
  expect(lexicalSummary.semanticDomDelta).toBeLessThanOrEqual(450);
  expect(lexicalSummary.liveDomNodes).toBeLessThanOrEqual(backgroundDomNodes + 450);
  expect(lexicalSummary.duplicateRequests).toBe(0);
  expect(lexicalSummary.peakJsHeapMiB).toBeLessThanOrEqual(budgets.peakJsHeapMiB);
  expect(lexicalSummary.browserCpuMs).toBeLessThanOrEqual(5_000);
  expect(longTasks.filter((duration) => duration > 50).length).toBeLessThanOrEqual(3);
});
