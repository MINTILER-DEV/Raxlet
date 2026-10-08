# API reference

The full endpoint and payload reference is shipped at `/docs/api` and in `src/lib/docs.ts`. Browser clients use Better Auth first-party session cookies. Every mutation requires `Content-Type: application/json` and `Origin` equal to the configured canonical website origin. There are no permanent personal bearer keys.

Responses are `{data: ...}` or `{error:{code,message,details?}}`; paginated discovery adds `{meta:{page,limit,total}}`. Discoverable scripts are public, visible, and owned by active publishers. Direct reads allow unlisted access and owner-only private access. Hidden scripts are available only to their author; a report does not expose hidden/private source to other users.

Examples from a same-origin browser session:

```js
// Public discovery (no auth required).
const response = await fetch("/api/registry/search?q=style&limit=20&page=1");
const { data, meta } = await response.json();

// Create a private script; source must include valid userscript metadata.
await fetch("/api/scripts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ source, visibility: "private" }),
});

// Reviewed install of a specific version. New entry is disabled.
await fetch("/api/library/install", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scriptId, versionId, confirmed: true }),
});

// Version source is immutable; save a newer semantic version.
await fetch(`/api/scripts/${scriptId}/versions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    source: newSource,
    expectedRevision: 1,
    changelog: "Improve styling",
  }),
});
```

Only public `/api/registry/*` read responses allow wildcard CORS, without credentials. Script detail endpoints may serve private owner data and therefore do not offer cross-origin reads. Launchers use the approved popup bridge instead of third-party cookies or cross-origin bearer tokens.

Authenticated read/mutation limits are 120/40 requests per minute per user. Anonymous callers on Vercel use its trusted forwarding header; elsewhere anonymous traffic shares a bucket. Better Auth login and registration limits are separate. HTTP 429 carries `Retry-After: 60`.
