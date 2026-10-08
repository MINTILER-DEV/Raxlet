import { executionContext } from "./context";
import {
  analyzeCompatibility,
  matchesUrl,
  parseMetadata,
  type ScriptMetadata,
} from "../lib/userscript";
export type Runnable = {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  metadata: ScriptMetadata;
  settings: Record<string, unknown>;
};
export function assertExecution(
  script: Runnable,
  href: string,
  raxletOrigin: string,
) {
  const url = new URL(href);
  if (url.origin === raxletOrigin)
    throw new Error(
      "Community scripts cannot execute on the Raxlet account origin.",
    );
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("This browser page does not support userscripts.");
  if (!script.enabled) throw new Error("Enable this script before running it.");
  const parsed = parseMetadata(script.source);
  if (!matchesUrl(parsed, href))
    throw new Error("This script does not match the current page URL.");
  const compatibility = analyzeCompatibility(parsed, script.source);
  if (!compatibility.supported)
    throw new Error(compatibility.blockers.join(" "));
  return parsed;
}
export async function execute(
  script: Runnable,
  raxletOrigin: string,
  save: (settings: Record<string, unknown>) => Promise<void>,
  status: (value: string) => void,
) {
  const metadata = assertExecution(script, location.href, raxletOrigin);
  const { names, values, gm, flush } = executionContext(
    script,
    metadata,
    save,
    status,
  );
  status("Running…");
  try {
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    await new AsyncFunction(...names, "GM", '"use strict";\n' + script.source)(
      ...values,
      gm,
    );
    await flush();
    status("Completed");
  } catch (e) {
    status(
      `Execution failed: ${(e as Error).message}. The page may block code evaluation through CSP.`,
    );
    throw e;
  }
}
