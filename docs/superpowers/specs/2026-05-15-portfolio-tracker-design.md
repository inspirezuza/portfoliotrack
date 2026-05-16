# Portfolio Tracker Design

Date: 2026-05-15
Project: `D:\coding\portfoliotrack`
Status: Draft for review

## 1. Summary

Build a local-first portfolio tracker for a single user. The app should be simple, visually polished, and focused on manual stock transaction entry. It will support Thai and US equities, with a strong emphasis on Thai DR instruments, and compare portfolio performance against the S&P 500 using `SPY` as the v1 benchmark proxy.

The product goal is to make day-to-day tracking easy:

- Open the app and see the whole portfolio immediately.
- Add buy/sell transactions quickly.
- Understand holdings, cost basis, and gain/loss without accounting complexity.
- View a clean performance chart and a benchmark comparison.

## 2. Goals

- Support one local portfolio only.
- Support manual transaction entry through the UI.
- Support `BUY` and `SELL` transactions with a per-transaction fee field.
- Show current holdings and aggregated portfolio performance.
- Fetch latest market prices automatically.
- Show a performance comparison against the S&P 500 via `SPY`.
- Favor a desktop-first UI that feels clean and premium without being complicated.

## 3. Non-Goals

The following are explicitly out of scope for v1:

- User accounts or authentication
- Cloud sync
- Multi-portfolio or multi-broker support
- Cash ledger tracking
- Dividends
- Tax reporting
- CSV import
- Mobile-first UX
- Institutional-grade return analytics

## 4. Product Shape

This is a local web app that runs entirely on the user's machine and stores data in a single SQLite database file. The UI is optimized for desktop use. The app is local-first: transaction data is always the source of truth, while market data is fetched and cached to enrich portfolio views.

This local-first model keeps the app simple to operate and resilient when market data is delayed or temporarily unavailable.

## 5. Recommended Technical Approach

Recommended approach:

- Frontend and app shell: `Next.js` with `TypeScript`
- Database: `SQLite`
- ORM and schema tooling: `Drizzle ORM`
- Styling: `Tailwind CSS`
- Charts: `Recharts` or `Visx`

Why this approach:

- It produces a polished desktop web UI quickly.
- It keeps data local and easy to back up.
- It supports clean route structure for dashboard, holdings, transactions, and detail views.
- It leaves room to swap market data providers later without changing the core app model.

## 6. System Architecture

The app is divided into three layers.

### 6.1 UI layer

Responsible for:

- Dashboard presentation
- Holdings table
- Transaction list and form
- Asset detail pages
- Charts and visual summaries

### 6.2 Application layer

Responsible for:

- Validating transaction input
- Calculating position state
- Calculating average cost
- Calculating realized and unrealized P&L
- Building portfolio timeline series
- Normalizing benchmark comparison series
- Coordinating market data refresh and cache usage

### 6.3 Data layer

Responsible for:

- Persistent portfolio storage in SQLite
- Cached latest prices
- Cached historical price series
- App settings and symbol overrides

Design rule:

- Transaction data is the source of truth.
- Market prices are supporting data.

If price fetching fails, holdings and cost basis calculations must still work from stored transactions.

## 7. Core Screens

V1 should include four primary screens.

### 7.1 Dashboard

Purpose:

- Show the portfolio state immediately after app launch.

Content:

- Current portfolio value
- Total cost basis
- Unrealized P&L
- Realized P&L
- Portfolio performance chart
- Portfolio vs `SPY` comparison chart
- Top gainers and losers

### 7.2 Holdings

Purpose:

- Show all current positions in a clean, sortable table.

Columns:

- Symbol
- Name
- Market
- Quantity
- Average cost
- Last price
- Market value
- Unrealized P&L
- Portfolio weight

### 7.3 Transactions

Purpose:

- Let the user inspect and manage manual entries.

Features:

- Chronological transaction list
- Filter by symbol
- Add transaction action

Transaction form fields:

- Date
- Symbol
- Side (`BUY` or `SELL`)
- Quantity
- Price
- Fee
- Notes

### 7.4 Asset detail

Purpose:

- Let the user inspect one position more deeply.

Content:

- Position summary
- Transaction history for the symbol
- Price chart
- Average cost reference
- Current gain/loss
- Optional provider metadata for DR mapping

## 8. UX Principles

The app should feel intentionally minimal, not like a generic admin panel.

UI direction:

- Light theme by default
- Strong typography and generous spacing
- Few colors: neutral palette plus green/red and one accent color
- Large, readable charts
- Minimal visual clutter

Interaction principles:

- The daily workflow should be short.
- Adding a transaction should be fast and low-friction.
- Market data failures should be visible but non-blocking.
- Important numbers should be understandable without drilling into multiple screens.

## 9. Data Model

V1 uses five core data groups.

### 9.1 `instruments`

Stores tradable assets known to the app.

Suggested fields:

- `id`
- `symbol`
- `display_name`
- `market`
- `instrument_type`
- `currency`
- `provider_symbol`
- `is_active`
- `created_at`
- `updated_at`

Notes:

- `market` should distinguish at least `TH` and `US`.
- `instrument_type` should distinguish at least standard equity and `DR`.
- `provider_symbol` allows app symbols and external data symbols to differ.
- Thai DR instruments should normally use `market = TH` and `instrument_type = DR`.

### 9.2 `transactions`

Stores manual buy/sell entries.

Suggested fields:

- `id`
- `instrument_id`
- `trade_date`
- `side`
- `quantity`
- `price`
- `fee`
- `notes`
- `created_at`
- `updated_at`

Rules:

- `side` is restricted to `BUY` or `SELL`.
- `quantity`, `price`, and `fee` must be non-negative.

### 9.3 `price_snapshots`

Stores cached latest prices.

Suggested fields:

- `id`
- `instrument_id`
- `price`
- `currency`
- `as_of`
- `source`

### 9.4 `historical_prices`

Stores end-of-day price history used for charts and performance calculations.

Suggested fields:

- `id`
- `instrument_id`
- `price_date`
- `close`
- `currency`
- `source`

### 9.5 `app_settings`

Stores app-level configuration.

Suggested fields:

- `id`
- `key`
- `value`
- `updated_at`

Expected settings:

- Benchmark symbol
- Market data refresh threshold
- Timezone
- Symbol overrides

## 10. Calculation Rules

V1 uses the average cost method because it is easy to explain and appropriate for a single-user tracker.

### 10.1 Buy handling

For a `BUY` transaction:

- Increase quantity by transaction quantity.
- Increase total cost basis by `quantity * price + fee`.
- Recalculate average cost from the new position quantity and total cost basis.

### 10.2 Sell handling

For a `SELL` transaction:

- Reduce quantity by transaction quantity.
- Use current average cost at the moment of sale to determine cost removed.
- Net sale proceeds are `quantity * price - fee`.
- Realized P&L is `net sale proceeds - removed cost basis`.

### 10.3 Fee treatment

- Buy fees are included in cost basis.
- Sell fees reduce proceeds.

### 10.4 Derived values

The app must be able to calculate:

- Current quantity
- Current average cost
- Current market value
- Unrealized P&L
- Realized P&L
- Total return summary

## 11. Portfolio Performance Logic

The app needs two different concepts of performance.

### 11.1 Position-level performance

For each holding:

- Quantity
- Average cost
- Last price
- Market value
- Unrealized P&L

### 11.2 Portfolio-level performance

For the full portfolio:

- Current total market value
- Total cost basis of open positions
- Total realized P&L
- Historical portfolio value curve

## 12. Benchmark Comparison

V1 benchmark:

- Use `SPY` as the S&P 500 proxy.

Reason:

- It is simpler and typically easier to source reliably than direct index-only feeds.

Comparison method:

- Build a normalized performance chart.
- Set both the portfolio and benchmark to `100` at the first transaction date in the portfolio.
- Plot relative change from that baseline over time.

Important limitation:

- Because v1 does not track cash flows separately, normalized comparison may be biased when transactions happen on many different dates.

This is acceptable for v1 because the goal is a practical personal tracker, not formal performance attribution.

Future upgrade path:

- Add time-weighted or money-weighted return logic in a later version.

## 13. Market Data Strategy

The app should isolate market data behind a provider abstraction.

### 13.1 Market data responsibilities

The provider layer should support:

- Latest price lookup
- Historical daily close lookup
- Benchmark history lookup
- Symbol translation for Thai, US, and DR instruments

### 13.2 Provider abstraction rule

The rest of the app must never depend on one provider's raw response shape directly. Provider-specific logic should stay inside a dedicated adapter layer.

### 13.3 Refresh behavior

V1 should not require a separate background daemon.

Preferred behavior:

- On page load, check whether cached data is stale.
- If stale beyond a configured threshold, refresh market data.
- Provide a manual `Refresh market data` control.
- If a symbol fails to refresh, show a clear stale or missing status instead of fake values.

### 13.4 Reliability guardrails

The app should include:

- `provider_symbol` per instrument
- Symbol override settings
- Configurable benchmark symbol
- Cached data timestamps visible to the UI where helpful

## 14. Scope Boundaries For V1

### In scope

- Single local portfolio
- Manual stock transactions
- `BUY` and `SELL`
- Per-transaction fee
- Thai and US stock support
- DR-friendly symbol model
- Holdings summary
- Dashboard
- Asset detail page
- Benchmark comparison against `SPY`
- Desktop-first polished UI

### Out of scope

- Cash ledger
- Dividends
- Multi-account support
- CSV import
- Tax features
- Login
- Cloud sync
- Advanced return analytics

## 15. Manual Verification Checklist

Because the current preference is to avoid writing tests unless explicitly requested, v1 verification should begin with a manual checklist.

Required checks:

- A buy transaction updates quantity and average cost correctly.
- A sell transaction updates quantity and realized P&L correctly.
- Buy fees increase cost basis correctly.
- Sell fees reduce proceeds correctly.
- Holdings table matches dashboard aggregates.
- Asset detail values match the underlying transactions.
- Benchmark line loads and normalizes from the intended start date.
- Missing market data does not break the app.

## 16. Implementation Notes

Recommended implementation order:

1. Database schema and seed instrument flow
2. Transaction creation and position calculation logic
3. Holdings and dashboard summaries
4. Market data adapter and caching
5. Performance chart and benchmark comparison
6. Visual polish and error states

## 17. File Operations

Create:

- `D:\coding\portfoliotrack\docs\superpowers\specs\2026-05-15-portfolio-tracker-design.md`

Update:

- none

Delete:

- none

## 18. Final Direction

Build a desktop-first local web app with a clean financial UI, SQLite-backed storage, manual buy/sell entry with fees, and a market-data adapter that supports Thai, US, and DR instruments. Use transactions as the portfolio truth, keep external price data replaceable, and ship a focused v1 that emphasizes clarity over feature breadth.
