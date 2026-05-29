import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getUiCopy } from "../src/lib/ui/copy";
import type { ChartPoint } from "../src/components/benchmark-chart/types";

const require = createRequire(import.meta.url);

require.extensions[".css"] = (module) => {
  module.exports = {};
};

function createChartPoint(overrides: Partial<ChartPoint> = {}): ChartPoint {
  return {
    benchmarkChangeFromRangeStart: null,
    benchmarkDisplay: 108,
    benchmarkDrawdown: 0,
    benchmarkIndex: 108,
    benchmarkRaw: 108,
    benchmarkReturn: 8,
    date: "2026-05-29",
    gap: 4.5,
    portfolioChangeFromRangeStart: null,
    portfolioDisplay: 112.5,
    portfolioDrawdown: 0,
    portfolioIndex: 112.5,
    portfolioRaw: 112.5,
    portfolioReturn: 12.5,
    timestamp: Date.UTC(2026, 4, 29),
    ...overrides,
  } as ChartPoint;
}

test("benchmark chart plot preserves shell, readout, selection readout, and picker", async () => {
  const { BenchmarkChartPlot } = await import("../src/components/benchmark-chart/chart-plot");
  const readoutPoint = createChartPoint({ overlay_QQQ: 10.25 });
  const html = renderToStaticMarkup(
    createElement(BenchmarkChartPlot, {
      benchmarkSymbol: "SPY",
      chartData: [readoutPoint],
      chartRenderKey: 1,
      comparisonItems: [
        {
          color: "#123456",
          currency: "USD",
          displayName: "QQQ",
          market: "NASDAQ",
          price: 100,
          providerSymbol: "QQQ",
          returnPercent: 10,
          selected: true,
          symbol: "QQQ",
        },
      ],
      copy: getUiCopy("EN").charts,
      hasActiveSelection: false,
      language: "EN",
      locale: "en-US",
      mode: "INDEXED",
      modeCopy: { benchmarkName: "Benchmark", portfolioName: "Portfolio" },
      onChartMouseDown: () => undefined,
      onChartMouseLeave: () => undefined,
      onChartMouseMove: () => undefined,
      onChartMouseUp: () => undefined,
      onComparisonAdd: () => undefined,
      onComparisonClear: () => undefined,
      onComparisonToggle: () => undefined,
      readoutPoint,
      returnBasis: "TWR",
      selectedBenchmarkChange: null,
      selectedGap: null,
      selectedOverlays: [
        {
          currency: "USD",
          displayName: "QQQ",
          market: "NASDAQ",
          points: [],
          providerSymbol: "QQQ",
          symbol: "QQQ",
        },
      ],
      selectedPortfolioChange: null,
      selectedSymbols: ["QQQ"],
      selection: null,
      selectionPoints: null,
      shouldShowOverlayComparisons: true,
      shouldShowPrimaryBenchmarkLine: true,
      xAxisSpan: 0,
      xAxisTicks: [readoutPoint.timestamp],
      xDomain: [readoutPoint.timestamp, readoutPoint.timestamp],
      yAxis: { domain: [0, 120], ticks: [0, 60, 120] },
    }),
  );

  assert.match(html, /class="chart-shell"/);
  assert.match(html, /Benchmark comparison range summary/);
  assert.match(html, /Drag across the chart to compare/);
  assert.match(html, /Benchmark comparison overlays/);
  assert.match(html, /Remove QQQ comparison/);
});
