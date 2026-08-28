# Spatial breadth expansion

The spatial world must grow by adding honest, independently illustrated places,
not by counting lexical-list pages as scenes. Scene replacements improve depth;
new branches must add reachable breadth and keep every portal tied to a complete,
visible object.

## Published v21 foundation

**Status: completed and pixel-verified.** The graph contains 37 reachable scenes,
36 portals, 3,073 contextual anchors, 2,688 distinct scene terms and 255 authored
zones. The root atlas contributes 1,275 unique labels compiled from 1,296 audited
source-panel anchors across 66 zones.

The v21 root is a purpose-built 3 × 2 large canvas rather than another 1600 × 900
scene. Six independent 1672 × 941 panels cover school and classroom, science and
making, transport, farm and food production, market with kitchen and bakery, and
wetland with coast. The raster assembler separates them with deterministic
96-pixel neutral stone roads. It preserves the panels' realistic material and
colour differences without a global recolour or glossy, jelly-like vegetation.
The published base is `world-mega-atlas-2604-v21.jpg`; the full reviewed tier is
`world-mega-atlas-5208-v21.jpg`.

The four current portal rectangles are authored in the 5208 × 1978 reviewed
source coordinate system:

| Branch | Source rectangle `(x, y, width, height)` | Runtime logical rectangle |
|---|---|---|
| Home | `(3000, 1240, 400, 300)` | `(1500, 620, 200, 150)` |
| City | `(3616, 40, 400, 300)` | `(1808, 20, 200, 150)` |
| Community garden | `(480, 1060, 960, 520)` | `(240, 530, 480, 260)` |
| Nature | `(3480, 1020, 960, 720)` | `(1740, 510, 480, 360)` |

The scene assembler applies `logicalScale=0.5`; source and runtime coordinates
must not be mixed. All four source rectangles are in bounds and pairwise
disjoint. The community crop contains the full greenhouse and cultivated beds,
and the Nature crop contains the main pond, reed margin and surrounding wetland.

## Community garden branch

The independently illustrated `community-garden-premium-v1.jpg` scene contains
48 grounded anchors in five LOD bands and seven authored zones. Its visible
greenhouse and potting bench lead to `greenhouse-interior → tomato-plant` and the
terminal `potting-workbench` scene. The branch therefore has real depth without
duplicating an image or inventing an entrance.

Content remains governed by the following contract:

- five authored LOD bands and at least twelve overview labels;
- at least six truthful detail zones covering cultivation, tools, water, soil
  and habitat evidence visible in the accepted pixels;
- every word names an independently pointable object, part, material or directly
  observable property;
- a child scene is added only when its parent contains a complete, unambiguous
  portal object;
- no two portal rectangles overlap, and no image is reused to masquerade as a
  different spatial depth.

## Next reachable branches

The v21 root already provides visual footholds for school, market, maker,
transport, farm and wetland/coast vocabulary. Those atlas districts are dense
overview zones, not new scene-graph branches by themselves. Future breadth work
should promote only a visibly complete root object into an independently
illustrated child, then continue with truthful parent-to-child evidence. Useful
candidates include:

1. School campus → classroom → library.
2. Market hall → produce aisle → bakery counter.
3. Maker workshop → woodworking bench → hand-tool close-up.
4. Farmyard → greenhouse or orchard → crop detail.
5. Harbor → pier → small boat.
6. Wetland reserve → reed bed → aquatic habitat detail.

Before generation, each proposed entrance must be confirmed in the published
parent pixels at original resolution. A visually seeded domain does not count as
a reachable scene until its child asset, audit, zones and portal are all shipped.
