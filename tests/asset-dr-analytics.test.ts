import assert from "node:assert/strict";
import test from "node:test";
import { buildDrAnalyticsSnapshot, shouldExposeDrAnalytics } from "@/server/assets/dr-analytics";
import type { Instrument } from "@/lib/db/schema";
import type { MarketQuoteSnapshot } from "@/lib/market/types";

function instrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    id: 1,
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "SET",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
    underlyingSymbol: "AAPL",
    underlyingDisplayName: "Apple Inc.",
    underlyingCurrency: "USD",
    underlyingProviderSymbol: "AAPL",
    drRatio: 80,
    fxProviderSymbol: "USDTHB=X",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function quote(overrides: Partial<MarketQuoteSnapshot>): MarketQuoteSnapshot {
  return {
    providerSymbol: "AAPL",
    price: 160,
    currency: "USD",
    asOf: "2026-05-28T10:00:00.000Z",
    source: "test",
    ...overrides,
  };
}

test("DR analytics expose metadata-backed instruments and calculate parent premium", () => {
  const result = buildDrAnalyticsSnapshot({
    analyticsIssue: null,
    averageDrCost: 68,
    drPrice: 72,
    fxQuote: quote({
      providerSymbol: "USDTHB=X",
      price: 36,
      currency: "THB",
      source: "fx",
    }),
    instrument: instrument(),
    parentQuote: quote({ price: 150, source: "parent" }),
  });

  assert.equal(shouldExposeDrAnalytics(instrument({ instrumentType: "Stock" })), true);
  assert.equal(result?.parentMarketPrice, 150);
  assert.equal(result?.fxRate, 36);
  assert.equal(result?.impliedParentPrice, 160);
  assert.equal(result?.averageImpliedParentCost, 151.11);
  assert.equal(result?.premiumDiscount, 160 / 150 - 1);
  assert.equal(result?.analyticsIssue, null);
});

test("DR analytics preserve incomplete metadata issue without live quotes", () => {
  const result = buildDrAnalyticsSnapshot({
    analyticsIssue: "DR metadata is incomplete, so parent and FX analytics are unavailable.",
    averageDrCost: 68,
    drPrice: 72,
    fxQuote: null,
    instrument: instrument({ fxProviderSymbol: null }),
    parentQuote: null,
  });

  assert.equal(result?.fxProviderSymbol, null);
  assert.equal(result?.parentMarketPrice, null);
  assert.equal(result?.impliedParentPrice, null);
  assert.equal(
    result?.analyticsIssue,
    "DR metadata is incomplete, so parent and FX analytics are unavailable.",
  );
  assert.equal(
    shouldExposeDrAnalytics(
      instrument({
        drRatio: null,
        fxProviderSymbol: null,
        instrumentType: "Stock",
        underlyingCurrency: null,
        underlyingDisplayName: null,
        underlyingProviderSymbol: null,
        underlyingSymbol: null,
      }),
    ),
    false,
  );
});
