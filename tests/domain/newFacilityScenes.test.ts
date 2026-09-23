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
  {
    id: "primary-classroom",
    parentId: "school-campus",
    asset: "/scenes/primary-classroom-premium-v1.jpg",
    sha256: "20498cf9be8faf487b5945e9bc732c28afad79bacc4bad6b7dd3164d5af62071",
    labels: 148,
    zoneSizes: [25, 29, 22, 25, 23, 24],
  },
  {
    id: "school-gymnasium-equipment",
    parentId: "school-campus",
    asset: "/scenes/school-gymnasium-equipment-premium-v1.jpg",
    sha256: "406402409959fbbdd3b1b5cb2283d3b43506802de99cf7a6f307ecdbfd31a053",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-art-studio",
    parentId: "school-campus",
    asset: "/scenes/school-art-studio-premium-v1.jpg",
    sha256: "b5d3a87d8b03bbd08f3f9b615351f3351d8e16ddfd9afde65ec904dc264b0687",
    labels: 151,
    zoneSizes: [24, 26, 26, 27, 25, 23],
  },
  {
    id: "school-music-room",
    parentId: "school-campus",
    asset: "/scenes/school-music-room-premium-v1.jpg",
    sha256: "1503d02240eaf3534d2df3bde51c2b7ca62e60477f932a4f80fff1a60ee2095b",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-infirmary",
    parentId: "school-campus",
    asset: "/scenes/school-infirmary-premium-v1.jpg",
    sha256: "085385245360991ea48a38cc9a14a2082d0f2b3a331c4b400e178711adb47105",
    labels: 154,
    zoneSizes: [26, 25, 25, 26, 29, 23],
  },
  {
    id: "school-science-preparation-room",
    parentId: "school-campus",
    asset: "/scenes/school-science-preparation-room-premium-v1.jpg",
    sha256: "d779047bc8c5bdfc3ffcd4d0a638d55d2abdcf50ff78d6a14c1c2f19c9a2131c",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-corridor",
    parentId: "school-campus",
    asset: "/scenes/school-corridor-premium-v1.jpg",
    sha256: "bfee1ecd5f13dd2ca1a8a6860cb16582bd1d9c4a5c456702e37966261f9be13b",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-science-laboratory",
    parentId: "school-science-preparation-room",
    asset: "/scenes/school-science-laboratory-premium-v1.jpg",
    sha256: "baafd0b221a587705b595a40553582af48216c1ccdceb9657fc90a8f06bc6a36",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-dining-hall",
    parentId: "school-corridor",
    asset: "/scenes/school-dining-hall-premium-v1.jpg",
    sha256: "e29ef77ebb98d7e9c8aa1bee7717d84eb7bdf6b680248e16635d8a957bc70e8a",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-catering-kitchen",
    parentId: "school-dining-hall",
    asset: "/scenes/school-catering-kitchen-premium-v1.jpg",
    sha256: "9ceb221c31c96361341d496e4f199d0e31cb980027a9d8281e9c540079fcc733",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "hospital-inpatient-bedspace",
    parentId: "emergency-department",
    asset: "/scenes/hospital-inpatient-bedspace-premium-v1.jpg",
    sha256: "237730a426a5b8406f6b152f1fd719e98c619685e28616eac4731c71fb4df54f",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "office-reception-lobby",
    parentId: "office-building",
    asset: "/scenes/office-reception-lobby-premium-v1.jpg",
    sha256: "f2db98876ee462b82b684d01308ea4250d5e1c9bc8a7abeb2cc2d13984025ad1",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "airport-customs-hall",
    parentId: "baggage-claim",
    asset: "/scenes/airport-customs-hall-premium-v1.jpg",
    sha256: "123816c93796df56223b3e50aa3c1cd696fa9ca7747f5c904e4c04132d4c4e40",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "customs-baggage-examination",
    parentId: "airport-customs-hall",
    asset: "/scenes/customs-baggage-examination-premium-v1.jpg",
    sha256: "14415cb0597bdd93dcda2448a9c05b2aaf41e341a466a2f238ecdc0a9e611688",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "school-locker-bank",
    parentId: "school-corridor",
    asset: "/scenes/school-locker-bank-premium-v1.jpg",
    sha256: "8f03e0c4b267c589dce954be3191337945407f6df32cb6bb716610ba8209509c",
    labels: 75,
    zoneSizes: [15, 15, 15, 15, 15],
  },
  {
    id: "airport-baggage-conveyor",
    parentId: "baggage-drop-station",
    asset: "/scenes/airport-baggage-conveyor-premium-v1.jpg",
    sha256: "d9447e581a12127dabcf7c9df53e091c4026aea517e12124610d9c0d53b8ed93",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "office-break-room",
    parentId: "office-building",
    asset: "/scenes/office-break-room-premium-v1.jpg",
    sha256: "1fe63b2f3ca69e6a33f655c583c01655118ad4400b8b0d95342f04ab75f0f53d",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "airport-conveyor-drive-unit",
    parentId: "airport-baggage-conveyor",
    asset: "/scenes/airport-conveyor-drive-unit-premium-v1.jpg",
    sha256: "084c09e4e7703bbd1fb116eefb4b2274e48a8cc1ae3fdbd7b4e0ecbdb42b7f23",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
  },
  {
    id: "office-network-rack",
    parentId: "service-core",
    asset: "/scenes/office-network-rack-premium-v1.jpg",
    sha256: "bc42d7c3cb274f47451d0bdbede8c90d2c6ae9f7b21256b99884e98d5fea19da",
    labels: 150,
    zoneSizes: [25, 25, 25, 25, 25, 25],
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
    assert.equal(scene.visualRegions.length, contract.labels + scene.portals.length);
    assert.deepEqual(scene.detailZones.map(({ labelIds }: { labelIds: string[] }) => labelIds.length), contract.zoneSizes);
    assert.equal(new Set(scene.labels.map(({ id }: { id: string }) => id)).size, contract.labels);
    assert.equal(new Set(scene.labels.map(({ word }: { word: string }) => word.toLocaleLowerCase())).size, contract.labels);
    const labelsById = new Map<string, { id: string; x: number; y: number }>(
      scene.labels.map((label: { id: string; x: number; y: number }) => [label.id, label] as const),
    );
    for (const zone of scene.detailZones) {
      for (const labelId of zone.labelIds) {
        const label = labelsById.get(labelId);
        assert.ok(label, `${scene.id}/${zone.id} references ${labelId}`);
        assert.ok(
          label.x >= zone.x && label.x <= zone.x + zone.width
            && label.y >= zone.y && label.y <= zone.y + zone.height,
          `${scene.id}/${zone.id} contains ${labelId} at (${label.x}, ${label.y})`,
        );
      }
    }
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

test("baggage drop exposes a bounded central conveyor entrance", async () => {
  const parent = await readJson("baggage-drop-station.json");
  const portal = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "airport-baggage-conveyor");
  assert.ok(portal);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [700, 320, 285, 205]);
  const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
});

test("office building exposes a tight break-room entrance separate from the service core", async () => {
  const parent = await readJson("office-building.json");
  const portal = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "office-break-room");
  const serviceCore = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "service-core");
  assert.ok(portal);
  assert.ok(serviceCore);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [930, 360, 240, 190]);
  assert.ok(portal.x + portal.width <= serviceCore.x, "break-room and service-core entrances stay separate");
  const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
});

test("baggage drive and office rack portals target complete equipment without overlapping other entrances", async () => {
  const conveyor = await readJson("airport-baggage-conveyor.json");
  const drive = conveyor.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "airport-conveyor-drive-unit");
  assert.ok(drive);
  assert.deepEqual([drive.x, drive.y, drive.width, drive.height], [945, 540, 195, 170]);

  const serviceCore = await readJson("service-core.json");
  const rack = serviceCore.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "office-network-rack");
  const loadingDock = serviceCore.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "warehouse-loading-dock");
  assert.ok(rack);
  assert.ok(loadingDock);
  assert.deepEqual([rack.x, rack.y, rack.width, rack.height], [610, 130, 100, 220]);
  assert.ok(rack.x + rack.width <= loadingDock.x, "the rack entrance remains separate from the warehouse dock");
  for (const [parent, portal] of [[conveyor, drive], [serviceCore, rack]]) {
    const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  }
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

test("hospital bedspace, office reception and customs entrances use accurate separate crops", async () => {
  const contracts = [
    { file: "emergency-department.json", child: "hospital-inpatient-bedspace", rect: [1_090, 420, 480, 400] },
    { file: "office-building.json", child: "office-reception-lobby", rect: [0, 500, 300, 360] },
    { file: "baggage-claim.json", child: "airport-customs-hall", rect: [1_210, 75, 340, 320] },
    { file: "airport-customs-hall.json", child: "customs-baggage-examination", rect: [285, 230, 350, 300] },
  ];
  for (const contract of contracts) {
    const parent = await readJson(contract.file);
    const portal = parent.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === contract.child);
    assert.ok(portal, `${contract.child} portal must be present on ${contract.file}`);
    assert.deepEqual([portal.x, portal.y, portal.width, portal.height], contract.rect);
    const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], contract.rect);
    for (const other of parent.portals.filter(({ childSceneId }: { childSceneId: string }) => childSceneId !== contract.child)) {
      const separated = portal.x + portal.width <= other.x
        || other.x + other.width <= portal.x
        || portal.y + portal.height <= other.y
        || other.y + other.height <= portal.y;
      assert.ok(separated, `${contract.child} must not overlap ${other.childSceneId}`);
    }
  }
});

test("school campus exposes disjoint classroom, library and gymnasium entrances", async () => {
  const campus = await readJson("school-campus.json");
  const classroom = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "primary-classroom");
  const library = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "library-reading-room");
  const gymnasium = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-gymnasium-equipment");
  assert.ok(classroom);
  assert.ok(library);
  assert.ok(gymnasium);
  assert.deepEqual([classroom.x, classroom.y, classroom.width, classroom.height], [450, 0, 400, 305]);
  assert.deepEqual([gymnasium.x, gymnasium.y, gymnasium.width, gymnasium.height], [930, 306, 410, 239]);
  assert.ok(classroom.x + classroom.width <= library.x, "classroom and library crops must not overlap");
  assert.ok(library.y + library.height <= gymnasium.y, "library and gymnasium crops must not overlap");
  assert.ok(gymnasium.x + gymnasium.width <= 1_350, "gymnasium crop must exclude the adjacent washroom");
  for (const portal of [classroom, gymnasium]) {
    const region = campus.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  }
});

test("school campus exposes adjacent, non-overlapping art and music rooms", async () => {
  const campus = await readJson("school-campus.json");
  const art = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-art-studio");
  const music = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-music-room");
  const gymnasium = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-gymnasium-equipment");
  assert.ok(art);
  assert.ok(music);
  assert.ok(gymnasium);
  assert.deepEqual([art.x, art.y, art.width, art.height], [210, 306, 388, 239]);
  assert.deepEqual([music.x, music.y, music.width, music.height], [598, 306, 330, 239]);
  assert.ok(art.x + art.width <= music.x, "art and music room crops must not overlap");
  assert.ok(music.x + music.width <= gymnasium.x, "music and gymnasium crops must not overlap");
  for (const portal of [art, music]) {
    const region = campus.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  }
});

test("school campus exposes separate lower-floor infirmary and science-preparation rooms", async () => {
  const campus = await readJson("school-campus.json");
  const infirmary = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-infirmary");
  const science = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-science-preparation-room");
  const art = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-art-studio");
  const gymnasium = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-gymnasium-equipment");
  assert.ok(infirmary);
  assert.ok(science);
  assert.ok(art);
  assert.ok(gymnasium);
  assert.deepEqual([infirmary.x, infirmary.y, infirmary.width, infirmary.height], [0, 545, 382, 220]);
  assert.deepEqual([science.x, science.y, science.width, science.height], [1_050, 545, 500, 220]);
  assert.ok(art.y + art.height <= infirmary.y, "art and infirmary crops must not overlap vertically");
  assert.ok(gymnasium.y + gymnasium.height <= science.y, "gymnasium and science-preparation crops must not overlap vertically");
  assert.ok(infirmary.x + infirmary.width <= science.x, "lower-floor room crops must remain disjoint");
  for (const portal of [infirmary, science]) {
    const region = campus.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  }
});

test("the remaining central campus crop opens a corridor and the preparation-room door opens the science lab", async () => {
  const campus = await readJson("school-campus.json");
  const preparation = await readJson("school-science-preparation-room.json");
  const corridor = campus.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-corridor");
  const laboratory = preparation.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-science-laboratory");
  assert.ok(corridor);
  assert.ok(laboratory);
  assert.deepEqual([corridor.x, corridor.y, corridor.width, corridor.height], [382, 545, 668, 220]);
  assert.deepEqual([laboratory.x, laboratory.y, laboratory.width, laboratory.height], [285, 110, 155, 330]);
  for (const [parent, portal] of [[campus, corridor], [preparation, laboratory]]) {
    const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  }
});

test("the corridor dining doorway continues through the dining hall kitchen opening", async () => {
  const corridor = await readJson("school-corridor.json");
  const diningHall = await readJson("school-dining-hall.json");
  const diningPortal = corridor.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-dining-hall");
  const kitchenPortal = diningHall.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-catering-kitchen");
  assert.ok(diningPortal);
  assert.ok(kitchenPortal);
  assert.deepEqual([diningPortal.x, diningPortal.y, diningPortal.width, diningPortal.height], [690, 295, 270, 295]);
  assert.deepEqual([kitchenPortal.x, kitchenPortal.y, kitchenPortal.width, kitchenPortal.height], [1_045, 205, 260, 305]);
  for (const [parent, portal] of [[corridor, diningPortal], [diningHall, kitchenPortal]]) {
    const region = parent.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
    assert.ok(region);
    assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
  }
});

test("the corridor locker portal targets a separate complete door without covering existing anchors", async () => {
  const corridor = await readJson("school-corridor.json");
  const portal = corridor.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-locker-bank");
  const dining = corridor.portals.find(({ childSceneId }: { childSceneId: string }) => childSceneId === "school-dining-hall");
  assert.ok(portal);
  assert.ok(dining);
  assert.deepEqual([portal.x, portal.y, portal.width, portal.height], [1_518, 38, 77, 722]);
  const separated = portal.x + portal.width <= dining.x
    || dining.x + dining.width <= portal.x
    || portal.y + portal.height <= dining.y
    || dining.y + dining.height <= portal.y;
  assert.ok(separated, "locker and dining entrances remain disjoint");
  assert.equal(
    corridor.labels.filter(({ x, y }: { x: number; y: number }) => (
      x >= portal.x && x <= portal.x + portal.width && y >= portal.y && y <= portal.y + portal.height
    )).length,
    0,
    "the new hotspot must not hide existing corridor anchors",
  );
  const region = corridor.visualRegions.find(({ id }: { id: string }) => id === portal.sourceVisualRegion);
  assert.ok(region);
  assert.deepEqual([region.x, region.y, region.width, region.height], [portal.x, portal.y, portal.width, portal.height]);
});

test("the school locker bank remains a terminal spatial scene", async () => {
  const scene = await readJson("school-locker-bank.json");
  assert.deepEqual(scene.portals, [], "continued zoom stays inside the locker scene");
});
