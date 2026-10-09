export const documents: Record<
  string,
  {
    title: string;
    intro: string;
    sections: {
      title: string;
      paragraphs?: string[];
      code?: string;
      items?: string[];
    }[];
  }
> = {
  packed: {
    title: "Packed Mode",
    intro:
      "A self-contained launcher and reviewed script snapshot in one bookmarklet, available offline after generation.",
    sections: [
      {
        title: "Build a bookmarklet",
        items: [
          "Open Dashboard → Launcher → Packed Mode. Select installed or authored scripts, filter by category or collection, and review source and permissions.",
          "Configure theme, position, compact layout, initial enabled state, descriptions, warnings, search, and launcher minification. Approve community scripts and listed external dependencies explicitly.",
          "Generate, inspect the source and size report, then drag the bookmark link or copy its URL into a bookmark. The complete launcher and source are embedded; no Raxlet account link or download happens on the target page.",
        ],
      },
      {
        title: "Execute deliberately",
        paragraphs: [
          "Open a compatible HTTP(S) page, launch the bookmarklet, enable a matching script, click Run, and confirm. No automatic execution occurs. The Raxlet account origin is refused.",
          "Packed scripts run with ordinary page privileges, without extension isolation. They can inspect page information and make their own requests. Shadow DOM isolates styles, not permissions. Account credentials and saved library settings are excluded; GM storage is in memory for the panel session.",
        ],
      },
      {
        title: "Dependencies and compatibility",
        paragraphs: [
          "Approved public HTTPS @require scripts and UTF-8 text @resource files are retrieved only during generation and embedded in order. Unsupported APIs, unsafe URLs, module dependencies, and binary resources are rejected. Text resource APIs and Cloud Mode's supported GM subset are available.",
          "CSP can block the bookmarklet before it starts, inline styles, or selected script behavior. Trusted Types, browser restrictions, and cross-origin rules still apply. Packing cannot bypass these restrictions. Precise @run-at and extension-only APIs are unsupported.",
          "Launcher minification preserves selected source verbatim by default. A separate experimental esbuild option minifies userscripts and approved @require dependencies when it reduces encoded size. Original versions and metadata remain unchanged; source inspection and optimization-sensitive behavior can differ. It works without dynamic compilation and can be combined with gzip. An optional Terser second pass runs always or automatically when the complete bookmarklet remains above 64,000 characters after esbuild and optional gzip. Its result is retained only when the full URL is smaller; reaching the target is not guaranteed. Experimental gzip compression is opt-in, preserves source losslessly, and is used only if the full encoded URL including its loader is smaller. It requires native browser gzip decompression and CSP/Trusted Types permission for dynamic Function compilation. Failure is reported; copy the standard fallback for better compatibility. Preview and download show the decompressed program, with a loader preview toggle. Practical bookmark and sync limits vary; 64,000 characters is a conservative target, not a universal maximum. Split large selections into collection bookmarks.",
        ],
      },
      {
        title: "Profiles and updates",
        paragraphs: [
          "Profiles save names, selections, versions, and settings in this browser for your account. They require fresh approval when loaded. Regeneration first shows latest versions and dependency URLs for review, keeps library installations unchanged, and reports changed sources/dependencies. Replace the saved bookmark manually; packed snapshots never update themselves.",
          "Use /api/packed/scripts and /api/packed/build with the existing authenticated same-origin API policy. Read docs/packed.md in the repository for packaging, storage, size, dependency, and browser details.",
        ],
      },
    ],
  },
  "getting-started": {
    title: "Getting started",
    intro:
      "A personal library and a portable launcher, with every run under your control.",
    sections: [
      {
        title: "Build your library",
        items: [
          "Create an account using an email address and a password of at least 12 characters.",
          "Explore public scripts, review their source and permissions, and install a version. New installations are disabled.",
          "Create private scripts in the editor, import .user.js files, or confirm an HTTPS URL import.",
          "Group scripts into collections and pin the ones you use often.",
        ],
      },
      {
        title: "Run a script",
        paragraphs: [
          "Open Dashboard → Launcher. Drag the bookmarklet to your bookmarks bar, or copy the console snippet. On a matching third-party webpage, launch Raxlet and click Link account. Approve the exact website origin in the Raxlet window, then keep that window open.",
          "Enable a compatible script, click Run, review source and permission warnings, and confirm execution. No code runs just because you install or enable it.",
        ],
      },
      {
        title: "Updates are explicit",
        paragraphs: [
          "An update badge appears when an installed version is older than the publisher’s current revision. Review source, permissions, and the changelog before confirming. An update disables the entry; enable it again when ready.",
          "Revoking a website authorization stops future bridge requests. It cannot undo code already run on the page. Reload the target page to remove script effects where possible.",
        ],
      },
    ],
  },
  launcher: {
    title: "Launcher guide",
    intro:
      "A reusable bookmarklet and console snippet that attempt to open Raxlet on ordinary HTTP(S) pages.",
    sections: [
      {
        title: "How account linking works",
        paragraphs: [
          "The bookmarklet contains only your Raxlet deployment URL. It loads a small vanilla JavaScript panel from /launcher.js. Clicking Link account opens /authorize on Raxlet with the target origin and a random nonce.",
          "After explicit approval, a session-bound database authorization expires in 15 minutes. A MessageChannel is transferred only after validating the popup identity, exact origins, and nonce. Requests are limited to reading the available library, toggling entries, and saving entry settings. The Raxlet window makes same-origin API calls with its session cookie; no password, bearer token, or session cookie is sent to the target page.",
          "Approving shares available script source and settings with the target page. That page can inspect them or imitate launcher controls. Link only pages you trust. Shadow DOM isolates styling, not secrets or execution.",
        ],
      },
      {
        title: "Browser limitations",
        items: [
          "CSP can block the initial remote script, inline styling, or dynamic JavaScript execution. The launcher does not bypass CSP.",
          "Browser internal pages, extension pages, the Chrome Web Store, and file URLs may prohibit bookmarklets or injected scripts.",
          "Popup blockers can reject the authorization window. Open it directly from the Link account button and allow popups if appropriate.",
          "Cross-Origin-Opener-Policy or cross-origin isolation may sever the popup opener; account linking then fails explicitly.",
          "Closing the approval window, expiration, revocation, or logout interrupts future library and storage requests.",
          "Console self-XSS protections may reject pasted code. Inspect the snippet and follow your browser’s security guidance.",
        ],
      },
      {
        title: "Fallback",
        paragraphs: [
          "If injection fails, an error handler attempts to open the launcher guide. Some policies block the bootstrap itself, so no in-page error can be shown. Open Raxlet’s dashboard directly to inspect, edit, or export your scripts. Raxlet cannot execute scripts on that blocked page from the dashboard.",
        ],
      },
    ],
  },
  userscripts: {
    title: "Writing userscripts",
    intro:
      "Use ordinary JavaScript with metadata and a documented set of GM APIs.",
    sections: [
      {
        title: "Required metadata",
        code: "// ==UserScript==\n// @name Example style\n// @namespace raxlet\n// @version 1.0.0\n// @description Add a readable border\n// @match https://example.com/*\n// @grant GM_addStyle\n// ==/UserScript==\nGM_addStyle('body { outline: 2px solid lime; }');",
        paragraphs: [
          "A name, semantic version, and at least one @match or glob @include are required. Duplicate scalar directives are rejected. Repeated directives and unknown fields are preserved.",
        ],
      },
      {
        title: "Matching rules",
        paragraphs: [
          "@match supports HTTP(S), wildcard schemes, exact hosts, *.subdomains, wildcard paths, and <all_urls> for HTTP(S). Host wildcards match the base domain and its subdomains. Paths include the query string and ignore URL fragments. @include and @exclude use full-URL globs; regex directives are rejected. Exclusions always win.",
        ],
      },
      {
        title: "Editing and versioning",
        paragraphs: [
          "Monaco is hosted by Raxlet, with JavaScript and metadata highlighting. The information panel exposes directives, grants, compatibility issues, and URL matches. Import and export never execute the source.",
          "Each save of changed source creates an immutable version. Increase @version before saving. Expected revision checks reject stale edits. Publishing controls listing visibility separately from the stored source. Public versions are readable; unlisted versions require a link; private versions require ownership.",
        ],
      },
    ],
  },
  compatibility: {
    title: "Compatibility & security",
    intro:
      "Raxlet implements a limited userscript subset. It is not a full Tampermonkey replacement.",
    sections: [
      {
        title: "Supported APIs",
        items: [
          "GM_info provides script metadata and identifies Raxlet.",
          "GM_addStyle(css) adds a style element to the target document, subject to page CSP.",
          "GM_getValue, GM_setValue, GM_deleteValue, and GM_listValues use the entry’s persistent JSON settings. Legacy writes return immediately and report persistence errors in launcher status.",
          "GM.info, GM.addStyle, GM.getValue, GM.setValue, GM.deleteValue, and GM.listValues expose asynchronous equivalents; setters wait for persistence.",
          "Declare each API with @grant. Storage is limited to JSON values, 100-character keys, and 16KB per entry. Concurrent tabs can overwrite each other’s settings; avoid simultaneous writes.",
        ],
      },
      {
        title: "Unsupported functionality",
        items: [
          "GM_xmlhttpRequest, GM_download, GM_cookie, GM_openInTab, clipboard APIs, menu APIs, unsafeWindow, and extension-only APIs.",
          "External @require dependencies and @resource bundles. Bundle dependencies in the source and review them.",
          "Guaranteed @run-at timing, browser-wide injection, automatic execution, and automatic remote update/download URLs.",
          "A security sandbox. The launcher analyzes metadata and obvious API references but cannot prove code is safe or identify every dynamically constructed call.",
        ],
      },
      {
        title: "Untrusted code and privacy",
        paragraphs: [
          "A script runs in the target page’s JavaScript environment and can inspect or change page data, send network requests allowed by the browser, and interact with site sessions. Permissions list available compatibility APIs; it does not restrict standard browser JavaScript.",
          "Community source is never executed on the authenticated Raxlet origin. Descriptions, changelogs, and source are rendered as escaped text, without raw HTML. Reports and moderation do not imply every script has been reviewed.",
          "Do not include credentials in scripts or settings. Treat script authors and target websites as parties you explicitly choose to trust. Revocation prevents future bridge calls but cannot erase source already shared or stop already-running JavaScript.",
        ],
      },
    ],
  },
  api: {
    title: "REST API",
    intro:
      "JSON endpoints use server-side session validation, ownership checks, Zod validation, pagination, and persistent rate limits.",
    sections: [
      {
        title: "Response contract",
        code: '{"data": {"id": "…"}}\n{"data": [], "meta": {"page": 1, "limit": 20, "total": 0}}\n{"error": {"code": "VALIDATION_ERROR", "message": "Invalid input.", "details": []}}',
        paragraphs: [
          "Mutations require application/json and an Origin header matching BETTER_AUTH_URL. Authentication uses Better Auth session cookies. Cross-origin credentialed requests are not allowed. Anonymous registry reads support CORS without credentials. Request bodies are capped at 600KB and script source at 500KB.",
        ],
      },
      {
        title: "Registry and script endpoints",
        items: [
          "GET /api/scripts and /api/registry/{search,trending,latest}: public discovery. Query: page, limit (1–50), q, category, tag, website. Trending uses unique installs in the last seven days, then lifetime installs.",
          "POST /api/scripts: {source, visibility?, category?, tags?, screenshots?, changelog?}. Creates a script, version, and disabled owner-library entry.",
          "GET /api/scripts/:id: direct public/unlisted reads or private owner reads, including current source and metadata.",
          "PATCH /api/scripts/:id: {expectedRevision, visibility?, category?, tags?, screenshots?}. Owner only.",
          "DELETE /api/scripts/:id: owner deletion with cascading relationships.",
          "GET /api/scripts/:id/versions: immutable version summaries. GET /api/scripts/:id/source?version=:versionId retrieves historical source.",
          "POST /api/scripts/:id/versions: {source, expectedRevision, changelog?}. Owner only; @version must increase.",
          "POST /api/scripts/:id/ratings: {score:1–5}. Requires a current install and disallows self-rating.",
        ],
      },
      {
        title: "Personal library",
        items: [
          "GET /api/library: authenticated user’s enabled states, pinned entries, source, settings, and available revision information.",
          "POST /api/library/install: {scriptId, versionId, confirmed:true}. Idempotent and disabled by default.",
          "DELETE /api/library/uninstall: {scriptId}. Unique lifetime install history remains for counter integrity.",
          "PATCH /api/library/:entryId: {enabled?, pinned?, settings?, versionId?, confirmed?}. Updating a version requires confirmed:true and disables it.",
          "GET/POST /api/collections, PATCH/DELETE /api/collections/:id, POST/DELETE /api/collections/:id/entries with {libraryId}.",
          "GET /api/activity?page=1&limit=20: installation and publishing audit history.",
          "POST /api/import: {url, confirmed:true}. Direct public HTTPS URLs only; DNS validation, no redirects, eight-second timeout, 500KB limit.",
        ],
      },
      {
        title: "Authors, moderation, and launcher",
        items: [
          "GET /api/users/:username and /api/users/:username/scripts: public profile and public scripts. POST/DELETE /api/users/:username/follow.",
          "GET/PATCH /api/users/me: private account/profile fields; PATCH accepts {username,bio}. GET /api/users/me/scripts lists all authored scripts.",
          "POST /api/reports: {scriptId,reason}. Administrator endpoints: GET /api/admin/reports, PATCH /api/admin/reports/:id {resolved}, PATCH /api/admin/scripts/:id {hidden}, PATCH /api/admin/users/:id {suspended}.",
          "GET/POST /api/launcher/authorizations; creation requires {origin,confirmed:true}. DELETE /api/launcher/authorizations/:id revokes owned access.",
          "POST /api/launcher/bridge: {authorizationId,origin,operation,entryId?,enabled?,settings?}. Operation is library, prepare, toggle, or storage; requires the approving session and exact target origin.",
          "GET /api/health returns database connectivity with no secrets.",
        ],
      },
      {
        title: "Status codes and limits",
        paragraphs: [
          "400 invalid input, 401 missing or expired authentication, 403 forbidden operation, 404 unavailable resource, 409 stale version or uniqueness conflict, 413 oversized body, 415 unsupported content type, 429 rate limit, and 503 unavailable database/configuration.",
          "Read requests allow 120/minute; mutations allow 40/minute. Better Auth separately limits login to 10/minute and signup to 5/minute. API limits are backed by PostgreSQL and return Retry-After. Vercel’s trusted forwarding header identifies anonymous callers; local anonymous traffic shares a bucket.",
        ],
      },
    ],
  },
};
