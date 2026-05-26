# User Preferences

- Commits are allowed in this repository.
- After completing and verifying any coherent work set, Codex must create a git commit automatically without asking for extra confirmation, unless the user explicitly says not to commit or the next action is risky or destructive.
- Commit only files changed for the current task. Never include pre-existing unrelated dirty or untracked files.
- When using Superpowers skills or workflows, do not create commits silently; mention the commit hash in the final summary.
- Keep related changes bundled together instead of splitting tiny commits unless the user asks otherwise.
- Never write or update tests unless the user explicitly asks to do so.
- When showing a plan, always include explicit file operations with exact paths for `Create`, `Update`, and `Delete`, using `none` when a category is empty.

## Testing And Verification

- `npm run test` runs the fast Node test suite for pure TypeScript logic in `tests/*.test.ts`.
- `npm run test:e2e` runs the Playwright Chromium smoke suite in `tests/e2e/*.spec.ts`; it starts Next on `127.0.0.1:3001` unless `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_PORT` is set.
- `npm run verify` runs lint, unit tests, and the production build. Use this as the normal one-shot check.
- `npm run verify:full` runs lint, unit tests, Playwright smoke tests, and the production build. Use this before broad route/UI changes, release handoff, deploy handoff, or work that could compile cleanly but fail in the browser.
- After changing shell navigation, route rendering, transaction table links, login visibility, loading states, or app-wide layout behavior, run `npm run test:e2e` in addition to the focused checks.
- The Playwright smoke suite depends on local app data being available through the configured Postgres database. If `/transactions` fails because the local schema is behind, run `npm run db:migrate` before blaming the browser test.
- On this Windows machine, `localhost:3000` may belong to another project. Prefer `127.0.0.1:3001` for PortfolioTrack smoke checks unless you have confirmed the active port.
- For admin-only local or Playwright checks, use the normal local admin auth flow through `/login` or `POST /api/auth/login` against `127.0.0.1:3001` when local dev credentials/config are available. Do not create temporary helper servers, browser-navigation cookie workarounds, or hand-built `HttpOnly` admin cookies unless the user explicitly asks for that.
