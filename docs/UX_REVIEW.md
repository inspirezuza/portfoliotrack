# PortfolioTrack UX Review

Date: 2026-05-16

This document captures the current layout and visual-design review after checking the main app routes in the browser.

## Scope Reviewed

Routes:

- `/`
- `/holdings`
- `/transactions`
- `/assets/AAPL80`

Viewports:

- Desktop app viewport
- Mobile-sized viewport around 390px wide

Source areas:

- `src/app/globals.css`
- `src/components/app-shell.tsx`
- `src/app/page.tsx`
- `src/app/holdings/page.tsx`
- `src/app/transactions/page.tsx`
- `src/components/asset-header.tsx`
- `src/components/summary-cards.tsx`
- `src/components/transaction-form.tsx`
- `src/components/holdings-table.tsx`
- `src/components/portfolio-chart.tsx`
- `src/components/benchmark-chart.tsx`
- `src/components/asset-price-chart.tsx`
- `src/app/assets/[symbol]/page.tsx`

## Current UX Summary

PortfolioTrack now uses a compact finance workspace pattern across the main routes. The strongest improvement is that operational pages no longer open with editorial hero blocks or explanatory marketing-style copy; they put the task surface first.

## Implemented Polish Pass

The follow-up pass tightened the most visible layout issues:

- Page-level hero blocks were removed from holdings, transactions, and asset detail.
- Dashboard, holdings, transactions, and asset detail now use compact page headers instead of editorial intro panels.
- Holdings now places the current holdings table before the secondary summary-card grid.
- Shell navigation now includes lightweight CSS-drawn icons with tighter active states.
- Dark mode surfaces have slightly more neutral separation so cards, tables, and sidebars do not collapse into one green block.
- Page-level copy is now English-first across the main app routes, and the Holdings nav item stays active for `/assets/[symbol]`.
- The Trade page is now form-first: readiness metrics moved into the side panel so transaction entry appears much earlier on desktop and mobile.
- Repetitive explanatory text was removed from table, form, chart, and asset panels.

## Findings

### 1. Page Patterns Are Consistent

All checked routes now use a compact workspace pattern:

- Topbar
- Primary metrics
- Main task area
- Side utility cards where useful

Relevant files:

- `src/app/page.tsx`
- `src/app/holdings/page.tsx`
- `src/app/transactions/page.tsx`
- `src/components/asset-header.tsx`
- `src/app/globals.css`

Future direction:

- Keep dashboard as the reference pattern.
- Put the primary task higher: holdings table on holdings, transaction form on transactions, key position summary on asset detail.

### 2. Metric Cards Still Need Restraint

The app still uses many visually similar metric cards. Holdings has page metrics, the holdings table, and summary cards. Asset detail can show a high card count because the performance grid, DR panel, side panels, chart, and transaction table all use similar surfaces.

Recommended direction:

- Use one primary metric per page.
- Group secondary metrics into denser rows or compact definition lists.
- Avoid repeating the same `metric-card` treatment for every number.

### 3. Navigation Is Cleaner

The sidebar now has icon-backed navigation and clearer active states. The compact labels `Dash`, `Hold`, and `Trade` still trade clarity for space.

Recommended direction:

- Consider full labels where space allows.
- Keep active and hover states restrained and predictable.

### 4. Palette And Surfaces Are Too One-Note

The current dark mode is heavily green-on-green. It is readable, but surfaces, sidebar, cards, empty states, buttons, and chart shells all sit in a close color range. This flattens hierarchy.

Recommended direction:

- Introduce more neutral surfaces, especially in dark mode.
- Reserve bright green for action, positive values, and selected states.
- Let tables and forms use quieter surfaces than CTA buttons.

### 5. Mobile Layout Is Usable

Mobile does not show obvious overlap in the checked routes. The first screen is now more task-focused because page storytelling was removed.

Recommended direction:

- Shrink operational page headers.
- Keep the shell header and preferences compact.
- Bring the transaction form and holdings table/empty state closer to the top.

## Remaining Recommended Next Work

Priority 1:

- Continue reducing first-screen metric duplication on holdings and asset detail.
- Add real bilingual page copy controlled by the selected `EN / TH` shell preference if Thai page-level UI is required again.

Priority 2:

- Tune dark-mode tokens for stronger neutral separation.
- Create separate styles for page headers, metric cards, utility cards, and table panels.

Priority 3:

- Continue page-level language cleanup and centralize copy where practical.
- Add a small UI copy/design checklist to future feature work.

## File Operations For A Follow-Up UI Polish Pass

Create:

- none

Update:

- `src/app/globals.css`
- `src/components/app-shell.tsx`
- `src/app/holdings/page.tsx`
- `src/app/transactions/page.tsx`
- `src/components/asset-header.tsx`
- `src/components/summary-cards.tsx`
- `src/components/transaction-form.tsx`
- `src/components/holdings-table.tsx`
- `src/components/transaction-table.tsx`
- `src/components/portfolio-chart.tsx`
- `src/components/benchmark-chart.tsx`
- `src/components/asset-price-chart.tsx`
- `src/app/assets/[symbol]/page.tsx`
- `README.md`
- `docs/AI_CONTEXT.md`
- `docs/UX_REVIEW.md`

Delete:

- none

## Verification Notes

For the review and first polish pass, the app was checked in the in-app browser while the development server was running at `http://127.0.0.1:3000`.

No automated tests were added or changed. This follows the repository instruction to avoid test changes unless explicitly requested.
