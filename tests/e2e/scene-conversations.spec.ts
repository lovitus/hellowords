import { expect, test } from "@playwright/test";

test("scene conversation stays dense, supports translation practice, and preserves exploration", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await expect(page.getByRole("button", { name: "情景会话", exact: true })).toHaveCount(0);
  for (const sceneId of ["city-street", "city-cafe"]) {
    const portal = page.locator(`[data-testid="scene-hotspot"][data-target-scene="${sceneId}"]`);
    await expect(portal).toBeVisible();
    await portal.click();
    await expect(app).toHaveAttribute("data-scene-id", sceneId);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
    await expect(page.getByTestId("scene-interaction-layer")).toHaveAttribute("data-positioned", "true");
  }
  const surface = page.locator(".viewer-shell:not([data-phase]) .scene-surface");
  const before = await surface.getAttribute("style");
  const trigger = page.getByRole("button", { name: "情景会话", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "在这里怎么说" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(12);
  await expect(dialog.locator(".scene-conversation-translation")).toHaveCount(12);
  await dialog.getByRole("checkbox", { name: "遮住中文，练习表达" }).check();
  await expect(dialog.locator(".scene-conversation-translation")).toHaveCount(0);
  await expect(dialog.locator('p[lang="en"]')).toHaveCount(12);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("checkbox").uncheck();
  await expect(dialog.locator(".scene-conversation-translation")).toHaveCount(12);
  await dialog.getByRole("button", { name: "关闭情景会话" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await surface.getAttribute("style")).toBe(before);
  await expect(app).toHaveAttribute("data-scene-id", "city-cafe");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: /返回上一层/ }).click();
  await expect(app).toHaveAttribute("data-scene-id", "city-street");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
});

test("emergency-department practice opens on its real hospital path with a clear disclaimer", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  for (const sceneId of [
    "city-street",
    "transit-hub",
    "urban-services",
    "hospital",
    "emergency-department",
  ]) {
    const portal = page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${sceneId}"]`,
    ).first();
    await expect(portal).toBeVisible();
    await portal.click();
    await expect(app).toHaveAttribute("data-scene-id", sceneId);
    await expect(app).toHaveAttribute("data-scene-loading", "false");
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }
  await page.getByRole("button", { name: "情景会话", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "在这里怎么说" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(18);
  await expect(dialog).toContainText("I feel unwell and need some help.");
  await expect(dialog).toContainText("I brought a list of my medicines and allergies.");
  await expect(dialog).toContainText("仅用于语言练习，不提供诊断或用药建议。");
  await dialog.getByRole("button", { name: "关闭情景会话" }).click();
  const bedspace = page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="hospital-inpatient-bedspace"]',
  );
  await expect(bedspace).toBeVisible();
  await bedspace.click();
  await expect(app).toHaveAttribute("data-scene-id", "hospital-inpatient-bedspace");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await page.getByRole("button", { name: "情景会话", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(18);
  await expect(dialog).toContainText("仅用于语言练习，不提供诊断或用药建议。");
});

test("school locker practice opens from the real school scene path", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  for (const sceneId of ["school-campus", "school-corridor", "school-locker-bank"]) {
    const portal = page.locator(
      `[data-testid="scene-hotspot"][data-target-scene="${sceneId}"]`,
    );
    await expect(portal).toBeVisible();
    await portal.click();
    await expect(app).toHaveAttribute("data-scene-id", sceneId);
    await expect(app).toHaveAttribute("data-transition-state", "idle");
  }
  await page.getByRole("button", { name: "情景会话", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "在这里怎么说" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(12);
  await expect(dialog).toContainText("I can't open my locker after entering the combination.");
  await expect(dialog).toContainText("我把水瓶落在长椅上了。");
});
