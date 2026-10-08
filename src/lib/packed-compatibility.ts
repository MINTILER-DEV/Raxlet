import { analyzeCompatibility, type ScriptMetadata } from "./userscript";
export const resourceGrants = [
  "GM_getResourceText",
  "GM_getResourceURL",
  "GM.getResourceText",
  "GM.getResourceUrl",
];
export function packedCompatibility(meta: ScriptMetadata, source: string) {
  const copy = {
    ...meta,
    require: [],
    resource: [],
    grant: (meta.grant ?? []).filter((g) => !resourceGrants.includes(g)),
  };
  const clean = source.replace(
    /\bGM_getResourceText\b|\bGM_getResourceURL\b|\bGM\.getResourceText\b|\bGM\.getResourceUrl\b/g,
    "",
  );
  const result = analyzeCompatibility(copy, clean);
  if (/\bimport\s*\(/.test(source))
    result.blockers.push(
      "Dynamic module imports are unsupported in offline packed scripts. Bundle the module into classic script source first.",
    );
  if (
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(source)
  )
    result.warnings.push(
      "This source references network APIs. The launcher is offline, but this script may need a connection for its own requests.",
    );
  result.grants = meta.grant ?? [];
  for (const grant of resourceGrants) {
    if (source.includes(grant) && !result.grants.includes(grant))
      result.blockers.push(`API ${grant} must be declared with @grant.`);
  }
  if (meta.require?.length || meta.resource?.length)
    result.warnings.push(
      "External dependencies require explicit approval and are fetched only during generation. Resources support UTF-8 text, not binary assets.",
    );
  result.warnings.push(
    "Packed storage lives in memory for this launcher session; it does not sync to your account. Included code can make its own network requests.",
  );
  result.supported = result.blockers.length === 0;
  return result;
}
