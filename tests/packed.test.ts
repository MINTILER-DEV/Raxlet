import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { encodeBookmarklet, selectPackedEncoding } from "@/lib/packed-codec";
import {
  buildPacked,
  packedHash,
  packedRequestSchema,
  stableJson,
} from "@/lib/packed-build";
import {
  packedDefaults,
  type PackedCandidate,
  type PackedOutput,
} from "@/lib/packed-types";
import { packedCompatibility } from "@/lib/packed-compatibility";
import { parseMetadata, matchesUrl } from "@/lib/userscript";
const source = `// ==UserScript==
// @name Unicode café 日本語 🚀
// @version 1.0.0
// @match https://example.com/*
// @exclude https://example.com/private/*
// @run-at document-start
// @grant none
// @custom one
// @custom two
// ==/UserScript==
globalThis.packedResult = "quote'\\"" + \`template\n\${"🚀"}\`;
// trailing comment`;
function candidate(code = source, id = "a"): PackedCandidate {
  const metadata = parseMetadata(code);
  return {
    id,
    scriptId: id,
    versionId: id + "-v1",
    version: "1.0.0",
    name: metadata.name[0],
    description: "",
    category: "Utilities",
    source: code,
    metadata,
    owned: true,
    bytes: Buffer.byteLength(code),
    dependencies: metadata.require ?? [],
    compatibility: packedCompatibility(metadata, code),
  };
}
function request(
  candidates = [candidate()],
  extra: Record<string, unknown> = {},
) {
  return packedRequestSchema.parse({
    selections: candidates.map((c) => ({ id: c.id, versionId: c.versionId })),
    ...extra,
  });
}
async function build(
  candidates = [candidate()],
  extra: Record<string, unknown> = {},
  load: (url: string) => Promise<string> = vi.fn(async () => ""),
) {
  return buildPacked(
    candidates,
    request(candidates, extra),
    "https://raxlet.example",
    load,
  );
}
// Inspect runners in an isolated test-only VM. Production generation never evaluates code.
function capture(output: PackedOutput) {
  let captured: {
    runners: ((...args: unknown[]) => Promise<void>)[];
    sandbox: Record<string, unknown>;
  };
  const sandbox: Record<string, unknown> = {
    RaxletPacked: {
      start: (
        _manifest: unknown,
        runners: ((...args: unknown[]) => Promise<void>)[],
      ) => {
        captured = { runners, sandbox };
      },
    },
  };
  const start = output.code.lastIndexOf("RaxletPacked.start(");
  runInNewContext(output.code.slice(start, -"\n})();".length), sandbox);
  return captured!;
}
describe("Packed Mode generation", () => {
  it("runs Terser after esbuild, retaining behavior, names, license, metadata and immutable source hashes", async () => {
    const dependency = `/*! dependency license */
      const prefix = 'café 🚀';
      /*! unused dependency license */
      function unusedLicensedFunction() { return 'unused'; }
      function namedDependency(value) { return prefix + value; }
      class NamedDependency { static result() { return NamedDependency.name; } }
      globalThis.dependencyExecuted = true;`;
    const code =
      source.replace(
        "// @grant none",
        "// @grant none\n// @require https://example.com/dependency.js",
      ) +
      `
      ${Array.from({ length: 100 }, (_, i) => `const unused${i} = 'removable value ${i}';`).join("\n")}
      function originalFunctionName(value) { return namedDependency(value); }
      /* @__PURE__ */ originalFunctionName(globalThis.sideEffect = ' executed');
      globalThis.minifiedResult = [originalFunctionName.name, NamedDependency.result(), originalFunctionName(' 日本語')];`;
    const settings = {
      ...packedDefaults,
      minifyScripts: true,
      terser: "always",
    };
    const output = await build(
      [candidate(code)],
      { settings, dependenciesApproved: true },
      async () => dependency,
    );
    const again = await build(
      [candidate(code)],
      { settings, dependenciesApproved: true },
      async () => dependency,
    );
    expect(output.bookmarklet).toBe(again.bookmarklet);
    expect(output.terser.attempted).toBe(true);
    expect(output.terser.applied).toBe(true);
    expect(output.terser.after).toBeLessThan(output.terser.before);
    expect(output.terser.after).toBe(output.characters);
    expect(output.manifest.scripts[0].terser).toBe(true);
    expect(output.manifest.scripts[0].hash).toBe(packedHash(code));
    expect(output.manifest.scripts[0].dependencies[0].hash).toBe(
      packedHash(dependency),
    );
    expect(output.code).toContain("/*! dependency license */");
    expect(output.code).toContain("/*! unused dependency license */");
    expect(output.manifest.scripts[0].metaStr).toContain("// @custom two");
    const { runners, sandbox } = capture(output);
    expect(sandbox).not.toHaveProperty("dependencyExecuted");
    await runners[0]();
    expect(sandbox.sideEffect).toBe(" executed");
    expect(sandbox.minifiedResult).toEqual([
      "originalFunctionName",
      "NamedDependency",
      "café 🚀 日本語",
    ]);
  });
  it("automatically tries Terser above the full URL target, and skips when gzip already brings it below", async () => {
    const code =
      source +
      "\n" +
      Array.from(
        { length: 1600 },
        (_, i) => `const unused${i} = '${"removable ".repeat(8)}${i}';`,
      ).join("\n");
    const settings = { ...packedDefaults, minifyScripts: true, terser: "auto" };
    const output = await build([candidate(code)], { settings });
    expect(output.terser.before).toBeGreaterThan(64000);
    expect(output.terser.attempted).toBe(true);
    expect(output.terser.applied).toBe(true);
    expect(output.characters).toBeLessThan(64000);
    const compressed = await build([candidate(code)], {
      settings: { ...settings, compression: true },
    });
    expect(compressed.sizes.direct).toBeGreaterThan(64000);
    expect(compressed.terser.before).toBeLessThan(64000);
    expect(compressed.terser.attempted).toBe(false);
    expect(compressed.terser.applied).toBe(false);
    expect(compressed.compressionApplied).toBe(true);
  });
  it("uses a strict 64,000-character threshold and keeps the earlier artifact when Terser is larger", async () => {
    const code = source.replace(
      "// @grant none",
      "// @grant none\n// @resource text https://example.com/text",
    );
    const options = {
      settings: { ...packedDefaults, minifyScripts: true, terser: "auto" },
      dependenciesApproved: true,
    };
    const baseline = await build([candidate(code)], options, async () => "");
    expect(baseline.terser.attempted).toBe(false);
    let padding = 64000 - baseline.characters;
    const probe = await build([candidate(code)], options, async () =>
      "x".repeat(padding),
    );
    // Account for digit-width changes in recorded dependency/contribution sizes.
    padding -= probe.terser.before - 64000;
    const exact = await build([candidate(code)], options, async () =>
      "x".repeat(padding),
    );
    expect(exact.characters).toBe(64000);
    expect(exact.terser.attempted).toBe(false);
    const over = await build([candidate(code)], options, async () =>
      "x".repeat(padding + 1),
    );
    expect(over.terser.before).toBe(64001);
    expect(over.terser.attempted).toBe(true);
    expect(over.terser.applied).toBe(false);
    expect(over.characters).toBe(over.terser.before);
    expect(over.terser.note).toContain("previous artifact");
    expect(over.warnings.join(" ")).toContain("64,000");
    expect(
      packedRequestSchema.safeParse({
        selections: [{ id: "a", versionId: "a-v1" }],
        settings: { terser: "always" },
      }).success,
    ).toBe(false);
  });
  it("minifies scripts and dependencies without running them, retaining names, licenses, metadata and original hashes", async () => {
    const dependency = `/*! dependency license */
      const dependencyPrefix = 'café 🚀';
      function namedDependency(value) { return dependencyPrefix + value; }
      class NamedDependency { static result() { return NamedDependency.name; } }
      globalThis.dependencyExecuted = true;
    `;
    const code =
      source.replace(
        "// @grant none",
        "// @grant none\n// @require https://example.com/dependency.js",
      ) +
      `
      ${"// padding removed by minification\n".repeat(80)}
      function originalFunctionName(value) { return namedDependency(value); }
      /* @__PURE__ */ originalFunctionName(globalThis.sideEffect = ' executed');
      globalThis.minifiedResult = [originalFunctionName.name, NamedDependency.result(), originalFunctionName(' 日本語')];
      const evalSensitiveVariable = 'eval scope';
      globalThis.evalResult = eval('evalSensitiveVariable');
    `;
    const options = {
      settings: { ...packedDefaults, minifyScripts: true },
      dependenciesApproved: true,
    };
    const load = vi.fn(async () => dependency);
    const output = await build([candidate(code)], options, load);
    const again = await build([candidate(code)], options, load);
    expect(output.bookmarklet).toBe(again.bookmarklet);
    expect(output.minifiedScripts).toBe(1);
    expect(output.sizes.scriptsPacked).toBeLessThan(
      output.sizes.scriptsOriginal,
    );
    expect(output.manifest.scripts[0].hash).toBe(packedHash(code));
    expect(output.manifest.scripts[0].dependencies[0].hash).toBe(
      packedHash(dependency),
    );
    expect(output.manifest.scripts[0].metadata.custom).toEqual(["one", "two"]);
    expect(output.manifest.scripts[0].metaStr).toContain("// @custom two");
    expect(output.code).toContain("/*! dependency license */");
    expect(output.code).not.toContain("// padding removed by minification");
    expect(output.compressionApplied).toBe(false);
    expect(output.code).not.toContain("new Function");
    expect(globalThis).not.toHaveProperty("dependencyExecuted");
    const { runners, sandbox } = capture(output);
    expect(sandbox).not.toHaveProperty("dependencyExecuted");
    await runners[0]();
    expect(sandbox.dependencyExecuted).toBe(true);
    expect(sandbox.sideEffect).toBe(" executed");
    expect(sandbox.evalResult).toBe("eval scope");
    expect(sandbox.minifiedResult).toEqual([
      "originalFunctionName",
      "NamedDependency",
      "café 🚀 日本語",
    ]);
  });
  it("keeps a runner unchanged when esbuild name helper overhead increases its encoded size", async () => {
    const code = `// ==UserScript==
// @name Small
// @version 1.0.0
// @match https://example.com/*
// ==/UserScript==
${Array.from({ length: 10 }, (_, i) => `function f${i}(){return ${i}}`).join("")}
globalThis.result=[${Array.from({ length: 10 }, (_, i) => `f${i}.name`).join(",")}];`;
    const output = await build([candidate(code)], {
      settings: { ...packedDefaults, minifyScripts: true },
    });
    expect(output.minifiedScripts).toBe(0);
    expect(output.manifest.scripts[0].minified).toBe(false);
    expect(output.sizes.scriptsOriginal).toBe(output.sizes.scriptsPacked);
    expect(output.code).toContain(code);
    expect(output.warnings.join(" ")).toContain("did not reduce");
  });
  it("combines esbuild and gzip while retaining the minified directly executable fallback", async () => {
    const code = source + "\n" + "// removable padding\n".repeat(200);
    const output = await build([candidate(code)], {
      settings: { ...packedDefaults, minifyScripts: true, compression: true },
    });
    expect(output.minifiedScripts).toBe(1);
    expect(output.compressionApplied).toBe(true);
    const payload = output.bookmarkletCode.match(
      /RaxletCompressed\.start\([^,]+,"([A-Za-z0-9_-]+)",/,
    )!;
    expect(gunzipSync(Buffer.from(payload[1], "base64url")).toString()).toBe(
      output.code,
    );
    const { runners, sandbox } = capture(output);
    await runners[0]();
    expect(sandbox.packedResult).toContain("🚀");
    expect(output.manifest.scripts[0].hash).toBe(packedHash(code));
    expect(
      packedRequestSchema.parse({
        selections: [{ id: "a", versionId: "a-v1" }],
      }).settings.minifyScripts,
    ).toBe(false);
  });
  it("builds deterministically regardless of selection or metadata object key order", async () => {
    const a = candidate(),
      b = candidate(source.replace("café", "Other"), "b");
    const first = await build([b, a]),
      second = await build([a, b]);
    expect(first.bookmarklet).toBe(second.bookmarklet);
    expect(first.hash).toBe(second.hash);
    expect(first.manifest.scripts.map((s) => s.id)).toEqual(["a", "b"]);
    expect(stableJson({ z: ["second", "first"], a: 1 })).toBe(
      stableJson({ a: 1, z: ["second", "first"] }),
    );
  });
  it("preserves metadata, exclusion, run-at, hashes and configured enabled state", async () => {
    const output = await build([candidate()], {
      settings: { ...packedDefaults, initiallyEnabled: true },
    });
    const script = output.manifest.scripts[0];
    expect(script.metadata.custom).toEqual(["one", "two"]);
    expect(script.metadata["run-at"]).toEqual(["document-start"]);
    expect(script.hash).toBe(packedHash(source));
    expect(script.enabled).toBe(true);
    expect(matchesUrl(script.metadata, "https://example.com/public")).toBe(
      true,
    );
    expect(matchesUrl(script.metadata, "https://example.com/private/x")).toBe(
      false,
    );
    expect(matchesUrl(script.metadata, "https://other.com/public")).toBe(false);
  });
  it("round-trips encoding and executes Unicode, quotes, backslashes and templates unchanged", async () => {
    const output = await build();
    expect(
      decodeURIComponent(output.bookmarklet.slice("javascript:".length)),
    ).toBe(output.code);
    expect(output.bookmarklet).not.toMatch(/[\r\n\s]/);
    const { runners, sandbox } = capture(output);
    await runners[0]();
    expect(sandbox.packedResult).toBe("quote'\"template\n🚀");
    expect(output.code).toContain(source);
  });
  it("never executes scripts while generating and never emits a dynamic execution loader", async () => {
    const c = candidate(
      source +
        "\nglobalThis.neverRun = true; throw new Error('server execution');",
    );
    const output = await build([c]);
    expect((globalThis as Record<string, unknown>).neverRun).toBeUndefined();
    expect(output.code).not.toMatch(
      /\beval\s*\(|new Function|AsyncFunction|fetch\s*\(/,
    );
    expect(output.code).not.toContain("/api/");
    expect(output.code).not.toContain("better-auth");
  });
  it("requires community approval and rejects duplicate selections and oversized source", async () => {
    await expect(build([{ ...candidate(), owned: false }])).rejects.toThrow(
      "community",
    );
    await expect(
      build([{ ...candidate(), owned: false }], { communityApproved: true }),
    ).resolves.toHaveProperty("bookmarklet");
    await expect(build([candidate(), candidate()])).rejects.toThrow("distinct");
    await expect(
      build([candidate(source + "\n//" + "x".repeat(1000000))]),
    ).rejects.toThrow("1MB");
  });
  it("rejects malformed JavaScript, unsupported APIs, unsafe dependencies and binary declarations", async () => {
    await expect(
      build([candidate(source + "\nconst broken = ;")]),
    ).rejects.toThrow("Invalid JavaScript");
    await expect(
      build([
        candidate(source.replace("@grant none", "@grant GM_xmlhttpRequest")),
      ]),
    ).rejects.toThrow("Unsupported permission");
    await expect(
      build(
        [
          candidate(
            source.replace("@grant none", "@require http://private.test/x.js"),
          ),
        ],
        { dependenciesApproved: true },
      ),
    ).rejects.toThrow("HTTPS");
    await expect(
      build([
        candidate(source.replace("@grant none", "@resource missing-url")),
      ]),
    ).rejects.toThrow("@resource");
    await expect(
      build([candidate(source + "\nconst GM = 1;")]),
    ).rejects.toThrow();
    await expect(
      build([
        candidate(source + "\nawait import('https://example.org/module.js');"),
      ]),
    ).rejects.toThrow("Dynamic module");
  });
  it("fetches approved dependencies once, packages text resources, and preserves require ordering", async () => {
    const c = candidate(
      source.replace(
        "@grant none",
        "@grant GM_getResourceText\n// @require https://example.org/one.js\n// @require https://example.org/two.js\n// @resource css https://example.org/style.css",
      ) + "\nglobalThis.depResult = steps.join(',');",
    );
    const loader = vi.fn(async (url: string) =>
      url.endsWith("one.js")
        ? "var steps = ['one'];"
        : url.endsWith("two.js")
          ? "steps.push('two');"
          : "body{color:red}",
    );
    await expect(build([c], {}, loader)).rejects.toThrow("approval");
    expect(loader).not.toHaveBeenCalled();
    const output = await build(
      [c, { ...c, id: "b" }],
      { dependenciesApproved: true },
      loader,
    );
    expect(loader).toHaveBeenCalledTimes(3);
    expect(output.manifest.scripts[0].resources.css).toBe("body{color:red}");
    expect(output.manifest.scripts[0].dependencies.map((d) => d.hash)).toEqual([
      packedHash("var steps = ['one'];"),
      packedHash("steps.push('two');"),
      packedHash("body{color:red}"),
    ]);
    const { runners, sandbox } = capture(output);
    await runners[0]();
    expect(sandbox.depResult).toBe("one,two");
  });
  it("rejects invalid dependencies without silently dropping them", async () => {
    const c = candidate(
      source.replace("@grant none", "@require https://example.org/bad.js"),
    );
    await expect(
      build(
        [c],
        { dependenciesApproved: true },
        vi.fn(async () => "export default 1"),
      ),
    ).rejects.toThrow();
    await expect(
      build(
        [c],
        { dependenciesApproved: true },
        vi.fn(async () => "GM_xmlhttpRequest({});"),
      ),
    ).rejects.toThrow("Unsupported API");
  });
  it("reports actual encoded sizes, compares compression without enabling it and preserves source in both modes", async () => {
    const compact = await build(),
      raw = await build([candidate()], {
        settings: { ...packedDefaults, minify: false },
      });
    expect(compact.characters).toBe(compact.bookmarklet.length);
    expect(compact.bytes).toBe(Buffer.byteLength(compact.bookmarklet));
    expect(compact.codeBytes).toBe(Buffer.byteLength(compact.code));
    expect(compact.sizes.minified).toBeLessThan(compact.sizes.unminified);
    expect(compact.compression).toContain("None");
    expect(compact.sizes.compressed).toBeGreaterThan(compact.sizes.gzipBase64);
    expect(raw.code).toContain(source);
    expect(compact.code).toContain(source);
  });
  it("uses JSON parsing for prototype-named resources and validates request settings", async () => {
    const c = candidate(
      source.replace(
        "@grant none",
        "@resource __proto__ https://example.org/text",
      ),
    );
    const output = await build(
      [c],
      { dependenciesApproved: true },
      vi.fn(async () => "safe"),
    );
    expect(
      Object.hasOwn(output.manifest.scripts[0].resources, "__proto__"),
    ).toBe(true);
    expect(() => request([c], { settings: { theme: "invalid" } })).toThrow();
    expect(() => request([c], { ownerId: "other" })).toThrow();
  });
  it("honors exclude-match alongside existing exclusion globs", () => {
    const metadata = parseMetadata(
      source.replace(
        "@exclude https://example.com/private/*",
        "@exclude-match https://example.com/private/*",
      ),
    );
    expect(matchesUrl(metadata, "https://example.com/private/x")).toBe(false);
    expect(matchesUrl(metadata, "https://example.com/public")).toBe(true);
  });
  it("executes multiple scripts in the order the user invokes them", async () => {
    const a = candidate(source + "\n(globalThis.order ??= []).push('a');", "a");
    const b = candidate(source + "\n(globalThis.order ??= []).push('b');", "b");
    const { runners, sandbox } = capture(await build([b, a]));
    expect(sandbox.order).toBeUndefined();
    await runners[1]();
    await runners[0]();
    expect(sandbox.order).toEqual(["b", "a"]);
  });
  it("compresses deterministically, round-trips Unicode and source exactly, and reports the complete loader size", async () => {
    const options = { settings: { ...packedDefaults, compression: true } };
    const first = await build([candidate()], options),
      second = await build([candidate()], options);
    expect(first.compressionApplied).toBe(true);
    expect(first.compression).toContain("gzip");
    expect(first.bookmarklet).toBe(second.bookmarklet);
    expect(first.bytes).toBeLessThan(first.sizes.direct);
    expect(first.bytes).toBe(first.sizes.compressed);
    expect(decodeURIComponent(first.bookmarklet.slice(11))).toBe(
      first.bookmarkletCode,
    );
    expect(first.bookmarkletHash).toBe(packedHash(first.bookmarkletCode));
    expect(first.hash).toBe(packedHash(first.code));
    const args = first.bookmarkletCode.match(
      /RaxletCompressed\.start\(("[^"\n]*"),("[A-Za-z0-9_-]+"),(\d+)\)/,
    )!;
    const unpacked = gunzipSync(Buffer.from(JSON.parse(args[2]), "base64url"));
    expect(unpacked.toString("utf8")).toBe(first.code);
    expect(unpacked.byteLength).toBe(Number(args[3]));
    expect(unpacked.toString("utf8")).toContain(source);
    expect(encodeBookmarklet(first.code).length).toBe(first.sizes.direct);
  });
  it("uses the standard artifact when compression is disabled or loader overhead makes it larger", () => {
    const direct = "void 0;",
      loader = "void '" + "large-loader".repeat(100) + "';";
    const chosen = selectPackedEncoding(direct, loader, true);
    expect(chosen.compressionApplied).toBe(false);
    expect(chosen.bookmarklet).toBe(encodeBookmarklet(direct));
    expect(selectPackedEncoding(loader, direct, false).compressionApplied).toBe(
      false,
    );
    expect(selectPackedEncoding(loader, direct, true).compressionApplied).toBe(
      true,
    );
  });
});
