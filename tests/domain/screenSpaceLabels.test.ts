import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
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
  portalRevealProgress,
  projectSceneRectToScreen,
  resolveInteractiveVocabularyFocusTarget,
  SceneViewport,
  setStylePropertyIfChanged,
  shouldResetLabelPlacementMemory,
  sceneUsesWheelPortalEntry,
  vocabularyActivationFocusPoint,
  WHEEL_ZOOM_SENSITIVITY,
  wheelZoomFactor,
} from "../../app/components/SceneViewport";
import {
  COMPACT_SCENE_LABEL_MOUNT_LIMIT,
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
  assert.match(source, /reconcileSceneAssetLoad\([\s\S]*camera,[\s\S]*devicePixelRatio,[\s\S]*allowHighTier/);
  assert.match(
    source,
    /const tileMatchesPortal\s*=\s*Boolean\([\s\S]*activePortal\?\.id\s*===\s*tile\.dataset\.portalId[\s\S]*activePortal\?\.childSceneId\s*===\s*tile\.dataset\.childScene/,
    "only a preview for the current portal and child scene can suppress the parent high-resolution raster",
  );
  assert.match(
    source,
    /const previewTileOwnsCrop\s*=\s*Boolean\([\s\S]*tile\.dataset\.state\s*===\s*"preview"[\s\S]*tile\.dataset\.direction\s*===\s*"forward"[\s\S]*portalProgress\s*>=\s*PORTAL_ARMED_PROGRESS[\s\S]*const activeHandoffOwnsCrop\s*=\s*Boolean\([\s\S]*tile\.dataset\.state\s*===\s*"active"[\s\S]*committingRef\.current[\s\S]*continuitySettlingRef\.current[\s\S]*const allowHighTier\s*=\s*!\([\s\S]*handoffTileOwnsCrop[\s\S]*reconcileSceneAssetForCamera\([\s\S]*allowHighTier/,
    "the parent keeps base art when a matching child preview covers the portal or owns an active handoff",
  );
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

test("dense scenes render a bounded initial word layer and retire it on departure", () => {
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
  const props = {
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
  };
  const markup = renderToStaticMarkup(createElement(SceneViewport, props));
  const mountedLabelCount = markup.match(/data-testid="word-label"/g)?.length ?? 0;
  assert.ok(mountedLabelCount > 0, "SSR keeps its genuinely painted labels");
  assert.ok(
    mountedLabelCount <= COMPACT_SCENE_LABEL_MOUNT_LIMIT,
    "SSR and hydration share one mobile-safe upper bound instead of all authored labels",
  );
  assert.match(markup, /data-testid="scene-word-progress"[^>]*data-total="220"/);

  const outgoing = renderToStaticMarkup(createElement(SceneViewport, { ...props, transitionPhase: "outgoing" }));
  assert.match(outgoing, /data-phase="outgoing"/);
  assert.doesNotMatch(outgoing, /data-testid="word-label"/, "the departing scene cannot contribute an old word button");
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

test("painted child art bounds round-trip through an aspect-ratio-mismatched portal", () => {
  const portal = { x: 1_500, y: 620, width: 200, height: 150 };
  const camera = { x: -2_410.5, y: -1_115.25, fit: 0.9, scale: 4.2 };
  const childSize = { width: 1_600, height: 900 };
  const viewportOrigin = { x: 0, y: 74 };
  const effectiveScale = camera.fit * camera.scale;
  const cover = Math.max(portal.width / childSize.width, portal.height / childSize.height);
  const coveredX = portal.x + (portal.width - childSize.width * cover) / 2;
  const coveredY = portal.y + (portal.height - childSize.height * cover) / 2;
  const recovered = cameraFromRenderedPortalRect(
    portal,
    {
      x: viewportOrigin.x + camera.x + coveredX * effectiveScale,
      y: viewportOrigin.y + camera.y + coveredY * effectiveScale,
      width: childSize.width * cover * effectiveScale,
      height: childSize.height * cover * effectiveScale,
    },
    viewportOrigin,
    camera.fit,
    childSize,
  );

  for (const key of ["x", "y", "fit", "scale"] as const) {
    assert.ok(Math.abs(recovered[key] - camera[key]) < 1e-10, `${key} survives child-art recovery`);
  }
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


test("detail-zone focus reaches the frame ref before its first camera sample", () => {
  const source = readFileSync(new URL("app/components/SceneViewport.tsx", ROOT), "utf8");
  const focusStart = source.indexOf("const focusSceneTarget = useCallback");
  const focusEnd = source.indexOf("useEffect(() => {", focusStart);
  const focus = source.slice(focusStart, focusEnd);
  assert.match(focus, /const focusedZone = scene\.detailZones\?\.find/);
  assert.match(
    focus,
    /focusedDetailZoneValueRef\.current = focusedZone \?\? null/,
    "a zone click cannot render one frame with the previous zone's label priority",
  );
});

test("screen-space labels reserve the compact minimap and persistent viewer controls", () => {
  const desktop = buildViewerChromeProtectedRegions(1280, 632);
  // The mini-map is a translucent 236x155 panel (globals.css .scene-minimap);
  // the reserved rectangle covers its measured rendered footprint.
  assert.ok(desktop.some((region) => (
    region.left === 0 && region.top === 0
    && region.right >= 250 && region.right < 280
    && region.bottom === 178
  )), "the compact scene minimap owns only its measured top-left rectangle");
  const folded = buildViewerChromeProtectedRegions(1280, 632, false, true);
  assert.ok(folded.some((region) => (
    region.left === 0 && region.top === 0
    && region.right >= 170 && region.right < 200
    && region.bottom <= 60
  )), "a folded mini-map reserves only its title pill");
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
