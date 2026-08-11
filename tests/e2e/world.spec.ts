import { expect, test, type Locator, type Page } from "@playwright/test";

const APP = '[data-testid="world-app"]';
const VIEWPORT = '[data-testid="world-viewport"]';

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
  await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  return app;
}

async function sceneId(app: Locator) {
  const id = await app.getAttribute("data-scene-id");
  expect(id, "world-app must expose a non-empty data-scene-id").toBeTruthy();
  return id as string;
}

async function renderedWordCount(page: Page, minimumOpacity = 0.52) {
  return page.getByTestId("word-label").evaluateAll((labels, opacityThreshold) =>
    labels.filter((label) => {
      const style = window.getComputedStyle(label);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        // Adaptive spare-space labels are deliberately promoted to 0.82.
        // They are readable and keyboard-interactive even before their natural
        // LOD reaches full opacity, so the density contract must count them.
        Number.parseFloat(style.opacity) >= opacityThreshold
      );
    }).length, minimumOpacity,
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
        (label as HTMLElement).dataset.interactive !== "true" ||
        Number.parseFloat(style.opacity) < 0.52
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
  const detailCue = page.locator(
    '[data-testid="scene-vocabulary-cue"][data-cue-source="authored-zone"]',
  ).first();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(translations.first()).toBeHidden();
  await expect(detailCue).toHaveAttribute("data-zone-title", /\S+/);
  await expect(detailCue).toHaveAttribute("data-zone-translation", /\S+/);
  const zoneTitle = await detailCue.getAttribute("data-zone-title");
  const zoneTranslation = await detailCue.getAttribute("data-zone-translation");
  await expect(detailCue.locator(".vocabulary-zoom-cue-count")).toContainText(zoneTitle!);
  await expect(detailCue.locator(".vocabulary-zoom-cue-count")).not.toContainText(zoneTranslation!);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(translations.first()).toBeVisible();
  await expect(detailCue.locator(".vocabulary-zoom-cue-count")).toContainText(zoneTranslation!);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("word-translation").first()).toBeVisible();
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

test("five authored LOD bands use spare space and remain readable while zooming", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  await openWorld(page);
  const surface = page.locator(".scene-surface");
  await expect(surface).toHaveAttribute("data-lod-level", "1");
  const authoredLods = await page.getByTestId("word-label").evaluateAll((labels) => (
    [...new Set(labels.map((label) => Number((label as HTMLElement).dataset.minLevel)))].sort()
  ));
  expect(authoredLods).toEqual([0, 1, 2, 3, 4]);
  expect(await page.getByTestId("word-label").count()).toBeGreaterThanOrEqual(30);
  await expect.poll(() => renderedWordCount(page), {
    message: "desktop overview must expose at least 18 readable, visually grounded words",
  }).toBeGreaterThanOrEqual(18);
  const overviewReadableWordCount = await renderedWordCount(page);

  const detailLabelId = await closestLabelToViewportCenter(page, '.word-label[data-min-level="4"]');
  const detailLabel = page.locator(`.word-label[data-label-id="${detailLabelId}"]`);
  const initialDetailStyle = await wordTransitionStyle(detailLabel);
  const initiallyAdaptive = await detailLabel.getAttribute("data-adaptive") === "true";
  expect(initialDetailStyle.display, "every authored density layer remains renderable").not.toBe("none");
  if (initiallyAdaptive) {
    expect(
      initialDetailStyle.opacity,
      "a future LOD promoted into spare space must already be readable",
    ).toBeGreaterThanOrEqual(0.52);
    await expect(detailLabel).toHaveAttribute("aria-hidden", "false");
    await expect(detailLabel).toHaveAttribute("tabindex", "0");
  } else {
    expect(
      initialDetailStyle.opacity,
      "a detail word without a collision-free adaptive slot remains hidden until zoomed",
    ).toBeLessThanOrEqual(0.05);
    await expect(detailLabel).toHaveAttribute("aria-hidden", "true");
    await expect(detailLabel).toHaveAttribute("tabindex", "-1");
  }

  await zoomSceneToScale(page, 1.22);
  await expect(surface).toHaveAttribute("data-lod-level", "2");
  const retainedReadableFloor = Math.max(18, Math.floor(overviewReadableWordCount * 0.8));
  await expect.poll(() => renderedWordCount(page), {
    message: "the first zoom step must retain at least 80% of the readable overview vocabulary",
  }).toBeGreaterThanOrEqual(retainedReadableFloor);

  await page.getByRole("button", { name: "Fit scene" }).click();
  await expect(surface).toHaveAttribute("data-scene-scale", "1.000");
  const focusBox = await detailLabel.boundingBox();
  expect(focusBox).not.toBeNull();
  await zoomSceneToScale(page, 3.12, {
    x: focusBox!.x + focusBox!.width / 2,
    y: focusBox!.y + focusBox!.height / 2,
  });
  await expect(surface).toHaveAttribute("data-lod-level", "4");
  await expect(detailLabel).toBeVisible();
  await expect.poll(async () => (await wordTransitionStyle(detailLabel)).opacity).toBeGreaterThanOrEqual(0.95);
  await expect(detailLabel).toHaveAttribute("aria-hidden", "false");
  await expect(detailLabel).toHaveAttribute("tabindex", "0");
});

test("scene-wide zoom guidance honestly reports zero or more words after adaptive layout", async ({ page }) => {
  await openWorld(page);
  const surface = page.locator(".scene-surface");
  const summary = page.getByTestId("scene-vocabulary-summary");

  await expect(summary).toHaveAttribute("data-hidden-word-count", /^\d+$/);
  const hiddenBefore = Number(await summary.getAttribute("data-hidden-word-count"));
  if (hiddenBefore === 0) {
    await expect(summary).toHaveAttribute("data-active", "false");
    await expect(summary).toHaveAttribute("data-next-lod", "none");
    await expect(summary).toHaveAttribute("data-next-batch-count", "0");
    await expect(summary).toHaveAttribute("aria-label", "本场景还有 0 个词，继续放大");
    await expect(summary).toBeHidden();
    return;
  }

  await expect(summary).toHaveAttribute("data-active", "true");
  const nextLod = Number(await summary.getAttribute("data-next-lod"));
  expect(nextLod, "the scene-wide cue reports a reachable next LOD").toBeGreaterThanOrEqual(2);
  await expect(summary).toHaveAttribute(
    "aria-label",
    `本场景还有 ${hiddenBefore} 个词，继续放大`,
  );

  const activeRegionCues = page.locator(
    '[data-testid="scene-vocabulary-cue"][data-active="true"]',
  );
  for (let index = 0; index < await activeRegionCues.count(); index += 1) {
    const cue = activeRegionCues.nth(index);
    const count = Number(await cue.getAttribute("data-hidden-word-count"));
    const nextBatchCount = Number(await cue.getAttribute("data-next-batch-count"));
    const mode = await cue.getAttribute("data-cue-mode");
    const source = await cue.getAttribute("data-cue-source");
    const zoneTitle = await cue.getAttribute("data-zone-title");
    expect(source).toBe("authored-zone");
    expect(zoneTitle).toBeTruthy();
    expect(nextBatchCount).toBeGreaterThan(0);
    expect(nextBatchCount).toBeLessThanOrEqual(count);
    expect(Number(await cue.getAttribute("data-authored-target-scale"))).toBeGreaterThan(1);
    expect(Number(await cue.getAttribute("data-focus-x"))).toBeGreaterThanOrEqual(0);
    expect(Number(await cue.getAttribute("data-focus-y"))).toBeGreaterThanOrEqual(0);
    expect(["region", "compact"]).toContain(mode);
    if (mode === "region") {
      expect(count, "a full local marker represents a useful region").toBeGreaterThanOrEqual(4);
    } else {
      expect(count, "a compact marker honestly preserves a sparse remainder").toBeGreaterThan(0);
      expect(count).toBeLessThan(4);
    }
    await expect(cue).toHaveAttribute("aria-hidden", "false");
    await expect(cue).toHaveAttribute("tabindex", "0");
    await expect(cue).toHaveAttribute("aria-label", `${zoneTitle}还有 ${count} 个词，放大查看`);
    await expect(cue.locator(".vocabulary-zoom-cue-count")).toHaveText(
      `${zoneTitle} · 还剩 ${count} 个词`,
    );
  }

  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("data-lod-level", String(nextLod));
  await expect.poll(async () => page.locator(
    `.word-label[data-min-level="${nextLod}"][data-interactive="true"]`,
  ).count(), {
    message: "activating the scene-wide cue must make its next LOD keyboard-readable",
  }).toBeGreaterThan(0);
  await expect(page.locator(".word-label:focus")).toHaveCount(1);

  const activeAfter = await summary.getAttribute("data-active");
  const hiddenAfter = Number(await summary.getAttribute("data-hidden-word-count"));
  if (activeAfter === "true") {
    expect(hiddenAfter, "the remaining count decreases after revealing the next batch").toBeLessThan(hiddenBefore);
    await expect(summary).toHaveAttribute(
      "aria-label",
      `本场景还有 ${hiddenAfter} 个词，继续放大`,
    );
  } else {
    expect(hiddenAfter, "the summary becomes inactive only when no revealable words remain").toBe(0);
  }
});

test("an authored detail-zone cue zooms within the scene and reduces its truthful remainder", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  const app = await openWorld(page);
  const originalScene = await sceneId(app);
  const surface = page.locator(".scene-surface");
  const cue = page.locator(
    '[data-testid="scene-vocabulary-cue"][data-cue-source="authored-zone"][data-active="true"]',
  ).first();
  await expect(cue).toHaveAttribute("data-cue-source", "authored-zone");
  await expect(cue).toHaveAttribute("data-active", "true");
  const cueId = await cue.getAttribute("data-cue-id");
  expect(cueId).toBeTruthy();
  const stableCue = page.locator(`[data-testid="scene-vocabulary-cue"][data-cue-id="${cueId}"]`);

  const remainingBefore = Number(await cue.getAttribute("data-hidden-word-count"));
  const nextBatchCount = Number(await cue.getAttribute("data-next-batch-count"));
  const nextLod = Number(await cue.getAttribute("data-next-lod"));
  const targetScale = Number(await cue.getAttribute("data-target-scale"));
  expect(remainingBefore).toBeGreaterThanOrEqual(nextBatchCount);
  expect(nextBatchCount).toBeGreaterThan(0);
  expect(targetScale).toBeGreaterThan(1);

  await cue.focus();
  await cue.press("Enter");
  await expect(app).toHaveAttribute("data-scene-id", originalScene);
  await expect.poll(
    async () => Number(await surface.getAttribute("data-scene-scale")),
  ).toBeGreaterThanOrEqual(targetScale * 0.995);
  await expect.poll(() => page.locator(
    `.word-label[data-min-level="${nextLod}"][data-interactive="true"]`,
  ).count()).toBeGreaterThanOrEqual(nextBatchCount);
  await expect(page.locator(".word-label:focus")).toHaveCount(1);
  await expect.poll(
    async () => (await stableCue.getAttribute("data-active")) === "false"
      ? 0
      : Number(await stableCue.getAttribute("data-hidden-word-count")),
    { message: "the authored zone count must decrease after its next batch is revealed" },
  ).toBeLessThan(remainingBefore);
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
  const visibleLabel = page.locator('.word-label[data-interactive="true"]').first();
  const labelBox = await visibleLabel.boundingBox();
  expect(labelBox).not.toBeNull();
  expect(Math.min(labelBox!.width, labelBox!.height)).toBeGreaterThanOrEqual(28);
});
