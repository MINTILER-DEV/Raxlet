export function encodeBookmarklet(source: string) {
  return (
    "javascript:" +
    encodeURIComponent(source).replace(
      /[!'()*]/g,
      (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
    )
  );
}
export function selectPackedEncoding(
  code: string,
  compressedCode: string,
  enabled: boolean,
) {
  const directBookmarklet = encodeBookmarklet(code);
  const compressedBookmarklet = encodeBookmarklet(compressedCode);
  const compressionApplied =
    enabled && compressedBookmarklet.length < directBookmarklet.length;
  return {
    directBookmarklet,
    compressedBookmarklet,
    compressionApplied,
    bookmarkletCode: compressionApplied ? compressedCode : code,
    bookmarklet: compressionApplied ? compressedBookmarklet : directBookmarklet,
  };
}
