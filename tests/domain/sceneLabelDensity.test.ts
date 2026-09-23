import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildPortalCueProtectedRegions,
  buildVocabularyRevealSummary,
  computeSceneLabelLayout,
  sceneLabelDensityTarget,
  sceneLabelRevealOpacity,
  type Scene,
  type SceneLabelCamera,
  type SceneLabelLayoutItem,
  type SceneLabelProtectedRegion,
} from "../../app/domain";

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface DensityConfiguration {
  name: "desktop-word" | "desktop-meaning" | "mobile-word" | "mobile-meaning";
  width: number;
  height: number;
  compact: boolean;
  scale: number;
  meaningVisible: boolean;
}

const projectRoot = resolve(import.meta.dirname, "../..");
const configurations: readonly DensityConfiguration[] = [
  { name: "desktop-word", width: 1_280, height: 632, compact: false, scale: 1, meaningVisible: false },
  { name: "desktop-meaning", width: 1_280, height: 632, compact: false, scale: 1, meaningVisible: true },
  { name: "mobile-word", width: 390, height: 780, compact: true, scale: 1.3, meaningVisible: false },
  { name: "mobile-meaning", width: 390, height: 780, compact: true, scale: 1.3, meaningVisible: true },
];

const microZoomViewports = [
  { name: "desktop", width: 1_280, height: 632, compact: false },
  // The scene canvas is shorter than the browser window after mobile chrome.
  { name: "mobile", width: 390, height: 562, compact: true },
] as const;

const microZoomScales = Array.from(
  { length: 64 },
  (_, index) => Number((1 + index * 0.05).toFixed(2)),
);

function itemBounds(item: SceneLabelLayoutItem): Bounds {
  return {
    left: item.screenX - item.width / 2,
    right: item.screenX + item.width / 2,
    top: item.screenY - item.height / 2,
    bottom: item.screenY + item.height / 2,
  };
}

function overlaps(first: Bounds, second: Bounds): boolean {
  return !(
    first.right <= second.left
    || first.left >= second.right
    || first.bottom <= second.top
    || first.top >= second.bottom
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function loadScenes(): Promise<Scene[]> {
  const dataRoot = resolve(projectRoot, "public/data/scenes");
  const files = (await readdir(dataRoot))
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .sort();
  return Promise.all(files.map(async (file) => (
    JSON.parse(await readFile(resolve(dataRoot, file), "utf8")) as Scene
  )));
}

test("all authored scenes fill spare first-screen space without collisions or detached anchors", async () => {
  const scenes = await loadScenes();
  assert.ok(scenes.length >= 32, "new authored branches remain covered by density checks");
  const aggregate = new Map<DensityConfiguration["name"], number[]>();

  for (const configuration of configurations) {
    const counts: number[] = [];
    for (const scene of scenes) {
      const viewport = {
        width: configuration.width,
        height: configuration.height,
        compact: configuration.compact,
      };
      const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
      const camera = {
        fit,
        scale: configuration.scale,
        x: (viewport.width - scene.width * fit * configuration.scale) / 2,
        y: (viewport.height - scene.height * fit * configuration.scale) / 2,
      };
      const protectedRegions = buildPortalCueProtectedRegions(scene.portals, camera, viewport);
      const layout = computeSceneLabelLayout(
        scene.labels,
        camera,
        viewport,
        configuration.meaningVisible,
        { protectedRegions },
      );
      const visible = layout.filter((item) => item.interactive);
      const visibleIds = new Set(visible.map((item) => item.id));
      const labelsById = new Map(scene.labels.map((label) => [label.id, label]));
      counts.push(visible.length);

      const generalFloor = configuration.name === "mobile-meaning" ? 5 : 7;
      assert.ok(
        visible.length >= Math.min(generalFloor, scene.labels.length),
        `${configuration.name}/${scene.id} cannot collapse to a token handful`,
      );

      if (scene.labels.length >= 30) {
        const largeSceneFloor = configuration.name === "desktop-word"
          ? sceneLabelDensityTarget(viewport, false, configuration.scale)
          : configuration.name === "desktop-meaning"
            ? sceneLabelDensityTarget(viewport, true, configuration.scale)
            : configuration.name === "mobile-word"
              // Account only for portal buttons actually projected into this
              // viewport. Their captions are transient and no longer reserve
              // permanent layout space.
              ? protectedRegions.length > 0 ? 10 : 11
              : protectedRegions.length >= 6 ? 8 : 9;
        assert.ok(
          visible.length >= largeSceneFloor,
          `${configuration.name}/${scene.id} uses its large authored vocabulary instead of leaving avoidable blank space (visible ${visible.length}/${largeSceneFloor})`,
        );
      }

      for (let index = 0; index < visible.length; index += 1) {
        const item = visible[index];
        const bounds = itemBounds(item);
        const label = labelsById.get(item.id);
        assert.ok(label, `${scene.id}/${item.id} has an authored anchor`);
        assert.ok(bounds.left >= 0 && bounds.right <= viewport.width);
        assert.ok(bounds.top >= 0 && bounds.bottom <= viewport.height);
        assert.ok(
          Math.hypot(item.offsetX, item.offsetY) <= (viewport.compact ? 100 : 150) + 0.001,
          `${configuration.name}/${scene.id}/${item.id} keeps a bounded leader`,
        );
        assert.ok(
          Math.abs(item.screenX - item.offsetX - (camera.x + label.x * fit * configuration.scale)) < 0.001,
          `${scene.id}/${item.id} leader returns to its exact authored x anchor`,
        );
        assert.ok(
          Math.abs(item.screenY - item.offsetY - (camera.y + label.y * fit * configuration.scale)) < 0.001,
          `${scene.id}/${item.id} leader returns to its exact authored y anchor`,
        );
        for (const protectedRegion of protectedRegions) {
          assert.equal(
            overlaps(bounds, protectedRegion as SceneLabelProtectedRegion),
            false,
            `${configuration.name}/${scene.id}/${item.id} stays clear of a portal cue`,
          );
        }
        for (let otherIndex = index + 1; otherIndex < visible.length; otherIndex += 1) {
          assert.equal(
            overlaps(bounds, itemBounds(visible[otherIndex])),
            false,
            `${configuration.name}/${scene.id} visible pills never overlap`,
          );
        }
      }

      const allFuture = buildVocabularyRevealSummary(
        scene.labels,
        configuration.scale,
        4.15,
      );
      const hiddenFuture = buildVocabularyRevealSummary(
        scene.labels,
        configuration.scale,
        4.15,
        0.52,
        visibleIds,
      );
      assert.deepEqual(
        hiddenFuture.hiddenLabels.map((label) => label.id),
        allFuture.hiddenLabels.filter((label) => !visibleIds.has(label.id)).map((label) => label.id),
        `${configuration.name}/${scene.id} HUD only counts words that remain hidden`,
      );
      if (hiddenFuture.hiddenLabels.length > 0) {
        assert.ok(hiddenFuture.targetScale !== null && hiddenFuture.targetScale > configuration.scale);
      }
    }
    aggregate.set(configuration.name, counts);
  }

  const expectations = {
    "desktop-word": { minimum: 7, median: 16, maximum: 28 },
    "desktop-meaning": { minimum: 7, median: 16, maximum: 19 },
    "mobile-word": { minimum: 7, median: 12, maximum: 16 },
    "mobile-meaning": { minimum: 5, median: 9, maximum: 12 },
  } as const;
  for (const [name, expectation] of Object.entries(expectations)) {
    const counts = aggregate.get(name as DensityConfiguration["name"]) ?? [];
    assert.ok(Math.min(...counts) >= expectation.minimum, `${name} minimum density`);
    assert.ok(median(counts) >= expectation.median, `${name} median density`);
    assert.ok(Math.max(...counts) >= expectation.maximum, `${name} useful upper density`);
  }
});

test("all authored scenes preserve default LOD disclosure at maximum zoom", async () => {
  const scenes = await loadScenes();
  for (const scene of scenes) {
    for (const label of scene.labels) {
      if (label.maxScale !== undefined) continue;
      assert.equal(
        sceneLabelRevealOpacity(label, 4.15),
        1,
        `${scene.id}/${label.id} stays disclosed without an authored maxScale`,
      );
    }
  }
});

test("all authored scenes reproduce every micro camera exactly after a zoom round trip", async () => {
  const scenes = await loadScenes();

  for (const viewport of microZoomViewports) {
    for (const scene of scenes) {
      const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
      const fixedX = (viewport.width - scene.width * fit) / 2;
      const fixedY = (viewport.height - scene.height * fit) / 2;

      for (const projection of ["fixed", "centered"] as const) {
        const signatures = new Map<number, ReadonlyArray<readonly [string, boolean, number, number]>>();

        for (const scale of microZoomScales) {
          const camera: SceneLabelCamera = projection === "fixed"
            ? { x: fixedX, y: fixedY, fit: fit / scale, scale }
            : {
              x: (viewport.width - scene.width * fit * scale) / 2,
              y: (viewport.height - scene.height * fit * scale) / 2,
              fit,
              scale,
            };
          const protectedRegions = buildPortalCueProtectedRegions(scene.portals, camera, viewport);
          const layout = computeSceneLabelLayout(
            scene.labels,
            camera,
            viewport,
            false,
            { protectedRegions },
          );
          signatures.set(scale, layout.map((item) => (
            [item.id, item.interactive, item.offsetX, item.offsetY] as const
          )));
        }

        for (const scale of [...microZoomScales].reverse()) {
          const camera: SceneLabelCamera = projection === "fixed"
            ? { x: fixedX, y: fixedY, fit: fit / scale, scale }
            : {
              x: (viewport.width - scene.width * fit * scale) / 2,
              y: (viewport.height - scene.height * fit * scale) / 2,
              fit,
              scale,
            };
          const protectedRegions = buildPortalCueProtectedRegions(scene.portals, camera, viewport);
          const replay = computeSceneLabelLayout(
            scene.labels,
            camera,
            viewport,
            false,
            { protectedRegions },
          ).map((item) => [item.id, item.interactive, item.offsetX, item.offsetY] as const);
          assert.deepEqual(
            replay,
            signatures.get(scale),
            `${viewport.name}/${projection}/${scene.id}@${scale} has one interactive set and offset map`,
          );
        }
      }
    }
  }
});
