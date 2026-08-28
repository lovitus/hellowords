import { assertCamera } from "./camera";
import type { Camera, Portal } from "./types";

export type ZoomDirection = "in" | "out" | "none";

export interface PortalHysteresisPolicy {
  readonly enterScale: number;
  readonly exitScale: number;
  readonly cooldownMs: number;
  readonly candidateSettleMs: number;
}

export const DEFAULT_PORTAL_HYSTERESIS_POLICY: PortalHysteresisPolicy = {
  enterScale: 3.6,
  // One ordinary wheel notch from a fitted desktop scene lands near 0.84.
  // Keep the first zoom-out gesture inside the child; a later deliberate
  // gesture crosses this threshold and returns to the parent.
  exitScale: 0.7,
  cooldownMs: 250,
  candidateSettleMs: 140,
};

export interface ParentExitHysteresisPolicy {
  /** First outward gesture must reach this overview band before exit can arm. */
  readonly armScale: number;
  /** A later, independent outward gesture must also cross this scale to exit. */
  readonly exitScale: number;
  /** Wheel/pinch samples closer than this belong to one physical gesture. */
  readonly gestureGapMs: number;
}

export const DEFAULT_PARENT_EXIT_HYSTERESIS_POLICY: ParentExitHysteresisPolicy = {
  armScale: 0.82,
  exitScale: DEFAULT_PORTAL_HYSTERESIS_POLICY.exitScale,
  gestureGapMs: 180,
};

export interface ParentExitHysteresisState {
  /** An earlier outward gesture reached the child overview band. */
  readonly armed: boolean;
  readonly lastOutwardInputAt: number | null;
}

export interface ParentExitZoomSample {
  readonly now: number;
  readonly factor: number;
  /** Target camera scale after applying this input sample. */
  readonly scale: number;
  readonly hasParent: boolean;
  /** False while a parent/child continuity camera still owns the viewport. */
  readonly continuitySettled: boolean;
}

export interface ParentExitHysteresisResult {
  readonly state: ParentExitHysteresisState;
  readonly exitRequested: boolean;
}

export function createParentExitHysteresisState(): ParentExitHysteresisState {
  return { armed: false, lastOutwardInputAt: null };
}

/**
 * Converts an event stream into a deliberate parent-exit gesture.
 *
 * Reaching the overview band only arms the boundary. It cannot exit during
 * that same wheel/pinch stream, no matter how many events the device emits.
 * A fresh outward gesture after a quiet gap must then cross the exit scale.
 */
export function advanceParentExitHysteresis(
  previous: ParentExitHysteresisState,
  sample: ParentExitZoomSample,
  policy: ParentExitHysteresisPolicy = DEFAULT_PARENT_EXIT_HYSTERESIS_POLICY,
): ParentExitHysteresisResult {
  assertParentExitPolicy(policy);
  assertParentExitSample(previous, sample);

  if (!sample.hasParent || !sample.continuitySettled || sample.factor >= 1) {
    return { state: createParentExitHysteresisState(), exitRequested: false };
  }

  const startsFreshGesture = previous.lastOutwardInputAt === null
    || sample.now - previous.lastOutwardInputAt >= policy.gestureGapMs;
  const exitRequested = previous.armed
    && startsFreshGesture
    && sample.scale <= policy.exitScale;
  const armed = !exitRequested && (previous.armed || sample.scale <= policy.armScale);

  return {
    state: {
      armed,
      lastOutwardInputAt: sample.now,
    },
    exitRequested,
  };
}

export interface PortalZoomSample {
  readonly now: number;
  readonly scale: number;
  readonly direction: ZoomDirection;
  /** Portal currently under the zoom focal point, if any. */
  readonly candidatePortal?: Pick<Portal, "id" | "enterScale">;
  readonly hasParent: boolean;
  readonly parentExitScale?: number;
}

export interface PortalHysteresisState {
  readonly lastSampleAt: number | null;
  readonly lastTransition: "enter" | "exit" | null;
  readonly lastTransitionAt: number | null;
  /** Opposite input observed since the last transition. */
  readonly reversalObserved: boolean;
  readonly candidatePortalId: string | null;
  readonly candidateSince: number | null;
}

export type PortalTransition =
  | { readonly kind: "enter"; readonly portalId: string }
  | { readonly kind: "exit" }
  | null;

export interface PortalHysteresisResult {
  readonly state: PortalHysteresisState;
  readonly transition: PortalTransition;
}

export function createPortalHysteresisState(): PortalHysteresisState {
  return {
    lastSampleAt: null,
    lastTransition: null,
    lastTransitionAt: null,
    reversalObserved: false,
    candidatePortalId: null,
    candidateSince: null,
  };
}

/**
 * Pure reducer for automatic scene entry/exit.
 *
 * A transition cannot occur during cooldown. After entering, an exit also
 * requires a new zoom-out input; after exiting, entry requires zoom-in. This
 * prevents a stationary camera at a threshold from bouncing between scenes.
 */
export function reducePortalHysteresis(
  previous: PortalHysteresisState,
  sample: PortalZoomSample,
  policy: PortalHysteresisPolicy = DEFAULT_PORTAL_HYSTERESIS_POLICY,
): PortalHysteresisResult {
  assertPolicy(policy);
  assertSample(previous, sample);

  const reversalObserved =
    previous.reversalObserved ||
    (previous.lastTransition === "enter" && sample.direction === "out") ||
    (previous.lastTransition === "exit" && sample.direction === "in");
  const cooldownElapsed =
    previous.lastTransitionAt === null ||
    sample.now - previous.lastTransitionAt >= policy.cooldownMs;

  let candidatePortalId = previous.candidatePortalId;
  let candidateSince = previous.candidateSince;
  const enterScale = sample.candidatePortal?.enterScale ?? policy.enterScale;
  const candidateAboveThreshold =
    sample.candidatePortal !== undefined &&
    sample.scale >= enterScale &&
    sample.direction !== "out";

  if (!candidateAboveThreshold) {
    candidatePortalId = null;
    candidateSince = null;
  } else if (candidatePortalId !== sample.candidatePortal.id) {
    // A stationary high zoom level must not manufacture an entry gesture.
    // Once zoom-in starts the candidate, idle samples may finish its dwell.
    if (sample.direction === "in") {
      candidatePortalId = sample.candidatePortal.id;
      candidateSince = sample.now;
    } else {
      candidatePortalId = null;
      candidateSince = null;
    }
  }

  const baseState: PortalHysteresisState = {
    ...previous,
    lastSampleAt: sample.now,
    reversalObserved,
    candidatePortalId,
    candidateSince,
  };

  if (!cooldownElapsed) return { state: baseState, transition: null };

  const exitScale = sample.parentExitScale ?? policy.exitScale;
  const exitAllowedByDirection =
    sample.direction === "out" ||
    (previous.lastTransition === "enter" && reversalObserved);
  if (
    sample.hasParent &&
    sample.scale <= exitScale &&
    sample.direction !== "in" &&
    exitAllowedByDirection
  ) {
    return transitionResult(baseState, sample.now, { kind: "exit" });
  }

  const entryAllowedByDirection =
    previous.lastTransition !== "exit" || reversalObserved;
  if (
    candidatePortalId !== null &&
    candidateSince !== null &&
    sample.now - candidateSince >= policy.candidateSettleMs &&
    entryAllowedByDirection
  ) {
    return transitionResult(baseState, sample.now, {
      kind: "enter",
      portalId: candidatePortalId,
    });
  }

  return { state: baseState, transition: null };
}

function transitionResult(
  state: PortalHysteresisState,
  now: number,
  transition: Exclude<PortalTransition, null>,
): PortalHysteresisResult {
  return {
    transition,
    state: {
      ...state,
      lastTransition: transition.kind,
      lastTransitionAt: now,
      reversalObserved: false,
      candidatePortalId: null,
      candidateSince: null,
    },
  };
}

function assertPolicy(policy: PortalHysteresisPolicy): void {
  if (!Number.isFinite(policy.enterScale) || policy.enterScale <= 0) {
    throw new RangeError("enterScale must be a positive finite number");
  }
  if (!Number.isFinite(policy.exitScale) || policy.exitScale <= 0) {
    throw new RangeError("exitScale must be a positive finite number");
  }
  if (policy.exitScale >= policy.enterScale) {
    throw new RangeError("exitScale must be lower than enterScale");
  }
  for (const [name, value] of [
    ["cooldownMs", policy.cooldownMs],
    ["candidateSettleMs", policy.candidateSettleMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number`);
    }
  }
}

function assertSample(
  previous: PortalHysteresisState,
  sample: PortalZoomSample,
): void {
  if (!Number.isFinite(sample.now) || sample.now < 0) {
    throw new RangeError("sample.now must be a non-negative finite number");
  }
  if (previous.lastSampleAt !== null && sample.now < previous.lastSampleAt) {
    throw new RangeError("sample timestamps must be monotonic");
  }
  if (!Number.isFinite(sample.scale) || sample.scale <= 0) {
    throw new RangeError("sample.scale must be a positive finite number");
  }
  if (
    sample.parentExitScale !== undefined &&
    (!Number.isFinite(sample.parentExitScale) || sample.parentExitScale <= 0)
  ) {
    throw new RangeError("parentExitScale must be a positive finite number");
  }
  if (
    sample.candidatePortal?.enterScale !== undefined &&
    (!Number.isFinite(sample.candidatePortal.enterScale) ||
      sample.candidatePortal.enterScale <= 0)
  ) {
    throw new RangeError("portal enterScale must be a positive finite number");
  }
}

function assertParentExitPolicy(policy: ParentExitHysteresisPolicy): void {
  if (!Number.isFinite(policy.armScale) || policy.armScale <= 0) {
    throw new RangeError("armScale must be a positive finite number");
  }
  if (!Number.isFinite(policy.exitScale) || policy.exitScale <= 0) {
    throw new RangeError("exitScale must be a positive finite number");
  }
  if (policy.exitScale >= policy.armScale) {
    throw new RangeError("exitScale must be lower than armScale");
  }
  if (!Number.isFinite(policy.gestureGapMs) || policy.gestureGapMs < 0) {
    throw new RangeError("gestureGapMs must be a non-negative finite number");
  }
}

function assertParentExitSample(
  previous: ParentExitHysteresisState,
  sample: ParentExitZoomSample,
): void {
  if (!Number.isFinite(sample.now) || sample.now < 0) {
    throw new RangeError("sample.now must be a non-negative finite number");
  }
  if (
    previous.lastOutwardInputAt !== null
    && sample.now < previous.lastOutwardInputAt
  ) {
    throw new RangeError("sample timestamps must be monotonic");
  }
  if (!Number.isFinite(sample.factor) || sample.factor <= 0) {
    throw new RangeError("sample.factor must be a positive finite number");
  }
  if (!Number.isFinite(sample.scale) || sample.scale <= 0) {
    throw new RangeError("sample.scale must be a positive finite number");
  }
}

/** Exact parent-camera bookmark; restoration does no floating point remapping. */
export interface ParentCameraFrame {
  readonly parentSceneId: string;
  readonly childSceneId: string;
  readonly portalId: string;
  readonly camera: Camera;
}

export function createParentCameraFrame(
  parentSceneId: string,
  portal: Pick<Portal, "id" | "childSceneId">,
  camera: Camera,
): ParentCameraFrame {
  if (!parentSceneId.trim()) throw new Error("parentSceneId cannot be empty");
  if (!portal.id.trim()) throw new Error("portal.id cannot be empty");
  if (!portal.childSceneId.trim()) {
    throw new Error("portal.childSceneId cannot be empty");
  }
  assertCamera(camera);
  return {
    parentSceneId,
    childSceneId: portal.childSceneId,
    portalId: portal.id,
    camera: { ...camera },
  };
}

export function restoreParentCamera(
  frame: ParentCameraFrame,
  expected?: {
    readonly parentSceneId?: string;
    readonly childSceneId?: string;
    readonly portalId?: string;
  },
): Camera {
  if (
    expected?.parentSceneId !== undefined &&
    expected.parentSceneId !== frame.parentSceneId
  ) {
    throw new Error("parent scene does not match camera frame");
  }
  if (
    expected?.childSceneId !== undefined &&
    expected.childSceneId !== frame.childSceneId
  ) {
    throw new Error("child scene does not match camera frame");
  }
  if (expected?.portalId !== undefined && expected.portalId !== frame.portalId) {
    throw new Error("portal does not match camera frame");
  }
  assertCamera(frame.camera);
  return { ...frame.camera };
}
