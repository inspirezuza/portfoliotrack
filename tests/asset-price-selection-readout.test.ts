import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetPriceSelectionReadout } from "../src/components/asset-price-chart/selection-readout";

function createPoint(overrides: Record<string, unknown> = {}) {
  return {
    close: 100,
    date: "2026-05-29",
    timestamp: Date.UTC(2026, 4, 29),
    ...overrides,
  };
}

test("asset price selection readout preserves idle prompt", () => {
  const html = renderToStaticMarkup(
    createElement(AssetPriceSelectionReadout, {
      currency: "USD",
      hasActiveSelection: false,
      selectionPercent: null,
      selectionPoints: null,
    }),
  );

  assert.match(html, /chart-selection-readout-idle/);
  assert.match(html, /Drag across the chart to compare/);
});

test("asset price selection readout preserves selected range values and tone", () => {
  const html = renderToStaticMarkup(
    createElement(AssetPriceSelectionReadout, {
      currency: "USD",
      hasActiveSelection: true,
      selectionPercent: 12.345,
      selectionPoints: {
        startPoint: createPoint({ close: 100, date: "2026-05-01" }),
        endPoint: createPoint({ close: 112.345, date: "2026-05-29" }),
      },
    }),
  );

  assert.match(html, /1 May 2026/);
  assert.match(html, /29 May 2026/);
  assert.match(html, /\+12\.35%/);
  assert.match(html, /\$100\.00/);
  assert.match(html, /\$112\.35/);
  assert.match(html, /value-positive/);
});
