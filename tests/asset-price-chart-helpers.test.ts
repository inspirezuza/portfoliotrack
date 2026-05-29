import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMEFRAME_OPTIONS,
  buildAssetChartData,
  calculatePercentChange,
  getPaddedDomain,
  getRangeStats,
  getSelectionPoints,
  getTimeframeStartDate,
  getUnavailableMessage,
  getVisibleHistory,
  hasSelectionSpan,
  type ChartPoint,
  type SelectionRange,
} from "../src/components/asset-price-chart/helpers";
import type { AssetDetail } from "../src/server/assets";

type PricePoint = AssetDetail["marketData"]["priceHistory"][number];

function createPricePoint(
  date: string,
  close: number,
  interval?: PricePoint["interval"],
): PricePoint {
  return { close, date, interval };
}

function createChartPoint(date: string, close: number): ChartPoint {
  const timestamp = Date.parse(date);

  return {
    changeFromRangeStart: null,
    close,
    date,
    timestamp,
  };
}

test("asset price chart helpers preserve timeframe options and unavailable copy", () => {
  assert.deepEqual(
    TIMEFRAME_OPTIONS.map((option) => option.key),
    ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "START", "ALL"],
  );
  assert.deepEqual(
    TIMEFRAME_OPTIONS.map((option) => option.label),
    ["1D", "5D", "1W", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "Start", "All"],
  );
  assert.equal(
    getUnavailableMessage({ marketData: { historyUnavailableReason: "Provider cooldown" } }),
    "Provider cooldown",
  );
  assert.equal(
    getUnavailableMessage({ marketData: { historyUnavailableReason: null } }),
    "No price history is available for this chart yet.",
  );
});

test("asset price chart timeframe helpers preserve start dates and history fallbacks", () => {
  const history = [
    createPricePoint("2025-12-31T10:00:00.000Z", 90, "1h"),
    createPricePoint("2026-01-05T10:00:00.000Z", 100, "1h"),
    createPricePoint("2026-01-05T10:05:00.000Z", 101, "5m"),
    createPricePoint("2026-01-05T10:10:00.000Z", 102, "5m"),
    createPricePoint("2026-01-06", 110, "1d"),
    createPricePoint("2026-01-07", 120, "1d"),
  ];

  assert.equal(
    getTimeframeStartDate("START", "2026-01-07", "2025-12-31"),
    "2025-12-31T00:00:00.000Z",
  );
  assert.equal(
    getTimeframeStartDate("START", "2026-01-07", "2025-12-31T10:00:00.000Z"),
    "2025-12-31T10:00:00.000Z",
  );
  assert.equal(getTimeframeStartDate("YTD", "2026-01-07", null), "2026-01-01T00:00:00.000Z");
  assert.equal(getTimeframeStartDate("ALL", "2026-01-07", null), null);
  assert.deepEqual(
    getVisibleHistory(history, "1D", null).map((point) => point.date),
    ["2026-01-06", "2026-01-07"],
  );
  assert.deepEqual(
    getVisibleHistory(history.slice(0, 4), "1D", null).map((point) => point.date),
    ["2026-01-05T10:05:00.000Z", "2026-01-05T10:10:00.000Z"],
  );
  assert.deepEqual(
    getVisibleHistory(history, "START", "2026-01-06").map((point) => point.date),
    ["2026-01-06", "2026-01-07"],
  );
});

test("asset price chart data helpers preserve range stats and padded domains", () => {
  const chartData = buildAssetChartData([
    createPricePoint("2026-01-01", 100, "1d"),
    createPricePoint("2026-01-02", 110, "1d"),
    createPricePoint("2026-01-03", 105, "1d"),
  ]);
  const stats = getRangeStats(chartData);

  assert.equal(calculatePercentChange(100, 110), 10);
  assert.equal(calculatePercentChange(0, 110), null);
  assert.deepEqual(
    chartData.map((point) => ({
      changeFromRangeStart: point.changeFromRangeStart,
      close: point.close,
      date: point.date,
      timestamp: point.timestamp,
    })),
    [
      { changeFromRangeStart: 0, close: 100, date: "2026-01-01", timestamp: 1767225600000 },
      { changeFromRangeStart: 10, close: 110, date: "2026-01-02", timestamp: 1767312000000 },
      { changeFromRangeStart: 5, close: 105, date: "2026-01-03", timestamp: 1767398400000 },
    ],
  );
  assert.equal(stats?.firstPoint.date, "2026-01-01");
  assert.equal(stats?.latestPoint.date, "2026-01-03");
  assert.equal(stats?.highPoint.date, "2026-01-02");
  assert.equal(stats?.lowPoint.date, "2026-01-01");
  assert.equal(stats?.percentChange, 5);
  assert.deepEqual(getPaddedDomain([100, 110]), [98.8, 111.2]);
  assert.deepEqual(getPaddedDomain([100, Number.NaN]), [95, 105]);
  assert.equal(getPaddedDomain([Number.NaN]), undefined);
});

test("asset price chart selection helpers preserve reversed drag behavior", () => {
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
