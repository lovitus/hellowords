import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import sharpModule from "sharp";

const projectRoot = resolve(import.meta.dirname, "../..");
const sceneRoot = resolve(projectRoot, "public/data/scenes");
const decodeImage = sharpModule as unknown as (input: string | Buffer) => {
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
};

async function readJson(file: string) {
  return JSON.parse(await readFile(resolve(sceneRoot, file), "utf8"));
}

const contracts = [
  {
    id: "aircraft-galley-equipment",
    parentId: "aircraft-cabin",
    asset: "/scenes/aircraft-galley-equipment-premium-v1.jpg",
    sha256: "ad4302dc7a0b87d7ae7bc6f596aec9a1c264ca29774d8c5ea0f024c91c3c0bbe",
    labels: 147,
    zoneSizes: [21, 32, 30, 22, 20, 22],
  },
  {
    id: "hemodialysis-unit",
    parentId: "hospital",
    asset: "/scenes/hemodialysis-unit-premium-v1.jpg",
    sha256: "fd89f968c45ae3139c699fd4a333c5eb7b5c10bdd053df35c56a9a6b8af964dc",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "carry-on-baggage-scanner",
    parentId: "security-checkpoint",
    asset: "/scenes/carry-on-baggage-scanner-premium-v1.jpg",
    sha256: "b9bb1a4985763405fab88538574a621cf9c6679653747f1babc3ab4d0511c49f",
    labels: 147,
    zoneSizes: [25, 25, 25, 25, 25, 22],
  },
  {
    id: "desktop-workstation-equipment",
    parentId: "open-plan-workstation",
    asset: "/scenes/desktop-workstation-equipment-premium-v1.jpg",
    sha256: "1018242a50cc54d8d7eba6d9a0d6725037ed446fbfc8cdab2c5bf731f993d8a7",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "microscope-workstation",
    parentId: "pathology-lab",
    asset: "/scenes/microscope-workstation-premium-v1.jpg",
    sha256: "c2d5ff3cb6db3262a4adba64367f320280abb11c95cbb762f727c052492e274a",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "automated-dispensing-cabinet",
    parentId: "hospital-pharmacy",
    asset: "/scenes/automated-dispensing-cabinet-premium-v1.jpg",
    sha256: "ffad54c64be1bcb601c5ea1483a93786adf1bfb18e351a4260dcfaedaa47fdad",
    labels: 147,
    zoneSizes: [24, 25, 26, 25, 25, 22],
  },
] as const;

for (const contract of contracts) {
  test(`${contract.id} keeps its reviewed visible-object vocabulary and reproducible asset`, async () => {
    const scene = await readJson(`${contract.id}.json`);
    assert.equal(scene.id, contract.id);
    assert.equal(scene.parentId, contract.parentId);
    assert.equal(scene.asset, contract.asset);
    assert.deepEqual([scene.width, scene.height], [1_600, 900]);
    assert.equal(scene.labels.length, contract.labels);
    assert.equal(scene.visualRegions.length, contract.labels);
    assert.deepEqual(scene.detailZones.map(({ labelIds }: { labelIds: string[] }) => labelIds.length), contract.zoneSizes);
    assert.equal(new Set(scene.labels.map(({ id }: { id: string }) => id)).size, contract.labels);
    assert.equal(new Set(scene.labels.map(({ word }: { word: string }) => word.toLocaleLowerCase())).size, contract.labels);
    assert.equal(scene.anchorAudit.status, "human-verified");
    assert.equal(scene.anchorAudit.reviewedAssetSha256, contract.sha256);

    const bytes = await readFile(resolve(projectRoot, `public${contract.asset}`));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), contract.sha256);
    const metadata = await decodeImage(bytes).metadata();
    assert.deepEqual([metadata.format, metadata.width, metadata.height], ["jpeg", 1_600, 900]);
  });
}

test("aircraft cabin exposes a disjoint, visible forward-galley entrance", async () => {
  const parent = await readJson("aircraft-cabin.json");
  const galley = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "aircraft-galley-equipment");
  const lavatory = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "aircraft-lavatory");
  assert.ok(galley);
  assert.ok(lavatory);
  assert.deepEqual([galley.x, galley.y, galley.width, galley.height], [320, 60, 380, 780]);
  assert.ok(galley.x + galley.width <= lavatory.x, "galley and lavatory entrance crops must not overlap");
  const region = parent.visualRegions.find(({ id }: { id: string }) => id === galley.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [320, 60, 380, 780]);
});

test("security checkpoint and open-plan office expose bounded equipment entrances", async () => {
  const checkpoint = await readJson("security-checkpoint.json");
  const scanner = checkpoint.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "carry-on-baggage-scanner");
  const boarding = checkpoint.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "boarding-gate");
  assert.ok(scanner);
  assert.ok(boarding);
  assert.deepEqual([scanner.x, scanner.y, scanner.width, scanner.height], [850, 120, 300, 420]);
  assert.ok(scanner.x + scanner.width <= boarding.x, "scanner and boarding-gate crops must not overlap");

  const office = await readJson("open-plan-workstation.json");
  const workstation = office.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "desktop-workstation-equipment");
  assert.ok(workstation);
  assert.deepEqual([workstation.x, workstation.y, workstation.width, workstation.height], [500, 390, 430, 390]);
  const region = office.visualRegions.find(({ id }: { id: string }) => id === workstation.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [500, 390, 430, 390]);
});

test("pathology laboratory and hospital pharmacy expose independently audited equipment entrances", async () => {
  const pathology = await readJson("pathology-lab.json");
  const microscope = pathology.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "microscope-workstation");
  assert.ok(microscope);
  assert.deepEqual([microscope.x, microscope.y, microscope.width, microscope.height], [20, 360, 300, 400]);
  const microscopeRegion = pathology.visualRegions.find(({ id }: { id: string }) => id === microscope.sourceVisualRegion);
  assert.ok(microscopeRegion);
  assert.deepEqual([microscopeRegion.x, microscopeRegion.y, microscopeRegion.width, microscopeRegion.height], [20, 360, 300, 400]);

  const pharmacy = await readJson("hospital-pharmacy.json");
  const cabinet = pharmacy.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "automated-dispensing-cabinet");
  assert.ok(cabinet);
  assert.deepEqual([cabinet.x, cabinet.y, cabinet.width, cabinet.height], [1_120, 80, 480, 680]);
  const cabinetRegion = pharmacy.visualRegions.find(({ id }: { id: string }) => id === cabinet.sourceVisualRegion);
  assert.ok(cabinetRegion);
  assert.deepEqual([cabinetRegion.x, cabinetRegion.y, cabinetRegion.width, cabinetRegion.height], [1_120, 80, 480, 680]);
  assert.notEqual(cabinet.sourceVisualRegion, "automated-cabinet", "the accurate portal crop must not reuse the narrower legacy semantic region");
});
