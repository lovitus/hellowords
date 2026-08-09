# HelloWords world content

The mature world is a deterministic, zoomable tree. The root is a 1600 × 900 illustrated atlas with three visually distinct regions; every deeper slice uses the same coordinate system so camera and label logic remain uniform.

## Content map

```text
World atlas
├── Home: Apartment → Kitchen → Coffee machine → Water tank → Polymer
├── City: City street
│   ├── Transit hub → Electric bus → Battery pack
│   └── Science museum → Human body → Heart → Blood cell
└── Nature: City park → Oak tree → Leaf → Plant cell
```

This gives 18 reachable scenes, 17 parent-to-child portals and 432 natural anchors. Every scene has exactly 24 labels split across the three density bands used by the viewer:

- level 0: the scene and its largest, most useful objects;
- level 1: recognizable parts and nearby context;
- level 2: fine detail, material, process or descriptive vocabulary.

The branches deliberately connect everyday vocabulary to deeper knowledge. A learner can move from a bus to stored electrical energy, from a coffee machine to polymer structure, or from a park to the machinery of a plant cell without an arbitrary topic jump. The City branch now also links a visible museum building to anatomy and health: body systems narrow naturally into the heart, circulation and blood cells.

## Visual strategy

The atlas and its three first-level destinations use high-detail 1600 × 900 raster illustrations because they must establish a convincing, information-rich place at a glance. Atlas labels are anchored only to objects actually visible in the image: rooms and balconies on the left, buildings and transit in the center, and the oak, pond, greenhouse and wildlife on the right. The apartment, street and park continue that photographic-illustration quality while preserving the same coordinates as their portals and labels.

Deeper cutaways are small external SVG files rather than one enormous inline document. Each has:

- an accessible `title` and `desc`;
- a fixed `viewBox="0 0 1600 900"`;
- background, middle-ground and foreground layers;
- restrained gradients and shadows in the same warm green, paper and amber palette;
- no embedded vocabulary text, because the viewer owns label visibility and translation state.

Only the current scene asset and at most 24 label elements need to be active. This preserves the scene-slicing performance model while adding substantially more visual and semantic range.

## Authoring invariants

`scripts/validate-scenes.ts` rejects content when:

- fewer than 18 scenes, 430 anchors or three root branches exist;
- a scene becomes sparse or exceeds the 24-label DOM budget;
- a child is unreachable, duplicated or missing its parent portal;
- a root branch has fewer than four explorable scene levels;
- an anchor or portal leaves the 1600 × 900 coordinate space;
- a translation, density band or accessible asset description is missing;
- an SVG uses a mismatched viewBox or a raster asset is not a valid JPEG.

`tests/domain/worldContent.test.ts` independently locks the four intended learning paths, the 432-anchor budget and the external asset contract.
