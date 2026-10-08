import http from "node:http";
import { URL } from "node:url";
const server = http.createServer((req, res) => {
  if (req.url === "/packed-inline") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'",
    );
  }
  if (req.url === "/blocked") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    );
  }
  if (req.url === "/no-eval") {
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' ${new URL(process.env.RAXLET_TEST_URL ?? "http://localhost:3000").origin}; style-src 'self' 'unsafe-inline'`,
    );
  }
  if (req.url === "/isolated") {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    '<!doctype html><html lang="en"><head><title>Owned launcher test page</title></head><body><h1>Launcher integration fixture</h1><p id="result">Not run</p></body></html>',
  );
});
server.listen(4311, "127.0.0.1", () =>
  console.log("Test target: http://127.0.0.1:4311"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
