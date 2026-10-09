import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parse } from "acorn";
import { z } from "zod";
import {
  packedDefaults,
  type PackedCandidate,
  type PackedManifest,
  type PackedOutput,
} from "./packed-types";
import { packedCompatibility } from "./packed-compatibility";
import { validateSource } from "./source";
import { apiNames } from "../launcher/context";
import { encodeBookmarklet, selectPackedEncoding } from "./packed-codec";

export const packedSettingsSchema = z
  .object({
    theme: z.enum(["dark", "light", "system"]).default(packedDefaults.theme),
    position: z
      .enum(["bottom-right", "bottom-left", "top-right", "top-left"])
      .default(packedDefaults.position),
    compact: z.boolean().default(false),
    initiallyEnabled: z.boolean().default(false),
    descriptions: z.boolean().default(true),
    warnings: z.boolean().default(true),
    search: z.boolean().default(true),
    minify: z.boolean().default(true),
    compression: z.boolean().default(false),
  })
  .strict();
export const packedRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).default("Raxlet Packed"),
    selections: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            versionId: z.string().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    settings: packedSettingsSchema.default(packedDefaults),
    communityApproved: z.boolean().default(false),
    dependenciesApproved: z.boolean().default(false),
    latest: z.boolean().default(false),
  })
  .strict();
export type PackedRequest = z.infer<typeof packedRequestSchema>;
export const packedHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const bytes = (value: string) => Buffer.byteLength(value, "utf8");
export async function packedRuntimeSizes() {
  const [raw, min] = await Promise.all(
    ["packed-runtime.js", "packed-runtime.min.js"].map((name) =>
      readFile(join(process.cwd(), "public", name), "utf8"),
    ),
  );
  return {
    unminified: encodeURIComponent(raw).length,
    minified: encodeURIComponent(min).length,
  };
}
// Stable JSON, including directive order within each metadata array.
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => JSON.stringify(key) + ":" + stableJson(entry))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function dependencyList(metadata: PackedCandidate["metadata"]) {
  const resources = (metadata.resource ?? []).map((line) => {
    const match = line.match(/^(\S+)\s+(https:\/\/\S+)$/);
    if (!match)
      throw new Error(
        "@resource must declare a name and a public HTTPS UTF-8 text URL.",
      );
    return { name: match[1], url: match[2] };
  });
  if (new Set(resources.map((r) => r.name)).size !== resources.length)
    throw new Error("Duplicate @resource names are unsupported.");
  const requires = metadata.require ?? [];
  for (const url of [...requires, ...resources.map((r) => r.url)]) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443")
    )
      throw new Error(
        "Dependencies require public HTTPS URLs on port 443 without credentials.",
      );
  }
  return { requires, resources };
}
type DependencyLoader = (url: string) => Promise<string>;
export async function buildPacked(
  candidates: PackedCandidate[],
  input: PackedRequest,
  origin: string,
  load: DependencyLoader,
): Promise<PackedOutput> {
  if (
    !candidates.length ||
    candidates.length > 30 ||
    new Set(candidates.map((c) => c.id)).size !== candidates.length
  )
    throw new Error("Select between 1 and 30 distinct scripts.");
  if (candidates.some((c) => !c.owned) && !input.communityApproved)
    throw new Error(
      "Explicit approval is required to include community scripts.",
    );
  const ordered = [...candidates].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  if (ordered.reduce((sum, c) => sum + bytes(c.source), 0) > 1000000)
    throw new Error("Selected source exceeds the 1MB build limit.");
  const analyzed = ordered.map((candidate) => {
    const metadata = validateSource(candidate.source);
    const compatibility = packedCompatibility(metadata, candidate.source);
    if (!compatibility.supported)
      throw new Error(`${candidate.name}: ${compatibility.blockers.join(" ")}`);
    return {
      candidate,
      metadata,
      compatibility,
      deps: dependencyList(metadata),
    };
  });
  const urls = [
    ...new Set(
      analyzed.flatMap(({ deps }) => [
        ...deps.requires,
        ...deps.resources.map((r) => r.url),
      ]),
    ),
  ].sort();
  if (urls.length > 8)
    throw new Error(
      "At most eight distinct external dependencies can be included per build.",
    );
  if (urls.length && !input.dependenciesApproved)
    throw new Error(
      "Explicit approval is required before fetching external dependencies.",
    );
  const contents = new Map(
    await Promise.all(urls.map(async (url) => [url, await load(url)] as const)),
  );
  if (
    [...contents.values()].reduce((sum, value) => sum + bytes(value), 0) >
    1000000
  )
    throw new Error("External dependencies exceed the 1MB build limit.");
  const runners: string[] = [];
  const scripts = analyzed.map(
    ({ candidate: c, metadata, compatibility, deps }) => {
      const required = deps.requires.map((url) => {
        const source = contents.get(url)!;
        // Only classic JS dependencies. Parsing never evaluates downloaded code.
        parse(source, { ecmaVersion: "latest", sourceType: "script" });
        const depCompatibility = packedCompatibility(
          { ...metadata, require: [], resource: [] },
          source,
        );
        if (!depCompatibility.supported)
          throw new Error(
            `${c.name} dependency ${url}: ${depCompatibility.blockers.join(" ")}`,
          );
        return source;
      });
      const runner = `async function(${apiNames.join(",")},GM){"use strict";\n${required.map((s) => s + "\n;").join("\n")}\n${c.source}\n}`;
      // Check the actual wrapper for parameter collisions and cross-file syntax errors.
      parse("(" + runner + ")", {
        ecmaVersion: "latest",
        sourceType: "script",
      });
      runners.push(runner);
      return {
        id: c.id,
        scriptId: c.scriptId,
        versionId: c.versionId,
        version: metadata.version[0],
        name: metadata.name[0],
        description: metadata.description?.[0] ?? "",
        metadata,
        enabled: input.settings.initiallyEnabled,
        hash: packedHash(c.source),
        bytes:
          bytes(runner) +
          deps.resources.reduce(
            (sum, r) => sum + bytes(contents.get(r.url)!),
            0,
          ),
        warnings: compatibility.warnings,
        metaStr:
          c.source
            .match(
              /(?:^|\n)[ \t]*\/\/[ \t]*==UserScript==[\s\S]*?\/\/[ \t]*==\/UserScript==/,
            )?.[0]
            .trim() ?? "",
        resources: Object.fromEntries(
          deps.resources.map((r) => [r.name, contents.get(r.url)!]),
        ),
        dependencies: [
          ...deps.requires,
          ...deps.resources.map((r) => r.url),
        ].map((url) => ({
          url,
          hash: packedHash(contents.get(url)!),
          bytes: bytes(contents.get(url)!),
        })),
      };
    },
  );
  const manifest: PackedManifest = {
    format: 1,
    name: input.name,
    origin: new URL(origin).origin,
    settings: input.settings,
    scripts,
  };
  const [raw, minified] = await Promise.all(
    ["packed-runtime.js", "packed-runtime.min.js"].map((name) =>
      readFile(join(process.cwd(), "public", name), "utf8"),
    ),
  );
  const assemble = (runtime: string) =>
    `void (()=>{\n${runtime}\nRaxletPacked.start(JSON.parse(${JSON.stringify(stableJson(manifest))}),[${runners.join(",\n")}]);\n})();`;
  const rawCode = assemble(raw),
    minCode = assemble(minified);
  const code = input.settings.minify ? minCode : rawCode;
  const payload = gzipSync(code, { level: 9 }).toString("base64url");
  const loader = await readFile(
    join(process.cwd(), "public", "packed-compressed.js"),
    "utf8",
  );
  const compressedCode = `void (()=>{\n${loader}\nvoid RaxletCompressed.start(${JSON.stringify(manifest.origin)},${JSON.stringify(payload)},${bytes(code)});\n})();`;
  const {
    directBookmarklet,
    compressedBookmarklet,
    compressionApplied,
    bookmarkletCode,
    bookmarklet,
  } = selectPackedEncoding(code, compressedCode, input.settings.compression);
  const warnings: string[] = [];
  if (compressionApplied)
    warnings.push(
      "Experimental gzip compression requires native browser decompression and dynamic JavaScript execution. CSP or Trusted Types may block it. Use the standard bookmarklet fallback if it fails.",
    );
  if (input.settings.compression && !compressionApplied)
    warnings.push(
      "Compression did not reduce the final URL size after loader overhead; a standard bookmarklet was generated instead.",
    );
  if (bookmarklet.length > 64000)
    warnings.push(
      "This bookmarklet exceeds the conservative 64,000-character target. Browser and bookmark-sync limits vary; test saving and launching it or split the build.",
    );
  if (bookmarklet.length > 4000000)
    throw new Error(
      "Encoded bookmarklet exceeds the 4MB generation limit. Select fewer scripts.",
    );
  const output: PackedOutput = {
    name: input.name,
    code,
    bookmarkletCode,
    bookmarkletHash: packedHash(bookmarkletCode),
    compressionApplied,
    bookmarklet,
    manifest,
    hash: packedHash(code),
    characters: bookmarklet.length,
    bytes: bytes(bookmarklet),
    codeBytes: bytes(code),
    generatedAt: new Date().toISOString(),
    compression: compressionApplied
      ? "Experimental gzip + base64url · native decompression and dynamic execution"
      : "None · directly executable JavaScript",
    compatibility: compressionApplied
      ? "Experimental: requires DecompressionStream (gzip) and CSP/Trusted Types permission for Function compilation, in addition to ordinary bookmarklet compatibility."
      : "Compatible HTTP(S) pages only; CSP, Trusted Types, browser restrictions, and userscript behavior still apply.",
    sizes: {
      unminified: bytes(encodeBookmarklet(rawCode)),
      minified: bytes(encodeBookmarklet(minCode)),
      gzipBase64: bytes(payload),
      direct: bytes(directBookmarklet),
      compressed: bytes(compressedBookmarklet),
      compressionNote:
        "Compressed URL size includes the gzip payload, base64url, native decompression loader, and URL encoding. Gzip/base64url alone is a lower bound excluding loader overhead. Compression is opt-in and used only when the complete URL is smaller; dynamic execution can be blocked by CSP/Trusted Types.",
    },
    warnings,
  };
  if (bytes(JSON.stringify(output)) > 4000000)
    throw new Error(
      "Generated output exceeds the 4MB response limit. Select fewer scripts or split the build.",
    );
  return output;
}
