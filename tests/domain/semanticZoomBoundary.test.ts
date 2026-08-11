import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  advanceSemanticZoomOutBoundary,
  semanticZoomWheelFactor,
} from "../../app/domain/semanticZoomBoundary";

const ROOT = new URL("../../", import.meta.url);

test("semantic overview requires deliberate continued shrink before returning to space", () => {
  const trackpadFactor = semanticZoomWheelFactor(120, 0, 675);
  const first = advanceSemanticZoomOutBoundary(
    0,
    trackpadFactor,
    true,
    true,
    Number.POSITIVE_INFINITY,
  );
  assert.equal(first.trigger, false);
  assert.ok(first.accumulated > 0.2);

  const second = advanceSemanticZoomOutBoundary(
    first.accumulated,
    trackpadFactor,
    true,
    true,
    80,
  );
  assert.deepEqual(second, { accumulated: 0, trigger: true });

  const expired = advanceSemanticZoomOutBoundary(
    first.accumulated,
    trackpadFactor,
    true,
    true,
    2_000,
  );
  assert.equal(expired.trigger, false);
  assert.ok(Math.abs(expired.accumulated - first.accumulated) < 1e-12);
});

test("semantic reverse intent is owned only by an enabled minimum-scale entry", () => {
  const shrink = 0.7;
  assert.deepEqual(
    advanceSemanticZoomOutBoundary(0.2, shrink, false, true),
    { accumulated: 0, trigger: false },
  );
  assert.deepEqual(
    advanceSemanticZoomOutBoundary(0.2, shrink, true, false),
    { accumulated: 0, trigger: false },
  );
  assert.deepEqual(
    advanceSemanticZoomOutBoundary(0.2, 1.1, true, true),
    { accumulated: 0, trigger: false },
  );
  assert.deepEqual(
    advanceSemanticZoomOutBoundary(0.2, Number.NaN, true, true),
    { accumulated: 0, trigger: false },
  );
});

test("wheel modes and two-finger distance ratios share the same reverse boundary", () => {
  assert.equal(semanticZoomWheelFactor(15, 1, 675), semanticZoomWheelFactor(240, 0, 675));
  assert.equal(semanticZoomWheelFactor(1, 2, 900), semanticZoomWheelFactor(240, 0, 900));
  assert.ok(semanticZoomWheelFactor(-120, 0, 675) > 1);

  const firstPinch = advanceSemanticZoomOutBoundary(0, 0.84, true, true);
  assert.equal(firstPinch.trigger, false);
  assert.deepEqual(
    advanceSemanticZoomOutBoundary(firstPinch.accumulated, 0.84, true, true, 16),
    { accumulated: 0, trigger: true },
  );
  assert.deepEqual(
    advanceSemanticZoomOutBoundary(0, 1 / 1.35, true, true),
    { accumulated: 0, trigger: true },
    "an explicit minus-button press at overview is a deliberate return gesture",
  );
});

test("field and app source contracts wire wheel, pinch, button, camera retention and reduced motion", () => {
  const field = readFileSync(new URL("app/components/SemanticZoomField.tsx", ROOT), "utf8");
  const app = readFileSync(new URL("app/components/WorldApp.tsx", ROOT), "utf8");
  const css = readFileSync(new URL("app/components/lexical-world.css", ROOT), "utf8");
  const stepStart = field.indexOf("const stepZoom");
  const wheelStart = field.indexOf("const onWheel", stepStart);
  const pointerStart = field.indexOf("const onPointerDown", wheelStart);
  const pointerEnd = field.indexOf("const endPointer", pointerStart);

  assert.match(field.slice(stepStart, wheelStart), /tryZoomOutBoundary\(factor\)/);
  assert.match(field.slice(wheelStart, pointerStart), /semanticZoomWheelFactor[\s\S]*tryZoomOutBoundary/);
  assert.match(field.slice(pointerStart, pointerEnd), /pinchFactor[\s\S]*tryZoomOutBoundary\(pinchFactor\)/);
  assert.match(
    field,
    /targetViewRef\.current\.scale <= INITIAL_VIEW\.scale \+ 0\.001[\s\S]*viewRef\.current\.scale <= INITIAL_VIEW\.scale \+ 0\.01/,
    "a pending minimum target cannot exit before the painted overview has settled",
  );
  assert.match(app, /SceneViewport remains mounted and inert[\s\S]*setSemanticTransitionState\("returning"\)/);
  assert.match(app, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)[\s\S]*reducedMotion \? 0 : 180/);
  assert.match(css, /data-semantic-transition-state="returning"[\s\S]*lexical-plane-return/);
});
