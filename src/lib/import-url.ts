import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import { fail } from "./http";
export function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(address) !== 6) return false;
  const groups = address.toLowerCase().split(":");
  const first = parseInt(groups[0], 16),
    second = parseInt(groups[1] || "0", 16);
  // Global unicast only. Reject IETF special-use, documentation, 6to4, and former 6bone allocations.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
    first !== 0x2002 &&
    first !== 0x3ffe &&
    !(first === 0x3fff && second < 0x1000)
  );
}
export async function importUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    return fail(
      400,
      "INVALID_URL",
      "Use a public HTTPS URL on port 443 without credentials.",
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    return fail(
      400,
      "UNSAFE_URL",
      "Private and reserved network destinations are blocked.",
    );
  const resolved = addresses[0];
  // Pin DNS resolution to the validated address, including TLS hostname verification. Do not follow redirects.
  return new Promise<string>((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: (_hostname, _options, callback) =>
          callback(null, resolved.address, resolved.family),
        timeout: 8000,
        headers: {
          Accept: "text/plain, application/javascript",
          "User-Agent": "Raxlet-import/1.0",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(
              "Import requires a direct URL returning HTTP 200; redirects are blocked.",
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 500000)
            res.destroy(new Error("Remote script exceeds 500KB."));
          else chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Import timed out.")));
    req.on("error", reject);
  });
}
