# Lexical-world navigation contract

`public/data/lexical-world` is the lightweight navigation layer for the complete
10,000-word lexical world. It does not copy the vocabulary payload. Leaf nodes
hold stable semantic node IDs plus a query into the existing topic shard. The
runtime projects this hierarchy onto one continuous semantic plane; hierarchy
levels are scale-dependent LODs rather than separate routes.

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

## Continuous semantic plane

The semantic field retains one 1600 × 900 logical coordinate system while the
camera moves from realms to topics, subclusters, and words. The previously
populated LOD stays visible until the requested branch is ready, then its child
LOD replaces it in the same spatial field. Text remains unscaled HTML in screen
space, so zooming never blurs a word.

Only nodes inside the current camera field are projected. A deterministic
screen-space placer resolves overlaps, protects the viewer chrome, and exposes
at most 80 live vocabulary bubbles on desktop or 40 on mobile. The cap limits
rendered bubbles, not reachability: panning and zooming can reveal every entry
in the selected semantic branch.

Normal exploration loads only the active hierarchy branch and its selected
topic shard. Global search is the explicit exception: it may query all 44 topic
shards, while the repository deduplicates concurrent requests and bounds
results. Selecting a match opens its word detail without moving the semantic
camera to another branch.

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

The reviewed world overview is `/scenes/lexical-world-overview-bright-v2.jpg`.
All ten realms now have distinct, reviewed daylight visuals in the same
immutable manifest. To promote or replace a visual, complete
human review, add its immutable digest to the manifest, and update the asset
gate test in the same change. The test fails when application source references
an image outside the allowlist, when a rejected candidate is referenced, when
the reviewed bytes change, or when an unapproved lexical image is packaged.

### Overview realm tiles

The overview is also the spatial navigation contract for semantic zoom. Each
reviewed realm entry owns an absolute-pixel `overviewRect`, an in-rect
`focalPoint`, a 16:9 `detailRect`, and its canonical English and Chinese labels.
Coordinates refer to the immutable 1600 × 900 overview bytes; they are not
percentages and must not be inferred again in a renderer. `overviewRect` is the
tight, reviewed entrance target. `detailRect` is the wider field used to place
the high-resolution realm image and all deeper semantic levels without
`object-fit: cover` discarding content.

| Realm | Overview rectangle `x,y,w,h` | Detail rectangle `x,y,w,h` | Focal point | Visible landmark |
| --- | ---: | ---: | ---: | --- |
| Nature & life | `0,35,505,300` | `0,0,672,378` | `235,205` | Conservatory and gardens |
| Body & daily life | `405,5,445,325` | `292,0,672,378` | `640,160` | Homes and daily-life courtyard |
| Objects & technology | `1065,310,535,315` | `928,279,672,378` | `1390,455` | Mechanical workshop |
| People & society | `820,0,390,355` | `679,0,672,378` | `1015,160` | Civic hall and public square |
| Mind & values | `1150,65,450,300` | `928,26,672,378` | `1368,225` | Learning campus and reflective court |
| Language & culture | `0,530,510,370` | `0,522,672,378` | `245,685` | Theatre and performance space |
| Actions & events | `420,535,440,365` | `304,522,672,378` | `650,735` | Sports and activity ground |
| Space, time & measure | `0,310,560,300` | `0,271,672,378` | `250,425` | Observatory and instruments |
| Qualities & states | `775,530,415,370` | `647,522,672,378` | `990,735` | Materials and design studio |
| Grammar & relations | `1140,525,460,375` | `928,522,672,378` | `1360,715` | Library and connected reading rooms |

Use `lexicalWorldRealmTiles()` for stable manifest-order iteration and
`lexicalWorldTileForRealm(id)` for lookup. The latter returns `undefined` for
an unknown id so a zoom target cannot silently jump to the wrong island. Tests
keep all ten rectangles in bounds, ensure no rectangle captures another
realm's focal point, limit pairwise overlap, and require a unique reviewed
high-resolution asset for every realm. Every `detailRect` is exactly 16:9,
contains its reviewed `overviewRect` and focal point, and stays within the
1600 × 900 source. Detail fields may overlap because only the active realm's
high-resolution image is rendered.

Generate and validate without rebuilding the application:

```sh
node scripts/generate-lexical-world.mjs
node scripts/validate-lexical-world.mjs
node --test tests/lexical-world/*.test.mjs
```
