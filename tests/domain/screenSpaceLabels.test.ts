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
  isExactForwardPortalTile,
  parentCameraFromChildTile,
  portalRevealProgress,
  projectScenePointToScreen,
  projectSceneRectToScreen,
  SceneViewport,
  setStylePropertyIfChanged,
  shouldResetLabelPlacementMemory,
  shouldWriteContinuousTileProgress,
  wheelZoomFactor,
} from "../../app/components/SceneViewport";
import {
  computeSceneLabelLayout,
  DEFAULT_PORTAL_HYSTERESIS_POLICY,
  type Label,
  type Scene,
} from "../../app/domain";

test("label placement memory persists only within one continuous zoom direction", () => {
  assert.equal(shouldResetLabelPlacementMemory(null, "in"), false);
  assert.equal(shouldResetLabelPlacementMemory("in", "in"), false);
  assert.equal(shouldResetLabelPlacementMemory("out", "out"), false);
  assert.equal(shouldResetLabelPlacementMemory("in", "out"), true);
  assert.equal(shouldResetLabelPlacementMemory("out", "in"), true);
  assert.equal(shouldResetLabelPlacementMemory("in", null), false);
});

const ROOT = new URL("../../", import.meta.url);

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
    /\[resetSemanticOverscroll, scene\.id\]/,
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

test("one ordinary wheel notch stays in a fitted child and the second requests its parent", () => {
  const oneNotch = wheelZoomFactor(120, 0, 826);
  assert.ok(oneNotch > DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale);
  assert.ok(oneNotch * oneNotch < DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale);
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

  const continuityStart = source.indexOf("if (continuityView)");
  const continuityEnd = source.indexOf("let resizeFrame", continuityStart);
  const continuity = source.slice(continuityStart, continuityEnd);
  assert.match(continuity, /const duration = continuityView\.direction === "back" \? 140 : 110/);
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
    /const duration = source === "zoom" \? 140 : readiness === "warm" \? 160 : 220/,
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
    && region.bottom >= 118 && region.bottom < 135
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
  assert.match(markup, /--label-semantic-surface:/);

  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const css = readFileSync(new URL("app/globals.css", ROOT), "utf8");
  const wordRule = css.match(/\.word-label\s*\{([\s\S]*?)\}/)?.[1];
  assert.ok(wordRule, "word-label CSS rule exists");
  assert.doesNotMatch(wordRule, /scale\s*\(/, "camera scale must never enter a word transform");
  assert.match(
    wordRule,
    /transform:\s*translate3d\(0px, 0px, 0\) translate\(-50%, -50%\)/,
  );
  const cameraFrameStart = source.indexOf("const applyCamera");
  const cameraFrameEnd = source.indexOf("const requestCameraFrame", cameraFrameStart);
  const cameraFrame = source.slice(cameraFrameStart, cameraFrameEnd);
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
  assert.match(markup, /class="word-anchor-marker"/, "every pill renders its exact object anchor");
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
