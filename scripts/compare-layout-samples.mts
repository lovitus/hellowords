import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { computeScenePlacements as previous } from "../app/domain/previousPlacement";
import { computeScenePlacements as candidate } from "../app/domain/labelPlacement";
import type { Scene, SceneLabelLayoutItem } from "../app/domain";

const load = (id: string) => JSON.parse(readFileSync(`public/data/scenes/${id}.json`, "utf8"));
const manifest = load("manifest");
let layouts = 0;
let words = 0;
let visible = 0;
let oldWallMs = 0;
let newWallMs = 0;
for (const { id } of manifest.scenes) {
  const scene = load(id) as Scene;
  for (const compact of [false, true]) {
    const viewport = compact ? { width: 412, height: 760, compact } : { width: 1440, height: 826, compact };
    const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
    const protectedRegions = [{ left: 12, top: 16, right: 244, bottom: 180 }];
    const priorityLabelIds = new Set(scene.detailZones?.[0]?.labelIds ?? []);
    for (const meaning of [false, true]) {
      const offsets = new Map<string, SceneLabelLayoutItem>();
      for (const [index, scale] of [1, 0.92, 0.701, 0.68, 1.5, 2.85, 5.2, 1].entries()) {
        const camera = {
          x: (viewport.width - scene.width * fit * scale) / 2,
          y: (viewport.height - scene.height * fit * scale) / 2,
          fit, scale,
        };
        const options = {
          protectedRegions,
          priorityLabelIds: scale > 2 ? priorityLabelIds : undefined,
          preferredOffsets: index === 4 || index === 5 || index === 6 ? offsets : undefined,
          selectedLabelId: index === 6 ? scene.labels[0]?.id : null,
        };
        const inputs = [scene.labels, camera, viewport, meaning, options] as const;
        const start = performance.now();
        const before = previous(...inputs);
        const middle = performance.now();
        const after = candidate(...inputs);
        oldWallMs += middle - start;
        newWallMs += performance.now() - middle;
        deepStrictEqual(after, before, `${id}: zoom ${scale}, compact ${compact}, translations ${meaning}`);
        offsets.clear();
        for (const word of before) if (word.interactive) offsets.set(word.id, word);
        words += before.length;
        visible += offsets.size;
        layouts++;
      }
    }
  }
}
console.log(JSON.stringify({ scenes: manifest.scenes.length, layouts, words, visible, oldWallMs, newWallMs }));
