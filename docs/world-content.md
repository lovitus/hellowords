# HelloWords world content

The world is a deterministic, zoomable tree. Every scene uses the same 1600 × 900 coordinate system, so portals, camera movement and vocabulary anchors remain predictable from the atlas down to a molecule.

## Content map

```text
World atlas
├── Home: Apartment
│   ├── Kitchen → Coffee machine → Water tank → Polymer
│   └── Bedroom → Wardrobe interior → Cotton shirt
├── City: City street
│   ├── Transit hub
│   │   ├── Electric bus → Battery pack → Lithium-ion cell
│   │   └── Railway platform → Train carriage → Rail bogie
│   └── Science museum → Human body → Heart → Blood cell
│                                      └── Hemoglobin → Oxygen molecule
└── Nature: City park
    ├── Oak tree → Leaf → Plant cell → Chloroplast interior
    └── Pond edge → Frog
```

The graph contains 30 reachable scenes and 29 parent-to-child portals. Six root-to-leaf paths contain at least five scenes; the longest contains eight. The branches connect an observable parent to a truthful closer view: clothing narrows from a room to a wardrobe and woven cotton, a vehicle narrows to an electrochemical cell, blood narrows to a carrier protein and oxygen, and a leaf narrows to the membrane machinery of a chloroplast.

## Vocabulary and LOD

Spatial scenes now contain 606 human-verified anchors representing 543 distinct English display terms. The previous 1,622-label set was a topic vocabulary list rather than a visual annotation set: 1,016 entries remain removed because the named object, part, action or property cannot be pointed to in the published image. This release adds 119 grounded anchors by upgrading six sparse scenes with richer artwork, not by restoring floating topic words. Global vocabulary remains available in the semantic atlas; a word only appears over a scene when the scene itself supplies visual evidence.

Every scene JSON contains:

- `anchorAudit`, recording the exact reviewed asset, old/retained/removed counts, representative removals and the scene-specific rationale;
- `visualRegions`, describing bounded visible objects, parts or diagram marks in the 1600 × 900 source coordinate system;
- `sourceVisualRegion` on every label and portal.

The authored `x`/`y` is the point on the object itself, not a pre-arranged card position. Runtime collision handling may move the word capsule, but the guide line and anchor dot continue to point to that authored pixel.

Each scene covers five progressive density bands:

- level 0 — the whole scene and largest visible objects;
- level 1 — secondary visible objects;
- level 2 — visible parts and fixtures;
- level 3 — smaller visible parts or explicitly drawn diagram elements;
- level 4 — the finest still-identifiable detail.

All five bands remain available. Newly upgraded premium scenes must contain at least 24–36 grounded labels, at least twelve overview labels, and at least three labels in every LOD. Existing specialist terminal diagrams may remain smaller until their artwork is upgraded: an eight-label polymer diagram is still more trustworthy than a 48-label diagram padded with invisible material properties and manufacturing processes, but it is no longer the target experience.

## Exploration cues and anchors

The viewer uses two deliberately different zoom cues:

- a gold `进入 · …` marker identifies a real portal and promises that zooming or activating it will enter the named child scene;
- a compact green `Aa` ring with an exact `… 个词` badge identifies a non-portal object region and keeps the current scene while revealing the next vocabulary detail band.

Vocabulary cues are generated only from reviewed label anchors outside every portal. Each cue sits on a real authored object point, names the number of currently hidden words it can reveal, and advances to the next useful detail band after activation. A screen-space `还有 … 词 · 继续放大` summary makes the scene-wide hidden total explicit even when the user has not noticed a local anchor. Desktop shows at most six local cues and compact screens at most four, so every useful area is signposted without rebuilding the old label cloud. Primary region targets are 52 × 52 CSS pixels; truthful one-to-three-word leftovers use compact 44 × 44 green anchors instead of disappearing. Both remain above word labels and use green rings rather than the solid gold portal treatment. Mobile zoom controls and the global summary also keep a minimum 44-pixel touch target. The green cue pulse is disabled when reduced motion is requested.

Every visible word is rendered as a callout: a green anchor dot remains on the exact reviewed pixel while a short leader connects it to the collision-adjusted word capsule. This keeps the semantic attachment visible even when nearby labels must move apart for readability.

Translations remain authored for the visible scene meaning. For example, `chamber` is `心腔` in the heart cutaway. Removed spatial labels are not deleted from the application vocabulary; they remain learnable in the semantic atlas without pretending that the current image depicts them.

## Per-scene audit result

| Scene | Before → retained | Main removal reason |
|---|---:|---|
| World atlas | 73 → 31 | Unpictured infrastructure, institutions and geographic landmarks |
| Apartment | 60 → 37 | Invisible appliances, toiletries and duplicate furniture names |
| Kitchen | 57 → 40 | Premium kitchen adds real appliances, cookware, utensils and tableware; absent processes remain removed |
| Coffee machine | 58 → 22 | Hidden components, duplicate part names and brewing processes |
| Water tank | 56 → 18 | Invented plumbing, physical properties and maintenance actions |
| Polymer | 56 → 8 | Material classes, properties and manufacturing processes not encoded by the diagram |
| Bedroom | 51 → 12 | Sleep actions, mood adjectives and absent accessories |
| Wardrobe interior | 48 → 7 | Garment categories and accessories not distinguishable from simple color blocks |
| Cotton shirt | 48 → 13 | Textile machinery, factory actions and performance properties |
| City street | 59 → 35 | Unpictured street furniture and traffic situations |
| Transit hub | 60 → 12 | Ticketing facilities, passengers and service concepts absent from the SVG |
| Electric bus | 56 → 15 | Hidden controls, drivetrain systems and operational concepts |
| Battery | 56 → 11 | Invisible electrochemistry, electrical metrics and failure processes |
| Lithium-ion cell | 48 → 14 | Unlabelled material identities, performance metrics and hazard states |
| Railway platform | 48 → 10 | Staff roles, ticket concepts, actions and service states |
| Train carriage | 48 → 16 | Amenities and passenger actions not drawn in the cutaway |
| Rail bogie | 48 → 17 | Maintenance actions, failure states and invisible subassemblies |
| Science museum | 56 → 35 | Premium gallery replaces generic display words with specific visible fossils, instruments and models |
| Human body | 56 → 21 | Whole body systems and organs not separately rendered |
| Heart | 56 → 19 | Invisible physiology, conduction nodes and duplicate wall terms |
| Blood cell | 56 → 13 | Undrawn blood-cell subtypes, immune processes and duplicate names |
| Hemoglobin | 48 → 10 | Diseases, test concepts and invisible binding behavior |
| Oxygen molecule | 48 → 11 | Chemical reactions, respiratory actions and unencoded properties |
| City park | 60 → 27 | Invented amenities, animals and activities; duplicate place terms |
| Oak tree | 56 → 35 | Premium woodland close-up grounds wildlife, fungi and texture; invisible processes and growth rings stay removed |
| Leaf | 56 → 31 | Premium macro grounds anatomy, insects and surface damage; unseen chemistry and internal tissues stay removed |
| Plant cell | 56 → 31 | Premium 3D cutaway resolves organelles and membranes; unseen molecules and processes stay removed |
| Chloroplast interior | 48 → 28 | Premium microscopic world resolves membranes and stacks; reactions and unpictured metabolites stay removed |
| Pond edge | 48 → 14 | Species and water activities absent from the illustration |
| Frog | 48 → 13 | Behavior, ecology, prey and undrawn external features |

## Visual strategy

The atlas and its first-level destinations use high-detail 1600 × 900 raster illustrations because they establish place and atmosphere at a glance. `city-street` uses `city-street-museum-v2.jpg`: its left facade visibly carries an atom emblem and telescope/skeleton exhibit windows, so the science-museum portal no longer points to an ordinary shop. Its other portal covers the glass transit hall.

Six former SVG bottlenecks now use premium 1600 × 900 raster scenes: kitchen, science museum, oak tree, leaf, plant cell and chloroplast interior. This keeps the first descent in every root branch visually rewarding and turns the entire `City park → Oak tree → Leaf → Plant cell → Chloroplast` path into one continuous high-detail journey. The exact production briefs and asset digests are recorded in `docs/premium-scene-art.md`.

Every deeper semantic slice uses its own external visual asset. The remaining expansion includes eleven purpose-built SVG cutaways:

- bedroom, wardrobe interior and cotton shirt;
- lithium-ion cell;
- railway platform, train carriage and rail bogie;
- hemoglobin and oxygen molecule;
- pond edge and frog.

The remaining SVG assets follow the existing warm paper, deep green, amber and terracotta visual language. Each has a fixed `viewBox="0 0 1600 900"`, an accessible `title` and `desc`, layered subject detail, and no visible vocabulary text baked into the background. No image is reused to pretend that two semantic depths are different scenes.

## Authoring invariants

`scripts/validate-scenes.ts` rejects content when:

- a scene lacks a human-verified `anchorAudit`, or its audit counts do not reconcile;
- a premium-v2 audit hash differs from the exact raster bytes that were reviewed;
- a label lacks `sourceVisualRegion`, or its authored point lies outside that visible region;
- a portal lacks a visual source region, or its complete hit rectangle is not contained by that region;
- a visual region has no concrete description, invalid kind or out-of-bounds rectangle;
- a removed example reappears, or a known ungrounded regression such as park `sprinkler`, `rabbit`, `barbecue` or `skateboarding` returns;
- any of the five authored LOD bands is missing;
- a premium scene falls below its total, overview or per-LOD vocabulary-density floor;
- fewer than 30 scenes, three root branches or six deep learning paths exist;
- a child is unreachable, duplicated or missing its parent portal;
- a translation or accessible asset description is missing;
- an SVG uses a mismatched viewBox or a raster asset is not a valid JPEG;
- a JPEG is not exactly 1600 × 900 or exceeds the per-scene raster budget.

`tests/domain/worldContent.test.ts` independently locks the 30-scene topology, six deep paths, audit reconciliation, region containment, five-band staging, known floating-label regressions, the corrected park portals, the visible street museum, premium-scene density, exact asset hashes and the unique external asset contract.
