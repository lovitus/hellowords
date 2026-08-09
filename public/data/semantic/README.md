# HelloWords semantic atlas

This directory makes every one of the ranked 10,000 vocabulary entries reachable
through a semantic world rather than an alphabetical list.

- `manifest.json` is the small entry point. Its `clusters` and `shards` fields are
  the runtime contract; `realms`, `topics`, and `subclusters` provide richer zoom levels.
- `topics/*.json` are independent on-demand shards. A node carries the original
  learning content plus its semantic provenance, lemma relationship, importance,
  and deterministic world coordinate.
- `quality-report.json` records coverage, fallback paths, concept relationships,
  and all count invariants.
- `WORDNET-LICENSE.txt` contains the upstream Princeton WordNet license.

Generate and validate:

```sh
python3 scripts/semantic-generate.py
node scripts/semantic-validate.mjs
node --test tests/semantic/*.test.mjs
```

The generator downloads only the pinned WordNet 3.0 archive and verifies its
SHA-256 before parsing. It uses no third-party Python package. Repeated runs are
tested for byte-for-byte identical output.
