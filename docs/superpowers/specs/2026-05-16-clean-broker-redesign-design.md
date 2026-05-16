# PortfolioTrack Clean Broker Redesign Design

## Summary

Redesign PortfolioTrack from the current oversized editorial/landing-page style into a calmer, modern personal finance app. The approved visual direction is "Clean Broker": light mode by default, Thai language by default, clear metric cards, strong chart hierarchy, and practical navigation for daily portfolio use.

The redesign also adds a stronger per-stock detail experience and DR-aware analytics so Thai DR holdings can show their implied parent-stock price.

## File Operations

Create:

- `docs/superpowers/specs/2026-05-16-clean-broker-redesign-design.md`
- `src/lib/ui/preferences.tsx`
- `src/lib/ui/translations.ts`
- `drizzle/0001_dr_metadata.sql`

Update:

- `src/app/globals.css`
- `src/components/app-shell.tsx`
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

## Visual Direction

The app should feel like a lightweight brokerage dashboard built for one person, not a marketing site. Use a compact top navigation, rounded but not bloated cards, stronger metric density, and a softer green-forward palette.

Light mode is the default:

- Warm off-white/soft green page background.
- White glass-like cards with clear borders.
- Dark ink text with muted secondary labels.
- Green as the primary positive/action color.
- Blue for benchmark comparison.
- Amber/red only for warnings, discounts, or losses.

Dark mode is optional via a visible toggle:

- High contrast text, not smoky gray.
- Stronger surface separation.
- Muted labels must remain readable.
- Chart lines and active pills should remain bright enough for night use.

## Language And Copy

Thai is the default language. User-facing labels, headings, helper text, empty states, and panel titles should be Thai whenever they can be natural Thai.

Acceptable English terms:

- Market/product names: `S&P 500`, `SPY`, `AAPL`, `AAPL80`
- Common finance abbreviations: `DR`, `ETF`, `P&L`
- Terms that are clearer as mixed finance language when surrounded by Thai, such as `premium/discount`, `average cost`, or `benchmark`

Do not leave generic section headings in English when Thai is natural. Thai headings must not use wide uppercase-style letter spacing because it makes Thai text look broken and weak as a title. Use dedicated heading styles for Thai titles with tighter tracking, heavier weight, and clearer visual hierarchy.

Use separate styles for:

- Eyebrow metadata labels: small, uppercase-style English-friendly labels.
- Panel and section titles in both English and Thai: larger, heavier, tight letter spacing, no uppercase transform. English titles such as `DR metadata` should look like real panel headings, not tiny letter-spaced tags.
- Thai section titles: larger, heavier, tight letter spacing, no uppercase transform.

Language switching should be available as `TH / EN` in the shell header. For v1, the selected language can be stored locally in the browser with `localStorage`; no account or database setting is needed.

## Theme Switching

The shell header includes `Light / Dark` controls. For v1, selected theme is stored in `localStorage` and applied as a root data attribute or class.

Default state:

- Theme: `light`
- Language: `TH`

The implementation should avoid server/client hydration mismatch by rendering a safe default and then applying the stored preference client-side.

## Dashboard

The dashboard should lead with the portfolio value and practical portfolio status, not a giant slogan.

Primary dashboard content:

- Portfolio value / market value when available.
- Performance versus S&P 500 when available.
- Unrealized P&L.
- Realized P&L.
- Total fees.
- Price coverage / latest price freshness.
- Top holdings preview.
- Main portfolio chart and benchmark chart.

Empty portfolio states should remain useful and compact, pointing the user to add transactions without turning the page into marketing copy.

## Holdings

The holdings page should keep its table-first utility while matching the Clean Broker style. Rows should clearly link to asset detail pages.

Important columns:

- Symbol and display name.
- Quantity.
- Average cost.
- Cost basis.
- Last price.
- Market value.
- Unrealized P&L.
- Weight.

For DR instruments, add an indicator that the holding has DR metadata and can show parent-stock equivalent analytics on the detail page.

## Transactions

The transaction page should keep the existing simple buy/sell form and fee input. The redesign should improve spacing, contrast, and Thai labels, but not add cash tracking or unnecessary workflows.

Transaction form labels should be Thai-first:

- หลักทรัพย์
- วันที่ซื้อขาย
- ประเภท
- จำนวน
- ราคา
- ค่าธรรมเนียม
- หมายเหตุ

Validation messages should also be Thai where practical.

## Asset Detail Session

The existing `/assets/[symbol]` route becomes the per-stock detail session. Users should be able to click a holding and quickly answer: how is this stock doing for me?

Asset detail content:

- Back link to holdings.
- Symbol, display name, market, currency, instrument type.
- Latest price and freshness.
- Quantity.
- Average cost.
- Market value.
- Unrealized P&L.
- Realized P&L.
- Total fees.
- First trade and latest trade dates.
- Price/performance chart.
- Average-cost reference line.
- Recent trade history for that instrument.

For non-DR assets, show price performance against average cost and optionally benchmark context when data is available.

## DR Equivalent Analytics

For instruments with `instrumentType = "DR"`, the asset detail page should show how the DR price maps to the parent stock.

Concept:

`DR price x DR units per parent share / FX rate = implied parent-stock price`

Example:

`฿79.15 x 100 / 35.72 = $221.64 per AAPL`

DR detail should show:

- Parent symbol, such as `AAPL`.
- DR ratio, such as `100 DR = 1 AAPL`.
- DR currency, such as `THB`.
- Parent currency, such as `USD`.
- FX symbol/source, such as `USDTHB=X`.
- Current DR price.
- Current implied parent-stock price.
- Average DR cost.
- Average implied parent-stock cost.
- Parent market price if available.
- Premium/discount between implied parent price and parent market price.

V1 data model:

- Add nullable DR metadata fields to `instruments`, rather than encoding this in notes.
- Use the same market-data provider/cache pattern for parent instrument price and FX data where practical.
- Seed `AAPL80` with parent metadata so the app has one working DR example. AAPL80 should use `drRatio = 1000`.

Add these nullable fields to `instruments`:

- `underlyingSymbol`
- `underlyingDisplayName`
- `underlyingCurrency`
- `underlyingProviderSymbol`
- `drRatio`
- `fxProviderSymbol`

`drRatio` means the number of DR units equivalent to one parent share. For example, if `1,000 AAPL80 = 1 AAPL`, then `drRatio = 1000`.

DR calculations:

- `impliedParentPrice = drPrice * drRatio / fxRate`
- `averageImpliedParentCost = averageDrCost * drRatio / fxRate`
- `premiumDiscount = impliedParentPrice / parentMarketPrice - 1`

If the parent symbol, ratio, FX rate, or parent price is missing, the UI must show a partial Thai explanation instead of calculating with assumptions.

## Data Flow

Theme and language:

- Client shell reads local preference after hydration.
- Defaults are light mode and Thai.
- Components receive current language through a small local UI preference layer or translation helper.

Market and portfolio data:

- Existing server functions continue to calculate positions from transactions.
- Asset detail extends the existing asset snapshot with optional DR equivalent data.
- DR calculations should be null-safe. If parent price or FX is missing, show partial calculation details and a clear Thai pending state instead of guessing.

## Error And Empty States

All missing-data states should explain what is missing in plain Thai.

Examples:

- No quote yet: `ยังไม่มีราคาล่าสุด`
- Missing FX: `ยังไม่มีอัตราแลกเปลี่ยนสำหรับคำนวณราคาเทียบหุ้นแม่`
- Missing parent price: `ยังไม่มีราคาหุ้นแม่สำหรับเทียบ premium/discount`
- No transactions: `ยังไม่มี transaction สำหรับหุ้นนี้`

The app must not imply a DR premium/discount unless both implied parent price and parent market price are available.

## Testing And Verification

No new tests are requested for this design. Verification for implementation should include:

- `npm run lint`
- `npm run build`
- `npm run db:migrate`
- Browser check for Dashboard, Holdings, Transactions, and Asset Detail.
- Manual browser check for theme toggle persistence.
- Manual browser check for `TH / EN` toggle behavior.
- Manual browser check that DR detail handles complete and missing DR data.

## Out Of Scope

- Cash balance tracking.
- Broker import.
- Multi-user accounts.
- Cloud sync.
- Advanced tax reporting.
- Full i18n framework unless implementation shows the lightweight translation helper is insufficient.
