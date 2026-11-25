import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickPaintedWord, paintedWordCount, paintedWordState } from "./canvas-words";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';

interface WordTransitionStyle {
  display: string;
  opacity: number;
}

interface MobileLabelLayout {
  count: number;
  overlaps: string[];
  visible: Array<{ name: string; rect: { left: number; right: number; top: number; bottom: number; width: number; height: number } }>;
}

interface SceneLabelContract {
  readonly id: string;
  readonly labels: ReadonlyArray<{
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly minLevel?: number;
  }>;
}

async function openWorld(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).not.toHaveAttribute("data-scene-id", "");
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  return app;
}

async function sceneId(app: Locator) {
  const id = await app.getAttribute("data-scene-id");
  expect(id, "world-app must expose a non-empty data-scene-id").toBeTruthy();
  return id as string;
}

async function currentSceneLabelContract(page: Page): Promise<SceneLabelContract> {
  const currentId = await sceneId(page.locator(APP));
  return page.evaluate(async (id) => {
    const response = await fetch(`/data/scenes/${encodeURIComponent(id)}.json`);
    if (!response.ok) throw new Error(`Unable to load scene contract for ${id}`);
    return response.json() as Promise<SceneLabelContract>;
  }, currentId);
}

async function renderedWordCount(page: Page): Promise<number> {
  // Words are drawn by the label canvas. Its readable count covers hit-testable
  // words at or above the 0.52 legibility floor, including promoted spare-space
  // labels, so the density contract counts what is actually on screen.
  return page.locator(".label-canvas").evaluate((canvas) => (
    Number((canvas as HTMLCanvasElement).dataset.readableCount ?? "0")
  ));
}

async function wordTransitionStyle(label: Locator): Promise<WordTransitionStyle> {
  return label.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      display: style.display,
      opacity: Number.parseFloat(style.opacity),
    };
  });
}

function visibleInteractiveWordLabels(page: Page): Locator {
  return page.locator(
    '[data-testid="word-label"][data-visible="true"][data-interactive="true"]',
  );
}

async function zoomSceneToScale(
  page: Page,
  targetScale: number,
  requestedFocus?: { x: number; y: number },
) {
  const surface = page.locator(".scene-surface");
  const viewport = page.locator(VIEWPORT);
  const box = await viewport.boundingBox();
  expect(box, "world viewport must have a rendered hit area").not.toBeNull();
  const focus = requestedFocus ?? {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
  await page.mouse.move(focus.x, focus.y);

  await expect.poll(async () => {
    const scale = Number(await surface.getAttribute("data-scene-scale"));
    if (Number.isFinite(scale) && scale < targetScale) {
      const factor = Math.min(1.16, targetScale / Math.max(0.01, scale));
      await viewport.dispatchEvent("wheel", {
        clientX: focus.x,
        clientY: focus.y,
        deltaY: -Math.log(factor) / 0.00145,
        deltaMode: 0,
        bubbles: true,
        cancelable: true,
      });
    }
    return Number(await surface.getAttribute("data-scene-scale"));
  }, { intervals: [60], timeout: 5_000 }).toBeGreaterThanOrEqual(targetScale * 0.995);
}

async function closestAuthoredLabelToViewportCenter(
  page: Page,
  labels: SceneLabelContract["labels"],
) {
  return page.locator(VIEWPORT).evaluate((viewport, authoredLabels) => {
    const viewportRect = viewport.getBoundingClientRect();
    const centerX = viewportRect.left + viewportRect.width / 2;
    const centerY = viewportRect.top + viewportRect.height / 2;
    const surface = document.querySelector<HTMLElement>(".scene-surface");
    if (!surface) throw new Error("scene surface is required to project authored anchors");
    const camera = new DOMMatrixReadOnly(surface.style.transform);
    const closest = authoredLabels
      .map((label) => {
        const anchor = camera.transformPoint({
          x: label.x,
          y: label.y,
        });
        return {
          ...label,
          distance: Math.hypot(
            viewportRect.left + anchor.x - centerX,
            viewportRect.top + anchor.y - centerY,
          ),
        };
      })
      .sort((first, second) => first.distance - second.distance)[0];
    if (!closest?.id) throw new Error("an authored detail label is required");
    return closest;
  }, labels);
}

async function authoredAnchorScreenPoint(
  page: Page,
  anchor: Pick<SceneLabelContract["labels"][number], "x" | "y">,
): Promise<{ x: number; y: number }> {
  return page.locator(VIEWPORT).evaluate((viewport, authoredAnchor) => {
    const surface = document.querySelector<HTMLElement>(".scene-surface");
    if (!surface) throw new Error("scene camera is required to project an authored anchor");
    const anchor = new DOMMatrixReadOnly(surface.style.transform).transformPoint({
      x: authoredAnchor.x,
      y: authoredAnchor.y,
    });
    const viewportRect = viewport.getBoundingClientRect();
    return { x: viewportRect.left + anchor.x, y: viewportRect.top + anchor.y };
  }, anchor);
}

async function mobileLabelLayout(page: Page): Promise<MobileLabelLayout> {
  // Words are drawn on the canvas; each drawn word carries its painted box in
  // viewport coordinates. Overlap is judged on those boxes, as before.
  return page.locator(".label-canvas").evaluate((canvas) => {
    const painted = (canvas as HTMLCanvasElement & { paintedLabels?: Array<{
      word: string;
      interactive: boolean;
      opacity: number;
      centerX: number;
      centerY: number;
      width: number;
      height: number;
    }> }).paintedLabels ?? [];
    const canvasRect = canvas.getBoundingClientRect();
    const visible = painted.flatMap((label) => {
      if (!label.interactive || label.opacity < 0.52) return [];
      const left = canvasRect.left + label.centerX - label.width / 2;
      const top = canvasRect.top + label.centerY - label.height / 2;
      const rect = {
        left,
        top,
        right: left + label.width,
        bottom: top + label.height,
        width: label.width,
        height: label.height,
      };
      const viewportRect = canvasRect;
      const centerInsideViewport =
        rect.left + rect.width / 2 >= viewportRect.left &&
        rect.right - rect.width / 2 <= viewportRect.right &&
        rect.top + rect.height / 2 >= viewportRect.top &&
        rect.bottom - rect.height / 2 <= viewportRect.bottom;
      if (!centerInsideViewport) return [];
      return [{ name: label.word, rect }];
    });

    const overlaps: string[] = [];
    for (let leftIndex = 0; leftIndex < visible.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visible.length; rightIndex += 1) {
        const left = visible[leftIndex];
        const right = visible[rightIndex];
        const overlapWidth = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
        const overlapHeight = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
        if (overlapWidth > 2 && overlapHeight > 2) {
          overlaps.push(`${left.name} / ${right.name}`);
        }
      }
    }

    return { count: visible.length, overlaps, visible };
  });
}

async function zoomIntoFirstHotspot(page: Page, app: Locator) {
  const hotspot = page.locator('[data-testid="scene-hotspot"]').first();
  await expect(hotspot).toBeVisible();
  const target = await hotspot.getAttribute("data-target-scene");
  expect(target, "scene hotspots must expose data-target-scene").toBeTruthy();

  const box = await hotspot.boundingBox();
  expect(box, "the first scene hotspot must have a rendered hit area").not.toBeNull();
  await hotspot.click();
  const viewport = page.locator(VIEWPORT);
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(
    viewportBox!.x + viewportBox!.width / 2,
    viewportBox!.y + viewportBox!.height / 2,
  );

  await expect
    .poll(
      async () => {
        if ((await app.getAttribute("data-scene-id")) !== target) {
          await page.mouse.wheel(0, -24);
        }
        return app.getAttribute("data-scene-id");
      },
      { intervals: [220], timeout: 8_000 },
    )
    .toBe(target);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  return target as string;
}

async function zoomOutTo(page: Page, app: Locator, target: string) {
  const viewport = page.locator(VIEWPORT);
  const box = await viewport.boundingBox();
  expect(box, "world viewport must have a rendered hit area").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect
    .poll(
      async () => {
        if ((await app.getAttribute("data-scene-id")) !== target) {
          await page.mouse.wheel(0, 120);
        }
        return app.getAttribute("data-scene-id");
      },
      { intervals: [220], timeout: 8_000 },
    )
    .toBe(target);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
}

test("starts as a calm target-language world and persists the meaning toggle", async ({
  page,
}) => {
  await openWorld(page);

  const toggle = page.getByTestId("meaning-toggle");
  const translations = page.getByTestId("word-translation");
  const detailCue = page.locator(
    '[data-testid="scene-vocabulary-cue"][data-cue-source="authored-zone"]',
  ).first();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(translations).toHaveCount(0);
  await expect(detailCue).toHaveCount(0);
  await expect(page.getByTestId("word-label")).toHaveCount(0);
  const category = page.getByTestId("atlas-category").first();
  await expect(category.getByTestId("atlas-category-nameplate")).toContainText("Campus");
  await expect(category.getByTestId("atlas-category-nameplate")).not.toContainText("校园");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(category.getByTestId("atlas-category-nameplate")).toContainText("校园");
  await category.hover();
  await expect(page.getByTestId("atlas-category-layer")).toHaveAttribute(
    "data-active-category",
    "school",
  );
  const categoryWords = page.getByTestId("atlas-category-word");
  await expect.poll(() => categoryWords.count()).toBeGreaterThan(0);
  await expect(categoryWords.first()).toHaveAttribute("data-category-id", "school");
  await expect(page.locator('[data-testid="atlas-category-word"][data-category-id="science"]'))
    .toHaveCount(0);
  await expect(page.getByTestId("atlas-category-vocabulary")).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("atlas-category").first().getByTestId("atlas-category-nameplate"))
    .toContainText("校园");
});

test("loads the 10,000-word field only on request and searches all 44 shards once", async ({ page }) => {
  const lexicalRequests: string[] = [];
  const topicShardRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/data\/(?:lexical-world|semantic)\/.+\.json$/.test(pathname)) lexicalRequests.push(pathname);
    if (/\/data\/semantic\/topics\/.+\.json$/.test(pathname)) topicShardRequests.push(pathname);
  });
  await openWorld(page);
  expect(lexicalRequests).toHaveLength(0);

  await page.getByRole("button", { name: "打开 10 个视觉领域、758 个分层入口和 10,000 个词" }).click();
  const universe = page.getByRole("dialog", { name: "一万个词的分层探索世界" });
  const field = universe.getByTestId("semantic-zoom-field");
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("aria-busy", "false");
  const realmNodes = field.locator('[data-testid="semantic-zoom-node"][data-level="realm"]');
  await expect(realmNodes).toHaveCount(10);
  const representedWords = await realmNodes.evaluateAll((nodes) => nodes.reduce(
    (sum, node) => sum + Number((node as HTMLElement).dataset.count),
    0,
  ));
  expect(representedWords).toBe(10_000);

  const search = page.getByPlaceholder("搜索 10,000 个词…");
  await search.fill("coffee");
  const result = universe.locator(".lexical-world__results li").filter({ hasText: /coffee/i }).first();
  await expect(result).toContainText(/coffee/i);
  await expect.poll(() => new Set(topicShardRequests).size).toBe(44);
  expect(topicShardRequests).toHaveLength(44);
  expect(new Set(lexicalRequests).size).toBe(lexicalRequests.length);
  await result.getByRole("button").click();
  await expect(field).toHaveAttribute("data-level", "realm");
  const selectedCard = page.getByRole("complementary", { name: /coffee 词汇详情/i });
  await expect(selectedCard).toContainText(/coffee/i);
  await expect(selectedCard.locator("p").last()).toContainText(/\p{Script=Han}/u);
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(field.locator(".semantic-zoom-field__node > span:not(.semantic-zoom-field__node-dot)")).toHaveCount(0);
});

test("a selected word reveals its meaning while global scene meanings stay off", async ({ page }) => {
  await openWorld(page);
  await expect(page.getByLabel(/已遇见 \d+ 个词/)).toBeVisible();
  const toggle = page.getByTestId("meaning-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  const category = page.getByTestId("atlas-category").first();
  await category.getByTestId("atlas-category-hit").click();
  const label = page.getByTestId("atlas-category-word").first();
  await expect(label).toBeVisible();
  const word = await label.getAttribute("data-word");
  expect(word, "the selected visible label must expose its target-language word").toBeTruthy();
  await clickPaintedWord(page, (await label.getAttribute("data-label-id"))!);
  const card = page.getByRole("complementary", { name: `${word!} word details` });
  await expect(card).toBeVisible();
  const selectedMeaning = card.locator("p").first();
  await expect(selectedMeaning).toContainText(/\p{Script=Han}/u);
  await expect(selectedMeaning).not.toContainText("释义已关闭");
  await expect(page.getByTestId("word-translation")).toHaveCount(0);

  const meaning = await selectedMeaning.innerText();
  await toggle.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(selectedMeaning).toHaveText(meaning);
  await card.getByRole("button", { name: "关闭单词卡" }).click();
  await expect(card).toBeHidden();
});

test("the home atlas keeps its artwork clear and reveals only the hovered district words", async ({ page }) => {
  await openWorld(page);
  const sceneContract = await currentSceneLabelContract(page);
  const progress = page.getByTestId("scene-word-progress");
  expect(sceneContract.labels.length).toBeGreaterThanOrEqual(300);
  await expect(progress).toHaveAttribute("data-total", String(sceneContract.labels.length));
  await expect(page.getByTestId("word-label")).toHaveCount(0);

  const expectedCounts = await page.evaluate(async () => {
    const response = await fetch("/data/scenes/world-map.json");
    const scene = await response.json() as {
      detailZones: Array<{ id: string; labelIds: string[] }>;
    };
    return ["school-", "science-", "transport-", "farm-", "market-", "wetland-"]
      .map((prefix) => new Set(
        scene.detailZones
          .filter((zone) => zone.id.startsWith(prefix))
          .flatMap((zone) => zone.labelIds),
      ).size);
  });
  const categories = page.getByTestId("atlas-category");
  await expect(categories).toHaveCount(expectedCounts.length);
  await expect(page.getByTestId("atlas-category-nameplate")).toHaveCount(expectedCounts.length);
  await expect(page.getByTestId("atlas-category-word")).toHaveCount(0);
  await expect(page.getByTestId("atlas-category-vocabulary")).toHaveCount(0);

  const categoryIds = ["school", "science", "transport", "farm", "market", "wetland"];
  for (let index = 0; index < expectedCounts.length; index += 1) {
    await categories.nth(index).hover();
    await expect(page.getByTestId("atlas-category-layer")).toHaveAttribute(
      "data-active-category",
      categoryIds[index],
    );
    const words = page.getByTestId("atlas-category-word");
    await expect.poll(() => words.count()).toBeGreaterThan(0);
    expect(await words.count()).toBeLessThanOrEqual(expectedCounts[index]);
    expect(new Set(await words.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-category-id")))))
      .toEqual(new Set([categoryIds[index]]));
    await expect(page.getByTestId("atlas-category-vocabulary")).toHaveCount(0);
  }

  const viewport = page.locator(VIEWPORT);
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(
    viewportBox!.x + viewportBox!.width / 2,
    viewportBox!.y + viewportBox!.height - 3,
  );
  await expect(page.getByTestId("atlas-category-layer")).toHaveAttribute(
    "data-active-category",
    "none",
  );
  await expect(page.getByTestId("word-label")).toHaveCount(0);
  await expect(page.getByTestId("atlas-category-word")).toHaveCount(0);
  await expect(categories).toHaveCount(expectedCounts.length);
});

test("five authored LOD bands use spare space and remain readable while zooming", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await openWorld(page);
  const app = page.locator(APP);
  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="city-street"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "city-street");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(page.locator(".viewer-shell")).toHaveAttribute("data-interaction-locked", "false");
  await expect(page.getByTestId("scene-label-layer")).toHaveAttribute("data-motion-frozen", "false");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-motion-frozen", "false");
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  // The handoff guard intentionally owns the first 180ms of wheel input;
  // start this independent zoom gesture after that quiet window.
  await page.waitForTimeout(220);
  const sceneContract = await currentSceneLabelContract(page);
  const surface = page.locator(".scene-surface");
  await expect(surface).toHaveAttribute("data-lod-level", "1");
  const authoredLods = [...new Set(sceneContract.labels.map((label) => label.minLevel ?? 0))]
    .sort((first, second) => first - second);
  expect(authoredLods).toEqual([0, 1, 2, 3, 4]);
  const mountedLabels = page.getByTestId("word-label");
  expect(await mountedLabels.count()).toBeGreaterThanOrEqual(30);
  expect(await mountedLabels.count()).toBeLessThanOrEqual(256);
  await expect.poll(() => renderedWordCount(page), {
    message: "desktop overview must expose at least 18 readable, visually grounded words",
  }).toBeGreaterThanOrEqual(18);
  const overviewReadableWordCount = await renderedWordCount(page);

  const detailContract = await closestAuthoredLabelToViewportCenter(
    page,
    sceneContract.labels.filter((label) => (label.minLevel ?? 0) === 4),
  );
  const detailLabel = page.locator(`.word-label[data-label-id="${detailContract.id}"]`);
  if (await detailLabel.count() === 1) {
    const initialDetailStyle = await wordTransitionStyle(detailLabel);
    expect(initialDetailStyle.display, "a mounted authored detail remains renderable").not.toBe("none");
    // Behaviour: a detail word is either drawn readable and reachable, or not
    // drawn at all and out of the keyboard order. The painted state decides.
    const painted = await paintedWordState(page, detailContract.id);
    if (painted?.interactive) {
      expect(painted.opacity, "a drawn detail word must be readable").toBeGreaterThanOrEqual(0.52);
      await expect(detailLabel).toHaveAttribute("aria-hidden", "false");
      await expect(detailLabel).toHaveAttribute("tabindex", "0");
    } else {
      expect(initialDetailStyle.opacity, "an undrawn detail word stays transparent").toBeLessThanOrEqual(0.05);
      await expect(detailLabel).toHaveAttribute("aria-hidden", "true");
      await expect(detailLabel).toHaveAttribute("tabindex", "-1");
    }
  }

  await zoomSceneToScale(page, 1.22);
  await expect(surface).toHaveAttribute("data-lod-level", "2");
  const retainedReadableFloor = Math.max(18, Math.floor(overviewReadableWordCount * 0.8));
  await expect.poll(() => renderedWordCount(page), {
    message: "the first zoom step must retain at least 80% of the readable overview vocabulary",
  }).toBeGreaterThanOrEqual(retainedReadableFloor);

  await page.getByRole("button", { name: "Fit scene" }).click();
  await expect(surface).toHaveAttribute("data-scene-scale", "1.000");
  const authoredFocus = await authoredAnchorScreenPoint(page, detailContract);
  await zoomSceneToScale(page, 3.12, authoredFocus);
  await expect(surface).toHaveAttribute("data-lod-level", "4");
  await expect(detailLabel).toHaveCount(1);
  await expect(detailLabel).toBeVisible();
  // The canvas draws the word; its DOM mirror stays transparent by design.
  await expect.poll(async () => (await paintedWordState(page, detailContract.id))?.opacity ?? 0)
    .toBeGreaterThanOrEqual(0.95);
  await expect(detailLabel).toHaveAttribute("aria-hidden", "false");
  await expect(detailLabel).toHaveAttribute("tabindex", "0");
});

test("the apartment minimap reveals a detail zone and leaves its drawn words keyboard accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = await openWorld(page);
  await page.locator('[data-testid="scene-minimap-child"][data-target-scene="apartment"]').click();
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const zoneId = "kitchen-detail";
  const zone = page.locator(`[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`);
  await zone.focus();
  await zone.press("Enter");
  await expect(zone).toHaveAttribute("aria-current", "location");
  await expect(page.getByTestId("scene-zone-focus-region")).toHaveAttribute("data-zone-id", zoneId);
  await expect(app).toHaveAttribute("data-scene-id", "apartment");
  await expect(page.getByTestId("scene-vocabulary-summary")).toBeHidden();
  const labelIds = await page.evaluate(async (id) => {
    const payload = await (await fetch("/data/scenes/apartment.json")).json();
    return payload.detailZones.find((zone: { id: string }) => zone.id === id).labelIds as string[];
  }, zoneId);
  const label = page.locator(labelIds.map((id) => `.word-label[data-label-id="${id}"]:focus`).join(","));
  // Start from the activated minimap zone and use the document's real tab
  // order. A forced focus on a word would bypass a broken keyboard path.
  const tabLimit = await page.locator("button:enabled, a[href], input, [tabindex='0']").count();
  for (let step = 0; step < tabLimit && await label.count() === 0; step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(label, "Tab must reach a word in the selected kitchen zone").toBeFocused();
  await expect(label).toHaveAttribute("tabindex", "0");
  const id = await label.getAttribute("data-label-id");
  const word = await label.getAttribute("data-word");
  const painted = await paintedWordState(page, id!);
  expect(painted?.interactive, `${word} must be drawn and interactive`).toBe(true);
  expect(painted!.opacity).toBeGreaterThanOrEqual(0.52);
  await page.keyboard.press("Enter");
  await expect(page.locator(".word-dock strong")).toHaveText(word!);
});

test("enters a scene slice on zoom and returns to its parent", async ({ page }) => {
  const requestedSceneAssets: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (/\/scenes\/.*\.(?:svg|jpe?g|webp|avif)(?:\?|$)/.test(url)) {
      requestedSceneAssets.push(url);
    }
  });

  const app = await openWorld(page);
  const parent = await sceneId(app);
  const child = await zoomIntoFirstHotspot(page, app);
  expect(child).not.toBe(parent);
  await expect(page.getByTestId("word-label").first()).toBeVisible();

  await zoomOutTo(page, app, parent);
  expect(await sceneId(app)).toBe(parent);

  const requestedBeforeRevisit = new Set(requestedSceneAssets);
  await zoomIntoFirstHotspot(page, app);
  await zoomOutTo(page, app, parent);
  expect(
    new Set(requestedSceneAssets),
    "revisiting the same child must not introduce a new scene asset URL",
  ).toEqual(requestedBeforeRevisit);
});

test("battery pack exposes its expanded grounded vocabulary through the real portal path", async ({ page }) => {
  const app = await openWorld(page);
  for (const target of ["city-street", "transit-hub", "electric-bus", "battery"]) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    if (target === "hemoglobin") {
      await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "51");
      await expect.poll(() => page.locator(
        '[data-testid="word-label"][data-visible="true"][data-interactive="true"]',
      ).count()).toBeGreaterThan(8);
      for (const [zoneId, word] of [
        ["alpha-folds", "helix bundle"],
        ["tetramer-core", "alpha beta dimer"],
        ["heme-architecture", "heme plane"],
        ["oxygen-coordination", "oxygen ligand"],
        ["histidine-pocket", "histidine ring"],
      ] as const) {
        const zone = page.locator(
          `[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`,
        );
        await zone.click();
        await expect(zone).toHaveAttribute("data-active", "true");
        await expect.poll(() => paintedWordCount(page, word)).toBeGreaterThan(0);
      }
      await page.getByRole("button", { name: "Fit scene" }).click();
      await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "51");
    }
  }

  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "90");
  await expect.poll(() => page.locator(
    '[data-testid="word-label"][data-visible="true"][data-interactive="true"]',
  ).count()).toBeGreaterThan(8);

  const indexToggle = page.getByTestId("scene-word-index-toggle");
  await indexToggle.click();
  const index = page.getByTestId("scene-word-index");
  await expect(index).toBeVisible();
  const search = index.getByRole("searchbox");
  await search.fill("coolant tee");
  await expect(index.getByTestId("scene-word-index-result").first()).toContainText("coolant tee");
  await index.getByRole("button", { name: "关闭场景词索引" }).click();

  const lidZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="lid-and-seal"]',
  );
  await lidZone.click();
  await expect(lidZone).toHaveAttribute("data-active", "true");
  await expect.poll(() => paintedWordCount(page, "lid port")).toBeGreaterThan(0);

  const terminalZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="power-terminal"]',
  );
  await terminalZone.click();
  await expect(terminalZone).toHaveAttribute("data-active", "true");
  await expect.poll(() => paintedWordCount(page, "terminal lug")).toBeGreaterThan(0);

  await page.getByTestId("scene-minimap-children").getByRole("button", {
    name: "进入 Lithium-ion cell",
  }).click();
  await expect(app).toHaveAttribute("data-scene-id", "lithium-ion-cell");
  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "60");
  const cellLidZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="positive-terminal-detail"]',
  );
  await cellLidZone.click();
  await expect.poll(() => paintedWordCount(page, "positive terminal seal")).toBeGreaterThan(0);
  const layerZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="unfolded-layer-edges"]',
  );
  await layerZone.click();
  await expect.poll(() => paintedWordCount(page, "electrode fold")).toBeGreaterThan(0);
});

test("water tank exposes its new lid, water-surface, filter, and base parts", async ({ page }) => {
  const app = await openWorld(page);
  for (const target of ["apartment", "kitchen", "coffee-machine", "water-tank"]) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }

  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "61");
  const lidZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="lid-corner-detail"]',
  );
  await lidZone.click();
  await expect.poll(() => paintedWordCount(page, "lid corner")).toBeGreaterThan(0);

  const waterZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="surface-ripple-detail"]',
  );
  await waterZone.click();
  await expect.poll(() => paintedWordCount(page, "surface ripple")).toBeGreaterThan(0);

  const outletZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="filter-cup-detail"]',
  );
  await outletZone.click();
  await expect.poll(() => paintedWordCount(page, "filter cup")).toBeGreaterThan(0);

  const baseZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="base-bracket-detail"]',
  );
  await baseZone.click();
  await expect.poll(() => paintedWordCount(page, "base bracket")).toBeGreaterThan(0);
});

test("plant cell exposes its organelle subparts through the real leaf path", async ({ page }, testInfo) => {
  const app = await openWorld(page);
  for (const target of ["city-park", "oak-tree", "leaf", "plant-cell"]) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }

  if (testInfo.project.name === "mobile-chromium") {
    await expect(page.getByRole("button", { name: /搜索当前场景的 60 个词/ })).toBeVisible();
  } else {
    await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "60");
  }
  const expectPlantZoneWord = async (word: string) => {
    if (testInfo.project.name === "mobile-chromium") {
      await expect.poll(async () => Number(
        await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
      )).toBeGreaterThan(0);
      return;
    }
    await expect.poll(() => paintedWordCount(page, word), { message: `${word} should be visible` }).toBeGreaterThan(0);
  };
  const nucleusZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="nucleus-and-er"]',
  );
  await nucleusZone.click();
  await expectPlantZoneWord("rough ER sheet");

  const chloroplastZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="thylakoid-stack-detail"]',
  );
  await chloroplastZone.click();
  await expectPlantZoneWord("thylakoid membrane");

  const mitochondriaZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="mitochondrion-detail"]',
  );
  await mitochondriaZone.click();
  await expectPlantZoneWord("crista tip");

  const wallZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="upper-wall-junction"]',
  );
  await wallZone.click();
  await expectPlantZoneWord("cell wall junction");
});

test("oxygen scene exposes its expanded exchange path through the real blood route", async ({ page }) => {
  const app = await openWorld(page);
  for (const target of [
    "city-street",
    "science-museum",
    "human-body",
    "heart",
    "blood-cell",
    "hemoglobin",
    "oxygen-molecule",
  ]) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }

  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "90");
  for (const [zoneId, word] of [
    ["airway-cluster", "alveolar network"],
    ["alveolar-chamber", "alveolar opening"],
    ["air-blood-barrier", "respiratory membrane"],
    ["erythrocyte-detail", "red cell dimple"],
  ] as const) {
    const zone = page.locator(
      `[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`,
    );
    await zone.click();
    await expect(zone).toHaveAttribute("data-active", "true");
    await expect.poll(() => paintedWordCount(page, word), { message: `${zoneId}/${word} should be visible` }).toBeGreaterThan(0);
  }
});

test("polymer scene exposes its expanded material structures through the machine route", async ({ page }) => {
  const app = await openWorld(page);
  for (const target of ["apartment", "kitchen", "coffee-machine", "water-tank", "polymer"]) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }

  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "60");
  for (const [zoneId, word] of [
    ["macro-material-forms", "material cross section"],
    ["semicrystalline-morphology", "spherulite ray"],
    ["defects-and-additives", "pore rim"],
    ["molecular-architecture", "chain junction"],
  ] as const) {
    const zone = page.locator(
      `[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`,
    );
    await zone.click();
    await expect(zone).toHaveAttribute("data-active", "true");
    await expect.poll(() => paintedWordCount(page, word)).toBeGreaterThan(0);
  }
});

test("science museum exposes additional exhibit parts without losing its child portals", async ({ page }, testInfo) => {
  const app = await openWorld(page);
  for (const target of ["city-street", "science-museum"]) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }

  const museumViewport = await page.locator(VIEWPORT).boundingBox();
  expect(museumViewport).not.toBeNull();
  await page.mouse.move(
    museumViewport!.x + museumViewport!.width / 2,
    museumViewport!.y + museumViewport!.height - 36,
  );
  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "206");
  for (const [zoneId, word] of [
    ["dinosaur-gallery", "vertebra"],
    ["space-observatory", "mounting knob"],
    ["microscopy-and-robotics", "robot link"],
    ["matter-and-physics", "prism edge"],
    ["life-science-alcove", "anatomy leg"],
  ] as const) {
    const zone = page.locator(
      `[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`,
    );
    await zone.click();
    await expect(zone).toHaveAttribute("data-active", "true");
    if (testInfo.project.name === "mobile-chromium") {
      await expect.poll(async () => Number(
        await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
      )).toBeGreaterThan(0);
    } else {
      await expect.poll(() => paintedWordCount(page, word)).toBeGreaterThan(0);
    }
  }

  await expect(page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="dinosaur-hall"]',
  )).toBeVisible();
  await expect(page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="human-body"]',
  )).toBeVisible();
});

test("city park exposes its expanded nature and fixture vocabulary without losing both child portals", async ({ page }, testInfo) => {
  const app = await openWorld(page);
  await page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="city-park"]',
  ).first().click();
  await expect(app).toHaveAttribute("data-scene-id", "city-park");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(app).toHaveAttribute("data-transition-state", "idle");

  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "174");
  for (const [zoneId, word] of [
    ["pond-habitat-detail", "pond basin"],
    ["oak-tree-detail", "acorn stem"],
    ["playground-detail", "playground rail"],
    ["fountain-garden-detail", "fountain nozzle"],
    ["park-foreground-detail", "root flare"],
  ] as const) {
    const zone = page.locator(
      `[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`,
    );
    await zone.click();
    await expect(zone).toHaveAttribute("data-active", "true");
    if (testInfo.project.name === "mobile-chromium") {
      await expect.poll(async () => Number(
        await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
      )).toBeGreaterThan(0);
    } else {
      await expect.poll(() => paintedWordCount(page, word)).toBeGreaterThan(0);
    }
  }

  await expect(page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="oak-tree"]',
  )).toBeVisible();
  await expect(page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="pond-edge"]',
  )).toBeVisible();
});

test("urban services exposes hospital, airport and office vocabulary through the transit path", async ({ page }, testInfo) => {
  const app = await openWorld(page);
  for (const target of ["city-street", "transit-hub", "urban-services"] as const) {
    await page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    ).first().click();
    await expect(app).toHaveAttribute("data-scene-id", target);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }

  const urbanViewport = await page.locator(VIEWPORT).boundingBox();
  expect(urbanViewport).not.toBeNull();
  await page.mouse.move(
    urbanViewport!.x + urbanViewport!.width / 2,
    urbanViewport!.y + urbanViewport!.height - 36,
  );
  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "120");
  for (const [zoneId, word] of [
    ["hospital-campus-detail", "medical center"],
    ["airport-campus-detail", "terminal"],
    ["office-campus-detail", "office lobby"],
    ["district-connectors-detail", "planting bed"],
  ] as const) {
    const zone = page.locator(
      `[data-testid="scene-minimap-zone"][data-zone-id="${zoneId}"]`,
    );
    await zone.click();
    await expect(zone).toHaveAttribute("data-active", "true");
    if (testInfo.project.name === "mobile-chromium") {
      await expect.poll(async () => Number(
        await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
      )).toBeGreaterThan(0);
    } else {
      await expect.poll(() => paintedWordCount(page, word)).toBeGreaterThan(0);
    }
  }
  for (const target of ["hospital", "airport", "office-building"] as const) {
    await expect(page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${target}"]`,
    )).toBeVisible();
  }

  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="hospital"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "hospital");
  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "440");
  const emergencyZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="emergency-department-detail"]',
  );
  await emergencyZone.click();
  await expect.poll(() => paintedWordCount(page, "defibrillator"), { message: "hospital emergency focus should show defibrillator" }).toBeGreaterThan(0);
  const pathologyZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="pathology-laboratory-detail"]',
  );
  await pathologyZone.click();
  if (testInfo.project.name === "mobile-chromium") {
    await expect.poll(async () => Number(
      await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
    )).toBeGreaterThan(0);
  } else {
    await expect.poll(() => paintedWordCount(page, "microscope")).toBeGreaterThan(0);
  }
  const clinicalZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="clinical-reference-detail"]',
  );
  await clinicalZone.click();
  await expect.poll(() => paintedWordCount(page, "diagnosis")).toBeGreaterThan(0);
  const pharmacyZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="pharmacy-dispensary-detail"]',
  );
  await pharmacyZone.click();
  if (testInfo.project.name === "mobile-chromium") {
    await expect.poll(async () => Number(
      await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
    )).toBeGreaterThan(0);
  } else {
    await expect.poll(() => paintedWordCount(page, "ibuprofen")).toBeGreaterThan(0);
  }

  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="pathology-lab"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "pathology-lab");
  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "450");
  const labDisplayZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="clinical-display-detail"]',
  );
  await labDisplayZone.click();
  if (testInfo.project.name === "mobile-chromium") {
    await expect.poll(async () => Number(
      await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
    )).toBeGreaterThan(0);
  } else {
    await expect.poll(() => paintedWordCount(page, "histology slide")).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "← 返回上一层" }).click();
  await expect(app).toHaveAttribute("data-scene-id", "hospital");
  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="hospital-pharmacy"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "hospital-pharmacy");
  await expect(page.getByTestId("scene-word-progress")).toHaveAttribute("data-total", "390");
  const medicineZone = page.locator(
    '[data-testid="scene-minimap-zone"][data-zone-id="medicine-shelves-detail"]',
  );
  await medicineZone.click();
  if (testInfo.project.name === "mobile-chromium") {
    await expect.poll(async () => Number(
      await page.locator(".scene-surface").getAttribute("data-visible-label-count"),
    )).toBeGreaterThan(0);
  } else {
    await expect.poll(() => paintedWordCount(page, "losartan")).toBeGreaterThan(0);
  }
});

test("root atlas wheel zoom stays on one scene until an entry is explicitly clicked", async ({ page }) => {
  const app = await openWorld(page);
  const parent = await sceneId(app);
  expect(parent).toBe("world-map");
  const hotspot = page.getByTestId("scene-hotspot").first();
  const target = await hotspot.getAttribute("data-target-scene");
  const box = await hotspot.boundingBox();
  expect(target).toBeTruthy();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  // Stop below the semantic overscroll boundary so the explicit portal
  // control remains available for the second half of this contract.
  await zoomSceneToScale(page, 3.35, {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  });
  await expect.poll(async () => Number(await page.locator(".scene-surface").getAttribute("data-scene-scale")))
    .toBeGreaterThan(2.5);
  expect(await sceneId(app)).toBe(parent);
  await expect(page.locator(
    `.scene-hotspot-region[data-portal-entry-mode="click"]`,
  )).toHaveCount(6);
  const mapEntry = page.locator(
    `[data-testid="scene-minimap-child"][data-target-scene="${target}"]`,
  );
  await expect(mapEntry).toBeEnabled();
  await mapEntry.click();
  await expect(app).toHaveAttribute("data-scene-id", target as string);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
});

test("the current-scene word index finds and focuses a real label without a scene jump", async ({ page }) => {
  const app = await openWorld(page);
  const toggle = page.getByTestId("scene-word-index-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();

  const index = page.getByTestId("scene-word-index");
  await expect(index).toBeVisible();
  await expect(index.getByTestId("scene-word-index-summary")).toContainText("1289");
  await expect(index.getByTestId("scene-word-index-result")).toHaveCount(32);
  await expect(index.getByRole("searchbox")).toBeVisible();
  expect(await page.evaluate(() => {
    const panel = document.querySelector("[data-testid='scene-word-index']")?.getBoundingClientRect();
    if (!panel) return -1;
    const overlap = (a: DOMRect, b: DOMRect) => (
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    );
    return [...document.querySelectorAll(".word-label[data-visible='true'][data-interactive='true']")]
      .map((element) => element.getBoundingClientRect())
      .filter((bounds) => overlap(bounds, panel)).length;
  })).toBe(0);

  const input = index.getByRole("searchbox");
  await input.fill("tractor");
  await expect.poll(() => index.getByTestId("scene-word-index-result").count()).toBeGreaterThan(0);
  const result = index.getByTestId("scene-word-index-result").filter({ hasText: "farm tractor" });
  await expect(result).toHaveCount(1);
  await result.click();

  await expect(index).toBeHidden();
  await expect(app).toHaveAttribute("data-scene-id", "world-map");
  await expect(page.locator(".word-dock")).toContainText("farm tractor");
  await expect.poll(async () => Number(await page.locator(".scene-surface").getAttribute("data-scene-scale")))
    .toBeGreaterThanOrEqual(1.19);
  expect(await page.evaluate(() => {
    const panel = document.querySelector("[data-testid='scene-word-index']");
    return panel === null;
  })).toBe(true);
});

test("hysteresis prevents scene thrashing near a zoom boundary", async ({ page }) => {
  const app = await openWorld(page);
  const parent = await sceneId(app);
  const child = await zoomIntoFirstHotspot(page, app);
  const observed: string[] = [];

  const viewport = page.locator(VIEWPORT);
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  for (let index = 0; index < 50; index += 1) {
    await page.mouse.wheel(0, index % 2 === 0 ? 24 : -24);
    observed.push(await sceneId(app));
  }

  expect(new Set(observed)).toEqual(new Set([child]));
  await zoomOutTo(page, app, parent);
});

test("mobile viewport exposes touch-safe labels and hotspots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await openWorld(page);
  const app = page.locator(APP);
  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="city-street"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "city-street");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await expect(visibleInteractiveWordLabels(page).first()).toBeVisible();
  await expect
    .poll(async () => (await mobileLabelLayout(page)).count, {
      message: "the initial mobile screen should expose a useful vocabulary set without zooming",
    })
    .toBeGreaterThanOrEqual(13);
  await expect
    .poll(async () => (await mobileLabelLayout(page)).overlaps, {
      message: "visible mobile word labels should not overlap",
    })
    .toEqual([]);
  const hotspot = page.getByTestId("scene-hotspot").first();
  await expect(hotspot).toBeVisible();
  const box = await hotspot.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(32);
  const clippedPortalCaptions = await page.locator(".scene-hotspot-caption").evaluateAll((captions) => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="world-viewport"]');
    if (!viewport) throw new Error("world viewport is required for portal-caption checks");
    const viewportRect = viewport.getBoundingClientRect();
    return captions.flatMap((caption) => {
      const hotspotRect = caption.parentElement?.getBoundingClientRect();
      if (!hotspotRect) return [];
      const hotspotCenterX = hotspotRect.left + hotspotRect.width / 2;
      const hotspotCenterY = hotspotRect.top + hotspotRect.height / 2;
      if (
        hotspotCenterX < viewportRect.left
        || hotspotCenterX > viewportRect.right
        || hotspotCenterY < viewportRect.top
        || hotspotCenterY > viewportRect.bottom
      ) return [];
      const captionRect = caption.getBoundingClientRect();
      return captionRect.left < viewportRect.left + 8 || captionRect.right > viewportRect.right - 8
        ? [caption.textContent?.trim() ?? "unnamed portal"]
        : [];
    });
  });
  expect(clippedPortalCaptions, "visible mobile portal captions stay inside the viewport").toEqual([]);
  const { visible } = await mobileLabelLayout(page);
  const target = visible.find(({ rect, name }) => {
    const centerX = (rect.left + rect.right) / 2;
    return rect.height <= 18 && !visible.some((other) => other.name !== name
      && centerX >= other.rect.left - 5 && centerX <= other.rect.right + 5
      && rect.top - 5 <= other.rect.bottom + 5 && rect.bottom + 5 >= other.rect.top - 5);
  });
  expect(target, "a compact painted word with free space for a 28px touch target").toBeDefined();
  const { rect, name } = target!;
  await page.touchscreen.tap((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2 + 13);
  await expect(page.locator(".word-dock strong")).toHaveText(name);
  await page.getByRole("button", { name: "关闭单词卡" }).click();
  await expect(page.locator(".word-dock")).toHaveCount(0);
  const wordAfterClosing = (await mobileLabelLayout(page)).visible.find((label) => label.name === name);
  expect(wordAfterClosing).toBeDefined();
  const { left, right, top, bottom } = wordAfterClosing!.rect;
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  const touch = await page.context().newCDPSession(page);
  const finger = { x, y, id: 1 };
  const direction = x < page.viewportSize()!.width / 2 ? 1 : -1;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...finger, x: x + direction * 34 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [finger] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".word-dock")).toHaveCount(0);
  await touch.detach();
});
