import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compileMegaAtlasPanels,
  parseMegaAtlasPanelCompilerArguments,
  runMegaAtlasPanelCompiler,
  serializeMegaAtlasPanelBatch,
} from "../../scripts/compile-mega-atlas-panels.mjs";

function fixtureLayout(gutters = undefined) {
  return {
    columns: 3,
    rows: 2,
    panelWidth: 1_672,
    panelHeight: 941,
    ...(gutters ? { gutters } : {}),
    panels: Array.from({ length: 6 }, (_, index) => ({
      id: `panel-${index + 1}`,
      file: `panel-${index + 1}.json`,
      row: Math.floor(index / 3),
      col: index % 3,
    })),
  };
}

function fixtureBatch(panelId, index) {
  const zoneId = `zone-${panelId}`;
  const anchorId = `anchor-${panelId}`;
  return {
    panelId,
    zones: [{
      id: zoneId,
      title: `Zone ${index + 1}`,
      x: 10,
      y: 20,
      width: 200,
      height: 150,
      labelIds: [anchorId],
    }],
    anchors: [{
      id: anchorId,
      word: index === 0 || index === 5 ? "Chair" : `object ${index + 1}`,
      translation: `物体${index + 1}`,
      x: 30,
      y: 40,
      lod: 1,
      zoneId,
    }],
    removedAmbiguous: [{
      candidate: `ambiguous ${index + 1}`,
      reason: "the pixels do not support an exact identification",
    }],
  };
}

function fixtureDocuments(layout) {
  return layout.panels.map((panel, index) => ({
    panelId: panel.id,
    path: panel.file,
    data: fixtureBatch(panel.id, index),
  }));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("compiler translates all six local panels through horizontal and vertical gutters", () => {
  const layout = fixtureLayout({ horizontal: 13, vertical: 17 });
  const compiled = compileMegaAtlasPanels(layout, fixtureDocuments(layout));

  assert.equal(compiled.batch.layout.width, 5_042);
  assert.equal(compiled.batch.layout.height, 1_899);
  assert.deepEqual(compiled.batch.counts, {
    panels: 6,
    zones: 6,
    anchors: 6,
    removedAmbiguous: 6,
    duplicateWordGroups: 1,
    duplicateWordAnchors: 2,
    duplicateWordExcess: 1,
  });
  assert.deepEqual(
    compiled.batch.layout.panels.map(({ row, col, x, y }) => [row, col, x, y]),
    [
      [0, 0, 0, 0],
      [0, 1, 1_685, 0],
      [0, 2, 3_370, 0],
      [1, 0, 0, 958],
      [1, 1, 1_685, 958],
      [1, 2, 3_370, 958],
    ],
  );
  const bottomRightPanel = compiled.batch.layout.panels.at(-1);
  assert.deepEqual(
    { id: bottomRightPanel.id, x: bottomRightPanel.x, y: bottomRightPanel.y },
    { id: "panel-6", x: 3_370, y: 958 },
  );
  const bottomRightZone = compiled.batch.zones.find(({ id }) => id === "zone-panel-6");
  assert.deepEqual(
    {
      x: bottomRightZone.x,
      y: bottomRightZone.y,
      width: bottomRightZone.width,
      height: bottomRightZone.height,
      sourcePanel: bottomRightZone.sourcePanel,
    },
    { x: 3_380, y: 978, width: 200, height: 150, sourcePanel: "panel-6" },
  );
  const bottomRightAnchor = compiled.batch.anchors.find(({ id }) => id === "anchor-panel-6");
  assert.deepEqual(
    {
      x: bottomRightAnchor.x,
      y: bottomRightAnchor.y,
      sourcePanel: bottomRightAnchor.sourcePanel,
      zoneId: bottomRightAnchor.zoneId,
    },
    { x: 3_400, y: 998, sourcePanel: "panel-6", zoneId: "zone-panel-6" },
  );
  assert.equal(compiled.batch.removedAmbiguous.at(-1).sourcePanel, "panel-6");
  assert.deepEqual(compiled.report.duplicateWords, [{
    normalizedWord: "chair",
    count: 2,
    anchors: [
      { id: "anchor-panel-1", word: "Chair", sourcePanel: "panel-1" },
      { id: "anchor-panel-6", word: "Chair", sourcePanel: "panel-6" },
    ],
  }]);
  assert.equal(compiled.batch.anchors.length, 6, "duplicate words must remain in output");
});

test("compiler rejects duplicate cross-panel anchor and zone ids", () => {
  const layout = fixtureLayout();
  const duplicateAnchorDocuments = fixtureDocuments(layout);
  duplicateAnchorDocuments[5].data.anchors[0].id = "anchor-panel-1";
  duplicateAnchorDocuments[5].data.zones[0].labelIds = ["anchor-panel-1"];
  assert.throws(
    () => compileMegaAtlasPanels(layout, duplicateAnchorDocuments),
    /duplicate anchor id "anchor-panel-1" across panels "panel-1" and "panel-6"/,
  );

  const duplicateZoneDocuments = fixtureDocuments(layout);
  duplicateZoneDocuments[5].data.zones[0].id = "zone-panel-1";
  duplicateZoneDocuments[5].data.anchors[0].zoneId = "zone-panel-1";
  assert.throws(
    () => compileMegaAtlasPanels(layout, duplicateZoneDocuments),
    /duplicate zone id "zone-panel-1" across panels "panel-1" and "panel-6"/,
  );
});

test("compiler rejects local points and rectangles outside their source panel", () => {
  const layout = fixtureLayout();
  const outsideAnchor = fixtureDocuments(layout);
  outsideAnchor[1].data.anchors[0].x = 1_673;
  assert.throws(
    () => compileMegaAtlasPanels(layout, outsideAnchor),
    /panel-2\.json\.anchors\[0\]\.x: expected a finite number from 0 through 1672/,
  );

  const outsideZone = fixtureDocuments(layout);
  outsideZone[2].data.zones[0].x = 1_600;
  assert.throws(
    () => compileMegaAtlasPanels(layout, outsideZone),
    /panel-3\.json\.zones\[0\]: local zone ends at x=1800, beyond panel width 1672/,
  );
});

test("compiler rejects unknown zones, escaped anchor points and stale zone inventories", () => {
  const layout = fixtureLayout();
  const unknownZone = fixtureDocuments(layout);
  unknownZone[3].data.anchors[0].zoneId = "missing-zone";
  assert.throws(
    () => compileMegaAtlasPanels(layout, unknownZone),
    /references unknown local zone "missing-zone"/,
  );

  const escapedPoint = fixtureDocuments(layout);
  escapedPoint[3].data.anchors[0].x = 300;
  assert.throws(
    () => compileMegaAtlasPanels(layout, escapedPoint),
    /local point \(300, 40\) is outside zone "zone-panel-4"/,
  );

  const staleInventory = fixtureDocuments(layout);
  staleInventory[3].data.zones[0].labelIds = [];
  assert.throws(
    () => compileMegaAtlasPanels(layout, staleInventory),
    /labelIds: does not exactly match anchors assigned to zone "zone-panel-4"; missing anchor-panel-4/,
  );
});

test("compiler serialization and SHA are deterministic across layout and document order", () => {
  const noGutterLayout = fixtureLayout();
  const noGutter = compileMegaAtlasPanels(noGutterLayout, fixtureDocuments(noGutterLayout));
  assert.deepEqual(
    { width: noGutter.batch.layout.width, height: noGutter.batch.layout.height },
    { width: 5_016, height: 1_882 },
  );

  const layout = fixtureLayout({ x: 9, y: 5 });
  const documents = fixtureDocuments(layout);
  const first = compileMegaAtlasPanels(layout, documents);
  const second = compileMegaAtlasPanels(
    { ...layout, panels: [...layout.panels].reverse() },
    [...documents].reverse(),
  );
  const firstBytes = serializeMegaAtlasPanelBatch(first.batch);
  const secondBytes = serializeMegaAtlasPanelBatch(second.batch);
  assert.equal(firstBytes, secondBytes);
  assert.equal(first.report.output.sha256, second.report.output.sha256);
  assert.equal(first.report.output.sha256, sha256(firstBytes));
  assert.equal(first.report.output.bytes, Buffer.byteLength(firstBytes));
});

test("CLI runner resolves panel files relative to layout and reports verified counts and SHA", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "hellowords-panel-compiler-"));
  try {
    const layout = fixtureLayout({ horizontal: 3, vertical: 7 });
    const layoutPath = join(temporaryRoot, "layout.json");
    await writeFile(layoutPath, JSON.stringify(layout));
    await Promise.all(layout.panels.map((panel, index) => (
      writeFile(join(temporaryRoot, panel.file), JSON.stringify(fixtureBatch(panel.id, index)))
    )));
    const firstOutput = join(temporaryRoot, "first.json");
    const secondOutput = join(temporaryRoot, "second.json");
    const first = await runMegaAtlasPanelCompiler({ layoutPath, output: firstOutput });
    const second = await runMegaAtlasPanelCompiler({ layoutPath, output: secondOutput });
    const firstBytes = await readFile(firstOutput);
    const secondBytes = await readFile(secondOutput);

    assert.deepEqual(firstBytes, secondBytes);
    assert.equal(first.output.sha256, sha256(firstBytes));
    assert.equal(first.output.sha256, second.output.sha256);
    assert.equal(first.counts.panels, 6);
    assert.equal(first.counts.anchors, 6);
    assert.equal(first.inputs.panels.length, 6);
    assert.equal(first.canvas.width, 5_022);
    assert.equal(first.canvas.height, 1_889);
    await assert.rejects(
      runMegaAtlasPanelCompiler({ layoutPath, output: firstOutput }),
      /Refusing to overwrite existing output/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI parser requires one layout and an explicit output", () => {
  assert.deepEqual(
    parseMegaAtlasPanelCompilerArguments([
      "layout.json",
      "--output=global.json",
      "--force",
    ]),
    {
      help: false,
      layoutPath: "layout.json",
      output: "global.json",
      force: true,
    },
  );
  assert.throws(
    () => parseMegaAtlasPanelCompilerArguments(["one.json", "two.json", "--output", "out.json"]),
    /Expected exactly one layout JSON path; received 2/,
  );
  assert.throws(
    () => parseMegaAtlasPanelCompilerArguments(["layout.json"]),
    /--output is required/,
  );
});
