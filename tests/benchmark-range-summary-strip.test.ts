import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkRangeSummaryStrip } from "../src/components/benchmark-chart/range-summary-strip";
import { getUiCopy } from "../src/lib/ui/copy";
import type { ChartPoint } from "../src/components/benchmark-chart/types";

function createChartPoint(overrides: Partial<ChartPoint> = {}): ChartPoint {
  return {
    benchmarkDisplay: 0.05,
    benchmarkIndex: 105,
    benchmarkReturn: -0.02,
    date: "2026-05-29",
    gap: 0.03,
    portfolioDisplay: 1.12,
    portfolioIndex: 112,
    portfolioReturn: 0.01,
    timestamp: Date.UTC(2026, 4, 29),
    ...overrides,
  } as ChartPoint;
}

test("benchmark range summary strip preserves values, labels, and tones", () => {
  const copy = getUiCopy("EN").charts.benchmark;
  const html = renderToStaticMarkup(
    createElement(BenchmarkRangeSummaryStrip, {
      benchmarkSymbol: "SPY",
      copy,
      locale: "en-US",
      mode: "INDEXED",
      modeCopy: {
        benchmarkName: "Benchmark",
        portfolioName: "Portfolio",
        yAxisLabel: "Indexed return",
      },
      rangeStats: {
        benchmarkChange: -0.02,
        gap: 0.03,
        latestPoint: createChartPoint(),
        portfolioChange: 0.01,
      },
    }),
  );

  assert.match(html, /aria-label="Benchmark comparison range summary"/);
  assert.match(html, /Portfolio/);
  assert.match(html, /\+0\.01%/);
  assert.match(html, /SPY/);
  assert.match(html, /-0\.02%/);
  assert.match(html, /Gap/);
  assert.match(html, /\+0\.03 pp/);
  assert.match(html, /Indexed return/);
  assert.match(html, /1\.1%/);
  assert.match(html, /value-positive/);
  assert.match(html, /value-negative/);
});

test("benchmark range summary strip preserves gap-mode and empty metric rendering", () => {
  const copy = getUiCopy("EN").charts.benchmark;
  const html = renderToStaticMarkup(
    createElement(BenchmarkRangeSummaryStrip, {
      benchmarkSymbol: null,
      copy,
      locale: "en-US",
      mode: "GAP",
      modeCopy: {
        benchmarkName: "Benchmark",
        portfolioName: "Portfolio",
        yAxisLabel: "Gap",
      },
      rangeStats: {
        benchmarkChange: null,
        gap: null,
        latestPoint: createChartPoint({ portfolioDisplay: 0 }),
        portfolioChange: null,
      },
    }),
  );

  assert.match(html, /Benchmark/);
  assert.match(html, /Latest gap/);
  assert.match(html, />-</);
  assert.doesNotMatch(html, /value-positive/);
  assert.doesNotMatch(html, /value-negative/);
});
