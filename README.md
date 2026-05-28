# PortfolioTrack

PortfolioTrack is a deployable personal portfolio tracker built with Next.js, Neon Postgres, Drizzle ORM, and Yahoo Finance market data. It tracks manual stock and DR transactions across multiple portfolios, calculates fee-aware positions and P&L, caches market prices in Postgres, and shows dashboard, transactions, and per-asset detail views.

For deeper repository context aimed at AI coding agents, read [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md).
For quality gates, dependency policy, and migration safety, read [docs/QUALITY_AND_OPERATIONS.md](docs/QUALITY_AND_OPERATIONS.md).
For the latest layout and visual-design review, read [docs/UX_REVIEW.md](docs/UX_REVIEW.md).

## Current Capabilities

- Manual `BUY` and `SELL` transaction entry with broker selection for Dime or Webull and server-side validation.
- Multiple portfolios in one app, with public portfolio switching and admin-only portfolio management.
- Admin-only Excel transaction workflow: download the app template, export the ledger, preview imports, create missing instruments when requested, skip duplicates, and commit valid rows atomically.
- Fee-aware average cost, total cost basis, realized P&L, unrealized P&L, and total fees.
- Dashboard with portfolio summary cards, price coverage, top holdings, full holdings table, portfolio value chart, absolute-return summary, and full-portfolio time-weighted S&P 500 benchmark comparison.
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
- Node test runner for pure TypeScript tests and Playwright for browser smoke coverage

## Getting Started

Install dependencies:

```powershell
pnpm install
```

If Playwright browsers are not already installed on the machine, install Chromium for browser smoke tests:

```powershell
pnpm exec playwright install chromium
```

Create `.env.local` or set shell variables with:

```powershell
$env:LOCAL_DATABASE_URL="postgresql://postgres:<your-postgres-password>@localhost:5432/portfoliotrack"
$env:AUTH_SECRET="<long-random-secret>"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD_HASH="<scrypt-hash>"
```

Local development prefers `LOCAL_DATABASE_URL`, then falls back to `DATABASE_URL`, then to `postgresql://postgres@localhost:5432/portfoliotrack` when `NODE_ENV` is not `production`. Production prefers `DATABASE_URL`, with `LOCAL_DATABASE_URL` only as a fallback. Keep `DATABASE_URL` for the hosted Neon database.

Make sure the machine-level PostgreSQL service used by pgAdmin is running:

```powershell
Get-Service postgresql-x64-17
```

Generate an admin password hash:

```powershell
pnpm run auth:hash -- "your-admin-password"
```

When pasting the generated hash into `.env` files, escape each `$` as `\$` so Next.js does not treat hash segments as environment variable references.

Push the database schema to the configured local or hosted Postgres database:

```powershell
pnpm run db:migrate:local
```

Optionally seed sample data:

```powershell
pnpm run db:seed
```

Start the development server:

```powershell
pnpm run dev
```

Open `http://localhost:3000`.

Public visitors can view the app read-only and switch between portfolios. Sign in at `/login` to unlock portfolio management, transaction editing, Excel import/export, instrument search, and market-data refresh.

## Scripts

- `pnpm run dev` starts the development server.
- `pnpm run test` runs the Node test suite through `tsx`.
- `pnpm run test:e2e` runs the Playwright Chromium smoke suite. It starts the Next dev server on `127.0.0.1:3001` unless `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_PORT` is set.
- `pnpm run test:e2e:headed` runs the same Playwright smoke suite with a visible browser.
- `pnpm run typecheck` runs `tsc --noEmit --pretty false`.
- `pnpm run verify` runs format check, lint, typecheck, unit tests, and production build in sequence.
- `pnpm run verify:full` runs format check, lint, typecheck, unit tests, Playwright smoke tests, and production build in sequence.
- `pnpm run build` builds the production app and runs type/lint checks through Next.
- `pnpm run start` serves the production build.
- `pnpm run lint` runs ESLint.
- `pnpm run format:check` checks Prettier formatting without writing files and is part of the normal verification gate.
- `pnpm run config:check` verifies local admin env and reports the local database fallback.
- `pnpm run config:check:prod` verifies production deployment env before migration or deploy handoff.
- `pnpm run db:local:up` reminds you to use the machine-level PostgreSQL service on `localhost:5432`.
- `pnpm run db:local:down` reminds you to stop the machine-level PostgreSQL service from Windows Services if needed.
- `pnpm run db:generate` generates SQL migrations from the Drizzle schema.
- `pnpm run db:check` checks Drizzle migration consistency.
- `pnpm run db:migrate` is a compatibility alias for the explicit local migration command.
- `pnpm run db:migrate:local` is the explicit local schema-push alias.
- `pnpm run db:migrate:prod` checks required production env and applies committed migrations with `drizzle-kit migrate`.
- `pnpm run db:seed` inserts demo portfolios, instruments, transactions, prices, FX snapshots, DR metadata, and settings for local testing.
- `pnpm run auth:hash` prints a scrypt password hash for `ADMIN_PASSWORD_HASH`.

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
- `tests/` contains pure Node tests under `tests/*.test.ts` and browser smoke tests under `tests/e2e/*.spec.ts`.
- `playwright.config.ts` defines the Chromium smoke-test project and local dev-server orchestration.
- `drizzle/` contains SQL migrations and Drizzle metadata snapshots.
- `docs/` contains design, plan, and AI-facing project context documents.
- `docs/DEPLOYMENT.md` documents the Vercel + Neon deployment workflow.

## Deployment

The production database lives in Neon Postgres. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full free-tier Vercel + Neon setup.

The database schema is declared in `src/lib/db/schema.ts`, with SQL migrations in `drizzle/`. Use `pnpm run db:generate` after schema changes, review the generated SQL, optionally run `pnpm run db:check`, use `pnpm run db:migrate:local` for local schema pushes, and use `pnpm run db:migrate:prod` for production migration handoff.

Market refresh runs are tracked in `market_refresh_runs`. Vercel Cron calls slot-specific routes in `Asia/Bangkok`: `/api/cron/market-data/1800`, `/1900`, `/2000`, `/2030` for US market open, `/2100`, `/2200`, `/2300`, `/0000`, and `/0300` for US market close. Each route requires `Authorization: Bearer $CRON_SECRET`, starts every portfolio through the guarded `daily-auto` path, and records one run per Bangkok day per portfolio per slot. Admin manual refresh remains available from the app and bypasses the scheduled slot limit. Manual and cron refreshes return quickly, then a protected worker processes market data in batches and updates run progress so older portfolios do not hold a browser request open until Vercel times out. Vercel Hobby cron timing is hourly best-effort, so these slots are target windows rather than exact minute guarantees.

## Notes For Future Work

- The unit test suite covers transaction selection, transaction Excel import/export parsing, position math, benchmark/performance comparison, DR metadata, market-data staleness, config validation, structured logging, validation, and timeout utility. Run `pnpm run test` before changing those flows.
- The Playwright smoke suite covers the dashboard, transactions route, instrument-to-asset drilldown, and login route. Run `pnpm run test:e2e` after changing shell navigation, route rendering, transaction table links, login visibility, app loading states, or anything likely to compile cleanly but fail in the browser.
- Use `pnpm run verify` for normal code verification and `pnpm run verify:full` before larger releases, route changes, deploy handoff, or broad vibe-code passes.
- GitHub Actions runs `pnpm run verify` on `main` and pull requests, with a separate Playwright smoke job for pull requests. Dependabot opens conservative weekly dependency PRs while major upgrades remain manual.
- Excel transaction import is template-only for now: unknown instruments can be created with `Instrument Action = CREATE`, duplicate rows are skipped, broker defaults to Dime when omitted, and valid rows are inserted as one batch.
- Transactions are scoped by selected portfolio; instruments and market price caches are shared across portfolios.
- Local seed data includes a Thai/DR demo, a US stock demo with THB reporting through USDTHB snapshots, and a closed-trades demo so new tickets can be tested without hand-building data first.
- Market data comes from Yahoo Finance and can fail or return missing/currency-mismatched data. UI code should preserve clear missing-data states. Refresh UI should read `market_refresh_runs` status through `/api/market-data/refresh/status` instead of assuming the original POST completed all Yahoo and cache work.
- Dashboard performance separates money-result metrics from strategy-return metrics: absolute return uses total P&L divided by positive net invested capital, while the benchmark chart can switch between cash-flow-adjusted TWR and an absolute-return view indexed from `100`.
- SPY benchmark comparison is native-currency price-return based and compared by percentage; it is not total-return, FX-converted, or money-weighted. IRR/MWR needs an explicit cash-flow ledger before it can be trustworthy.
- Dashboard and transactions render from cached local data first. Scheduled market-data refreshes are guarded and best-effort so pages keep opening quickly when Yahoo is slow.
- The main app surface is English-first in `EN` mode. Thai remains only in the explicit `TH` shell labels and should be added back to pages through a deliberate bilingual copy layer if needed.
- Theme and language preferences are stored in browser `localStorage`, not the database.
- The development server may print a Windows SWC DLL warning while still compiling and building successfully.
- The latest UX polish pass removed page-level hero blocks and repetitive explanatory copy, tightened operational headers, prioritized task surfaces, improved dark-mode separation, added icon-backed shell navigation, and made the main routes English-first in `EN` mode.
