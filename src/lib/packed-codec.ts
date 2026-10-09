import { PACKED_SIZE_LIMIT } from "./packed-types";
export function encodeBookmarklet(source: string) {
  return (
    "javascript:" +
    encodeURIComponent(source).replace(
      /[!'()*]/g,
      (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
    )
  );
}
// Packed builds always use gzip. The direct URL is an explicit compatibility fallback.
export function selectPackedEncoding(code: string, compressedCode: string) {
  const directBookmarklet = encodeBookmarklet(code);
  const compressedBookmarklet = encodeBookmarklet(compressedCode);
  return {
    directBookmarklet,
    compressedBookmarklet,
    compressionApplied: true,
    bookmarkletCode: compressedCode,
    bookmarklet: compressedBookmarklet,
  };
}
export function needsPackedOptimization(encodedBytes: number) {
  return encodedBytes > PACKED_SIZE_LIMIT;
}
