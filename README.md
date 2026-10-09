# Raxlet

An open-source userscript registry, personal library, Monaco editor, and portable JavaScript launcher. Built with Next.js App Router, TypeScript, Tailwind, shadcn/ui primitives, Drizzle, PostgreSQL, and Better Auth. Designed for Vercel and Neon.

Raxlet supports a **documented subset** of Tampermonkey-style scripts. It does not bypass browser security or guarantee execution on every website. Installing or enabling a script never runs it automatically.

## Run locally

Requires Node.js 20.19+ and PostgreSQL (local or Neon).

```sh
npm ci --include=dev
cp .env.example .env.local
# Set DATABASE_URL, BETTER_AUTH_URL, and BETTER_AUTH_SECRET.
# Generate a secret with: openssl rand -base64 48
npm run db:migrate
npm run dev
```

Visit http://localhost:3000, register an account, and create a script. The database starts empty; no fabricated scripts or counters are included. Assets for Monaco are self-hosted and copied during `predev` and `build`.

For local PostgreSQL use a connection string such as `postgresql://user:password@localhost:5432/raxlet`. For Neon use its **pooled** URL with `sslmode=require`; the driver uses a small reusable PostgreSQL pool suitable for Node serverless functions. Neither libraries nor authentication depend on the Vercel filesystem.

## Included workflows

- Email/password authentication, session revocation, password changes, and public author profiles.
- Private, unlisted, and public scripts; immutable versions with monotonic semantic versions and stale-edit protection.
- Reviewed installs and updates; disabled-by-default libraries, pinned entries, persistent JSON settings, collections, audit history, and uninstall.
- Registry search by name/description, category, tag, and website metadata; latest/trending discovery from real unique install history.
- Monaco source editing, metadata highlighting, match editing, permission analysis, file/confirmed URL import, and export.
- Source review, version histories, screenshot URLs, installed-user ratings, author follows, reports, and admin moderation.
- Reusable bookmarklet and console snippet; vanilla draggable Shadow DOM panel; manual execution, matching, status, errors, and selected GM APIs.
- Session-bound, exact-origin launcher approval with a revocable 15-minute bridge. Account credentials never reach the target page.
- Packed Mode builder: self-contained offline bookmarklets, reviewed script selection, approved bundled dependencies, configurable vanilla launcher, exact size reporting, downloads/source preview, local saved profiles, opt-in experimental esbuild userscript/dependency minification, and experimental gzip compression with full-size comparison and a standard fallback. See [Packed Mode](docs/packed.md).
- REST APIs, persistent rate limits, ownership checks, input validation, escaped source display, SSRF-resistant URL fetching, security headers, migrations, and health check.

## Commands

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
npm run db:generate  # after changing src/db/schema.ts; inspect generated SQL
npm run db:migrate
```

Integration tests use real PostgreSQL and Better Auth, with no mocked external credentials:

```sh
# Create a SEPARATE disposable database. Tests TRUNCATE its application tables.
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/raxlet_test npm run test:integration
```

Browser tests exercise the website and the real cross-origin popup launcher in Chromium:

```sh
npx playwright install chromium
# Set DATABASE_URL to a disposable browser-test database with migrations applied.
# Set BETTER_AUTH_URL=http://localhost:3000 and BETTER_AUTH_SECRET.
npm run test:browser
# If port 3000 is busy, use matching BETTER_AUTH_URL and RAXLET_TEST_URL:
# BETTER_AUTH_URL=http://localhost:3917 RAXLET_TEST_URL=http://localhost:3917 npm run test:browser
```

See [deployment](docs/deployment.md), [API](docs/api.md), and [security and compatibility](docs/security.md). The website also includes `/docs/getting-started`, `/docs/launcher`, `/docs/userscripts`, `/docs/compatibility`, and `/docs/api`.

## Architecture

- `src/db/`: PostgreSQL schema and lazy database connection. `drizzle/`: checked-in migrations and immutable-version triggers.
- `src/lib/auth.ts`: lazy Better Auth configuration. `src/lib/http.ts`: identity, origin, validation, response, and rate-limit policies.
- `src/lib/service.ts`: transactional registry/library/community services. Route handlers share this implementation with real-database integration tests.
- `src/lib/userscript.ts`: metadata parser, URL matcher, compatibility analyzer, and starter source.
- `src/launcher/`: standalone browser panel and explicit execution engine. Built into `public/launcher.js`, with no React runtime.
- `src/components/authorize.tsx`: trusted-origin popup broker; validates target origin, opener identity, nonce, session, grant expiry, and operation scope.
- `src/app/` and `src/components/`: responsive application, editor, account, community, and moderation interfaces.

## Limits

Community code is untrusted and runs with ordinary target-page privileges. Shadow DOM is style isolation, not a sandbox. A target page can inspect source and settings explicitly shared with it. Do not link sensitive or untrusted pages. CSP, popup blocking, cross-origin isolation, and restricted browser pages can prevent launch or execution. The fallback is the Raxlet library for source review/edit/export, not a browser-security workaround.

Cloud Mode does not load external `@require` or `@resource`; Packed Mode can bundle explicitly approved classic JavaScript dependencies and UTF-8 text resources at generation time. Extension-only APIs, automatic execution, precise `@run-at`, and remote update/download services are unsupported. Updates are reviewed versions. Settings use JSON and a 16KB limit; Cloud Mode's concurrent tabs can overwrite each other’s values, and Packed Mode keeps values only in memory for the launcher session. Asynchronous callback failures after a script returns cannot all be attributed to that script. Compatibility analysis is advisory, not a malware scanner.

Before exposing a deployment publicly, supply real Neon/Vercel configuration and run the checks above in your environment. No cloud account, production database, or deployed domain is provisioned by the repository itself.

Licensed under [MIT](LICENSE).
