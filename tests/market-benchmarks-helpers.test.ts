import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBenchmarkChartData,
  buildBenchmarkComparisons,
  compoundReturn,
  filterMonthlyReturnsByTimeframe,
  formatMonthLabel,
  formatPeriodLabel,
  formatSignedPercent,
  formatSignedPercentagePoint,
  getBenchmarkLabel,
  getLatestMonth,
  getTimeframeStartMonth,
  hasBenchmarkChartData,
  hasBenchmarkQuoteData,
} from "@/components/market-benchmarks/helpers";
import type { DashboardBenchmarkMonthlyReturn, DashboardBenchmarkQuote } from "@/server/dashboard";

const monthlyReturns: DashboardBenchmarkMonthlyReturn[] = [
  {
    excessReturnPercent: 1,
    month: "2026-01",
    portfolioReturnPercent: 2,
    returnPercent: 1,
    symbol: "SPYM",
  },
  {
    excessReturnPercent: -1,
    month: "2026-02",
    portfolioReturnPercent: 1,
    returnPercent: 2,
    symbol: "SPYM",
  },
  {
    excessReturnPercent: 3,
    month: "2026-02",
    portfolioReturnPercent: 4,
    returnPercent: 1,
    symbol: "QQQ",
  },
];

const quotes: DashboardBenchmarkQuote[] = [
  {
    asOf: "2026-02-28T12:00:00.000Z",
    currency: "USD",
    dailyChange: 6,
    dailyChangePercent: 1.2,
    displayName: "SPDR S&P 500 ETF",
    market: "US",
    price: 500,
    providerSymbol: "SPY",
    symbol: "SPYM",
  },
  {
    asOf: null,
    currency: "USD",
    dailyChange: null,
    dailyChangePercent: null,
    displayName: "Invesco QQQ",
    market: "US",
    price: null,
    providerSymbol: "QQQ",
    symbol: "QQQ",
  },
];

test("market benchmark helper formatters preserve labels and signed values", () => {
  assert.equal(formatSignedPercent(null), "-");
  assert.equal(formatSignedPercent(1.234), "+1.23%");
  assert.equal(formatSignedPercent(-1.234), "-1.23%");
  assert.equal(formatSignedPercentagePoint(null), "-");
  assert.equal(formatSignedPercentagePoint(2.5), "+2.50 pp");
  assert.equal(formatMonthLabel("2026-02", "en-US"), "Feb 26");
  assert.equal(formatMonthLabel("not-a-month", "en-US"), "not-a-month");
  assert.equal(getBenchmarkLabel("SPYM"), "S&P 500");
  assert.equal(getBenchmarkLabel("QQQ"), "QQQ");
});

test("market benchmark timeframe helpers preserve month filtering and period copy", () => {
  const latestMonth = getLatestMonth(monthlyReturns);

  assert.equal(latestMonth, "2026-02");
  assert.equal(getTimeframeStartMonth("1M", latestMonth), "2026-02");
  assert.equal(getTimeframeStartMonth("3M", latestMonth), "2025-12");
  assert.equal(getTimeframeStartMonth("YTD", latestMonth), "2026-01");
  assert.equal(getTimeframeStartMonth("ALL", latestMonth), null);
  assert.deepEqual(
    filterMonthlyReturnsByTimeframe({
      entries: monthlyReturns,
      latestMonth,
      timeframe: "1M",
    }).map((entry) => `${entry.symbol}:${entry.month}`),
    ["SPYM:2026-02", "QQQ:2026-02"],
  );
  assert.equal(
    formatPeriodLabel({ entries: monthlyReturns.slice(0, 2), locale: "en-US", timeframe: "ALL" }),
    "Jan 26-Feb 26",
  );
  assert.equal(
    formatPeriodLabel({ entries: monthlyReturns.slice(0, 2), locale: "en-US", timeframe: "1M" }),
    "1M - Feb 26",
  );
});

test("market benchmark comparison helpers preserve compounded returns and availability", () => {
  const latestMonth = getLatestMonth(monthlyReturns);
  const comparisons = buildBenchmarkComparisons({
    latestMonth,
    locale: "en-US",
    monthlyReturns,
    quotes,
    timeframe: "ALL",
  });

  assert.equal(Number(compoundReturn([2, 1])?.toFixed(2)), 3.02);
  assert.equal(compoundReturn([null]), null);
  assert.equal(comparisons[0]?.displayName, "S&P 500");
  assert.equal(Number(comparisons[0]?.portfolioReturn?.toFixed(2)), 3.02);
  assert.equal(Number(comparisons[0]?.benchmarkReturn?.toFixed(2)), 3.02);
  assert.equal(Number(comparisons[0]?.gap?.toFixed(2)), 0);
  assert.equal(comparisons[1]?.periodLabel, "Feb 26");
  assert.equal(hasBenchmarkQuoteData(comparisons), true);
});

test("market benchmark chart helpers preserve selected-symbol data and visibility rules", () => {
  const latestMonth = getLatestMonth(monthlyReturns);
  const chartData = buildBenchmarkChartData({
    latestMonth,
    locale: "en-US",
    monthlyReturns,
    selectedSymbol: "SPYM",
    timeframe: "ALL",
  });

  assert.deepEqual(chartData, [
    {
      benchmarkReturn: 1,
      excessReturn: 1,
      label: "Jan 26",
      month: "2026-01",
      portfolioReturn: 2,
    },
    {
      benchmarkReturn: 2,
      excessReturn: -1,
      label: "Feb 26",
      month: "2026-02",
      portfolioReturn: 1,
    },
  ]);
  assert.equal(hasBenchmarkChartData({ chartData, mode: "GAP" }), true);
  assert.equal(hasBenchmarkChartData({ chartData, mode: "RETURN" }), true);
  assert.equal(hasBenchmarkChartData({ chartData: [], mode: "GAP" }), false);
});
