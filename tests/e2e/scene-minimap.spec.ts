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
  await expect(minimap).toHaveAttribute("data-child-count", "4");
  await expect(minimap).toHaveAttribute("data-terminal", "false");
  await expect(page.getByTestId("scene-minimap-title")).toHaveText("World atlas");
  await expect(page.getByTestId("scene-minimap-subtitle")).toHaveText(
    "Explore six detailed districts on one atlas",
  );
  await expect(page.locator(".scene-heading")).toHaveCount(0);
  await expect(minimap.locator(CHILD)).toHaveCount(4);
  expect((await minimap.locator(CHILD).evaluateAll((buttons) => buttons.map((button) => (
    (button as HTMLElement).dataset.targetScene
  )).sort()))).toEqual(["apartment", "city-park", "city-street", "community-garden"]);
  expect(await minimap.locator(CHILD).evaluateAll((buttons) => buttons.every((button) => (
    (button as HTMLElement).dataset.navigation === "portal-continuity"
  )))).toBe(true);
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
  await expect(minimap).toHaveAttribute("data-child-count", "4");
  await expect(minimap.locator(`${BREADCRUMB}[data-scene-id="world-map"]`)).toHaveAttribute(
    "data-current",
    "true",
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
