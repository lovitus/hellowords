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

The scene world contains 1,622 manually contextualized anchors representing 1,516 distinct English display terms. A scene contains 48–73 logical anchors. Repeated terms are limited mainly to useful parent-child bridges such as `cell`, `water`, `heart` or `platform`.

Each scene covers five progressive density bands:

- level 0 — the scene, large regions and the most useful objects;
- level 1 — recognizable objects and immediate context;
- level 2 — parts, fixtures and spatial relationships;
- level 3 — materials, states and functional mechanisms;
- level 4 — precise processes, microscopic structures and domain actions.

At least 36 anchors per scene are available by level 2. The runtime applies viewport culling, collision handling and opacity transitions, so authored content density is independent from how many labels are legible at one instant. Only the current scene’s 48–73 lightweight label buttons exist; the other 29 scenes remain external data slices.

Translations are authored for the scene meaning rather than copied from an unqualified dictionary first sense. For example, `natural` on the atlas is `自然的`, `sharp` in the kitchen is `锋利的`, while `chamber` is `腔室` inside the coffee machine and `心腔` inside the heart. Explicit regression checks prevent known cross-topic filler from returning.

## Visual strategy

The atlas and its three first-level destinations retain high-detail 1600 × 900 raster illustrations because they establish place and atmosphere at a glance. Their anchors refer to visible rooms, buildings, traffic, paths, vegetation and wildlife.

Every deeper semantic slice uses its own external visual asset. The expansion adds twelve purpose-built SVG cutaways:

- bedroom, wardrobe interior and cotton shirt;
- lithium-ion cell;
- railway platform, train carriage and rail bogie;
- hemoglobin and oxygen molecule;
- chloroplast interior;
- pond edge and frog.

The new assets follow the existing warm paper, deep green, amber and terracotta visual language. Each has a fixed `viewBox="0 0 1600 900"`, an accessible `title` and `desc`, layered subject detail, and no visible vocabulary text baked into the background. No image is reused to pretend that two semantic depths are different scenes.

## Authoring invariants

`scripts/validate-scenes.ts` rejects content when:

- fewer than 30 scenes, 1,600 contextual anchors, three root branches or six deep learning paths exist;
- a scene has fewer than 48 or more than 80 logical anchors;
- any of the five LOD bands is missing, or fewer than 36 anchors are available through level 2;
- a scene repeats a display term, lacks at least 80% of its authored topic signature, or contains a known cross-topic filler;
- a contextual translation regression changes (`natural`, `sharp`, both uses of `chamber`, `automatic`);
- a child is unreachable, duplicated or missing its parent portal;
- an anchor or portal leaves the 1600 × 900 coordinate space;
- a translation or accessible asset description is missing;
- an SVG uses a mismatched viewBox or a raster asset is not a valid JPEG.

`tests/domain/worldContent.test.ts` independently locks the 30-scene topology, six intended deep paths, exact 1,622-anchor snapshot, five-band density contract, contextual translation regressions, broad unique-word coverage and unique external asset contract.
