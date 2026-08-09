import { defineConfig, devices } from "@playwright/test";

const isPerformanceRun = process.env.PERF_RUN === "1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI && !isPerformanceRun ? 1 : 0,
  workers: process.env.CI || isPerformanceRun ? 1 : undefined,
  timeout: isPerformanceRun ? 180_000 : 45_000,
  expect: { timeout: 8_000 },
  outputDir: isPerformanceRun
    ? "artifacts/perf/test-results"
    : "artifacts/e2e/test-results",
  reporter: isPerformanceRun
    ? [
        ["line"],
        ["junit", { outputFile: "artifacts/perf/junit.xml" }],
        ["json", { outputFile: "artifacts/perf/results.json" }],
      ]
    : [
        [process.env.CI ? "dot" : "list"],
        [
          "html",
          {
            outputFolder: "artifacts/e2e/playwright-report",
            open: "never",
          },
        ],
        ["junit", { outputFile: "artifacts/e2e/junit.xml" }],
        ["json", { outputFile: "artifacts/e2e/results.json" }],
      ],
  use: {
    baseURL,
    locale: "en-US",
    colorScheme: "light",
    serviceWorkers: "block",
    trace: isPerformanceRun ? "off" : "on-first-retry",
    screenshot: isPerformanceRun ? "off" : "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /perf\//,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "mobile-chromium",
      testIgnore: /perf\//,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "performance",
      testMatch: /perf\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : {
        command:
          "npm run start -- --hostname 127.0.0.1 --port 4173",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
        gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
      },
});
