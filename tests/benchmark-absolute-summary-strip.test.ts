import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkAbsoluteSummaryStrip } from "../src/components/benchmark-chart/absolute-summary-strip";
import { getUiCopy } from "../src/lib/ui/copy";

test("benchmark absolute summary strip preserves active return and money metrics", () => {
  const copy = getUiCopy("EN");
  const html = renderToStaticMarkup(
    createElement(BenchmarkAbsoluteSummaryStrip, {
      basisReturn: 0.1234,
      copy: copy.charts.benchmark,
      locale: "en-US",
      message: "Ready",
      performanceSummary: {
        absoluteReturn: 0.25,
        currency: "USD",
        netInvested: 1000,
        status: "ready",
        totalPnl: 250,
      },
      returnBasis: "ABSOLUTE",
      returnBasisCopy: copy.charts.benchmark.returnBasis.ABSOLUTE,
    }),
  );

  assert.match(html, /aria-label="Absolute performance summary"/);
  assert.match(html, />Absolute return</);
  assert.match(html, />25\.0%/);
  assert.match(html, />Total P&amp;L</);
  assert.match(html, />\$250\.00</);
  assert.match(html, />Net invested</);
  assert.match(html, />\$1,000\.00</);
  assert.match(html, />Chart return</);
  assert.match(html, />Absolute/);
  assert.match(html, />Note</);
  assert.match(html, />Ready</);
});
