import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAgeLabel,
  formatCacheDateLabel,
  formatCacheDateParts,
  formatNetInvestedDetail,
  formatRealizedMoney,
  formatSummaryMoney,
  formatUnrealizedPnlDetail,
  getValueTone,
} from "../src/components/dashboard-page/formatting";
import { getUiCopy } from "../src/lib/ui/copy";
import type { DashboardSummary } from "../src/server/dashboard";
import type { CurrencyBreakdown } from "../src/server/holdings";

function createSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  const summary: DashboardSummary = {
    awaitingPriceSymbols: [],
    currencyBreakdown: [],
    latestPriceAsOf: null,
    missingPricePositionCount: 0,
    openPositionCount: 1,
    openPositionCurrency: "USD",
    pricedPositionCount: 1,
    realizedBreakdown: [],
    totalCostBasis: 100,
    totalMarketValue: 125,
    totalRealizedPnl: 10,
    totalUnrealizedPnl: 25,
  };

  return { ...summary, ...overrides };
}

function createCurrencyBreakdown(overrides: Partial<CurrencyBreakdown>): CurrencyBreakdown {
  return {
    awaitingPriceSymbols: [],
    currency: "USD",
    missingPricePositionCount: 0,
    openPositionCount: 1,
    pricedPositionCount: 1,
    totalCostBasis: 1,
    totalFees: 0,
    totalMarketValue: 1,
    totalRealizedPnl: 0,
    totalUnrealizedPnl: 0,
    ...overrides,
  };
}

test("dashboard page date formatters preserve cache labels and age copy", () => {
  const copy = getUiCopy("EN").dashboard;

  assert.equal(formatAgeLabel(null, copy), "No cached data");
  assert.equal(formatAgeLabel(0, copy), "Just updated");
  assert.equal(formatAgeLabel(12, copy), "12 min ago");
  assert.equal(formatAgeLabel(125, copy), "2h ago");

  assert.deepEqual(formatCacheDateParts(null, "en-US", "No cache"), {
    date: "No cache",
    time: null,
  });
  assert.deepEqual(formatCacheDateParts("2026-05-29", "en-US", "No cache"), {
    date: "May 29, 2026",
    time: "12:00 AM",
  });
  assert.equal(formatCacheDateLabel("bad-date", "en-US", "No cache"), "bad-date");
});

test("dashboard page summary formatters preserve money fallbacks and tones", () => {
  const copy = getUiCopy("EN");

  assert.equal(
    formatSummaryMoney(createSummary(), "totalMarketValue", "en-US", copy.shared),
    "$125.00",
  );
  assert.equal(
    formatSummaryMoney(
      createSummary({
        currencyBreakdown: [
          createCurrencyBreakdown({ currency: "USD" }),
          createCurrencyBreakdown({ currency: "THB" }),
        ],
        totalMarketValue: null,
      }),
      "totalMarketValue",
      "en-US",
      copy.shared,
    ),
    "Mixed",
  );
  assert.match(
    formatRealizedMoney(createSummary({ totalRealizedPnl: null }), "en-US", copy.shared),
    /THB\s0\.00/,
  );
  assert.equal(
    formatUnrealizedPnlDetail(createSummary(), "en-US", copy.dashboard),
    "+25.00% vs cost basis",
  );
  assert.equal(getValueTone(5), "positive");
  assert.equal(getValueTone(-5), "negative");
  assert.equal(getValueTone(0), "neutral");
});

test("dashboard page net invested detail preserves fallback and signed ratios", () => {
  assert.equal(
    formatNetInvestedDetail({
      fallback: "Closed trades",
      label: "net invested",
      locale: "en-US",
      netInvested: 200,
      signed: true,
      value: 20,
    }),
    "+10.00% / net invested",
  );
  assert.equal(
    formatNetInvestedDetail({
      fallback: "All transactions",
      label: "net invested",
      locale: "en-US",
      netInvested: 0,
      value: 20,
    }),
    "All transactions",
  );
});
