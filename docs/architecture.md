# HelloWords architecture decision

Status: accepted and maintained with the production implementation

## Product contract

HelloWords is a calm, zoomable vocabulary world. It is not a quiz in its first
version. English labels are visible in the scene, Chinese meanings are off by
default, and zooming into or out of a portal recursively redraws the adjacent
scene as a high-resolution tile without exposing loading mechanics.

The product provides both:

- a branching set of illustrated, semantically natural scene chains; and
- a searchable lexical world containing exactly 10,000 ranked English display
  words with Chinese meanings, organized into explicit semantic levels.

The UI must distinguish natural scene anchors from atlas entries. It must not
claim that every vocabulary entry has been hand-illustrated.

## Rendering decision

Each illustrated slice is an external, independently reviewed 1600 × 900 raster
image. The current world has 37 raster scenes and no scene-level SVG cutaways.
Artwork is decorative; labels, portals, focus targets, and navigation are
separate HTML layers driven by typed scene data. This keeps vocabulary crisp in
screen space and makes translations and placement editable without rewriting
artwork.

Only the current scene is normally mounted. While a portal is approached, the
decoded child image is clipped to that portal and recursively redrawn as a
high-resolution tile. It scales continuously with the parent camera, takes over
at the same visual center, and reverses through the same geometry on return.
Warm handoffs do not add a veil, loader, or duplicate transition surface.

The lexical world is one continuous semantic plane. Camera scale changes the
active hierarchy LOD from realm to topic, subcluster, and word without routing
to separate hierarchy screens. The 10,000-entry data model remains fully
reachable, while screen-space projection, viewport culling, and collision
resolution cap the live vocabulary bubbles at 80 on desktop and 40 on mobile.

The client is divided into four layers:

1. `domain`: camera, scene graph, portal hysteresis, vocabulary types;
2. `data`: lazy repositories, validation, source metadata, small caches;
3. `runtime`: explicit gesture/transition state and request cancellation;
4. `ui`: viewport, labels, controls, breadcrumbs, search and lexical world.

High-frequency pointer input is accumulated in mutable camera state and applied
once per animation frame. React state is reserved for low-frequency changes
such as scene identity, preference changes, transition state, and selected
words. Scene labels use five continuous scale bands plus a spatially indexed
screen-space collision layout, so vocabulary is revealed progressively instead
of appearing as whole DOM tiers. Dense local collisions receive stable nearby
callouts; only readable labels are interactive or keyboard-focusable. Text is
never raster-scaled with the artwork.

Premium scene JSON also carries authored `detailZones`. Each zone is a bounded
crop in source-image coordinates, a target camera scale, and a stable batch of
word-label IDs whose anchors all lie inside that crop. This makes one rich image
behave like several honest local explorations without duplicating assets or
turning unrelated vocabulary into floating labels. The data contract requires
at least four zones and normally 32 grounded anchors per premium scene; an
evidence-reviewed terminal specialist slice may declare a lower floor when
meeting 32 would require duplicate names for the same visible structure.
The current graph contains 1,516 contextual anchors representing 1,224 distinct
display terms across 193 authored zones, connected by 36 typed portals.

## Scene and portal contract

Scene coordinates use a stable logical view box. Labels and portal geometry use
that coordinate space, not viewport pixels. A portal stores a child scene ID,
its focus rectangle, and an optional entry camera. Runtime navigation derives
the invertible parent/child camera mapping and retains the parent bookmark.

Default navigation rules:

- prepare and reveal the decoded child tile as the zoom focus approaches a
  portal, then enter when the portal is focused and its authored threshold
  (default `3.6`) is crossed;
- keep the first ordinary zoom-out step inside a fitted child and return only
  after a second deliberate step crosses `0.70`;
- enforce a short transition cooldown and require fresh reverse input;
- keep the recursive tile and camera center continuous across scene ownership;
- restore the exact saved parent camera through the inverse portal mapping;
- on reduced motion, commit directly to a stable fitted camera without an
  intermediate magnified handoff frame.

The bounded cache pins the current scene, its parent, and at most one likely
child, including their decoded images. A caller can abandon an obsolete wait
without poisoning a shared adjacent-scene fetch or decode. Superseded
speculative children are evicted from the three-scene neighborhood.

## Vocabulary contract

Vocabulary data is generated deterministically from pinned sources. A display
word is NFKC-normalized, case-folded for uniqueness, and may contain internal
apostrophes or hyphens. Surface forms are retained because they are meaningful
to learners; lemma aliases do not inflate the distinct display-word count.

Every shipped entry includes:

- stable ID and display word;
- frequency rank and Zipf score;
- compact Chinese meaning;
- inferred part-of-speech categories when available;
- source references and data-license metadata;
- an atlas group so every entry is reachable without loading the full dataset.

The ranked vocabulary is sharded by rank band. A second deterministic semantic
build maps every entry into 10 realms, 44 topics and 704 subclusters using
WordNet synsets/lexnames plus explicit fallbacks for inflections, names,
abbreviations, contractions and function words. The lexical world makes those
relationships visible as four scale-dependent LODs on the same plane: realms,
topics, semantic subclusters, and individual words. Normal exploration loads
only the active hierarchy branch and the selected topic shard. Global search
is the deliberate exception: it may query all 44 topic shards, deduplicates
requests, and bounds its result set. Selecting a search match opens its word
detail without retargeting the semantic camera.

Scene encounters are recorded passively in local storage. Selecting a label
opens an optional word card and pronunciation action, but no exam is required.
When a scene term has an exact entry in the ranked vocabulary, its `lexemeId`
links directly into the 10,000-word hierarchy. The current graph has 242 such
sense-reviewed links. Validation resolves these IDs against every semantic
shard and rejects missing or word-mismatched links; specialist visual phrases
are allowed to remain unlinked.
The global translation preference controls ambient labels only: an intentionally
selected word always reveals its meaning without changing that preference.

## Accessibility and input

The decorative scene image has empty alternative text. Portals and visible
labels use native buttons with accessible names. The viewer provides keyboard
pan, zoom, fit, enter, and back controls, a compact translucent scene minimap
with clickable ancestors and direct children, a polite scene-change live region,
and non-spatial search results. Browser page zoom is never disabled.

Pointer Events support mouse, pen, one-finger pan and two-finger pinch. The
implementation must handle pointer capture, cancellation, a third pointer, and
window focus loss. Translation visibility is stored locally and defaults to
false on a fresh profile.

## Verification contract

Correctness gates scan the complete data and scene graph. Performance is tested
against a production build in a single Chromium worker. CPU is measured from
Chrome process cumulative CPU time; Linux memory uses PSS from
`/proc/<pid>/smaps_rollup`, with RSS as a higher-frequency approximation. Page
metrics, DOM counters and JS heap supplement those process-level measurements.

GitHub Actions is the authoritative build path. Local commands mirror its
steps, but do not replace the workflow evidence.
