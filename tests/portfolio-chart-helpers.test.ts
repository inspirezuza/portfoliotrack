import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMEFRAME_OPTIONS,
  buildPortfolioChartData,
  calculatePercentChange,
  formatAxisValue,
  formatChartDate,
  formatChartValue,
  formatSignedPercent,
  getPaddedDomain,
  getRangeStats,
  getSelectionPoints,
  getTimeframeStartDate,
  getUnavailableMessage,
  getVisibleSeries,
  hasSelectionSpan,
  type ChartPoint,
  type SelectionRange,
} from "../src/components/portfolio-chart/helpers";
import { getUiCopy } from "../src/lib/ui/copy";
import type { PortfolioTimelinePoint } from "../src/lib/portfolio/timeline";

function createTimelinePoint(
  date: string,
  value: number,
  interval?: PortfolioTimelinePoint["interval"],
): PortfolioTimelinePoint {
  return { date, interval, value };
}

function createChartPoint(date: string, value: number): ChartPoint {
  const timestamp = Date.parse(date);

  return {
    changeFromRangeStart: null,
    date,
    timestamp,
    value,
  };
}

test("portfolio chart helper formatters preserve display copy", () => {
  const copy = getUiCopy("EN").charts.portfolio;

  assert.deepEqual(TIMEFRAME_OPTIONS, ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "ALL"]);
  assert.equal(formatChartDate("2026-01-05", "en-US"), "Jan 5, 2026");
  assert.equal(formatChartValue(1234.56, "USD", "en-US"), "$1,235");
  assert.equal(formatChartValue(12.345, "USD", "en-US"), "$12.35");
  assert.equal(formatChartValue(1234.56, null, "en-US"), "1,235");
  assert.equal(formatAxisValue(1_250_000, "en-US"), "1M");
  assert.equal(formatSignedPercent(1.234), "+1.23%");
  assert.equal(formatSignedPercent(-1.234), "-1.23%");
  assert.equal(getUnavailableMessage("mixed-currency", copy), copy.unavailable.mixedCurrency);
});

test("portfolio chart timeframe helpers preserve intraday and daily fallbacks", () => {
  const series = [
    createTimelinePoint("2025-12-31T10:00:00.000Z", 90, "1h"),
    createTimelinePoint("2026-01-05T10:00:00.000Z", 100, "1h"),
    createTimelinePoint("2026-01-05T10:05:00.000Z", 101, "5m"),
    createTimelinePoint("2026-01-05T10:10:00.000Z", 102, "5m"),
    createTimelinePoint("2026-01-06", 110, "1d"),
    createTimelinePoint("2026-01-07", 120, "1d"),
  ];

  assert.equal(getTimeframeStartDate("1D", "2026-01-07"), "2026-01-06T00:00:00.000Z");
  assert.equal(getTimeframeStartDate("YTD", "2026-01-07"), "2026-01-01T00:00:00.000Z");
  assert.equal(getTimeframeStartDate("ALL", "2026-01-07"), null);
  assert.deepEqual(
    getVisibleSeries(series, "1D").map((point) => point.date),
    ["2026-01-06", "2026-01-07"],
  );
  assert.deepEqual(
    getVisibleSeries(series.slice(0, 4), "1D").map((point) => point.date),
    ["2026-01-05T10:05:00.000Z", "2026-01-05T10:10:00.000Z"],
  );
  assert.deepEqual(
    getVisibleSeries(series, "1Y").map((point) => point.date),
    ["2026-01-06", "2026-01-07"],
  );
});

test("portfolio chart data helpers preserve range stats and padded domains", () => {
  const chartData = buildPortfolioChartData([
    createTimelinePoint("2026-01-01", 100, "1d"),
    createTimelinePoint("2026-01-02", 110, "1d"),
    createTimelinePoint("2026-01-03", 105, "1d"),
  ]);
  const stats = getRangeStats(chartData);

  assert.equal(calculatePercentChange(100, 110), 10);
  assert.equal(calculatePercentChange(0, 110), null);
  assert.deepEqual(
    chartData.map((point) => ({
      changeFromRangeStart: point.changeFromRangeStart,
      date: point.date,
      timestamp: point.timestamp,
      value: point.value,
    })),
    [
      { changeFromRangeStart: 0, date: "2026-01-01", timestamp: 1767225600000, value: 100 },
      { changeFromRangeStart: 10, date: "2026-01-02", timestamp: 1767312000000, value: 110 },
      { changeFromRangeStart: 5, date: "2026-01-03", timestamp: 1767398400000, value: 105 },
    ],
  );
  assert.equal(stats?.latestPoint.date, "2026-01-03");
  assert.equal(stats?.highPoint.date, "2026-01-02");
  assert.equal(stats?.lowPoint.date, "2026-01-01");
  assert.equal(stats?.percentChange, 5);
  assert.deepEqual(getPaddedDomain([100, 110]), [98.8, 111.2]);
  assert.deepEqual(getPaddedDomain([100, Number.NaN]), [95, 105]);
  assert.equal(getPaddedDomain([Number.NaN]), undefined);
});

test("portfolio chart selection helpers preserve reversed drag behavior", () => {
  const chartData = [
    createChartPoint("2026-01-01", 100),
    createChartPoint("2026-01-02", 105),
    createChartPoint("2026-01-03", 110),
  ];
  const reversedSelection: SelectionRange = {
    startDate: "2026-01-03",
    endDate: "2026-01-01",
  };
  const points = getSelectionPoints(chartData, reversedSelection);

  assert.equal(points?.startPoint.date, "2026-01-01");
  assert.equal(points?.endPoint.date, "2026-01-03");
  assert.equal(hasSelectionSpan(points), true);
  assert.equal(
    hasSelectionSpan(
      getSelectionPoints(chartData, { startDate: "2026-01-02", endDate: "2026-01-02" }),
    ),
    false,
  );
  assert.equal(getSelectionPoints(chartData, null), null);
});
