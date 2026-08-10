# Performance and resource budget

Status: initial protective ceilings; recalibrate after repeated main-branch runs

## Rendering limits

| Metric | Budget |
| --- | ---: |
| Mounted scene surfaces | <= 2 |
| Fully readable desktop labels | <= 64 |
| Fully readable mobile labels | <= 32 |
| Live DOM nodes | <= 1,500 |
| Individual SVG, gzip | <= 350 KiB |
| Individual raster asset | <= 1.2 MiB |
| Initial JavaScript, gzip | <= 300 KiB |
| Largest semantic shard, gzip | <= 300 KiB |
| Cold initial encoded bytes | <= 1 MiB |
| Cold initial requests | <= 20 |

Artwork should avoid expensive blur/filter chains. Only `transform` and
`opacity` are animated during camera and scene transitions. Temporary
`will-change` hints are removed after transitions.

The scene viewer keeps a larger authored set in the current slice, but five
continuous LOD bands, viewport culling and a screen-space collision index keep
the fully readable set within the budgets above. Hidden labels are removed from
pointer, keyboard and accessibility navigation.

The lexical world uses unscaled HTML at four explicit levels: overview, realm,
topic and semantic subcluster. Normal browsing hydrates only the selected
branch and topic shard. Search may query all 44 topic shards, but requests are
deduplicated and the active virtual word window is capped at 80 cards on
desktop and 40 on mobile. The lexical dialog stays below 450 live DOM nodes and
the complete page below 900 while browsing a large subcluster, so DOM size is
independent of the 10,000-word count.

## Interaction limits

| Metric | Budget |
| --- | ---: |
| Cold LCP | <= 2,500 ms |
| Cold first scene switch p95 | <= 1,000 ms |
| Warm visual scene switch p50 | <= 350 ms |
| Warm visual scene switch p95 | <= 650 ms |
| Long tasks over 50 ms in 40 warm transitions | <= 2 |
| Longest warm long task | <= 120 ms |
| Renderer task duration | <= 75 ms / transition |
| Headless all-Chrome CPU (including SwiftShader) | <= 750 ms / transition |

## Memory and retention limits

| Metric | Budget |
| --- | ---: |
| JS heap peak | <= 96 MiB |
| Post-GC retained heap growth after 100 transitions | <= 12 MiB and 20% |
| Total Chrome PSS peak on Linux | <= 350 MiB |
| PSS growth after retention scenario | <= 40 MiB and 15% |
| Event-listener growth after retention scenario | <= 20 |

## Benchmark protocol

The required CI environment is `ubuntu-24.04`, Node 22 and the exact Chromium
revision installed by the lockfile's Playwright version. Browser tests run with
one worker against a production build. Fonts and scene assets are local and the
browser starts with a fresh profile.

Three scenarios report separately:

1. cold start and the first three-level descent;
2. a warmed deterministic sequence of 40 enter/return transitions;
3. 100 enter/return transitions followed by a retained-memory check.

A separate lexical-world scenario searches across all 10,000 entries, resolves
an exact result into its hierarchy, opens a large subcluster and scrolls its
virtual list to the end while gating DOM size, duplicate shard requests, JS
heap, long tasks and browser CPU.

CPU sampling uses CDP `SystemInfo.getProcessInfo().cpuTime`. Linux PSS is sampled
from `smaps_rollup`; RSS from `/proc/<pid>/status` is recorded as a higher-rate,
less precise peak approximation. CDP performance metrics, JS heap, DOM counters,
User Timing, and long-task observations are stored alongside process samples.
The all-process CPU ceiling includes Chromium's software GPU process in the
pinned headless environment. It is a same-environment regression ceiling, not
an estimate of hardware-GPU device CPU. Renderer `TaskDuration`, long tasks and
the user-visible transition measure remain separately gated.

Formal measurement disables traces, video and screenshots. A failing run may
perform a separate diagnostic rerun with tracing; diagnostic measurements are
never compared with the formal budget.

Artifacts include environment metadata, raw NDJSON samples, a JSON summary,
human-readable Markdown, word-integrity results and a compressed build-size
manifest. GitHub-hosted runner variance means absolute values are protective
ceilings, not claims about real devices. After enough runs, relative regression
gates should compare base and head on the same runner.
