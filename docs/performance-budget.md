# Performance and resource budget

Status: initial protective ceilings; recalibrate after repeated main-branch runs

## Rendering limits

| Metric | Budget |
| --- | ---: |
| Mounted scene surfaces | <= 2 |
| Live collision-free desktop vocabulary bubbles | <= 80 |
| Live collision-free mobile vocabulary bubbles | <= 40 |
| Live DOM nodes | <= 1,500 |
| Initial/base raster asset | <= 1.2 MiB |
| Declared 2× high-density raster | <= 4.8 MiB |
| Initial JavaScript, gzip | <= 300 KiB |
| Largest semantic shard, gzip | <= 300 KiB |
| Cold initial encoded bytes | <= 1 MiB |
| Cold initial requests | <= 20 |

Artwork should avoid expensive blur/filter chains. Camera surfaces move with
`transform`; recursive tiles reveal with `opacity` and a lightweight radius
cue. Temporary `will-change` hints are scoped to transition elements.

The scene viewer keeps a larger authored set in the current slice, but five
continuous LOD bands, viewport culling and a screen-space collision index keep
the fully readable set within the budgets above. Hidden labels are removed from
pointer, keyboard and accessibility navigation.

Multi-resolution scenes always server-render and first paint their reviewed
1600 × 900 base raster. Camera scale, fitted scale and device-pixel ratio then
select a declared 2× tier. That tier must decode before the main image and blur
backdrop switch together, and a decoded tier is reused across zoom round trips.
The larger 4.8 MiB ceiling applies only to these explicit high-density
descriptors; it does not weaken the 1.2 MiB initial/base ceiling.

The lexical world keeps realms, topics, semantic subclusters, and words on one
continuous semantic plane. Normal exploration hydrates only the active branch
and selected topic shard. The projected label layer is collision-resolved and
capped at 80 live screen-space bubbles on desktop or 40 on mobile, so DOM size
is independent of the 10,000-word count. Global search is the deliberate
exception that may query all 44 topic shards; those requests are deduplicated
and results remain bounded. The lexical dialog and its incremental page DOM
cost each stay below 450 live nodes during deep semantic exploration, independent
of how many audited labels the underlying spatial scene contains. The complete
page remains subject to the general 1,500-node ceiling.

## Interaction limits

| Metric | Budget |
| --- | ---: |
| Cold LCP | <= 2,500 ms |
| Cold first portal handoff p95 | <= 1,000 ms |
| Warm visual portal handoff p50 | <= 350 ms |
| Warm visual portal handoff p95 | <= 650 ms |
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

A separate lexical-world scenario first zooms on the same plane through
`Qualities & states → Qualities → qualities--general-all` to the word LOD. It
then searches `just` across all 44 topic shards and opens that result's word
detail without retargeting the semantic camera. The scenario gates
collision-free bubble budgets, DOM size, duplicate shard requests, JS heap,
long tasks, and browser CPU.

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
