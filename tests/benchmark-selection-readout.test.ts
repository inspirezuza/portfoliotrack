import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkSelectionReadout } from "../src/components/benchmark-chart/selection-readout";
import { getUiCopy } from "../src/lib/ui/copy";
import type { ChartPoint } from "../src/components/benchmark-chart/types";

function createChartPoint(overrides: Partial<ChartPoint> = {}): ChartPoint {
  return {
    benchmarkDisplay: 8,
    benchmarkIndex: 108,
    benchmarkReturn: 8,
    date: "2026-05-29",
    gap: 4.5,
    portfolioDisplay: 12.5,
    portfolioIndex: 112.5,
    portfolioReturn: 12.5,
    timestamp: Date.UTC(2026, 4, 29),
    ...overrides,
  } as ChartPoint;
}

test("benchmark selection readout preserves idle drag prompt", () => {
  const html = renderToStaticMarkup(
    createElement(BenchmarkSelectionReadout, {
      benchmarkSymbol: "SPY",
      copy: getUiCopy("EN").charts,
      hasActiveSelection: false,
      locale: "en-US",
      returnBasis: "TWR",
      selectedBenchmarkChange: null,
      selectedGap: null,
      selectedPortfolioChange: null,
      selectionPoints: null,
    }),
  );

  assert.match(html, /chart-selection-readout-idle/);
  assert.match(html, /Drag across the chart to compare/);
});

test("benchmark selection readout preserves active range values and tones", () => {
  const html = renderToStaticMarkup(
    createElement(BenchmarkSelectionReadout, {
      benchmarkSymbol: "SPY",
      copy: getUiCopy("EN").charts,
      hasActiveSelection: true,
      locale: "en-US",
      returnBasis: "TWR",
      selectedBenchmarkChange: -2,
      selectedGap: 5,
      selectedPortfolioChange: 3,
      selectionPoints: {
        startPoint: createChartPoint({ date: "2026-05-01" }),
        endPoint: createChartPoint({ date: "2026-05-29" }),
      },
    }),
  );

  assert.match(html, /May 1, 2026/);
  assert.match(html, /May 29, 2026/);
  assert.match(html, /Portfolio \+3\.00%/);
  assert.match(html, /SPY -2\.00%/);
  assert.match(html, /Gap \+5\.00 pp/);
  assert.match(html, /value-positive/);
  assert.match(html, /value-negative/);
});
