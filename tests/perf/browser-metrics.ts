import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import type { Browser, CDPSession, Page } from "@playwright/test";

const execFileAsync = promisify(execFile);

type ProcessInfo = { type: string; id: number; cpuTime: number };
type Metric = { name: string; value: number };

export type ProcessSample = ProcessInfo & {
  rssKiB: number | null;
  pssKiB: number | null;
};

export type BrowserSample = {
  monotonicMs: number;
  processes: ProcessSample[];
  totalRssKiB: number | null;
  totalPssKiB: number | null;
  pageMetrics: Record<string, number>;
};

export type BrowserMetricsSummary = {
  wallDurationMs: number;
  browserCpuMs: number;
  pageMetrics: Record<string, number>;
  finalPageMetrics: Record<string, number>;
  peakPageMetrics: Record<string, number>;
  peakRssMiB: number | null;
  peakPssMiB: number | null;
  initialRssMiB: number | null;
  initialPssMiB: number | null;
  finalRssMiB: number | null;
  finalPssMiB: number | null;
  dom: { documents: number; nodes: number; jsEventListeners: number };
  samples: BrowserSample[];
};

function parseKiB(contents: string, key: string) {
  const match = contents.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, "m"));
  return match ? Number(match[1]) : null;
}

async function linuxMemory(pid: number, includePss: boolean) {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    let pssKiB: number | null = null;
    if (includePss) {
      const rollup = await readFile(`/proc/${pid}/smaps_rollup`, "utf8");
      pssKiB = parseKiB(rollup, "Pss");
    }
    return { rssKiB: parseKiB(status, "VmRSS"), pssKiB };
  } catch {
    return { rssKiB: null, pssKiB: null };
  }
}

async function macMemory(pid: number) {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", String(pid)]);
    const rssKiB = Number(stdout.trim());
    return { rssKiB: Number.isFinite(rssKiB) ? rssKiB : null, pssKiB: null };
  } catch {
    return { rssKiB: null, pssKiB: null };
  }
}

async function processMemory(pid: number, includePss: boolean) {
  if (process.platform === "linux") return linuxMemory(pid, includePss);
  if (process.platform === "darwin") return macMemory(pid);
  return { rssKiB: null, pssKiB: null };
}

function metricMap(metrics: Metric[]) {
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

function finiteSum(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) : null;
}

export class BrowserMetricsSampler {
  private browserSession!: CDPSession;
  private pageSession!: CDPSession;
  private timer: ReturnType<typeof setInterval> | undefined;
  private activeSample: Promise<void> | undefined;
  private startedAt = 0;
  private startCpu = new Map<number, number>();
  private maxCpu = new Map<number, number>();
  private startPageMetrics: Record<string, number> = {};
  private sampleIndex = 0;
  readonly samples: BrowserSample[] = [];

  constructor(
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  async start() {
    this.browserSession = await this.browser.newBrowserCDPSession();
    this.pageSession = await this.page.context().newCDPSession(this.page);
    await this.pageSession.send("Performance.enable", { timeDomain: "threadTicks" });

    const initialProcesses = (await this.browserSession.send(
      "SystemInfo.getProcessInfo",
    )) as { processInfo: ProcessInfo[] };
    for (const processInfo of initialProcesses.processInfo) {
      this.startCpu.set(processInfo.id, processInfo.cpuTime);
      this.maxCpu.set(processInfo.id, processInfo.cpuTime);
    }

    const initialMetrics = (await this.pageSession.send(
      "Performance.getMetrics",
    )) as { metrics: Metric[] };
    this.startPageMetrics = metricMap(initialMetrics.metrics);
    this.startedAt = performance.now();
    await this.sample(true);

    this.timer = setInterval(() => {
      if (!this.activeSample) {
        this.activeSample = this.sample(this.sampleIndex % 4 === 0).finally(() => {
          this.activeSample = undefined;
        });
      }
    }, 250);
  }

  private async sample(includePss: boolean) {
    const [response, pageMetricResponse] = await Promise.all([
      this.browserSession.send("SystemInfo.getProcessInfo") as Promise<{
        processInfo: ProcessInfo[];
      }>,
      this.pageSession.send("Performance.getMetrics") as Promise<{ metrics: Metric[] }>,
    ]);
    const processes = await Promise.all(
      response.processInfo.map(async (processInfo) => {
        this.maxCpu.set(
          processInfo.id,
          Math.max(this.maxCpu.get(processInfo.id) ?? 0, processInfo.cpuTime),
        );
        if (!this.startCpu.has(processInfo.id)) this.startCpu.set(processInfo.id, 0);
        return { ...processInfo, ...(await processMemory(processInfo.id, includePss)) };
      }),
    );
    this.samples.push({
      monotonicMs: performance.now() - this.startedAt,
      processes,
      totalRssKiB: finiteSum(processes.map(({ rssKiB }) => rssKiB)),
      totalPssKiB: finiteSum(processes.map(({ pssKiB }) => pssKiB)),
      pageMetrics: metricMap(pageMetricResponse.metrics),
    });
    this.sampleIndex += 1;
  }

  async stop(): Promise<BrowserMetricsSummary> {
    if (this.timer) clearInterval(this.timer);
    await this.activeSample;
    await this.sample(true);

    const finalMetricsResult = (await this.pageSession.send(
      "Performance.getMetrics",
    )) as { metrics: Metric[] };
    await this.pageSession.send("HeapProfiler.collectGarbage");
    const dom = (await this.pageSession.send("Memory.getDOMCounters")) as {
        documents: number;
        nodes: number;
        jsEventListeners: number;
      };
    const finalMetrics = metricMap(finalMetricsResult.metrics);
    const pageMetrics = Object.fromEntries(
      Object.entries(finalMetrics).map(([name, value]) => [
        name,
        value - (this.startPageMetrics[name] ?? 0),
      ]),
    );
    const browserCpuMs = [...this.maxCpu].reduce(
      (sum, [pid, cpu]) => sum + Math.max(0, cpu - (this.startCpu.get(pid) ?? 0)) * 1000,
      0,
    );
    const rssSamples = this.samples
      .map(({ totalRssKiB }) => totalRssKiB)
      .filter((value): value is number => value !== null);
    const pssSamples = this.samples
      .map(({ totalPssKiB }) => totalPssKiB)
      .filter((value): value is number => value !== null);
    const peakPageMetrics: Record<string, number> = {};
    for (const sample of this.samples) {
      for (const [name, value] of Object.entries(sample.pageMetrics)) {
        peakPageMetrics[name] = Math.max(peakPageMetrics[name] ?? 0, value);
      }
    }
    const last = this.samples.at(-1)!;
    const first = this.samples[0]!;

    await Promise.all([this.browserSession.detach(), this.pageSession.detach()]);
    return {
      wallDurationMs: performance.now() - this.startedAt,
      browserCpuMs,
      pageMetrics,
      finalPageMetrics: finalMetrics,
      peakPageMetrics,
      peakRssMiB: rssSamples.length ? Math.max(...rssSamples) / 1024 : null,
      peakPssMiB: pssSamples.length ? Math.max(...pssSamples) / 1024 : null,
      initialRssMiB: first.totalRssKiB === null ? null : first.totalRssKiB / 1024,
      initialPssMiB: first.totalPssKiB === null ? null : first.totalPssKiB / 1024,
      finalRssMiB: last.totalRssKiB === null ? null : last.totalRssKiB / 1024,
      finalPssMiB: last.totalPssKiB === null ? null : last.totalPssKiB / 1024,
      dom,
      samples: this.samples,
    };
  }
}
