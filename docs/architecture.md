# HelloWords architecture decision

Status: accepted before product implementation

## Product contract

HelloWords is a calm, zoomable vocabulary world. It is not a quiz in its first
version. English labels are visible in the scene, Chinese meanings are off by
default, and zooming into or out of a portal changes scene slices without
exposing loading mechanics.

The product provides both:

- a branching set of illustrated, semantically natural scene chains; and
- a zoomable, searchable semantic universe containing exactly 10,000 ranked
  English display words with Chinese meanings.

The UI must distinguish natural scene anchors from atlas entries. It must not
  claim that every vocabulary entry has been hand-illustrated.

## Rendering decision

Each illustrated slice is an external image: premium JPEGs establish the four
broad places and lightweight SVG cutaways handle deeper levels. Artwork is
decorative; labels, portals, focus targets, and navigation are separate HTML
layers driven by typed scene data. This keeps the browser DOM independent of
SVG drawing complexity and makes translations and placement editable without
rewriting artwork.

Only the current scene is normally mounted. During a transition the current and
next surfaces may coexist briefly. The semantic universe uses one Canvas, a
spatial hash, viewport culling and zoom-dependent label budgets; ten thousand
vocabulary entries never become ten thousand DOM nodes.

The client is divided into four layers:

1. `domain`: camera, scene graph, portal hysteresis, vocabulary types;
2. `data`: lazy repositories, validation, source metadata, small caches;
3. `runtime`: explicit gesture/transition state and request cancellation;
4. `ui`: viewport, labels, controls, breadcrumbs, search and atlas.

High-frequency pointer input is accumulated in mutable camera state and applied
once per animation frame. React state is reserved for low-frequency changes
such as scene identity, preference changes, transition state, and selected
words. Scene labels use five continuous scale bands plus a spatially indexed
screen-space collision layout, so vocabulary fades in progressively instead of
appearing as whole DOM tiers. Dense local collisions receive stable nearby
callouts; only readable labels are interactive or keyboard-focusable.

## Scene and portal contract

Scene coordinates use a stable logical view box. Labels and portal geometry use
that coordinate space, not viewport pixels. A portal stores a child scene ID,
its focus rectangle, an entry camera, and a return camera mapping.

Default transition rules:

- enter after scale reaches `3.6`, the portal is near the viewport focus, and
  camera input has settled for at least 140 ms;
- return after scale falls below `0.82`;
- use a 250 ms transition cooldown and require fresh reverse input;
- decode the next SVG before the cross-fade;
- restore the exact saved parent camera when returning;
- honor reduced-motion preferences.

The cache holds the current scene, its parent, and at most one likely child.
Mounted scene surfaces are capped at two. A superseded load is aborted.

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
abbreviations, contractions and function words. The semantic universe makes
those relationships visible as four zoom levels: realms, topics, semantic
subclusters and individual words. It is sharded by topic and initially loads a
small, spatially balanced set of neighborhoods across all ten realms; viewport
movement and search request the rest on demand.

Scene encounters are recorded passively in local storage. Selecting a label
opens an optional word card and pronunciation action, but no exam is required.
The global translation preference controls ambient labels only: an intentionally
selected word always reveals its meaning without changing that preference.

## Accessibility and input

The decorative SVG has empty alternative text. Portals and visible labels use
native buttons with accessible names. The viewer provides keyboard pan, zoom,
fit, enter, and back controls, a scene breadcrumb, a polite scene-change live
region, and a non-spatial searchable list. Browser page zoom is never disabled.

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
