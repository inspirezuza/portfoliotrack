import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePeriodPerformance,
  getHoldingPerformanceTimeframeStartDate,
} from "@/server/holdings/period-performance";
import type { HistoricalPrice } from "@/lib/db/schema";

function createHistoricalPrice(overrides: Partial<HistoricalPrice>): HistoricalPrice {
  return {
    close: 10,
    createdAt: "2026-05-01T10:00:00.000Z",
    currency: "USD",
    id: 1,
    instrumentId: 1,
    priceDate: "2026-05-01",
    source: "manual",
    ...overrides,
  };
}

test("holding performance timeframe start dates preserve month-end and YTD behavior", () => {
  assert.equal(getHoldingPerformanceTimeframeStartDate("1W", "2026-03-31"), "2026-03-24");
  assert.equal(getHoldingPerformanceTimeframeStartDate("1M", "2026-03-31"), "2026-02-28");
  assert.equal(getHoldingPerformanceTimeframeStartDate("1Y", "2024-02-29"), "2023-02-28");
  assert.equal(getHoldingPerformanceTimeframeStartDate("YTD", "2026-03-31"), "2026-01-01");
});

test("holding period performance preserves earliest MAX and valuation conversion", () => {
  assert.deepEqual(
    calculatePeriodPerformance({
      fxRateToValuationCurrency: 35,
      historicalRows: [
        createHistoricalPrice({ close: 8, priceDate: "2026-01-01" }),
        createHistoricalPrice({ close: 10, priceDate: "2026-05-01" }),
      ],
      lastPrice: 12,
      latestDate: "2026-05-15",
      priceCurrency: "USD",
      quantity: 10,
      timeframe: "MAX",
    }),
    {
      amount: 40,
      amountInValuationCurrency: 1400,
      percent: 0.5,
    },
  );
});
