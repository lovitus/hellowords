# Next premium scene batch

This is a production brief for replacing six low-density SVG scenes with bright, evidence-rich 1600 × 900 raster artwork. It does not authorize labels merely because they appear in a prompt: every final anchor must still be reviewed against the generated pixels.

## Shared ImageGen contract

- True 16:9 landscape composition at 1600 × 900, bright high-key daylight or luminous museum lighting, elegant editorial realism, tactile materials, controlled warm-neutral color, and readable foreground/midground/background separation.
- No written labels, captions, callout lines, UI, logos, brands, watermarks, borders, pseudo-writing, horror lighting, murky corners, or unrelated human anatomy.
- Leave calm negative space near the upper-left title area while keeping named objects large enough to point to. Do not solve density by scattering tiny props.
- A portal object is a visual navigation contract: it must be complete, distinctive, unobstructed, and substantially larger or more prominent than nearby objects.
- Generate the scene first, inspect the final pixels, then keep only independently pointable nouns or parts. Materials, actions, states, functions, measurements, and inferred processes are not anchors unless the image gives them a distinct visible mark.

## Wardrobe interior

### Current SVG audit

The SVG clearly supports the cabinet, rails, hangers, a central shirt, a few generic garments, drawers and lower storage, but it reduces most clothing to flat blocks. It cannot distinguish the removed clothing categories or small fasteners reliably. A premium replacement can honestly exceed 32 anchors if the shirt and cabinet hardware are deliberately resolved at useful scale.

### ImageGen-ready specification

> Create a bright, elegant editorial photograph of a fully open built-in oak wardrobe in a calm contemporary bedroom dressing alcove. Use soft morning daylight, pale oak, warm ivory textiles and restrained sage accents. Show the complete cabinet frame, one open door with visible hinges and handle, shelves, drawers, cubbies and storage boxes. Arrange a modest, believable capsule wardrobe with individually readable jacket, dress, trousers, skirt, sweater, belt, necktie, shoes and shoebox. Make one complete white cotton button-front shirt the unmistakable center-right hero and next-scene portal: front-facing, unobstructed, large enough to resolve collar, sleeves, cuffs, placket, buttons, buttonholes, chest pocket, seams and hem. Show hangers and the clothes rail clearly. Keep every named part physically attached and plausible. No people, mannequins, mirrors reflecting people, laundry clutter, brands, text, anatomy, dark luxury lighting or duplicate near-identical garments.

### Existing portal that must remain visible

- `enter-cotton-shirt` → `cotton-shirt`: the complete white cotton shirt, not a fabric swatch or a generic group of clothes.

### Grounded 32-word candidate set

1. wardrobe
2. cabinet frame
3. wardrobe door
4. hinge
5. handle
6. shelf
7. drawer
8. drawer pull
9. cubby
10. storage box
11. clothes rail
12. clothes hanger
13. cotton shirt
14. collar
15. sleeve
16. cuff
17. placket
18. button
19. buttonhole
20. chest pocket
21. seam
22. hem
23. jacket
24. dress
25. trousers
26. skirt
27. sweater
28. belt
29. buckle
30. necktie
31. shoe
32. shoebox

### Accuracy and padding exclusions

- Do not count `wardrobe` and `closet`, `hanger` and `coat hanger`, or `drawer pull` and `drawer handle` as separate anchors on the same object.
- Do not infer cotton weave, fabric weight, cleanliness, tidiness, storage, dressing or hanging as visible words.
- Buttons, buttonholes, seams and cuffs count only if the final 1600 × 900 pixels actually resolve them.

**Honest target:** 32; likely ceiling 36 if the final render preserves all small shirt parts.

## Polymer

### Current SVG audit

The SVG is an attractive abstract chain landscape, but most circles and lines are generic. It supports chain, atom, bond, branch, backbone and side group, not polymer types, properties, reactions or manufacturing. A replacement should be a coherent material-science exhibit rather than a decorative molecule wallpaper.

### ImageGen-ready specification

> Create a bright premium material-science visualization that moves from real polymer objects to microstructure without using captions or callout lines. In the foreground, clearly separate translucent polymer film, several plastic pellets, a molded sample with a cut fracture face, one fiber bundle and visible fibrils. In the center, make the material open into a luminous magnified semicrystalline landscape with unmistakably ordered crystalline lamellae beside tangled amorphous chains, a radial spherulite, a small pore, crack, filler particles and differently colored pigment particles. In the largest right-side magnification, show a physically coherent ball-and-stick generic hydrocarbon polymer model with dark carbon atoms, small pale hydrogen atoms, covalent bonds, one backbone, repeating geometry, a side group, branch, chain end and a separately demonstrated cross-link. Keep the macro, micro and molecular scales spatially distinct through nested cut surfaces, not arrows or text. Use pearl white, pale aqua, amber and clear resin under luminous museum lighting. No factory, flames, recycling symbols, equations, molecular labels, random free-floating spheres or impossible bonds.

### Existing portal that must remain visible

- None. Do not invent a click-through object merely to fill the composition.

### Grounded candidate set and upper limit

1. polymer specimen
2. polymer chain
3. backbone
4. repeating unit
5. carbon atom
6. hydrogen atom
7. covalent bond
8. branch
9. side group
10. chain end
11. cross-link
12. chain entanglement
13. folded chain
14. amorphous region
15. crystalline region
16. lamella
17. crystallite
18. spherulite
19. fibril
20. fiber
21. polymer film
22. plastic pellet
23. molded surface
24. fracture surface
25. pore
26. crack
27. filler particle
28. pigment particle

### Scientific accuracy exclusions

- Do not mix incompatible claims into one unnamed molecule. If the final chemistry cannot distinguish an atom or side group, remove that anchor rather than assigning it by color convention alone.
- A repeating unit is not a free monomer; a branch is not automatically a cross-link; a crystallite is not a separate pellet.
- Elasticity, density, molecular weight, glass transition, polymerization, biodegradability and recyclability are not directly visible here.

**Honest ceiling:** 28. Reaching 32 would require near-synonyms, invisible properties, or several chemically different specimens that stop reading as one coherent scene.

**Published audit:** 25 grounded terms. The final pixels support a fiber bundle and a separately visible fiber, but not an internal fibril hierarchy. The apparent side-group candidate is detached from the main chain, and the generic chain segment has no chemically defined repeat boundary, so both `side group` and `repeating unit` remain deliberately unlabelled.

## Railway platform

### Current SVG audit

The SVG makes the train, platform edge, tactile paving, warning line, rails, sleepers, canopy, station sign and commuters readable. It lacks ballast, rail hardware, platform fixtures and enough differentiated passenger objects. A realistic three-quarter platform view can support 32 without crowding.

### ImageGen-ready specification

> Create a bright, optimistic editorial photograph of a modern regional railway platform beneath a glass-and-steel canopy, viewed in a wide three-quarter perspective. Warm daylight must illuminate a complete stopped electric train carriage along the right side as the dominant next-scene portal, with an open carriage door, large windows, visible wheels, bogie and roof pantograph. In the foreground resolve two rails, concrete sleepers, ballast, rail fasteners and a narrow drainage channel. Keep the platform edge, yellow warning line and tactile paving continuous and unmistakable. Add a canopy with columns and catenary support mast and wire, plus a bench, litter bin, analog clock, blank station sign, blank information display, loudspeaker and CCTV camera. Include one clearly readable commuter with suitcase, backpack and umbrella nearby, plus a parked bicycle. Spacious, clean, safe and elegant; no crowd wall, dramatic night lighting, advertisements, readable station names, logos, pseudo-text or trains merged with the platform.

### Existing portal that must remain visible

- `enter-train-carriage` → `train-carriage`: one complete stopped train carriage occupying a large continuous region, not only a door crop.

### Grounded 32-word candidate set

1. railway platform
2. platform edge
3. tactile paving
4. warning line
5. track
6. rail
7. sleeper
8. ballast
9. rail fastener
10. drainage channel
11. canopy
12. canopy column
13. catenary wire
14. support mast
15. bench
16. litter bin
17. analog clock
18. station sign
19. information display
20. loudspeaker
21. CCTV camera
22. train carriage
23. carriage door
24. window
25. wheel
26. bogie
27. pantograph
28. commuter
29. suitcase
30. backpack
31. umbrella
32. bicycle

### Accuracy and padding exclusions

- A rail, whole track and sleeper are different anchors; `track` and `railway track` are not two anchors.
- Keep the pantograph physically connected to the train and the catenary wire aligned above it. Wheels belong within the bogie rather than floating against the carriage body.
- Delay, express service, destination, ticket validity, boarding and “mind the gap” are not visible nouns. Do not infer a passenger role from every person; use one visually neutral `commuter` anchor.

**Honest target:** 32; likely ceiling 38 with additional genuinely resolved platform fixtures.

## Battery pack

### Current SVG audit

The SVG supports enclosure, four modules, cylindrical cells, busbars, cables, controller, cooling plate and two terminals, but its simplified wiring and glowing terminals are closer to an icon than an engineering cutaway. A deliberate exploded cutaway can support 32 pack-level components while preserving the existing cell portal.

### ImageGen-ready specification

> Create a bright, precise premium 3D engineering cutaway of an electric-bus lithium-ion battery pack on a clean pale studio floor. Lift the enclosure lid to reveal an intact gasket and neatly separated modules. Make the left-front module and its individually visible cylindrical lithium-ion cells the large, unobstructed next-scene portal. Resolve cell holders and busbars, red positive and dark negative terminals, orange high-voltage cable, a separate slim low-voltage wiring harness, connectors, fuse, contactor, service disconnect, BMS controller, current sensor, temperature sensor and voltage-sense wires. Below the modules expose a cooling plate with visible serpentine cooling channels, coolant inlet and outlet, thermal pads and insulation sheet. Around the shell show mounting brackets, bolts, vent, pressure-relief valve, protective terminal cover and ground strap. Use high-key white, pale aluminum, safety orange and restrained teal; technically orderly, clean and non-threatening. No sparks, flames, swollen cells, leaking fluid, fake circuit glyphs, readable warning text, vehicle body, people or impossible loose wiring.

### Existing portal that must remain visible

- `enter-lithium-cell` → `lithium-ion-cell`: the left-front cell module with multiple clearly separate lithium-ion cells. The portal cannot be a generic glowing box.

### Grounded 32-word candidate set

1. battery pack
2. enclosure
3. lid
4. gasket
5. battery module
6. lithium-ion cell
7. cell holder
8. busbar
9. positive terminal
10. negative terminal
11. high-voltage cable
12. low-voltage harness
13. cable connector
14. fuse
15. contactor
16. BMS controller
17. current sensor
18. temperature sensor
19. voltage-sense wire
20. service disconnect
21. cooling plate
22. coolant inlet
23. coolant outlet
24. cooling channel
25. thermal pad
26. insulation sheet
27. mounting bracket
28. bolt
29. vent
30. pressure-relief valve
31. protective cover
32. ground strap

### Scientific accuracy exclusions

- Keep pack, module and cell as three nested physical levels. Do not use them as interchangeable labels at one rectangle.
- Anode, cathode, separator and electrolyte are inside the child cell and must not appear as pack-level anchors.
- Voltage, current, charge, energy, heat, fast charging and thermal runaway are measurements or processes, not visible components.
- Positive and negative terminals must be genuinely separate and consistently color-coded; the cooling circuit must not connect to electrical terminals.

**Honest target:** 32; likely ceiling 36 if small sensors and connectors survive final-resolution inspection.

## Oxygen molecule

### Current SVG audit

The SVG combines an alveolus, capillary, red cells and an oversized two-sphere oxygen model. The yellow “electrons” and overlapping orbital ellipses are not a reliable molecular-orbital representation. A new scene should prioritize the real air–blood barrier and use a restrained O₂ model, not pretend to expose quantum structure.

### ImageGen-ready specification

> Create a bright, scientifically literate medical-editorial cutaway of oxygen crossing from an alveolar air space into a pulmonary capillary. On the left show a small bronchiole opening into a cluster of alveoli, with one large cutaway alveolus, alveolar wall and septum. At the magnified air–blood barrier resolve a thin surfactant layer, flattened type I pneumocyte, one cuboidal type II pneumocyte, fused basement membrane, narrow interstitial space and capillary endothelial cell. On the right show capillary lumen, plasma and several red blood cells with visible membranes, cytoplasm and simplified hemoglobin forms; include one pulmonary macrophage away from the main barrier. Depict oxygen consistently as repeated pairs of equal red spheres moving across the thinnest barrier into one red blood cell, with one larger central O₂ model showing two oxygen atoms and a simple double-bond convention. Include a few clearly separate carbon-dioxide pairs moving in the opposite direction only if geometrically unmistakable. Use luminous coral, cream, pale aqua and clean white, with soft daylight-like scientific lighting. No text, arrows, callouts, yellow electron dots, decorative orbital rings, blue veins, gore, diseased tissue or unrelated anatomy.

### Existing portal that must remain visible

- None. The scene is currently terminal; the oxygen molecule is a study object, not another portal.

### Grounded candidate set and upper limit

1. oxygen molecule
2. oxygen atom
3. double bond
4. bronchiole
5. alveolus
6. alveolar sac
7. alveolar duct
8. air space
9. alveolar wall
10. alveolar septum
11. type I pneumocyte
12. type II pneumocyte
13. surfactant layer
14. pulmonary capillary
15. capillary lumen
16. endothelial cell
17. basement membrane
18. interstitial space
19. red blood cell
20. erythrocyte membrane
21. cytoplasm
22. blood plasma
23. hemoglobin
24. pulmonary macrophage
25. cell nucleus
26. smooth muscle
27. carbon dioxide molecule
28. diffusion trail

### Scientific accuracy exclusions

- O₂ crosses mainly through type I alveolar epithelium, the very thin shared basement-membrane region and capillary endothelium; do not route it through a type II cell or macrophage.
- Do not render classical planet-like electron orbits, arbitrary lone-pair dots or a labeled molecular orbital. Those require a rigorous separate diagram and are unreliable ImageGen anchors.
- Red blood cells have no nucleus; the nucleus candidate belongs to an alveolar or endothelial cell. Carbon dioxide must not look identical to O₂.
- Diffusion is passive and driven by a partial-pressure gradient, but the gradient itself is not a spatial label. A repeated O₂ trail may anchor `diffusion trail`; the process word `diffusion` should remain explanatory copy.

**Honest ceiling:** 28. Thirty-two would require subatomic claims, invisible physiology, or synonyms for the same barrier layers.

## Hemoglobin

### Current SVG audit

The SVG correctly suggests a four-subunit protein with four heme centers and paired oxygen spheres, but its four smooth blobs are not protein folds and the dotted trace is decorative. Even a strong molecular render cannot honestly provide 32 independent anchors without adding invisible biochemical states or naming the same ribbon at several abstraction levels.

### ImageGen-ready specification

> Create a luminous, scientifically plausible premium 3D molecular visualization of adult human hemoglobin A inside the soft translucent context of one red blood cell. Make the hemoglobin molecule dominant and clearly tetrameric: exactly two warm coral alpha subunits and two cool teal beta subunits, each rendered as a folded ribbon rich in alpha helices and loops. Show exactly one heme pocket per subunit, four planar dark-red porphyrin rings and one central iron(II) ion in each heme. Make four bound oxygen molecules visible as pairs of equal red spheres coordinated at the iron centers. The upper-left bound oxygen molecule must be larger, isolated from overlaps and unmistakably readable as the existing next-scene portal. In one enlarged but physically connected heme pocket, resolve the proximal histidine below the iron, distal histidine near the oxygen, and the axial coordination geometry without text or callout lines. Preserve a subtle red-cell membrane and cytoplasm around the molecule while keeping the protein crisp. Bright museum-science lighting, elegant coral/teal/red/iron palette, no gore, equations, labels, decorative DNA, yellow “iron” stars, random atom clouds or more/fewer than four hemes.

### Existing portal that must remain visible

- `enter-oxygen-molecule` → `oxygen-molecule`: the bound upper-left O₂ pair. It must remain a distinct pair of equal atoms next to one heme, not a generic blue ornament or a free-floating bubble.

### Grounded candidate set and upper limit

1. red blood cell
2. cell membrane
3. cytoplasm
4. hemoglobin
5. tetramer
6. alpha subunit
7. beta subunit
8. globin fold
9. alpha helix
10. loop
11. polypeptide chain
12. subunit interface
13. central cavity
14. heme group
15. porphyrin ring
16. iron(II) ion
17. heme pocket
18. proximal histidine
19. distal histidine
20. oxygen molecule
21. oxygen atom
22. axial coordination bond

### Scientific accuracy exclusions

- Adult hemoglobin A is α₂β₂ with four hemes; each heme contains Fe²⁺ and binds at most one O₂. Do not use Fe³⁺, five subunits, shared hemes or oxygen attached directly to a protein surface far from iron.
- The proximal histidine coordinates iron; the distal histidine sits on the oxygen side but does not replace oxygen as the ligand. ImageGen output must be rejected if this pocket becomes spatially incoherent.
- `Globin`, `protein`, `polypeptide` and `subunit` are not four labels for the same colored blob. Only the listed hierarchy should survive when the final ribbon exposes distinct spatial evidence.
- Affinity, cooperativity, saturation, oxygenation, allostery, anemia and mutation are not visible anchors in a single static conformation.

**Honest ceiling:** 22. A scientifically credible 32-label hemoglobin scene would need a separate authored multi-panel diagram or additional child scenes, not padding on one molecule.

## Acceptance rule for the batch

The wardrobe, railway platform and battery briefs are designed for a 32-anchor premium floor. Polymer, oxygen molecule and hemoglobin must retain their stated evidence-based ceilings unless the generated pixels introduce genuinely separate, scientifically correct structures. After generation, portal crops and every retained coordinate need a fresh human review; no existing SVG coordinate may be carried forward by proportion alone.

## Next high-priority bright replacement round

These three replacements already have dense runtime data. Their current coordinates are evidence about composition, not coordinates to copy. A new image is acceptable only when every retained word and portal is re-audited against the new 1600 × 900 pixels.

## Apartment bright v2

### Current visual, label and navigation audit

`apartment-premium.jpg` is a 47-label architectural cutaway. It is coherent but much darker and more amber than the current bright-world direction. Its layout is a useful navigation contract: living room upper-left, kitchen upper-right, bedroom lower-left, bathroom lower-right, and a narrow central hall/stair core.

- Incoming parent portal: `world-map` / `enter-home` → `apartment`.
- Outgoing portal: `enter-kitchen` → `kitchen`, currently the complete upper-right kitchen.
- Outgoing portal: `enter-bedroom` → `bedroom`, currently the complete lower-left bedroom.
- Outgoing portal: `enter-bathroom` → `bathroom`, currently the complete lower-right bathroom.
- The three outgoing portal regions must remain visually separate. No furniture, wall, stair or decorative object may create an ambiguous shared target.

### ImageGen-ready prompt

> Use case: photorealistic-natural
> Asset type: 16:9 spatial-language exploration scene, 1600 × 900
> Primary request: Create a bright, elegant, physically plausible two-storey apartment dollhouse cutaway that preserves the current four-room navigation layout.
> Scene/backdrop: A contemporary city apartment in clear late-morning daylight, with a slim central hallway and stair core. The upper-left living room is open and welcoming; the upper-right kitchen is complete and unobstructed; the lower-left bedroom is complete and unobstructed; the lower-right bathroom is complete and unobstructed.
> Style/medium: Premium photorealistic architectural editorial photography, realistic room proportions, straight verticals, natural material grain, no miniature-toy look.
> Composition/framing: Wide front-on cutaway with all four rooms fully inside frame. Keep the kitchen, bedroom and bathroom as three large, non-overlapping portal objects. Preserve a narrow calm strip near the upper-left title area without removing useful room evidence.
> Lighting/mood: High-key neutral daylight around 5000–5600 K, soft window bounce, gentle contact shadows, clean whites, pale oak, linen, muted sage and restrained terracotta. Every corner remains readable; no black ceiling band or murky lower floor.
> Materials/textures: Real wood grain, woven rug and bedding, matte painted cabinetry, ceramic tile, clear shower glass, brushed metal fixtures and natural houseplant leaves.
> Constraints: Show the complete kitchen, bedroom and bathroom portal regions exactly once; keep the central stairs and hallway readable; no people, mannequins, anatomical models, pets, brands, logos, written signs, book-cover lettering, pseudo-writing, captions, UI, borders or watermark.
> Avoid: Warm-orange night grading, luxury-hotel darkness, impossible open-plan overlaps, duplicated rooms, floating furniture, fisheye distortion, excessive clutter, staged food spread or tiny decorative props used only to inflate vocabulary.

### Portal preservation and coordinate migration

- **Kitchen portal:** retain the upper-right room as one continuous kitchen region, with refrigerator, counter/island, stove, hood, sink and cabinets inside the same readable enclosure. It cannot become a narrow doorway crop.
- **Bedroom portal:** retain the lower-left room as one continuous bedroom region, with a complete bed and wardrobe clearly inside it. It cannot be represented only by bedding through a door.
- **Bathroom portal:** retain the lower-right room as one continuous bathroom region, with bathtub, shower, toilet and basin all visually belonging to it. Frosted glass must not hide the room.
- The new asset must receive fresh portal rectangles after pixel review. Do not copy the old `x/y/width/height` values merely because the quadrants are similar.

### Must-visible evidence plan

- Whole-space and circulation: apartment, living room, kitchen, bedroom, bathroom, hallway, stairs, door handle and ceiling light.
- Living room: sofa, cushion, television, rug, shelf, coffee table, floor lamp, houseplant, chair, picture frame, vase, curtain and window frame.
- Kitchen: counter, stove, faucet, refrigerator, stool, cabinet, sink, oven hood, pendant light and kettle.
- Bedroom: bed, pillow, wardrobe, laundry basket, side table, blanket and dresser.
- Bathroom: bathtub, shower, toilet, mirror, towel, bath mat, basin and floor tile.

Every named small part must remain large enough for a short leader line at final resolution. If the kettle, door handle, window frame or individual floor tile cannot be pointed to independently, remove that word or regenerate; do not place an anchor on an approximate area.

### Honest density and rejection rules

**Honest target:** 40–44 independently pointable words. **Hard ceiling:** 47, matching the current authored vocabulary; exceeding it would require new pixel evidence and a new audit rather than synonyms or décor padding.

Reject the image if any portal room is cropped, dark, visually merged with the hall, or smaller than the non-portal living room; if bathroom fixtures appear in the kitchen or food appears in the bathroom; if any human/anatomical display is present; or if any picture, appliance, book or wall decoration contains pseudo-text.

### Apartment release acceptance checklist

- Preserve the current navigation semantics, not its old pixels: a complete upper-right kitchen, lower-left bedroom and lower-right bathroom must remain three visually disjoint portal objects. Each room must occupy at least 18% of the 1600 × 900 frame, remain recognizable at a 400 × 225 thumbnail, and contain the complete fixture group listed above. A doorway glimpse or one hero appliance does not qualify as a room portal.
- Retain 40–44 anchors only after a final-pixel audit. The minimum useful evidence is the five whole-space nouns plus independently pointable circulation elements, furniture, fixtures and room parts from the must-visible plan; no missing small object may be recovered with a synonym, activity, material property or approximate room-area anchor.
- Measure the accepted JPEG after resizing to 400 × 225 without color adjustment. Using sRGB Rec. 709 luma `Y = 0.2126R + 0.7152G + 0.0722B`, require full-frame mean `Y ≥ 115`, no more than 25% of pixels below `Y = 64`, and no more than 5% below `Y = 32`. Review each portal crop separately: none may have mean `Y < 95` or lose a named fixture in blocked shadow.
- Reject any black roof/frame band, orange evening grade, murky lower floor, clipped window, anatomy or medical display, mannequin, human figure, food in the bathroom, bathroom fixture in the kitchen, or letter/number-like mark at 100% and 200% inspection.
- Before wiring the asset, author three fresh portal rectangles and fresh label coordinates from the accepted pixels, verify zero portal overlap, and update the reviewed asset hash. The current rectangle coordinates are reference evidence only.

## City street bright v4

### Current visual, label and navigation audit

`city-street-museum-v2.jpg` carries 46 labels and a strong three-destination composition, but it contains pseudo-lettering on shops, vehicles and street furniture, plus an anatomy skeleton in the street-facing museum window. The replacement must preserve navigation while removing both failure modes.

- Incoming parent portal: `world-map` / `enter-city` → `city-street`.
- Outgoing portal: `enter-science-museum` → `science-museum`, currently the complete far-left museum facade and exhibit window.
- Outgoing portal: `enter-city-cafe` → `city-cafe`, currently the central ground-floor storefront.
- Outgoing portal: `enter-transit` → `transit-hub`, currently the large right-side glass transit entrance and adjoining bus-stop area.
- Current label candidates `skeleton` and `atom symbol` are not preservation requirements. Remove them rather than mixing anatomy or logo-like symbols into the street scene.

### ImageGen-ready prompt

> Use case: photorealistic-natural
> Asset type: 16:9 spatial-language exploration scene, 1600 × 900
> Primary request: Create a bright, refined daytime city intersection with three unmistakable destinations: a science museum facade on the far left, a welcoming cafe storefront in the center, and a glass-roofed public transit hub on the right.
> Scene/backdrop: A clean, walkable mixed-use city block under a pale blue sky, with believable road geometry, broad sidewalks, healthy street trees and restrained urban activity.
> Subject: The left science museum has a complete stone facade, columns, entrance and one large display window containing only an optical telescope and mineral or astronomy objects—no skeleton, anatomy or mannequin. The central cafe has a complete glass door, windows, awning and planters but absolutely no lettering. The right transit hub has a complete glazed entrance, bus stop and one clearly readable city bus without route text or branding.
> Style/medium: Premium photorealistic urban editorial photography with elegant realism, natural scale and crisp but not overprocessed detail.
> Composition/framing: Wide eye-level three-quarter view. Keep the museum, cafe and transit hub as three large, non-overlapping portal regions. Show the crosswalk, curb ramp and foreground road surface clearly without letting vehicles block the destinations.
> Lighting/mood: Bright neutral morning light, open shadows, light stone, warm brick, clear glass, fresh green trees and a restrained teal transit accent. No wet-night reflections, smoky haze or orange cinematic grade.
> Materials/textures: Real brick, carved stone, glass, painted metal, asphalt, concrete, tactile paving, rubber tires and foliage.
> Constraints: No readable text anywhere—no shop names, museum title, cafe name, bus route, stop name, street name, license plate characters, advertisements, posters, timetable glyphs, logos, brands or pseudo-writing. Use only non-text traffic-light shapes and standard geometric road markings. A small number of ordinary pedestrians may appear naturally; no anatomy model, skeleton, medical figure or unrelated exhibit may appear outdoors.
> Avoid: Crowd walls, anatomy in windows, atom-logo signage, giant bicycles, vehicles fused with curbs, unreadable fake storefront copy, excessive props, dramatic rain, darkness, dystopian mood or tiny buildings that cannot serve as portals.

### Portal preservation and coordinate migration

- **Science museum portal:** keep a complete left-edge facade and visible entrance. The architecture and astronomy/mineral display must establish a science venue without written signage or an anatomy figure.
- **City cafe portal:** keep one complete central street-level cafe frontage with door, display window, awning and planter. It must not overlap the museum facade or the transit-hub region.
- **Transit hub portal:** keep the right-side glass entrance as the dominant built structure, with the bus subordinate and not obscuring the entry. The portal cannot collapse into a bus-only target.
- Preserve the left/center/right ordering because it separates current hit regions, but derive every new rectangle from the final pixels.

### Must-visible evidence plan

- Navigation buildings: science museum, museum entrance, exhibit window, museum column, telescope, central storefront, cafe awning, planter, transit-hub entrance, bus stop and bus.
- Street geometry: street, lane, intersection, crosswalk, road marking, sidewalk, curb, curb ramp and tactile paving.
- Infrastructure: traffic light, pedestrian signal, storm drain, manhole, lamp post, a non-text bus-stop sign/marker, bollard, bicycle rack, public bench and trash can.
- General city evidence: building, window, balcony, street tree and flower pot.
- Vehicles and people: an unmarked passenger car, bicycle, wheel, tire, a few pedestrians, one clearly visible helmet and one backpack.

Do not retain `skeleton` or `atom symbol`. A generic `sign` is valid only when its physical signboard is visible and contains no letters, numbers or invented glyphs.

### Honest density and rejection rules

**Honest target:** 40–42 grounded words. **Hard ceiling:** 44, the current 46 minus the anatomy skeleton and decorative atom symbol. Do not recover the count with `shop`, `store`, `storefront` synonyms, multiple pedestrians, or unreadable signage.

Reject the image if any lettering or number-like pseudo-text appears at 1600 × 900; if the cafe is not a complete frontage; if the transit target reads only as a bus; if the museum requires a sign to be identifiable; if anatomy appears in any window; or if the three portal regions overlap after a pixel-based crop proposal.

**Published audit:** `city-street-bright-v4.jpg`, SHA-256 `e280b0047e7bf0dbcf7f1ff392c38d5b88f06e11bb6304f3d998f47f37438fdf`, retains 42 final-pixel anchors in six detail zones. The independent review deleted the edge-cropped `bus door` and the duplicate `road`, labelled the unmarked yellow vehicle conservatively as `car`, corrected every confirmed coordinate error, and preserved the three complete disjoint destinations.

### City-street release acceptance checklist

- Preserve the left/center/right portal reading at thumbnail size: a complete science-museum facade and entrance at left, a complete cafe frontage at center, and a complete glazed transit-hub entrance at right. All three must be recognizable without words or logos, remain unobstructed, and receive disjoint hit rectangles; a telescope-only window, cafe awning alone, or bus alone is not a valid portal.
- Retain 40–42 grounded anchors after final-pixel review. The scene must support all three navigation buildings, continuous street/crossing geometry, the core curb and transit infrastructure, and a restrained set of separately visible vehicles or people. Delete unsupported candidates rather than restoring `skeleton`, `atom symbol`, pseudo-signage or near-synonyms.
- Measure the accepted JPEG at 400 × 225 with the same Rec. 709 luma method. Require full-frame mean `Y ≥ 115`, no more than 25% of pixels below `Y = 64`, and no more than 5% below `Y = 32`; the foreground road may remain darker, but crosswalk, curb ramp, drain and tactile paving must remain independently readable.
- Reject any skeleton, anatomical or medical figure, atom-logo facade, readable or pseudo shop/station/route text, license characters, timetable glyphs, advertisement, brand, wet-night grade, smoky haze, crushed foreground shadow, crowd wall or vehicle that blocks a portal entrance.
- Before wiring the asset, inspect the full 1600 × 900 image at 100% and 200%, derive every portal/label coordinate anew, verify the three portal rectangles do not overlap, remove the two forbidden current labels, and update the reviewed asset hash. Do not reuse current normalized positions merely because the destination order matches.

## Leaf natural v3

### Current visual, label and navigation audit

`leaf-premium-v2.jpg` carries 41 labels and many pointable details, but the extreme yellow-green backlight, waxy translucency and oversized organisms make the leaf feel synthetic. Its child portal also looks like cells floating inside a glass bead, which is not a truthful plant-cell transition.

- Incoming parent portal: `oak-tree` / `enter-leaf` → `leaf`; the destination must remain recognizably a lobed oak leaf attached by a petiole to an oak twig.
- Outgoing portal: `enter-plant-cell` → `plant-cell`, currently a large upper-right dew drop and `cellular-dew-drop` region.
- Preserve the portal relationship but migrate its evidence: the clear dew drop may act as a natural magnifying lens over the epidermis, revealing cell-wall pattern in the leaf surface beneath it. Cells must not float inside the water.

### ImageGen-ready prompt

> Use case: photorealistic-natural
> Asset type: 16:9 spatial-language exploration scene, 1600 × 900
> Primary request: Create a scientifically believable, naturally colored macro photograph of one mature lobed oak leaf attached to an oak twig, rich in pointable morphology and small-scale ecology without looking staged or synthetic.
> Scene/backdrop: A living oak branch in soft late-morning woodland daylight, with a quiet blurred canopy background. The main leaf fills most of the frame while its full outline, petiole, twig connection and several nearby oak structures remain visible.
> Subject: Show a matte healthy oak leaf with realistic minor variation: central midrib, branching secondary and tertiary veins, fine veinlets, lobes, sinuses, tip, base, a small naturally curled margin exposing the paler underside, one modest chewed edge and one leaf spot. Include a believable twig, bark, bud with scales, one young leaf, one acorn and cup, one oak gall, a small aphid cluster, one ladybird, one caterpillar with readable segments, one short row of insect eggs, and one small spider with a few silk strands. Keep organisms near plausible macro scale and spatially separated.
> Portal subject: Place one optically clear round dew drop on the upper-right half of the leaf. The drop must magnify and refract a localized polygonal epidermal cell-wall pattern in the leaf surface directly beneath it; the pattern follows the leaf plane and is not suspended inside the drop. Keep the drop unobstructed and large enough to serve as the plant-cell portal. Add only a few much smaller water beads elsewhere.
> Style/medium: Premium focus-stacked botanical macro photography, natural optics, truthful surface texture and restrained depth of field.
> Composition/framing: Slightly oblique top view with the complete oak leaf outline inside frame. Keep the portal dew drop, main vein network, twig structures and organisms in the shared focus plane. Leave only a narrow calm title area; do not sacrifice the leaf tip or edge.
> Lighting/mood: Bright soft daylight with neutral white balance and gentle translucency only at the thinnest edges. Use natural forest green, olive, fresh sap green and warm brown; avoid neon yellow, acid green and blown golden rim light.
> Materials/textures: Matte cuticle, subtle pores and irregularities, fibrous twig bark, natural insect shells, clear water with realistic refraction and no glass-marble appearance.
> Constraints: No text, labels, arrows, callouts, UI, logos, watermark, decorative honeycomb overlay, microscope frame or split-panel diagram. No plastic leaf, fantasy glow, giant insects, duplicate organisms, floating cells, impossible vein geometry or unattached acorn.
> Avoid: Over-saturation, wax-polish, transparent resin texture, heavy backlight, perfect symmetry, excessive droplets, horror pests, diseased-leaf dominance or shallow focus that blurs named evidence.

### Portal preservation and coordinate migration

- **Plant-cell portal:** the hit region must cover the clear dew drop plus the epidermal patch directly beneath it. The cell-wall pattern belongs to the leaf surface and must remain spatially connected when the drop is removed conceptually.
- The portal is invalid if it looks like a detached glass sphere, a bubble containing cells, a honeycomb icon, or a second microscopic panel pasted onto the photograph.
- Re-author `enter-plant-cell` coordinates and its source visual region after generation; do not reuse the old `cellular-dew-drop` rectangle by proportion.

### Must-visible evidence plan

- Leaf morphology: oak leaf, blade, petiole, base, tip, margin, lobes, sinuses, midrib, secondary veins, tertiary veins, veinlets, vein network, surface, curled edge, underside and chewed edge.
- Twig structures: twig, twig bark, bud, bud scale, young leaf, acorn and acorn cup.
- Organisms and traces: ladybird with a readable elytron, aphids, caterpillar with segments, insect-egg row, spider with readable legs, spider silk, oak gall with surface texture and leaf spot.
- Optical evidence: one portal dew drop, a few separate small water beads and a localized epidermal cellular pattern beneath the portal drop.

### Honest density and scientific exclusions

**Pre-generation target (historical):** 36–38 independently pointable words. The
published `leaf-natural-v3` audit supersedes that estimate with 54 reviewed
candidates and 49 retained anchors across five zones. It adds only pixels that
resolve a lichen patch, bark fissure, bud tip, acorn stalk/cup scale, epidermis,
and separate ladybird, aphid, caterpillar and spider parts; the original
duplicate/synthetic exclusions remain in force.

- A vein network may contain independently visible secondary veins, tertiary veins and veinlets, but `vein` and `vein network` are not extra anchors on the same line.
- `Leaf surface`, `leaf blade` and `leaf` must not become three labels at one coordinate.
- The dew drop magnifies existing epidermal structure; it does not reveal mesophyll, chloroplasts, stomata or an entire plant cell unless those structures are actually resolved. Those belong in the child scene.
- A gall is plant tissue, not an acorn; insect eggs are not dew beads; spider silk must connect to physical surfaces.

Reject the image if the palette is fluorescent or golden-yellow, the leaf reads as plastic, the portal drop contains floating cells, any organism is implausibly giant, the oak morphology is wrong, the main outline is cropped, or more than two must-visible evidence groups fall outside the useful focus plane.

## Acceptance rule for the bright replacement round

- First assess portal truth at thumbnail size: apartment must expose three room portals, city street must expose three non-overlapping destination buildings, and leaf must expose one scientifically credible magnifying-drop portal.
- Then assess full-resolution evidence. Every retained anchor needs a distinct visible object or part and a fresh coordinate; old coordinates are not transferable.
- Run a zero-text inspection at 100% and 200% zoom. Any logo, letter, number, timetable-like mark, book-cover gibberish or pseudo-writing rejects apartment or city street rather than being hidden under labels.
- Compare luminance and color against the current premium world: bright natural midtones, readable shadows and elegant restrained color are required. Brightness must not be simulated by clipping highlights or neon saturation.
- Save accepted assets only under new versioned filenames: `apartment-bright-v2`, `city-street-bright-v4` and `leaf-natural-v3`; never overwrite the current production files during generation or review.
