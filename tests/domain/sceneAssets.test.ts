import assert from "node:assert/strict";
import test from "node:test";
import {
  createSceneAssetLoadState,
  maximumSceneCameraScale,
  reconcileSceneAssetLoad,
  resolveSceneAssets,
  retrySceneAssetPreload,
  sceneAssetPixelDemand,
  selectSceneAsset,
  settleSceneAssetPreload,
  validateSceneAssetContract,
  validateSceneAssetIntegrity,
  type Scene,
} from "../../app/domain";

const BASE_SHA256 = "a".repeat(64);
const HIGH_SHA256 = "b".repeat(64);

const legacyScene: Scene = {
  id: "legacy",
  title: "Legacy",
  subtitle: "One compatible raster",
  asset: "/scenes/legacy.jpg",
  width: 1_600,
  height: 900,
  labels: [],
  portals: [],
};

const enhancedScene: Scene = {
  ...legacyScene,
  id: "enhanced",
  asset: "/scenes/enhanced-base.jpg",
  assets: {
    base: {
      src: "/scenes/enhanced-base.jpg",
      width: 1_600,
      height: 900,
      sha256: BASE_SHA256,
    },
    high: {
      src: "/scenes/enhanced-high.jpg",
      width: 3_200,
      height: 1_800,
      sha256: HIGH_SHA256,
    },
  },
};

const megaScene: Scene = {
  ...legacyScene,
  id: "mega-atlas",
  asset: "/scenes/mega-atlas-overview.jpg",
  width: 5_016,
  height: 1_882,
  assets: {
    base: {
      src: "/scenes/mega-atlas-overview.jpg",
      width: 2_508,
      height: 941,
      sha256: BASE_SHA256,
    },
    high: {
      src: "/scenes/mega-atlas-full.jpg",
      width: 5_016,
      height: 1_882,
      sha256: HIGH_SHA256,
    },
  },
};

test("legacy scene JSON resolves unchanged to one base raster", () => {
  assert.deepEqual(validateSceneAssetContract(legacyScene), []);
  assert.deepEqual(resolveSceneAssets(legacyScene), [{
    tier: "base",
    src: legacyScene.asset,
    width: 1_600,
    height: 900,
    pixelRatio: 1,
  }]);
  assert.equal(
    selectSceneAsset(legacyScene, { fit: 1, scale: 4.15 }, 3).src,
    legacyScene.asset,
    "legacy scenes safely reuse their only candidate at every demand",
  );
});

test("base/high metadata locks source, dimensions, density, aspect and hashes", () => {
  assert.deepEqual(validateSceneAssetContract(enhancedScene), []);
  assert.deepEqual(
    resolveSceneAssets(enhancedScene).map(({ tier, pixelRatio }) => [tier, pixelRatio]),
    [["base", 1], ["high", 2]],
  );

  const invalid: Scene = {
    ...enhancedScene,
    assets: {
      base: { ...enhancedScene.assets!.base, src: "/scenes/wrong.jpg", sha256: "XYZ" },
      high: {
        ...enhancedScene.assets!.high!,
        src: "/scenes/wrong.jpg",
        width: 3_100,
        height: 1_600,
      },
    },
  };
  const codes = new Set(validateSceneAssetContract(invalid).map(({ code }) => code));
  assert.ok(codes.has("asset.invalid-sha256"));
  assert.ok(codes.has("asset.base-src-mismatch"));
  assert.ok(codes.has("asset.high-too-small"));
  assert.ok(codes.has("asset.high-density-too-low"));
  assert.ok(codes.has("asset.aspect-ratio-mismatch"));
  assert.ok(codes.has("asset.duplicate-src"));
});

test("a large logical canvas may use a half-density overview and swap to its full raster", () => {
  assert.deepEqual(validateSceneAssetContract(megaScene), []);
  assert.deepEqual(
    resolveSceneAssets(megaScene).map(({ tier, pixelRatio }) => [tier, pixelRatio]),
    [["base", 0.5], ["high", 1]],
  );
  assert.equal(selectSceneAsset(megaScene, { fit: 0.24, scale: 1 }, 2).tier, "base");
  assert.equal(selectSceneAsset(megaScene, { fit: 0.26, scale: 1 }, 2).tier, "high");

  const wrongAspect: Scene = {
    ...megaScene,
    assets: {
      ...megaScene.assets!,
      base: { ...megaScene.assets!.base, height: 940 },
    },
  };
  const underresolved: Scene = {
    ...megaScene,
    assets: {
      ...megaScene.assets!,
      base: { ...megaScene.assets!.base, width: 1_254, height: 470 },
    },
  };
  assert.ok(
    validateSceneAssetContract(wrongAspect).some(({ code }) => code === "asset.base-aspect-ratio-mismatch"),
  );
  assert.ok(
    validateSceneAssetContract(underresolved).some(({ code }) => code === "asset.base-density-too-low"),
  );
});

test("decoded dimensions and bytes must match each base/high descriptor", () => {
  const [base, high] = resolveSceneAssets(enhancedScene);
  assert.deepEqual(validateSceneAssetIntegrity(base, {
    width: 1_600,
    height: 900,
    sha256: BASE_SHA256,
  }), []);
  assert.deepEqual(validateSceneAssetIntegrity(high, {
    width: 3_200,
    height: 1_800,
    sha256: HIGH_SHA256,
  }), []);

  const codes = new Set(validateSceneAssetIntegrity(high, {
    width: 3_200,
    height: 1_700,
    sha256: BASE_SHA256,
  }).map(({ code }) => code));
  assert.ok(codes.has("asset.integrity-dimensions"));
  assert.ok(codes.has("asset.integrity-sha256"));
  assert.ok(validateSceneAssetIntegrity(high, {
    width: 3_200,
    height: 1_800,
    sha256: "UPPERCASE",
  }).some(({ code }) => code === "asset.integrity-invalid-sha256"));
});

test("camera fit, logical scale and DPR select the smallest sufficient raster", () => {
  assert.equal(sceneAssetPixelDemand({ fit: 0.9, scale: 1 }, 1), 0.9);
  assert.equal(selectSceneAsset(enhancedScene, { fit: 0.9, scale: 1 }, 1).tier, "base");
  assert.equal(selectSceneAsset(enhancedScene, { fit: 0.9, scale: 1 }, 2).tier, "high");
  assert.equal(selectSceneAsset(enhancedScene, { fit: 0.5, scale: 2 }, 1).tier, "base");
  assert.equal(selectSceneAsset(enhancedScene, { fit: 0.5, scale: 2.01 }, 1).tier, "high");
  assert.equal(
    selectSceneAsset(enhancedScene, { fit: 1, scale: 4.15 }, 3).tier,
    "high",
    "demand above every candidate clamps to the highest available tier",
  );
  const mobileAtlasFit = 390 / 1_600;
  const responsiveMaximum = maximumSceneCameraScale(mobileAtlasFit);
  assert.ok(Math.abs(sceneAssetPixelDemand({
    fit: mobileAtlasFit,
    scale: responsiveMaximum,
  }, 1) - 2) < 1e-12);
  assert.equal(
    selectSceneAsset(enhancedScene, {
      fit: mobileAtlasFit,
      scale: responsiveMaximum,
    }, 1).tier,
    "high",
    "narrow viewports reach the high raster's native effective detail before semantic overscroll",
  );
  assert.throws(() => sceneAssetPixelDemand({ fit: 0, scale: 1 }, 1), /camera\.fit/);
  assert.throws(() => sceneAssetPixelDemand({ fit: 1, scale: 1 }, Number.NaN), /devicePixelRatio/);
});

test("preload state keeps base active until high is decoded and ignores stale completion", () => {
  const initial = createSceneAssetLoadState();
  const requested = reconcileSceneAssetLoad(
    enhancedScene,
    initial,
    { fit: 0.9, scale: 1 },
    2,
  );
  assert.equal(requested.state.activeTier, "base");
  assert.equal(requested.state.desiredTier, "high");
  assert.equal(requested.state.preloadingTier, "high");
  assert.equal(requested.preloadAsset?.src, enhancedScene.assets!.high!.src);

  const duplicate = reconcileSceneAssetLoad(
    enhancedScene,
    requested.state,
    { fit: 0.9, scale: 1 },
    2,
  );
  assert.equal(duplicate.preloadAsset, undefined, "camera frames share one in-flight preload");

  const zoomedOut = reconcileSceneAssetLoad(
    enhancedScene,
    duplicate.state,
    { fit: 0.9, scale: 1 },
    1,
  );
  assert.equal(zoomedOut.state.activeTier, "base");
  assert.equal(zoomedOut.state.desiredTier, "base");
  assert.equal(zoomedOut.state.preloadingTier, "high");

  const staleCompletion = settleSceneAssetPreload(zoomedOut.state, "high", true);
  assert.equal(staleCompletion.activeTier, "base");
  assert.ok(staleCompletion.readyTiers.includes("high"));
  const reused = reconcileSceneAssetLoad(
    enhancedScene,
    staleCompletion,
    { fit: 0.9, scale: 1 },
    2,
  );
  assert.equal(reused.state.activeTier, "high");
  assert.equal(reused.preloadAsset, undefined, "a stale but decoded high raster is reused synchronously");
});

test("portal handoffs keep the covered parent on base art and restore normal high-tier selection afterward", () => {
  const initial = createSceneAssetLoadState();
  const deferred = reconcileSceneAssetLoad(
    enhancedScene,
    initial,
    { fit: 0.9, scale: 1 },
    2,
    false,
  );
  assert.equal(deferred.state.activeTier, "base");
  assert.equal(deferred.state.desiredTier, "base");
  assert.equal(deferred.state.preloadingTier, null);
  assert.equal(deferred.preloadAsset, undefined);
  assert.equal(
    selectSceneAsset(enhancedScene, { fit: 0.9, scale: 1 }, 2, false).tier,
    "base",
  );

  const normalZoom = reconcileSceneAssetLoad(
    enhancedScene,
    deferred.state,
    { fit: 0.9, scale: 1 },
    2,
  );
  assert.equal(normalZoom.state.desiredTier, "high");
  assert.equal(normalZoom.preloadAsset?.tier, "high");

  const pendingDuringHandoff = reconcileSceneAssetLoad(
    enhancedScene,
    normalZoom.state,
    { fit: 0.9, scale: 1 },
    2,
    false,
  );
  const lateDecode = settleSceneAssetPreload(pendingDuringHandoff.state, "high", true);
  assert.equal(lateDecode.activeTier, "base", "a late decode cannot replace covered parent art");

  const alreadyDecoded = settleSceneAssetPreload(normalZoom.state, "high", true);
  const handoff = reconcileSceneAssetLoad(
    enhancedScene,
    alreadyDecoded,
    { fit: 0.9, scale: 1 },
    2,
    false,
  );
  assert.equal(handoff.state.activeTier, "base");
  assert.equal(handoff.state.desiredTier, "base");
  assert.ok(handoff.state.readyTiers.includes("high"));
});

test("failed high preloads stay on base and retry only after an explicit request", () => {
  const request = reconcileSceneAssetLoad(
    enhancedScene,
    createSceneAssetLoadState(),
    { fit: 1, scale: 1.1 },
    1,
  );
  const failed = settleSceneAssetPreload(request.state, "high", false);
  assert.equal(failed.activeTier, "base");
  assert.equal(failed.preloadingTier, null);
  assert.ok(failed.failedTiers.includes("high"));

  const passiveFrame = reconcileSceneAssetLoad(
    enhancedScene,
    failed,
    { fit: 1, scale: 1.1 },
    1,
  );
  assert.equal(passiveFrame.preloadAsset, undefined, "failure cannot loop on every camera frame");

  const retry = retrySceneAssetPreload(enhancedScene, passiveFrame.state);
  assert.equal(retry.preloadAsset?.tier, "high");
  assert.equal(retry.state.preloadingTier, "high");
  const ready = settleSceneAssetPreload(retry.state, "high", true);
  assert.equal(ready.activeTier, "high");
  assert.deepEqual(ready.failedTiers, []);
});

test("a decoded high tier survives a safe base downgrade and is reused without another preload", () => {
  const requested = reconcileSceneAssetLoad(
    enhancedScene,
    createSceneAssetLoadState(),
    { fit: 0.8, scale: 1.4 },
    1,
  );
  assert.equal(requested.preloadAsset?.tier, "high");
  const decoded = settleSceneAssetPreload(requested.state, "high", true);
  assert.equal(decoded.activeTier, "high");

  const downgraded = reconcileSceneAssetLoad(
    enhancedScene,
    decoded,
    { fit: 0.8, scale: 1 },
    1,
  );
  assert.equal(downgraded.state.activeTier, "base");
  assert.ok(downgraded.state.readyTiers.includes("high"));

  const returned = reconcileSceneAssetLoad(
    enhancedScene,
    downgraded.state,
    { fit: 0.8, scale: 1.4 },
    1,
  );
  assert.equal(returned.state.activeTier, "high");
  assert.equal(returned.preloadAsset, undefined);
});
