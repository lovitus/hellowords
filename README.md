# HelloWords · 词境

HelloWords is a calm, zoomable vocabulary world. Learners explore illustrated
SVG scene slices, move from places to objects to parts and materials, and reveal
Chinese meanings only when they choose. The first version intentionally avoids
quizzes and streak pressure.

## Included in this version

- five-level scene chain: apartment → kitchen → coffee machine → water tank →
  polymer;
- mouse, touch, wheel and pinch camera controls;
- automatic zoom entry, zoom-out return, breadcrumbs and explicit controls;
- English labels with a Chinese-meaning toggle that is off by default;
- a lazily loaded, searchable atlas of exactly 10,000 ranked English words;
- desktop and mobile layouts, keyboard-accessible controls and reduced motion;
- deterministic data generation, complete integrity checks and source notices;
- GitHub Actions build, browser tests, bundle analysis, and Chromium CPU/memory
  measurement.

The product states clearly that illustrated scene anchors are curated while the
remaining entries live in the searchable vocabulary atlas. It does not claim
that all 10,000 words were individually illustrated.

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
from ECDICT at commit `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`. Generated
data is split into ten rank bands and is not bundled into initial JavaScript.

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
