import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type DrawnWord = {
  id: string;
  opacity: number;
  anchorX: number;
  anchorY: number;
  label: { x: number; y: number };
};

test("apartment wheel reaches its overview and a fresh gesture exits", async ({ page }, testInfo) => {
  const directory = process.env.CAMERA_OBSERVATIONS;
  if (!directory) throw new Error("Set CAMERA_OBSERVATIONS to the output directory for this revision");
  const app = page.getByTestId("world-app");
  const viewer = page.locator(".viewer-shell:not([data-phase])");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await page.locator('[data-testid="scene-hotspot"][data-target-scene="apartment"]')
    .evaluate((portal: HTMLElement) => portal.click());
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(viewer.getByTestId("scene-interaction-layer")).toHaveAttribute("data-motion-frozen", "false");
  await expect(viewer.locator(".scene-surface")).toHaveAttribute("data-scene-scale", "1.000");
  await page.waitForTimeout(220);

  const observation = await viewer.getByTestId("world-viewport").evaluate(async (viewport) => {
    const surface = viewport.querySelector<HTMLElement>(".scene-surface")!;
    const canvas = viewport.querySelector<HTMLCanvasElement & { paintedLabels?: DrawnWord[] }>(".label-canvas")!;
    const appElement = viewport.closest<HTMLElement>('[data-testid="world-app"]')!;
    const bounds = viewport.getBoundingClientRect();
    const clientX = Math.round(bounds.left + bounds.width / 2);
    const clientY = Math.round(bounds.top + bounds.height / 2);
    const deltaY = 240;
    const impulses = 4;
    const gesture = () => {
      const inputTime = performance.now();
      for (let i = 0; i < impulses; i += 1) {
        viewport.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true, cancelable: true, clientX, clientY, deltaY, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        }));
      }
      return inputTime;
    };
    const fit = new DOMMatrixReadOnly(surface.style.transform).a;
    const camera = () => {
      const m = new DOMMatrixReadOnly(surface.style.transform);
      return { x: m.e, y: m.f, scale: m.a, relativeScale: m.a / fit };
    };
    const anchors = () => {
      if (!canvas.paintedLabels) throw new Error("Missing painted-label geometry");
      return canvas.paintedLabels.filter((word) => word.opacity > 0.025)
        .map(({ id, anchorX, anchorY, label }) => ({ id, x: anchorX, y: anchorY, sceneX: label.x, sceneY: label.y }))
        .sort((a, b) => a.id.localeCompare(b.id));
    };
    const initial = { camera: camera(), anchors: anchors() };
    const frames: Array<ReturnType<typeof camera> & { elapsedMs: number }> = [];
    let lastTransform = surface.style.transform;
    const firstInput = gesture();
    let lastChange = firstInput;
    let settled = false;
    // The wheel writer registers its rAF first. Equal CSS transforms and
    // unrelated label paints do not count as additional camera frames.
    while (performance.now() - firstInput < 4000 && appElement.dataset.sceneId === "apartment") {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      if (surface.style.transform !== lastTransform) {
        lastTransform = surface.style.transform;
        lastChange = now;
        frames.push({ ...camera(), elapsedMs: now - firstInput });
      } else if (frames.length && now - lastChange >= 220) {
        settled = true;
        break;
      }
    }
    const crossing = frames.findIndex((frame) => frame.relativeScale <= 0.7);
    const final = { camera: camera(), anchors: anchors() };
    const firstScene = appElement.dataset.sceneId;
    const secondInput = settled && firstScene === "apartment" ? gesture() : null;
    return {
      dpr: window.devicePixelRatio,
      viewport: { width: bounds.width, height: bounds.height },
      input: { x: clientX - bounds.left, y: clientY - bounds.top, deltaY, impulses },
      initial, final, frames, settled, firstScene,
      changedFrames: frames.length,
      changedFramesAtOrBelow07: frames.filter((frame) => frame.relativeScale <= 0.7).length,
      changedFramesAfterCrossing: crossing < 0 ? null : frames.length - crossing - 1,
      gestureGapMs: secondInput === null ? null : secondInput - firstInput,
    };
  });

  try {
    expect(observation.settled).toBe(true);
    expect(observation.firstScene).toBe("apartment");
    expect(observation.changedFramesAfterCrossing).not.toBeNull();
    expect(observation.gestureGapMs).toBeGreaterThanOrEqual(220);
    await expect(app).toHaveAttribute("data-scene-id", "world-map");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    if (testInfo.project.name === "mobile-chromium") expect(observation.dpr).toBeGreaterThan(1);
    const { input, initial, final, dpr } = observation;
    const x = input.x + (initial.camera.x - input.x) * 0.68;
    const y = input.y + (initial.camera.y - input.y) * 0.68;
    const scale = initial.camera.scale * 0.68;
    expect(final.camera.relativeScale).toBeCloseTo(0.68, 5);
    expect(Math.hypot(final.camera.x - x, final.camera.y - y) * dpr).toBeLessThan(0.03);
    expect(final.anchors.length, "verify at least one actual canvas anchor").toBeGreaterThan(0);
    for (const anchor of final.anchors) {
      const error = Math.hypot(anchor.x - (x + anchor.sceneX * scale), anchor.y - (y + anchor.sceneY * scale));
      expect(error * dpr, anchor.id).toBeLessThan(0.03);
    }
  } finally {
    const secondScene = await app.getAttribute("data-scene-id");
    const transition = await app.getAttribute("data-transition-state");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${testInfo.project.name}.json`),
      JSON.stringify({ ...observation, secondScene, transition }, null, 2));
  }
});
