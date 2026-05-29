import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAbsoluteReturn,
  formatChartDate,
  formatModeValue,
  formatPerformanceMoney,
  formatSeriesPointValue,
  getBenchmarkDisplayState,
  getBenchmarkModeCopy,
  getSeriesChangeValue,
  getShouldShowPrimaryBenchmarkLine,
  getValueClassName,
} from "../src/components/benchmark-chart/formatting";
import { getUiCopy } from "../src/lib/ui/copy";
import type { ChartPoint } from "../src/components/benchmark-chart/types";

function createChartPoint(overrides: Partial<ChartPoint> = {}): ChartPoint {
  return {
    benchmarkChangeFromRangeStart: null,
    benchmarkDisplay: 110,
    benchmarkDrawdown: -3,
    benchmarkRaw: 110,
    benchmarkReturn: 10,
    benchmarkReturnPercent: 10,
    date: "2026-05-15T10:30:00.000Z",
    gap: 2,
    annualized: false,
    portfolioChangeFromRangeStart: null,
    portfolioDisplay: 112,
    portfolioDrawdown: -5,
    portfolioRaw: 112,
    portfolioReturn: 12,
    portfolioReturnPercent: 12,
    time: Date.parse("2026-05-15T10:30:00.000Z"),
    timestamp: Date.parse("2026-05-15T10:30:00.000Z"),
    ...overrides,
  };
}

test("formatChartDate preserves UTC date and intraday detail", () => {
  assert.equal(formatChartDate("2026-05-15T10:30:00.000Z", "en-US"), "May 15, 2026, 10:30 AM");
  assert.equal(formatChartDate("2026-05-15", "en-US"), "May 15, 2026");
});

test("money and return formatters preserve empty and signed display behavior", () => {
  assert.equal(formatPerformanceMoney(null, "USD", "en-US"), "-");
  assert.equal(formatPerformanceMoney(1234.56, "USD", "en-US"), "$1,234.56");
  assert.equal(formatAbsoluteReturn(null, "en-US"), "-");
  assert.equal(formatAbsoluteReturn(0.1234, "en-US"), "12.3%");
  assert.equal(formatModeValue(12.345, "INDEXED", "en-US"), "12.3%");
  assert.equal(formatModeValue(12.345, "GAP", "en-US"), "+12.35 pp");
  assert.equal(formatModeValue(-1.2, "DRAWDOWN", "en-US"), "-1.20%");
});

test("series value helpers select the display value for each chart mode", () => {
  const point = createChartPoint();

  assert.equal(getSeriesChangeValue(point, "portfolio", "INDEXED"), 12);
  assert.equal(getSeriesChangeValue(point, "benchmark", "INDEXED"), 10);
  assert.equal(getSeriesChangeValue(point, "portfolio", "GAP"), 2);
  assert.equal(getSeriesChangeValue(point, "benchmark", "GAP"), 0);
  assert.equal(getSeriesChangeValue(point, "portfolio", "DRAWDOWN"), -5);
  assert.equal(getSeriesChangeValue(point, "benchmark", "DRAWDOWN"), -3);
  assert.equal(formatSeriesPointValue(2, "GAP", "en-US"), "+2.00 pp");
});

test("value tone class only marks non-zero values", () => {
  assert.equal(getValueClassName(null), "");
  assert.equal(getValueClassName(0), "");
  assert.equal(getValueClassName(1), "value-positive");
  assert.equal(getValueClassName(-1), "value-negative");
});

test("benchmark display helpers preserve mode copy and primary benchmark visibility", () => {
  const copy = getUiCopy("EN").charts.benchmark;

  assert.deepEqual(getBenchmarkModeCopy({ copy, mode: "INDEXED", returnBasis: "TWR" }), {
    portfolioName: "Portfolio TWR",
    benchmarkName: "Benchmark return",
    yAxisLabel: "TWR",
  });
  assert.deepEqual(getBenchmarkModeCopy({ copy, mode: "GAP", returnBasis: "ABSOLUTE" }), {
    portfolioName: "Portfolio gap",
    benchmarkName: "Benchmark baseline",
    yAxisLabel: "Gap",
  });
  assert.equal(
    getShouldShowPrimaryBenchmarkLine({
      mode: "INDEXED",
      shouldShowOverlayComparisons: true,
    }),
    false,
  );
  assert.equal(
    getShouldShowPrimaryBenchmarkLine({
      mode: "GAP",
      shouldShowOverlayComparisons: true,
    }),
    true,
  );
  assert.deepEqual(
    getBenchmarkDisplayState({
      copy,
      mode: "INDEXED",
      returnBasis: "TWR",
      shouldShowOverlayComparisons: true,
    }),
    {
      modeCopy: {
        portfolioName: "Portfolio TWR",
        benchmarkName: "Benchmark return",
        yAxisLabel: "TWR",
      },
      shouldShowPrimaryBenchmarkLine: false,
    },
  );
});
