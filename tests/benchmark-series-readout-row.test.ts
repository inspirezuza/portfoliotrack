import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarkSeriesReadoutRow } from "../src/components/benchmark-chart/series-readout-row";

test("benchmark series readout row preserves marker, value, and remove button rendering", () => {
  const html = renderToStaticMarkup(
    createElement(BenchmarkSeriesReadoutRow, {
      change: 2.5,
      locale: "en-US",
      markerColor: "#123456",
      mode: "INDEXED",
      name: "QQQ",
      onRemove: () => undefined,
      removeLabel: "Remove QQQ",
      value: 12.5,
    }),
  );

  assert.match(html, /chart-series-readout-row/);
  assert.match(html, /background-color:#123456/);
  assert.match(html, />QQQ</);
  assert.match(html, />12\.5%/);
  assert.match(html, /chart-series-percent-chip value-positive/);
  assert.match(html, /aria-label="Remove QQQ"/);
  assert.match(html, /type="button"/);
});

test("benchmark series readout row preserves remove spacer for fixed series", () => {
  const html = renderToStaticMarkup(
    createElement(BenchmarkSeriesReadoutRow, {
      change: -1.25,
      locale: "en-US",
      markerClassName: "chart-series-marker-benchmark",
      mode: "GAP",
      name: "SPY",
      value: -1.25,
    }),
  );

  assert.match(html, /chart-series-marker-benchmark/);
  assert.match(html, />-1\.25 pp/);
  assert.match(html, /chart-series-percent-chip value-negative/);
  assert.match(html, /chart-series-remove-spacer/);
  assert.doesNotMatch(html, /chart-series-remove-button/);
});
