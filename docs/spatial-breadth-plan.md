# Spatial breadth expansion

The spatial world must grow by adding honest, independently illustrated places, not by counting lexical-list pages as scenes. Scene replacements improve depth; the batches below add breadth.

## Next net-new branch: Community garden

**Status: completed, pixel-verified, and expanded.** The final `community-garden-premium-v1.jpg` asset contains 48 grounded anchors in five LOD bands and seven authored zones. Its already-visible greenhouse and potting bench now lead to `greenhouse-interior → tomato-plant` and terminal `potting-workbench` scenes. The world-atlas entrance uses the exact approved rectangle below.

The published `world-atlas-master-1600-v2.jpg` depicts a distinct garden district in its lower-left quarter. The 1600 × 900 rectangle below is disjoint from all three existing root portals, so it remains a fourth root branch without an ambiguous zoom target; the matching 3200 × 1800 derived tier preserves the same logical coordinates:

```json
{
  "id": "enter-community-garden",
  "childSceneId": "community-garden",
  "x": 80,
  "y": 470,
  "width": 545,
  "height": 325
}
```

Portal separation in the 1600 × 900 authored coordinate system:

- Apartment occupies the upper-left district and ends at `y=320`, before the garden starts at `y=470`.
- City street occupies the upper-right district and ends at `y=420`, before the garden starts at `y=470`.
- City park starts at `x=1080`, to the right of the garden portal's `x=625` edge.

### Production visual brief

Create a bright, elegant, high-detail daylight community garden. Use a coherent wide 16:9 editorial-realism composition with a glass greenhouse, raised beds, potting bench, compost station, rain barrel, irrigation hose, trellises, seedling trays, hand tools, wheelbarrow, watering can, soil sacks, plant labels with no readable text, paths, fencing, flowering borders, vegetables, herbs and a small pollinator area. No people, brands, logos, pseudo-writing, gloomy weather, fantasy machinery or unrelated indoor objects. Keep each object visually distinct enough for a precise pixel anchor.

Content contract:

- 40–48 independently pointable labels;
- five authored LOD bands with at least seven labels in each;
- at least six authored detail zones: greenhouse, raised beds, potting bench, water/irrigation, compost/soil and pollinator border;
- at least twelve overview labels;
- every word must name an object, visible part, material or directly observable property;
- child scenes may be added only when the parent image contains a complete, unambiguous portal object; both current garden portals reuse exact authored detail rectangles.

The branch has now matured honestly to four scenes without fabricating depth: the atlas exposes four root branches, and all four contain at least four real scenes.

## Following net-new places

These add missing everyday domains after the first community-garden branch is verified:

1. School campus → classroom → library.
2. Market hall → produce aisle → bakery counter.
3. Clinic → examination room → medical instruments.
4. Maker workshop → woodworking bench → hand tool close-up.
5. Sports complex → court → equipment room.
6. Harbor → pier → small boat.

Each parent entrance must be visible in an existing approved image or introduced in a new overview scene before its child is generated. No two portal rectangles may overlap, and no image may be duplicated to masquerade as a different depth.
