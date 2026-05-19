# PortfolioTrack

PortfolioTrack is a deployable personal portfolio tracker built with Next.js, Neon Postgres, Drizzle ORM, and Yahoo Finance market data. It tracks manual stock and DR transactions across multiple portfolios, calculates fee-aware positions and P&L, caches market prices in Postgres, and shows dashboard, transactions, and per-asset detail views.

For deeper repository context aimed at AI coding agents, read [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md).
For the latest layout and visual-design review, read [docs/UX_REVIEW.md](docs/UX_REVIEW.md).

## Current Capabilities

- Manual `BUY` and `SELL` transaction entry with broker selection for Dime or Webull and server-side validation.
- Multiple portfolios in one app, with public portfolio switching and admin-only portfolio management.
- Admin-only Excel transaction workflow: download the app template, export the ledger, preview imports, create missing instruments when requested, skip duplicates, and commit valid rows atomically.
- Fee-aware average cost, total cost basis, realized P&L, unrealized P&L, and total fees.
- Dashboard with portfolio summary cards, price coverage, top holdings, full holdings table, portfolio chart, and S&P 500 benchmark comparison.
- Per-asset detail route at `/assets/[symbol]` with position metrics, price history, recent transactions, and DR analytics when metadata exists.
- DR equivalent analytics for instruments with DR metadata, including parent-stock implied price, FX rate, parent quote, and premium/discount.
- Yahoo Finance quote and historical-price refresh with Neon Postgres caching, cached-first page loads, and secured Vercel Cron refresh slots through the evening plus US market open and close.
- Local UI preferences for `EN / TH` shell language and `light / dark` theme.
- Fullscreen application shell optimized for a dense personal finance workspace.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Postgres through `pg` for local development and Neon Postgres through `@neondatabase/serverless` for hosted deployments
- Drizzle ORM
- Recharts
- Yahoo Finance data through `yahoo-finance2`
- Zod for transaction input validation
- Excel workbook import/export through `exceljs`

## Getting Started

Install dependencies:

```powershell
npm install
```

Create `.env.local` or set shell variables with:

```powershell
$env:LOCAL_DATABASE_URL="postgresql://portfoliotrack:portfoliotrack@127.0.0.1:55432/portfoliotrack"
$env:AUTH_SECRET="<long-random-secret>"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD_HASH="<scrypt-hash>"
```

Local development prefers `LOCAL_DATABASE_URL`, then falls back to `DATABASE_URL`, then to `postgresql://portfoliotrack:portfoliotrack@127.0.0.1:55432/portfoliotrack` when `NODE_ENV` is not `production`. Keep `DATABASE_URL` for the hosted Neon database.

Start the repo-local Postgres database:

```powershell
npm run db:local:up
```

Generate an admin password hash:

```powershell
npm run auth:hash -- "your-admin-password"
```

When pasting the generated hash into `.env` files, escape each `$` as `\$` so Next.js does not treat hash segments as environment variable references.

Push the database schema to the configured local or hosted Postgres database:

```powershell
npm run db:migrate
```

Optionally seed sample data:

```powershell
npm run db:seed
```

Start the development server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

Public visitors can view the app read-only and switch between portfolios. Sign in at `/login` to unlock portfolio management, transaction editing, Excel import/export, instrument search, and market-data refresh.

## Scripts

- `npm run dev` starts the development server.
- `npm run test` runs the Node test suite through `tsx`.
- `npm run verify` runs lint, tests, and production build in sequence.
- `npm run build` builds the production app and runs type/lint checks through Next.
- `npm run start` serves the production build.
- `npm run lint` runs ESLint.
- `npm run db:local:up` starts the repo-local Postgres container on `127.0.0.1:55432`.
- `npm run db:local:down` stops the repo-local Postgres container.
- `npm run db:migrate` pushes the Drizzle schema to the configured Postgres database.
- `npm run db:seed` inserts sample instruments and settings.
- `npm run auth:hash` prints a scrypt password hash for `ADMIN_PASSWORD_HASH`.

## Project Map

- `src/app/` contains Next.js routes, layouts, pages, and API route handlers.
- `src/components/` contains reusable UI components used by the app pages.
- `src/server/` contains server-only query and application-service functions for portfolios, dashboard, holdings snapshots, transactions, and assets.
- `src/lib/auth/` contains the signed admin session and password verification helpers.
- `src/lib/db/` contains local/Neon Postgres connection setup, Drizzle schema, seed script, and number precision helpers.
- `src/lib/market/` contains the market-data provider abstraction and Yahoo Finance implementation.
- `src/lib/portfolio/` contains selected-portfolio helpers plus position and timeline calculations.
- `src/lib/transactions/` contains transaction-specific helpers, including Excel workbook parsing and generation.
- `src/lib/ui/` contains local shell preference and translation helpers.
- `src/lib/validation/` contains Zod schemas for incoming data.
- `drizzle/` contains SQL migrations and Drizzle metadata snapshots.
- `docs/` contains design, plan, and AI-facing project context documents.
- `docs/DEPLOYMENT.md` documents the Vercel + Neon deployment workflow.

## Deployment

The production database lives in Neon Postgres. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full free-tier Vercel + Neon setup.

The database schema is declared in `src/lib/db/schema.ts`, with SQL migrations in `drizzle/`. Use `npm run db:migrate` after schema changes.

Market refresh runs are tracked in `market_refresh_runs`. Vercel Cron calls slot-specific routes in `Asia/Bangkok`: `/api/cron/market-data/1800`, `/1900`, `/2000`, `/2030` for US market open, `/2100`, `/2200`, `/2300`, `/0000`, and `/0300` for US market close. Each route requires `Authorization: Bearer $CRON_SECRET`, refreshes every portfolio through the guarded `daily-auto` path, and records one run per Bangkok day per portfolio per slot. Admin manual refresh remains available from the app and bypasses the scheduled slot limit.

## Notes For Future Work

- The test suite covers the transaction selection helper, position math, validation, and timeout utility. Run `npm run test` before changing those flows.
- Excel transaction import is template-only for now: unknown instruments can be created with `Instrument Action = CREATE`, duplicate rows are skipped, broker defaults to Dime when omitted, and valid rows are inserted as one batch.
- Transactions are scoped by selected portfolio; instruments and market price caches are shared across portfolios.
- Market data comes from Yahoo Finance and can fail or return missing/currency-mismatched data. UI code should preserve clear missing-data states.
- Dashboard and transactions render from cached local data first. Scheduled market-data refreshes are guarded and best-effort so pages keep opening quickly when Yahoo is slow.
- The main app surface is English-first in `EN` mode. Thai remains only in the explicit `TH` shell labels and should be added back to pages through a deliberate bilingual copy layer if needed.
- Theme and language preferences are stored in browser `localStorage`, not the database.
- The development server may print a Windows SWC DLL warning while still compiling and building successfully.
- The latest UX polish pass removed page-level hero blocks and repetitive explanatory copy, tightened operational headers, prioritized task surfaces, improved dark-mode separation, added icon-backed shell navigation, and made the main routes English-first in `EN` mode.
