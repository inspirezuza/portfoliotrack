# AI Context For PortfolioTrack

This document is for AI coding agents or future maintainers who need to understand the current repository quickly before making changes.

## High-Level Summary

PortfolioTrack is a deployable personal portfolio tracker. Public visitors can read the portfolio, while an admin session unlocks transaction editing, instrument search, and market-data refresh. Users manually enter stock and DR transactions, the server calculates positions from the ledger, and the app enriches holdings with cached Yahoo Finance market data.

The app is intentionally simple:

- Single admin login through environment variables and a signed HttpOnly cookie.
- Public read-only dashboard, holdings, transactions, and asset detail pages.
- No broker import, cash balance ledger, tax reporting, or multi-user account database.
- Neon Postgres stores portfolio and cached market data.

## Current Product Surface

Routes:

- `/` dashboard: `src/app/page.tsx`, reads `getDashboardSnapshot()`.
- `/holdings`: `src/app/holdings/page.tsx`, renders `SummaryCards` and `HoldingsTable`.
- `/transactions`: `src/app/transactions/page.tsx`, shows ledger data to everyone and admin-only form/actions.
- `/assets/[symbol]`: `src/app/assets/[symbol]/page.tsx`, reads `getAssetDetail(symbol)`.
- `/login`: `src/app/login/page.tsx`, signs in the single admin account.

API routes:

- `GET /api/transactions`: public read for transactions and selectable instruments.
- `POST|PUT|DELETE /api/transactions`: admin-only transaction changes.
- `POST /api/instruments`: admin-only instrument creation.
- `GET /api/instruments/search`: admin-only Yahoo instrument search.
- `POST /api/market-data/refresh`: admin-only explicit market-data refresh.
- `POST /api/auth/login` and `POST /api/auth/logout`: admin session lifecycle.

## Source Tree

Important directories:

- `src/app/`: Next.js App Router pages, root layout, global CSS, and API routes.
- `src/components/`: UI components used by pages. Chart components are client components because Recharts runs in the browser.
- `src/server/`: Server-only query/application services. These modules should stay server-only and import from `src/lib/db/runtime`.
- `src/lib/auth/`: Admin password verification and signed session helpers.
- `src/lib/db/`: Neon/Drizzle setup, schema, seed script, and precision helpers.
- `src/lib/market/`: Market provider abstraction, Yahoo Finance implementation, and cache refresh orchestration.
- `src/lib/portfolio/`: Portfolio math for positions and timeline comparison.
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
- `transactions`: manual ledger rows ordered by `tradeDate`, `createdAt`, then `id`.
- `priceSnapshots`: latest quote per instrument, unique by `instrumentId`.
- `historicalPrices`: daily close history, unique by `(instrumentId, priceDate)`.
- `intradayPrices`: intraday close data, unique by `(instrumentId, interval, observedAt)`.
- `appSettings`: small key/value settings such as benchmark symbol and market refresh interval.

Schema deployment:

```powershell
npm run db:migrate
```

This runs `drizzle-kit push` against `DATABASE_URL`. The baseline SQL is `drizzle/0000_initial_postgres.sql`.

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

Public users can read current app pages. Admin-only controls include transaction create/update/delete, add/search instrument, and market-data refresh. Protected API writes return `401` when the admin session cookie is missing or invalid.

## Server Modules

- `src/server/dashboard.ts`: `getDashboardSnapshot({ ensureFresh })`; public pages pass `false`, admin pages pass `true`.
- `src/server/holdings.ts`: builds open/closed position snapshots and currency breakdowns.
- `src/server/transactions.ts`: validates transaction input, enforces sell quantity, and maps service errors.
- `src/server/assets.ts`: `getAssetDetail(symbol, { allowMarketRefresh })`; public pages render cached data only.

## Market Data

Provider abstraction:

- `src/lib/market/types.ts`
- `src/lib/market/provider.ts`
- `src/lib/market/yahoo-provider.ts`

Refresh behavior:

- Finds instruments with transaction history plus the benchmark instrument.
- Fetches latest quotes, daily history, and intraday bars.
- Writes only valid same-currency data to Postgres.
- Records missing/mismatched provider data as structured issues.
- Deduplicates overlapping in-flight refreshes.
- Public pages render cached data only; admin page-triggered refresh is best-effort and timeout-bound.

## UI Shell, Theme, And Language

- `src/app/layout.tsx` wraps the app in `UiPreferencesProvider` and passes admin session state to `AppShell`.
- `src/components/app-shell.tsx` contains sidebar navigation, brand lockup, language/theme buttons, and admin login/logout controls.
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
