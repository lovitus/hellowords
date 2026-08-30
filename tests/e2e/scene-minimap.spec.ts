import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const MINIMAP = '[data-testid="scene-minimap"]';
const CHILD = '[data-testid="scene-minimap-child"]';
const BREADCRUMB = '[data-testid="scene-minimap-breadcrumb"]';

interface MinimapTransitionProbe {
  hardTransitionAppeared: boolean;
  settled: Array<{ from: string; to: string }>;
  handoffs: Array<{
    sceneId: string | null;
    tileChild: string | null;
    tileState: string | null;
    mapDisabled: boolean;
    atlasDisabled: boolean;
  }>;
}

async function openWorld(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  return app;
}

async function startTransitionProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe: MinimapTransitionProbe = { hardTransitionAppeared: false, settled: [], handoffs: [] };
    const captureHandoff = () => {
      const appElement = document.querySelector<HTMLElement>('[data-testid="world-app"]');
      const tile = document.querySelector<HTMLElement>('[data-testid="scene-continuous-tile"]');
      if (!tile || tile.dataset.state !== "active") return;
      const mapButton = document.querySelector<HTMLButtonElement>(
        `[data-testid="scene-minimap-child"][data-target-scene="${CSS.escape(tile.dataset.childScene ?? "")}"]`,
      );
      const atlas = document.querySelector<HTMLButtonElement>(".atlas-button");
      const sample = {
        sceneId: appElement?.dataset.sceneId ?? null,
        tileChild: tile.dataset.childScene ?? null,
        tileState: tile.dataset.state ?? null,
        mapDisabled: mapButton?.disabled ?? false,
        atlasDisabled: atlas?.disabled ?? false,
      };
      if (probe.handoffs.at(-1)?.mapDisabled !== sample.mapDisabled) probe.handoffs.push(sample);
    };
    const inspect = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (
        node.matches(".scene-transition-veil, [data-testid='scene-transition-layer']")
        || node.querySelector(".scene-transition-veil, [data-testid='scene-transition-layer']")
      ) probe.hardTransitionAppeared = true;
    };
    const observer = new MutationObserver((records) => {
      for (const node of records.flatMap((record) => [...record.addedNodes])) inspect(node);
      captureHandoff();
    });
    const onSettled = (event: Event) => {
      const detail = (event as CustomEvent<{ from: string; to: string }>).detail;
      probe.settled.push({ from: detail.from, to: detail.to });
    };
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-scene-id", "disabled"],
    });
    window.addEventListener("world:scene-settled", onSettled);
    Reflect.set(window, "__sceneMinimapTransitionProbe", { probe, observer, onSettled });
  });
}

async function finishTransitionProbe(page: Page): Promise<MinimapTransitionProbe> {
  await expect.poll(() => page.evaluate(() => (
    (Reflect.get(window, "__sceneMinimapTransitionProbe") as {
      probe: MinimapTransitionProbe;
    }).probe.settled.length
  ))).toBeGreaterThan(0);
  return page.evaluate(() => {
    const state = Reflect.get(window, "__sceneMinimapTransitionProbe") as {
      probe: MinimapTransitionProbe;
      observer: MutationObserver;
      onSettled: (event: Event) => void;
    };
    state.observer.disconnect();
    window.removeEventListener("world:scene-settled", state.onSettled);
    return state.probe;
  });
}

test("the compact minimap exposes direct children, terminal state, and ancestor return", async ({ page }) => {
  const app = await openWorld(page);
  const minimap = page.locator(MINIMAP);
  await expect(minimap).toHaveAttribute("data-scene-id", "world-map");
  await expect(minimap).toHaveAttribute("data-child-count", "5");
  await expect(minimap).toHaveAttribute("data-terminal", "false");
  await expect(page.getByTestId("scene-minimap-title")).toHaveText("World atlas");
  await expect(page.getByTestId("scene-minimap-subtitle")).toHaveText(
    "Explore six detailed districts on one atlas",
  );
  await expect(page.locator(".scene-heading")).toHaveCount(0);
  await expect(minimap.locator(CHILD)).toHaveCount(5);
  expect((await minimap.locator(CHILD).evaluateAll((buttons) => buttons.map((button) => (
    (button as HTMLElement).dataset.targetScene
  )).sort()))).toEqual(["apartment", "city-park", "city-street", "community-garden", "school-campus"]);
  expect(await minimap.locator(CHILD).evaluateAll((buttons) => buttons.every((button) => (
    (button as HTMLElement).dataset.navigation === "portal-continuity"
  )))).toBe(true);
  const districts = minimap.locator('[data-testid="scene-minimap-district"]');
  await expect(districts).toHaveCount(6);
  expect(await districts.evaluateAll((buttons) => buttons.map((button) => (
    (button as HTMLElement).dataset.districtId
  )))).toEqual(["school", "science", "transport", "farm", "market", "wetland"]);
  expect(await districts.evaluateAll((buttons) => buttons.every((button) => (
    (button as HTMLElement).dataset.navigation === "detail-zone-focus"
      && Number.isFinite(Number((button as HTMLElement).dataset.focusX))
      && Number.isFinite(Number((button as HTMLElement).dataset.focusY))
      && Number((button as HTMLElement).dataset.labelCount) > 0
  )))).toBe(true);
  expect(await districts.evaluateAll((buttons) => buttons.reduce((sum, button) => (
    sum + Number((button as HTMLElement).dataset.labelCount)
  ), 0))).toBe(1275);
  if ((page.viewportSize()?.width ?? 1_000) <= 560) {
    expect(await minimap.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLElement>('[data-testid="scene-minimap-child"]')]
        .every((button) => {
          const childBounds = button.getBoundingClientRect();
          return childBounds.left >= bounds.left && childBounds.right <= bounds.right;
        });
    })).toBe(true);
  }

  const visualContract = await minimap.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const stage = document.querySelector<HTMLElement>(".world-stage")?.getBoundingClientRect();
    const style = getComputedStyle(element);
    const phone = window.innerWidth <= 560;
    const compact = window.innerWidth <= 900;
    return {
      width: bounds.width,
      height: bounds.height,
      background: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      imageVariable: element.getAttribute("style") ?? "",
      protectedRight: phone ? 312 : compact ? 348 : 412,
      protectedBottom: phone ? 112 : compact ? 116 : 126,
      rightInStage: bounds.right - (stage?.left ?? 0),
      bottomInStage: bounds.bottom - (stage?.top ?? 0),
    };
  });
  expect(visualContract.width).toBeLessThanOrEqual(370);
  expect(visualContract.height).toBeLessThan(130);
  expect(visualContract.rightInStage).toBeLessThanOrEqual(visualContract.protectedRight);
  expect(visualContract.bottomInStage).toBeLessThanOrEqual(visualContract.protectedBottom);
  expect(visualContract.background).toMatch(/^rgba\(.+, 0\.78\)$/);
  expect(visualContract.backgroundImage).toContain("linear-gradient");
  expect(visualContract.backgroundImage).toContain("world-mega-atlas-2604-v21.jpg");
  expect(visualContract.imageVariable).toContain("--scene-minimap-image");

  const scienceDistrict = minimap.locator(
    '[data-testid="scene-minimap-district"][data-district-id="science"]',
  );
  await scienceDistrict.click();
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(minimap.locator('[data-testid="scene-minimap-district"]')).toHaveCount(0);
  const scienceZones = minimap.locator('[data-testid="scene-minimap-zone"]');
  await expect(scienceZones).toHaveCount(12);
  expect(await scienceZones.evaluateAll((buttons) => buttons.every((button) => (
    (button as HTMLElement).dataset.navigation === "detail-zone-focus"
      && Number((button as HTMLElement).dataset.labelCount) > 0
  )))).toBe(true);

  const worldMapData = await page.request.get("/data/scenes/world-map.json").then((response) => response.json()) as {
    labels: Array<{ id: string; x: number; y: number }>;
    detailZones: Array<{ id: string; labelIds: string[]; x: number; y: number; width: number; height: number }>;
  };
  const utilityZone = worldMapData.detailZones.find((zone) => zone.id === "science-utilities");
  expect(utilityZone).toBeDefined();
  const utilityPoints = worldMapData.labels.filter((label) => utilityZone!.labelIds.includes(label.id));
  const utilityFocusX = utilityPoints.length === 0
    ? utilityZone!.x + utilityZone!.width / 2
    : (Math.min(...utilityPoints.map((label) => label.x)) + Math.max(...utilityPoints.map((label) => label.x))) / 2;
  const utilityFocusY = utilityPoints.length === 0
    ? utilityZone!.y + utilityZone!.height / 2
    : (Math.min(...utilityPoints.map((label) => label.y)) + Math.max(...utilityPoints.map((label) => label.y))) / 2;
  const utilityButton = minimap.locator('[data-testid="scene-minimap-zone"][data-zone-id="science-utilities"]');
  await expect(utilityButton).toHaveAttribute("data-focus-x", String(utilityFocusX));
  await expect(utilityButton).toHaveAttribute("data-focus-y", String(utilityFocusY));

  await expect(minimap.getByTestId("scene-minimap-district-back")).toBeVisible();
  const chemistryZone = minimap.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="science-chemistry-lab"]',
  );
  await chemistryZone.click();
  await expect.poll(async () => Number(await page.locator(".scene-surface").getAttribute("data-scene-scale"))).toBeGreaterThan(2.3);
  await expect.poll(async () => Number(await page.locator(".scene-surface").getAttribute("data-scene-scale"))).toBeGreaterThan(3.0);
  await expect(chemistryZone).toHaveAttribute("data-active", "true");
  await expect(chemistryZone).toHaveAttribute("aria-current", "location");
  await expect(page.getByTestId("scene-zone-focus-region")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("scene-zone-focus-region")).toHaveAttribute(
    "data-zone-id",
    "science-chemistry-lab",
  );
  await expect.poll(async () => page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".scene-surface");
    const button = document.querySelector<HTMLElement>('[data-testid="scene-minimap-zone"][data-zone-id="science-chemistry-lab"]');
    if (!surface || !button) return Number.POSITIVE_INFINITY;
    const x = Number(button.dataset.focusX);
    const y = Number(button.dataset.focusY);
    const matrix = new DOMMatrixReadOnly(getComputedStyle(surface).transform);
    const viewport = document.querySelector<HTMLElement>(".world-viewport")?.getBoundingClientRect();
    if (!viewport || !Number.isFinite(x) || !Number.isFinite(y)) return Number.POSITIVE_INFINITY;
    return Math.hypot(matrix.a * x + matrix.e - viewport.width / 2, matrix.d * y + matrix.f - viewport.height / 2);
  })).toBeLessThan(180);
  await minimap.getByTestId("scene-minimap-district-back").click();
  await expect(minimap.locator('[data-testid="scene-minimap-district"]')).toHaveCount(6);
  await expect(minimap.locator('[data-testid="scene-minimap-zone"]')).toHaveCount(0);
  await expect(page.getByTestId("scene-zone-focus-region")).toHaveAttribute("data-active", "false");

  await startTransitionProbe(page);
  const gardenButton = minimap.locator(`${CHILD}[data-target-scene="community-garden"]`);
  await gardenButton.hover();
  await gardenButton.click();
  const expectedHandoff = {
    sceneId: "world-map",
    tileChild: "community-garden",
    tileState: "active",
    mapDisabled: true,
    atlasDisabled: true,
  };
  await expect(app).toHaveAttribute("data-scene-id", "community-garden");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(minimap).toHaveAttribute("data-scene-id", "community-garden");
  await expect(minimap).toHaveAttribute("data-child-count", "2");
  await expect(minimap).toHaveAttribute("data-terminal", "false");
  await expect(minimap.locator(CHILD)).toHaveCount(2);
  expect((await minimap.locator(CHILD).evaluateAll((buttons) => buttons.map((button) => (
    (button as HTMLElement).dataset.targetScene
  )).sort()))).toEqual(["greenhouse-interior", "potting-workbench"]);
  const transition = await finishTransitionProbe(page);
  expect(transition.handoffs).toContainEqual(expectedHandoff);
  expect(transition.settled.at(-1)).toEqual({ from: "world-map", to: "community-garden" });
  expect(transition.hardTransitionAppeared).toBe(false);

  await minimap.locator(`${CHILD}[data-target-scene="potting-workbench"]`).click();
  await expect(app).toHaveAttribute("data-scene-id", "potting-workbench");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(minimap).toHaveAttribute("data-child-count", "0");
  await expect(minimap).toHaveAttribute("data-terminal", "true");
  await expect(page.getByTestId("scene-minimap-terminal")).toHaveText(/已到最深层/);

  const rootCrumb = minimap.locator(`${BREADCRUMB}[data-scene-id="world-map"]`);
  await expect(rootCrumb).toHaveAttribute("data-current", "false");
  await expect(rootCrumb).toBeEnabled();
  await rootCrumb.click();
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(minimap).toHaveAttribute("data-child-count", "5");
  await expect(minimap.locator(`${BREADCRUMB}[data-scene-id="world-map"]`)).toHaveAttribute(
    "data-current",
    "true",
  );
});

test("the home atlas keeps words hover-scoped to one district", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "the home contract is pointer-hover specific");
  await openWorld(page);

  const names = page.locator('[data-testid="atlas-category-nameplate"]');
  const words = page.locator('[data-testid="atlas-category-word"]');
  await expect(names).toHaveCount(6);
  await expect(words).toHaveCount(0);

  const campus = page.locator('[data-testid="atlas-category"][data-category-id="school"]');
  await campus.hover();
  await expect(page.getByTestId("atlas-category-layer")).toHaveAttribute(
    "data-active-category",
    "school",
  );
  await expect.poll(() => words.count()).toBeGreaterThan(0);
  expect(await words.evaluateAll((elements) => elements.every((element) => (
    (element as HTMLElement).dataset.categoryId === "school"
      && (element as HTMLElement).dataset.visible === "true"
  )))).toBe(true);
  await expect(names).toHaveCount(6);

  await page.mouse.move(8, 8);
  await expect(page.getByTestId("atlas-category-layer")).toHaveAttribute(
    "data-active-category",
    "none",
  );
  await expect(words).toHaveCount(0);
  await expect(names).toHaveCount(6);
});

test("child-scene minimaps focus the authored room zones without changing scene ownership", async ({ page }) => {
  const app = await openWorld(page);
  const minimap = page.locator(MINIMAP);
  await minimap.locator(`${CHILD}[data-target-scene="apartment"]`).click();
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const zones = minimap.locator('[data-testid="scene-minimap-scene-zones"]');
  await expect(zones).toBeVisible();
  expect(await zones.locator('[data-testid="scene-minimap-zone"]').evaluateAll((buttons) => (
    buttons.map((button) => (button as HTMLElement).dataset.zoneId)
  ))).toEqual([
    "living-room-detail",
    "kitchen-detail",
    "bedroom-detail",
    "bathroom-detail",
    "central-stair-upper-detail",
    "central-stair-lower-detail",
  ]);
  expect(await zones.locator('[data-testid="scene-minimap-zone"]').evaluateAll((buttons) => (
    buttons.every((button) => (
      Number((button as HTMLElement).dataset.labelCount) >= 4
      && Number.isFinite(Number((button as HTMLElement).dataset.focusX))
      && Number.isFinite(Number((button as HTMLElement).dataset.focusY))
    ))
  ))).toBe(true);

  const apartmentData = await page.request.get("/data/scenes/apartment.json").then((response) => response.json()) as {
    labels: Array<{ id: string; x: number; y: number }>;
    detailZones: Array<{ id: string; labelIds: string[]; x: number; y: number; width: number; height: number }>;
  };
  for (const zoneId of ["central-stair-upper-detail", "central-stair-lower-detail"]) {
    const zone = apartmentData.detailZones.find((candidate) => candidate.id === zoneId);
    expect(zone).toBeDefined();
    const points = apartmentData.labels.filter((label) => zone!.labelIds.includes(label.id));
    const expectedFocusX = points.length === 0
      ? zone!.x + zone!.width / 2
      : (Math.min(...points.map((label) => label.x)) + Math.max(...points.map((label) => label.x))) / 2;
    const expectedFocusY = points.length === 0
      ? zone!.y + zone!.height / 2
      : (Math.min(...points.map((label) => label.y)) + Math.max(...points.map((label) => label.y))) / 2;
    const button = zones.locator(`[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`);
    await expect(button).toHaveAttribute("data-focus-x", String(expectedFocusX));
    await expect(button).toHaveAttribute("data-focus-y", String(expectedFocusY));
  }

  const kitchen = zones.locator('[data-testid="scene-minimap-zone"][data-zone-id="kitchen-detail"]');
  await expect(kitchen).toBeEnabled();
  await kitchen.click();
  await expect.poll(async () => Number(await page.locator(".scene-surface").getAttribute("data-scene-scale")))
    .toBeGreaterThan(2.3);
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(kitchen).toHaveAttribute("data-active", "true");
  await expect(kitchen).toHaveAttribute("aria-current", "location");
  await expect(page.getByTestId("scene-zone-focus-region")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("scene-zone-focus-region")).toHaveAttribute(
    "data-zone-id",
    "kitchen-detail",
  );
});

test("the minimap exposes the complete color-coded ten-thousand-word plane", async ({ page }) => {
  await openWorld(page);
  const entry = page.getByTestId("scene-minimap-lexical");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAccessibleName(/10 个彩色领域.*10,000 词/);
  await entry.click();

  const field = page.getByTestId("semantic-zoom-field");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("data-level-total", "10");
  const realmNodes = field.locator('[data-semantic-node="true"][data-level="realm"]');
  await expect(realmNodes).toHaveCount(10);
  const representedWords = await realmNodes.evaluateAll((nodes) => nodes.reduce(
    (sum, node) => sum + Number((node as HTMLElement).dataset.count),
    0,
  ));
  expect(representedWords).toBe(10_000);
  expect(new Set(await realmNodes.evaluateAll((nodes) => nodes.map((node) => (
    (node as HTMLElement).dataset.paletteIndex
  )))).size).toBe(10);
});
