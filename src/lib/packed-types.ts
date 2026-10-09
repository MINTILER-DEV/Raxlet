import type { Compatibility, ScriptMetadata } from "./userscript";
export type PackedSettings = {
  theme: "dark" | "light" | "system";
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  compact: boolean;
  initiallyEnabled: boolean;
  descriptions: boolean;
  warnings: boolean;
  search: boolean;
  minify: boolean;
  compression: boolean;
};
export const packedDefaults: PackedSettings = {
  theme: "dark",
  position: "bottom-right",
  compact: false,
  initiallyEnabled: false,
  descriptions: true,
  warnings: true,
  search: true,
  minify: true,
  compression: false,
};
export type PackedCandidate = {
  id: string;
  scriptId: string;
  versionId: string;
  version: string;
  name: string;
  description: string;
  category: string;
  owned: boolean;
  source: string;
  metadata: ScriptMetadata;
  bytes: number;
  compatibility: Compatibility;
  dependencies: string[];
};
export type PackedScript = {
  id: string;
  scriptId: string;
  versionId: string;
  version: string;
  name: string;
  description: string;
  metadata: ScriptMetadata;
  enabled: boolean;
  hash: string;
  bytes: number;
  warnings: string[];
  resources: Record<string, string>;
  metaStr: string;
  dependencies: { url: string; hash: string; bytes: number }[];
};
export type PackedManifest = {
  format: 1;
  name: string;
  origin: string;
  settings: PackedSettings;
  scripts: PackedScript[];
};
export type PackedOutput = {
  name: string;
  code: string;
  bookmarkletCode: string;
  bookmarkletHash: string;
  compressionApplied: boolean;
  bookmarklet: string;
  manifest: PackedManifest;
  hash: string;
  characters: number;
  bytes: number;
  codeBytes: number;
  generatedAt: string;
  compression: string;
  compatibility: string;
  sizes: {
    unminified: number;
    minified: number;
    gzipBase64: number;
    direct: number;
    compressed: number;
    compressionNote: string;
  };
  warnings: string[];
};
