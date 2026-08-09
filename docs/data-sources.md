# Vocabulary data sources

## Selected sources

### Frequency ranking

- Project: `wordfreq`
- Version: `3.1.1`
- Distribution SHA-256:
  `4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473`
- Code license: Apache-2.0
- Data license: CC BY-SA 4.0; upstream notices must remain with derived data
- Upstream: <https://github.com/rspeer/wordfreq>

`wordfreq` provides the display-word order and Zipf frequency. Generated
vocabulary data is distributed separately from application code and retains
source and license metadata in every shard.

### Chinese meanings and phonetics

- Project: ECDICT
- Commit: `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- Input: `ecdict.csv`
- Input SHA-256:
  `1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`
- Input size: 65,933,428 bytes
- License: MIT
- Upstream: <https://github.com/skywind3000/ECDICT>

ECDICT supplies the compact Chinese meaning and, when present, phonetics.
Part-of-speech categories are inferred conservatively from its labeled Chinese
meaning lines; unknown remains a valid category rather than being guessed.

### Semantic organization

- Project: Princeton WordNet
- Version: 3.0
- Archive SHA-256:
  `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59`
- License: Princeton WordNet License
- Upstream: <https://wordnet.princeton.edu/>

WordNet supplies first-sense synsets, lexical categories and lemma relations.
The semantic generator verifies the pinned archive before parsing and has no
third-party Python dependency. The shipped license is retained in
`public/data/semantic/WORDNET-LICENSE.txt`.

## Measured coverage

A local evaluation normalized and filtered the first 20,000 `wordfreq` English
entries, then joined them against the pinned ECDICT CSV:

- 9,924 of the first 10,000 candidates had a non-empty Chinese meaning;
- scanning through frequency candidate rank 10,077 yielded 10,000 matched
  display words;
- the 10,000th unfiltered candidate had Zipf frequency 3.77.

This is sufficient for a deterministic 10,000-entry first release without a
runtime dictionary service. Generated artifacts are committed so ordinary CI
does not download or process the 65 MB source. A manual regeneration command
verifies both upstream input hashes before producing stable JSON.

The semantic build assigns 10,000 of 10,000 entries to deterministic world
coordinates. WordNet directly resolves 9,177 entries (91.77%); explicit
classification handles inflections, names, named entities, abbreviations,
contractions and function words. The resulting 44 topic shards contain 10
realms, 704 subclusters and 8,020 concept groups.

## Integrity rules

CI rejects the dataset if any of the following are true:

- fewer than 10,000 normalized unique display words;
- empty IDs, words, meanings, source references, or license metadata;
- duplicate or non-monotonic ranks;
- invalid shard counts or hashes;
- atlas coverage differs from the vocabulary manifest;
- semantic reachability differs from exactly 10,000 unique IDs or coordinates;
- semantic shards contain dangling entries, duplicate positions or unstable
  regeneration output;
- scene placements reference missing vocabulary IDs;
- vocabulary data is bundled into the initial JavaScript chunk.
