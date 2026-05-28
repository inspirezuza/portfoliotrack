import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAbsoluteComparisonSeries,
  buildCashFlowAdjustedComparisonSeries,
  buildMoneyWeightedComparisonSeries,
  type PortfolioValuationPoint,
} from "@/lib/portfolio/timeline-comparison";
import type { TimelineHistoricalPrice, TimelineTransaction } from "@/lib/portfolio/timeline";

const portfolioSeries: PortfolioValuationPoint[] = [
  {
    date: "2025-01-01T00:00:00.000Z",
    interval: "1d",
    netCashFlow: 100,
    value: 100,
  },
  {
    date: "2025-01-10T00:00:00.000Z",
    interval: "1d",
    netCashFlow: 50,
    value: 165,
  },
  {
    date: "2025-02-15T00:00:00.000Z",
    interval: "1d",
    netCashFlow: 0,
    value: 180,
  },
];

const benchmarkRows: TimelineHistoricalPrice[] = [
  { instrumentId: 2, priceDate: "2025-01-01", close: 100, currency: "USD" },
  { instrumentId: 2, priceDate: "2025-01-10", close: 110, currency: "USD" },
  { instrumentId: 2, priceDate: "2025-02-15", close: 120, currency: "USD" },
];

const transactions: TimelineTransaction[] = [
  {
    instrumentId: 1,
    tradeDate: "2025-01-01",
    side: "BUY",
    quantity: 10,
    price: 10,
    fee: 0,
    createdAt: "2025-01-01 09:00:00",
    id: 1,
  },
  {
    instrumentId: 1,
    tradeDate: "2025-01-10",
    side: "BUY",
    quantity: 5,
    price: 10,
    fee: 0,
    createdAt: "2025-01-10 09:00:00",
    id: 2,
  },
];

test("portfolio timeline comparison helpers preserve cash-flow adjusted indexed returns", () => {
  const comparison = buildCashFlowAdjustedComparisonSeries({
    benchmarkRows,
    portfolioSeries,
  });

  assert.deepEqual(comparison, [
    {
      date: "2025-01-01T00:00:00.000Z",
      interval: "1d",
      portfolio: 100,
      benchmark: 100,
    },
    {
      date: "2025-01-10T00:00:00.000Z",
      interval: "1d",
      portfolio: 115,
      benchmark: 110,
    },
    {
      date: "2025-02-15T00:00:00.000Z",
      interval: "1d",
      portfolio: 125.45,
      benchmark: 120,
    },
  ]);
});

test("portfolio timeline comparison helpers preserve absolute and money-weighted returns", () => {
  const absoluteComparison = buildAbsoluteComparisonSeries({
    benchmarkRows,
    portfolioSeries,
  });
  const moneyWeightedComparison = buildMoneyWeightedComparisonSeries({
    benchmarkRows,
    portfolioSeries,
    transactions,
  });

  assert.deepEqual(
    absoluteComparison.map((point) => ({
      annualized: point.annualized,
      benchmarkReturnPercent: point.benchmarkReturnPercent,
      date: point.date,
      portfolioReturnPercent: point.portfolioReturnPercent,
    })),
    [
      {
        annualized: false,
        benchmarkReturnPercent: 0,
        date: "2025-01-01T00:00:00.000Z",
        portfolioReturnPercent: 0,
      },
      {
        annualized: false,
        benchmarkReturnPercent: 10,
        date: "2025-01-10T00:00:00.000Z",
        portfolioReturnPercent: 10,
      },
      {
        annualized: false,
        benchmarkReturnPercent: 20,
        date: "2025-02-15T00:00:00.000Z",
        portfolioReturnPercent: 20,
      },
    ],
  );
  assert.equal(moneyWeightedComparison.length, 1);
  assert.equal(moneyWeightedComparison[0].annualized, true);
  assert.equal(moneyWeightedComparison[0].date, "2025-02-15T00:00:00.000Z");
  assert.ok(moneyWeightedComparison[0].portfolioReturnPercent > 0);
  assert.ok(moneyWeightedComparison[0].benchmarkReturnPercent > 0);
});
