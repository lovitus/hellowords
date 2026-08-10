import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';
const TRANSITION_PROBE = "__hellowordsWordTransitionProbe";

interface WordTransitionStyle {
  display: string;
  opacity: number;
}

interface MobileLabelLayout {
  count: number;
  overlaps: string[];
}

async function openWorld(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.locator(APP);
  await expect(app).toBeVisible();
  await expect(app).not.toHaveAttribute("data-scene-id", "");
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
  return app;
}

async function sceneId(app: Locator) {
  const id = await app.getAttribute("data-scene-id");
  expect(id, "world-app must expose a non-empty data-scene-id").toBeTruthy();
  return id as string;
}

async function renderedWordCount(page: Page) {
  return page.getByTestId("word-label").evaluateAll((labels) =>
    labels.filter((label) => {
      const style = window.getComputedStyle(label);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity) >= 0.95
      );
    }).length,
  );
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

async function traceWordOpacityDuringZoom(
  page: Page,
  label: Locator,
  targetZoomLevel: number,
  deltaY: number,
) {
  await label.evaluate(
    (element, { probeKey, targetLevel }) => {
      const surface = element.closest<HTMLElement>(".scene-surface");
      if (!surface) throw new Error("word label must be inside a scene surface");

      const transition = new Promise<number[]>((resolve) => {
        let started = false;
        const sample = () => {
          if (started) return;
          started = true;
          observer.disconnect();
          const samples: number[] = [];
          const startedAt = performance.now();
          const frame = () => {
            samples.push(Number.parseFloat(window.getComputedStyle(element).opacity));
            if (performance.now() - startedAt < 420) {
              requestAnimationFrame(frame);
              return;
            }
            window.clearTimeout(timeout);
            resolve(samples);
          };
          requestAnimationFrame(frame);
        };

        const observer = new MutationObserver(() => {
          if (surface.dataset.zoomLevel === String(targetLevel)) sample();
        });
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          resolve([]);
        }, 1_500);
        observer.observe(surface, {
          attributes: true,
          attributeFilter: ["data-zoom-level"],
        });
        if (surface.dataset.zoomLevel === String(targetLevel)) sample();
      });
      Reflect.set(window, probeKey, transition);
    },
    { probeKey: TRANSITION_PROBE, targetLevel: targetZoomLevel },
  );

  await page.mouse.wheel(0, deltaY);
  await expect(page.locator(".scene-surface")).toHaveAttribute(
    "data-zoom-level",
    String(targetZoomLevel),
  );

  return page.evaluate(async (probeKey) => {
    const transition = Reflect.get(window, probeKey) as Promise<number[]> | undefined;
    return transition ? transition : [];
  }, TRANSITION_PROBE);
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
      await page.mouse.wheel(0, -Math.log(factor) / 0.0017);
    }
    return Number(await surface.getAttribute("data-scene-scale"));
  }, { intervals: [60], timeout: 5_000 }).toBeGreaterThanOrEqual(targetScale * 0.995);
}

async function closestLabelToViewportCenter(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((labels) => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="world-viewport"]');
    if (!viewport) throw new Error("world viewport is required to select a zoom focus");
    const viewportRect = viewport.getBoundingClientRect();
    const centerX = viewportRect.left + viewportRect.width / 2;
    const centerY = viewportRect.top + viewportRect.height / 2;
    const closest = labels
      .map((label) => {
        const rect = label.getBoundingClientRect();
        return {
          id: (label as HTMLElement).dataset.labelId ?? "",
          distance: Math.hypot(rect.left + rect.width / 2 - centerX, rect.top + rect.height / 2 - centerY),
        };
      })
      .sort((first, second) => first.distance - second.distance)[0];
    if (!closest?.id) throw new Error("an authored detail label is required");
    return closest.id;
  });
}

async function mobileLabelLayout(page: Page): Promise<MobileLabelLayout> {
  return page.getByTestId("word-label").evaluateAll((labels) => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="world-viewport"]');
    if (!viewport) throw new Error("world viewport is required for mobile layout checks");
    const viewportRect = viewport.getBoundingClientRect();
    const visible = labels.flatMap((label) => {
      const style = window.getComputedStyle(label);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity) < 0.95
      ) {
        return [];
      }
      const rect = label.getBoundingClientRect();
      const centerInsideViewport =
        rect.left + rect.width / 2 >= viewportRect.left &&
        rect.right - rect.width / 2 <= viewportRect.right &&
        rect.top + rect.height / 2 >= viewportRect.top &&
        rect.bottom - rect.height / 2 <= viewportRect.bottom;
      if (!centerInsideViewport) return [];
      return [{ name: label.textContent?.trim() ?? "word", rect }];
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

    return { count: visible.length, overlaps };
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
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(translations.first()).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(translations.first()).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("word-translation").first()).toBeVisible();
});

test("loads the 10,000-word universe only when requested and locates every searched word", async ({ page }, testInfo) => {
  const vocabularyRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/data\/(?:vocabulary|semantic)\/.+\.json/.test(request.url())) vocabularyRequests.push(request.url());
  });
  await openWorld(page);
  expect(vocabularyRequests).toHaveLength(0);

  await page.getByRole("button", { name: /10,000\+ 词汇宇宙/ }).click();
  const universe = page.getByRole("dialog", { name: "可缩放语义词汇宇宙" });
  await expect(universe).toBeVisible();
  const universeCanvas = universe.locator("canvas");
  const minimumOverviewWords = testInfo.project.name === "mobile-chromium" ? 10 : 24;
  await expect.poll(async () => Number(await universeCanvas.getAttribute("data-rendered-label-count"))).toBeGreaterThanOrEqual(minimumOverviewWords);
  const search = page.getByPlaceholder("搜索 10,000 个词…");
  await search.fill("coffee");
  const result = page.locator(".semantic-atlas__results li").first();
  await expect(result).toContainText(/coffee/i);
  await result.getByRole("button").click();
  const selectedCard = page.getByRole("complementary", { name: "已选择的词" });
  await expect(selectedCard).toContainText(/coffee/i);
  await expect(selectedCard.locator("p").last()).toContainText(/\p{Script=Han}/u);
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  expect(vocabularyRequests.length).toBeGreaterThan(1);
});

test("a selected word reveals its meaning while global scene meanings stay off", async ({ page }) => {
  await openWorld(page);
  await expect(page.getByLabel(/已遇见 \d+ 个词/)).toBeVisible();
  const toggle = page.getByTestId("meaning-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  const label = page.getByTestId("word-label").first();
  const word = (await label.innerText()).trim();
  await label.click();
  const card = page.getByRole("complementary", { name: new RegExp(`${word} word details`, "i") });
  await expect(card).toBeVisible();
  const selectedMeaning = card.locator("p").first();
  await expect(selectedMeaning).toContainText(/\p{Script=Han}/u);
  await expect(selectedMeaning).not.toContainText("释义已关闭");
  await expect(page.getByTestId("word-translation").first()).toBeHidden();

  const meaning = await selectedMeaning.innerText();
  await toggle.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(selectedMeaning).toHaveText(meaning);
  await card.getByRole("button", { name: "关闭单词卡" }).click();
  await expect(card).toBeHidden();
});

test("five continuous LOD bands make dense scene vocabulary emerge smoothly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await openWorld(page);
  const surface = page.locator(".scene-surface");
  await expect(surface).toHaveAttribute("data-lod-level", "1");
  const authoredLods = await page.getByTestId("word-label").evaluateAll((labels) => (
    [...new Set(labels.map((label) => Number((label as HTMLElement).dataset.minLevel)))].sort()
  ));
  expect(authoredLods).toEqual([0, 1, 2, 3, 4]);
  expect(await page.getByTestId("word-label").count()).toBeGreaterThanOrEqual(72);
  await expect.poll(() => renderedWordCount(page), {
    message: "desktop overview must expose at least 20 fully readable scene words",
  }).toBeGreaterThanOrEqual(20);
  const overviewWordCount = await renderedWordCount(page);

  const detailLabelId = await closestLabelToViewportCenter(page, '.word-label[data-min-level="4"]');
  const detailLabel = page.locator(`.word-label[data-label-id="${detailLabelId}"]`);
  const hiddenDetailStyle = await wordTransitionStyle(detailLabel);
  expect(hiddenDetailStyle.display, "hidden density layers must remain renderable for a fade").not.toBe("none");
  expect(hiddenDetailStyle.opacity).toBeLessThanOrEqual(0.05);

  await zoomSceneToScale(page, 1.22);
  await expect(surface).toHaveAttribute("data-lod-level", "2");
  await expect.poll(() => renderedWordCount(page), {
    message: "the first zoom step must expose a dense second vocabulary layer",
  }).toBeGreaterThanOrEqual(34);
  expect(
    await renderedWordCount(page),
    "the first zoom step must add words, not merely replace overview labels",
  ).toBeGreaterThanOrEqual(overviewWordCount + 12);

  await page.getByRole("button", { name: "Fit scene" }).click();
  await expect(surface).toHaveAttribute("data-scene-scale", "1.000");
  const focusBox = await detailLabel.boundingBox();
  expect(focusBox).not.toBeNull();
  await zoomSceneToScale(page, 2.64, {
    x: focusBox!.x + focusBox!.width / 2,
    y: focusBox!.y + focusBox!.height / 2,
  });
  await expect(surface).toHaveAttribute("data-lod-level", "4");
  await expect(detailLabel).toBeVisible();
  await expect.poll(async () => (await wordTransitionStyle(detailLabel)).opacity).toBeGreaterThan(0.05);
  expect((await wordTransitionStyle(detailLabel)).opacity).toBeLessThan(0.9);
  await expect(detailLabel).toHaveAttribute("aria-hidden", "true");
  await expect(detailLabel).toHaveAttribute("tabindex", "-1");

  const emergingBox = await detailLabel.boundingBox();
  expect(emergingBox).not.toBeNull();
  await zoomSceneToScale(page, 3.12, {
    x: emergingBox!.x + emergingBox!.width / 2,
    y: emergingBox!.y + emergingBox!.height / 2,
  });
  await expect(detailLabel).toBeVisible();
  await expect.poll(async () => (await wordTransitionStyle(detailLabel)).opacity).toBeGreaterThanOrEqual(0.95);
  await expect(detailLabel).toHaveAttribute("aria-hidden", "false");
  await expect(detailLabel).toHaveAttribute("tabindex", "0");

  const detailFadeOut = await traceWordOpacityDuringZoom(page, detailLabel, 1, 680);
  expect(
    detailFadeOut.some((opacity) => opacity > 0.05 && opacity < 0.95),
    "a word leaving the active density layer should fade out",
  ).toBe(true);
  await expect(detailLabel).toBeHidden();
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

test("wheel zoom over an object automatically loads its child scene", async ({ page }) => {
  const app = await openWorld(page);
  const parent = await sceneId(app);
  const hotspot = page.getByTestId("scene-hotspot").first();
  const target = await hotspot.getAttribute("data-target-scene");
  const box = await hotspot.boundingBox();
  expect(target).toBeTruthy();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect.poll(async () => {
    if ((await sceneId(app)) === parent) await page.mouse.wheel(0, -180);
    return sceneId(app);
  }, { intervals: [220], timeout: 8_000 }).toBe(target);
  await expect(app).not.toHaveAttribute("data-scene-loading", "true");
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
  await expect(page.getByTestId("word-label").first()).toBeVisible();
  await expect
    .poll(async () => (await mobileLabelLayout(page)).count, {
      message: "the initial mobile screen should expose a useful vocabulary set without zooming",
    })
    .toBeGreaterThanOrEqual(14);
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
  const visibleLabel = page.locator('.word-label[data-interactive="true"]').first();
  const labelBox = await visibleLabel.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(Math.min(labelBox!.width, labelBox!.height)).toBeGreaterThanOrEqual(28);
});
