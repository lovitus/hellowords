# Spatial breadth expansion

The spatial world must grow by adding honest, independently illustrated places, not by counting lexical-list pages as scenes. Scene replacements improve depth; the batches below add breadth.

## Next net-new branch: Community garden

**Status: completed and pixel-verified.** The final `community-garden-premium-v1.jpg` asset contains 48 grounded anchors in five LOD bands, seven authored zones and no child portal. The world-atlas entrance uses the exact approved rectangle below.

The published `world-map-premium.jpg` already depicts a distinct garden district in its lower centre. The rectangle below is disjoint from all three existing root portals, so it can become a fourth root branch without an ambiguous zoom target:

```json
{
  "id": "enter-community-garden",
  "childSceneId": "community-garden",
  "x": 510,
  "y": 600,
  "width": 470,
  "height": 285
}
```

Portal separation in the 1600 × 900 authored coordinate system:

- Apartment ends at `x=500`; the new portal starts at `x=510`.
- City street ends at `y=580`; the new portal starts at `y=600`.
- City park starts at `x=1040`; the new portal ends at `x=980`.

### Production visual brief

Create a bright, elegant, high-detail daylight community garden. Use a coherent wide 16:9 editorial-realism composition with a glass greenhouse, raised beds, potting bench, compost station, rain barrel, irrigation hose, trellises, seedling trays, hand tools, wheelbarrow, watering can, soil sacks, plant labels with no readable text, paths, fencing, flowering borders, vegetables, herbs and a small pollinator area. No people, brands, logos, pseudo-writing, gloomy weather, fantasy machinery or unrelated indoor objects. Keep each object visually distinct enough for a precise pixel anchor.

Content contract:

- 40–48 independently pointable labels;
- five authored LOD bands with at least seven labels in each;
- at least six authored detail zones: greenhouse, raised beds, potting bench, water/irrigation, compost/soil and pollinator border;
- at least twelve overview labels;
- every word must name an object, visible part, material or directly observable property;
- scene starts as a leaf; later children may be added only when the parent image contains a complete, unambiguous portal object.

The topology policy deliberately allows this new branch to mature honestly: the atlas must expose at least four root branches, while at least three established branches must each contain four or more scenes. A new leaf is not padded with fabricated depth merely to satisfy a blanket branch-depth rule.

## Following net-new places

These add missing everyday domains after the first community-garden branch is verified:

1. School campus → classroom → library.
2. Market hall → produce aisle → bakery counter.
3. Clinic → examination room → medical instruments.
4. Maker workshop → woodworking bench → hand tool close-up.
5. Sports complex → court → equipment room.
6. Harbor → pier → small boat.

Each parent entrance must be visible in an existing approved image or introduced in a new overview scene before its child is generated. No two portal rectangles may overlap, and no image may be duplicated to masquerade as a different depth.
