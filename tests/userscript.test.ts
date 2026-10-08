import { describe, it, expect } from "vitest";
import {
  parseMetadata,
  matchesUrl,
  matchPattern,
  analyzeCompatibility,
  template,
} from "@/lib/userscript";
import { assertExecution } from "@/launcher/engine";
import {
  scriptInput,
  libraryPatch,
  versionInput,
  pagination,
} from "@/lib/validation";
import {
  visibleTo,
  discoverable,
  owned,
  assertMutationOrigin,
} from "@/lib/http";
import { isPublicAddress } from "@/lib/import-url";
import { validateSource } from "@/lib/source";
import { bookmarklet, launcherSnippet } from "@/lib/bookmarklet";
describe("userscript metadata", () => {
  it("preserves repeated and unknown directives without prototype pollution", () => {
    const m = parseMetadata(
      template.replace(
        "// ==/UserScript==",
        "// @match https://*.example.org/*\n// @custom yes\n// @__proto__ intact\n// @constructor value\n// ==/UserScript==",
      ),
    );
    expect(m.match).toHaveLength(2);
    expect(m.custom).toEqual(["yes"]);
    expect(m.__proto__).toEqual(["intact"]);
    expect(Object.getPrototypeOf(m)).toBeNull();
  });
  it("accepts CRLF metadata", () =>
    expect(parseMetadata(template.replaceAll("\n", "\r\n")).version).toEqual([
      "1.0.0",
    ]));
  it.each([
    "no metadata",
    template.replace("// @name         My script\n", ""),
    template.replace("1.0.0", "yesterday"),
    template.replace("https://example.com/*", "javascript:alert(1)"),
    template.replace(
      "// ==/UserScript==",
      "// @version 2.0.0\n// ==/UserScript==",
    ),
  ])("rejects invalid source", (s) => expect(() => parseMetadata(s)).toThrow());
  it("rejects unsupported regex include patterns", () =>
    expect(() =>
      parseMetadata(
        template.replace(
          "// @match        https://example.com/*",
          "// @include /example.*/",
        ),
      ),
    ).toThrow());
});
describe("URL rules", () => {
  it.each([
    ["https://*.example.com/*", "https://example.com/path", true],
    ["https://*.example.com/*", "https://sub.example.com/path", true],
    ["https://*.example.com/*", "https://evilexample.com/path", false],
    ["*://example.com/*", "http://example.com/a?b=1", true],
    ["https://example.com/private/*", "https://example.com/public/", false],
    ["<all_urls>", "chrome://settings", false],
    ["<all_urls>", "file:///etc/passwd", false],
    ["https://example.com/*", "https://example.com:8443/a", true],
  ])("%s matches %s: %s", (p, u, result) =>
    expect(matchPattern(p, u)).toBe(result),
  );
  it("applies exclusions after inclusions", () => {
    const m = parseMetadata(
      template.replace(
        "// ==/UserScript==",
        "// @exclude https://example.com/private/*\n// ==/UserScript==",
      ),
    );
    expect(matchesUrl(m, "https://example.com/public")).toBe(true);
    expect(matchesUrl(m, "https://example.com/private/x")).toBe(false);
  });
  it("handles malformed URLs and escapes regex metacharacters", () => {
    expect(matchesUrl(parseMetadata(template), "bad")).toBe(false);
    expect(
      matchPattern("https://example.com/a.b*", "https://example.com/axb"),
    ).toBe(false);
  });
});
describe("compatibility and execution policy", () => {
  it("supports only declared implemented APIs", () => {
    const m = parseMetadata(template);
    expect(analyzeCompatibility(m, template).supported).toBe(true);
    const src = template + "\nGM_xmlhttpRequest({});";
    expect(analyzeCompatibility(m, src).supported).toBe(false);
    expect(
      analyzeCompatibility(m, template + "\nGM_setValue('x',1)").blockers[0],
    ).toMatch(/must be declared/);
  });
  it("blocks dependencies and resources", () => {
    const m = parseMetadata(
      template.replace(
        "// ==/UserScript==",
        "// @require https://cdn.example.com/lib.js\n// @resource logo https://example.com/logo.png\n// ==/UserScript==",
      ),
    );
    expect(analyzeCompatibility(m, template).blockers).toHaveLength(2);
  });
  it("rejects disabled scripts, mismatches, and account-origin execution", () => {
    const script = {
      id: "fixture",
      name: "Fixture",
      source: template,
      metadata: parseMetadata(template),
      settings: {},
      enabled: false,
    };
    expect(() =>
      assertExecution(script, "https://example.com/", "https://raxlet.test"),
    ).toThrow(/Enable/);
    expect(() =>
      assertExecution(
        { ...script, enabled: true },
        "https://raxlet.test/",
        "https://raxlet.test",
      ),
    ).toThrow(/account origin/);
    expect(() =>
      assertExecution(
        { ...script, enabled: true },
        "https://other.test/",
        "https://raxlet.test",
      ),
    ).toThrow(/match/);
    expect(
      assertExecution(
        { ...script, enabled: true },
        "https://example.com/",
        "https://raxlet.test",
      ).version,
    ).toEqual(["1.0.0"]);
  });
  it("reparses actual source rather than trusting caller metadata", () => {
    expect(() =>
      assertExecution(
        {
          id: "x",
          name: "x",
          source: template + "\nGM_xmlhttpRequest({})",
          metadata: {},
          settings: {},
          enabled: true,
        },
        "https://example.com/",
        "https://raxlet.test",
      ),
    ).toThrow(/Unsupported/);
  });
});
describe("authorization boundaries and validation", () => {
  it("separates direct-link visibility from discovery", () => {
    const s = { ownerId: "a", visibility: "private", hidden: false };
    expect(visibleTo(s, "b")).toBe(false);
    expect(visibleTo(s, "a")).toBe(true);
    expect(visibleTo({ ...s, visibility: "unlisted" })).toBe(true);
    expect(discoverable({ ...s, visibility: "unlisted" })).toBe(false);
    expect(visibleTo({ ...s, visibility: "public", hidden: true }, "b")).toBe(
      false,
    );
  });
  it("enforces ownership", () => {
    expect(() => owned("a", "b")).toThrow();
    expect(() => owned("a", "a")).not.toThrow();
  });
  it("requires explicit canonical origin on mutations", () => {
    process.env.BETTER_AUTH_URL = "https://raxlet.test";
    expect(() =>
      assertMutationOrigin(
        new Request("https://raxlet.test/api/scripts", { method: "POST" }),
      ),
    ).toThrow();
    expect(() =>
      assertMutationOrigin(
        new Request("https://raxlet.test/api/scripts", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertMutationOrigin(
        new Request("https://raxlet.test/api/scripts", {
          method: "POST",
          headers: { origin: "https://raxlet.test" },
        }),
      ),
    ).not.toThrow();
  });
  it("rejects overposting and oversized settings", () => {
    expect(
      scriptInput.safeParse({ source: template, ownerId: "victim" }).success,
    ).toBe(false);
    expect(
      libraryPatch.safeParse({ settings: { payload: "a".repeat(16001) } })
        .success,
    ).toBe(false);
    expect(
      versionInput.safeParse({ source: template, expectedRevision: 0 }).success,
    ).toBe(false);
    expect(pagination.safeParse({ limit: 500 }).success).toBe(false);
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "2001:db8::1",
  ])("blocks SSRF destination %s", (a) =>
    expect(isPublicAddress(a)).toBe(false),
  );
  it("allows public destinations", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("generates a reusable secret-free bootstrap", () => {
    const code = launcherSnippet("https://raxlet.test");
    expect(bookmarklet("https://raxlet.test")).toBe("javascript:" + code);
    expect(code).toContain("https://raxlet.test/launcher.js");
    expect(code).not.toMatch(/token|password|userId/);
    expect(() => new Function(code)).not.toThrow();
  });
});

describe("source syntax validation", () => {
  it("allows supported async script bodies without executing them", () =>
    expect(
      validateSource(template + "\nawait Promise.resolve(); return;").version,
    ).toEqual(["1.0.0"]));
  it.each([
    "const broken = ;",
    "import x from 'outside';",
    "export const x = 1;",
  ])("rejects invalid or module source", (code) =>
    expect(() => validateSource(template + "\n" + code)).toThrow(
      /Invalid JavaScript/,
    ),
  );
});
