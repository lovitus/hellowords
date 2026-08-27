# HelloWords world content

The world is a deterministic, zoomable tree. Thirty-six destination scenes use
the standard 1600 × 900 coordinate system. The world atlas is the large-canvas
exception, with a 2604 × 989 logical base and a 5208 × 1978 high tier. Scene-local
coordinates keep portals, camera movement and vocabulary anchors predictable
from the atlas down to a molecule.

## Content map

```text
World atlas
├── Home: Apartment
│   ├── Kitchen → Coffee machine → Water tank → Polymer
│   ├── Bedroom → Wardrobe interior → Cotton shirt
│   └── Bathroom
├── City: City street
│   ├── City cafe
│   ├── Transit hub
│   │   ├── Electric bus → Battery pack → Lithium-ion cell
│   │   └── Railway platform → Train carriage → Rail bogie
│   └── Science museum
│       ├── Dinosaur hall
│       └── Human body → Heart → Blood cell
│                              └── Hemoglobin → Oxygen molecule
├── Nature: City park
│   ├── Oak tree → Leaf → Plant cell → Chloroplast interior
│   └── Pond edge → Frog
└── Community garden
    ├── Greenhouse interior → Tomato plant
    └── Potting workbench
```

The graph contains 37 reachable scenes and 36 parent-to-child portals. Four disjoint atlas entrances establish Home, City, Nature and Community garden, and every branch now contains at least four scenes. Six root-to-leaf paths contain at least five scenes; the longest contains eight. The branches connect an observable parent to a truthful closer view: clothing narrows from a room to a wardrobe and woven cotton, a vehicle narrows to an electrochemical cell, blood narrows to a carrier protein and oxygen, a leaf narrows to chloroplast machinery, and the garden narrows to a greenhouse tomato or a complete potting bench.

## Vocabulary and LOD

Spatial scenes now contain 2,794 human-verified anchors representing 2,468
distinct English display terms. This expansion adds grounded anchors through
richer, independently reviewed artwork rather than by restoring floating topic
words. Global vocabulary remains available in the lexical world; a word only
appears over a scene when the scene itself supplies visual evidence.

Every scene JSON contains:

- `anchorAudit`, recording the exact reviewed asset, old/retained/removed counts, representative removals and the scene-specific rationale;
- `visualRegions`, describing bounded visible objects, parts or diagram marks in
  that scene's source coordinate system;
- `detailZones`, grouping truthful local crops into independently focusable word batches with a target scale;
- `sourceVisualRegion` on every label and portal.

The 37 raster scenes contribute 253 authored detail zones across
the complete spatial world. The world atlas alone contains 1,275 unique labels
compiled from 1,296 independently audited source-panel anchors across 66 zones.
The compiler reconciles cross-panel word duplication deterministically while
the six versioned source batches preserve the complete audit coordinates and
provenance. A zone names and describes one crop, supplies a Chinese title, and
references only label anchors that fall inside its rectangle. It therefore gives
the viewport enough data to focus a district, room, exhibit, habitat, material
structure or organelle without inventing another scene or reusing a generic
background. A label belongs to at most one zone in the same scene.

Spatial labels also use the existing optional `lexemeId` as an audited bridge
into the 10,000-word lexical world. There are currently 214 sense-reviewed,
word-identical links. The validator loads all 10,000 lexical entries and rejects
a missing ID or a link whose display word differs. A separate sense review
removed spelling-identical but contextually wrong routes such as electrical
`battery` to an artillery group, anatomical `heart` to an emotion concept, and
tree `branch` to an organization. Visually valid specialist phrases remain
unlinked when the ranked lexicon has no matching entry rather than being forced
onto an unrelated word sense.

The authored `x`/`y` is the point on the object itself, not a pre-arranged card position. Runtime collision handling may move the word capsule, but the guide line and anchor dot continue to point to that authored pixel.

Each scene covers five progressive density bands:

- level 0 — the whole scene and largest visible objects;
- level 1 — secondary visible objects;
- level 2 — visible parts and fixtures;
- level 3 — smaller visible parts or explicitly drawn diagram elements;
- level 4 — the finest still-identifiable detail.

All five bands remain available. Every 32-target premium scene must contain at least 32 grounded labels, while evidence-limited terminal studies keep explicit reviewed ranges; all high-resolution scenes still provide at least twelve overview labels, at least three labels in every LOD, and at least four authored detail zones. Each zone carries at least four words and the zones cover at least 60% of that scene's anchors. The rebuilt chloroplast now supports 36 independently pointable structures across six zones without duplicate membrane names. The upgraded polymer exhibit contains 25 independently pointable terms and is locked to a 24–28 evidence range; its final pixel audit explicitly removed an unattached pseudo-side-group and an undefined repeat segment rather than inflating the count.

## Exploration cues and anchors

The viewer uses two deliberately different zoom cues:

- a gold `进入 · …` marker identifies a real portal and promises that zooming or activating it will enter the named child scene;
- a compact green `Aa` ring with an exact `… 个词` badge identifies a non-portal object region and keeps the current scene while revealing the next vocabulary detail band.

Vocabulary cues are generated only from reviewed label anchors outside every portal. Each cue sits on a real authored object point, names the number of currently hidden words it can reveal, and advances to the next useful detail band after activation. A screen-space `还有 … 词 · 继续放大` summary appears only after every collision-free native-size slot has been filled; empty readable areas promote real higher-LOD words before showing a synthetic remainder. Desktop shows at most six local cues and compact screens at most four, so every useful area is signposted without rebuilding the old label cloud. Primary region targets are 52 × 52 CSS pixels; truthful one-to-three-word leftovers use compact 44 × 44 green anchors instead of disappearing. Both remain above word labels and use green rings rather than the solid gold portal treatment. Mobile zoom controls and the global summary also keep a minimum 44-pixel touch target. The green cue pulse is disabled when reduced motion is requested.

Every visible word is rendered as a callout: a luminous semantic-colour anchor dot remains on the exact reviewed pixel while a glossy high-contrast leader connects it to the collision-adjusted word capsule. This keeps the semantic attachment visible even when nearby labels must move apart for readability.

Translations remain authored for the visible scene meaning. For example, the heart cutaway distinguishes `right atrium` as `右心房` and `left ventricle` as `左心室`. Removed spatial labels are not deleted from the application vocabulary; they remain learnable in the lexical world without pretending that the current image depicts them.

## Per-scene audit result

| Scene | Before → retained | Main removal reason |
|---|---:|---|
| World atlas | 1,296 audited source anchors → 1,275 unique labels | Six independently pixel-reviewed panels compile across 66 zones; cross-panel duplicate words are reconciled while four disjoint entrances remain intact |
| Community garden | 56 → 48 | Bright greenhouse, beds, tools, irrigation, compost and flowers retained; inferred activities and sustainability claims removed |
| Greenhouse interior | 53 → 46 | Sunlit glasshouse grounds its frame, benches, seedlings, crops, tools and a complete tomato portal; climate and growth processes remain removed |
| Tomato plant | 51 → 44 | Complete supported plant grounds external stem, leaf, flower, fruit, irrigation and visible pest evidence; physiology and underground processes remain removed |
| Potting workbench | 58 → 49 | Complete daylight bench grounds tools, containers, seedlings, soil and watering hardware; actions, properties and printed-label readings remain removed |
| Apartment | 47 → 44 | Bright replacement preserves three room portals while removing an obscured sink and unsupported hallway/dresser claims |
| Kitchen | 57 → 48 | Refreshed kitchen grounds appliances, food, hand tools and coffee-machine parts; absent processes remain removed |
| Coffee machine | 58 → 40 | Premium product cutaway grounds the open reservoir, grinder, controls, brew group, steam hardware, boiler circuit and electronics; invisible functions and brewing processes remain removed |
| Water tank | 56 → 36 | Premium clear-reservoir portrait grounds lid, water, molded walls, outlet hardware, mounts and the real Polymer portal; sensors, hidden plumbing, properties and maintenance actions remain removed |
| Polymer | 56 → 25 | Premium multiscale material scene grounds specimens, morphology and molecular structure; undefined molecular identities, properties and processes remain removed |
| Bedroom | 51 → 40 | Premium bedroom adds grounded furniture, storage, textile and room-part details; actions and moods remain removed |
| Bathroom | 48 → 45 | New daylight bathroom grounds bath, vanity, toilet, shower, plumbing, tile and linen details; invisible conditions remain removed |
| Wardrobe interior | 48 → 36 | Premium wardrobe grounds cabinet fittings, distinct garments, shirt parts and nearby bedroom objects; materials and actions remain removed |
| Cotton shirt | 48 → 40 | Premium textile flat lay grounds garment construction, magnified weave, cotton source material and hand-sewing tools; machinery, factory actions and performance properties remain removed |
| City street | 46 → 42 | Bright replacement preserves three destinations while removing pseudo-signage, anatomy-window imagery and unsupported street objects |
| City cafe | 52 → 45 | New daylight cafe grounds counter, espresso, pastry, seating and tableware zones; people, branding and text stay excluded |
| Transit hub | 60 → 48 | Bright multimodal hall grounds separate rail, concourse and electric-bus details; people and service abstractions remain removed |
| Electric bus | 56 → 40 | Premium vehicle cutaway grounds the body, passenger space, running gear, charging hardware and real battery-pack portal; people, branding and operating concepts remain removed |
| Battery | 56 → 32 | Premium engineering cutaway grounds pack, module, cell, electrical and cooling hardware; internal chemistry and measurements remain removed |
| Lithium-ion cell | 48 → 31 | Premium prismatic-cell cutaway grounds enclosure, polarity-specific terminals, flattened winding and unfolded layers; ambiguous liquid, invisible charge motion, performance metrics and hazard states remain removed |
| Railway platform | 48 → 32 | Premium station view grounds train, track, overhead equipment, fixtures and luggage; service states and ticket concepts remain removed |
| Train carriage | 48 → 40 | Premium carriage cutaway grounds the cabin, doors, accessibility fixtures, roof and underfloor hardware plus the real bogie portal; passengers and unsupported amenities remain removed |
| Rail bogie | 48 → 40 | Premium powered-bogie study grounds frame, wheelsets, suspension, motor drive, disc brakes, linkages and track hardware; maintenance actions, failure states and invisible load concepts remain removed |
| Science museum | 56 → 49 | Premium gallery replaces generic display words with specific visible fossils, instruments and models |
| Dinosaur hall | 52 → 44 | Sunlit paleontology gallery grounds mounted bones, distinct fossils, preparation tools and rock structure; behavior, era, weak rock features and museum activities remain removed |
| Human body | 56 → 40 | Bright three-model anatomy exhibit grounds body joints, major bones, limb muscles and visible organs; unseen systems and structures remain removed |
| Heart | 56 → 36 | Bright cutaway grounds chambers, valves, walls, great and coronary vessels plus an artery cross-section; invisible physiology and conduction remain removed |
| Blood cell | 56 → 36 | Bright capillary cutaway grounds vessel layers, red-cell membrane and skeleton, one neutrophil, platelets and the real Hemoglobin portal; unsupported immune processes remain removed |
| Hemoglobin | 48 → 22 | Premium molecular view grounds subunits, hemes and the oxygen-binding pocket; diseases and invisible binding behavior remain removed |
| Oxygen molecule | 48 → 26 | Premium gas-exchange cutaway grounds the airway, alveolus, barrier, blood cells and molecule trail; quantum decoration and invisible physiology remain removed |
| City park | 60 → 39 | Bright replacement grounds two complete habitat portals, park fixtures and visible wildlife while rejecting inferred activities |
| Oak tree | 56 → 43 | Bright neutral-daylight woodland close-up grounds wildlife, fungi and texture; invisible processes and growth rings stay removed |
| Leaf | 41 → 36 | Natural-colour macro retains independently visible anatomy, insects and damage while rejecting duplicate vein terms and unsupported underside/curl details |
| Plant cell | 56 → 37 | Premium 3D cutaway resolves organelles and membranes; unseen molecules and processes stay removed |
| Chloroplast interior | 48 → 36 | Bright coherent organelle resolves its envelope, grana, thylakoids, lamellae, stroma, storage bodies and surface complexes; reactions and metabolites stay removed |
| Pond edge | 48 → 40 | Premium spring shallows ground shoreline textures, aquatic plants, insects, fish, tadpoles, snail and the real Frog portal; absent birds, turtles and activities remain removed |
| Frog | 48 → 34 | Premium single-animal portrait grounds external head, skin, forelimb and webbed hind-limb anatomy; internal organs, life stages, prey and behavior remain removed |

## Visual strategy

The atlas and its first-level destinations use high-detail raster illustrations
because they establish place and atmosphere at a glance. The atlas arranges six
independently reviewed 1672 × 941 source panels in a 3 × 2 canvas: school and
classroom, science and making, transport, farm and food production, market and
kitchen, and wetland and coast. Deterministic 96-pixel neutral stone roads form
the horizontal and vertical separators. Assembly preserves realistic leaf,
bark, water, stone, metal and food textures directly from the accepted panels;
it does not apply a global recolour or turn vegetation into glossy, jelly-like
shapes. The reviewed 2604 × 989 base first-paints quickly, while camera scale
and device-pixel ratio select the decoded 5208 × 1978 tier in place for fine
zooming. `city-street` uses `city-street-bright-v4.jpg`: a complete columned
science museum with a telescope-and-mineral window stands at left, a complete
blank-fronted brick cafe occupies the centre, and a complete arched-glass transit
hall anchors the right above the crossing and accessible curb. Its final-pixel
audit retains 42 distinct terms, and the three portal silhouettes remain
disjoint and legible without words, logos, anatomy displays or pseudo-signage.

The world now contains 36 premium destination scenes with independently reviewed
1600 × 900 base rasters plus the large-canvas atlas, including the independently
illustrated Community garden, Greenhouse, Tomato plant and Potting workbench
branch and upgraded Home, transit, material, natural-history and life-science
destinations. The atlas has a declared high-resolution tier rather than a
duplicate scene. This keeps every root entrance visually rewarding, gives Home
three tangible rooms, makes both transit branches begin with tangible spaces,
and turns the entire `City park → Oak tree → Leaf → Plant cell → Chloroplast`
path into one continuous high-detail journey. The exact production briefs and
asset digests are recorded in `docs/premium-scene-art.md`.

Every authored spatial scene slice uses its own external visual asset. No runtime
spatial scene depends on an SVG cutaway: 36 destinations use individually audited
1600 × 900 raster artwork, while the root uses its six-panel large canvas. No
image is reused to pretend that two spatial depths are different scenes. The
separate 10,000-word semantic field reuses each selected realm's reviewed image
while replacing realm, topic, subcluster and word labels on the same plane.

## Authoring invariants

`scripts/validate-scenes.ts` rejects content when:

- a scene lacks a human-verified `anchorAudit`, or its audit counts do not reconcile;
- a premium audit hash differs from the exact raster bytes that were reviewed;
- a label lacks `sourceVisualRegion`, or its authored point lies outside that visible region;
- a portal lacks a visual source region, or its complete hit rectangle is not contained by that region;
- a visual region has no concrete description, invalid kind or out-of-bounds rectangle;
- a removed example reappears, or a known ungrounded regression such as park `sprinkler`, `rabbit`, `barbecue` or `skateboarding` returns;
- any of the five authored LOD bands is missing;
- a premium scene falls below its total, overview or per-LOD vocabulary-density floor, or exceeds a declared evidence ceiling;
- a premium scene has fewer than four detail zones, a zone has fewer than four words, a referenced anchor lies outside its crop, or zone coverage falls below 60%;
- fewer than 180 sense-reviewed spatial anchors link to the 10,000-word lexicon, or a linked ID is missing or word-mismatched;
- fewer than 37 scenes, four root branches, four mature four-scene root branches or six deep learning paths exist;
- a child is unreachable, duplicated or missing its parent portal;
- a translation or accessible asset description is missing;
- an SVG uses a mismatched viewBox or a raster asset is not a valid JPEG;
- a base JPEG is below the approved width/density floor or differs from the logical canvas aspect ratio, a declared high-density tier is not the same aspect ratio at 2× density, an asset hash differs, or either tier exceeds its source-pixel-scaled raster budget. A large continuous canvas may use a same-aspect half-density overview plus a full-resolution tier.

`tests/domain/worldContent.test.ts` independently locks the expanding 37-plus-scene topology, four disjoint root portals, four mature root branches, six deep paths, audit reconciliation, region containment, five-band staging, known floating-label regressions, premium-scene density, detail-zone integrity, lexical crosswalks, exact asset hashes and the unique external asset contract.
