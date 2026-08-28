# HelloWords · 词境

HelloWords is a calm, zoomable vocabulary world. Learners move from illustrated
places to objects, anatomy, nature, materials and microscopic detail, then roam
a structured lexical world containing every shipped word. Chinese meanings are
off by default, and the experience intentionally avoids quiz and streak pressure.

## Included in this version

- 37 reachable scene slices across home, city, nature, gardening, transport,
  health and microscopic science, with 3,082 human-verified contextual anchors
  representing 2,694 distinct English display terms in five cumulative zoom bands;
- 36 independently reviewed 1600 × 900 raster scenes plus the large-canvas world
  atlas, whose 2604 × 989 base and 5208 × 1978 high tier preserve six audited
  source panels; no spatial scene uses an SVG cutaway;
- 255 authored local detail zones across the scene world, grouping truthful
  word batches around visible regions of each illustration;
- mouse, touch, wheel and pinch camera controls;
- 36 typed scene portals with recursive high-resolution tile handoff,
  continuous zoom entry and reverse zoom-out return, plus a compact translucent
  minimap for the current path and direct child scenes;
- English labels with a Chinese-meaning toggle that is off by default;
- a single semantic zoom plane where all 10,000 ranked English words remain
  reachable through four scale-dependent levels: 10 realms, 44 topics, 704
  subclusters and individual words, with collision-free screen-space bubbles;
- 214 sense-reviewed spatial-to-lexical links that connect visible scene terms
  directly to their matching entries in the 10,000-word hierarchy;
- passive discovery tracking, searchable word focus, encounter cards and local
  pronunciation without compulsory testing;
- desktop and mobile layouts, keyboard-accessible controls and reduced motion;
- deterministic data generation, complete integrity checks and source notices;
- GitHub Actions build, browser tests, bundle analysis, and Chromium CPU/memory
  measurement.

All 10,000 entries are hierarchically reachable and searchable. The product
still distinguishes 3,028 human-verified contextual scene anchors representing
2,694 distinct display terms from words organized in the lexical world; it does
not claim that every entry was individually drawn.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

The production verification path mirrors GitHub Actions:

```bash
npm run verify
npm run test:e2e
PERF_RUN=1 npm run test:perf
```

## Vocabulary data

Frequency order comes from `wordfreq 3.1.1`; Chinese meanings and phonetics come
from ECDICT at commit `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`;
semantic grouping uses the pinned Princeton WordNet 3.0 archive. Ranked data is
split into ten bands and semantic data into 44 topic shards, neither of which
is bundled into initial JavaScript.

See [data sources](docs/data-sources.md) and
[third-party notices](public/data/THIRD_PARTY_NOTICES.md) for versions,
checksums, attribution, and licenses. Ordinary CI validates committed data; the
manual generator verifies pinned upstream hashes before replacing it.

## Engineering decisions

- [Architecture](docs/architecture.md)
- [Performance budget](docs/performance-budget.md)
- [GitHub Actions workflow](.github/workflows/ci.yml)

Runtime performance reports separate visual transition latency, test-harness
latency, Chrome process CPU time, renderer task time, JS heap, DOM counts, RSS,
and Linux PSS. GitHub's `ubuntu-24.04` performance job is authoritative for PSS;
macOS reports RSS as a non-comparable local diagnostic.
