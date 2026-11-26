import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceParentExitHysteresis,
  createParentExitHysteresisState,
  createParentCameraFrame,
  createPortalHysteresisState,
  reducePortalHysteresis,
  restoreParentCamera,
  type PortalHysteresisPolicy,
  type PortalHysteresisState,
  type PortalZoomSample,
} from "../../app/domain/navigation";

test("one outward device stream can arm but cannot cross the parent boundary", () => {
  let state = createParentExitHysteresisState();
  for (const [now, scale] of [[0, 0.81], [24, 0.68], [48, 0.68], [72, 0.68]] as const) {
    const result = advanceParentExitHysteresis(state, {
      now,
      factor: 0.78,
      scale,
      hasParent: true,
      continuitySettled: true,
    });
    assert.equal(result.exitRequested, false);
    state = result.state;
  }
  assert.equal(state.armed, true);
});

test("a fresh outward gesture crosses the armed child overview boundary", () => {
  const armed = advanceParentExitHysteresis(createParentExitHysteresisState(), {
    now: 10,
    factor: 0.68,
    scale: 0.68,
    hasParent: true,
    continuitySettled: true,
  });
  assert.equal(armed.exitRequested, false, "the first gesture only reveals the full child overview");

  const sameGesture = advanceParentExitHysteresis(armed.state, {
    now: 189,
    factor: 0.9,
    scale: 0.68,
    hasParent: true,
    continuitySettled: true,
  });
  assert.equal(sameGesture.exitRequested, false);

  const freshGesture = advanceParentExitHysteresis(sameGesture.state, {
    now: 369,
    factor: 0.9,
    scale: 0.68,
    hasParent: true,
    continuitySettled: true,
  });
  assert.equal(freshGesture.exitRequested, true);
});

test("an outward gesture can reach the exit on a later sample only if it started armed", () => {
  const cases = [
    {
      name: "second gesture crosses on its third sample and requests exit once",
      samples: [[0, 0.80], [180, 0.77], [196, 0.73], [212, 0.70], [228, 0.68]],
      exits: [212],
    },
    {
      name: "one continuous gesture lasts longer than the quiet gap",
      samples: [[0, 0.81], [100, 0.76], [200, 0.69]],
      exits: [],
    },
    {
      name: "second gesture stops above the boundary and the third crosses it",
      samples: [[0, 0.80], [180, 0.78], [196, 0.75], [376, 0.72], [392, 0.69]],
      exits: [392],
    },
    {
      name: "reversing the second gesture requires a new overview gesture before exit",
      samples: [[0, 0.80], [180, 0.77], [196, 0.85], [212, 0.76], [228, 0.69], [408, 0.68]],
      exits: [408],
    },
  ] as const;

  for (const { name, samples, exits } of cases) {
    let state = createParentExitHysteresisState();
    let previousScale = 1;
    const exitTimes: number[] = [];
    for (const [now, scale] of samples) {
      const result = advanceParentExitHysteresis(state, {
        now,
        scale,
        factor: scale / previousScale,
        hasParent: true,
        continuitySettled: true,
      });
      if (result.exitRequested) exitTimes.push(now);
      state = result.state;
      previousScale = scale;
    }
    assert.deepEqual(exitTimes, exits, name);
  }
});

test("continuity and inward input clear parent-exit intent", () => {
  const armed = advanceParentExitHysteresis(createParentExitHysteresisState(), {
    now: 0,
    factor: 0.68,
    scale: 0.68,
    hasParent: true,
    continuitySettled: true,
  }).state;
  const duringSettle = advanceParentExitHysteresis(armed, {
    now: 200,
    factor: 0.68,
    scale: 0.68,
    hasParent: true,
    continuitySettled: false,
  });
  assert.deepEqual(duringSettle, {
    state: createParentExitHysteresisState(),
    exitRequested: false,
  });

  const reversed = advanceParentExitHysteresis(armed, {
    now: 200,
    factor: 1.2,
    scale: 0.9,
    hasParent: true,
    continuitySettled: true,
  });
  assert.deepEqual(reversed, {
    state: createParentExitHysteresisState(),
    exitRequested: false,
  });
});

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
