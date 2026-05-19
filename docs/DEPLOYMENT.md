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
npm run auth:hash -- "your-admin-password"
```

Generate `AUTH_SECRET` with any strong random value, for example:

```powershell
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

## 3. Prepare The Database

Install dependencies locally, then point `DATABASE_URL` at Neon and push the schema:

```powershell
npm install
$env:DATABASE_URL="postgresql://..."
npm run db:migrate
```

Optional seed:

```powershell
npm run db:seed
```

The committed SQL files are in `drizzle/` for review and manual database setup if needed. Apply the full schema before deploying changes that depend on new tables such as `market_refresh_runs`.

For local development, keep Neon credentials out of the dev loop and set `LOCAL_DATABASE_URL` instead:

```powershell
npm run db:local:up
$env:LOCAL_DATABASE_URL="postgresql://portfoliotrack:portfoliotrack@127.0.0.1:55432/portfoliotrack"
npm run db:migrate
npm run db:seed
```

The app prefers `LOCAL_DATABASE_URL` in development. The repo-local Docker database listens on `127.0.0.1:55432` so it does not conflict with a machine-level Postgres service on `5432`. Hosted Vercel environments should continue using `DATABASE_URL`.

## 4. Deploy

Push the repository to GitHub and let Vercel build it with:

```text
npm run build
```

After deploy:

- Visit the public URL while logged out and confirm dashboard, transactions, and asset detail pages load read-only. `/holdings` should redirect to the dashboard.
- Confirm the Vercel Cron entries exist for `GET /api/cron/market-data/1800`, `/1900`, `/2000`, `/2030`, `/2100`, `/2200`, `/2300`, `/0000`, and `/0300`, scheduled through the evening plus US market open and close in `Asia/Bangkok`.
- Visit `/login`, sign in as admin, then confirm create/update/delete and refresh controls appear.
- On `/transactions`, confirm the Dime/Webull broker selector is available in the admin transaction form, the Excel template downloads, ledger export requires admin, and an uploaded template can be previewed. Rows with `Instrument Action = CREATE` should create missing instruments during commit.
- Use `/api/auth/logout` through the header logout button to return to public read-only mode.

## Notes

- Public users can view all current pages and portfolio data.
- Public users can download the blank transaction import template.
- Public users cannot call protected write/import/export APIs; they return `401`.
- Scheduled market-cache writes run through guarded `daily-auto` refresh slots from `GET /api/cron/market-data/[slot]`, authorized by `CRON_SECRET`. Admin manual refresh is still required for on-demand updates.
- Vercel and Neon are free within their published free-tier limits. Higher traffic, storage, or compute can require a paid plan.
