import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import {
  buildViewerChromeProtectedRegions, fittedSceneCamera, projectSceneRectToScreen, wheelZoomFactor,
} from "../app/components/SceneViewport.tsx";
import { maximumSceneCameraScale, smoothCameraTowards, zoomCameraAboutPoint } from "../app/domain/camera.ts";
import { portalCueProtectedRegion } from "../app/domain/labelLayout.ts";
import { computeScenePlacements } from "../app/domain/labelPlacement.ts";

const sourceRevision = "6c8ae1d2db672310ec4cd35321ca423512a5266c";
const placementPath = "app/domain/labelPlacement.ts";
const scenePath = "public/data/scenes/community-garden.json";
for (const [path, expected] of [
  [placementPath, "4ab349b110e3e4f0b5f4f62df52ab43078df5307"],
  [scenePath, "74b6305b4c276cbf55bd706ea2b64564ac6c82b0"],
  ["app/components/SceneViewport.tsx", "af62d875cf98718f8689da6a8566663d554213e8"],
  ["app/domain/labelLayout.ts", "83fa270b3153d54947fedb0906cf0e4cab7cff1e"],
  ["app/domain/camera.ts", "d1c5d486504ea4509bd289d7ed8203c14f5e5428"],
]) assert.equal(execFileSync("git", ["hash-object", path], { encoding: "utf8" }).trim(), expected, path);

const scene = JSON.parse(readFileSync(scenePath, "utf8"));
const authored = new Map(scene.labels.map((label) => [label.id, label]));
const viewport = { width: 1440, height: 826, compact: false };
const focus = { x: viewport.width / 2, y: viewport.height / 2 };
const meaningVisible = false;
const initial = fittedSceneCamera(scene, viewport);
const maxScale = maximumSceneCameraScale(initial.fit);
const targets = [1.2, 1.65, 2.3, 3.12, maxScale];
const outputPath = "artifacts/correctness/garden-geometry-replay.json";

function regionsAt(camera) {
  const names = ["minimap", "top-center", "top-right", "bottom-right", "bottom-left"];
  const regions = buildViewerChromeProtectedRegions(viewport.width, viewport.height)
    .map((rect, i) => ({ id: names[i], ...rect }));
  for (const portal of scene.portals) {
    const bounds = projectSceneRectToScreen(portal, camera);
    const centerX = (Math.round(bounds.x) + Math.round(bounds.x + bounds.width)) / 2;
    const centerY = (Math.round(bounds.y) + Math.round(bounds.y + bounds.height)) / 2;
    const rect = portalCueProtectedRegion(centerX, centerY, viewport);
    if (rect) regions.push({ id: portal.id, ...rect });
  }
  return regions;
}

function frameInput(camera, preferredOffsets) {
  return { camera, protectedRegions: regionsAt(camera), preferredOffsets };
}

function layout(input, engine = computeScenePlacements) {
  return engine(scene.labels, input.camera, viewport, meaningVisible, {
    protectedRegions: input.protectedRegions,
    preferredOffsets: input.preferredOffsets ? new Map(input.preferredOffsets) : undefined,
  });
}

function offsets(items) {
  return items.filter((item) => item.interactive)
    .map(({ id, offsetX, offsetY }) => [id, { offsetX, offsetY }]);
}

function anchor(id, camera) {
  const word = authored.get(id);
  const scale = camera.fit * camera.scale;
  return { x: camera.x + word.x * scale, y: camera.y + word.y * scale };
}

// These are synthesized wheel timings. The private browser trace is never an input.
// The E2E reads the three-decimal DOM scale for each impulse; rendering uses full precision.
function investigate(hz, inputMs) {
  let camera = initial;
  let input = frameInput(camera);
  let current = layout(input);
  let target = null;
  let targetIndex = 0;
  let nextEvent = 0;
  let lastFrame = null;
  let frame = 0;
  let maximum = 0;
  let greenhouse = null;
  let other = null;
  const step = 1000 / hz;
  for (let now = step; now < 8000; now += step) {
    if (now >= nextEvent && targetIndex < targets.length) {
      const scale = Number(camera.scale.toFixed(3));
      const goal = targets[targetIndex];
      if (scale < goal * 0.998) {
        const deltaY = -Math.log(Math.min(1.12, goal / scale)) / 0.00145;
        const base = target ?? camera;
        const nextScale = Math.min(maxScale, base.scale * wheelZoomFactor(deltaY, 0, viewport.height));
        // Centered zoom fits the stage's allowed pan range for the entire trajectory.
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
    const priorInput = input;
    const previous = new Map(current.filter((item) => item.interactive).map((item) => [item.id, item]));
    input = frameInput(camera, offsets(current));
    current = layout(input);
    frame += 1;
    for (const item of current) {
      const old = previous.get(item.id);
      if (!old || !item.interactive) continue;
      const { x, y } = anchor(item.id, camera);
      if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) continue;
      const jump = Math.hypot(item.offsetX - old.offsetX, item.offsetY - old.offsetY);
      maximum = Math.max(maximum, jump);
      if (jump <= 120) continue;
      const hit = { hz, inputMs, frame, id: item.id, jump, old, item, priorInput, input };
      if (item.id === "greenhouse") {
        if (!greenhouse || Math.abs(camera.scale - 1.524) < Math.abs(greenhouse.input.camera.scale - 1.524)) greenhouse = hit;
      } else if (!other || jump > other.jump) other = hit;
    }
  }
  assert.ok(targetIndex === targets.length && camera.scale >= maxScale - 0.02, `unfinished wheel path ${hz}/${inputMs}`);
  return { summary: { hz, inputMs, frames: frame, maximum, greenhouseJump: greenhouse?.jump ?? null }, greenhouse, other };
}

// Only the chosen frame is replayed with observation hooks. The hooks leave placement
// decisions in the original implementation and expose its actual freeSlot predicate.
function addHook(source, marker, phase) {
  assert.equal(source.split(marker).length, 2, marker);
  const hook = `
    if (candidate.label.id === globalThis.gardenProbe.id) {
      globalThis.gardenProbe.observe("${phase}", candidate, [...placed.values()],
        (x, y) => freeSlot(candidate, candidate.anchorX + x, candidate.anchorY + y) !== null);
    }
  `;
  return source.replace(marker, phase === "reserve" ? marker + hook : hook + marker);
}
let source = readFileSync(placementPath, "utf8");
source = addHook(source, "const previous = preferredOffsets.get(candidate.label.id);", "reserve");
source = addHook(source, "if (closest) occupy(candidate, closest);", "fallback");
source += "\nexport { rectAt, rectsOverlap, pointInRect, segmentTouchesRect, segmentsIntersect };";
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const observed = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

function blockers(hit, offset, occupants) {
  const { x, y } = anchor(hit.id, hit.input.camera);
  const leader = { x1: x, y1: y, x2: x + offset.offsetX, y2: y + offset.offsetY };
  const rect = observed.rectAt(leader.x2, leader.y2, hit.item.width, hit.item.height);
  const blocked = [];
  if (rect.left < 4 || rect.right > viewport.width - 4 || rect.top < 4 || rect.bottom > viewport.height - 4) {
    blocked.push({ id: "viewport", rule: "4px margin" });
  }
  for (const region of hit.input.protectedRegions) {
    if (observed.rectsOverlap(rect, region, 0)) blocked.push({ id: region.id, rule: "protected region" });
  }
  for (const other of occupants) {
    if (other.id === hit.id) continue;
    const p = anchor(other.id, hit.input.camera);
    const pill = observed.rectAt(other.screenX, other.screenY, other.width, other.height);
    const line = { x1: p.x, y1: p.y, x2: other.screenX, y2: other.screenY };
    const rules = [
      [observed.rectsOverlap(rect, pill, 3), "pill gap"],
      [observed.pointInRect(p.x, p.y, rect, 3), "neighbor anchor in pill"],
      [observed.pointInRect(x, y, pill, 3), "own anchor in neighbor pill"],
      [observed.segmentTouchesRect(leader, pill), "leader hits neighbor pill"],
      [observed.segmentTouchesRect(line, rect), "neighbor leader hits pill"],
      [observed.segmentsIntersect(leader, line), "leaders cross"],
    ].filter(([matches]) => matches).map(([, rule]) => rule);
    if (rules.length) blocked.push({ id: other.id, rules });
  }
  return blocked;
}

function findWitness(hit, free, finalItems) {
  let first = null;
  let checked = 0;
  for (let radius = 0; radius <= 120; radius += 0.5) {
    const count = Math.max(1, Math.ceil(2 * Math.PI * radius / 0.5));
    for (let n = 0; n < count; n += 1) {
      const angle = n * 2 * Math.PI / count;
      const x = hit.old.offsetX + Math.cos(angle) * radius;
      const y = hit.old.offsetY + Math.sin(angle) * radius;
      const distance = Math.hypot(x - hit.old.offsetX, y - hit.old.offsetY);
      const gapX = Math.max(0, Math.abs(x) - hit.item.width / 2);
      const gapY = Math.max(0, Math.abs(y) - hit.item.height / 2);
      if (distance > 120 || Math.max(gapX, gapY) <= 3 || Math.hypot(gapX, gapY) > 120) continue;
      checked += 1;
      if (!free(x, y)) continue;
      const offset = { offsetX: x, offsetY: y };
      const finalBlockers = blockers(hit, offset, finalItems);
      const witness = { offset, distance, finalBlockers };
      if (!finalBlockers.length) return { status: "verified", witness, checked };
      first ??= witness;
      // One valid decision-time witness suffices. Prefer a final-layout witness in this ring.
    }
    if (first) return { status: "verified-at-decision", witness: first, checked };
  }
  return { status: "no-sampled-witness", checked };
}

function diagnose(hit) {
  // A JSON round trip verifies that the attachment carries enough precision to replay both frames.
  const previous = layout(JSON.parse(JSON.stringify(hit.priorInput))).find((i) => i.id === hit.id);
  const final = layout(JSON.parse(JSON.stringify(hit.input)));
  assert.deepEqual(previous, hit.old);
  assert.deepEqual(final.find((i) => i.id === hit.id), hit.item);
  const phases = {};
  globalThis.gardenProbe = {
    id: hit.id,
    observe(phase, candidate, occupants, free) {
      phases[phase] = {
        occupiedIds: occupants.map((item) => item.id),
        oldSlotBlockers: blockers(hit, hit.old, occupants),
        oldSlotFree: free(hit.old.offsetX, hit.old.offsetY),
      };
      if (phase === "fallback") phases[phase].boundedSearch = findWitness(hit, free, final.filter((i) => i.interactive));
    },
  };
  assert.deepEqual(layout(hit.input, observed.computeScenePlacements), final);
  assert.ok(phases.reserve && phases.fallback, "retained word must reach the far-slot fallback");
  return {
    ...hit, phases,
    currentVisible: final.filter((item) => item.interactive),
    finalOldSlotBlockers: blockers(hit, hit.old, final.filter((item) => item.interactive)),
  };
}

const runs = [];
for (const hz of [30, 50, 60, 90]) {
  for (const interval of [34, 50, 68]) runs.push(investigate(hz, interval));
}
const greenhouses = runs.map((r) => r.greenhouse).filter(Boolean)
  .sort((a, b) => Math.abs(a.input.camera.scale - 1.524) - Math.abs(b.input.camera.scale - 1.524));
const others = runs.map((r) => r.other).filter(Boolean).sort((a, b) => b.jump - a.jump);
let first = null;
let witness = null;
for (const hit of [...greenhouses, ...others]) {
  const evidence = diagnose(hit);
  first ??= evidence;
  if (evidence.phases.fallback.boundedSearch.witness) {
    witness = evidence;
    break;
  }
}
const evidence = witness ?? first;
mkdirSync("artifacts/correctness", { recursive: true });
writeFileSync(outputPath, JSON.stringify({
  sourceRevision, scenePath, viewport, focus, meaningVisible, devicePixelRatio: 1,
  selectedId: null, priorityIds: [], runs: runs.map((r) => r.summary), evidence,
}, null, 2));
console.log(JSON.stringify({
  trajectories: runs.length, target: evidence?.id, jump: evidence?.jump, frame: evidence?.frame,
  boundedSearch: evidence?.phases.fallback.boundedSearch.status, outputPath,
}));
assert.ok(evidence, "finite schedules did not reproduce a >120px jump");
assert.ok(witness, "a finite search found no bounded witness; this does not prove no legal slot exists");
