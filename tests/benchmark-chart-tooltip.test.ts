import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkChartTooltip } from "../src/components/benchmark-chart/chart-tooltip";
import type { ChartPoint } from "../src/components/benchmark-chart/types";

function createChartPoint(overrides: Partial<ChartPoint> = {}): ChartPoint {
  const date = "2026-05-15T10:30:00.000Z";
  const time = Date.parse(date);

  return {
    annualized: false,
    benchmarkChangeFromRangeStart: -2,
    benchmarkDisplay: 98,
    benchmarkDrawdown: -2,
    benchmarkRaw: 98,
    benchmarkReturn: -2,
    benchmarkReturnPercent: -2,
    date,
    gap: 7,
    portfolioChangeFromRangeStart: 5,
    portfolioDisplay: 105,
    portfolioDrawdown: 0,
    portfolioRaw: 105,
    portfolioReturn: 5,
    portfolioReturnPercent: 5,
    time,
    timestamp: time,
    ...overrides,
  };
}

test("benchmark chart tooltip renders active indexed rows with range changes", () => {
  const point = createChartPoint();
  const label = Date.parse(point.date);
  const html = renderToStaticMarkup(
    createElement(BenchmarkChartTooltip, {
      active: true,
      label,
      language: "EN",
      mode: "INDEXED",
      returnBasis: "TWR",
      payload: [
        {
          dataKey: "portfolioDisplay",
          name: "Portfolio",
          payload: point,
          value: 105,
        },
        {
          dataKey: "benchmarkDisplay",
          name: "Benchmark",
          payload: point,
          value: 98,
        },
        {
          dataKey: "gap",
          name: "Ignored empty",
          payload: point,
        },
      ],
    }),
  );

  assert.match(html, /class="chart-tooltip"/);
  assert.match(html, /15 May 2026, 10:30/);
  assert.match(html, /Portfolio/);
  assert.match(html, /105.0%/);
  assert.match(html, /\+5.00%/);
  assert.match(html, /Benchmark/);
  assert.match(html, /98.0%/);
  assert.match(html, /-2.00%/);
  assert.doesNotMatch(html, /Ignored empty/);
});

test("benchmark chart tooltip hides inactive and non-indexed range change states", () => {
  const point = createChartPoint();
  const label = Date.parse(point.date);

  assert.equal(
    renderToStaticMarkup(
      createElement(BenchmarkChartTooltip, {
        active: false,
        label,
        language: "EN",
        mode: "INDEXED",
        returnBasis: "TWR",
        payload: [{ dataKey: "portfolioDisplay", payload: point, value: 105 }],
      }),
    ),
    "",
  );

  const gapHtml = renderToStaticMarkup(
    createElement(BenchmarkChartTooltip, {
      active: true,
      label,
      language: "EN",
      mode: "GAP",
      returnBasis: "TWR",
      payload: [{ dataKey: "portfolioDisplay", name: "Portfolio", payload: point, value: 7 }],
    }),
  );

  assert.match(gapHtml, /\+7.00 pp/);
  assert.doesNotMatch(gapHtml, /\+5.00%/);
});
