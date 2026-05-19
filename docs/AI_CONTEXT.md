# AI Context For PortfolioTrack

This document is for AI coding agents or future maintainers who need to understand the current repository quickly before making changes.

## High-Level Summary

PortfolioTrack is a deployable personal portfolio tracker. Public visitors can read and switch portfolios, while an admin session unlocks portfolio management, transaction editing, Excel import/export, instrument search, and market-data refresh. Users manually enter or template-import stock and DR transactions, the server calculates positions from the selected portfolio ledger, and the app enriches holdings with cached Yahoo Finance market data.

The app is intentionally simple:

- Single admin login through environment variables and a signed HttpOnly cookie.
- Public read-only dashboard, holdings, transactions, and asset detail pages.
- Multiple portfolios in one app; instruments and market data are shared, while transactions are portfolio-scoped.
- Template-only Excel transaction import/export for the app ledger.
- No broker-specific statement parser, cash balance ledger, tax reporting, or multi-user account database.
- Neon Postgres stores portfolio and cached market data.

## Current Product Surface

Routes:

- `/` dashboard: `src/app/page.tsx`, reads `getDashboardSnapshot({ portfolioId })`.
- `/holdings`: `src/app/holdings/page.tsx`, renders `SummaryCards` and `HoldingsTable`.
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
- `POST /api/market-data/refresh`: admin-only explicit market-data refresh for form/manual requests.
- `GET /api/cron/market-data`: Vercel Cron-only daily refresh, authorized with `CRON_SECRET`, scheduled by `vercel.json` at `0 14 * * *` for 21:00 in `Asia/Bangkok`, and run for every portfolio.
- `POST /api/auth/login` and `POST /api/auth/logout`: admin session lifecycle.

## Source Tree

Important directories:

- `src/app/`: Next.js App Router pages, root layout, global CSS, and API routes.
- `src/components/`: UI components used by pages. Chart components are client components because Recharts runs in the browser.
- `src/server/`: Server-only query/application services. These modules should stay server-only and import from `src/lib/db/runtime`.
- `src/lib/auth/`: Admin password verification and signed session helpers.
- `src/lib/db/`: Neon/Drizzle setup, schema, seed script, and precision helpers.
- `src/lib/market/`: Market provider abstraction, Yahoo Finance implementation, and cache refresh orchestration.
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

- Neon Postgres through `DATABASE_URL`.

Database connection:

- `src/lib/db/client.ts` creates a Neon serverless connection pool with `@neondatabase/serverless`.
- `src/lib/db/runtime.ts` exposes a lazy global process-level database handle for server runtime reuse.

Tables:

- `instruments`: symbols, names, market/type/currency, provider symbol, active flag, and nullable DR metadata.
- `portfolios`: named portfolios with one default row.
- `transactions`: portfolio-scoped manual ledger rows with a `broker` value (`DIME` or `WEBULL`), ordered by `tradeDate`, `createdAt`, then `id`.
- `priceSnapshots`: latest quote per instrument, unique by `instrumentId`.
- `historicalPrices`: daily close history, unique by `(instrumentId, priceDate)`.
- `intradayPrices`: intraday close data, unique by `(instrumentId, interval, observedAt)`.
- `marketRefreshRuns`: daily/manual market refresh run tracking with selected portfolio, Bangkok refresh date, status, attempt counts, result counts, and error text.
- `appSettings`: small key/value settings such as benchmark symbol and market refresh interval.

Schema deployment:

```powershell
npm run db:migrate
```

This runs `drizzle-kit push` against `DATABASE_URL`. The baseline SQL is `drizzle/0000_initial_postgres.sql`; `drizzle/0001_multi_portfolios.sql` adds portfolio support and migrates existing transactions into `Main Portfolio`; `drizzle/0002_market_refresh_runs.sql` adds refresh run tracking for guarded background market updates.

Seed:

```powershell
npm run db:seed
```

The seed includes benchmark/settings data and DR metadata for `AAPL80`.

## Auth And Permissions

Admin configuration comes from environment variables:

- `AUTH_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`

Generate the password hash with:

```powershell
npm run auth:hash -- "your-admin-password"
```

Public users can read current app pages and switch portfolios. Admin-only controls include portfolio create/update/delete, transaction create/update/delete, Excel ledger export/import, add/search instrument, and market-data refresh. Protected API writes and protected exports return `401` when the admin session cookie is missing or invalid.

## Server Modules

- `src/server/portfolios.ts`: validates, lists, creates, updates, defaults, and deletes portfolios.
- `src/server/dashboard.ts`: `getDashboardSnapshot({ portfolioId, ensureFresh })`; app pages pass `false` so navigation renders cached data without waiting on market refresh.
- `src/server/holdings.ts`: builds selected-portfolio open/closed position snapshots and currency breakdowns.
- `src/server/transactions.ts`: validates transaction input, enforces selected-portfolio sell quantity, maps service errors, and provides the consolidated transactions workspace loader.
- `src/server/market-refresh.ts`: separates admin manual refresh from guarded daily cron refresh and records refresh run outcomes.
- `src/server/transaction-import-export.ts`: builds selected-portfolio Excel exports and evaluates/imports template workbooks against existing instruments, duplicate keys, validation, and position constraints.
- `src/server/assets.ts`: `getAssetDetail(symbol, { portfolioId, allowMarketRefresh })`; public pages render cached data only.

## Transaction Excel Import/Export

- Workbook support is server-side through `exceljs`; keep API routes using `runtime = "nodejs"`.
- The supported import format is the app template sheet named `Transactions`; broker statement formats are intentionally out of scope.
- Template columns include instrument identity, trade date, side, optional broker, quantity, price, fee, and notes. Missing broker values default to Dime.
- Instrument matching tries instrument id, provider symbol, then app symbol.
- Preview returns row-level `ready`, `skipped_duplicate`, or `error` statuses.
- Commit re-parses and re-validates the uploaded workbook, rejects files with errors, and inserts ready rows atomically.
- Missing instruments are row errors; the import flow does not create instruments automatically.
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
- Dashboard, holdings, and transactions render cached data first and do not call the provider during route render.
- `GET /api/cron/market-data` triggers `daily-auto` refreshes from Vercel Cron at 21:00 Thailand time.
- Daily cron refresh is guarded by `market_refresh_runs`: one success per Bangkok day per portfolio, with at most two attempts after failed or stale-running jobs.
- Admin manual refresh uses the existing button/form path, bypasses the scheduled daily limit, records a `manual` run, and preserves the dashboard banner flow.

## UI Shell, Theme, And Language

- `src/app/layout.tsx` wraps the app in `UiPreferencesProvider` and passes admin session plus selected-portfolio state to `AppShell`.
- `src/components/app-shell.tsx` contains sidebar navigation, brand lockup, portfolio selector, language/theme buttons, and admin login/logout controls.
- `src/components/portfolio-switcher.tsx` updates `portfoliotrack.portfolioId`; invalid or deleted selected portfolios fall back to the default portfolio.
- Theme/language preferences live in browser `localStorage`, not the database.
- The main app surface is English-first in `EN` mode. Thai remains only in explicit `TH` shell labels unless a deliberate bilingual copy layer is added later.

## Commands

```powershell
npm run dev
npm run test
npm run verify
npm run lint
npm run build
npm run db:migrate
npm run db:seed
npm run auth:hash
```

Notes:

- `npm run build` also performs Next.js type/lint checks.
- `npm run test` uses Node's built-in test runner with `tsx`.
- The user has requested that tests not be added or updated unless explicitly asked.
- The development server may print a Windows SWC DLL warning and still work.

## Guardrails For AI Agents

- Read `AGENTS.md` before making changes.
- Do not create commits unless the user explicitly asks.
- Keep related changes bundled as one uncommitted work set by default.
- Do not add or update tests unless explicitly asked.
- Prefer small, targeted edits that fit the existing App Router, server module, and Drizzle patterns.
- Do not silently reset or overwrite existing uncommitted changes.
- If changing schema, update `src/lib/db/schema.ts`, `drizzle/*.sql`, and `src/lib/db/seed.ts` when needed.
- If changing portfolio math, verify transaction ordering and sell validation.
- If changing auth or public/admin behavior, verify both logged-out read-only and logged-in admin flows.
- If changing market data, preserve currency checks and missing-data states.
- If changing page performance, keep dashboard/holdings/transactions cached-first; provider refresh should stay outside route render.
