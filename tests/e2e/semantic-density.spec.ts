import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  LEXICAL_WORLD_OVERVIEW_IMAGE,
  lexicalWorldRealmTiles,
} from "../../app/lib/lexical-world-visuals";

const ENTRY_LABEL = "打开 10 个视觉领域、758 个分层入口和 10,000 个词";
const DIALOG_LABEL = "一万个词的分层探索世界";
const SEARCH_PLACEHOLDER = "搜索 10,000 个词…";
const SEMANTIC_NODE = '[data-testid="semantic-zoom-node"]';

async function openLexicalWorld(page: Page): Promise<Locator> {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("world-app")).toBeVisible();
  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: ENTRY_LABEL }).click();
  const dialog = page.getByRole("dialog", { name: DIALOG_LABEL });
  await expect(dialog).toBeVisible();
  const field = dialog.getByTestId("semantic-zoom-field");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("data-level", "realm");
  await expect(field).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".app-header")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".world-stage")).toHaveAttribute("aria-hidden", "true");
  expect(await page.locator(".app-header").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  expect(await page.locator(".world-stage").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  return dialog;
}

async function lexicalReachability(page: Page) {
  return page.evaluate(async () => {
    type Link = { id: string; path: string; count: number; childrenCount: number };
    type Realm = { id: string; count: number; children: Link[] };
    type Leaf = { id: string; count: number; children: string[] };
    type Topic = {
      id: string;
      count: number;
      children: Leaf[];
      semanticShard: { path: string; count: number };
    };
    type SemanticShard = { nodes: Array<{ id: string }> };
    type Manifest = {
      count: number;
      children: Link[];
      stats: {
        realms: number;
        topics: number;
        subclusters: number;
        nodes: number;
        emptySubclusters: number;
      };
    };
    const read = async <T,>(path: string): Promise<T> => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      return response.json() as Promise<T>;
    };

    const manifest = await read<Manifest>("/data/lexical-world/manifest.json");
    const realms = await Promise.all(manifest.children.map(({ path }) => read<Realm>(path)));
    const topicLinks = realms.flatMap(({ children }) => children);
    const topics = await Promise.all(topicLinks.map(({ path }) => read<Topic>(path)));
    const leaves = topics.flatMap(({ children }) => children);
    const shardPaths = [...new Set(topics.map(({ semanticShard }) => semanticShard.path))];
    const shards = await Promise.all(shardPaths.map((path) => read<SemanticShard>(path)));
    const reachableIds = leaves.flatMap(({ children }) => children);
    const semanticIds = shards.flatMap(({ nodes }) => nodes.map(({ id }) => id));
    const reachableSet = new Set(reachableIds);
    const semanticSet = new Set(semanticIds);

    return {
      manifestCount: manifest.count,
      manifestStats: manifest.stats,
      realms: realms.length,
      topics: topics.length,
      subclusters: leaves.length,
      shards: shardPaths.length,
      realmCount: manifest.children.reduce((sum, { count }) => sum + count, 0),
      topicCount: topicLinks.reduce((sum, { count }) => sum + count, 0),
      leafCount: leaves.reduce((sum, { count }) => sum + count, 0),
      reachableReferences: reachableIds.length,
      uniqueReachableWords: reachableSet.size,
      semanticWords: semanticIds.length,
      uniqueSemanticWords: semanticSet.size,
      setsMatch: reachableIds.every((id) => semanticSet.has(id))
        && semanticIds.every((id) => reachableSet.has(id)),
    };
  });
}

async function assertSemanticCardsReadableAndPacked(
  field: Locator,
  minimumLiveCount = 1,
): Promise<void> {
  const audit = await field.evaluate((element) => {
    const fieldRect = element.getBoundingClientRect();
    const cards = [...element.querySelectorAll<HTMLElement>(
      '[data-testid="semantic-zoom-node"]',
    )].map((card) => {
      const strong = card.querySelector<HTMLElement>("strong");
      const translation = card.querySelector<HTMLElement>(
        ":scope > span:not(.semantic-zoom-field__node-dot)",
      );
      const rect = card.getBoundingClientRect();
      return {
        id: card.dataset.id ?? "",
        ariaLabel: card.getAttribute("aria-label") ?? "",
        strongText: strong?.textContent?.trim() ?? "",
        strongTextOverflow: strong ? getComputedStyle(strong).textOverflow : "missing",
        strongScrollWidth: strong?.scrollWidth ?? -1,
        strongClientWidth: strong?.clientWidth ?? -1,
        translationText: translation?.textContent?.trim() ?? "",
        translationScrollHeight: translation?.scrollHeight ?? -1,
        translationClientHeight: translation?.clientHeight ?? -1,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
      };
    });
    return {
      fieldRect: {
        left: fieldRect.left,
        top: fieldRect.top,
        right: fieldRect.right,
        bottom: fieldRect.bottom,
      },
      cards,
    };
  });

  expect(audit.cards.length).toBeGreaterThanOrEqual(minimumLiveCount);
  expect(Number(await field.getAttribute("data-live-count"))).toBe(audit.cards.length);
  for (const card of audit.cards) {
    expect(card.strongText, `${card.id} must render its complete English label`).not.toBe("");
    expect(card.strongTextOverflow, `${card.id} must not use ellipsis`).not.toBe("ellipsis");
    expect(card.strongScrollWidth, `${card.id} English must fit or wrap`).toBeLessThanOrEqual(
      card.strongClientWidth + 1,
    );
    expect(card.translationText, `${card.id} must render its translated copy`).not.toBe("");
    expect(card.translationScrollHeight, `${card.id} translation must fit its reserved height`)
      .toBeLessThanOrEqual(card.translationClientHeight + 1);
    expect(card.ariaLabel).toContain(card.strongText);
    expect(card.ariaLabel).toContain(card.translationText);
    expect(card.rect.left).toBeGreaterThanOrEqual(audit.fieldRect.left - 1);
    expect(card.rect.top).toBeGreaterThanOrEqual(audit.fieldRect.top - 1);
    expect(card.rect.right).toBeLessThanOrEqual(audit.fieldRect.right + 1);
    expect(card.rect.bottom).toBeLessThanOrEqual(audit.fieldRect.bottom + 1);
  }
  for (const [index, card] of audit.cards.entries()) {
    for (const other of audit.cards.slice(index + 1)) {
      const overlapWidth = Math.min(card.rect.right, other.rect.right)
        - Math.max(card.rect.left, other.rect.left);
      const overlapHeight = Math.min(card.rect.bottom, other.rect.bottom)
        - Math.max(card.rect.top, other.rect.top);
      expect(
        overlapWidth <= 1 || overlapHeight <= 1,
        `${card.id} and ${other.id} must not overlap`,
      ).toBe(true);
    }
  }
}

test("the lexical world accounts for 10,000 words and reaches every word in a leaf", async ({ page }, testInfo) => {
  const dialog = await openLexicalWorld(page);
  const field = dialog.getByTestId("semantic-zoom-field");
  const reachability = await lexicalReachability(page);
  expect(reachability).toEqual({
    manifestCount: 10_000,
    manifestStats: {
      realms: 10,
      topics: 44,
      subclusters: 704,
      nodes: 10_000,
      emptySubclusters: 0,
    },
    realms: 10,
    topics: 44,
    subclusters: 704,
    shards: 44,
    realmCount: 10_000,
    topicCount: 10_000,
    leafCount: 10_000,
    reachableReferences: 10_000,
    uniqueReachableWords: 10_000,
    semanticWords: 10_000,
    uniqueSemanticWords: 10_000,
    setsMatch: true,
  });

  const realmNodes = field.locator(`${SEMANTIC_NODE}[data-level="realm"]`);
  await expect(realmNodes).toHaveCount(10);
  const realmCounts = await realmNodes.evaluateAll((nodes) => (
    nodes.map((node) => Number((node as HTMLElement).dataset.count))
  ));
  expect(realmCounts.reduce((sum, count) => sum + count, 0)).toBe(10_000);

  const realm = realmNodes.first();
  await realm.focus();
  await realm.press("Enter");
  await expect(field).toHaveAttribute("data-level", "topic");
  const topic = field.locator(`${SEMANTIC_NODE}[data-level="topic"]:focus`);
  await expect(topic).toHaveCount(1);
  await topic.press("Enter");
  await expect(field).toHaveAttribute("data-level", "subcluster");
  const subcluster = field.locator(`${SEMANTIC_NODE}[data-level="subcluster"]:focus`);
  await expect(subcluster).toHaveCount(1);
  const leafWordCount = Number(await subcluster.getAttribute("data-count"));
  expect(leafWordCount).toBeGreaterThan(0);
  await subcluster.press("Enter");
  await expect(field).toHaveAttribute("data-level", "word");

  const expectedBudget = testInfo.project.name === "mobile-chromium" ? 40 : 80;
  const activeWordNodes = field.locator(`${SEMANTIC_NODE}[data-level="word"]`);
  await expect.poll(() => activeWordNodes.count()).toBeGreaterThan(0);
  const activeWordCount = await activeWordNodes.count();
  expect(activeWordCount).toBeLessThanOrEqual(Math.min(leafWordCount, expectedBudget));
  expect(Number(await field.getAttribute("data-live-count"))).toBe(activeWordCount);
  await expect(field.locator(`${SEMANTIC_NODE}[data-level="word"]:focus`)).toHaveCount(1);
  await expect(dialog.locator("canvas")).toHaveCount(0);
});

test("Number & measure → Integer keeps complete cards on its native number-line backdrop", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const dialog = await openLexicalWorld(page);
  const field = dialog.getByTestId("semantic-zoom-field");
  const meanings = dialog.getByRole("button", { name: /释义 [开关]/u });
  await meanings.click();
  await expect(meanings).toHaveAttribute("aria-pressed", "true");

  await expect(field).toHaveAttribute("data-visual-mode", "photo");
  await assertSemanticCardsReadableAndPacked(field, 10);

  const realmId = "space-time-measure";
  const realmTile = lexicalWorldRealmTiles().find((tile) => tile.realmId === realmId);
  expect(realmTile).toBeDefined();
  await field.locator(`${SEMANTIC_NODE}[data-id="${realmId}"]`).click();
  await expect(field).toHaveAttribute("data-level", "topic");
  await expect(field).toHaveAttribute("data-visual-mode", "photo");
  await expect(field).toHaveAttribute("data-motif", "photo");
  await expect(field).toHaveAttribute("data-active-asset", realmTile!.asset);
  await expect(field.getByTestId("semantic-zoom-plane")).toHaveCSS("opacity", "1");
  await expect(field.locator(`[data-testid="semantic-realm-tile"][data-realm="${realmId}"]`))
    .toBeVisible();
  await assertSemanticCardsReadableAndPacked(field, 4);

  await field.locator(`${SEMANTIC_NODE}[data-id="number-measure"]`).click();
  await expect(field).toHaveAttribute("data-level", "subcluster");
  await expect(field).toHaveAttribute("data-visual-mode", "diagram");
  await expect(field).toHaveAttribute("data-motif", "number-line");
  await expect(field).toHaveAttribute("data-topic", "number-measure");
  await expect(field).not.toHaveAttribute("data-active-asset", /.+/u);
  await expect(field.getByTestId("semantic-zoom-plane")).toHaveCSS("opacity", "0");
  await expect(field.locator(".semantic-zoom-field__leader")).toHaveCount(0);
  const topicBackdrop = field.getByTestId("semantic-backdrop");
  await expect(topicBackdrop).toHaveAttribute("data-motif", "number-line");
  await expect(topicBackdrop.locator(".semantic-zoom-field__backdrop-copy strong"))
    .toHaveText("Number & measure");
  await expect(topicBackdrop.locator(".semantic-zoom-field__backdrop-copy em"))
    .toHaveText("数字与度量");
  await assertSemanticCardsReadableAndPacked(field, 8);

  await field.locator(`${SEMANTIC_NODE}[data-id="number-measure--integer"]`).click();
  await expect(field).toHaveAttribute("data-level", "word");
  await expect(field).toHaveAttribute("data-visual-mode", "diagram");
  await expect(field).toHaveAttribute("data-motif", "number-line");
  await expect(field).toHaveAttribute("data-topic", "number-measure");
  await expect(field).not.toHaveAttribute("data-active-asset", /.+/u);
  await expect(field.getByTestId("semantic-zoom-plane")).toHaveCSS("opacity", "0");
  await expect(field.locator(".semantic-zoom-field__leader")).toHaveCount(0);
  const wordBackdrop = field.getByTestId("semantic-backdrop");
  await expect(wordBackdrop).toHaveAttribute("data-subcluster-ordinal", "5");
  await expect(wordBackdrop).toHaveAttribute("data-subcluster-total", "10");
  await expect(wordBackdrop.locator(".semantic-zoom-field__backdrop-copy small"))
    .toHaveText("Number & measure · 数字与度量");
  await expect(wordBackdrop.locator(".semantic-zoom-field__backdrop-copy strong"))
    .toHaveText("Integer");
  await expect(wordBackdrop.locator(".semantic-zoom-field__backdrop-copy em"))
    .toHaveText("整数");

  const minimumWordCount = testInfo.project.name === "mobile-chromium" ? 8 : 20;
  await assertSemanticCardsReadableAndPacked(field, minimumWordCount);
});

test("the ten realm nodes reveal ten distinct successfully loaded realm tiles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium");
  // This is an asset-mapping audit, not a camera-motion test. Keep the realm
  // targets stationary so a reset animation cannot move a button between
  // pointer down and pointer up while iterating over all ten tiles.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const realmResponses = new Map<string, number>();
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (/^\/scenes\/lexical-realm-.+-v2\.jpg$/.test(pathname)) {
      realmResponses.set(pathname, response.status());
    }
  });

  const dialog = await openLexicalWorld(page);
  const field = dialog.getByTestId("semantic-zoom-field");
  const overview = field.getByTestId("semantic-zoom-overview");
  await expect(overview).toHaveAttribute("src", LEXICAL_WORLD_OVERVIEW_IMAGE);
  await expect.poll(() => overview.evaluate((image: HTMLImageElement) => (
    image.complete && image.naturalWidth === 1600 && image.naturalHeight === 900
  ))).toBe(true);

  const tiles = lexicalWorldRealmTiles();
  for (const tile of tiles) {
    await field.locator(`${SEMANTIC_NODE}[data-level="realm"][data-id="${tile.realmId}"]`).click();
    await expect(field).toHaveAttribute("data-active-realm", tile.realmId);
    await expect(field).toHaveAttribute("data-active-asset", tile.asset);
    const runtimeTile = field.locator(`[data-testid="semantic-realm-tile"][data-realm="${tile.realmId}"]`);
    await expect(runtimeTile).toHaveCount(1);
    await expect(runtimeTile).toHaveAttribute("data-asset", tile.asset);
    const image = runtimeTile.locator("img");
    await expect(image).toHaveAttribute("src", tile.asset);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => (
      element.complete && element.naturalWidth === 1600 && element.naturalHeight === 900
    ))).toBe(true);
    await field.getByTestId("semantic-zoom-reset").click();
    await expect(field).toHaveAttribute("data-level", "realm");
    await expect(field).not.toHaveAttribute("data-active-realm", /.+/);
    await expect(field.getByTestId("semantic-realm-tile")).toHaveCount(0);
  }

  const assets = tiles.map(({ asset }) => asset);
  expect(new Set(assets).size).toBe(10);
  await expect.poll(
    () => realmResponses.size,
    { message: "all ten active realm tiles must finish loading" },
  ).toBe(10);
  expect([...realmResponses.keys()].sort()).toEqual([...assets].sort());
  expect([...realmResponses.values()]).toEqual(Array.from({ length: 10 }, () => 200));
});

test("searching coffee opens its word detail and keeps map meanings off", async ({ page }) => {
  const dialog = await openLexicalWorld(page);
  const field = dialog.getByTestId("semantic-zoom-field");
  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
  await search.fill("coffee");

  const result = dialog.locator(".lexical-world__results li").filter({ hasText: /coffee/i }).first();
  await expect(result).toContainText(/coffee/i);
  await result.getByRole("button").click();

  await expect(field).toHaveAttribute("data-level", "realm");
  const detail = dialog.getByRole("complementary", { name: /coffee 词汇详情/i });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(/coffee/i);
  await expect(detail.locator("p").last()).toContainText(/\p{Script=Han}/u);
  await expect(detail.locator("footer")).toHaveText("词卡详情始终显示释义");

  await expect(page.getByTestId("meaning-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: "释义 关" })).toHaveAttribute("aria-pressed", "false");
  await expect(field.locator(".semantic-zoom-field__node > span:not(.semantic-zoom-field__node-dot)")).toHaveCount(0);
});

test("a failed semantic shard search clears its spinner and leaves exploration usable", async ({ page }) => {
  let rejectedShard = false;
  await page.route("**/data/semantic/topics/*.json", async (route) => {
    if (rejectedShard) {
      await route.continue();
      return;
    }
    rejectedShard = true;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  const dialog = await openLexicalWorld(page);
  const field = dialog.getByTestId("semantic-zoom-field");
  const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
  await search.fill("coffee");
  await expect(dialog.locator(".lexical-world__search-spinner")).toBeVisible();
  await expect(dialog.locator(".lexical-world__search-spinner")).toHaveCount(0);
  await expect(search).toHaveAttribute("aria-busy", "false");
  await expect(dialog.locator(":scope > .lexical-world__sr-only[aria-live='polite']")).toHaveText(
    "搜索暂时不可用，请稍后重试",
  );

  const realm = field.locator(`${SEMANTIC_NODE}[data-level="realm"]`).first();
  await expect(realm).toBeEnabled();
  await realm.click();
  await expect(field).toHaveAttribute("data-level", "topic");
});

test("scene word labels remain native-size siblings of the zoomed artwork", async ({ page }) => {
  await page.goto("/#world", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await page.locator(
    '[data-testid="scene-minimap-child"][data-target-scene="city-street"]',
  ).click();
  await expect(app).toHaveAttribute("data-scene-id", "city-street");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  const viewport = page.getByTestId("world-viewport");
  const surface = viewport.locator(":scope > .scene-surface");
  const labelLayer = viewport.locator(":scope > [data-testid='scene-label-layer']");
  await expect(surface).toBeVisible();
  await expect(labelLayer).toHaveAttribute("data-coordinate-space", "screen");
  await expect(labelLayer.locator(":scope > .word-label").first()).toBeVisible();

  const relationship = await viewport.evaluate((element) => {
    const artwork = element.querySelector<HTMLElement>(":scope > .scene-surface");
    const labels = element.querySelector<HTMLElement>(":scope > .label-layer");
    const word = labels?.querySelector<HTMLElement>(".word-label");
    return {
      artworkParentIsViewport: artwork?.parentElement === element,
      labelsParentIsViewport: labels?.parentElement === element,
      artworkContainsLabels: Boolean(artwork?.contains(labels ?? null)),
      layerTransform: labels ? getComputedStyle(labels).transform : "missing",
      wordTransform: word ? getComputedStyle(word).transform : "missing",
    };
  });

  expect(relationship).toEqual({
    artworkParentIsViewport: true,
    labelsParentIsViewport: true,
    artworkContainsLabels: false,
    layerTransform: "none",
    wordTransform: expect.stringMatching(/^matrix\(1, 0, 0, 1,/),
  });
});
