import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("public", { recursive: true });
for (const minify of [false, true]) {
  await build({
    entryPoints: ["src/launcher/packed.ts"],
    bundle: true,
    minify,
    format: "iife",
    globalName: "RaxletPacked",
    target: ["es2022"],
    outfile: minify
      ? "public/packed-runtime.min.js"
      : "public/packed-runtime.js",
    legalComments: "none",
  });
}
