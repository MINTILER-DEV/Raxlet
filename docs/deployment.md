# Deploy to Vercel with Neon

1. Create a Neon PostgreSQL project and database. Copy its pooled TLS connection string. Use a separate Neon branch for previews and tests; never point an untrusted preview build at production data.
2. Import this repository into Vercel and select the Next.js preset. Install with `npm ci --include=dev`, build with `npm run build`, and use a supported Node.js version (20.19+). Keep the default Next.js output directory.
3. Set `DATABASE_URL` to the Neon pooled TLS connection URL, `BETTER_AUTH_SECRET` to an independently generated secret of at least 32 characters, and `BETTER_AUTH_URL` to the exact canonical HTTPS domain. Generate a secret with `openssl rand -base64 48`. Never put these values in `NEXT_PUBLIC_*` variables.
4. Apply checked-in migrations from a trusted workstation or protected CI step: `DATABASE_URL='...' npm run db:migrate`. Use the environment secret mechanism instead of a literal connection string in shared shell history. Migrations are a separate release step; the build does not mutate production data.
5. Deploy. Verify `GET /api/health` returns HTTP 200 and a connected database. Register, create a private script, publish a test version, and verify another account cannot read private resources.
6. Set a public username in account settings. To designate an administrator, find its stable user ID with `SELECT id, email FROM users WHERE email = 'your-email';`. Set `ADMIN_USER_IDS` to a comma-separated list of those IDs and redeploy. Users cannot grant themselves administration.
7. Test a bookmarklet on a website you own with permissive CSP. Check popup linking, source review, disabled installs, explicit run confirmation, GM persistence, revocation, and the blocked-page fallback.

No additional background worker or ephemeral filesystem storage is required. Runtime data is in PostgreSQL; `public/launcher.js` and self-hosted Monaco assets are generated at build time.

## Environment

| Variable             | Required       | Purpose                                                                |
| -------------------- | -------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`       | Yes            | PostgreSQL/Neon pooled connection URL. Require TLS in production.      |
| `BETTER_AUTH_URL`    | Yes            | Exact canonical URL, also the mutation origin allowlist.               |
| `BETTER_AUTH_SECRET` | Yes            | At least 32 random characters; sign authentication state.              |
| `ADMIN_USER_IDS`     | For moderation | Server-controlled comma-separated user IDs. Empty means no admins.     |
| `TEST_DATABASE_URL`  | Tests only     | A separate disposable database. Integration tests truncate its tables. |

Changing the canonical domain requires replacing stored bookmarklets; ordinary library changes do not. Raxlet supports one canonical origin per deployment. Configure previews with their own origin, secret, and database. A Raxlet popup must retain `window.opener` to connect; do not add a global COOP `same-origin` header to `/authorize` unless you accept disabling cross-origin account linking. Cross-origin-isolated target websites may still prevent linking.

Authentication uses secure cookies in production. Local development uses HTTP cookies. Serve production exclusively through HTTPS. Ensure the reverse proxy preserves trusted client-origin headers. On Vercel, the API trusts only its overwritten `x-vercel-forwarded-for` for anonymous rate-limit identity; elsewhere anonymous callers share a bucket unless you implement a trusted proxy adapter. Authenticated API limits use verified session user IDs.

## Operations

- Back up the Neon database and test restores before handling valuable user data.
- Monitor HTTP 503 errors and logs for connection/configuration failures. Responses never include database credentials or stack traces.
- PostgreSQL indexes support discovery, ownership, version ordering, counters, and report review. Rate limits are atomic inserts/upserts, not per-process memory.
- Periodically delete expired records using trusted maintenance tooling:

```sql
DELETE FROM launcher_authorizations WHERE expires_at < now() - interval '1 day';
DELETE FROM api_rate_limits WHERE reset_at < now() - interval '1 day';
DELETE FROM auth_rate_limits WHERE last_request < extract(epoch FROM now() - interval '1 day') * 1000;
DELETE FROM sessions WHERE expires_at < now();
DELETE FROM verifications WHERE expires_at < now();
```

- Keep audit logs according to your retention policy. Installation history records one lifetime unique user/script pair for manipulation-resistant counters; uninstall does not decrement it. Account/script deletion cascades this data.
- Suspension revokes the publisher’s sessions and launcher grants. Discovery and other users’ launcher libraries exclude suspended publishers and hidden/private scripts.
- The repository provides email/password registration and password changes. Email verification, password-reset delivery, external identity providers, CAPTCHA, and a formal malware-review pipeline require additional provider integrations and are not enabled. Registering does not claim ownership of an email address until you add verification.

## Validation

Run type checking, ESLint, unit tests, real PostgreSQL integration tests, Chromium browser tests, and a production build before release. See README for commands. The GitHub workflow creates an isolated PostgreSQL service for integration tests and builds with no production secrets. Configure real credentials separately before deploying.
