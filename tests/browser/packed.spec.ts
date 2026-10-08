import { test, expect } from "@playwright/test";
import { buildPacked, packedRequestSchema } from "../../src/lib/packed-build";
import { packedCompatibility } from "../../src/lib/packed-compatibility";
import { parseMetadata } from "../../src/lib/userscript";
const base = process.env.RAXLET_TEST_URL ?? "http://localhost:3000";
const source = `// ==UserScript==
// @name Packed café 🚀
// @version 1.0.0
// @description Offline Unicode verification
// @match http://127.0.0.1/*
// @exclude http://127.0.0.1/excluded*
// @grant GM.getValue
// @grant GM.setValue
// ==/UserScript==
const runs = await GM.getValue('runs', 0);
await GM.setValue('runs', runs + 1);
document.querySelector('#result').textContent = 'Offline café 🚀 ' + (runs + 1);
`;
async function artifact(code = source, dependencies = false) {
  const metadata = parseMetadata(code);
  return buildPacked(
    [
      {
        id: "fixture",
        scriptId: "fixture",
        versionId: "fixture-1",
        version: "1.0.0",
        name: metadata.name[0],
        description: "",
        source: code,
        metadata,
        category: "Utilities",
        owned: true,
        bytes: Buffer.byteLength(code),
        compatibility: packedCompatibility(metadata, code),
        dependencies: [],
      },
    ],
    packedRequestSchema.parse({
      selections: [{ id: "fixture", versionId: "fixture-1" }],
      dependenciesApproved: dependencies,
    }),
    base,
    async () => "offline resource",
  );
}
test("builder selects scripts, saves profiles, previews/downloads output, and executes the actual bookmarklet offline without requests", async ({
  page,
  context,
}) => {
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Packed Tester");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`packed-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("packed-browser-password-123456");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/dashboard\/library/);
  const response = await page.request.post(base + "/api/scripts", {
    headers: { origin: base },
    data: { source, category: "Development" },
  });
  expect(response.status()).toBe(201);
  await page.goto("/dashboard/launcher");
  await page.getByRole("link", { name: "Packed Mode", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Packed Mode", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search packed scripts").fill("does not exist");
  await expect(
    page.getByText("No scripts found.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search packed scripts").fill("café");
  await page.getByLabel("Packed category").selectOption("Development");
  await page.getByRole("button", { name: "Select all shown" }).click();
  await expect(page.getByText(/1 selected/)).toBeVisible();
  await page.getByLabel("Build profile name").fill("Offline tools");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByRole("button", { name: "Deselect all" }).click();
  await expect(
    page.getByRole("button", { name: "Generate bookmarklet" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Load profile" }).click();
  await page.getByRole("button", { name: "Generate bookmarklet" }).click();
  await expect(page.getByLabel("Generated bookmarklet URL")).toBeAttached();
  const url = await page.getByLabel("Generated bookmarklet URL").inputValue();
  const link = page.getByRole("link", { name: /Drag to bookmarks/ });
  await expect(link).toHaveAttribute("href", url);
  await link.click();
  await expect(page.locator("#raxlet-packed-launcher")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview source" }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JavaScript" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("raxlet-packed.js");
  // Regeneration uses reviewed latest versions without mutating the library installation.
  const created = (await response.json()).data;
  const version = await page.request.post(
    base + `/api/scripts/${created.id}/versions`,
    {
      headers: { origin: base },
      data: { source: source.replace("1.0.0", "1.1.0"), expectedRevision: 1 },
    },
  );
  expect(version.status()).toBe(201);
  await page
    .getByRole("button", { name: "Regenerate with latest versions" })
    .click();
  await expect(
    page.getByText("Packed café 🚀 · v1.1.0", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm regeneration" }).click();
  await expect(
    page.getByText("Packed café 🚀: 1.0.0 → 1.1.0", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/packed-builder-mobile.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:4311/");
  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));
  await context.setOffline(true);
  await page.evaluate((bookmarklet) => {
    location.href = bookmarklet;
  }, url);
  const panel = page.locator("#raxlet-packed-launcher");
  await expect(
    panel.getByRole("heading", { name: "Packed café 🚀" }),
  ).toBeVisible();
  await expect(page.locator("#result")).toHaveText("Not run");
  await expect(
    panel.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Enable or disable Packed café 🚀" })
    .click();
  for (let n = 1; n <= 2; n++) {
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await panel.getByRole("button", { name: "Confirm & run" }).click();
    await expect(page.locator("#result")).toHaveText(`Offline café 🚀 ${n}`);
    await expect(panel.getByRole("status")).toContainText("Completed");
  }
  expect(requests).toEqual([]);
  await page.screenshot({ path: "test-results/packed-offline.png" });
  await panel.getByRole("button", { name: "Close launcher" }).click();
  await expect(panel).toHaveCount(0);
  await page.evaluate((bookmarklet) => {
    location.href = bookmarklet;
  }, url);
  await panel
    .getByRole("button", { name: "Enable or disable Packed café 🚀" })
    .click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await panel.getByRole("button", { name: "Confirm & run" }).click();
  await expect(page.locator("#result")).toHaveText("Offline café 🚀 1");
  expect(requests).toEqual([]);
  await context.setOffline(false);
});
test("URL exclusions disable execution", async ({ page }) => {
  const output = await artifact();
  await page.goto("http://127.0.0.1:4311/excluded");
  await page.evaluate((url) => {
    location.href = url;
  }, output.bookmarklet);
  const panel = page.locator("#raxlet-packed-launcher");
  await panel
    .getByRole("button", { name: "Enable or disable Packed café 🚀" })
    .click();
  await expect(
    panel.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByText("Does not match this page", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("#result")).toHaveText("Not run");
});
test("direct packed functions work without unsafe-eval, text resources are embedded, and Shadow DOM fallback is usable", async ({
  page,
  context,
}) => {
  const output = await artifact(
    source.replace(
      "@grant GM.getValue",
      "@grant GM_getResourceText\n// @resource text https://example.org/text\n// @grant GM.getValue",
    ) +
      "\ndocument.querySelector('#result').textContent = GM_getResourceText('text');",
    true,
  );
  await page.goto("http://127.0.0.1:4311/packed-inline");
  await page.evaluate(() => {
    Object.defineProperty(Element.prototype, "attachShadow", {
      value: undefined,
      configurable: true,
    });
  });
  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));
  await context.setOffline(true);
  await page.evaluate((url) => {
    location.href = url;
  }, output.bookmarklet);
  const panel = page.locator("#raxlet-packed-launcher");
  await panel
    .getByRole("button", { name: "Enable or disable Packed café 🚀" })
    .click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await panel.getByRole("button", { name: "Confirm & run" }).click();
  await expect(page.locator("#result")).toHaveText("offline resource");
  await expect(panel.getByRole("status")).toContainText("Completed");
  expect(requests).toEqual([]);
  await panel.getByLabel("Move launcher: drag or use arrow keys").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await context.setOffline(false);
});
test("browser CSP blocks the actual bookmarklet before launch", async ({
  page,
}) => {
  const output = await artifact();
  await page.goto("http://127.0.0.1:4311/blocked");
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.evaluate((url) => {
    location.href = url;
  }, output.bookmarklet);
  await expect
    .poll(() => errors.join("\n"))
    .toMatch(/Content Security Policy|script-src/i);
  await expect(page.locator("#raxlet-packed-launcher")).toHaveCount(0);
  await expect(page.locator("#result")).toHaveText("Not run");
});
test("packed launch refuses the authenticated account origin without executing source", async ({
  page,
}) => {
  const output = await artifact(
    source + "\nthrow new Error('must not execute on account origin');",
  );
  await page.goto("/");
  const dialog = page.waitForEvent("dialog");
  await page.evaluate((url) => {
    location.href = url;
  }, output.bookmarklet);
  const alert = await dialog;
  expect(alert.message()).toContain("account origin");
  await alert.dismiss();
  await expect(page.locator("#raxlet-packed-launcher")).toHaveCount(0);
});
