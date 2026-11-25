// From the installed product checkout:
// ./node_modules/.bin/tsx scripts/check-garden-slots.mjs --old /path/to/baseline.ts --new app/domain/labelPlacement.ts
// Optional readable inputs: --seed garden-geometry-replay.json --capture garden-0.json
// Optional full per-frame evidence: --output /private/path/report.json
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: Object.fromEntries(
  ["old", "new", "seed", "capture", "output"].map((key) => [key, { type: "string" }]),
) });
// Save startup errors and failed baseline assertions as evidence. The monitor
// leaves Node's normal uncaught-exception exit and stack reporting intact.
process.on("uncaughtExceptionMonitor", (error) => {
  if (args.output) writeFileSync(args.output, JSON.stringify({
    status: "error", pass: false, error: error.message, stack: error.stack,
  }, null, 2), { mode: 0o600 });
});
assert.ok(args.old && args.new, "--old and --new must name the placement modules");
const loadJson = (path) => JSON.parse(readFileSync(path, "utf8"));
async function loadModule(path) {
  const module = await import(pathToFileURL(resolve(path)).href);
  return { ...module.default, ...module };
}
const { buildViewerChromeProtectedRegions, fittedSceneCamera, projectSceneRectToScreen, wheelZoomFactor } =
  await loadModule("app/components/SceneViewport.tsx");
const { maximumSceneCameraScale, smoothCameraTowards, zoomCameraAboutPoint } = await loadModule("app/domain/camera.ts");
const { portalCueProtectedRegion } = await loadModule("app/domain/labelLayout.ts");
const baseline = (await loadModule(args.old)).computeScenePlacements;
const candidate = (await loadModule(args.new)).computeScenePlacements;
assert.equal(typeof baseline, "function");
assert.equal(typeof candidate, "function");

const digest = (object) => createHash("sha256").update(JSON.stringify(object)).digest("hex");
const scene = loadJson("public/data/scenes/community-garden.json");
const words = new Map(scene.labels.map((label) => [label.id, label]));
const viewport = { width: 1440, height: 826, compact: false };
const focus = { x: viewport.width / 2, y: viewport.height / 2 };
const initial = fittedSceneCamera(scene, viewport);
const maxScale = maximumSceneCameraScale(initial.fit);
const targets = [1.2, 1.65, 2.3, 3.12, maxScale];
const limit = 120;
const seedId = "seed-plug-pro-1";
const captureSha = "6c8ae1d2db672310ec4cd35321ca423512a5266c";
const hashes = {
  priorInput: "88cbcb3cbcbdf63dc8cb00ef554f17938378eddff867a08bbd76ca65579c3b45",
  input: "a0cad097bb662135f215d64ffd3a113182df154a42900be40c125e881e8eb456",
  currentVisible: "506ec4cf93f214df5b13f7367b0d8ac1e042c23e35aa072f0aba25c4404db7f1",
};

function regionsAt(camera) {
  const names = ["minimap", "top-center", "top-right", "bottom-right", "bottom-left"];
  const regions = buildViewerChromeProtectedRegions(viewport.width, viewport.height)
    .map((rect, i) => ({ id: names[i], ...rect }));
  for (const portal of scene.portals) {
    const bounds = projectSceneRectToScreen(portal, camera);
    const x = (Math.round(bounds.x) + Math.round(bounds.x + bounds.width)) / 2;
    const y = (Math.round(bounds.y) + Math.round(bounds.y + bounds.height)) / 2;
    const rect = portalCueProtectedRegion(x, y, viewport);
    if (rect) regions.push({ id: portal.id, ...rect });
  }
  return regions;
}
function offsets(items) {
  return items.filter((item) => item.interactive).map(({ id, offsetX, offsetY }) => [id, { offsetX, offsetY }]);
}
function inputAt(camera, previous) {
  return { camera, protectedRegions: regionsAt(camera), preferredOffsets: previous && offsets(previous) };
}
function layout(engine, input) {
  return engine(scene.labels, input.camera, viewport, false, {
    protectedRegions: input.protectedRegions,
    preferredOffsets: input.preferredOffsets && new Map(input.preferredOffsets),
  });
}
const readable = (items) => new Map(items.filter((i) => i.interactive && i.opacity >= 0.52).map((i) => [i.id, i]));
const difference = (a, b) => [...a.keys()].filter((id) => !b.has(id));
const jumpBetween = (a, b) => a && b ? Math.hypot(b.offsetX - a.offsetX, b.offsetY - a.offsetY) : null;

function crosses(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}
function overlaps(a, b, gap) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}
function inside(p, r, gap) {
  return p.x >= r.left - gap && p.x <= r.right + gap && p.y >= r.top - gap && p.y <= r.bottom + gap;
}
function cutsPill(a, b, rect) {
  if (inside(a, rect, 0) || inside(b, rect, 0)) return true;
  const corners = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }];
  return corners.some((corner, i) => crosses(a, b, corner, corners[(i + 1) % 4]));
}
function placementConflicts(old, current, input) {
  const scale = input.camera.fit * input.camera.scale;
  const shapes = [...current.values()].map((item) => {
    const previous = old.get(item.id), word = words.get(item.id);
    return { id: item.id, changed: !previous || previous.screenX !== item.screenX || previous.screenY !== item.screenY
        || previous.width !== item.width || previous.height !== item.height,
      anchor: { x: input.camera.x + word.x * scale, y: input.camera.y + word.y * scale },
      center: { x: item.screenX, y: item.screenY },
      rect: { left: item.screenX - item.width / 2, top: item.screenY - item.height / 2,
        right: item.screenX + item.width / 2, bottom: item.screenY + item.height / 2 } };
  });
  const conflicts = [];
  for (let i = 0; i < shapes.length; i++) {
    const a = shapes[i];
    if (!a.changed) continue;
    if (a.rect.left < 4 || a.rect.right > viewport.width - 4 || a.rect.top < 4 || a.rect.bottom > viewport.height - 4
        || input.protectedRegions.some((r) => overlaps(a.rect, r, 0))) conflicts.push([a.id, "viewport/control"]);
    for (let j = 0; j < shapes.length; j++) {
      const b = shapes[j];
      if (i === j || (b.changed && j < i)) continue;
      if (overlaps(a.rect, b.rect, 3) || inside(a.anchor, b.rect, 3) || inside(b.anchor, a.rect, 3)
          || crosses(a.anchor, a.center, b.anchor, b.center) || cutsPill(a.anchor, a.center, b.rect)
          || cutsPill(b.anchor, b.center, a.rect)) conflicts.push([a.id, b.id]);
    }
  }
  return conflicts;
}

// Same unclamped centered wheel path and polling cadence as the hosted 1f8faab probe.
// Camera is shared. Each version carries only its own placements into its next frame.
function* cameras(hz, inputMs) {
  yield initial;
  let camera = initial, target = null, targetIndex = 0, nextEvent = 0, lastFrame = null;
  const step = 1000 / hz;
  for (let now = step; now < 8000; now += step) {
    if (now >= nextEvent && targetIndex < targets.length) {
      const scale = Number(camera.scale.toFixed(3));
      const goal = targets[targetIndex];
      if (scale < goal * 0.998) {
        const deltaY = -Math.log(Math.min(1.12, goal / scale)) / 0.00145;
        const base = target ?? camera;
        const nextScale = Math.min(maxScale, base.scale * wheelZoomFactor(deltaY, 0, viewport.height));
        target = { ...zoomCameraAboutPoint(base, nextScale, focus), fit: base.fit };
      }
      if (scale >= goal * 0.995) targetIndex += 1;
      nextEvent += inputMs;
    }
    if (!target) {
      if (targetIndex === targets.length) break;
      continue;
    }
    const smoothed = smoothCameraTowards(camera, target, lastFrame === null ? 16 : now - lastFrame, 52);
    const settled = Math.abs(smoothed.x - target.x) <= 0.08 && Math.abs(smoothed.y - target.y) <= 0.08
      && Math.abs(Math.log(smoothed.scale / target.scale)) <= 0.00045;
    camera = settled ? target : { ...smoothed, fit: target.fit };
    if (settled) target = null;
    lastFrame = settled ? null : now;
    yield camera;
  }
  assert.ok(targetIndex === targets.length && camera.scale >= maxScale - 0.02, `unfinished path ${hz}/${inputMs}`);
}

function moves(previous, current, camera) {
  let maximum = 0;
  const over = [];
  for (const [id, item] of current) {
    const old = previous.get(id);
    if (!old) continue;
    const word = words.get(id);
    const scale = camera.fit * camera.scale;
    const x = camera.x + word.x * scale, y = camera.y + word.y * scale;
    if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) continue;
    const pixels = jumpBetween(old, item);
    maximum = Math.max(maximum, pixels);
    if (pixels > limit) over.push({ id, pixels });
  }
  return { maximum, over };
}
const targetIds = ["greenhouse", "rake", seedId];
let generatedSeed;
function runSchedule(hz, inputMs) {
  let oldItems, newItems, priorInput;
  let oldVisible = new Map(), newVisible = new Map();
  const frames = [];
  let oldMaximum = 0, newMaximum = 0, lostPairs = 0, gainedPairs = 0, collisionCount = 0;
  const targetsDropped = [];
  for (const camera of cameras(hz, inputMs)) {
    const frame = frames.length;
    const oldInput = inputAt(camera, oldItems);
    oldItems = layout(baseline, oldInput);
    newItems = layout(candidate, inputAt(camera, newItems));
    const a = readable(oldItems), b = readable(newItems);
    const oldMoves = moves(oldVisible, a, camera), newMoves = moves(newVisible, b, camera);
    for (const { id } of oldMoves.over) {
      if (!newVisible.has(id) || !b.has(id)) targetsDropped.push({ frame, id });
    }
    const lost = difference(a, b), gained = difference(b, a);
    const conflicts = placementConflicts(a, b, oldInput);
    collisionCount += conflicts.length;
    frames.push({ frame, scale: camera.scale, old: oldMoves, candidate: newMoves, conflicts,
      visible: { old: a.size, candidate: b.size, lost, gained },
      targets: Object.fromEntries(targetIds.map((id) => [id, [a.has(id), b.has(id)]])) });
    oldMaximum = Math.max(oldMaximum, oldMoves.maximum);
    newMaximum = Math.max(newMaximum, newMoves.maximum);
    lostPairs += lost.length;
    gainedPairs += gained.length;
    if (hz === 90 && inputMs === 68 && frame === 37) {
      generatedSeed = { priorInput, input: oldInput, currentVisible: [...a.values()] };
    }
    oldVisible = a; newVisible = b; priorInput = oldInput;
  }
  return { hz, inputMs, summary: { frames: frames.length - 1, oldMaximum, newMaximum,
    oldOver: frames.flatMap((f) => f.old.over).length, newOver: frames.flatMap((f) => f.candidate.over).length,
    lostWordFrames: lostPairs, gainedWordFrames: gainedPairs, collisionCount, targetsDropped }, frames };
}

// Give both engines exactly the baseline history, isolating the decision on this frame.
function compareFixed(id, priorInput, input) {
  const oldPrior = readable(layout(baseline, priorInput));
  const oldNow = readable(layout(baseline, input));
  const newNow = readable(layout(candidate, input));
  const oldJump = jumpBetween(oldPrior.get(id), oldNow.get(id));
  const newJump = jumpBetween(oldPrior.get(id), newNow.get(id));
  const lost = difference(oldNow, newNow), gained = difference(newNow, oldNow);
  const conflicts = placementConflicts(oldNow, newNow, input);
  return { id, oldJump, newJump, targetVisible: newNow.has(id), oldVisible: oldNow.size, newVisible: newNow.size,
    lost, gained, conflicts,
    geometryPass: oldJump > limit && newJump !== null && newJump <= limit && newJump < oldJump && !conflicts.length };
}

// CSS transform strings rounded both the scale and the translation. The canvas
// retained unrounded anchor coordinates. Recover the camera from two distant anchors.
function capturedItems(frame) {
  return frame.labels.filter((l) => l.interactive && l.opacity >= 0.52).map((l) => ({
    ...l, screenX: l.centerX, screenY: l.centerY, offsetX: l.centerX - l.anchorX, offsetY: l.centerY - l.anchorY,
  }));
}
function recoverInput(previous, current) {
  const points = [...current.labels].sort((a, b) => words.get(a.id).x - words.get(b.id).x);
  const lo = points[0], hi = points.at(-1);
  const effectiveScale = (hi.anchorX - lo.anchorX) / (words.get(hi.id).x - words.get(lo.id).x);
  const camera = { x: lo.anchorX - words.get(lo.id).x * effectiveScale,
    y: lo.anchorY - words.get(lo.id).y * effectiveScale, scale: effectiveScale / initial.fit, fit: initial.fit };
  assert.deepEqual(current.viewport, { left: 0, top: 0, right: viewport.width, bottom: viewport.height });
  let residual = 0;
  for (const label of points) {
    const point = words.get(label.id);
    residual = Math.max(residual, Math.abs(camera.x + point.x * effectiveScale - label.anchorX),
      Math.abs(camera.y + point.y * effectiveScale - label.anchorY));
  }
  assert.ok(residual < 1e-8 && Number(camera.scale.toFixed(3)) === current.scale, "inconsistent painted camera");
  return inputAt(camera, capturedItems(previous));
}
function geometryDiff(captured, replayed) {
  const expected = readable(captured), actual = readable(replayed);
  const lost = difference(expected, actual), gained = difference(actual, expected);
  let maxComponentError = 0;
  for (const [id, a] of expected) {
    const b = actual.get(id);
    if (b) for (const key of ["screenX", "screenY", "offsetX", "offsetY", "width", "height", "opacity"]) {
      maxComponentError = Math.max(maxComponentError, Math.abs(a[key] - b[key]));
    }
  }
  return { lost, gained, maxComponentError, matches: !lost.length && !gained.length && maxComponentError < 1e-7 };
}
function replayCapture(path) {
  if (!path) return { status: "unavailable", reason: "Private capture not supplied. Browser frame pair unverified." };
  const capture = loadJson(path);
  assert.equal(capture.source, captureSha);
  assert.equal(capture.scene, "community-garden");
  const [previous, first, second] = capture.frames.slice(46, 49);
  const recordedJump = jumpBetween(readable(capturedItems(first)).get("rake"), readable(capturedItems(second)).get("rake"));
  assert.ok(recordedJump > limit, "recorded browser pair is not the expected red case");
  const priorInput = recoverInput(previous, first), input = recoverInput(first, second);
  const diffs = [geometryDiff(capturedItems(first), layout(baseline, priorInput)),
    geometryDiff(capturedItems(second), layout(baseline, input))];
  if (diffs.some((diff) => !diff.matches)) return { status: "unverified", recordedJump, diffs,
    reason: "Reconstruction did not reproduce both full painted baseline layouts." };
  const result = compareFixed("rake", priorInput, input);
  assert.ok(Math.abs(result.oldJump - recordedJump) < 1e-7);
  return { status: "baseline-paint-reproduced", recordedJump, diffs, result };
}

const schedules = [];
for (const hz of [30, 50, 60, 90]) {
  for (const ms of [34, 50, 68]) schedules.push(runSchedule(hz, ms));
}
for (const [key, expected] of Object.entries(hashes)) assert.equal(digest(generatedSeed[key]), expected, `public seed ${key}`);
const reference = args.seed ? loadJson(args.seed).evidence : generatedSeed;
for (const [key, expected] of Object.entries(hashes)) assert.equal(digest(reference[key]), expected, `reference seed ${key}`);
const seed = compareFixed(seedId, reference.priorInput, reference.input);
assert.ok(Math.abs(seed.oldJump - 178.86943568921163) < 1e-8, "unexpected baseline jump");
const rake = replayCapture(args.capture);
const scheduleFailures = schedules.filter((s) => s.summary.newMaximum > limit || s.summary.targetsDropped.length || s.summary.collisionCount);
const pass = seed.geometryPass && !seed.lost.length && !scheduleFailures.length
  && (!args.capture || (rake.result?.geometryPass === true && !rake.result.lost.length));
const summary = { status: pass ? "passed" : "failed", pass,
  scope: { scene: scene.id, limit, captureSupplied: Boolean(args.capture), captureStatus: rake.status },
  seed, rake, schedules: schedules.map(({ hz, inputMs, summary }) => ({ hz, inputMs, ...summary })) };
if (args.output) writeFileSync(args.output, JSON.stringify({ ...summary, schedules }, null, 2), { mode: 0o600 });
console.log(JSON.stringify(summary, null, 2));
if (!pass) process.exitCode = 1;
