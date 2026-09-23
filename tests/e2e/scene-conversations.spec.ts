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

test("emergency triage reception offers check-in, interpreter and waiting-area practice", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const app = page.getByTestId("world-app");
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  for (const sceneId of [
    "city-street",
    "transit-hub",
    "urban-services",
    "hospital",
    "emergency-department",
    "emergency-triage-reception",
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
  await expect(dialog).toContainText("I would like to check in and speak with the triage nurse.");
  await expect(dialog).toContainText("Could you arrange a Mandarin interpreter to join our conversation?");
  await expect(dialog).toContainText("Please tell a member of staff straight away.");
  await expect(dialog).toContainText("仅用于语言练习，不提供诊断或用药建议。");
  await dialog.getByRole("button", { name: "关闭情景会话" }).click();
  const assessmentBay = page.locator(
    '[data-testid="scene-hotspot"][data-target-scene="emergency-assessment-bay"]',
  );
  await expect(assessmentBay).toBeVisible();
  await assessmentBay.click();
  await expect(app).toHaveAttribute("data-scene-id", "emergency-assessment-bay");
  await expect(app).toHaveAttribute("data-transition-state", "idle");
  await page.getByRole("button", { name: "情景会话", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li")).toHaveCount(18);
  await expect(dialog).toContainText("Could you explain what the monitor is for?");
  await expect(dialog).toContainText("仅用于语言练习，不提供诊断或用药建议。");
  await dialog.getByRole("button", { name: "关闭情景会话" }).click();
  await page.getByRole("button", { name: /返回上一层/ }).click();
  await expect(app).toHaveAttribute("data-scene-id", "emergency-triage-reception");
  await page.getByRole("button", { name: /返回上一层/ }).click();
  await expect(app).toHaveAttribute("data-scene-id", "emergency-department");
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

test("airport bridge and office elevator expose their bilingual scene practice", async ({ page }) => {
  const app = page.getByTestId("world-app");
  const openPractice = async (sceneId: string, expectedLine: string) => {
    const button = page.getByRole("button", { name: "情景会话", exact: true });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "在这里怎么说" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("li")).toHaveCount(12);
    await expect(dialog).toContainText(expectedLine);
    await dialog.getByRole("button", { name: "关闭情景会话" }).click();
    await expect(app).toHaveAttribute("data-scene-id", sceneId);
  };
  const enterPath = async (path: string[]) => {
    for (const sceneId of path) {
      const portal = page.locator(`[data-testid="scene-hotspot"][data-target-scene="${sceneId}"]`);
      await expect(portal).toBeVisible();
      await portal.click();
      await expect(app).toHaveAttribute("data-scene-id", sceneId);
      await expect(app).toHaveAttribute("data-scene-loading", "false");
      await expect(app).toHaveAttribute("data-transition-state", "idle");
    }
  };

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await enterPath([
    "city-street",
    "transit-hub",
    "urban-services",
    "airport",
    "security-checkpoint",
    "boarding-gate",
    "passenger-boarding-bridge",
  ]);
  await openPractice("passenger-boarding-bridge", "Is this the walkway to the aircraft?");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(app).toHaveAttribute("data-scene-loading", "false");
  await enterPath([
    "city-street",
    "transit-hub",
    "urban-services",
    "office-building",
    "office-reception-lobby",
    "office-elevator-car",
  ]);
  await openPractice("office-elevator-car", "Which button should I press for level five?");
});
