import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkChartHeader } from "../src/components/benchmark-chart/chart-header";
import { getUiCopy } from "../src/lib/ui/copy";

test("benchmark chart header preserves default title and hides subtitle without series", () => {
  const copy = getUiCopy("EN").charts.benchmark;
  const html = renderToStaticMarkup(
    createElement(BenchmarkChartHeader, {
      benchmarkSymbol: null,
      controls: createElement(
        "div",
        { className: "chart-control-stack chart-control-stack-desktop" },
        createElement("button", null, "Controls"),
      ),
      copy,
      hasAnySeries: false,
      subtitle: "Should not render",
    }),
  );

  assert.match(html, /Performance vs benchmark/);
  assert.doesNotMatch(html, /Should not render/);
  assert.match(html, /chart-control-stack-desktop/);
  assert.match(html, /Controls/);
});

test("benchmark chart header preserves symbol title and subtitle", () => {
  const copy = getUiCopy("EN").charts.benchmark;
  const html = renderToStaticMarkup(
    createElement(BenchmarkChartHeader, {
      benchmarkSymbol: "SPY",
      controls: createElement(
        "div",
        { className: "chart-control-stack chart-control-stack-desktop" },
        createElement("button", null, "Controls"),
      ),
      copy,
      hasAnySeries: true,
      subtitle: "USD portfolio vs USD benchmark",
    }),
  );

  assert.match(html, /Performance vs SPY/);
  assert.match(html, /USD portfolio vs USD benchmark/);
});
