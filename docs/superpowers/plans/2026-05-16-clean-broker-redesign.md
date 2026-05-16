# Clean Broker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild PortfolioTrack into a modern Clean Broker style app with Thai/light defaults, dark mode, language controls, per-stock detail views, and DR parent-price analytics.

**Architecture:** Add a small client preference layer for theme/language, keep portfolio math server-side, and extend instrument data with nullable DR metadata. Redesign the UI primarily through shared CSS and focused component updates without adding account/settings complexity.

**Tech Stack:** Next.js App Router, React 19, SQLite, Drizzle ORM, Recharts, localStorage.

---

## File Operations

Create:

- `src/lib/ui/preferences.tsx`
- `src/lib/ui/translations.ts`
- `drizzle/0001_dr_metadata.sql`

Update:

- `src/app/globals.css`
- `src/components/app-shell.tsx`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/components/summary-cards.tsx`
- `src/components/portfolio-chart.tsx`
- `src/components/benchmark-chart.tsx`
- `src/app/holdings/page.tsx`
- `src/components/holdings-table.tsx`
- `src/app/transactions/page.tsx`
- `src/components/transaction-form.tsx`
- `src/components/transaction-table.tsx`
- `src/app/assets/[symbol]/page.tsx`
- `src/components/asset-header.tsx`
- `src/components/asset-price-chart.tsx`
- `src/server/assets.ts`
- `src/lib/db/schema.ts`
- `src/lib/db/seed.ts`
- `drizzle/meta/_journal.json`

Delete:

- none

## Tasks

- [ ] Add client UI preferences with `light` and `TH` defaults stored in `localStorage`.
- [ ] Replace the old editorial CSS with Clean Broker tokens, cards, title styles, tables, forms, light mode, and high-contrast dark mode.
- [ ] Update app shell navigation and preference toggles.
- [ ] Convert dashboard copy and layout to practical Thai-first portfolio UI.
- [ ] Convert holdings and transactions pages/components to Thai-first Clean Broker UI.
- [ ] Add nullable DR metadata columns to schema, migration, and seed data for `AAPL80` with `drRatio = 1000`.
- [ ] Extend asset detail server data with instrument transactions and DR equivalent calculations.
- [ ] Redesign asset detail page with per-stock performance, trade history, and DR-aware parent-price panels.
- [ ] Run `npm run lint`, `npm run build`, `npm run db:migrate`, and browser checks.
