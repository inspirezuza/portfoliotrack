import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBenchmarkComparisonItems,
  getComparisonColor,
  getOverlayDataKey,
  getRoundedPercentAxis,
  getVisibleOverlayPoints,
  mergeOverlays,
  mergeQuotes,
} from "../src/components/benchmark-chart/chart-helpers";
import type { DashboardBenchmarkOverlay, DashboardBenchmarkQuote } from "../src/server/dashboard";
import type { ActivePerformancePoint } from "../src/components/benchmark-chart/types";

function createOverlay(
  providerSymbol: string,
  points: DashboardBenchmarkOverlay["points"] = [],
): DashboardBenchmarkOverlay {
  return {
    currency: "USD",
    displayName: providerSymbol,
    market: "NYSE",
    points,
    providerSymbol,
    symbol: providerSymbol,
  };
}

function createQuote(providerSymbol: string): DashboardBenchmarkQuote {
  return {
    asOf: null,
    currency: "USD",
    dailyChange: null,
    dailyChangePercent: null,
    displayName: providerSymbol,
    market: "NYSE",
    price: null,
    providerSymbol,
    symbol: providerSymbol,
  };
}

function createPerformancePoint(date: string): ActivePerformancePoint {
  return {
    benchmarkIndex: 100,
    benchmarkReturnPercent: 0,
    date,
    portfolioIndex: 100,
    portfolioReturnPercent: 0,
  };
}

test("rounded percent axis uses readable 1, 5, and 10 point steps", () => {
  assert.deepEqual(getRoundedPercentAxis([0.2, 2.8]), {
    domain: [0, 3],
    ticks: [0, 1, 2, 3],
  });

  assert.deepEqual(getRoundedPercentAxis([-8, 11]), {
    domain: [-10, 15],
    ticks: [-10, -5, 0, 5, 10, 15],
  });

  assert.deepEqual(getRoundedPercentAxis([-12, 27]), {
    domain: [-20, 30],
    ticks: [-20, -10, 0, 10, 20, 30],
  });
});

test("rounded percent axis ignores non-finite values and expands flat domains", () => {
  assert.equal(getRoundedPercentAxis([Number.NaN, Number.POSITIVE_INFINITY]), undefined);

  assert.deepEqual(getRoundedPercentAxis([0]), {
    domain: [-1, 1],
    ticks: [-1, 0, 1],
  });
});

test("overlay helpers preserve visible baselines and stable display details", () => {
  const points: DashboardBenchmarkOverlay["points"] = [
    { date: "2025-01-01T00:00:00.000Z", interval: null, value: 100 },
    { date: "2025-01-15T00:00:00.000Z", interval: null, value: 105 },
    { date: "2025-02-01T00:00:00.000Z", interval: null, value: 110 },
  ];

  assert.deepEqual(
    getVisibleOverlayPoints(points, "1M", "2025-02-01T00:00:00.000Z").map((point) => point.date),
    ["2025-01-01T00:00:00.000Z", "2025-01-15T00:00:00.000Z", "2025-02-01T00:00:00.000Z"],
  );

  assert.equal(getOverlayDataKey("BRK.B/US"), "overlay_BRK_B_US");
  assert.equal(getComparisonColor("SPY", 3, "SPY"), "var(--warm)");
  assert.equal(getComparisonColor("QQQ", 7, "SPY"), "#8f5cf7");
});

test("comparison merges replace matching provider symbols without disturbing others", () => {
  assert.deepEqual(
    mergeOverlays([createOverlay("SPY"), createOverlay("QQQ")], createOverlay("SPY", [])),
    [createOverlay("QQQ"), createOverlay("SPY", [])],
  );

  assert.deepEqual(mergeQuotes([createQuote("SPY"), createQuote("QQQ")], createQuote("SPY")), [
    createQuote("QQQ"),
    createQuote("SPY"),
  ]);
});

test("comparison item helper joins overlays, quotes, selection, colors, and returns", () => {
  const spyPoints: DashboardBenchmarkOverlay["points"] = [
    { date: "2026-01-01T00:00:00.000Z", interval: null, value: 100 },
    { date: "2026-01-31T00:00:00.000Z", interval: null, value: 110 },
  ];
  const qqqPoints: DashboardBenchmarkOverlay["points"] = [
    { date: "2026-01-01T00:00:00.000Z", interval: null, value: 200 },
    { date: "2026-01-31T00:00:00.000Z", interval: null, value: 210 },
  ];

  assert.deepEqual(
    buildBenchmarkComparisonItems({
      benchmarkSymbol: "SPY",
      overlays: [createOverlay("SPY", spyPoints), createOverlay("QQQ", qqqPoints)],
      quotes: [{ ...createQuote("SPY"), price: 500 }],
      returnBasis: "TWR",
      selectedSymbols: ["QQQ"],
      visibleOverlayPointsBySymbol: new Map([
        ["SPY", spyPoints],
        ["QQQ", qqqPoints],
      ]),
      visibleSeries: [
        createPerformancePoint("2026-01-01T00:00:00.000Z"),
        createPerformancePoint("2026-01-31T00:00:00.000Z"),
      ],
    }),
    [
      {
        color: "var(--warm)",
        currency: "USD",
        displayName: "SPY",
        market: "NYSE",
        price: 500,
        providerSymbol: "SPY",
        returnPercent: 10,
        selected: false,
        symbol: "SPY",
      },
      {
        color: "#8f5cf7",
        currency: "USD",
        displayName: "QQQ",
        market: "NYSE",
        price: null,
        providerSymbol: "QQQ",
        returnPercent: 5,
        selected: true,
        symbol: "QQQ",
      },
    ],
  );
});
