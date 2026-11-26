import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";

export async function startOfficeProbe(page: Page) {
  await page.addInitScript(() => {
    const events: object[] = [];
    const describe = (element: Element | null) => {
      if (!element) return null;
      const control = element.closest("button,select,input,textarea,a,[role=button]");
      return { tag: element.localName, testId: element.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
        control: control?.localName ?? null, controlTestId: control?.getAttribute("data-testid") ?? null,
        targetScene: control?.getAttribute("data-target-scene") ?? null };
    };
    const record = (event: Event) => {
      if (document.querySelector("[data-testid='world-app']")?.getAttribute("data-scene-id") !== "office-building") return;
      const mouse = event as MouseEvent;
      const canvas = document.querySelector<HTMLCanvasElement & { paintedLabels?: Array<{
        id: string; centerX: number; centerY: number; interactive: boolean; opacity: number;
      }> }>(".label-canvas");
      const rect = canvas?.getBoundingClientRect();
      const words = ["reception-counter", "monitor"].map(id => {
        const word = canvas?.paintedLabels?.find(item => item.id === id);
        if (!word || !rect) return { id, painted: false };
        const x = word.centerX + rect.left, y = word.centerY + rect.top;
        return { id, painted: true, x, y, interactive: word.interactive, opacity: word.opacity,
          elementAtCenter: describe(document.elementFromPoint(x, y)) };
      });
      events.push({ event: event.type, timeMs: performance.now(), x: mouse.clientX, y: mouse.clientY,
        actualTarget: describe(event.target instanceof Element ? event.target : null), words });
      if (events.length > 24) events.shift();
    };
    for (const type of ["pointerdown", "click"]) document.addEventListener(type, record, { capture: true, passive: true });
    Object.assign(window, { officeProbeEvents: events });
  });
}

export async function attachOfficeProbe(page: Page, info: TestInfo) {
  if (page.isClosed()) return;
  const events = await page.evaluate(() => (window as unknown as { officeProbeEvents?: object[] }).officeProbeEvents ?? []);
  await info.attach("office-input-events", { body: JSON.stringify(events), contentType: "application/json" });
}

export default class ActionReporter implements Reporter {
  private recent: object[] = [];
  private failures: object[] = [];

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (!["pw:api", "expect", "test.step"].includes(step.category)) return;
    const item = { category: step.category, action: step.title, location: step.location, error: step.error?.message };
    this.recent.push(item);
    if (this.recent.length > 16) this.recent.shift();
    if (step.error) this.failures.push(item);
  }

  onEnd() {
    writeFileSync(join(process.env.OFFICE_REPORT_DIR!, "steps.json"),
      JSON.stringify({ recent: this.recent, failures: this.failures }));
  }
}
