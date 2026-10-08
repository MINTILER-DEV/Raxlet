import { parse } from "acorn";
import { parseMetadata } from "./userscript";
export function validateSource(source: string) {
  const metadata = parseMetadata(source);
  try {
    // Parse the async function body's grammar without evaluating any code.
    parse('"use strict";\n' + source, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
  } catch (error) {
    throw new Error(
      `Invalid JavaScript: ${(error as Error).message}. Module imports/exports are unsupported; bundle dependencies.`,
      { cause: error },
    );
  }
  return metadata;
}
