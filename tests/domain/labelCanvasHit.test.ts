import assert from "node:assert/strict";
import test from "node:test";
import { hitPaintedLabel, type PaintedLabel } from "../../app/lib/label-canvas";

test("painted object dots and word pills select the visible target in crowded views", () => {
  const microphone: PaintedLabel = {
    id: "microphone",
    word: "microphone",
    translation: "麦克风",
    label: { id: "microphone", word: "microphone", translation: "麦克风", x: 20, y: 20, priority: 1 },
    anchorX: 20, anchorY: 20, centerX: 80, centerY: 80, width: 40, height: 18,
    opacity: 1, interactive: true,
  };
  const cable: PaintedLabel = {
    ...microphone,
    id: "cable", word: "cable", translation: "电缆",
    label: { id: "cable", word: "cable", translation: "电缆", x: 32, y: 20, priority: 2 },
    anchorX: 32, centerX: 40, centerY: 20, width: 28, height: 14,
  };
  const both = [microphone, cable];
  for (const [reason, labels, x, y, pointer, expected] of [
    ["clicking the visible microphone dot", both, 20, 20, "mouse", microphone],
    ["touching its rim through the cable pill's padding", both, 24, 20, "touch", microphone],
    ["an actual pill covering another dot", [microphone, { ...cable, centerX: 20 }], 20, 20, "mouse", cable],
    ["a microphone dot visible through the cable pill's clear rounded corner", [microphone, { ...cable, centerX: 33.5, centerY: 26.5 }], 20, 20, "mouse", microphone],
    ["an off-center tap lands on the nearer of two dots", [{ ...cable, centerX: 120 }, microphone], 27, 30, "touch", cable],
    ["a fingertip near the isolated microphone", [microphone], 20, 33, "touch", microphone],
    ["a mouse at the same empty spot", [microphone], 20, 33, "mouse", null],
    ["a tap outside the touch radius", [microphone], 20, 35, "touch", null],
    ["the original padded word hit area", both, 80, 93, "touch", microphone],
    ["the middle of an empty leader line", [microphone], 50, 50, "mouse", null],
    ["a fading object dot", [{ ...microphone, opacity: 0.4 }], 20, 20, "mouse", null],
    ["a locked object dot", [{ ...microphone, interactive: false }], 20, 20, "touch", null],
  ] as const) {
    assert.equal(hitPaintedLabel(labels, x, y, pointer)?.id, expected?.id, reason);
  }
});
