// This gzip loader needs CSP-permitted dynamic execution. It never relaxes CSP.
export async function start(
  origin: string,
  payload: string,
  expectedBytes: number,
) {
  try {
    if (location.origin === origin)
      throw new Error(
        "Packed scripts cannot run on the Raxlet account origin.",
      );
    if (!["http:", "https:"].includes(location.protocol))
      throw new Error("A normal HTTP or HTTPS webpage is required.");
    if (typeof DecompressionStream !== "function")
      throw new Error(
        "This browser does not support native gzip decompression.",
      );
    const compressed = Uint8Array.from(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
      (char) => char.charCodeAt(0),
    );
    const reader = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let source = "",
      total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > expectedBytes)
          throw new Error("Decompressed source exceeds its expected size.");
        source += decoder.decode(value, { stream: true });
      }
      source += decoder.decode();
      if (total !== expectedBytes)
        throw new Error("Decompressed source size is invalid.");
    } finally {
      await reader.cancel();
    }
    // User source is only defined here; the decoded launcher still requires manual runs.
    new Function(source)();
  } catch (error) {
    alert(
      `Raxlet experimental compression failed: ${(error as Error).message} Generate a standard bookmarklet if this browser lacks decompression or the page blocks dynamic execution through CSP or Trusted Types.`,
    );
  }
}
