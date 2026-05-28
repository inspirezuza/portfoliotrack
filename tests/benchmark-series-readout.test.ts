import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkSeriesReadout } from "../src/components/benchmark-chart/series-readout";
import type { ChartPoint } from "../src/components/benchmark-chart/types";
import type { BenchmarkComparisonPickerItem } from "../src/components/benchmark-comparison-picker";
import type { DashboardBenchmarkOverlay } from "../src/server/dashboard";

function createChartPoint(overrides: Partial<ChartPoint> = {}): ChartPoint {
  return {
    benchmarkChangeFromRangeStart: null,
    benchmarkDisplay: 8,
    benchmarkDrawdown: 0,
    benchmarkIndex: 108,
    benchmarkRaw: 108,
    benchmarkReturn: 8,
    date: "2026-05-29",
    gap: 4.5,
    portfolioChangeFromRangeStart: null,
    portfolioDisplay: 12.5,
    portfolioDrawdown: 0,
    portfolioIndex: 112.5,
    portfolioRaw: 112.5,
    portfolioReturn: 12.5,
    timestamp: Date.UTC(2026, 4, 29),
    ...overrides,
  } as ChartPoint;
}

function createOverlay(symbol: string): DashboardBenchmarkOverlay {
  return {
    currency: "USD",
    displayName: symbol,
    market: "NASDAQ",
    points: [],
    providerSymbol: symbol,
    symbol,
  };
}

function createComparisonItem(symbol: string, color: string): BenchmarkComparisonPickerItem {
  return {
    color,
    currency: "USD",
    displayName: symbol,
    market: "NASDAQ",
    price: 100,
    providerSymbol: symbol,
    returnPercent: 10,
    selected: true,
    symbol,
  };
}

test("benchmark series readout preserves overlay rows and remove labels", () => {
  const html = renderToStaticMarkup(
    createElement(BenchmarkSeriesReadout, {
      benchmarkSymbol: "SPY",
      comparisonItems: [createComparisonItem("QQQ", "#123456")],
      locale: "en-US",
      mode: "INDEXED",
      modeCopy: { benchmarkName: "Benchmark", portfolioName: "Portfolio" },
      onComparisonToggle: () => undefined,
      rangeSummaryLabel: "Range summary",
      readoutPoint: createChartPoint({ overlay_QQQ: 10.25 }),
      removeComparisonLabel: (symbol: string) => `Remove ${symbol}`,
      selectedOverlays: [createOverlay("QQQ")],
      shouldShowOverlayComparisons: true,
    }),
  );

  assert.match(html, /aria-label="Range summary"/);
  assert.match(html, />May 29, 2026</);
  assert.match(html, />Portfolio</);
  assert.match(html, />12\.5%/);
  assert.match(html, />QQQ</);
  assert.match(html, /background-color:#123456/);
  assert.match(html, /aria-label="Remove QQQ"/);
  assert.doesNotMatch(html, />SPY</);
});

test("benchmark series readout preserves primary benchmark row outside overlay mode", () => {
  const html = renderToStaticMarkup(
    createElement(BenchmarkSeriesReadout, {
      benchmarkSymbol: "SPY",
      comparisonItems: [],
      locale: "en-US",
      mode: "GAP",
      modeCopy: { benchmarkName: "Benchmark", portfolioName: "Portfolio" },
      onComparisonToggle: () => undefined,
      rangeSummaryLabel: "Range summary",
      readoutPoint: createChartPoint(),
      removeComparisonLabel: (symbol: string) => `Remove ${symbol}`,
      selectedOverlays: [],
      shouldShowOverlayComparisons: false,
    }),
  );

  assert.match(html, />Portfolio</);
  assert.match(html, />Benchmark</);
  assert.match(html, />\+8\.00 pp</);
  assert.doesNotMatch(html, /chart-series-remove-button/);
});
