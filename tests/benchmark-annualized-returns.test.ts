import assert from "node:assert/strict";
import test from "node:test";
import { getAnnualizedReturns } from "../src/components/benchmark-chart/chart-helpers";
import type { IndexedPerformancePoint } from "../src/lib/portfolio/performance-series";

function createTwrPoint(
  date: string,
  portfolioIndex: number,
  benchmarkIndex: number,
): IndexedPerformancePoint {
  return { date, portfolioIndex, benchmarkIndex };
}

test("getAnnualizedReturns annualizes a one-year TWR window per side", () => {
  const result = getAnnualizedReturns([
    createTwrPoint("2025-01-01T00:00:00.000Z", 100, 100),
    createTwrPoint("2026-01-01T00:00:00.000Z", 120, 110),
  ]);

  // 365-day window, so the cumulative TWR equals the annualized rate.
  assert.equal(result.portfolio, 20);
  assert.equal(result.benchmark, 10);
});

test("getAnnualizedReturns compounds multi-year windows down to a per-year rate", () => {
  const result = getAnnualizedReturns([
    createTwrPoint("2024-01-01T00:00:00.000Z", 100, 100),
    createTwrPoint("2026-01-01T00:00:00.000Z", 144, 100),
  ]);

  // 731 days (incl. leap day) ~= 2 years: 144/100 -> ~20%/yr, flat benchmark -> ~0.
  assert.ok(result.portfolio != null && Math.abs(result.portfolio - 20) < 0.2);
  assert.ok(result.benchmark != null && Math.abs(result.benchmark) < 0.001);
});

test("getAnnualizedReturns suppresses windows shorter than 30 days", () => {
  const result = getAnnualizedReturns([
    createTwrPoint("2026-01-01T00:00:00.000Z", 100, 100),
    createTwrPoint("2026-01-20T00:00:00.000Z", 110, 105),
  ]);

  assert.deepEqual(result, { benchmark: null, portfolio: null });
});

test("getAnnualizedReturns returns nulls without at least two points", () => {
  assert.deepEqual(getAnnualizedReturns([]), { benchmark: null, portfolio: null });
  assert.deepEqual(getAnnualizedReturns([createTwrPoint("2026-01-01T00:00:00.000Z", 100, 100)]), {
    benchmark: null,
    portfolio: null,
  });
});
