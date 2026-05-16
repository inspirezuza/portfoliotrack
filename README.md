# PortfolioTrack

PortfolioTrack is a local-first personal portfolio tracker built with Next.js, SQLite, Drizzle ORM, and Yahoo Finance market data. It tracks manual stock and DR transactions, calculates fee-aware positions and P&L, caches market prices locally, and shows dashboard, holdings, transactions, and per-asset detail views.

For deeper repository context aimed at AI coding agents, read [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md).
For the latest layout and visual-design review, read [docs/UX_REVIEW.md](docs/UX_REVIEW.md).

## Current Capabilities

- Manual `BUY` and `SELL` transaction entry with server-side validation.
- Fee-aware average cost, total cost basis, realized P&L, unrealized P&L, and total fees.
- Current holdings table with market value, price freshness, and asset detail links.
- Dashboard with portfolio summary cards, price coverage, top holdings, portfolio chart, and S&P 500 benchmark comparison.
- Per-asset detail route at `/assets/[symbol]` with position metrics, price history, recent transactions, and DR analytics when metadata exists.
- DR equivalent analytics for instruments with DR metadata, including parent-stock implied price, FX rate, parent quote, and premium/discount.
- Yahoo Finance quote and historical-price refresh with local SQLite caching.
- Local UI preferences for `EN / TH` shell language and `light / dark` theme.
- Fullscreen application shell optimized for a dense personal finance workspace.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- SQLite through `better-sqlite3`
- Drizzle ORM
- Recharts
- Yahoo Finance data through `yahoo-finance2`
- Zod for transaction input validation

## Getting Started

Install dependencies:

```powershell
npm install
```

Run database migrations:

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

## Scripts

- `npm run dev` starts the development server.
- `npm run build` builds the production app and runs type/lint checks through Next.
- `npm run start` serves the production build.
- `npm run lint` runs ESLint.
- `npm run db:migrate` applies SQL migrations to the local SQLite database.
- `npm run db:seed` inserts sample instruments, settings, and transactions.

## Project Map

- `src/app/` contains Next.js routes, layouts, pages, and API route handlers.
- `src/components/` contains reusable UI components used by the app pages.
- `src/server/` contains server-only query and application-service functions for dashboard, holdings, transactions, and assets.
- `src/lib/db/` contains SQLite connection setup, Drizzle schema, migration runner, seed script, and number precision helpers.
- `src/lib/market/` contains the market-data provider abstraction and Yahoo Finance implementation.
- `src/lib/portfolio/` contains portfolio position and timeline calculations.
- `src/lib/ui/` contains local shell preference and translation helpers.
- `src/lib/validation/` contains Zod schemas for incoming data.
- `drizzle/` contains SQL migrations and Drizzle metadata snapshots.
- `data/` contains the runtime SQLite database files. Runtime database files are intentionally ignored by git.
- `docs/` contains design, plan, and AI-facing project context documents.

## Local Data

Runtime data lives in `data/portfolio.sqlite`. SQLite WAL sidecar files may appear beside it. These files are local machine state and are not source files.

The database schema is declared in `src/lib/db/schema.ts`, with migrations in `drizzle/`. Use `npm run db:migrate` after schema or migration changes.

## Notes For Future Work

- This repo currently does not have a test suite. Do not add or update tests unless explicitly requested.
- Market data comes from Yahoo Finance and can fail or return missing/currency-mismatched data. UI code should preserve clear missing-data states.
- The main app surface is English-first in `EN` mode. Thai remains only in the explicit `TH` shell labels and should be added back to pages through a deliberate bilingual copy layer if needed.
- Theme and language preferences are stored in browser `localStorage`, not the database.
- The development server may print a Windows SWC DLL warning while still compiling and building successfully.
- The latest UX polish pass removed page-level hero blocks and repetitive explanatory copy, tightened operational headers, prioritized task surfaces, improved dark-mode separation, added icon-backed shell navigation, and made the main routes English-first in `EN` mode.
