# AI Context For PortfolioTrack

This document is for AI coding agents or future maintainers who need to understand the current repository quickly before making changes.

## High-Level Summary

PortfolioTrack is a deployable personal portfolio tracker. Public visitors can read and switch portfolios, while an admin session unlocks portfolio management, transaction editing, Excel import/export, instrument search, and market-data refresh. Users manually enter or template-import stock and DR transactions, the server calculates positions from the selected portfolio ledger, and the app enriches holdings with cached Yahoo Finance market data.

The app is intentionally simple:

- Single admin login through environment variables and a signed HttpOnly cookie.
- Public read-only dashboard, transactions, and asset detail pages.
- Multiple portfolios in one app; instruments and market data are shared, while transactions are portfolio-scoped.
- Template-only Excel transaction import/export for the app ledger, with explicit instrument creation support for missing symbols.
- No broker-specific statement parser, cash balance ledger, tax reporting, or multi-user account database.
- Postgres stores portfolio and cached market data; local development uses a normal Postgres connection, while hosted deployments use Neon Postgres.

## Current Product Surface

Routes:

- `/` dashboard: `src/app/page.tsx`, reads `getDashboardSnapshot({ portfolioId })` and renders summary, absolute-return metrics, charts, leading holdings, the full holdings table, and summary cards.
- `/holdings`: `src/app/holdings/page.tsx`, redirects to `/`.
- `/transactions`: `src/app/transactions/page.tsx`, shows ledger data to everyone and admin-only form/actions/Excel tools.
- `/assets/[symbol]`: `src/app/assets/[symbol]/page.tsx`, reads `getAssetDetail(symbol, { portfolioId })`.
- `/portfolios`: `src/app/portfolios/page.tsx`, admin-only portfolio management.
- `/login`: `src/app/login/page.tsx`, signs in the single admin account.

API routes:

- `GET|POST|PUT|DELETE /api/portfolios`: public list plus admin-only create/update/delete.
- `POST /api/portfolio-selection`: public selected-portfolio cookie update.
- `GET /api/transactions`: public read for transactions and selectable instruments.
- `POST|PUT|DELETE /api/transactions`: admin-only transaction changes.
- `GET /api/transactions/export?template=true`: public Excel template download.
- `GET /api/transactions/export`: admin-only Excel ledger export.
- `POST /api/transactions/import`: admin-only Excel import preview or commit.
- `POST /api/instruments`: admin-only instrument creation.
- `GET /api/instruments/search`: admin-only Yahoo instrument search.
- `POST /api/market-data/refresh`: admin-only explicit market-data refresh starter for form/manual requests. It returns quickly with a run id and schedules protected batch work.
- `GET /api/market-data/refresh/status?runId=...`: admin-only refresh run status for UI polling.
- `POST /api/market-data/refresh/work`: protected refresh worker route authorized with `CRON_SECRET` in production.
- `GET /api/cron/market-data/[slot]`: Vercel Cron-only slot starter, authorized with `CRON_SECRET`, scheduled by `vercel.json` through the evening plus US market open and close in `Asia/Bangkok`, and started for every portfolio.
- `POST /api/auth/login` and `POST /api/auth/logout`: admin session lifecycle.

## Source Tree

Important directories:

- `src/app/`: Next.js App Router pages, root layout, global CSS, and API routes.
- `src/components/`: UI components used by pages. Chart components are client components because Recharts runs in the browser.
- `src/server/`: Server-only query/application services. These modules should stay server-only and import from `src/lib/db/runtime`.
- `src/lib/auth/`: Admin password verification and signed session helpers.
- `src/lib/db/`: local/Neon Postgres Drizzle setup, schema, seed script, and precision helpers.
- `src/lib/market/`: Market provider abstraction, Yahoo Finance implementation, and cache refresh orchestration.
- `src/lib/observability/`: server-side structured logging helpers for high-risk runtime paths.
- `src/lib/portfolio/`: Selected-portfolio cookie helpers plus portfolio math for positions and timeline comparison.
- `src/lib/transactions/`: Transaction UI/search helpers and Excel workbook parsing/generation.
- `src/lib/ui/`: Browser local UI preferences and shell translation helpers.
- `src/lib/validation/`: Zod schemas for incoming payloads.
- `drizzle/`: Postgres SQL baseline.
- `docs/DEPLOYMENT.md`: Vercel + Neon deployment workflow.

## Database

Schema source:

- `src/lib/db/schema.ts`

Runtime database:

- Local Postgres through `LOCAL_DATABASE_URL` in development, with Neon Postgres through `DATABASE_URL` for hosted deployments. Runtime code prefers `DATABASE_URL` in production and `LOCAL_DATABASE_URL` in development. Local development uses the machine-level PostgreSQL service that pgAdmin connects to on `localhost:5432`.

Database connection:

- `src/lib/db/client.ts` creates a node-postgres pool for local database URLs and a Neon serverless pool for hosted Neon URLs.
- `src/lib/db/runtime.ts` exposes a lazy global process-level database handle for server runtime reuse.

Tables:

- `instruments`: symbols, names, market/type/currency, provider symbol, active flag, and nullable DR metadata.
- `portfolios`: named portfolios with one default row.
- `transactions`: portfolio-scoped manual ledger rows with a `broker` value (`DIME` or `WEBULL`), ordered by `tradeDate`, `createdAt`, then `id`.
- `priceSnapshots`: latest quote per instrument, unique by `instrumentId`.
- `historicalPrices`: daily close history, unique by `(instrumentId, priceDate)`.
- `intradayPrices`: intraday close data, unique by `(instrumentId, interval, observedAt)`.
- `marketRefreshRuns`: daily/manual market refresh run tracking with selected portfolio, Bangkok refresh date, status, attempt counts, progress counts, current symbol, worker heartbeat, result counts, and error text.
- `appSettings`: small key/value settings such as benchmark symbol and market refresh interval.

Schema deployment:

```powershell
pnpm run db:migrate:local
```

This runs `drizzle-kit push` against `LOCAL_DATABASE_URL` when set, then `DATABASE_URL`, with a machine-level local Postgres fallback in development. For production handoff, run `pnpm run db:generate`, review the generated SQL in `drizzle/`, then use `pnpm run db:migrate:prod` with `DATABASE_URL` set. The baseline SQL is `drizzle/0000_initial_postgres.sql`; `drizzle/0001_multi_portfolios.sql` adds portfolio support and migrates existing transactions into `Main Portfolio`; `drizzle/0002_transaction_broker.sql` adds the broker field; `drizzle/0003_market_refresh_runs.sql` adds refresh run tracking; `drizzle/0004_market_refresh_progress.sql` adds worker progress fields for async refresh batches.

Seed:

```powershell
pnpm run db:seed
```

The seed includes benchmark/settings data, local demo portfolios, mock transactions, cached prices, USDTHB snapshots, and DR metadata for `AAPL80`. It is intended to make new tickets easy to test locally without manually creating transactions or market data first.

Local seed portfolio coverage:

- `Main Portfolio`: Thai/DR-style holdings, including ASTS03 and cached prices.
- `US Stocks Demo`: US listed holdings valued back into the THB base currency through USDTHB snapshots.
- `Closed Trades Demo`: realized-P&L and closed-position behavior.

## Auth And Permissions

Admin configuration comes from environment variables:

- `AUTH_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`

Generate the password hash with:

```powershell
pnpm run auth:hash -- "your-admin-password"
```

Public users can read current app pages and switch portfolios. Admin-only controls include portfolio create/update/delete, transaction create/update/delete, Excel ledger export/import, add/search instrument, and market-data refresh. Protected API writes and protected exports return `401` when the admin session cookie is missing or invalid.

## Server Modules

- `src/server/portfolios.ts`: validates, lists, creates, updates, defaults, and deletes portfolios.
- `src/server/dashboard.ts`: `getDashboardSnapshot({ portfolioId | portfolioIds, ensureFresh })`; app pages pass `false` so navigation renders cached data without waiting on market refresh.
- `src/server/holdings.ts`: builds selected-portfolio open/closed position snapshots and currency breakdowns.
- `src/server/transactions.ts`: validates transaction input, enforces selected-portfolio sell quantity, maps service errors, and provides the consolidated transactions workspace loader.
- `src/server/market-refresh.ts`: starts admin manual refreshes and guarded daily cron refreshes, records progress/outcomes, and processes batch runs.
- `src/server/market-refresh-batches.ts`: schedules and authorizes the protected refresh worker route.
- `src/server/transaction-import-export.ts`: builds selected-portfolio Excel exports and evaluates/imports template workbooks against existing or explicitly created instruments, duplicate keys, validation, and position constraints.
- `src/server/assets.ts`: `getAssetDetail(symbol, { portfolioId, allowMarketRefresh })`; public pages render cached data only.

## Transaction Excel Import/Export

- Workbook support is server-side through `exceljs`; keep API routes using `runtime = "nodejs"`.
- The supported import format is the app template sheet named `Transactions`; broker statement formats are intentionally out of scope.
- Template columns include instrument action, instrument identity, trade date, side, optional broker, quantity, price, fee, and notes. Missing broker values default to Dime.
- Instrument matching tries instrument id, provider symbol, then app symbol.
- Set `Instrument Action` to `CREATE` to add a missing instrument from symbol/provider symbol during import; blank or `MATCH` only uses existing instruments.
- Preview returns row-level `ready`, `skipped_duplicate`, or `error` statuses.
- Commit re-parses and re-validates the uploaded workbook, rejects files with errors, and inserts ready rows atomically.
- Missing instruments are row errors unless the row explicitly requests `Instrument Action = CREATE`.
- Imports and exports use the selected portfolio. The Excel template does not include a portfolio column.

## Market Data

Provider abstraction:

- `src/lib/market/types.ts`
- `src/lib/market/provider.ts`
- `src/lib/market/yahoo-provider.ts`

Refresh behavior:

- Finds instruments with transaction history in the selected portfolio plus the benchmark instrument.
- Fetches latest quotes, daily history, and intraday bars.
- Writes only valid same-currency data to Postgres.
- Records missing/mismatched provider data as structured issues.
- Deduplicates overlapping in-flight refreshes.
- Dashboard and transactions render cached data first and do not call the provider during route render.

Performance behavior:

- `src/lib/portfolio/timeline.ts` replays all non-future transactions in the selected portfolio, including closed positions, for the benchmark chart.
- The benchmark chart is cash-flow-adjusted TWR-style performance indexed from `100`; gap is portfolio TWR minus benchmark price return, and drawdown is from each series high watermark.
- `src/server/dashboard.ts` also returns an absolute performance summary: total P&L, net invested, and absolute return when net invested is positive. IRR/MWR is intentionally deferred until the app has explicit deposit, withdrawal, dividend, tax, and FX cash-flow records.
- `GET /api/cron/market-data/[slot]` starts `daily-auto` refreshes from Vercel Cron at 18:00, 19:00, 20:00, 20:30, 21:00, 22:00, 23:00, 00:00, and 03:00 Thailand time.
- Slot cron refresh is guarded by `market_refresh_runs`: one running/success run per Bangkok date/slot key per portfolio, with at most two attempts after failed or stale-running jobs.
- Vercel Hobby cron timing is hourly best-effort, so these slot labels are target windows and not exact minute guarantees.
- Admin manual refresh uses the existing button/form path, bypasses the scheduled slot limit, records a `manual` run, schedules the protected worker, and preserves the dashboard banner/status flow without holding the original request open.

## UI Shell, Theme, And Language

- `src/app/layout.tsx` wraps the app in `UiPreferencesProvider` and passes admin session plus selected-portfolio state to `AppShell`.
- `src/components/app-shell.tsx` contains sidebar navigation, brand lockup, portfolio selector, language/theme buttons, and admin login/logout controls.
- `src/components/portfolio-switcher.tsx` updates `portfoliotrack.portfolioId`; invalid or deleted selected portfolios fall back to the default portfolio.
- Theme/language preferences live in browser `localStorage`, not the database.
- The main app surface is English-first in `EN` mode. Thai remains only in explicit `TH` shell labels unless a deliberate bilingual copy layer is added later.

## Commands

```powershell
pnpm run dev
pnpm run test
pnpm run typecheck
pnpm run verify
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run db:migrate
pnpm run db:migrate:local
pnpm run db:migrate:prod
pnpm run config:check
pnpm run config:check:prod
pnpm run db:seed
pnpm run auth:hash
```

Notes:

- `pnpm run build` also performs Next.js type/lint checks.
- `pnpm run verify` runs lint, typecheck, unit tests, and production build.
- GitHub Actions runs `pnpm run verify` on `main` and pull requests. Pull requests also run Playwright smoke tests.
- Dependabot opens conservative weekly package-manager PRs. Major framework/library upgrades remain manual review work, not automatic PR churn.
- `pnpm run test` uses Node's built-in test runner with `tsx`.
- Add or update tests only when they materially improve confidence for the current change.
- The development server may print a Windows SWC DLL warning and still work.

## Guardrails For AI Agents

- Read `AGENTS.md` before making changes.
- This checkout expects an automatic git commit after each verified coherent work set unless the user explicitly says not to commit or the next action is risky/destructive.
- Commit only files changed for the current task and never include unrelated dirty or untracked files.
- Add focused tests when they materially improve confidence in the current change; avoid broad test churn.
- Prefer small, targeted edits that fit the existing App Router, server module, and Drizzle patterns.
- Do not silently reset or overwrite existing uncommitted changes.
- If changing schema, update `src/lib/db/schema.ts`, `drizzle/*.sql`, and `src/lib/db/seed.ts` when needed.
- If changing portfolio math, verify transaction ordering and sell validation.
- If changing performance math, keep absolute return and TWR separate; do not treat SPY comparison as FX-converted or money-weighted.
- If changing auth or public/admin behavior, verify both logged-out read-only and logged-in admin flows.
- If changing market data, preserve currency checks and missing-data states.
- If changing page performance, keep dashboard/transactions cached-first; provider refresh should stay outside route render.
- For unexpected server/runtime failures, prefer `logServerError` from `src/lib/observability/server-log.ts` with an event name plus portfolio/run/request context instead of raw `console.error`.
