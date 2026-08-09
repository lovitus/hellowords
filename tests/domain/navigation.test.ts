import assert from "node:assert/strict";
import test from "node:test";
import {
  createParentCameraFrame,
  createPortalHysteresisState,
  reducePortalHysteresis,
  restoreParentCamera,
  type PortalHysteresisPolicy,
  type PortalHysteresisState,
  type PortalZoomSample,
} from "../../app/domain/navigation";

const policy: PortalHysteresisPolicy = {
  enterScale: 4,
  exitScale: 0.8,
  cooldownMs: 250,
  candidateSettleMs: 100,
};

function step(
  state: PortalHysteresisState,
  sample: Partial<PortalZoomSample> & Pick<PortalZoomSample, "now" | "scale">,
) {
  return reducePortalHysteresis(
    state,
    { direction: "none", hasParent: false, ...sample },
    policy,
  );
}

test("entry requires a stable portal candidate", () => {
  let result = step(createPortalHysteresisState(), {
    now: 0,
    scale: 4,
    direction: "in",
    candidatePortal: { id: "kitchen" },
  });
  assert.equal(result.transition, null);

  result = step(result.state, {
    now: 99,
    scale: 4.2,
    candidatePortal: { id: "kitchen" },
  });
  assert.equal(result.transition, null);

  result = step(result.state, {
    now: 100,
    scale: 4.2,
    candidatePortal: { id: "kitchen" },
  });
  assert.deepEqual(result.transition, { kind: "enter", portalId: "kitchen" });
});

test("candidate change resets settling time", () => {
  let result = step(createPortalHysteresisState(), {
    now: 0,
    scale: 5,
    direction: "in",
    candidatePortal: { id: "a" },
  });
  result = step(result.state, {
    now: 90,
    scale: 5,
    candidatePortal: { id: "b" },
  });
  result = step(result.state, {
    now: 101,
    scale: 5,
    candidatePortal: { id: "b" },
  });
  assert.equal(result.transition, null);
});

test("a stationary camera cannot create a fresh entry candidate", () => {
  let result = step(createPortalHysteresisState(), {
    now: 0,
    scale: 5,
    candidatePortal: { id: "child" },
  });
  result = step(result.state, {
    now: 500,
    scale: 5,
    candidatePortal: { id: "child" },
  });
  assert.equal(result.transition, null);
  assert.equal(result.state.candidatePortalId, null);
});

test("exit requires cooldown and reverse zoom input after entry", () => {
  let result = step(createPortalHysteresisState(), {
    now: 0,
    scale: 4,
    direction: "in",
    candidatePortal: { id: "child" },
  });
  result = step(result.state, {
    now: 100,
    scale: 4,
    candidatePortal: { id: "child" },
  });
  assert.equal(result.transition?.kind, "enter");

  result = step(result.state, {
    now: 200,
    scale: 0.7,
    direction: "out",
    hasParent: true,
  });
  assert.equal(result.transition, null, "cooldown blocks the exit");

  result = step(result.state, {
    now: 350,
    scale: 0.7,
    hasParent: true,
  });
  assert.deepEqual(result.transition, { kind: "exit" });
});

test("a stationary threshold cannot exit without a reverse input", () => {
  const entered: PortalHysteresisState = {
    ...createPortalHysteresisState(),
    lastSampleAt: 0,
    lastTransition: "enter",
    lastTransitionAt: 0,
  };
  const result = step(entered, {
    now: 300,
    scale: 0.7,
    hasParent: true,
  });
  assert.equal(result.transition, null);
});

test("an initially zoomed-out child does not exit without zoom-out input", () => {
  const result = step(createPortalHysteresisState(), {
    now: 300,
    scale: 0.7,
    hasParent: true,
  });
  assert.equal(result.transition, null);
});

test("a portal can override the default entry threshold", () => {
  let result = step(createPortalHysteresisState(), {
    now: 0,
    scale: 2.5,
    direction: "in",
    candidatePortal: { id: "close-up", enterScale: 2 },
  });
  result = step(result.state, {
    now: 100,
    scale: 2.5,
    candidatePortal: { id: "close-up", enterScale: 2 },
  });
  assert.equal(result.transition?.kind, "enter");
});

test("parent camera frame restores exactly and checks identity", () => {
  const camera = { x: -123.25, y: 42.5, scale: 3.75 };
  const frame = createParentCameraFrame(
    "apartment",
    { id: "kitchen-door", childSceneId: "kitchen" },
    camera,
  );
  const restored = restoreParentCamera(frame, {
    parentSceneId: "apartment",
    childSceneId: "kitchen",
    portalId: "kitchen-door",
  });
  assert.deepEqual(restored, camera);
  assert.notEqual(restored, frame.camera);
  assert.throws(
    () => restoreParentCamera(frame, { childSceneId: "bedroom" }),
    /child scene/,
  );
});

test("timestamps must be monotonic", () => {
  const state = step(createPortalHysteresisState(), {
    now: 10,
    scale: 1,
  }).state;
  assert.throws(() => step(state, { now: 9, scale: 1 }), /monotonic/);
});
