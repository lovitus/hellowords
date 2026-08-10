# Lexical-world navigation contract

`public/data/lexical-world` is the lightweight navigation layer for the complete
10,000-word lexical world. It does not copy the vocabulary payload. Leaf nodes
hold stable semantic node IDs plus a query into the existing topic shard.

## Routes and hierarchy

- `/data/lexical-world/manifest.json` — the `overview`, with 10 realm links.
- `/data/lexical-world/realms/{realmId}.json` — one realm, with topic links.
- `/data/lexical-world/topics/{topicId}.json` — one topic, with its subclusters.
- `/data/semantic/topics/{topicId}.json` — the existing word payload referenced
  by both the topic's `semanticShard` and every subcluster's `nodeSource`.

Every navigable object has `id`, `kind`, `labelEn`, `labelZh`, `count`,
`childrenCount`, `children`, and `previewWords` (or appears as a link to the file
that has `children`). Link objects add `path`. A preview is only `{id, word}`.

A subcluster is the leaf of the navigation files:

```json
{
  "id": "animals--bird",
  "kind": "subcluster",
  "labelEn": "Bird",
  "labelZh": "鸟类",
  "count": 14,
  "children": ["en-…"],
  "previewWords": [{ "id": "en-…", "word": "eagles" }],
  "empty": false,
  "nodeSource": {
    "path": "/data/semantic/topics/animals.json",
    "collection": "nodes",
    "idField": "id",
    "match": { "field": "subclusterId", "value": "animals--bird" }
  }
}
```

The ID-only `children` array makes reachability explicit without duplicating
meanings, phonetics, parts of speech, or coordinates. Runtime code can load one
semantic shard and filter it with `nodeSource.match`.

## Invariants

The validator proves the following against the source semantic manifest and all
44 topic shards:

- 10 realms, 44 topics, 704 subclusters, and exactly 10,000 node references;
- every semantic node is reachable once, with no duplicates or dangling IDs;
- subcluster, topic, realm, and overview counts close at every boundary;
- every topic and leaf points to the correct existing semantic shard;
- empty subclusters are explicitly marked (the current dataset has none);
- previews belong to their branch and match the source display word;
- generation is deterministic and the navigation JSON remains under 1 MB.

## Visual asset approval gate

Lexical-world artwork is deny-by-default. Runtime code must obtain image paths
from `app/lib/lexical-world-visuals.ts`; adding a file under `public/scenes` does
not make it eligible for use. The manifest records the approved path, review
status, dimensions, and SHA-256 digest so an image cannot be swapped silently
after review.

The sole approved production visual is currently
`/scenes/lexical-world-overview-bright-v2.jpg`. Realm experiments and the older
overview were rejected and are not packaged. To promote a new visual, complete
human review, add its immutable digest to the manifest, and update the asset
gate test in the same change. The test fails when application source references
an image outside the allowlist, when a rejected candidate is referenced, when
the reviewed bytes change, or when an unapproved lexical image is packaged.

Generate and validate without rebuilding the application:

```sh
node scripts/generate-lexical-world.mjs
node scripts/validate-lexical-world.mjs
node --test tests/lexical-world/*.test.mjs
```
