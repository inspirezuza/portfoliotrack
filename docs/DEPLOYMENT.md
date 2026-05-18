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

## 4. Deploy

Push the repository to GitHub and let Vercel build it with:

```text
npm run build
```

After deploy:

- Visit the public URL while logged out and confirm dashboard, holdings, transactions, and asset detail pages load read-only.
- On the first public dashboard/holdings/transactions visit of a Bangkok day, the app may trigger a guarded background market refresh; pages should still render from cached data first.
- Visit `/login`, sign in as admin, then confirm create/update/delete and refresh controls appear.
- On `/transactions`, confirm the Dime/Webull broker selector is available in the admin transaction form, the Excel template downloads, ledger export requires admin, and an uploaded template can be previewed.
- Use `/api/auth/logout` through the header logout button to return to public read-only mode.

## Notes

- Public users can view all current pages and portfolio data.
- Public users can download the blank transaction import template.
- Public users cannot call protected write/import/export APIs; they return `401`.
- Public users can only trigger market-cache writes through the guarded `daily-auto` refresh path. Admin manual refresh is still required for on-demand updates.
- Vercel and Neon are free within their published free-tier limits. Higher traffic, storage, or compute can require a paid plan.
