# Deployment Guide

PortfolioTrack is set up for Vercel Hobby plus Neon Postgres. Public visitors can read the portfolio, while the admin session unlocks transaction editing, Excel import/export, instrument search, and market-data refresh.

## 1. Create Free Services

1. Create a Neon project and copy its pooled `DATABASE_URL`.
2. Create or import the GitHub repository in Vercel.
3. Keep the Vercel project on the Hobby plan.

## 2. Configure Environment Variables

Set these in Vercel Project Settings > Environment Variables:

```text
DATABASE_URL=postgresql://...
AUTH_SECRET=<long-random-secret>
ADMIN_USERNAME=<admin-username>
ADMIN_PASSWORD_HASH=<scrypt-hash>
CRON_SECRET=<long-random-secret>
```

Generate the password hash locally:

```powershell
pnpm run auth:hash -- "your-admin-password"
```

Generate `AUTH_SECRET` with any strong random value, for example:

```powershell
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

Before deploy handoff, check that required production variables are present:

```powershell
pnpm run config:check:prod
```

## 3. Prepare The Database

Install dependencies locally, then point `DATABASE_URL` at Neon and apply committed migrations:

```powershell
pnpm install
$env:DATABASE_URL="postgresql://..."
pnpm run db:migrate:prod
```

Optional seed:

```powershell
pnpm run db:seed
```

The committed SQL files are in `drizzle/` for review and manual database setup if needed. Apply the full schema before deploying changes that depend on new tables or columns such as `market_refresh_runs` and its async progress fields.

For local development, keep Neon credentials out of the dev loop and set `LOCAL_DATABASE_URL` instead:

```powershell
$env:LOCAL_DATABASE_URL="postgresql://postgres:<your-postgres-password>@localhost:5432/portfoliotrack"
pnpm run db:migrate:local
pnpm run db:seed
```

The app prefers `LOCAL_DATABASE_URL` in development. Local development uses the machine-level PostgreSQL service that pgAdmin connects to on `localhost:5432`. Hosted Vercel environments should continue using `DATABASE_URL`.

For schema changes, update `src/lib/db/schema.ts`, run `pnpm run db:generate`, optionally run `pnpm run db:check`, and review the generated SQL under `drizzle/` before applying the migration. Keep `drizzle-kit push` for local iteration only through `pnpm run db:migrate:local`; production handoff should use committed migrations through `pnpm run db:migrate:prod`.

The seed script is local-test oriented: it creates demo portfolios, transactions, prices, FX snapshots, DR metadata, and settings so dashboard, holdings, asset detail, import-adjacent flows, US stock valuation, and realized/closed-trade behavior can be checked without manual setup.

## 4. Deploy

Push the repository to GitHub and let Vercel build it with:

```text
pnpm run build
```

GitHub Actions runs `pnpm install --frozen-lockfile` and `pnpm run verify` before normal merge. That gate includes formatting, linting, TypeScript, unit tests, and a production build. Pull requests also run the Playwright smoke suite.

After deploy:

- Visit the public URL while logged out and confirm dashboard, transactions, and asset detail pages load read-only. `/holdings` should redirect to the dashboard.
- Confirm the Vercel Cron entries exist for `GET /api/cron/market-data/1800`, `/1900`, `/2000`, `/2030`, `/2100`, `/2200`, `/2300`, `/0000`, and `/0300`, scheduled through the evening plus US market open and close in `Asia/Bangkok`. On Vercel Hobby, cron timing is hourly best-effort, so treat these as target windows rather than exact minute triggers.
- Visit `/login`, sign in as admin, then confirm create/update/delete and refresh controls appear. Manual refresh should start quickly, show a running status, and complete through the protected worker instead of holding the original browser request open.
- On `/transactions`, confirm the Dime/Webull broker selector is available in the admin transaction form, the Excel template downloads, ledger export requires admin, and an uploaded template can be previewed. Rows with `Instrument Action = CREATE` should create missing instruments during commit.
- Use `/api/auth/logout` through the header logout button to return to public read-only mode.

## Notes

- Public users can view all current pages and portfolio data.
- Public users can download the blank transaction import template.
- Public users cannot call protected write/import/export APIs; they return `401`.
- Scheduled market-cache writes run through guarded `daily-auto` refresh slots from `GET /api/cron/market-data/[slot]`, authorized by `CRON_SECRET`. Cron and admin manual refreshes start a `market_refresh_runs` row, then `POST /api/market-data/refresh/work` processes the run in protected batches. Admin manual refresh is still required for on-demand updates.
- Vercel and Neon are free within their published free-tier limits. Higher traffic, storage, or compute can require a paid plan.
