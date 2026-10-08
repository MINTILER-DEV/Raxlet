import type { ScriptMetadata } from "./userscript";
export function validMatch(pattern: string) {
  return (
    pattern === "<all_urls>" ||
    /^(?:\*|https?):\/\/(?:\*|\*\.[a-z\d.-]+|[a-z\d.-]+)(?:\/.*)$/.test(pattern)
  );
}
const glob = (value: string, pattern: string) =>
  new RegExp(
    "^" +
      pattern
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  ).test(value);
export function matchPattern(pattern: string, href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (pattern === "<all_urls>") return true;
  const parts = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/);
  if (!parts) return false;
  const [, scheme, host, path] = parts;
  const hostname = url.hostname.toLowerCase();
  return (
    (scheme === "*" || url.protocol === scheme + ":") &&
    (host === "*" ||
      hostname === host ||
      (host.startsWith("*.") &&
        (hostname === host.slice(2) ||
          hostname.endsWith("." + host.slice(2))))) &&
    glob(url.pathname + url.search, path)
  );
}
export function matchesUrl(meta: ScriptMetadata, href: string) {
  try {
    if (!["http:", "https:"].includes(new URL(href).protocol)) return false;
  } catch {
    return false;
  }
  return (
    ((meta.match ?? []).some((p) => matchPattern(p, href)) ||
      (meta.include ?? []).some((p) => glob(href, p))) &&
    ![...(meta.exclude ?? []), ...(meta["exclude-match"] ?? [])].some(
      (p) => glob(href, p) || matchPattern(p, href),
    )
  );
}
