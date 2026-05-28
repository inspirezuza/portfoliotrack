import assert from "node:assert/strict";
import test from "node:test";
import {
  PERFORMANCE_MODE_OPTIONS,
  RETURN_BASIS_OPTIONS,
  TIMEFRAME_OPTIONS,
  getSelectionPoints,
  getVisibleSeries,
  hasSelectionSpan,
  type SelectionRange,
} from "../src/components/benchmark-chart/chart-selection";
import type { ActivePerformancePoint, ChartPoint } from "../src/components/benchmark-chart/types";

type TestInterval = ActivePerformancePoint["interval"];

function createPerformancePoint(
  date: string,
  interval: TestInterval = undefined,
): ActivePerformancePoint {
  return {
    benchmarkIndex: 100,
    benchmarkReturnPercent: 0,
    date,
    interval,
    portfolioIndex: 100,
    portfolioReturnPercent: 0,
  };
}

function createChartPoint(date: string): ChartPoint {
  const time = Date.parse(date);

  return {
    benchmarkChangeFromRangeStart: null,
    benchmarkDisplay: 100,
    benchmarkDrawdown: 0,
    benchmarkRaw: 100,
    benchmarkReturn: 0,
    benchmarkReturnPercent: 0,
    date,
    gap: 0,
    annualized: false,
    portfolioChangeFromRangeStart: null,
    portfolioDisplay: 100,
    portfolioDrawdown: 0,
    portfolioRaw: 100,
    portfolioReturn: 0,
    portfolioReturnPercent: 0,
    time,
    timestamp: time,
  };
}

test("benchmark chart option lists preserve visible control ordering", () => {
  assert.deepEqual(TIMEFRAME_OPTIONS, ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "ALL"]);
  assert.deepEqual(PERFORMANCE_MODE_OPTIONS, ["INDEXED", "GAP", "DRAWDOWN"]);
  assert.deepEqual(RETURN_BASIS_OPTIONS, ["TWR", "MWR", "ABSOLUTE"]);
});

test("benchmark chart selection helpers preserve timeframe and reversed drag behavior", () => {
  const series = [
    createPerformancePoint("2026-01-01T00:00:00.000Z"),
    createPerformancePoint("2026-05-01T00:00:00.000Z"),
    createPerformancePoint("2026-05-27T00:00:00.000Z"),
  ];
  const visibleSeries = getVisibleSeries(series, "1M");

  assert.deepEqual(
    visibleSeries.map((point) => point.date),
    ["2026-05-01T00:00:00.000Z", "2026-05-27T00:00:00.000Z"],
  );

  const chartData = series.map((point) => createChartPoint(point.date));
  const reversedSelection: SelectionRange = {
    startDate: "2026-05-27T00:00:00.000Z",
    endDate: "2026-05-01T00:00:00.000Z",
  };
  const points = getSelectionPoints(chartData, reversedSelection);

  assert.equal(points?.startPoint.date, "2026-05-01T00:00:00.000Z");
  assert.equal(points?.endPoint.date, "2026-05-27T00:00:00.000Z");
  assert.equal(hasSelectionSpan(points), true);
  assert.equal(
    hasSelectionSpan(
      getSelectionPoints(chartData, {
        startDate: "2026-05-27T00:00:00.000Z",
        endDate: "2026-05-27T00:00:00.000Z",
      }),
    ),
    false,
  );
  assert.equal(getSelectionPoints(chartData, null), null);
});
