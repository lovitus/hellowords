import type {
  Scene,
  SceneAssetDescriptor,
  SceneAssetTier,
} from "./types";

export const SCENE_BASE_ASSET_MIN_WIDTH = 1_600;
export const SCENE_HIGH_ASSET_MIN_WIDTH = 3_200;
export const SCENE_BASE_ASSET_MIN_PIXEL_RATIO = 0.5;

const SHA256 = /^[a-f0-9]{64}$/u;

export interface SceneAssetContractIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface SceneAssetIntegrityProbe {
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

export interface ResolvedSceneAsset extends Omit<SceneAssetDescriptor, "sha256"> {
  readonly tier: SceneAssetTier;
  readonly sha256?: string;
  /** Physical source pixels available for each logical scene pixel. */
  readonly pixelRatio: number;
}

export interface SceneAssetLoadState {
  readonly activeTier: SceneAssetTier;
  readonly desiredTier: SceneAssetTier;
  readonly preloadingTier: SceneAssetTier | null;
  readonly readyTiers: readonly SceneAssetTier[];
  readonly failedTiers: readonly SceneAssetTier[];
}

export interface SceneAssetLoadTransition {
  readonly state: SceneAssetLoadState;
  /** Caller starts one decode/preload only when this is present. */
  readonly preloadAsset?: ResolvedSceneAsset;
}

export interface SceneAssetCamera {
  readonly fit: number;
  readonly scale: number;
}

function issue(
  issues: SceneAssetContractIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function descriptorIssues(
  value: unknown,
  path: string,
  issues: SceneAssetContractIssue[],
): value is SceneAssetDescriptor {
  if (!value || typeof value !== "object") {
    issue(issues, "asset.invalid-descriptor", path, "Asset descriptor must be an object");
    return false;
  }
  const descriptor = value as Partial<SceneAssetDescriptor>;
  if (typeof descriptor.src !== "string" || !descriptor.src.trim()) {
    issue(issues, "asset.empty-src", `${path}.src`, "Asset source cannot be empty");
  }
  for (const key of ["width", "height"] as const) {
    if (!Number.isInteger(descriptor[key]) || Number(descriptor[key]) <= 0) {
      issue(
        issues,
        "asset.invalid-dimensions",
        `${path}.${key}`,
        `Asset ${key} must be a positive integer`,
      );
    }
  }
  if (typeof descriptor.sha256 !== "string" || !SHA256.test(descriptor.sha256)) {
    issue(
      issues,
      "asset.invalid-sha256",
      `${path}.sha256`,
      "Asset SHA-256 must contain exactly 64 lowercase hexadecimal characters",
    );
  }
  // Cross-field checks still add useful diagnostics when one scalar (for
  // example the hash) is malformed, so object presence—not scalar validity—
  // controls whether those checks run.
  return true;
}

function hasPositiveDimensions(value: { readonly width: unknown; readonly height: unknown }): value is {
  readonly width: number;
  readonly height: number;
} {
  return Number.isInteger(value.width)
    && Number(value.width) > 0
    && Number.isInteger(value.height)
    && Number(value.height) > 0;
}

function hasMatchingAspectRatio(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number },
): boolean {
  return left.width * right.height === left.height * right.width;
}

/** Validates metadata without fetching bytes; the build validator verifies the actual hash and dimensions. */
export function validateSceneAssetContract(
  scene: Pick<Scene, "asset" | "width" | "height" | "assets" | "anchorAudit">,
): readonly SceneAssetContractIssue[] {
  if (scene.assets === undefined) return [];
  const issues: SceneAssetContractIssue[] = [];
  if (!scene.assets || typeof scene.assets !== "object") {
    issue(issues, "asset.invalid-set", "assets", "Scene assets must be an object");
    return issues;
  }

  const baseValid = descriptorIssues(scene.assets.base, "assets.base", issues);
  const highValid = scene.assets.high === undefined
    ? false
    : descriptorIssues(scene.assets.high, "assets.high", issues);
  if (baseValid) {
    const { base } = scene.assets;
    if (base.src !== scene.asset) {
      issue(issues, "asset.base-src-mismatch", "assets.base.src", "Base source must equal legacy scene.asset");
    }
    if (
      hasPositiveDimensions(base)
      && hasPositiveDimensions(scene)
      && !hasMatchingAspectRatio(base, scene)
    ) {
      issue(
        issues,
        "asset.base-aspect-ratio-mismatch",
        "assets.base",
        "Base raster must have the same aspect ratio as the logical scene",
      );
    }
    if (
      hasPositiveDimensions(base)
      && hasPositiveDimensions(scene)
      && (
        base.width / scene.width < SCENE_BASE_ASSET_MIN_PIXEL_RATIO
        || base.height / scene.height < SCENE_BASE_ASSET_MIN_PIXEL_RATIO
      )
    ) {
      issue(
        issues,
        "asset.base-density-too-low",
        "assets.base",
        `Base raster must provide at least ${SCENE_BASE_ASSET_MIN_PIXEL_RATIO} source pixels per logical scene pixel`,
      );
    }
    if (base.width < SCENE_BASE_ASSET_MIN_WIDTH) {
      issue(
        issues,
        "asset.base-too-small",
        "assets.base.width",
        `Base raster must be at least ${SCENE_BASE_ASSET_MIN_WIDTH}px wide`,
      );
    }
    if (
      scene.anchorAudit?.reviewedAssetSha256
      && base.sha256 !== scene.anchorAudit.reviewedAssetSha256
    ) {
      issue(
        issues,
        "asset.audit-sha256-mismatch",
        "assets.base.sha256",
        "Base descriptor hash must equal the reviewed anchor-audit hash",
      );
    }
  }
  if (baseValid && highValid && scene.assets.high) {
    const { base, high } = scene.assets;
    if (high.src === base.src) {
      issue(issues, "asset.duplicate-src", "assets.high.src", "High source must differ from base source");
    }
    if (high.width < SCENE_HIGH_ASSET_MIN_WIDTH) {
      issue(
        issues,
        "asset.high-too-small",
        "assets.high.width",
        `High raster must be at least ${SCENE_HIGH_ASSET_MIN_WIDTH}px wide`,
      );
    }
    if (high.width < base.width * 2 || high.height < base.height * 2) {
      issue(
        issues,
        "asset.high-density-too-low",
        "assets.high",
        "High raster must provide at least twice the base density on both axes",
      );
    }
    if (
      hasPositiveDimensions(base)
      && hasPositiveDimensions(high)
      && !hasMatchingAspectRatio(high, base)
    ) {
      issue(
        issues,
        "asset.aspect-ratio-mismatch",
        "assets.high",
        "High and base rasters must have the same aspect ratio",
      );
    }
  }
  return issues;
}

export function assertSceneAssetContract(
  scene: Pick<Scene, "asset" | "width" | "height" | "assets" | "anchorAudit">,
): void {
  const issues = validateSceneAssetContract(scene);
  if (!issues.length) return;
  throw new Error(issues.map(({ path, message }) => `${path}: ${message}`).join("; "));
}

/** Resolves legacy scenes to one base candidate and enhanced scenes to base/high candidates. */
export function resolveSceneAssets(
  scene: Pick<Scene, "asset" | "width" | "height" | "assets" | "anchorAudit">,
): readonly ResolvedSceneAsset[] {
  if (
    !Number.isFinite(scene.width)
    || !Number.isFinite(scene.height)
    || scene.width <= 0
    || scene.height <= 0
  ) {
    throw new RangeError("Logical scene dimensions must be finite and positive");
  }
  assertSceneAssetContract(scene);
  const reviewedSha256 = scene.anchorAudit?.reviewedAsset === scene.asset
    ? scene.anchorAudit.reviewedAssetSha256
    : undefined;
  const base = scene.assets?.base ?? {
    src: scene.asset,
    width: scene.width,
    height: scene.height,
    ...(reviewedSha256 ? { sha256: reviewedSha256 } : {}),
  };
  const resolved: ResolvedSceneAsset[] = [{
    tier: "base",
    ...base,
    pixelRatio: Math.min(base.width / scene.width, base.height / scene.height),
  }];
  if (scene.assets?.high) {
    resolved.push({
      tier: "high",
      ...scene.assets.high,
      pixelRatio: Math.min(
        scene.assets.high.width / scene.width,
        scene.assets.high.height / scene.height,
      ),
    });
  }
  return resolved;
}

/** Compares decoded/file metadata with the immutable descriptor. */
export function validateSceneAssetIntegrity(
  descriptor: Pick<ResolvedSceneAsset, "src" | "width" | "height" | "sha256">,
  actual: SceneAssetIntegrityProbe,
): readonly SceneAssetContractIssue[] {
  const issues: SceneAssetContractIssue[] = [];
  if (actual.width !== descriptor.width || actual.height !== descriptor.height) {
    issue(
      issues,
      "asset.integrity-dimensions",
      descriptor.src,
      `Decoded ${actual.width}x${actual.height}; expected ${descriptor.width}x${descriptor.height}`,
    );
  }
  if (!SHA256.test(actual.sha256)) {
    issue(
      issues,
      "asset.integrity-invalid-sha256",
      descriptor.src,
      "Computed SHA-256 is not a lowercase 64-character hexadecimal digest",
    );
  } else if (descriptor.sha256 && actual.sha256 !== descriptor.sha256) {
    issue(
      issues,
      "asset.integrity-sha256",
      descriptor.src,
      "Computed SHA-256 does not match the immutable descriptor",
    );
  }
  return issues;
}

export function assertSceneAssetIntegrity(
  descriptor: Pick<ResolvedSceneAsset, "src" | "width" | "height" | "sha256">,
  actual: SceneAssetIntegrityProbe,
): void {
  const issues = validateSceneAssetIntegrity(descriptor, actual);
  if (!issues.length) return;
  throw new Error(issues.map(({ message }) => `${descriptor.src}: ${message}`).join("; "));
}

export function sceneAssetPixelDemand(camera: SceneAssetCamera, devicePixelRatio: number): number {
  for (const [name, value] of [
    ["camera.fit", camera.fit],
    ["camera.scale", camera.scale],
    ["devicePixelRatio", devicePixelRatio],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  }
  const demand = camera.fit * camera.scale * devicePixelRatio;
  if (!Number.isFinite(demand)) throw new RangeError("Scene asset pixel demand must be finite");
  return demand;
}

/** Chooses the smallest sufficient raster, or pins the covered handoff to base art. */
export function selectSceneAsset(
  scene: Pick<Scene, "asset" | "width" | "height" | "assets" | "anchorAudit">,
  camera: SceneAssetCamera,
  devicePixelRatio: number,
  allowHighTier = true,
): ResolvedSceneAsset {
  const assets = resolveSceneAssets(scene);
  const demand = sceneAssetPixelDemand(camera, devicePixelRatio);
  const selected = assets.find(({ pixelRatio }) => pixelRatio >= demand) ?? assets.at(-1)!;
  return !allowHighTier && selected.tier === "high" ? assets[0]! : selected;
}

export function createSceneAssetLoadState(): SceneAssetLoadState {
  return {
    activeTier: "base",
    desiredTier: "base",
    preloadingTier: null,
    readyTiers: ["base"],
    failedTiers: [],
  };
}

function withTier(tiers: readonly SceneAssetTier[], tier: SceneAssetTier): readonly SceneAssetTier[] {
  return tiers.includes(tier) ? tiers : [...tiers, tier];
}

function withoutTier(tiers: readonly SceneAssetTier[], tier: SceneAssetTier): readonly SceneAssetTier[] {
  return tiers.filter((candidate) => candidate !== tier);
}

/** Reconciles camera demand and returns at most one new preload request. */
export function reconcileSceneAssetLoad(
  scene: Pick<Scene, "asset" | "width" | "height" | "assets" | "anchorAudit">,
  current: SceneAssetLoadState,
  camera: SceneAssetCamera,
  devicePixelRatio: number,
  allowHighTier = true,
): SceneAssetLoadTransition {
  const desired = selectSceneAsset(scene, camera, devicePixelRatio, allowHighTier);
  if (current.readyTiers.includes(desired.tier)) {
    return {
      state: {
        ...current,
        activeTier: desired.tier,
        desiredTier: desired.tier,
      },
    };
  }
  const shouldPreload = current.preloadingTier !== desired.tier
    && !current.failedTiers.includes(desired.tier);
  return {
    state: {
      ...current,
      desiredTier: desired.tier,
      preloadingTier: shouldPreload ? desired.tier : current.preloadingTier,
    },
    ...(shouldPreload ? { preloadAsset: desired } : {}),
  };
}

/** Commits decoded bytes only when that tier is still desired; stale preload completion stays warm. */
export function settleSceneAssetPreload(
  current: SceneAssetLoadState,
  tier: SceneAssetTier,
  succeeded: boolean,
): SceneAssetLoadState {
  if (!succeeded) {
    return {
      ...current,
      preloadingTier: current.preloadingTier === tier ? null : current.preloadingTier,
      failedTiers: withTier(current.failedTiers, tier),
    };
  }
  const readyTiers = withTier(current.readyTiers, tier);
  return {
    ...current,
    activeTier: current.desiredTier === tier ? tier : current.activeTier,
    preloadingTier: current.preloadingTier === tier ? null : current.preloadingTier,
    readyTiers,
    failedTiers: withoutTier(current.failedTiers, tier),
  };
}

/** Explicit retry keeps transient network errors from causing a preload loop on every camera frame. */
export function retrySceneAssetPreload(
  scene: Pick<Scene, "asset" | "width" | "height" | "assets" | "anchorAudit">,
  current: SceneAssetLoadState,
): SceneAssetLoadTransition {
  const desired = resolveSceneAssets(scene).find(({ tier }) => tier === current.desiredTier);
  if (!desired || current.readyTiers.includes(desired.tier) || current.preloadingTier === desired.tier) {
    return { state: current };
  }
  return {
    state: {
      ...current,
      preloadingTier: desired.tier,
      failedTiers: withoutTier(current.failedTiers, desired.tier),
    },
    preloadAsset: desired,
  };
}
