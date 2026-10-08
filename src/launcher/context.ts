import type { Runnable } from "./engine";
import type { ScriptMetadata } from "../lib/userscript";
export const apiNames = [
  "GM_info",
  "GM_getResourceText",
  "GM_getResourceURL",
  "GM_addStyle",
  "GM_getValue",
  "GM_setValue",
  "GM_deleteValue",
  "GM_listValues",
];
export function executionContext(
  script: Runnable,
  metadata: ScriptMetadata,
  save: (settings: Record<string, unknown>) => Promise<void>,
  status: (value: string) => void,
  resources: Record<string, string> = {},
  metaStr?: string,
) {
  const settings: Record<string, unknown> = Object.assign(
    Object.create(null),
    script.settings,
  );
  const info = Object.freeze({
    script: {
      name: metadata.name[0],
      version: metadata.version[0],
      description: metadata.description?.[0] ?? "",
      namespace: metadata.namespace?.[0] ?? "",
      includes: metadata.include ?? [],
      matches: metadata.match ?? [],
      excludes: [
        ...(metadata.exclude ?? []),
        ...(metadata["exclude-match"] ?? []),
      ],
      resources: Object.fromEntries(
        Object.keys(resources).map((name) => [name, { name }]),
      ),
    },
    scriptMetaStr:
      metaStr ??
      script.source.match(
        /\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/,
      )?.[0] ??
      "",
    scriptHandler: "Raxlet",
    version: "0.1.0",
    isIncognito: false,
  });
  let persistence: Promise<void> = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.parse(JSON.stringify(settings));
    persistence = persistence.catch(() => {}).then(() => save(snapshot));
    persistence.catch((e) => status(`Storage failed: ${(e as Error).message}`));
    return persistence;
  };
  const key = (k: unknown) => {
    if (typeof k !== "string" || k.length > 100)
      throw new Error("GM storage keys must be strings up to 100 characters.");
    return k;
  };
  const clone = (v: unknown) =>
    v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const getValue = (k: string, fallback?: unknown) =>
    Object.hasOwn(settings, key(k)) ? clone(settings[k]) : fallback;
  const setValue = (k: string, v: unknown) => {
    const candidate = clone(v);
    if (candidate === undefined)
      throw new Error("GM storage accepts JSON values only.");
    const next = { ...settings, [key(k)]: candidate };
    if (JSON.stringify(next).length > 16000)
      throw new Error("Script settings exceed 16KB.");
    settings[k] = candidate;
    return persist();
  };
  const deleteValue = (k: string) => {
    delete settings[key(k)];
    return persist();
  };
  const addStyle = (css: string) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    if (!style.sheet) {
      style.remove();
      throw new Error("This page's CSP blocked GM_addStyle.");
    }
    return style;
  };
  const apis: Record<string, unknown> = {
    GM_info: info,
    GM_getResourceText: (name: string) => {
      if (!Object.hasOwn(resources, name))
        throw new Error(`Unknown resource: ${name}`);
      return resources[name];
    },
    GM_getResourceURL: (name: string) => {
      if (!Object.hasOwn(resources, name))
        throw new Error(`Unknown resource: ${name}`);
      return (
        "data:text/plain;charset=utf-8," + encodeURIComponent(resources[name])
      );
    },
    GM_addStyle: addStyle,
    GM_getValue: getValue,
    GM_setValue: (k: string, v: unknown) => {
      void setValue(k, v);
    },
    GM_deleteValue: (k: string) => {
      void deleteValue(k);
    },
    GM_listValues: () => Object.keys(settings),
  };
  const modern: Record<string, unknown> = {
    info,
    getResourceText: async (name: string) =>
      (apis.GM_getResourceText as (name: string) => string)(name),
    getResourceUrl: async (name: string) =>
      (apis.GM_getResourceURL as (name: string) => string)(name),
    addStyle: async (css: string) => addStyle(css),
    getValue: async (k: string, v: unknown) => getValue(k, v),
    setValue,
    deleteValue,
    listValues: async () => Object.keys(settings),
  };
  const grants = new Set(metadata.grant ?? []);
  const denied = (name: string) => () => {
    throw new Error(`${name} is unsupported or was not declared with @grant.`);
  };
  const gm = new Proxy(Object.create(null), {
    get: (_target, prop: string) =>
      grants.has("GM." + prop)
        ? (modern[prop] ?? denied("GM." + prop))
        : denied("GM." + prop),
  });
  const names = Object.keys(apis);
  const values = names.map((n) =>
    grants.has(n) || n === "GM_info" ? apis[n] : denied(n),
  );
  return { names, values, gm, flush: () => persistence };
}
