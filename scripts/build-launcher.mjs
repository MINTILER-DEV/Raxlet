import { build } from "esbuild";
import { mkdir, cp } from "node:fs/promises";
import "./build-packed.mjs";
await mkdir("public", { recursive: true });
await build({
  entryPoints: ["src/launcher/index.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  outfile: "public/launcher.js",
  legalComments: "none",
});
await cp("node_modules/monaco-editor/min/vs", "public/monaco/vs", {
  recursive: true,
});
console.log("Built vanilla launcher and self-hosted Monaco assets.");
