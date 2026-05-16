# Portfolio Track

A small local-first portfolio tracker for personal use. It tracks stock and DR transactions, includes fees in cost basis, shows current holdings, and compares portfolio performance with the S&P 500.

## Features

- Manual `BUY` and `SELL` transaction entry
- Fee-aware average cost and realized P/L tracking
- Holdings, transaction history, dashboard, and asset detail pages
- Yahoo Finance market data refresh with local SQLite caching
- Portfolio performance chart and S&P 500 comparison
- Local SQLite database stored under `data/`

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Drizzle ORM
- SQLite via `better-sqlite3`
- Recharts
- Yahoo Finance data via `yahoo-finance2`

## Getting Started

Install dependencies:

```powershell
npm install
```

Run database migration:

```powershell
npm run db:migrate
```

Optional seed data:

```powershell
npm run db:seed
```

Start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` starts the development server.
- `npm run build` builds the production app.
- `npm run start` serves the production build.
- `npm run lint` runs ESLint.
- `npm run db:migrate` creates or updates the local SQLite schema.
- `npm run db:seed` inserts sample transactions.

## Local Data

Runtime data lives in `data/portfolio.sqlite` and is intentionally ignored by git. The repo keeps `data/.gitkeep` so the folder exists after checkout, but each machine has its own private database.
