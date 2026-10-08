import valid from "semver/functions/valid.js";
import { validMatch } from "./url-match";
export { validMatch, matchPattern, matchesUrl } from "./url-match";
export type ScriptMetadata = Record<string, string[]>;
export type Compatibility = {
  supported: boolean;
  warnings: string[];
  blockers: string[];
  grants: string[];
};
export const supportedGrants = [
  "none",
  "GM_info",
  "GM_addStyle",
  "GM_getValue",
  "GM_setValue",
  "GM_deleteValue",
  "GM_listValues",
  "GM.info",
  "GM.addStyle",
  "GM.getValue",
  "GM.setValue",
  "GM.deleteValue",
  "GM.listValues",
];
export function parseMetadata(source: string): ScriptMetadata {
  const block = source.match(
    /(?:^|\n)[ \t]*\/\/[ \t]*==UserScript==[ \t]*\r?\n([\s\S]*?)\/\/[ \t]*==\/UserScript==/,
  );
  if (!block)
    throw new Error("A // ==UserScript== metadata block is required.");
  const result: ScriptMetadata = Object.create(null);
  for (const line of block[1].split(/\r?\n/)) {
    const item = line.match(/^\s*\/\/\s*@([\w-]+)\s*(.*?)\s*$/);
    if (item) (result[item[1]] ??= []).push(item[2]);
  }
  if (!result.name?.[0]?.trim()) throw new Error("@name is required.");
  if (!result.version?.[0] || !valid(result.version[0]))
    throw new Error("@version must be a semantic version, such as 1.0.0.");
  if (!(result.match?.length || result.include?.length))
    throw new Error("At least one @match or @include directive is required.");
  for (const pattern of [
    ...(result.match ?? []),
    ...(result["exclude-match"] ?? []),
  ])
    if (!validMatch(pattern)) throw new Error(`Invalid @match: ${pattern}`);
  for (const pattern of [...(result.include ?? []), ...(result.exclude ?? [])])
    if (pattern.startsWith("/"))
      throw new Error(
        "Regex @include/@exclude directives are unsupported; use globs.",
      );
  for (const key of [
    "name",
    "namespace",
    "version",
    "description",
    "author",
    "run-at",
    "icon",
    "updateURL",
    "downloadURL",
  ])
    if ((result[key]?.length ?? 0) > 1)
      throw new Error(`@${key} may only appear once.`);
  if (
    result.name[0].length > 120 ||
    (result.description?.[0]?.length ?? 0) > 2000
  )
    throw new Error("Metadata name or description is too long.");
  return result;
}
export function analyzeCompatibility(
  meta: ScriptMetadata,
  source: string,
): Compatibility {
  const grants = meta.grant ?? [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const grant of grants)
    if (!supportedGrants.includes(grant))
      blockers.push(`Unsupported permission: ${grant}`);
  if (meta.require?.length)
    blockers.push(
      "@require dependencies are not loaded. Bundle and review them in the source.",
    );
  if (meta.resource?.length) blockers.push("@resource is unsupported.");
  if (/\bunsafeWindow\b/.test(source))
    blockers.push(
      "unsafeWindow is unsupported. Use standard window APIs on the target page.",
    );
  const calls = source.match(/\bGM_[a-zA-Z]+\b|\bGM\.[a-zA-Z]+\b/g) ?? [];
  for (const call of new Set(calls))
    if (!supportedGrants.includes(call))
      blockers.push(`Unsupported API referenced: ${call}`);
    else if (!grants.includes(call) && call !== "GM_info")
      blockers.push(`API ${call} must be declared with @grant.`);
  if (meta["run-at"]?.[0] && meta["run-at"][0] !== "document-idle")
    warnings.push(
      "Execution is manual at launch time; @run-at timing cannot be guaranteed.",
    );
  if (meta.updateURL?.length || meta.downloadURL?.length)
    warnings.push(
      "Remote update URLs are metadata only. Updates come from reviewed registry versions.",
    );
  warnings.push(
    "Runs with access to the target page. Shadow DOM isolates styles, not script permissions.",
  );
  return { supported: blockers.length === 0, blockers, warnings, grants };
}
export const template = `// ==UserScript==\n// @name         My script\n// @namespace    raxlet\n// @version      1.0.0\n// @description  Describe what your script does\n// @match        https://example.com/*\n// @grant        GM_addStyle\n// ==/UserScript==\n\nGM_addStyle('body { outline: 2px solid #a3e635; }');\n`;
