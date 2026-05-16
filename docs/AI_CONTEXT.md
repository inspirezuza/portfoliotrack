# AI Context For PortfolioTrack

This document is for AI coding agents or future maintainers who need to understand the current repository quickly before making changes.

## High-Level Summary

PortfolioTrack is a local-first personal portfolio tracker. Users manually enter stock and DR transactions, the server calculates positions from the ledger, and the app enriches holdings with cached Yahoo Finance market data.

The app is intentionally local and simple:

- No user accounts.
- No cloud sync.
- No broker import.
- No cash balance ledger.
- No tax reporting.
- SQLite database lives locally under `data/`.

## Current Product Surface

Routes:

- `/` dashboard
  - Implemented by `src/app/page.tsx`.
  - Reads `getDashboardSnapshot()` from `src/server/dashboard.ts`.
  - Shows portfolio summary, price health, top holdings, portfolio chart, and benchmark chart.
- `/holdings`
  - Implemented by `src/app/holdings/page.tsx`.
  - Reads dashboard/holdings data and renders `SummaryCards` plus `HoldingsTable`.
- `/transactions`
  - Implemented by `src/app/transactions/page.tsx`.
  - Renders `TransactionForm`, compact ledger/instrument metrics, and `TransactionTable`.
- `/assets/[symbol]`
  - Implemented by `src/app/assets/[symbol]/page.tsx`.
  - Reads `getAssetDetail(symbol)` from `src/server/assets.ts`.
  - Shows per-asset position, price history, recent trades, and DR analytics if available.

API routes:

- `POST /api/transactions`
  - Implemented by `src/app/api/transactions/route.ts`.
  - Calls `createTransaction()`.
  - Validates with Zod and prevents selling more than current quantity.
- `GET /api/transactions`
  - Same route file.
  - Returns transactions and selectable instruments.
- `POST /api/market-data/refresh`
  - Implemented by `src/app/api/market-data/refresh/route.ts`.
  - Calls `refreshMarketDataCache()`.
  - Supports form submissions with redirect banners and JSON responses for programmatic calls.

## Source Tree

Important directories:

- `src/app/`
  - Next.js App Router pages, root layout, global CSS, and API routes.
- `src/components/`
  - UI components used by pages.
  - Chart components are client components because Recharts runs in the browser.
- `src/server/`
  - Server-only query/application services.
  - These modules should stay server-only and import from `src/lib/db/runtime`.
- `src/lib/db/`
  - SQLite/Drizzle setup, schema, migrations runner, seed script, and precision helpers.
- `src/lib/market/`
  - Market provider abstraction, Yahoo Finance implementation, and cache refresh orchestration.
- `src/lib/portfolio/`
  - Pure-ish portfolio math for positions and timeline comparison.
- `src/lib/ui/`
  - Browser local UI preferences and shell translation helpers.
- `src/lib/validation/`
  - Zod schemas for incoming transaction payloads.
- `drizzle/`
  - SQL migrations and Drizzle metadata snapshots.
- `data/`
  - Local SQLite runtime files. These are not source-of-truth code.
- `docs/superpowers/`
  - Previous design specs and implementation plans.
- `docs/UX_REVIEW.md`
  - Current browser-reviewed UX/layout findings and recommended polish priorities.

## Database

Schema source:

- `src/lib/db/schema.ts`

Runtime database:

- `data/portfolio.sqlite`
- WAL sidecar files may exist as `data/portfolio.sqlite-wal` and `data/portfolio.sqlite-shm`.

Database connection:

- `src/lib/db/client.ts`
  - Ensures `data/` exists.
  - Creates a `better-sqlite3` connection.
  - Enables WAL mode and foreign keys.
- `src/lib/db/runtime.ts`
  - Holds a global process-level database handle for server runtime reuse.

Tables:

- `instruments`
  - Symbols, display names, market, type, currency, provider symbol, active flag.
  - Nullable DR metadata:
    - `underlyingSymbol`
    - `underlyingDisplayName`
    - `underlyingCurrency`
    - `underlyingProviderSymbol`
    - `drRatio`
    - `fxProviderSymbol`
- `transactions`
  - Manual ledger rows.
  - Deterministic order is `tradeDate`, then `createdAt`, then `id`.
  - `side` is `BUY` or `SELL`.
- `priceSnapshots`
  - Latest quote per instrument.
  - Unique by `instrumentId`.
- `historicalPrices`
  - Daily close history.
  - Unique by `(instrumentId, priceDate)`.
- `appSettings`
  - Small key/value settings.
  - Current defaults in code are benchmark `SPY` and market refresh interval `30` minutes.

Migrations:

- `drizzle/0000_rare_wallop.sql`
- `drizzle/0001_dr_metadata.sql`

Use:

```powershell
npm run db:migrate
```

Seed:

- `src/lib/db/seed.ts`
- Run with `npm run db:seed`.
- Current seed includes DR metadata for `AAPL80` and benchmark setup.

## Portfolio Math

Position logic lives in:

- `src/lib/portfolio/positions.ts`

Key behavior:

- Transactions are sorted chronologically by `tradeDate`, nullable `createdAt`, then `id`.
- BUY adds quantity, gross cost, and fee to cost basis.
- SELL removes average cost basis, subtracts fee from sale proceeds, and realizes P&L.
- Selling more than current quantity throws `InsufficientQuantityError`.
- Numeric normalization helpers live in `src/lib/db/precision.ts`.

Timeline logic lives in:

- `src/lib/portfolio/timeline.ts`

It builds portfolio and benchmark series from transactions, instruments, and historical prices.

## Server Modules

Dashboard:

- `src/server/dashboard.ts`
- Main function: `getDashboardSnapshot()`.
- Calls `ensureFreshMarketDataCache({ includeBenchmark: true })`.
- Combines holdings snapshot, market settings, historical prices, and benchmark timeline.

Holdings:

- `src/server/holdings.ts`
- Builds open/closed position snapshots and currency breakdowns from transactions plus latest price snapshots.

Transactions:

- `src/server/transactions.ts`
- Main functions:
  - `createTransaction(input)`
  - `listTransactions()`
  - `listTransactionInstrumentOptions()`
  - `listSelectableTransactionInstrumentOptions()`
- Server-side transaction validation happens here.
- The API route maps `TransactionServiceError` codes to HTTP status codes.

Assets:

- `src/server/assets.ts`
- Main function: `getAssetDetail(symbol)`.
- Normalizes symbol to uppercase.
- Refreshes stale/missing latest quote.
- Refreshes missing history with a short failure cooldown.
- Calculates per-asset position, price history status, market value, unrealized P&L, recent transaction list, and optional DR analytics.

## Market Data

Provider abstraction:

- `src/lib/market/types.ts`
- `src/lib/market/provider.ts`

Yahoo implementation:

- `src/lib/market/yahoo-provider.ts`

Important functions:

- `getMarketDataProvider()`
- `getMarketSettings()`
- `ensureFreshMarketDataCache()`
- `refreshMarketDataCache()`

Cache refresh behavior:

- Finds instruments with transaction history plus the benchmark instrument.
- Fetches latest quotes and historical bars from the provider.
- Writes valid quotes to `priceSnapshots`.
- Writes valid daily bars to `historicalPrices`.
- Ignores invalid/mismatched currency data and records issues in the refresh result.
- Deduplicates overlapping in-flight refreshes.

Known external dependency:

- Yahoo Finance can return missing data or currency mismatches. UI should keep clear pending/error states instead of assuming data exists.

## UI Shell, Theme, And Language

Root layout:

- `src/app/layout.tsx`
- Wraps the app in `UiPreferencesProvider`.
- Includes a small head script that applies saved theme/language before React hydration and captures preference button clicks early.

Shell:

- `src/components/app-shell.tsx`
- Contains sidebar navigation, brand lockup, language buttons, and theme buttons.

Preferences:

- `src/lib/ui/preferences.tsx`
- Defaults:
  - language: `EN`
  - theme: `light`
- Storage keys:
  - `portfoliotrack.language`
  - `portfoliotrack.theme`
- Applies preferences to:
  - `document.documentElement.dataset.language`
  - `document.documentElement.lang`
  - `document.documentElement.dataset.theme`

Translations:

- `src/lib/ui/translations.ts`
- Currently covers shell copy and nav labels.
- The main app surface is English-first in `EN` mode. Thai remains only in the explicit `TH` shell labels and should be added back to pages through a deliberate bilingual copy layer if needed.

Styling:

- `src/app/globals.css`
- Contains design tokens, light/dark variables, fullscreen shell layout, cards, tables, forms, charts, responsive rules, and preference button styling.
- Active preference button visuals are driven by root attributes such as `html[data-theme="dark"]`, not only React state classes. This avoids wrong active styles before hydration completes.

## Components

Shell:

- `src/components/app-shell.tsx`

Dashboard:

- `src/components/summary-cards.tsx`
- `src/components/portfolio-chart.tsx`
- `src/components/benchmark-chart.tsx`

Holdings:

- `src/components/holdings-table.tsx`

Transactions:

- `src/components/transaction-form.tsx`
- `src/components/transaction-table.tsx`

Asset detail:

- `src/components/asset-header.tsx`
- `src/components/asset-price-chart.tsx`

Formatting:

- `src/lib/format.ts`

## Current UX Conventions

- Default UI is English-first, light mode.
- Shell language can switch between `EN` and `TH`, but page-level copy is not fully translated.
- The app shell is fullscreen and not a centered card layout.
- Tables use horizontal scrolling for wide data.
- Cards are used for repeated panels and metrics, not nested decorative sections.
- Missing data should be explicit and calm, especially for market quotes and DR analytics.
- Dashboard, holdings, transactions, and asset detail use compact task-first page headers instead of page-level hero blocks.
- Page-level copy was converted to English-first, and repetitive explanatory copy was removed so the current `EN` preference no longer shows Thai on the main routes.
- Keep operational pages task-first: holdings should surface the table/current positions quickly, transactions should surface the entry form quickly, and asset detail should surface position performance quickly.

## Validation And Error Handling

Transaction validation:

- Input schema: `src/lib/validation/transaction.ts`
- Service validation and sell-quantity guard: `src/server/transactions.ts`
- API error payload shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": null
  }
}
```

Market refresh:

- Form refresh redirects back to the requested safe local path with query params:
  - `refresh`
  - `eventAt`
  - `quoteCount`
  - `issueCount`
  - `refreshedAt`
  - `message` on error

## Commands

Common commands:

```powershell
npm run dev
npm run lint
npm run build
npm run db:migrate
npm run db:seed
```

Notes:

- `npm run build` also performs Next.js type/lint checks.
- This repo currently has no dedicated test suite.
- The user has requested that tests not be added or updated unless explicitly asked.
- The development server may print a Windows SWC DLL warning and still work.

## Guardrails For AI Agents

- Read `AGENTS.md` before making changes.
- Do not create commits unless the user explicitly asks.
- Keep related changes bundled as one uncommitted work set by default.
- Do not add or update tests unless explicitly asked.
- Prefer small, targeted edits that fit the existing App Router, server module, and Drizzle patterns.
- Do not treat files in `data/` as source code. They are runtime local state.
- Do not silently reset or overwrite existing uncommitted changes.
- If changing schema, update:
  - `src/lib/db/schema.ts`
  - `drizzle/*.sql`
  - `drizzle/meta/*` when using Drizzle snapshots
  - `src/lib/db/seed.ts` if seed data depends on the schema
- If changing portfolio math, verify transaction ordering and sell validation.
- If changing theme/language behavior, verify:
  - click behavior before and after hydration
  - root `html` attributes
  - localStorage persistence
  - reload persistence
- If changing market data, preserve currency checks and missing-data states.

## Recent Important Implementation Details

Preference controls were hardened so users can click language/theme controls even before React hydration finishes:

- `layout.tsx` has a tiny document-level click handler for `[data-preference-kind]` buttons.
- `app-shell.tsx` adds `data-preference-kind` and `data-preference-value` to preference buttons.
- `globals.css` styles active buttons from root attributes, so active visuals match saved preferences immediately after reload.
- `preferences.tsx` still owns React state and context after hydration.

This is intentional. Do not remove the pre-hydration bootstrap unless replacing it with an equally robust approach.
