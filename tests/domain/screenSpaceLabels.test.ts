import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  advanceSemanticOverscroll,
  buildViewerChromeProtectedRegions,
  cameraFromRenderedPortalRect,
  childCameraFromPortalTile,
  clampCenteredOverlayShift,
  continuityViewForMotion,
  fittedSceneCamera,
  fullyFittedSceneCamera,
  includeSceneLabelMountTarget,
  isExactForwardPortalTile,
  parentCameraFromChildTile,
  portalIntersectsMinimap,
  portalRevealProgress,
  projectScenePointToScreen,
  projectSceneRectToScreen,
  resolveInteractiveVocabularyFocusTarget,
  SceneViewport,
  setStylePropertyIfChanged,
  shouldResetLabelPlacementMemory,
  sceneUsesWheelPortalEntry,
  shouldWriteContinuousTileProgress,
  vocabularyActivationFocusPoint,
  WHEEL_ZOOM_SENSITIVITY,
  wheelZoomFactor,
} from "../../app/components/SceneViewport";
import {
  COMPACT_SCENE_LABEL_MOUNT_LIMIT,
  computeSceneLabelLayout,
  DEFAULT_PORTAL_HYSTERESIS_POLICY,
  DESKTOP_SCENE_LABEL_MOUNT_LIMIT,
  type Label,
  type Scene,
} from "../../app/domain";

test("the root atlas requires an explicit portal click while child scenes keep wheel entry", () => {
  assert.equal(sceneUsesWheelPortalEntry("world-map"), false);
  assert.equal(sceneUsesWheelPortalEntry("city-street"), true);
  assert.equal(sceneUsesWheelPortalEntry("community-garden"), true);
});

test("an upper-left portal can escape the translucent minimap hit layer", () => {
  const fitted = fittedSceneCamera(
    { width: 1600, height: 900 },
    { width: 1280, height: 632 },
  );
  const insetPortal = {
    id: "oxygen",
    label: "Follow oxygen",
    childSceneId: "oxygen-molecule",
    x: 140,
    y: 45,
    width: 135,
    height: 105,
  };
  assert.equal(portalIntersectsMinimap(insetPortal, fitted, { width: 1280, height: 632 }), true);
  assert.equal(
    portalIntersectsMinimap(
      { ...insetPortal, x: 980, y: 520 },
      fitted,
      { width: 1280, height: 632 },
    ),
    false,
  );
});

const ROOT = new URL("../../", import.meta.url);

test("label placement memory persists only within one continuous zoom direction", () => {
  assert.equal(shouldResetLabelPlacementMemory(null, "in"), false);
  assert.equal(shouldResetLabelPlacementMemory("in", "in"), false);
  assert.equal(shouldResetLabelPlacementMemory("out", "out"), false);
  assert.equal(shouldResetLabelPlacementMemory("in", "out"), true);
  assert.equal(shouldResetLabelPlacementMemory("out", "in"), true);
  assert.equal(shouldResetLabelPlacementMemory("in", null), false);
});

test("keyboard vocabulary activation centers the exact word while pointer activation keeps the zone", () => {
  const nextLabel = { x: 812, y: 476 };
  const authoredZoneFocus = { x: 540, y: 320 };
  assert.deepEqual(
    vocabularyActivationFocusPoint(nextLabel, authoredZoneFocus, true),
    nextLabel,
  );
  assert.deepEqual(
    vocabularyActivationFocusPoint(nextLabel, authoredZoneFocus, false),
    authoredZoneFocus,
  );
  assert.deepEqual(
    vocabularyActivationFocusPoint(nextLabel, { x: Number.NaN, y: 300 }, false),
    { x: nextLabel.x, y: 300 },
  );

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const focusStart = source.indexOf("const focusVocabularyTarget");
  const focusEnd = source.indexOf("useEffect(() => {", focusStart);
  const focusSource = source.slice(focusStart, focusEnd);
  assert.match(
    focusSource,
    /vocabularyActivationFocusPoint\(\s*nextLabel,\s*\{ x: authoredFocusX, y: authoredFocusY \},\s*keyboardTriggered/,
    "the runtime preserves the keyboard-versus-pointer focus contract",
  );
});

test("an exact keyboard target joins only a window with spare bounded capacity", () => {
  const mounted = new Set(["first", "second"]);
  const included = includeSceneLabelMountTarget(mounted, "target", 3);
  assert.notStrictEqual(included, mounted);
  assert.deepEqual([...included], ["first", "second", "target"]);
  assert.strictEqual(includeSceneLabelMountTarget(included, "target", 3), included);

  for (const limit of [
    COMPACT_SCENE_LABEL_MOUNT_LIMIT,
    DESKTOP_SCENE_LABEL_MOUNT_LIMIT,
  ] as const) {
    const full = new Set(Array.from({ length: limit }, (_, index) => `full-${index}`));
    const bounded = includeSceneLabelMountTarget(full, "overflow-target", limit);
    assert.strictEqual(bounded, full, `a full ${limit}-node window is not republished`);
    assert.equal(bounded.size, limit);
    assert.equal(bounded.has("overflow-target"), false);
  }

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const focusStart = source.indexOf("const focusVocabularyTarget");
  const focusEnd = source.indexOf("useEffect(() => {", focusStart);
  const focusSource = source.slice(focusStart, focusEnd);
  assert.match(
    focusSource,
    /includeSceneLabelMountTarget\(\s*mountedLabelIdsRef\.current,\s*nextLabelId,\s*sceneLabelMountLimit[\s\S]*mountedLabelIdsRef\.current = nextMountedLabelIds;[\s\S]*setMountedLabelIds\(nextMountedLabelIds\);\s*pendingLabelWindowPaintRef\.current = true/,
    "keyboard activation pre-mounts its exact target only when the bounded window has capacity",
  );
  assert.doesNotMatch(
    focusSource,
    /setMountedLabelIds\(new Set\(mountedLabelIdsRef\.current\)\)/,
    "keyboard activation never forces a same-membership React publish",
  );
  assert.match(
    source,
    /labelElementsRef\.current\.set\(label\.id, element\);[\s\S]*label\.id === pendingKeyboardFocusLabelIdRef\.current[\s\S]*requestCameraFrame\(\)/,
    "the newly connected pending ref guarantees another interactive camera frame",
  );
  const labelRefStart = source.indexOf("labelElementsRef.current.set(label.id, element)");
  const labelRefEnd = source.indexOf("} else labelElementsRef.current.delete", labelRefStart);
  assert.doesNotMatch(
    source.slice(labelRefStart, labelRefEnd),
    /pendingLabelWindowPaintRef\.current = true/,
    "connecting an already-published target does not leave a synthetic paint flag",
  );
});

test("keyboard focus falls back honestly to the first interactive word in its promised batch", () => {
  const promised = ["blocked", "stable-second", "stable-third"];
  const layout = [
    { id: "stable-third", interactive: true },
    { id: "blocked", interactive: false },
    { id: "stable-second", interactive: true },
  ];
  assert.equal(
    resolveInteractiveVocabularyFocusTarget("blocked", promised, layout),
    "stable-second",
    "the promised batch order, not layout iteration order, selects the fallback",
  );
  assert.equal(
    resolveInteractiveVocabularyFocusTarget("stable-third", promised, layout),
    "stable-third",
    "an already-resolved interactive target stays locked",
  );
  assert.equal(
    resolveInteractiveVocabularyFocusTarget("blocked", promised, [
      { id: "blocked", interactive: false },
      { id: "stable-second", interactive: false },
    ]),
    null,
  );

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const applyStart = source.indexOf("const applyCamera");
  const mountStart = source.indexOf("const nextMountedLabelIds", applyStart);
  const resolution = source.slice(applyStart, mountStart);
  assert.match(
    resolution,
    /resolveInteractiveVocabularyFocusTarget\([\s\S]*pendingKeyboardFocusBatchLabelIdsRef\.current[\s\S]*pendingKeyboardFocusLabelIdRef\.current = resolvedKeyboardFocusLabelId/,
    "the complete final layout resolves a blocked promise before the bounded mount swap",
  );
  assert.match(
    source,
    /setDatasetValueIfChanged\(\s*contractElement,\s*"nextLabelId",\s*pendingKeyboardFocusLabelId[\s\S]*vocabularyAnnouncementRef\.current\.textContent[\s\S]*focusLabel\.focus\(\)/,
    "the observable next-word contract and exact announcement update before focus",
  );
});

test("selected label collision priority follows the controlled same-scene word card lifetime", () => {
  const viewport = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const app = readFileSync(new URL("app/components/WorldApp.tsx", ROOT), "utf8");

  assert.match(
    app,
    /scene=\{scene\}[\s\S]{0,220}selectedLabelId=\{selectedLabel\?\.id \?\? null\}/,
    "the active scene receives the current word card selection as controlled state",
  );
  assert.match(
    app,
    /scene=\{outgoingScene\}[\s\S]{0,220}selectedLabelId=\{null\}/,
    "an outgoing scene cannot retain selection priority",
  );
  assert.match(
    app,
    /className="word-dock-close"[\s\S]{0,160}onClick=\{\(\) => setSelectedLabel\(null\)\}/,
    "closing the word card clears the controlled selection without changing scenes",
  );

  const syncStart = viewport.indexOf("selectedLabelIdRef.current = selectedLabelId");
  const nextEffect = viewport.indexOf("useEffect(() => {", syncStart + 1);
  assert.ok(syncStart > 0 && nextEffect > syncStart);
  const selectionSync = viewport.slice(syncStart, nextEffect);
  assert.match(selectionSync, /: null;[\s\S]*requestCameraFrame\(\)/);
  assert.match(selectionSync, /\[labelsById, requestCameraFrame, selectedLabelId\]/);
});

function matchingDivClose(markup: string, openIndex: number): number {
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = openIndex;
  let depth = 0;
  for (let match = tags.exec(markup); match; match = tags.exec(markup)) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return tags.lastIndex;
  }
  throw new Error("scene surface has no matching closing div");
}

test("multi-resolution scenes server-render base and expose one atomic runtime tier contract", () => {
  const scene: Scene = {
    id: "asset-tier-contract",
    title: "Asset tiers",
    subtitle: "Base first, detail on demand",
    asset: "/scenes/asset-base.jpg",
    assets: {
      base: {
        src: "/scenes/asset-base.jpg",
        width: 1_600,
        height: 900,
        sha256: "a".repeat(64),
      },
      high: {
        src: "/scenes/asset-high.jpg",
        width: 3_200,
        height: 1_800,
        sha256: "b".repeat(64),
      },
    },
    width: 1_600,
    height: 900,
    labels: [],
    portals: [],
  };
  const markup = renderToStaticMarkup(createElement(SceneViewport, {
    scene,
    meaningVisible: false,
    portalTargetTitles: {},
    onCommitScene: () => "warm" as const,
    onEnterScene: async () => true,
    onExitScene: () => undefined,
    onLabelsEncountered: () => undefined,
    onLabelEncountered: () => undefined,
    onSelectWord: () => undefined,
    onPrefetchScene: () => undefined,
  }));
  assert.match(
    markup,
    /class="world-viewport"[^>]*--scene-backdrop-image:url\(\/scenes\/asset-base\.jpg\)[^>]*data-active-asset-tier="base"[^>]*data-active-asset-src="\/scenes\/asset-base\.jpg"[^>]*data-desired-asset-tier="base"/,
  );
  assert.match(
    markup,
    /class="scene-art"[^>]*src="\/scenes\/asset-base\.jpg"[^>]*data-asset-tier="base"/,
  );

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  assert.match(source, /reconcileSceneAssetLoad\([\s\S]*camera,[\s\S]*devicePixelRatio/);
  assert.match(source, /image\.decode\(\)[\s\S]*settleSceneAssetPreload/);
  assert.match(
    source,
    /decodedSceneAssetCache\.getOrLoad\(asset\.src,[\s\S]*cached\.status === "ready"[\s\S]*settleForCurrentScene\(true\)/,
    "a remounted scene synchronously consumes the page-level decoded high-tier cache",
  );
  assert.doesNotMatch(
    source,
    /decodedSceneAssetImagesRef|decodedImages\.clear\(\)/,
    "SceneViewport cleanup cannot discard a shared successful decode",
  );
  assert.match(
    source,
    /--scene-backdrop-image": `url\(\$\{activeSceneAsset\.src\}\)`[\s\S]*className="scene-art"[\s\S]*src=\{activeSceneAsset\.src\}/,
    "the blurred backdrop and primary art consume the same decoded tier",
  );
  assert.match(
    source,
    /className="scene-continuous-tile-art"[\s\S]{0,180}src=\{continuousTile\.scene\.asset\}/,
    "a portal preview stays on the child canonical asset and cannot trigger unrelated high-tier work",
  );
});

test("dense SSR starts from a compact bounded seed and wires low-frequency camera swaps", () => {
  const labels: Label[] = Array.from({ length: 220 }, (_, index) => ({
    id: `dense-${index}`,
    word: `word-${index}`,
    translation: `词-${index}`,
    x: 40 + (index % 20) * 42,
    y: 40 + Math.floor(index / 20) * 46,
    priority: index,
    minLevel: (index % 5) as 0 | 1 | 2 | 3 | 4,
  }));
  const scene: Scene = {
    id: "dense-ssr",
    title: "Dense SSR",
    subtitle: "Bounded buttons",
    asset: "/scenes/dense.jpg",
    width: 900,
    height: 600,
    labels,
    portals: [],
  };
  const markup = renderToStaticMarkup(createElement(SceneViewport, {
    scene,
    meaningVisible: false,
    portalTargetTitles: {},
    onCommitScene: () => "warm" as const,
    onEnterScene: async () => true,
    onExitScene: () => undefined,
    onLabelsEncountered: () => undefined,
    onLabelEncountered: () => undefined,
    onSelectWord: () => undefined,
    onPrefetchScene: () => undefined,
  }));
  const mountedLabelCount = markup.match(/data-testid="word-label"/g)?.length ?? 0;
  assert.ok(mountedLabelCount > 0, "SSR keeps its genuinely painted labels");
  assert.ok(
    mountedLabelCount <= COMPACT_SCENE_LABEL_MOUNT_LIMIT,
    "SSR and hydration share one mobile-safe upper bound instead of all authored labels",
  );
  assert.match(markup, /data-testid="scene-word-progress"[^>]*data-total="220"/);

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  assert.match(source, /buildSceneLabelMountWindow\([\s\S]*previousIds: mountedLabelIdsRef\.current/);
  assert.match(
    source,
    /scene\.labels\.filter\(\(label\) => \([\s\S]*?transitionPhase !== "outgoing" && mountedLabelIds\.has\(label\.id\)[\s\S]*?\)\)\.map/,
    "an inert outgoing layer retains no duplicate word-button DOM",
  );
  assert.match(
    source,
    /focusedLabelId: focusedLabelId \?\? pendingKeyboardFocusLabelId/,
    "a cue's exact keyboard target enters the bounded mount window first",
  );
  const labelLayoutSource = readFileSync(new URL("app/domain/labelLayout.ts", ROOT), "utf8");
  const mountWindowStart = labelLayoutSource.indexOf("export function buildSceneLabelMountWindow");
  const mountWindowEnd = labelLayoutSource.indexOf(
    "export function computeSceneLabelLayout",
    mountWindowStart,
  );
  assert.ok(mountWindowStart >= 0 && mountWindowEnd > mountWindowStart);
  const mountWindowSource = labelLayoutSource.slice(mountWindowStart, mountWindowEnd);
  assert.doesNotMatch(
    mountWindowSource,
    /const candidates = layout/,
    "a first render does not mount hidden candidates merely to fill its DOM ceiling",
  );
  assert.match(
    source,
    /pendingLabelWindowPaintRef\.current = true;[\s\S]*useLayoutEffect\(\(\) => \{[\s\S]*applyCamera\(\)/,
    "newly mounted buttons receive geometry synchronously after commit",
  );
  const applyCameraStart = source.indexOf("const applyCamera");
  const applyCameraEnd = source.indexOf("const requestCameraFrame", applyCameraStart);
  const focusCameraFrame = source.slice(applyCameraStart, applyCameraEnd);
  const pendingFocusQueueStart = focusCameraFrame.indexOf("const pendingKeyboardFocusLabel =");
  const pendingFocusQueueEnd = focusCameraFrame.indexOf(
    'setDatasetValueIfChanged(surface, "visibleLabelCount"',
    pendingFocusQueueStart,
  );
  assert.ok(pendingFocusQueueStart >= 0 && pendingFocusQueueEnd > pendingFocusQueueStart);
  const pendingFocusQueue = focusCameraFrame.slice(pendingFocusQueueStart, pendingFocusQueueEnd);
  assert.match(pendingFocusQueue, /queueMicrotask\(\(\) => \{/);
  assert.match(
    pendingFocusQueue,
    /pendingKeyboardFocusLabelIdRef\.current !== pendingKeyboardFocusLabelId[\s\S]*!viewerInteractiveRef\.current/,
  );
  assert.match(
    pendingFocusQueue,
    /!focusLabel\.isConnected[\s\S]*focusLabel\.dataset\.interactive !== "true"[\s\S]*focusLabel\.focus\(\)[\s\S]*pendingKeyboardFocusLabelIdRef\.current = null/,
    "the exact cue target retries after camera writes and focuses only while safely interactive",
  );
  assert.doesNotMatch(
    pendingFocusQueue,
    /setMountedLabelIds|setEncounterTick|setInteractionPositioned|setSceneAssetRuntime/,
    "post-camera focus cannot create a React render loop",
  );
  const synchronousPaintStart = source.indexOf("useLayoutEffect(() => {");
  const synchronousPaintEnd = source.indexOf("const requestCameraFrame", synchronousPaintStart);
  assert.match(
    source.slice(synchronousPaintStart, synchronousPaintEnd),
    /frameRef\.current !== null[\s\S]*cancelAnimationFrame\(frameRef\.current\)[\s\S]*frameRef\.current = null[\s\S]*applyCamera\(\)/,
    "a synchronous post-commit layout flush cancels its stale scheduled camera frame",
  );
});

test("camera frames skip redundant inline-style writes", () => {
  const values = new Map<string, string>();
  let writes = 0;
  const style: Pick<CSSStyleDeclaration, "getPropertyValue" | "setProperty"> = {
    getPropertyValue(property) {
      return values.get(property) ?? "";
    },
    setProperty(property, value) {
      writes += 1;
      values.set(property, value ?? "");
    },
  };

  assert.equal(setStylePropertyIfChanged(style, "left", "120.00px"), true);
  assert.equal(setStylePropertyIfChanged(style, "left", "120.00px"), false);
  assert.equal(setStylePropertyIfChanged(style, "left", "120.50px"), true);
  assert.equal(writes, 2, "a settled camera does not repeat the same DOM style mutation");
});

test("portal captions stay inside narrow viewports without moving centered cues", () => {
  assert.equal(clampCenteredOverlayShift(195, 180, 390), 0);
  assert.equal(clampCenteredOverlayShift(24, 180, 390), 78);
  assert.equal(clampCenteredOverlayShift(370, 180, 390), -82);
  assert.equal(clampCenteredOverlayShift(-40, 180, 390), 142);
  assert.equal(clampCenteredOverlayShift(24, 500, 100), 26);
});

test("continued zoom past the spatial maximum deliberately enters the semantic plane", () => {
  const first = advanceSemanticOverscroll(0, Math.exp(0.18), true, false);
  assert.equal(first.trigger, false);
  assert.ok(first.accumulated > 0.17);

  const second = advanceSemanticOverscroll(first.accumulated, Math.exp(0.15), true, false);
  assert.equal(second.trigger, true);
  assert.equal(second.accumulated, 0);

  const expired = advanceSemanticOverscroll(
    first.accumulated,
    Math.exp(0.15),
    true,
    false,
    10_000,
  );
  assert.equal(expired.trigger, false);
  assert.ok(
    Math.abs(expired.accumulated - 0.15) < 1e-12,
    "separate gestures cannot combine into a delayed semantic transition",
  );

  assert.deepEqual(
    advanceSemanticOverscroll(first.accumulated, Math.exp(0.3), true, true),
    { accumulated: 0, trigger: false },
    "a real child portal keeps ownership of the same zoom gesture",
  );
  assert.deepEqual(
    advanceSemanticOverscroll(first.accumulated, 0.8, true, false),
    { accumulated: 0, trigger: false },
    "zooming out resets semantic overscroll intent",
  );
  assert.deepEqual(
    advanceSemanticOverscroll(first.accumulated, Math.exp(0.3), false, false),
    { accumulated: 0, trigger: false },
    "ordinary spatial zoom cannot open the semantic plane early",
  );
});

test("semantic overscroll gives painted portal pixels ownership and resets with camera gestures", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const wheelStart = source.indexOf("const queueWheelZoom");
  const wheelEnd = source.indexOf("const focusVocabularyTarget", wheelStart);
  const wheelPath = source.slice(wheelStart, wheelEnd);
  const paintedPortal = wheelPath.indexOf(
    "portalAtScreenPoint(scene.portals, cameraRef.current, point)",
  );
  const targetPortal = wheelPath.indexOf("portalAtScreenPoint(scene.portals, base, point)");
  assert.ok(paintedPortal >= 0 && targetPortal > paintedPortal);

  const semanticStart = source.indexOf("const trySemanticOverscroll");
  const semanticEnd = source.indexOf("const zoomAt", semanticStart);
  const semanticPath = source.slice(semanticStart, semanticEnd);
  assert.match(
    semanticPath,
    /cameraRef\.current\.scale >= maximumSceneCameraScale\(cameraRef\.current\.fit\) - 0\.02/,
    "semantic overscroll waits for the viewport-responsive spatial ceiling",
  );
  assert.match(
    semanticPath,
    /updateZoomDirection\("in"\);[\s\S]*onExploreSemanticPlane\(nearest, "zoom"\)/,
    "semantic entry retains its inward direction so the first spatial zoom-out resets placement memory",
  );
  assert.match(semanticPath, /\[[^\]]*updateZoomDirection[^\]]*\]\);/);

  const resetStart = source.indexOf("const resetSemanticOverscroll");
  const cameraResetStart = source.indexOf("const resetCamera", resetStart);
  const cameraResetEnd = source.indexOf("const beginPortalTransition", cameraResetStart);
  const pointerStart = source.indexOf("const handlePointerDown", cameraResetEnd);
  const pointerEnd = source.indexOf("const viewportCenter", pointerStart);
  assert.match(source.slice(cameraResetStart, cameraResetEnd), /resetSemanticOverscroll\(\)/);
  assert.ok(
    (source.slice(pointerStart, pointerEnd).match(/resetSemanticOverscroll\(\)/g) ?? []).length >= 3,
    "pointer start, one-finger pan and pointer end each clear stale overscroll intent",
  );
  assert.match(
    source.slice(resetStart, cameraResetStart),
    /\[[^\]]*resetSemanticOverscroll[^\]]*scene\.id[^\]]*\]/,
    "scene ownership changes clear stale overscroll intent",
  );
});

test("painted portal geometry round-trips to the camera used for child handoff", () => {
  const portal = { x: 20, y: 170, width: 480, height: 650 };
  const camera = { x: -211.32, y: -1360.09, fit: 0.9, scale: 3.98 };
  const viewportOrigin = { x: 0, y: 74 };
  const projected = projectSceneRectToScreen(portal, camera);
  const recovered = cameraFromRenderedPortalRect(
    portal,
    {
      x: viewportOrigin.x + projected.x,
      y: viewportOrigin.y + projected.y,
      width: projected.width,
      height: projected.height,
    },
    viewportOrigin,
    camera.fit,
  );

  assert.ok(Math.abs(recovered.x - camera.x) < 1e-10);
  assert.ok(Math.abs(recovered.y - camera.y) < 1e-10);
  assert.ok(Math.abs(recovered.fit - camera.fit) < 1e-10);
  assert.ok(Math.abs(recovered.scale - camera.scale) < 1e-10);
});

test("painted handoff accepts only the exact forward tile for the committed portal", () => {
  const portal = { id: "enter-home", childSceneId: "apartment" };
  assert.equal(isExactForwardPortalTile({
    portalId: portal.id,
    childScene: portal.childSceneId,
    direction: "forward",
  }, portal), true);
  assert.equal(isExactForwardPortalTile({
    portalId: "enter-city",
    childScene: portal.childSceneId,
    direction: "forward",
  }, portal), false, "a stale tile from another portal cannot supply rendered geometry");
  assert.equal(isExactForwardPortalTile({
    portalId: portal.id,
    childScene: "city-street",
    direction: "forward",
  }, portal), false, "a stale child tile cannot supply rendered geometry");
  assert.equal(isExactForwardPortalTile({
    portalId: portal.id,
    childScene: portal.childSceneId,
    direction: "back",
  }, portal), false, "reverse continuity cannot be reused for a forward handoff");
  assert.equal(isExactForwardPortalTile(undefined, portal), false);
});

test("wheel impulses are normalized across pixel, line and page delta modes", () => {
  const lineImpulse = wheelZoomFactor(3, 1, 800);
  const equivalentPixelImpulse = wheelZoomFactor(48, 0, 800);
  assert.ok(Math.abs(lineImpulse - equivalentPixelImpulse) < 1e-12);
  assert.equal(wheelZoomFactor(10_000, 2, 800), wheelZoomFactor(240, 0, 800));
  assert.equal(wheelZoomFactor(-10_000, 2, 800), wheelZoomFactor(-240, 0, 800));
  assert.ok(lineImpulse > 0 && lineImpulse < 1);
});

test("three ordinary wheel events can cross the raw scale boundary and therefore need a gesture latch", () => {
  const oneNotch = wheelZoomFactor(120, 0, 826);
  assert.ok(oneNotch > DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale);
  assert.ok(oneNotch * oneNotch > DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale);
  assert.ok(oneNotch * oneNotch * oneNotch < DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale);
  assert.equal(WHEEL_ZOOM_SENSITIVITY, 0.00145);
  assert.equal(DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale, 0.7);
});

test("continuous zoom checks navigation on animation frames without a post-input dwell", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const schedulerStart = source.indexOf("const scheduleNavigationCheck");
  const wheelStart = source.indexOf("const queueWheelZoom");
  const wheelEnd = source.indexOf("const focusVocabularyTarget", wheelStart);
  const scheduler = source.slice(schedulerStart, wheelStart);
  const wheelPath = source.slice(wheelStart, wheelEnd);

  assert.ok(schedulerStart >= 0 && wheelStart > schedulerStart && wheelEnd > wheelStart);
  assert.match(scheduler, /requestAnimationFrame/);
  assert.doesNotMatch(scheduler, /setTimeout/, "navigation has no debounce after input stops");
  assert.match(wheelPath, /applyCamera\(\);\s*scheduleNavigationCheck\(\);/);
  assert.doesNotMatch(
    wheelPath,
    /\bset[A-Z][A-Za-z]+\(/,
    "the per-frame wheel loop writes refs/DOM without a React state update",
  );
});

test("the first positioned camera frame cannot rebuild and cancel continuity", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const applyStart = source.indexOf("const applyCamera");
  const frameStart = source.indexOf("const requestCameraFrame", applyStart);
  const applyPath = source.slice(applyStart, frameStart);
  const dependencies = applyPath.match(/\}, \[([^\]]+)\]\);\s*$/)?.[1];

  assert.ok(applyStart >= 0 && frameStart > applyStart);
  assert.ok(dependencies, "applyCamera exposes its dependency list");
  assert.match(source, /const \[interactionPositioned, setInteractionPositioned\] = useState\(false\)/);
  assert.match(source, /const interactionPositionedRef = useRef\(false\)/);
  assert.match(applyPath, /interactionPositionedRef\.current = true/);
  assert.match(applyPath, /setDatasetValueIfChanged\(interactionLayer, "positioned", "true"\)/);
  assert.match(applyPath, /setInteractionPositioned\(true\)/);
  assert.doesNotMatch(
    dependencies,
    /\binteractionPositioned\b/,
    "the readiness state must not rebuild applyCamera/resetCamera during handoff",
  );
});

test("camera initialization and the first ResizeObserver delivery cannot reset active zoom", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const effectStart = source.indexOf("useEffect(() => {", source.indexOf("if (continuousTile) requestCameraFrame"));
  const observerEnd = source.indexOf("}, [initialView", effectStart);
  const initialization = source.slice(effectStart, observerEnd);
  assert.ok(effectStart >= 0 && observerEnd > effectStart);
  assert.match(source, /const initializedSceneRef = useRef<string \| null>\(null\)/);
  assert.match(source, /const fittedViewportSizeRef = useRef/);
  assert.match(initialization, /if \(initializedSceneRef\.current !== scene\.id\)/);
  assert.match(initialization, /previousSize\?\.width === viewport\.clientWidth/);
  assert.match(initialization, /previousSize\.height === viewport\.clientHeight/);
  assert.match(initialization, /const cameraBusy = continuitySettlingRef\.current/);
  assert.match(initialization, /wheelAnimationRef\.current !== null/);
  assert.match(initialization, /resizeFrame = requestAnimationFrame\(reconcileViewportSize\)/);
  assert.ok(
    initialization.indexOf("if (cameraBusy)") < initialization.indexOf("resetCamera();", initialization.indexOf("if (cameraBusy)")),
    "a real resize is reconciled only after camera input settles",
  );
});

test("portal detail preparation overlaps the continuous camera animation before commit", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const transitionStart = source.indexOf("const beginPortalTransition");
  const transitionEnd = source.indexOf("const evaluateNavigation", transitionStart);
  const transition = source.slice(transitionStart, transitionEnd);
  assert.ok(transitionStart >= 0 && transitionEnd > transitionStart);
  assert.ok(transition.indexOf("requestContinuousTile(portal)") < transition.indexOf("const targetScale"));
  assert.ok(
    transition.lastIndexOf("enterPreparedScene();") > transition.indexOf("const animate"),
    "scene ownership moves only after the portal-cover animation finishes",
  );
  const finalPaint = transition.lastIndexOf("applyCamera();");
  const paintedSnapshot = transition.lastIndexOf("cameraFromRenderedPortalRect");
  const renderedCameraOwnership = transition.lastIndexOf("cameraRef.current = renderedCamera");
  const handoffReady = transition.lastIndexOf('setDatasetValueIfChanged(exactTile, "handoffReady", "true")');
  const finalCommit = transition.lastIndexOf("enterPreparedScene();");
  assert.ok(finalPaint > transition.indexOf("const animate"));
  assert.ok(paintedSnapshot > finalPaint);
  assert.ok(renderedCameraOwnership > paintedSnapshot);
  assert.ok(handoffReady > renderedCameraOwnership);
  assert.ok(finalCommit > handoffReady);
  assert.match(
    transition.slice(finalPaint, finalCommit),
    /requestAnimationFrame/,
    "the exact portal-cover frame is presented before child ownership commits",
  );
  assert.match(transition, /readiness === "warm"/);
});

test("portal reveal progress is clamped and monotonic while zooming forward", () => {
  const scales = [1, 2.59, 2.6, 2.72, 3.1, 3.6, 4.2];
  const progress = scales.map((scale) => portalRevealProgress(scale, 3.6));
  assert.deepEqual(progress.slice(0, 3), [0, 0, 0]);
  assert.equal(progress.at(-1), 1);
  for (let index = 1; index < progress.length; index += 1) {
    assert.ok(progress[index] >= progress[index - 1]);
  }

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const tileStart = source.indexOf("data-testid=\"scene-continuous-tile\"");
  const tileEnd = source.indexOf("</div>", tileStart);
  const tileMarkup = source.slice(tileStart, tileEnd);
  assert.match(tileMarkup, /data-progress=\{continuousTileDirection === "back" \? "1\.000" : undefined\}/);
  assert.match(tileMarkup, /"--tile-progress": continuousTileDirection === "back" \? "1\.000" : undefined/);
  assert.doesNotMatch(
    tileMarkup,
    /continuousTileDirection === "back" \? "1\.000" : "0\.000"/,
    "React must not own and reset forward progress after the ref initializes it",
  );
  assert.match(source, /const setContinuousTileNode = useCallback/);
  assert.match(source, /setDatasetValueIfChanged\(node, "progress", progressValue\)/);
  assert.match(source, /setStylePropertyIfChanged\(node\.style, "--tile-progress", progressValue\)/);
  assert.match(source, /const forwardTileProgressRef = useRef/);
  assert.match(source, /activePortal\?\.id === tilePortalId/);
  assert.match(source, /previous\?\.portalId === tilePortalId/);
  assert.match(source, /previous\.childSceneId === tileChildSceneId/);
  assert.match(source, /Math\.max\(sameTile \? previous\.value : 0, portalProgress\)/);
});

test("active forward continuity uses a fixed compositor tile and freezes outgoing overlays", () => {
  assert.equal(shouldWriteContinuousTileProgress("preview", "forward"), true);
  assert.equal(shouldWriteContinuousTileProgress("active", "forward"), false);
  assert.equal(shouldWriteContinuousTileProgress("active", "back"), true);

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const css = readFileSync(new URL("app/globals.css", ROOT), "utf8");
  const applyStart = source.indexOf("const applyCamera");
  const frameStart = source.indexOf("const requestCameraFrame", applyStart);
  const applyPath = source.slice(applyStart, frameStart);
  const frozenBranch = applyPath.indexOf("if (frameMotionFrozen)");
  const labelLayout = applyPath.indexOf("computeSceneLabelLayout");

  assert.ok(frozenBranch >= 0 && labelLayout > frozenBranch);
  assert.match(
    applyPath.slice(frozenBranch, labelLayout),
    /onCameraFrame\?\.\([\s\S]*?return;/,
    "the outgoing camera snapshot is published before overlay work is skipped",
  );
  assert.match(
    source,
    /const \[motionFrozen, setMotionFrozen\] = useState\(\s*Boolean\(effectiveInitialView && !reducedContinuityAtMount\)/,
  );
  assert.match(source, /committingRef\.current = true;\s*setMotionFrozen\(true\)/);
  assert.match(
    applyPath,
    /const imminentParentExit = Boolean\([\s\S]*?scene\.parentId[\s\S]*?zoomDirectionRef\.current === "out"[\s\S]*?wheelTargetRef\.current\?\.scale[\s\S]*?< EXIT_SCALE[\s\S]*?\);/,
  );
  assert.match(
    applyPath,
    /const frameMotionFrozen = committingRef\.current[\s\S]*?\|\| continuitySettlingRef\.current[\s\S]*?\|\| imminentParentExit;/,
  );
  assert.match(applyPath, /syncMotionFrozenLayer\(labelLayer, frameMotionFrozen\)/);
  assert.match(applyPath, /syncMotionFrozenLayer\(interactionLayer, frameMotionFrozen\)/);
  assert.match(source, /data-motion-frozen=\{String\(motionFrozen\)\}/);
  assert.match(source, /inert=\{motionFrozen \? true : undefined\}/);
  assert.match(css, /\.scene-continuous-tile\[data-state="active"\]\[data-direction="forward"\][\s\S]*?opacity: 1;/);
  assert.match(css, /\.scene-continuous-tile\[data-state="active"\]\[data-direction="back"\][\s\S]*?opacity: var\(--tile-progress\);/);
  assert.doesNotMatch(css, /will-change:\s*[^;]*border-radius/);
  assert.match(css, /\[data-motion-frozen="true"\][\s\S]*?opacity: 0;/);
  assert.match(
    css,
    /\[data-motion-frozen="true"\][\s\S]*?content-visibility: hidden;/,
    "inert continuity overlays defer descendant style work until their settled frame",
  );

  const continuityStart = source.indexOf("if (continuityView)");
  const continuityEnd = source.indexOf("let resizeFrame", continuityStart);
  const continuity = source.slice(continuityStart, continuityEnd);
  assert.match(continuity, /const duration = continuityView\.direction === "back" \? 105 : 80/);
  assert.match(source, /const HANDOFF_WHEEL_QUIET_MS = 180;/);
  assert.match(continuity, /quietUntil: now \+ HANDOFF_WHEEL_QUIET_MS/);
  assert.match(
    continuity,
    /continuitySettlingRef\.current = false;[\s\S]*?setMotionFrozen\(false\);[\s\S]*?requestCameraFrame\(\);/,
    "a settled child schedules one complete overlay layout frame",
  );
  const cancelStart = source.indexOf("const cancelCameraAnimation");
  const cancelEnd = source.indexOf("useEffect", cancelStart);
  const cancel = source.slice(cancelStart, cancelEnd);
  assert.match(cancel, /setMotionFrozen\(false\);\s*requestCameraFrame\(\);/);

  const portalTransitionStart = source.indexOf("const beginPortalTransition");
  const portalTransitionEnd = source.indexOf("const evaluateNavigation", portalTransitionStart);
  const portalTransition = source.slice(portalTransitionStart, portalTransitionEnd);
  assert.match(
    portalTransition,
    /const duration = source === "zoom" \? 110 : readiness === "warm" \? 150 : 170/,
  );
});

test("parent portal and child camera handoffs are exact inverses", () => {
  const portal = { x: 510, y: 600, width: 470, height: 285 };
  const parent = { x: -322.5, y: -417.25, fit: 0.8, scale: 4.6 };
  const parentSize = { width: 1600, height: 900 };
  const childSize = { width: 1600, height: 900 };
  const viewportSize = { width: 1280, height: 720 };
  const child = childCameraFromPortalTile(portal, parent, childSize, viewportSize);
  const restored = parentCameraFromChildTile(
    portal,
    child,
    parentSize,
    childSize,
    viewportSize,
  );
  for (const key of ["x", "y", "fit", "scale"] as const) {
    assert.ok(Math.abs(restored[key] - parent[key]) < 1e-9, `${key} survives the round trip`);
  }
});

test("reduced motion starts from one stable fitted frame without a reverse tile", () => {
  const sceneSize = { width: 1600, height: 900 };
  const desktop = fittedSceneCamera(sceneSize, { width: 1280, height: 720 });
  assert.deepEqual(desktop, { x: 0, y: 0, fit: 0.8, scale: 1 });
  const mobile = fittedSceneCamera(sceneSize, { width: 390, height: 780 });
  assert.equal(mobile.scale, 1.3);

  const tileScene: Scene = {
    id: "departing-child",
    title: "Child",
    subtitle: "Child",
    asset: "/child.jpg",
    width: 1600,
    height: 900,
    labels: [],
    portals: [],
  };
  const view = continuityViewForMotion({
    direction: "back",
    camera: { x: -900, y: -500, fit: 0.8, scale: 4 },
    settledCamera: desktop,
    tileScene,
    tilePortal: { id: "child", label: "Child", childSceneId: tileScene.id, x: 300, y: 200, width: 400, height: 260 },
  }, true);
  assert.deepEqual(view?.camera, desktop);
  assert.equal(view?.tileScene, undefined);
  assert.equal(view?.tilePortal, undefined);
});

test("continuity settlement contains the complete child scene on desktop and portrait viewports", () => {
  const scene = { x: 0, y: 0, width: 1600, height: 900 };
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 780 },
  ]) {
    const camera = fullyFittedSceneCamera(scene, viewport);
    const projected = projectSceneRectToScreen(scene, camera);
    assert.equal(camera.scale, 1);
    assert.ok(projected.x >= -1e-9 && projected.y >= -1e-9);
    assert.ok(projected.x + projected.width <= viewport.width + 1e-9);
    assert.ok(projected.y + projected.height <= viewport.height + 1e-9);
    assert.ok(
      Math.abs(projected.width - viewport.width) < 1e-9
      || Math.abs(projected.height - viewport.height) < 1e-9,
      "contain fit touches one viewport edge without cropping the child",
    );
  }
});

test("continuity owns the camera until the fitted child frame has settled", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const cancellationStart = source.indexOf("const cancelCameraAnimation");
  const resetStart = source.indexOf("const resetCamera", cancellationStart);
  const transitionStart = source.indexOf("const beginPortalTransition", resetStart);
  const zoomStart = source.indexOf("const zoomAt", transitionStart);
  const wheelStart = source.indexOf("const queueWheelZoom", zoomStart);
  const vocabularyStart = source.indexOf("const focusVocabularyTarget", wheelStart);
  const pointerStart = source.indexOf("const handlePointerDown", vocabularyStart);
  assert.ok(cancellationStart > 0 && resetStart > cancellationStart && pointerStart > vocabularyStart);
  const cancellation = source.slice(cancellationStart, resetStart);
  assert.match(cancellation, /continuitySettlingRef\.current = false/);
  assert.match(cancellation, /continuityProgressRef\.current = 0/);
  assert.match(cancellation, /setContinuousTile\(null\)/);
  for (const [name, start, end] of [
    ["reset", resetStart, transitionStart],
    ["new portal", transitionStart, zoomStart],
    ["vocabulary focus", vocabularyStart, pointerStart],
  ] as const) {
    assert.match(source.slice(start, end), /cancelCameraAnimation\(\)/, `${name} closes continuity`);
  }
  assert.match(source, /const viewerInteractive = transitionPhase === "active" && !interactionLocked && !motionFrozen/);
  assert.match(source.slice(zoomStart, wheelStart), /continuitySettlingRef\.current\) return;/);
  assert.match(source.slice(wheelStart, vocabularyStart), /continuitySettlingRef\.current\) return;/);
  assert.match(source.slice(pointerStart), /continuitySettlingRef\.current\) return;/);
});

test("screen-space labels reserve the compact minimap and persistent viewer controls", () => {
  const desktop = buildViewerChromeProtectedRegions(1280, 632);
  assert.ok(desktop.some((region) => (
    region.left === 0 && region.top === 0
    && region.right >= 400 && region.right < 430
    && region.bottom === 120
  )), "the compact scene minimap owns only its measured top-left rectangle");
  assert.ok(desktop.some((region) => (
    region.left < 640 && region.right > 640 && region.top === 0
  )), "the desktop vocabulary summary owns the top-center area");
  assert.ok(desktop.some((region) => (
    region.right === 1280 && region.bottom === 632
  )), "zoom controls own the bottom-right area");
  assert.ok(desktop.some((region) => (
    region.left === 0 && region.bottom === 632 && region.right >= 180
  )), "the back control owns the bottom-left area");

  const phone = buildViewerChromeProtectedRegions(390, 780);
  assert.ok(phone.some((region) => (
    region.left <= 12 && region.right >= 378 && region.top <= 636 && region.bottom >= 716
  )), "the mobile vocabulary summary owns its bottom HUD area");

  const withWordIndex = buildViewerChromeProtectedRegions(1280, 632, true);
  assert.equal(withWordIndex.length, desktop.length + 1);
  assert.ok(withWordIndex.some((region) => (
    region.right === 1268
      && region.left >= 900
      && region.top === 14
      && region.bottom <= 608
  )), "the open scene word index owns its measured right-side panel");
});

test("scene anchors project into screen coordinates while labels remain outside the scaled surface", () => {
  const detail: Label = {
    id: "grain",
    word: "grain",
    translation: "纹理",
    x: 120,
    y: 80,
    priority: 1,
    minLevel: 4,
  };
  const viewport = { width: 900, height: 600, compact: false };
  for (const scale of [2.55, 3] as const) {
    const camera = { x: 13, y: -9, fit: 0.75, scale };
    const [placed] = computeSceneLabelLayout([detail], camera, viewport, false);
    assert.equal(placed.screenX - placed.offsetX, camera.x + detail.x * camera.fit * scale);
    assert.equal(placed.screenY - placed.offsetY, camera.y + detail.y * camera.fit * scale);
    assert.deepEqual(projectScenePointToScreen(detail, camera), {
      x: camera.x + detail.x * camera.fit * scale,
      y: camera.y + detail.y * camera.fit * scale,
    });
    assert.deepEqual(
      projectSceneRectToScreen({ x: 40, y: 50, width: 160, height: 90 }, camera),
      {
        x: camera.x + 40 * camera.fit * scale,
        y: camera.y + 50 * camera.fit * scale,
        width: 160 * camera.fit * scale,
        height: 90 * camera.fit * scale,
      },
      "portal bounds use the same scene camera as the artwork",
    );
  }

  const scene: Scene = {
    id: "screen-space-contract",
    title: "Screen space",
    subtitle: "Crisp labels",
    asset: "/scene.svg",
    width: 900,
    height: 600,
    labels: [detail],
    portals: [{
      id: "enter-detail",
      label: "Enter detail",
      childSceneId: "detail",
      x: 40,
      y: 50,
      width: 160,
      height: 90,
    }],
  };
  const detailScene: Scene = {
    id: "detail",
    title: "Detail",
    subtitle: "Nested premium tile",
    asset: "/detail.jpg",
    width: 1600,
    height: 900,
    parentId: scene.id,
    labels: [],
    portals: [],
  };
  const markup = renderToStaticMarkup(createElement(SceneViewport, {
    scene,
    meaningVisible: false,
    portalTargetTitles: {},
    onCommitScene: () => "warm" as const,
    onEnterScene: async () => true,
    onExitScene: () => undefined,
    onLabelsEncountered: () => undefined,
    onLabelEncountered: () => undefined,
    onSelectWord: () => undefined,
    onPrefetchScene: () => undefined,
    initialView: {
      direction: "back" as const,
      camera: { x: -120, y: -80, fit: 0.8, scale: 2.4 },
      tileScene: detailScene,
      tilePortal: scene.portals[0],
    },
  }));
  const surfaceStart = markup.indexOf('<div class="scene-surface"');
  const layerStart = markup.indexOf('<div class="label-layer"');
  const interactionStart = markup.indexOf('<div class="scene-interaction-layer"');
  assert.ok(
    surfaceStart >= 0 && layerStart >= 0 && interactionStart >= 0,
    "artwork, labels and interaction cues render in distinct layers",
  );
  const surfaceClose = matchingDivClose(markup, surfaceStart);
  const surfaceMarkup = markup.slice(surfaceStart, surfaceClose);
  assert.match(
    surfaceMarkup,
    /class="scene-continuous-tile"[^>]*data-child-scene="detail"[^>]*data-portal-id="enter-detail"[^>]*data-state="active"[^>]*data-direction="back"[^>]*data-progress="1\.000"/,
    "the high-resolution child tile is clipped inside the scaled artwork surface",
  );
  assert.match(surfaceMarkup, /class="scene-continuous-tile-art"[^>]*src="\/detail\.jpg"/);
  assert.ok(
    interactionStart >= surfaceClose,
    "the interaction layer is a sibling after the scaled scene surface, never its descendant",
  );
  assert.equal(markup.slice(surfaceClose, interactionStart).trim(), "");
  const interactionClose = matchingDivClose(markup, interactionStart);
  assert.equal(markup.slice(interactionClose, layerStart).trim(), "");
  assert.ok(
    layerStart >= interactionClose,
    "portal and vocabulary controls precede every word in natural keyboard order",
  );
  assert.match(markup, /class="label-layer"[^>]*data-coordinate-space="screen"/);
  assert.match(markup, /class="scene-interaction-layer"[^>]*data-coordinate-space="screen"/);
  assert.match(markup, /data-semantic-group="visual-(?:whole|object|part|diagram)"/);
  assert.match(markup, /data-palette-index="\d+"/);
  const wordButtonMarkup = markup.match(/<button[^>]*class="word-label"[^>]*>/)?.[0] ?? "";
  assert.ok(wordButtonMarkup, "SSR contains one native word button");
  assert.match(wordButtonMarkup, /data-word="grain"/);
  assert.match(wordButtonMarkup, /data-lod="4"/);
  assert.doesNotMatch(
    wordButtonMarkup,
    /data-(?:priority|visual-region|min-level|anchor-mode|leader-span)=/,
    "word buttons omit redundant static and renderer-internal attributes",
  );
  assert.doesNotMatch(
    wordButtonMarkup,
    /aria-label=/,
    "the direct word text supplies the native button's accessible name",
  );
  assert.doesNotMatch(
    markup,
    /class="word-label"[^>]*style="[^"]*--label-semantic-/,
    "word buttons do not repeat the shared semantic palette as inline styles",
  );

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const css = readFileSync(new URL("app/globals.css", ROOT), "utf8");
  assert.doesNotMatch(
    source,
    /style=\{semanticStyle\?\.cssVariables/,
    "dense scene mounts select one of the static palette rules by data attribute",
  );
  assert.match(css, /\.word-label\[data-palette-index="0"\]\s*\{/);
  assert.match(css, /\.word-label\[data-palette-index="13"\]\s*\{/);
  const wordRule = css.match(/\.word-label\s*\{([\s\S]*?)\}/)?.[1];
  assert.ok(wordRule, "word-label CSS rule exists");
  assert.doesNotMatch(wordRule, /scale\s*\(/, "camera scale must never enter a word transform");
  assert.match(
    wordRule,
    /transform:\s*translate3d\(0px, 0px, 0\) translate\(-50%, -50%\)/,
  );
  assert.match(wordRule, /box-shadow:\s*0 4px 12px rgba\(27, 57, 52, 0\.12\);/);
  assert.match(
    wordRule,
    /transition:\s*opacity 90ms cubic-bezier\(0\.22, 0\.75, 0\.25, 1\);/,
  );
  assert.match(
    css,
    /\.word-label\[data-layout-shift="true"\]\s*\{[\s\S]*?transform 140ms cubic-bezier\(0\.22, 0\.75, 0\.25, 1\)/,
    "large collision corrections use a bounded transform transition",
  );
  assert.doesNotMatch(wordRule, /(?:border-color|box-shadow|background)\s+120ms/);
  const cameraFrameStart = source.indexOf("const applyCamera");
  const cameraFrameEnd = source.indexOf("const requestCameraFrame", cameraFrameStart);
  const cameraFrame = source.slice(cameraFrameStart, cameraFrameEnd);
  assert.match(
    source,
    /const labelShiftTimersRef = useRef\(new Map<string, number>\(\)\)/,
    "collision transitions use one bounded timer map instead of per-frame animation loops",
  );
  assert.match(
    cameraFrame,
    /const offsetShift = previousOffset[\s\S]*?if \(offsetShift >= 12\)/,
    "only material slot changes opt into the collision transition",
  );
  const firstCameraWrite = cameraFrame.indexOf("setStylePropertyIfChanged(");
  assert.ok(cameraFrame.indexOf("const viewportWidth = viewport.clientWidth") < firstCameraWrite);
  assert.ok(cameraFrame.indexOf("const viewportHeight = viewport.clientHeight") < firstCameraWrite);
  assert.doesNotMatch(
    cameraFrame.slice(firstCameraWrite),
    /viewport\.client(?:Width|Height)/,
    "camera frames must not force layout by reading viewport geometry after a style write",
  );
  assert.match(
    cameraFrame,
    /translate3d\(\$\{screenX\}px, \$\{screenY\}px, 0\) translate\(-50%, -50%\)/,
    "labels move with a native-size composited translation instead of layout properties",
  );
  assert.doesNotMatch(
    cameraFrame,
    /setStylePropertyIfChanged\(element\.style, "(?:left|top)"/,
    "camera frames do not reposition word labels through layout",
  );
  assert.match(
    source,
    /const labelElementsRef = useRef\(new Map<string, HTMLButtonElement>\(\)\)/,
    "dense scenes retain a stable id-to-node index instead of querying every label each frame",
  );
  assert.doesNotMatch(
    cameraFrame,
    /labelLayer\.querySelectorAll<HTMLButtonElement>\("\.word-label"\)/,
    "camera frames do not rebuild the dense label NodeList",
  );
  const hiddenGeometryGuard = cameraFrame.indexOf("(opacity > 0.025 || ownsFocus)");
  const labelTransformWrite = cameraFrame.indexOf(
    '`translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`',
  );
  assert.ok(
    hiddenGeometryGuard >= 0 && hiddenGeometryGuard < labelTransformWrite,
    "offscreen and collision-blocked labels skip unobservable geometry writes",
  );
  const anchorModeWrite = cameraFrame.indexOf(
    'setDatasetValueIfChanged(element, "anchorMode"',
  );
  const leaderSpanWrite = cameraFrame.indexOf(
    'setDatasetValueIfChanged(element, "leaderSpan"',
  );
  const visibleWrite = cameraFrame.indexOf('setDatasetValueIfChanged(element, "visible"');
  assert.ok(
    anchorModeWrite > labelTransformWrite
      && leaderSpanWrite > labelTransformWrite
      && visibleWrite > anchorModeWrite
      && visibleWrite > leaderSpanWrite,
    "a painted label receives live anchor metadata before its visibility gate opens",
  );
  assert.doesNotMatch(
    markup,
    /word-anchor-marker/,
    "the exact object anchor does not cost an extra DOM node per mounted word",
  );
  assert.doesNotMatch(
    markup,
    /word-label-text/,
    "the word itself stays a text node instead of costing one wrapper per mounted word",
  );
  assert.match(markup, /data-word="[^"]+"/, "the exact word remains available without a wrapper");
  assert.match(source, /data-word=\{label\.word\}[\s\S]*?>\s*\{label\.word\}/);
  assert.match(
    css,
    /\.word-label::before\s*\{[\s\S]*?width:\s*8px;[\s\S]*?rgba\(255, 252, 241, 0\.96\)[\s\S]*?var\(--label-semantic-dot\)[\s\S]*?0 0 0 2px rgba\(255, 255, 255, 0\.82\)[\s\S]*?0 0 9px 2px var\(--label-semantic-leader-fade\)[\s\S]*?content:\s*"";[\s\S]*?var\(--label-anchor-x\)[\s\S]*?var\(--label-anchor-y\)/,
    "the label pseudo-element renders the glossy semantic marker at the exact object anchor",
  );
  assert.match(
    css,
    /\.word-label\[data-displaced="true"\]::after\s*\{[\s\S]*?--label-leader-length/,
    "a displaced pill draws a screen-space leader back to that anchor",
  );
  assert.match(
    css,
    /\.word-label\[data-displaced="true"\]::after\s*\{[\s\S]*?rgba\(255, 255, 255, 0\.94\)[\s\S]*?var\(--label-semantic-leader\)/,
    "leaders combine a bright specular edge with their semantic color core",
  );
  assert.match(
    css,
    /\.word-label\[data-displaced="true"\]::after\s*\{[\s\S]*?box-shadow:\s*0 0 7px var\(--label-semantic-leader-fade\);/,
    "the leader uses one semantic glow without another white paint layer",
  );
  assert.match(
    css,
    /\.word-label\[data-interactive="true"\]:hover,[\s\S]*?\.word-label\[data-interactive="true"\]:focus-visible\s*\{[\s\S]*?box-shadow:\s*0 8px 22px rgba\(27, 57, 52, 0\.2\);/,
    "hover and focus use one immediate shadow while the global focus outline stays authoritative",
  );
  assert.match(css, /button:focus-visible,[\s\S]*?outline:\s*3px solid/);
  assert.match(
    css,
    /\.word-label\[data-leader-span="long"\]::after\s*\{[\s\S]*?opacity:\s*0\.92/,
    "long bounded fallbacks remain easy to track without dashed visual clutter",
  );

  const surfaceRule = css.match(/\.scene-surface\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const labelLayerRule = css.match(/\.label-layer\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const interactionLayerRule = css.match(/\.scene-interaction-layer\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const surfaceZ = Number(surfaceRule.match(/z-index:\s*(\d+)/)?.[1]);
  const labelZ = Number(labelLayerRule.match(/z-index:\s*(\d+)/)?.[1]);
  const interactionZ = Number(interactionLayerRule.match(/z-index:\s*(\d+)/)?.[1]);
  assert.ok(labelZ > surfaceZ, "labels stay above the artwork surface");
  assert.ok(interactionZ > labelZ, "portal and vocabulary cues always stack above words");

  const vocabularyCueRule = css.match(/\.vocabulary-zoom-cue\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const hotspotRule = css.match(/\.scene-hotspot\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const hotspotCaptionRule = css.match(/\.scene-hotspot-caption\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.doesNotMatch(vocabularyCueRule, /scale\s*\(/);
  assert.doesNotMatch(hotspotRule, /scale\s*\(/);
  assert.match(hotspotCaptionRule, /--portal-caption-shift-x/);
});
