import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkChartControls } from "../src/components/benchmark-chart/chart-controls";
import { getUiCopy } from "../src/lib/ui/copy";

test("benchmark chart controls preserve active states and unavailable drawdown mode", () => {
  const copy = getUiCopy("EN");
  const html = renderToStaticMarkup(
    createElement(BenchmarkChartControls, {
      className: "chart-control-stack chart-control-stack-desktop",
      copy: copy.charts.benchmark,
      mode: "DRAWDOWN",
      onModeChange: () => undefined,
      onReturnBasisChange: () => undefined,
      onTimeframeChange: () => undefined,
      returnBasis: "MWR",
      timeframe: "1M",
      timeframeLabels: copy.charts.common.timeframes,
    }),
  );

  assert.match(html, /chart-control-stack chart-control-stack-desktop/);
  assert.match(html, /aria-label="Benchmark performance mode"/);
  assert.match(html, /aria-label="Chart return basis"/);
  assert.match(html, /aria-label="Benchmark chart timeframe"/);
  assert.match(html, /aria-pressed="true"[^>]*disabled=""[^>]*>Drawdown</);
  assert.match(html, /aria-pressed="true"[^>]*>MWR/);
  assert.match(html, /aria-pressed="true"[^>]*>1M/);
});
