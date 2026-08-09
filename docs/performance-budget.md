# Performance and resource budget

Status: initial protective ceilings; recalibrate after repeated main-branch runs

## Rendering limits

| Metric | Budget |
| --- | ---: |
| Mounted scene surfaces | <= 2 |
| Visible desktop labels | <= 24 |
| Visible mobile labels | <= 16 |
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

The semantic universe uses a single DPR-capped Canvas, 320 px repository
spatial-hash cells, viewport culling, screen-space label collision and zoom-tier
candidate limits of 44/76/170/300/480/720. Its overview loads 24 small topic
neighborhoods distributed across all ten realms; zoom and search hydrate only
required topic shards. Its live DOM budget remains independent of the
10,000-word count.

## Interaction limits

| Metric | Budget |
| --- | ---: |
| Cold LCP | <= 2,500 ms |
| Cold first scene switch p95 | <= 1,000 ms |
| Warm scene switch p50 | <= 150 ms |
| Warm scene switch p95 | <= 300 ms |
| Long tasks over 50 ms in 40 warm transitions | <= 2 |
| Longest warm long task | <= 120 ms |
| Renderer task duration | <= 75 ms / transition |
| All Chrome process CPU | <= 150 ms / transition |

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

A separate semantic-universe scenario loads all 10,000 entries, focuses an
exact search result and performs a deterministic pan/zoom sequence while gating
DOM size, duplicate shard requests, JS heap, long tasks and browser CPU.

CPU sampling uses CDP `SystemInfo.getProcessInfo().cpuTime`. Linux PSS is sampled
from `smaps_rollup`; RSS from `/proc/<pid>/status` is recorded as a higher-rate,
less precise peak approximation. CDP performance metrics, JS heap, DOM counters,
User Timing, and long-task observations are stored alongside process samples.

Formal measurement disables traces, video and screenshots. A failing run may
perform a separate diagnostic rerun with tracing; diagnostic measurements are
never compared with the formal budget.

Artifacts include environment metadata, raw NDJSON samples, a JSON summary,
human-readable Markdown, word-integrity results and a compressed build-size
manifest. GitHub-hosted runner variance means absolute values are protective
ceilings, not claims about real devices. After enough runs, relative regression
gates should compare base and head on the same runner.
