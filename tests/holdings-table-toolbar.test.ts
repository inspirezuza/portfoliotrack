import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HoldingsTableToolbar } from "../src/components/holdings-table/table-toolbar";
import { getUiCopy } from "../src/lib/ui/copy";

test("holdings table toolbar preserves search, performance, and filter controls", () => {
  const copy = getUiCopy("EN");
  const html = renderToStaticMarkup(
    createElement(HoldingsTableToolbar, {
      copy,
      filter: "gain",
      onFilterChange: () => undefined,
      onPerformanceBasisChange: () => undefined,
      onPerformanceTimeframeChange: () => undefined,
      onSearchQueryChange: () => undefined,
      performanceBasis: "cost",
      performanceTimeframe: "1M",
      searchQuery: "apple",
    }),
  );

  assert.match(html, /aria-label="Holdings table tools"/);
  assert.match(html, /type="search"/);
  assert.match(html, /value="apple"/);
  assert.match(html, /placeholder="Symbol, name, market"/);
  assert.match(html, /aria-label="Performance comparison basis"/);
  assert.match(html, /aria-pressed="true"[^>]*>Cost basis/);
  assert.match(html, /aria-label="Performance timeframe"/);
  assert.match(html, /aria-pressed="true"[^>]*>1M/);
  assert.match(html, /aria-label="Holdings filters"/);
  assert.match(html, /aria-pressed="true"[^>]*>Gain/);
});
