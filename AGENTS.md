Execute shell commands with `login: false`.
Run `source ~/.bashrc` once before starting to ensure PATH is correct.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` for meaningful changes.
For database or authorization changes, run integration tests against a separate disposable PostgreSQL database; never a production database.
Keep script source untrusted. Do not execute community code on the authenticated Raxlet origin or expose account tokens to target pages.
Commit and push minor or significant changes, as requested by the repository owner.
