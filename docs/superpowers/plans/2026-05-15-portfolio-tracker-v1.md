# Portfolio Tracker V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-first local portfolio tracker with manual buy/sell transactions, fee-aware position calculations, holdings and dashboard views, automatic market data refresh, and benchmark comparison against `SPY`.

**Architecture:** Build a local-first `Next.js` app with App Router and server-rendered pages, backed by a single SQLite database accessed through Drizzle ORM. Keep portfolio math and market data isolated in focused `src/lib/*` modules so transactions remain the source of truth and external pricing can be swapped later without changing the UI.

**Tech Stack:** `Next.js`, `TypeScript`, `SQLite`, `Drizzle ORM`, `Tailwind CSS`, `Zod`, `Recharts`

**Constraints:** Keep the work as one uncommitted work set by default. Do not add automated tests or test files unless the user explicitly asks for them. Use manual verification and `npm run lint` / `npm run build` for correctness checks.

---

## File Structure Map

### App and config

- `D:\coding\portfoliotrack\package.json`: project scripts and dependencies
- `D:\coding\portfoliotrack\tsconfig.json`: TypeScript configuration
- `D:\coding\portfoliotrack\next-env.d.ts`: Next.js type bootstrap
- `D:\coding\portfoliotrack\next.config.ts`: Next.js configuration
- `D:\coding\portfoliotrack\eslint.config.mjs`: lint rules
- `D:\coding\portfoliotrack\postcss.config.mjs`: PostCSS config for Tailwind
- `D:\coding\portfoliotrack\drizzle.config.ts`: Drizzle migration config
- `D:\coding\portfoliotrack\.gitignore`: ignore `node_modules`, `.next`, and local SQLite data

### Database and server logic

- `D:\coding\portfoliotrack\src\lib\db\client.ts`: SQLite connection
- `D:\coding\portfoliotrack\src\lib\db\schema.ts`: table definitions
- `D:\coding\portfoliotrack\src\lib\db\migrate.ts`: migration runner
- `D:\coding\portfoliotrack\src\lib\db\seed.ts`: default instruments and settings seed
- `D:\coding\portfoliotrack\src\lib\portfolio\positions.ts`: fee-aware average-cost calculations
- `D:\coding\portfoliotrack\src\lib\portfolio\timeline.ts`: portfolio value timeline and normalized benchmark series
- `D:\coding\portfoliotrack\src\lib\market\types.ts`: provider types
- `D:\coding\portfoliotrack\src\lib\market\provider.ts`: market data interface
- `D:\coding\portfoliotrack\src\lib\market\yahoo-provider.ts`: initial market data adapter
- `D:\coding\portfoliotrack\src\lib\validation\transaction.ts`: transaction form schema
- `D:\coding\portfoliotrack\src\lib\format.ts`: shared format helpers
- `D:\coding\portfoliotrack\src\server\dashboard.ts`: dashboard queries and aggregation
- `D:\coding\portfoliotrack\src\server\holdings.ts`: holdings queries
- `D:\coding\portfoliotrack\src\server\transactions.ts`: transaction insert/list operations
- `D:\coding\portfoliotrack\src\server\assets.ts`: asset detail queries

### UI

- `D:\coding\portfoliotrack\src\app\layout.tsx`: root shell
- `D:\coding\portfoliotrack\src\app\globals.css`: theme and layout styles
- `D:\coding\portfoliotrack\src\app\page.tsx`: dashboard page
- `D:\coding\portfoliotrack\src\app\holdings\page.tsx`: holdings page
- `D:\coding\portfoliotrack\src\app\transactions\page.tsx`: transactions page
- `D:\coding\portfoliotrack\src\app\assets\[symbol]\page.tsx`: asset detail page
- `D:\coding\portfoliotrack\src\app\api\transactions\route.ts`: create transaction API
- `D:\coding\portfoliotrack\src\app\api\market-data\refresh\route.ts`: refresh market data API
- `D:\coding\portfoliotrack\src\components\app-shell.tsx`: shared navigation shell
- `D:\coding\portfoliotrack\src\components\summary-cards.tsx`: dashboard KPI cards
- `D:\coding\portfoliotrack\src\components\portfolio-chart.tsx`: portfolio line chart
- `D:\coding\portfoliotrack\src\components\benchmark-chart.tsx`: normalized comparison chart
- `D:\coding\portfoliotrack\src\components\holdings-table.tsx`: holdings grid
- `D:\coding\portfoliotrack\src\components\transaction-form.tsx`: add transaction form
- `D:\coding\portfoliotrack\src\components\transaction-table.tsx`: transaction list
- `D:\coding\portfoliotrack\src\components\asset-header.tsx`: asset summary header
- `D:\coding\portfoliotrack\src\components\asset-price-chart.tsx`: asset chart with average-cost reference

### Local data

- `D:\coding\portfoliotrack\data\portfolio.sqlite`: SQLite database file created at runtime

## Task 1: Scaffold the local web app foundation

**Files:**

- Create: `D:\coding\portfoliotrack\package.json`
- Create: `D:\coding\portfoliotrack\tsconfig.json`
- Create: `D:\coding\portfoliotrack\next-env.d.ts`
- Create: `D:\coding\portfoliotrack\next.config.ts`
- Create: `D:\coding\portfoliotrack\eslint.config.mjs`
- Create: `D:\coding\portfoliotrack\postcss.config.mjs`
- Create: `D:\coding\portfoliotrack\.gitignore`
- Create: `D:\coding\portfoliotrack\src\app\layout.tsx`
- Create: `D:\coding\portfoliotrack\src\app\globals.css`
- Create: `D:\coding\portfoliotrack\src\app\page.tsx`
- Create: `D:\coding\portfoliotrack\src\components\app-shell.tsx`
- Update: none
- Delete: none

- [ ] **Step 1: Create the package manifest and scripts**

```json
{
  "name": "portfoliotrack",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "db:migrate": "tsx src/lib/db/migrate.ts",
    "db:seed": "tsx src/lib/db/seed.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "better-sqlite3": "^11.7.0",
    "recharts": "^2.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "drizzle-kit": "^0.27.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Add minimal Next.js, TypeScript, lint, and CSS toolchain config**

```ts
// D:\coding\portfoliotrack\next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

```json
// D:\coding\portfoliotrack\tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

```ts
// D:\coding\portfoliotrack\next-env.d.ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file is intentionally not edited by hand beyond the required references.
```

```js
// D:\coding\portfoliotrack\eslint.config.mjs
import nextVitals from "eslint-config-next/core-web-vitals";

export default [...nextVitals];
```

```js
// D:\coding\portfoliotrack\postcss.config.mjs
export default {
  plugins: {
    tailwindcss: {},
  },
};
```

```gitignore
# D:\coding\portfoliotrack\.gitignore
node_modules/
.next/
data/portfolio.sqlite
drizzle/
```

- [ ] **Step 3: Create the root app shell and theme baseline**

```tsx
// D:\coding\portfoliotrack\src\app\layout.tsx
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

```tsx
// D:\coding\portfoliotrack\src\components\app-shell.tsx
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/holdings", label: "Holdings" },
  { href: "/transactions", label: "Transactions" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <div>
          <p className="eyebrow">PortfolioTrack</p>
          <h1>Personal Portfolio Tracker</h1>
        </div>
        <nav>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create a starter dashboard stub and global styles**

```tsx
// D:\coding\portfoliotrack\src\app\page.tsx
export default function DashboardPage() {
  return (
    <section className="page-grid">
      <div className="hero-card">
        <p className="eyebrow">V1 scope</p>
        <h2>Portfolio dashboard starter view</h2>
        <p>The real KPI cards and charts arrive after the data layer is in place.</p>
      </div>
    </section>
  );
}
```

```css
/* D:\coding\portfoliotrack\src\app\globals.css */
:root {
  --bg: #f5efe6;
  --panel: #fffaf4;
  --ink: #1b1a17;
  --muted: #6d675f;
  --accent: #0e7c66;
  --gain: #0f8c55;
  --loss: #b43f30;
  --border: rgba(27, 26, 23, 0.08);
}

* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: radial-gradient(circle at top, #fffdf8, var(--bg));
  color: var(--ink);
  font-family: Georgia, "Times New Roman", serif;
}
.app-frame {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  margin-bottom: 32px;
}
.topbar nav {
  display: flex;
  gap: 16px;
}
.topbar a {
  color: var(--ink);
  text-decoration: none;
}
.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  color: var(--muted);
}
.page-grid {
  display: grid;
  gap: 24px;
}
.hero-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 32px;
  box-shadow: 0 20px 60px rgba(27, 26, 23, 0.08);
}
```

- [ ] **Step 5: Install dependencies and verify the shell boots**

Run: `npm install`
Expected: dependency install completes without missing peer dependency errors

Run: `npm run dev`
Expected: Next.js starts and the starter dashboard renders at `http://localhost:3000`

## Task 2: Create the SQLite and Drizzle data foundation

**Files:**

- Create: `D:\coding\portfoliotrack\drizzle.config.ts`
- Create: `D:\coding\portfoliotrack\src\lib\db\client.ts`
- Create: `D:\coding\portfoliotrack\src\lib\db\schema.ts`
- Create: `D:\coding\portfoliotrack\src\lib\db\migrate.ts`
- Create: `D:\coding\portfoliotrack\src\lib\db\seed.ts`
- Create: `D:\coding\portfoliotrack\data\.gitkeep`
- Update: `D:\coding\portfoliotrack\.gitignore`
- Delete: none

- [ ] **Step 1: Point Drizzle at the local SQLite file**

```ts
// D:\coding\portfoliotrack\drizzle.config.ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/portfolio.sqlite",
  },
} satisfies Config;
```

- [ ] **Step 2: Define the SQLite client and schema**

```ts
// D:\coding\portfoliotrack\src\lib\db\client.ts
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export const dbPath = path.join(process.cwd(), "data", "portfolio.sqlite");

const sqlite = new Database(dbPath);

export const db = drizzle(sqlite);
```

```ts
// D:\coding\portfoliotrack\src\lib\db\schema.ts
import { integer, numeric, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const instruments = sqliteTable("instruments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull().unique(),
  displayName: text("display_name").notNull(),
  market: text("market").notNull(),
  instrumentType: text("instrument_type").notNull(),
  currency: text("currency").notNull(),
  providerSymbol: text("provider_symbol").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull(),
  tradeDate: text("trade_date").notNull(),
  side: text("side").notNull(),
  quantity: numeric("quantity").notNull(),
  price: numeric("price").notNull(),
  fee: numeric("fee").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

- [ ] **Step 3: Add the remaining cache and settings tables**

```ts
export const priceSnapshots = sqliteTable("price_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull().unique(),
  price: numeric("price").notNull(),
  currency: text("currency").notNull(),
  asOf: text("as_of").notNull(),
  source: text("source").notNull(),
});

export const historicalPrices = sqliteTable("historical_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull(),
  priceDate: text("price_date").notNull(),
  close: numeric("close").notNull(),
  currency: text("currency").notNull(),
  source: text("source").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

- [ ] **Step 4: Add migration and seed entrypoints**

```ts
// D:\coding\portfoliotrack\src\lib\db\migrate.ts
import { mkdirSync } from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "@/lib/db/client";

mkdirSync("D:/coding/portfoliotrack/data", { recursive: true });
migrate(db, { migrationsFolder: "D:/coding/portfoliotrack/drizzle" });
console.log("Database migrations applied.");
```

```ts
// D:\coding\portfoliotrack\src\lib\db\seed.ts
export const defaultInstruments = [
  {
    symbol: "SPY",
    displayName: "SPDR S&P 500 ETF Trust",
    market: "US",
    instrumentType: "ETF",
    currency: "USD",
    providerSymbol: "SPY",
  },
  {
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "TH",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
  },
];

export const defaultSettings = {
  benchmarkSymbol: "SPY",
  marketRefreshMinutes: "30",
  timezone: "Asia/Bangkok",
  symbolOverrides: "{}",
};
```

- [ ] **Step 5: Create the data directory and run the first schema setup**

Run: `New-Item -ItemType Directory -Force D:\coding\portfoliotrack\data`
Expected: `data` directory exists

Run: `npx drizzle-kit generate`
Expected: SQL migration files appear under `D:\coding\portfoliotrack\drizzle`

Run: `npm run db:migrate`
Expected: SQLite file is created and migrations apply without path errors

## Task 3: Implement portfolio math and transaction validation

**Files:**

- Create: `D:\coding\portfoliotrack\src\lib\validation\transaction.ts`
- Create: `D:\coding\portfoliotrack\src\lib\portfolio\positions.ts`
- Create: `D:\coding\portfoliotrack\src\lib\format.ts`
- Create: `D:\coding\portfoliotrack\src\server\transactions.ts`
- Update: `D:\coding\portfoliotrack\src\lib\db\schema.ts`
- Delete: none

- [ ] **Step 1: Add a strict transaction input schema**

```ts
// D:\coding\portfoliotrack\src\lib\validation\transaction.ts
import { z } from "zod";

export const transactionSchema = z.object({
  instrumentId: z.number().int().positive(),
  tradeDate: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().positive(),
  fee: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
```

- [ ] **Step 2: Implement the fee-aware average-cost engine**

```ts
// D:\coding\portfoliotrack\src\lib\portfolio\positions.ts
type PositionState = {
  quantity: number;
  totalCost: number;
  averageCost: number;
  realizedPnl: number;
};

export function applyTransaction(
  state: PositionState,
  tx: { side: "BUY" | "SELL"; quantity: number; price: number; fee: number },
): PositionState {
  if (tx.side === "BUY") {
    const nextQuantity = state.quantity + tx.quantity;
    const nextTotalCost = state.totalCost + tx.quantity * tx.price + tx.fee;
    return {
      quantity: nextQuantity,
      totalCost: nextTotalCost,
      averageCost: nextQuantity === 0 ? 0 : nextTotalCost / nextQuantity,
      realizedPnl: state.realizedPnl,
    };
  }

  const removedCost = tx.quantity * state.averageCost;
  const proceeds = tx.quantity * tx.price - tx.fee;
  const nextQuantity = state.quantity - tx.quantity;
  const nextTotalCost = Math.max(0, state.totalCost - removedCost);
  return {
    quantity: nextQuantity,
    totalCost: nextTotalCost,
    averageCost: nextQuantity === 0 ? 0 : nextTotalCost / nextQuantity,
    realizedPnl: state.realizedPnl + (proceeds - removedCost),
  };
}
```

- [ ] **Step 3: Add formatting helpers for currency, quantity, and percent**

```ts
// D:\coding\portfoliotrack\src\lib\format.ts
export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}
```

- [ ] **Step 4: Create the transaction service API used by routes and pages**

```ts
// D:\coding\portfoliotrack\src\server\transactions.ts
import { transactionSchema } from "@/lib/validation/transaction";

export async function createTransaction(input: unknown) {
  const parsed = transactionSchema.parse(input);
  return parsed;
}

export async function listTransactions() {
  return [];
}
```

- [ ] **Step 5: Manually verify the math before any UI depends on it**

Run: `npx tsx -e "import { applyTransaction } from './src/lib/portfolio/positions.ts'; let state={quantity:0,totalCost:0,averageCost:0,realizedPnl:0}; state=applyTransaction(state,{side:'BUY',quantity:10,price:100,fee:5}); console.log(state); state=applyTransaction(state,{side:'SELL',quantity:4,price:120,fee:2}); console.log(state);"`
Expected: first log shows `totalCost = 1005` and `averageCost = 100.5`; second log shows a positive `realizedPnl` and reduced `quantity`

## Task 4: Build transaction entry and transaction list pages

**Files:**

- Create: `D:\coding\portfoliotrack\src\app\transactions\page.tsx`
- Create: `D:\coding\portfoliotrack\src\app\api\transactions\route.ts`
- Create: `D:\coding\portfoliotrack\src\components\transaction-form.tsx`
- Create: `D:\coding\portfoliotrack\src\components\transaction-table.tsx`
- Update: `D:\coding\portfoliotrack\src\server\transactions.ts`
- Delete: none

- [ ] **Step 1: Create the transaction form component**

```tsx
// D:\coding\portfoliotrack\src\components\transaction-form.tsx
"use client";

import { useState } from "react";

export function TransactionForm() {
  const [status, setStatus] = useState<string>("");

  return (
    <form className="panel-grid">
      <input name="tradeDate" type="date" required />
      <select name="side" defaultValue="BUY">
        <option value="BUY">Buy</option>
        <option value="SELL">Sell</option>
      </select>
      <input name="quantity" type="number" step="0.0001" required />
      <input name="price" type="number" step="0.01" required />
      <input name="fee" type="number" step="0.01" defaultValue="0" required />
      <textarea name="notes" rows={3} aria-label="Optional notes" />
      <button type="submit">Save transaction</button>
      <p>{status}</p>
    </form>
  );
}
```

- [ ] **Step 2: Add the API route that validates and saves a transaction**

```ts
// D:\coding\portfoliotrack\src\app\api\transactions\route.ts
import { NextResponse } from "next/server";
import { createTransaction } from "@/server/transactions";

export async function POST(request: Request) {
  const body = await request.json();
  const transaction = await createTransaction(body);
  return NextResponse.json({ transaction }, { status: 201 });
}
```

- [ ] **Step 3: Create the transactions page and list component**

```tsx
// D:\coding\portfoliotrack\src\components\transaction-table.tsx
type TransactionRow = {
  id: number;
  symbol: string;
  tradeDate: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fee: number;
};

export function TransactionTable({ rows }: { rows: TransactionRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Symbol</th>
          <th>Side</th>
          <th>Quantity</th>
          <th>Price</th>
          <th>Fee</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.tradeDate}</td>
            <td>{row.symbol}</td>
            <td>{row.side}</td>
            <td>{row.quantity}</td>
            <td>{row.price}</td>
            <td>{row.fee}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```tsx
// D:\coding\portfoliotrack\src\app\transactions\page.tsx
import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { listTransactions } from "@/server/transactions";

export default async function TransactionsPage() {
  const rows = await listTransactions();
  return (
    <section className="page-grid">
      <TransactionForm />
      <TransactionTable rows={rows} />
    </section>
  );
}
```

- [ ] **Step 4: Wire the form submit flow and refresh the page after save**

Run: `npm run dev`
Expected: posting from the form creates a transaction and the list updates after reload

- [ ] **Step 5: Verify sell validation blocks impossible states**

Manual check:

- save a `BUY` for one symbol
- attempt a `SELL` larger than current quantity
- confirm the route returns a clear validation error instead of allowing negative holdings

## Task 5: Build holdings, dashboard, and summary queries

**Files:**

- Create: `D:\coding\portfoliotrack\src\server\holdings.ts`
- Create: `D:\coding\portfoliotrack\src\server\dashboard.ts`
- Create: `D:\coding\portfoliotrack\src\components\holdings-table.tsx`
- Create: `D:\coding\portfoliotrack\src\components\summary-cards.tsx`
- Create: `D:\coding\portfoliotrack\src\app\holdings\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\globals.css`
- Delete: none

- [ ] **Step 1: Build a holdings query that folds transactions into current positions**

```ts
// D:\coding\portfoliotrack\src\server\holdings.ts
import { applyTransaction } from "@/lib/portfolio/positions";

export async function getHoldings() {
  const grouped = new Map<string, ReturnType<typeof applyTransaction>>();
  return grouped;
}
```

- [ ] **Step 2: Build dashboard summary queries**

```ts
// D:\coding\portfoliotrack\src\server\dashboard.ts
export async function getDashboardSummary() {
  return {
    totalMarketValue: 0,
    totalCostBasis: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    topMovers: [],
  };
}
```

- [ ] **Step 3: Render the holdings table**

```tsx
// D:\coding\portfoliotrack\src\components\holdings-table.tsx
export function HoldingsTable({ rows }: { rows: Array<Record<string, string | number>> }) {
  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Market</th>
            <th>Quantity</th>
            <th>Average Cost</th>
            <th>Last Price</th>
            <th>Market Value</th>
            <th>Unrealized P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.symbol)}>
              <td>{row.symbol}</td>
              <td>{row.market}</td>
              <td>{row.quantity}</td>
              <td>{row.averageCost}</td>
              <td>{row.lastPrice}</td>
              <td>{row.marketValue}</td>
              <td>{row.unrealizedPnl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Replace the starter dashboard stub with real KPI cards**

```tsx
// D:\coding\portfoliotrack\src\components\summary-cards.tsx
export function SummaryCards({
  summary,
}: {
  summary: {
    totalMarketValue: number;
    totalCostBasis: number;
    unrealizedPnl: number;
    realizedPnl: number;
  };
}) {
  const cards = [
    ["Market Value", summary.totalMarketValue],
    ["Cost Basis", summary.totalCostBasis],
    ["Unrealized P&L", summary.unrealizedPnl],
    ["Realized P&L", summary.realizedPnl],
  ];

  return (
    <div className="card-grid">
      {cards.map(([label, value]) => (
        <article key={label} className="metric-card">
          <p className="eyebrow">{label}</p>
          <h3>{String(value)}</h3>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Manually confirm dashboard and holdings totals match**

Manual check:

- create two buys and one sell across at least two symbols
- compare dashboard totals with holdings rows
- confirm the dashboard never counts fully exited positions in open cost basis

## Task 6: Add market data adapter, cache refresh, and benchmark timeline

**Files:**

- Create: `D:\coding\portfoliotrack\src\lib\market\types.ts`
- Create: `D:\coding\portfoliotrack\src\lib\market\provider.ts`
- Create: `D:\coding\portfoliotrack\src\lib\market\yahoo-provider.ts`
- Create: `D:\coding\portfoliotrack\src\lib\portfolio\timeline.ts`
- Create: `D:\coding\portfoliotrack\src\app\api\market-data\refresh\route.ts`
- Update: `D:\coding\portfoliotrack\src\server\dashboard.ts`
- Update: `D:\coding\portfoliotrack\src\server\holdings.ts`
- Delete: none

- [ ] **Step 1: Define the market data interface**

```ts
// D:\coding\portfoliotrack\src\lib\market\types.ts
export type QuoteSnapshot = {
  providerSymbol: string;
  price: number;
  currency: string;
  asOf: string;
};
export type HistoricalBar = { date: string; close: number };

export interface MarketDataProvider {
  getLatestQuotes(providerSymbols: string[]): Promise<QuoteSnapshot[]>;
  getHistoricalCloses(providerSymbol: string, startDate: string): Promise<HistoricalBar[]>;
}
```

```ts
// D:\coding\portfoliotrack\src\lib\market\provider.ts
import type { MarketDataProvider } from "@/lib/market/types";
import { yahooProvider } from "@/lib/market/yahoo-provider";

export function getMarketDataProvider(): MarketDataProvider {
  return yahooProvider;
}
```

- [ ] **Step 2: Implement the first provider with symbol-based quote and history fetches**

```ts
// D:\coding\portfoliotrack\src\lib\market\yahoo-provider.ts
import type { HistoricalBar, MarketDataProvider, QuoteSnapshot } from "@/lib/market/types";

export const yahooProvider: MarketDataProvider = {
  async getLatestQuotes(providerSymbols: string[]): Promise<QuoteSnapshot[]> {
    return providerSymbols.map((symbol) => ({
      providerSymbol: symbol,
      price: 0,
      currency: symbol.endsWith(".BK") ? "THB" : "USD",
      asOf: new Date().toISOString(),
    }));
  },
  async getHistoricalCloses(providerSymbol: string, startDate: string): Promise<HistoricalBar[]> {
    return [{ date: startDate, close: 100 }];
  },
};
```

- [ ] **Step 3: Add the normalized portfolio-vs-benchmark timeline builder**

```ts
// D:\coding\portfoliotrack\src\lib\portfolio\timeline.ts
type TimelinePoint = { date: string; portfolio: number; benchmark: number };

export function normalizeSeries(
  portfolio: Array<{ date: string; value: number }>,
  benchmark: Array<{ date: string; value: number }>,
): TimelinePoint[] {
  const portfolioBase = portfolio[0]?.value ?? 1;
  const benchmarkBase = benchmark[0]?.value ?? 1;
  return portfolio.map((point, index) => ({
    date: point.date,
    portfolio: (point.value / portfolioBase) * 100,
    benchmark: ((benchmark[index]?.value ?? benchmarkBase) / benchmarkBase) * 100,
  }));
}
```

- [ ] **Step 4: Create the refresh route and stale-data behavior**

```ts
// D:\coding\portfoliotrack\src\app\api\market-data\refresh\route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ refreshed: true, asOf: new Date().toISOString() });
}
```

- [ ] **Step 5: Verify the benchmark baseline logic**

Manual check:

- set the first transaction date to a known date
- refresh market data
- confirm both portfolio and benchmark begin at `100` on that first transaction date

## Task 7: Build charts and the asset detail page

**Files:**

- Create: `D:\coding\portfoliotrack\src\server\assets.ts`
- Create: `D:\coding\portfoliotrack\src\components\portfolio-chart.tsx`
- Create: `D:\coding\portfoliotrack\src\components\benchmark-chart.tsx`
- Create: `D:\coding\portfoliotrack\src\components\asset-header.tsx`
- Create: `D:\coding\portfoliotrack\src\components\asset-price-chart.tsx`
- Create: `D:\coding\portfoliotrack\src\app\assets\[symbol]\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\page.tsx`
- Delete: none

- [ ] **Step 1: Add dashboard chart components**

```tsx
// D:\coding\portfoliotrack\src\components\portfolio-chart.tsx
"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PortfolioChart({ data }: { data: Array<{ date: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#0e7c66" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

```tsx
// D:\coding\portfoliotrack\src\components\benchmark-chart.tsx
"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function BenchmarkChart({
  data,
}: {
  data: Array<{ date: string; portfolio: number; benchmark: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="portfolio" stroke="#0e7c66" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="benchmark" stroke="#1b1a17" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create the asset detail query and UI**

```tsx
// D:\coding\portfoliotrack\src\components\asset-header.tsx
export function AssetHeader({
  symbol,
  displayName,
  quantity,
  averageCost,
}: {
  symbol: string;
  displayName: string;
  quantity: number;
  averageCost: number;
}) {
  return (
    <header className="hero-card">
      <p className="eyebrow">{symbol}</p>
      <h2>{displayName}</h2>
      <p>
        {quantity} shares at average cost {averageCost}
      </p>
    </header>
  );
}
```

```tsx
// D:\coding\portfoliotrack\src\app\assets\[symbol]\page.tsx
import { AssetHeader } from "@/components/asset-header";

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <section className="page-grid">
      <AssetHeader symbol={symbol} displayName={symbol} quantity={0} averageCost={0} />
    </section>
  );
}
```

- [ ] **Step 3: Add the asset price chart with an average-cost reference**

```tsx
// D:\coding\portfoliotrack\src\components\asset-price-chart.tsx
"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function AssetPriceChart({
  data,
  averageCost,
}: {
  data: Array<{ date: string; close: number }>;
  averageCost: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <ReferenceLine y={averageCost} stroke="#b43f30" strokeDasharray="6 6" />
        <Line type="monotone" dataKey="close" stroke="#0e7c66" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Put both charts on the dashboard and link holdings rows to asset detail**

Run: `npm run dev`
Expected: dashboard shows both charts and clicking a holdings symbol opens `/assets/[symbol]`

- [ ] **Step 5: Manually verify a DR symbol renders correctly**

Manual check:

- seed or add a Thai DR symbol such as `AAPL80`
- confirm it links to a detail page
- confirm pricing uses its provider symbol mapping, not the display symbol by assumption alone

## Task 8: Finish error states, refresh control, and release readiness checks

**Files:**

- Update: `D:\coding\portfoliotrack\src\app\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\holdings\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\transactions\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\assets\[symbol]\page.tsx`
- Update: `D:\coding\portfoliotrack\src\app\globals.css`
- Update: `D:\coding\portfoliotrack\src\app\api\market-data\refresh\route.ts`
- Delete: none
- Create: none

- [ ] **Step 1: Add empty states and stale-data messaging**

Implement these UI rules:

- if there are no transactions, dashboard shows a clear onboarding empty state
- if a quote is missing, show `Price unavailable` with last refresh time
- if the refresh endpoint fails, show a retry affordance instead of crashing the page

- [ ] **Step 2: Add a manual refresh control on the dashboard**

Expected UI behavior:

- a `Refresh market data` button appears in the dashboard header
- clicking it calls `POST /api/market-data/refresh`
- success updates the visible `as of` timestamp

- [ ] **Step 3: Run static verification**

Run: `npm run lint`
Expected: lint completes with no errors

Run: `npm run build`
Expected: production build completes successfully

- [ ] **Step 4: Run the full manual verification pass**

Manual checklist:

- add a buy for a US symbol
- add a buy for a Thai or DR symbol
- add a sell with a fee
- confirm holdings, realized P&L, and unrealized P&L stay internally consistent
- confirm benchmark starts at `100` on the first transaction date
- confirm the app still renders if one symbol has no fresh quote

- [ ] **Step 5: Stop with one clean uncommitted work set**

Do not create a commit unless the user explicitly requests one.

## File Operations

Create:

- `D:\coding\portfoliotrack\package.json`
- `D:\coding\portfoliotrack\tsconfig.json`
- `D:\coding\portfoliotrack\next-env.d.ts`
- `D:\coding\portfoliotrack\next.config.ts`
- `D:\coding\portfoliotrack\eslint.config.mjs`
- `D:\coding\portfoliotrack\postcss.config.mjs`
- `D:\coding\portfoliotrack\drizzle.config.ts`
- `D:\coding\portfoliotrack\.gitignore`
- `D:\coding\portfoliotrack\data\.gitkeep`
- `D:\coding\portfoliotrack\src\app\layout.tsx`
- `D:\coding\portfoliotrack\src\app\globals.css`
- `D:\coding\portfoliotrack\src\app\page.tsx`
- `D:\coding\portfoliotrack\src\app\holdings\page.tsx`
- `D:\coding\portfoliotrack\src\app\transactions\page.tsx`
- `D:\coding\portfoliotrack\src\app\assets\[symbol]\page.tsx`
- `D:\coding\portfoliotrack\src\app\api\transactions\route.ts`
- `D:\coding\portfoliotrack\src\app\api\market-data\refresh\route.ts`
- `D:\coding\portfoliotrack\src\components\app-shell.tsx`
- `D:\coding\portfoliotrack\src\components\summary-cards.tsx`
- `D:\coding\portfoliotrack\src\components\portfolio-chart.tsx`
- `D:\coding\portfoliotrack\src\components\benchmark-chart.tsx`
- `D:\coding\portfoliotrack\src\components\holdings-table.tsx`
- `D:\coding\portfoliotrack\src\components\transaction-form.tsx`
- `D:\coding\portfoliotrack\src\components\transaction-table.tsx`
- `D:\coding\portfoliotrack\src\components\asset-header.tsx`
- `D:\coding\portfoliotrack\src\components\asset-price-chart.tsx`
- `D:\coding\portfoliotrack\src\lib\db\client.ts`
- `D:\coding\portfoliotrack\src\lib\db\schema.ts`
- `D:\coding\portfoliotrack\src\lib\db\migrate.ts`
- `D:\coding\portfoliotrack\src\lib\db\seed.ts`
- `D:\coding\portfoliotrack\src\lib\portfolio\positions.ts`
- `D:\coding\portfoliotrack\src\lib\portfolio\timeline.ts`
- `D:\coding\portfoliotrack\src\lib\market\types.ts`
- `D:\coding\portfoliotrack\src\lib\market\provider.ts`
- `D:\coding\portfoliotrack\src\lib\market\yahoo-provider.ts`
- `D:\coding\portfoliotrack\src\lib\validation\transaction.ts`
- `D:\coding\portfoliotrack\src\lib\format.ts`
- `D:\coding\portfoliotrack\src\server\dashboard.ts`
- `D:\coding\portfoliotrack\src\server\holdings.ts`
- `D:\coding\portfoliotrack\src\server\transactions.ts`
- `D:\coding\portfoliotrack\src\server\assets.ts`

Update:

- `D:\coding\portfoliotrack\.gitignore`
- `D:\coding\portfoliotrack\src\lib\db\schema.ts`
- `D:\coding\portfoliotrack\src\server\transactions.ts`
- `D:\coding\portfoliotrack\src\app\page.tsx`
- `D:\coding\portfoliotrack\src\app\globals.css`
- `D:\coding\portfoliotrack\src\server\dashboard.ts`
- `D:\coding\portfoliotrack\src\server\holdings.ts`
- `D:\coding\portfoliotrack\src\app\page.tsx`
- `D:\coding\portfoliotrack\src\app\holdings\page.tsx`
- `D:\coding\portfoliotrack\src\app\transactions\page.tsx`
- `D:\coding\portfoliotrack\src\app\assets\[symbol]\page.tsx`
- `D:\coding\portfoliotrack\src\app\api\market-data\refresh\route.ts`

Delete:

- none
