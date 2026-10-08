import { test, expect, type Page } from "@playwright/test";
import { launcherSnippet } from "../../src/lib/bookmarklet";
const base = "http://localhost:3000";
const fixture = `// ==UserScript==
// @name Browser verification
// @version 1.0.0
// @description A locally owned integration test script
// @match http://127.0.0.1/*
// @grant GM.getValue
// @grant GM.setValue
// ==/UserScript==
const runs = await GM.getValue('runs', 0);
await GM.setValue('runs', runs + 1);
document.querySelector('#result').textContent = 'Run ' + (runs + 1);
`;
async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Browser Tester");
  await page
    .getByLabel("Email", { exact: true })
    .fill(
      `browser-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
    );
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123456");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/dashboard\/library/);
}
async function create(page: Page) {
  await page.goto("/dashboard/editor");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "verification.user.js",
      mimeType: "text/javascript",
      buffer: Buffer.from(fixture),
    });
  await expect(page.getByText("Browser verification · v1.0.0")).toBeVisible();
  await page.getByRole("button", { name: "Save script", exact: true }).click();
  await expect(page.getByText("Script saved", { exact: true })).toBeVisible();
  await page.goto("/dashboard/library");
  await expect(
    page.getByRole("heading", { name: "Browser verification" }),
  ).toBeVisible();
}
async function launch(page: Page, path = "/") {
  await page.goto("http://127.0.0.1:4311" + path);
  await page.evaluate(launcherSnippet(base));
  await expect(
    page
      .locator("#raxlet-launcher")
      .getByRole("button", { name: "Link account", exact: true }),
  ).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await page
    .locator("#raxlet-launcher")
    .getByRole("button", { name: "Link account", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByText("http://127.0.0.1:4311", { exact: true }),
  ).toBeVisible();
  await popup.getByRole("button", { name: "Approve for 15 minutes" }).click();
  await expect(
    page
      .locator("#raxlet-launcher")
      .getByRole("heading", { name: "Browser verification" }),
  ).toBeVisible();
  return popup;
}
async function run(page: Page) {
  const launcher = page.locator("#raxlet-launcher");
  await launcher.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    launcher.getByText(/This code can read and change this page/),
  ).toBeVisible();
  await launcher.getByRole("button", { name: "Confirm & run" }).click();
}
test("register, self-hosted Monaco, import, scoped popup bridge, execution, GM persistence and revocation", async ({
  page,
  context,
}) => {
  await register(page);
  await create(page);
  const app = await context.newPage();
  await app.goto("/dashboard/launcher");
  await expect(
    app.getByRole("heading", { name: "The Raxlet launcher" }),
  ).toBeVisible();
  await expect(app.locator('a[draggable="true"]')).toHaveAttribute(
    "href",
    /^javascript:/,
  );
  const thirdPartyRequests: { url: string; headers: Record<string, string> }[] =
    [];
  page.on("request", (req) => {
    if (req.url().startsWith("http://127.0.0.1:4311"))
      thirdPartyRequests.push({ url: req.url(), headers: req.headers() });
  });
  const popup = await launch(page);
  const launcher = page.locator("#raxlet-launcher");
  await expect(
    launcher.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await launcher.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(
    launcher.getByRole("button", { name: "Disable", exact: true }),
  ).toBeVisible();
  await run(page);
  await expect(page.locator("#result")).toHaveText("Run 1");
  await expect(launcher.getByRole("status")).toHaveText("Completed");
  await run(page);
  await expect(page.locator("#result")).toHaveText("Run 2");
  await app.goto("/dashboard/library");
  await app
    .getByRole("button", { name: "Configure Browser verification" })
    .click();
  await expect(app.getByLabel("Settings JSON")).toHaveValue(/"runs": 2/);
  await app.getByRole("button", { name: "Close dialog" }).click();
  await popup.getByRole("button", { name: "Revoke access" }).click();
  await launcher.getByRole("button", { name: "Refresh library" }).click();
  await expect(launcher.getByRole("status")).toHaveText(
    /Authorization expired or revoked/,
  );
  expect(
    thirdPartyRequests.every(
      (r) =>
        !r.headers.cookie?.includes("better-auth") && !r.headers.authorization,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/launcher.png" });
  await popup.close();
  await app.close();
});
test("CSP blocks execution clearly without changing page data", async ({
  page,
}) => {
  await register(page);
  await create(page);
  const popup = await launch(page, "/no-eval");
  const launcher = page.locator("#raxlet-launcher");
  await launcher.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(
    launcher.getByRole("button", { name: "Disable", exact: true }),
  ).toBeVisible();
  await run(page);
  await expect(launcher.getByRole("status")).toHaveText(/Execution failed/);
  await expect(page.locator("#result")).toHaveText("Not run");
  await popup.close();
});
test("restricted CSP blocks bootstrap and provides a guide fallback", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4311/blocked");
  const dialog = page.waitForEvent("dialog");
  await page.evaluate(launcherSnippet(base));
  const alert = await dialog;
  expect(alert.message()).toContain("blocked Raxlet");
  await alert.dismiss();
  await expect(page.locator("#raxlet-launcher")).toHaveCount(0);
});
test("responsive home and navigation contain real empty state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your web. Your scripts." }),
  ).toBeVisible();
  await expect(page.getByText("No scripts yet", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .locator("aside")
    .getByRole("link", { name: "Explore", exact: true })
    .click();
  await expect(page).toHaveURL(/explore/);
  await page.screenshot({ path: "test-results/mobile.png" });
});
