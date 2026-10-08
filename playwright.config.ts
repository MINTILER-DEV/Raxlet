import { defineConfig } from "@playwright/test";
const baseURL = process.env.RAXLET_TEST_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: `npm start -- --port ${new URL(baseURL).port || "3000"}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "node scripts/test-target.mjs",
      url: "http://127.0.0.1:4311",
      reuseExistingServer: false,
    },
  ],
});
