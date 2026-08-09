# HelloWords architecture decision

Status: accepted before product implementation

## Product contract

HelloWords is a calm, zoomable vocabulary world. It is not a quiz in its first
version. English labels are visible in the scene, Chinese meanings are off by
default, and zooming into or out of a portal changes scene slices without
exposing loading mechanics.

The first release must provide both:

- a small set of illustrated, semantically natural scene chains; and
- a searchable vocabulary atlas containing at least 10,000 ranked English
  display words with Chinese meanings.

The UI must distinguish natural scene anchors from atlas entries. It must not
  claim that every vocabulary entry has been hand-illustrated.

## Rendering decision

Each illustrated slice is an external SVG loaded as an image. The SVG is
decorative; labels, portals, focus targets, and navigation are separate HTML
layers driven by typed scene data. This keeps the browser DOM independent of
SVG drawing complexity and makes translations and placement editable without
rewriting artwork.

Only the current scene is normally mounted. During a transition the current and
next surfaces may coexist briefly. Ten thousand vocabulary entries are never
rendered at once; atlas results and scene labels are windowed.

The client is divided into four layers:

1. `domain`: camera, scene graph, portal hysteresis, vocabulary types;
2. `data`: lazy repositories, validation, source metadata, small caches;
3. `runtime`: explicit gesture/transition state and request cancellation;
4. `ui`: viewport, labels, controls, breadcrumbs, search and atlas.

High-frequency pointer input is accumulated in mutable camera state and applied
once per animation frame. React state is reserved for low-frequency changes
such as scene identity, preference changes, transition state, and selected
words.

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

The vocabulary atlas is sharded by rank band. Its manifest contains counts,
hashes and license metadata. Chinese data is loaded only when the user opens a
meaning or searches the atlas; it is not part of the initial scene bundle.

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

