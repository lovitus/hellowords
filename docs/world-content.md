# HelloWords world content

The world is a deterministic, zoomable tree. Forty-two destination scenes use
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
│   │   ├── Railway platform → Train carriage → Rail bogie
│   │   └── Urban services
│   │       ├── Hospital
│   │       │   ├── Pathology lab
│   │       │   └── Hospital pharmacy
│   │       ├── Airport
│   │       └── Office building
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

The graph contains 43 reachable scenes and 42 parent-to-child portals. Four disjoint atlas entrances establish Home, City, Nature and Community garden, and every branch now contains at least four scenes. Ten root-to-leaf paths contain at least five scenes; the longest contains eight. The City transit branch now opens an Urban services overview before splitting into Hospital, Airport and Office building; Hospital then opens focused Pathology lab and Hospital pharmacy scenes.

## Vocabulary and LOD

Spatial scenes now contain 6,866 human-verified anchors representing 5,870
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

The 42 destination raster scenes contribute 307 authored detail zones across
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

All five bands remain available. Every 32-target premium scene must contain at least 32 grounded labels, while evidence-limited terminal studies keep explicit reviewed ranges; all high-resolution scenes still provide at least twelve overview labels, at least three labels in every LOD, and at least four authored detail zones. Each zone carries at least four words and the zones cover at least 60% of that scene's anchors. The rebuilt chloroplast now supports 51 independently pointable structures across six zones without duplicate membrane names or inferred processes. The upgraded polymer exhibit contains 39 independently pointable terms and is locked to a 24–39 evidence range; its final pixel audit adds only visible film, fiber, molded-cavity, morphology, defect and attached-molecular structures while keeping unsupported properties and molecular identities out.

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
| Community garden | 141 → 133 | Bright greenhouse, beds, tools, irrigation, compost and flowers retain visible structural parts; the added glazing, crop and hardware terms stay inside the reviewed crops |
| Greenhouse interior | 78 → 71 | Sunlit glasshouse grounds shell hardware, benches, seedlings, crops, floor equipment and a complete tomato portal; climate and growth processes remain removed |
| Tomato plant | 76 → 69 | Complete supported plant grounds stem, compound-leaf, flower, fruit, support, substrate and visible pest details; physiology and underground processes remain removed |
| Potting workbench | 83 → 74 | Complete daylight bench grounds tool edges, containers, seedlings, soil and watering fittings; actions, properties and printed-label readings remain removed |
| Apartment | 176 → 173 | Bright replacement preserves three room portals, then adds living-room furniture and finish parts while retaining the excluded sink, hallway and dresser claims |
| Kitchen | 185 → 176 | Bright kitchen grounds appliances, sink, cookware, coffee-nook and island parts; added preparation tools stay on the reviewed island crop |
| Coffee machine | 78 → 60 | Premium product cutaway grounds the open reservoir, grinder, controls, brew group, steam hardware, boiler circuit, pump fittings and electronics; invisible functions and brewing processes remain removed |
| Water tank | 71 → 61 | Premium clear-reservoir portrait grounds lid, water, molded walls, hinge/latch hardware, outlet valve internals, filter surfaces, mounts and the real Polymer portal; the final audit adds lid, water-surface, filter, corner-post and base-rail parts, with the water-surface, detached filter-cup, lid-corner and base-bracket details now in their own focus zones while sensors, hidden plumbing, properties and maintenance actions remain removed |
| Polymer | 91 → 60 | Premium multiscale material scene grounds specimens, film and fiber forms, ordered lamellae, amorphous pockets, defects, pores and molecular-chain junctions; undefined molecular identities, properties and processes stay removed |
| Bedroom | 175 → 164 | Premium bedroom adds grounded bedding, study, storage, textile and room-finish details; actions and moods remain removed |
| Bathroom | 166 → 163 | Daylight bathroom grounds bath, vanity, toilet, shower, plumbing, glass hardware, tile and linen details; invisible conditions remain removed |
| Wardrobe interior | 72 → 60 | Premium wardrobe grounds cabinet frame, hanger and garment parts, accessory details and nearby daylight-corner objects; the final audit adds a window sill, door panel, jacket cuff and trouser leg while materials, stitching claims and actions remain removed |
| Cotton shirt | 63 → 55 | Premium textile flat lay grounds garment construction, magnified weave, cotton source material and hand-sewing tools, plus visible yoke, buttonhole, seam and tool parts; machinery, factory actions and performance properties remain removed |
| City street | 184 → 179 | Bright replacement preserves three destinations while removing pseudo-signage, anatomy-window imagery and unsupported street objects; added facade, roadway and mobility parts stay in existing regions |
| Urban services | 128 → 120 | Aerial masterplan visibly separates hospital, airport and office campuses plus shared roads, water and planting connectors |
| Hospital | 420 → 410 | Bright atrium grounds departments, emergency, pathology, radiology, pharmacy, operating-theatre fixtures and a generic disease reference band; added clinical terms remain non-prescriptive |
| Pathology lab | 430 → 420 | Close laboratory raster grounds microscopes, specimen handling, paraffin embedding, microtomy, staining, cold storage and a larger histology/diagnostic display vocabulary |
| Hospital pharmacy | 370 → 360 | Close dispensary raster grounds medicine shelves, generic INN names, dispensing tools, automated cabinet, rolling cart and compounding bench without dosage advice |
| Airport | 370 → 360 | Terminal photograph grounds check-in, security, gate, baggage claim, airside aircraft, flight hardware and ramp-service structures |
| Office building | 370 → 360 | Warm atrium grounds reception, open-plan workstations, conference room, pantry and a deeper service-core vocabulary for power, data, HVAC and fire hardware |
| City cafe | 137 → 130 | New daylight cafe grounds door, seating, counter, pastry-display and espresso subparts; added pastry/tableware parts remain inside the display crop |
| Transit hub | 145 → 133 | Bright multimodal hall grounds separate rail, concourse, access and mobility fixtures; blank display readings and service abstractions remain removed |
| Electric bus | 101 → 85 | Premium vehicle cutaway grounds the body, passenger space, running gear, charging hardware and real battery-pack portal; added cabin glazing and seating parts remain grounded while people, branding and operating concepts stay removed |
| Battery | 96 → 90 | Premium engineering cutaway grounds pack, module, cell, electrical, cooling and enclosure hardware; added shell, cooling and connector parts remain grounded while internal chemistry and unsupported sensor claims stay removed |
| Lithium-ion cell | 70 → 60 | Premium prismatic-cell cutaway grounds enclosure, polarity-specific terminals, flattened winding and unfolded layers; the final audit adds terminal seals, a fill-port collar, cover lip, winding/core surfaces, tab roots, sheet folds and collector edge while ambiguous liquid, invisible charge motion, performance metrics and hazard states remain removed |
| Railway platform | 142 → 126 | Premium station view grounds passenger fixtures, train hardware, overhead electrification and track subparts; added rail joints, fasteners and platform edges remain grounded while signage and service states stay removed |
| Train carriage | 108 → 100 | Premium carriage cutaway grounds the cabin, doors, accessibility fixtures, roof, suspension and foreground track hardware plus the real bogie portal; added underbody brake, axle and coupler parts remain grounded while passengers and unsupported amenities stay removed |
| Rail bogie | 103 → 95 | Premium powered-bogie study grounds frame, wheelsets, suspension, motor drive, disc brakes, linkages and track hardware; added frame, pivot, spring and brake fittings remain grounded while maintenance actions, failure states and invisible load concepts stay removed |
| Science museum | 213 → 206 | Premium gallery resolves specific fossil, instrument, robotic, physics and life-science parts plus newly audited bone, fossil and mount subparts while rejecting roles, venues and signage |
| Dinosaur hall | 77 → 69 | Sunlit paleontology gallery grounds mounted bones, distinct fossils, preparation tools and rock structure; the final audit adds skull, jaw, vertebra, limb, horn, fossil and tool parts while behavior, era, weak rock features and museum activities remain removed |
| Human body | 96 → 90 | Bright three-model anatomy exhibit grounds the mannequin's body regions and distal parts, the skeleton's jaw, long bones and hand/foot groups, and distinct chest, arm, abdominal and calf muscles; added joint and outline terms remain on the skeleton crop |
| Heart | 111 → 91 | Bright cutaway grounds chambers, valves, walls, great and coronary vessels plus an artery cross-section; added artery wall and vessel-rim details remain visible while invisible physiology and conduction remain removed |
| Blood cell | 111 → 91 | Bright capillary cutaway grounds vessel layers, red-cell membrane and skeleton, one neutrophil, platelets and the real Hemoglobin portal; added membrane and cell-surface details remain grounded while unsupported immune processes remain removed |
| Hemoglobin | 107 → 81 | Premium molecular view grounds the alpha/beta globin assembly, four-heme array, ribbon folds, central interfaces and the enlarged oxygen-coordination pocket; added chain and pocket details remain structural, not biochemical claims |
| Oxygen molecule | 112 → 90 | Premium gas-exchange cutaway grounds the airway, alveolar pores and lining, air-blood barrier, capillary wall, red-cell surface and paired gas models; added molecule-path and interface details remain visual rather than physiological claims |
| City park | 195 → 174 | Bright replacement grounds two complete habitat portals, separate pond/bridge/playground/fountain/gazebo/oak/bench parts and visible wildlife while rejecting inferred activities; the final audit adds bridge arches, shoreline waterlines, lily/reed parts and fine pond surface details |
| Oak tree | 81 → 68 | Bright neutral-daylight woodland close-up grounds wildlife, fungi and texture; the final audit adds bark, web, nest, leaf, acorn, root, moss, fern, flower and grass parts while invisible processes and growth rings stay removed |
| Leaf | 54 → 49 | Natural-colour macro retains independently visible twig, bud, acorn-cup, bark, insect and spider parts while rejecting duplicate vein terms and unsupported underside/curl details |
| Plant cell | 75 → 60 | Premium 3D cutaway resolves organelles, membrane layers, chloroplast discs, cytoplasmic strands and vesicle interiors; the final audit adds rough-ER sheets, Golgi stacks, vacuole edges, thylakoid membranes, granum edges, mitochondrial folds and wall junctions, with a dedicated thylakoid-stack focus zone while unseen molecules and processes stay removed |
| Chloroplast interior | 57 → 51 | Bright coherent organelle resolves its envelope, grana, intergranal lamellae, DNA strands, storage bodies, stromal particles and surface complexes; reactions and metabolites stay removed |
| Pond edge | 73 → 65 | Premium spring shallows ground shoreline textures, aquatic plants, insects, fish, tadpoles, snail and the real Frog portal; the final audit adds visible stems, leaf parts, insect bodies, ripple/bubble details, fish parts, bank textures and frog surface parts while absent birds, turtles and activities remain removed |
| Frog | 73 → 59 | Premium single-animal portrait grounds external head, skin, forelimb and webbed hind-limb anatomy; the final audit adds eye, jaw, skin, limb, toe and stone-surface parts while internal organs, life stages, prey and behavior remain removed |

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
audit retains 179 distinct terms, and the three portal silhouettes remain
disjoint and legible without words, logos, anatomy displays or pseudo-signage.

The transit hub now opens an `Urban services` masterplan. Its reviewed overview
separates a hospital campus, airport terminal/runway and office tower, with
hospital, airport and office rasters used for the dense follow-up scenes. The
hospital branch then opens dedicated Pathology lab and Hospital pharmacy
rasters. The hospital batch includes departments, pathology and generic
disease/medicine terms; medication names use WHO International Nonproprietary
Names (INN), and the disease set is a learning vocabulary rather than medical
advice. The second professional pass adds another 150 visible equipment,
medicine, airside and building-service terms without changing the reviewed
portal geometry. The next facility terms are checked against the
[RadiologyInfo glossary](https://www.radiologyinfo.org/glossary), the
[FAA Pilot/Controller Glossary](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/index.html),
the [FTA transit glossary](https://www.transit.dot.gov/sites/fta.dot.gov/files/docs/ntd/58026/2017-glossary.pdf),
and [GSA workplace guidance](https://www.gsa.gov/system/files/NBSAP%20August%202025%20Final.pdf).

The world now contains 42 premium destination scenes with independently reviewed
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
spatial scene depends on an SVG cutaway: 42 destinations use individually audited
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
