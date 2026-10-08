# Security and compatibility

## Trust boundaries

Raxlet's authenticated origin stores accounts, source, and settings. It never evaluates userscript source. Source, descriptions, metadata, and changelogs are escaped text; arbitrary HTML/Markdown HTML is not enabled. Screenshot links permit HTTPS only and images do not send referrers. URLs imported on the server require explicit confirmation, validated/pinned public DNS destinations, port 443, a direct 200 response, an 8-second timeout, and a 500KB maximum. Redirects and credentials in URLs are rejected.

The launcher is public vanilla JavaScript. Its bootstrap contains a deployment URL, never an API key. Shadow DOM protects styles, not secrets. Execution happens only on a matching HTTP(S) third-party page after enablement and explicit confirmation. The engine reparses source and blocks account-origin execution, mismatched URLs, disabled entries, unsupported grants, @require, and @resource. Metadata analysis cannot prove that arbitrary JavaScript is harmless. Standard browser APIs remain available to scripts.

The trusted `/authorize` popup uses the user's first-party Raxlet session. Approval creates an origin- and session-bound database grant lasting 15 minutes. Opener identity, exact origins, and a nonce are checked before transferring a MessageChannel. Only library read, preparing an installed script for manual execution, toggle, and entry settings operations are accepted. Account credentials and authorization IDs remain in the Raxlet popup; the third-party page receives script source and JSON settings, which it can inspect. Server routes validate the current session, suspension, user, session ID, origin, expiry, ownership, and scope on every bridge request. Authenticated APIs offer no cross-origin credentialed CORS.

Revocation, logout, or expiration prevents future bridge calls. Revocation cannot recover source already sent, erase copied settings, undo page modifications, or stop script code already executing. Only link pages you trust. A hostile target page can imitate launcher UI or use the shared channel within its approved scope. Browser cookies on arbitrary target websites are outside Raxlet's control.

## Compatibility contract

- Metadata: @name, @namespace, @version (semantic version), @description, @author, @match, glob @include/@exclude, @run-at, @grant, @require, @resource, @icon, @updateURL, @downloadURL, and unknown directives are retained. Scalar duplicates and malformed mandatory fields fail validation.
- URL matching: HTTP(S) exact/wildcard schemes, exact/wildcard hosts, path/query wildcards, `<all_urls>` for HTTP(S), and exclusions. Regex include/exclude is rejected.
- GM APIs: `GM_info`, `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues`; async `GM.info`, `GM.addStyle`, `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues`. Declare grants. Settings must be JSON, with 100-character keys and a 16KB entry limit.
- Unsupported: privileged network/clipboard/cookie/download/menu APIs, unsafeWindow, @require, @resource, automatic execution, guaranteed lifecycle timing, and automatic remote updates. Unsupported calls fail clearly; known references/dependencies are blocked before a run.
- Legacy GM setters update the run's local values immediately and enqueue persistence. The status area reports storage failures. Modern setters await persistence. Concurrent runs/tabs can overwrite entry settings; there is no cross-tab compare-and-swap store.
- Run completion covers the synchronous/awaited script body and pending GM writes. Timers, event handlers, and detached promises may outlive it; their errors cannot all be attributed to the originating script.

## Server controls

Better Auth persists sessions/accounts in PostgreSQL; production cookies are secure. Every protected API revalidates the session and suspension status. Mutations require a canonical Origin, JSON content type, and bounded bodies. Zod schemas reject unknown mutation properties. Ownership checks prevent cross-user reads and writes. Administrators come only from server configuration.

Versions and metadata have PostgreSQL UPDATE-rejection triggers. New version creation locks the parent script row and checks expected revision and a strictly increasing semantic version. Installs and ratings use unique constraints; authors cannot rate their own scripts, and ratings require current installations. Installs and updates start disabled. Public discovery excludes private/unlisted, hidden, and suspended-author scripts. Direct-link reads permit unlisted scripts and owner-only private scripts. A publisher changing a script to private removes it from other users' available libraries and bridge reads.

Application rate limits are backed by atomic PostgreSQL upserts; Better Auth uses database-backed endpoint limits. CSP denies objects/framing and arbitrary website script sources; source display is text. Raxlet's framework needs inline scripts/styles and Monaco workers; the policy deliberately permits those, without enabling eval on the Raxlet account origin. HSTS, nosniff, frame denial, restricted permissions, and referrer policy are configured in Next.js.

## Disclosure and operational scope

Do not claim total Tampermonkey compatibility, malware detection, browser-wide injection, or sandboxing. CSP, Trusted Types, restricted browser pages, blocked popups, cross-origin isolation, and opener policies can make the launcher unavailable. The fallback is opening the Raxlet website to inspect/edit/export source, not executing code from the authenticated origin.

Email verification/reset delivery and advanced abuse detection are provider integrations not included in the initial deployment. See deployment documentation before opening registration to the public.
