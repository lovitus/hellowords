# HelloWords · 词境

HelloWords is a calm, zoomable vocabulary world. Learners move from illustrated
places to objects, anatomy, nature, materials and microscopic detail, then roam
a spatial semantic universe containing every shipped word. Chinese meanings are
off by default, and the experience intentionally avoids quiz and streak pressure.

## Included in this version

- 30 reachable scene slices across home, city, nature, transport, health and
  microscopic science, with 1,622 contextual anchors in five zoom bands;
- four premium 1600 × 900 establishing illustrations plus lightweight deep
  cutaway SVG scenes;
- mouse, touch, wheel and pinch camera controls;
- automatic zoom entry, zoom-out return, breadcrumbs and explicit controls;
- English labels with a Chinese-meaning toggle that is off by default;
- a Canvas-based semantic universe where all 10,000 ranked English words have
  deterministic coordinates across four visible levels: 10 realms, 44 topics,
  704 subclusters and individual words;
- passive discovery tracking, searchable word focus, encounter cards and local
  pronunciation without compulsory testing;
- desktop and mobile layouts, keyboard-accessible controls and reduced motion;
- deterministic data generation, complete integrity checks and source notices;
- GitHub Actions build, browser tests, bundle analysis, and Chromium CPU/memory
  measurement.

All 10,000 entries are spatially reachable and searchable. The product still
distinguishes 1,622 manually contextualized scene anchors from words organized
in the semantic universe; it does not claim that every entry was individually
drawn.

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
