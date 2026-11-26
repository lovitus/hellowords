import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Usage: node probe/.github/continued-use.mjs product "$RUNNER_TEMP/continued-use"
// The caller verifies the frozen production artifact, places dist in the product checkout,
// and installs that checkout's locked dependencies and Playwright Chromium.
const product = "c0e2a62b54f7851f2c46efd6fe861c758f53b00a";
const buildRun = "45850668568";
assert(process.argv.length === 4, "Expected a product checkout and an empty evidence directory");
const checkout = resolve(process.argv[2]);
const out = resolve(process.argv[3]);
const file = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const read = name => JSON.parse(readFileSync(join(out, name), "utf8"));
const planned = ["main-1", "main-2", "allocators-1"];
const order = ["main-1-active", "main-1-idle", "main-2-idle", "main-2-active", "allocators-1-active", "allocators-1-idle"];
const provenance = {
  product, buildRun, diagnosticCommit: process.env.GITHUB_SHA, platform: process.platform, order,
  baselineRounds: 20, warmupRounds: 1, activeAdditionalRounds: 20, commonQuietMs: 3000,
  orderNote: "Each arm gets a fresh browser. Main pair 1 and the allocator pair measure active first, then match idle to its duration. Main pair 2 reverses order. Its common window is 105% of main pair 1's active duration; any remaining time after 20 trips is spent idle. An overrun and timer jitter are retained in the result.",
  measurement: "The two main pairs run without tracing. A separate pair collects detailed allocator dumps. All PSS values sum the CDP process inventory at that checkpoint.",
};

function comparePair(pair, active, idle) {
  if (pair === "main-2") assert.equal(active.targetMs, idle.targetMs);
  else assert.equal(active.branchMs, idle.targetMs);
  const compared = ["end", "quiet", "gc"];
  const roles = [...new Set([active, idle].flatMap(r => [r.checkpoints.mid,
    ...compared.map(s => r.checkpoints[s])].flatMap(c => Object.keys(c.byRoleKiB))))].sort();
  function changes(measures) {
    return Object.fromEntries(compared.map(s => [s, Object.fromEntries(Object.entries(measures).map(([name, value]) => {
      const a = value(active, s) - value(active, "mid");
      const b = value(idle, s) - value(idle, "mid");
      assert(Number.isFinite(a) && Number.isFinite(b), `Missing ${name} for ${s}`);
      return [name, { activeMinusMid: a, idleMinusMid: b, activeMinusIdleChange: a - b }];
    }))]));
  }
  const pss = Object.fromEntries(roles.map(role => [role, (r, s) => r.checkpoints[s].byRoleKiB[role] ?? 0]));
  pss.total = (r, s) => r.checkpoints[s].totalPssKiB;
  const heaps = {
    v8Used: (r, s) => r.checkpoints[s].heapBytes.usedSize,
    v8Capacity: (r, s) => r.checkpoints[s].heapBytes.totalSize,
    embedderUsed: (r, s) => r.checkpoints[s].heapBytes.embedderHeapUsedSize,
    backingStorage: (r, s) => r.checkpoints[s].heapBytes.backingStorageSize,
  };
  if (active.traced) {
    heaps.blinkCommitted = (r, s) => r.dumps[s].bytes["blink_gc/main/heap"].committed_size;
    heaps.blinkAllocatedObjects = (r, s) => r.dumps[s].bytes["blink_gc/main/heap"].allocated_objects_size;
    heaps.v8DumpHeapSize = (r, s) => r.dumps[s].bytes["v8/main/heap"].size;
  }
  const branchDifferenceMs = active.branchMs - idle.branchMs;
  const quietDifferenceMs = active.quietMs - idle.quietMs;
  const branchToleranceMs = Math.max(150, 0.01 * idle.targetMs);
  return { pair, activeBranchMs: active.branchMs, idleBranchMs: idle.branchMs,
    idleTargetMs: idle.targetMs, activeRouteMs: active.routeMs, activePaddingMs: active.paddingMs,
    branchDifferenceMs, quietDifferenceMs, branchToleranceMs, quietToleranceMs: 150,
    timingMatched: Math.abs(branchDifferenceMs) <= branchToleranceMs && Math.abs(quietDifferenceMs) <= 150,
    activeQuietMs: active.quietMs, idleQuietMs: idle.quietMs, changesKiB: changes(pss),
    heapChangesBytes: changes(heaps), domChangesCount: changes({
      nodes: (r, s) => r.checkpoints[s].dom.nodes, attachedElements: (r, s) => r.checkpoints[s].liveElements,
    }),
  };
}

mkdirSync(out, { recursive: true, mode: 0o700 });
assert.equal(readdirSync(out).length, 0, "Evidence directory must be empty");
let stage = "checking-frozen-source";
try {
  file("run.json", { ...provenance, status: "running", stage });
  assert.equal(process.platform, "linux");
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" });
  assert.equal(commit.status, 0);
  assert.equal(commit.stdout.trim(), product);
  const perfDir = join(checkout, "tests/perf");
  function pinned(name, digest) {
    const contents = readFileSync(join(perfDir, name), "utf8");
    assert.equal(createHash("sha256").update(contents).digest("hex"), digest);
    return contents;
  }
  const source = pinned("world-performance.spec.ts", "4cb6deb4a9aca5c7783250db7ac54119a515e5926d8c4b6319f3dc155de87e2a");
  pinned("browser-metrics.ts", "137f93ca5c4586ca83b3b81af7417b6e4b886d54f51e1dc6cc8ad2f80ba3a548");
  const cutoff = source.indexOf("function scenarioSummary(");
  assert(cutoff > 0 && source.indexOf("async function exitToParent(") < cutoff);
  const spec = "continued-use.spec.ts";
  writeFileSync(join(perfDir, spec), source.slice(0, cutoff) + "\n" +
    readFileSync(new URL("./continued-use-probe.ts", import.meta.url), "utf8"), { flag: "wx" });
  const browsers = new Set();
  const results = new Map();
  const pairs = [];
  for (const group of order) {
    stage = group;
    file("run.json", { ...provenance, status: "running", stage });
    const log = openSync(join(process.env.RUNNER_TEMP, `continued-use-${group}.log`), "wx", 0o600);
    let task;
    try {
      task = spawnSync(join(checkout, "node_modules/.bin/playwright"), ["test", `tests/perf/${spec}`,
        "--project=performance", "--workers=1", "--retries=0", "--reporter=line"], {
        cwd: checkout, stdio: ["ignore", log, log],
        env: { ...process.env, PERF_RUN: "1", PERF_SOURCE_SHA: product,
          MEMORY_GROUP: group, MEMORY_EVIDENCE: out, MEMORY_QUIET_MS: String(provenance.commonQuietMs) },
      });
    } finally {
      closeSync(log);
    }
    assert.equal(task.status, 0, "The hosted group failed; see its sanitized checkpoint record");
    const record = read(`${group}.json`);
    assert.equal(record.status, "complete");
    const browser = record.checkpoints.mid.processes.find(p => p.role === "browser");
    assert(!browsers.has(browser.pid), "A browser PID occurred in more than one group");
    browsers.add(browser.pid);
    results.set(group, record);
    const pair = group.replace(/-(active|idle)$/, "");
    const active = results.get(`${pair}-active`), idle = results.get(`${pair}-idle`);
    if (active && idle) {
      stage = `summarizing-${pair}`;
      pairs.push(comparePair(pair, active, idle));
      const main = pairs.filter(p => p.pair.startsWith("main-"));
      file("summary.json", { ...provenance, completedPairs: pairs.length, pairs,
        primaryOrderComparisonReady: main.length === 2 && main.every(p => p.timingMatched),
        roleNote: "An absent role contributes zero to its sum. DOM/heap counters and PSS are separate measures. Only the supplementary pair has allocator measurements.",
      });
    }
  }
  assert.equal(pairs.length, planned.length);
  stage = "complete";
  file("run.json", { ...provenance, status: "complete", stage });
} catch {
  file("run.json", { ...provenance, status: "failed", stage });
  console.error(`Continued-use diagnostic failed at ${stage}. See the sanitized evidence directory.`);
  process.exitCode = 1;
}
