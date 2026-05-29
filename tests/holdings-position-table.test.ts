import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getHoldingsSummary } from "../src/components/holdings-table/table-helpers";
import { getUiCopy } from "../src/lib/ui/copy";
import type { HoldingRow } from "../src/server/holdings";

type ModuleLoader = typeof Module & {
  _load: (request: string, parent: NodeJS.Module | null, isMain: boolean) => unknown;
};

async function loadHoldingsPositionTable() {
  const moduleLoader = Module as ModuleLoader;
  const originalLoad = moduleLoader._load;

  moduleLoader._load = function loadWithImageMock(request, parent, isMain) {
    if (request === "next/image") {
      const MockImage: ComponentType<{ alt?: string; src: string }> = ({ alt = "", src }) =>
        createElement("img", { alt, src });

      return MockImage;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return await import("../src/components/holdings-table/position-table");
  } finally {
    moduleLoader._load = originalLoad;
  }
}

function createHolding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    averageCost: 10,
    currency: "USD",
    displayName: "Apple Inc.",
    drRatio: null,
    fxRateToValuationCurrency: 35,
    instrumentId: 1,
    instrumentType: "STOCK",
    lastPrice: 12,
    lastPriceAsOf: "2026-01-02T10:00:00.000Z",
    lastPriceCurrency: "USD",
    lastPriceSource: "manual",
    lots: [],
    market: "NASDAQ",
    marketValue: 120,
    marketValueInValuationCurrency: 4200,
    oneDayGain: 2,
    oneDayGainInValuationCurrency: 70,
    oneDayGainPercent: 0.02,
    parentAverageCost: null,
    parentLastPrice: null,
    parentLastPriceAsOf: null,
    performance: {
      "1D": {
        amount: 2,
        amountInValuationCurrency: 70,
        percent: 0.02,
      },
    } as HoldingRow["performance"],
    portfolioWeight: 0.5,
    providerSymbol: "AAPL",
    quantity: 10,
    realizedPnl: 0,
    symbol: "AAPL",
    totalCost: 100,
    totalCostInValuationCurrency: 3500,
    totalFees: 0,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    underlyingSymbol: null,
    unrealizedPnl: 20,
    unrealizedPnlInValuationCurrency: 700,
    unrealizedPnlPercent: 0.2,
    valuationCurrency: "THB",
    ...overrides,
  };
}

test("holdings position table renders rows, footer totals, and empty filtered state", async () => {
  const { HoldingsPositionTable } = await loadHoldingsPositionTable();
  const copy = getUiCopy("EN");
  const holding = createHolding();
  const visibleSummary = getHoldingsSummary([holding], "1D");
  const html = renderToStaticMarkup(
    createElement(HoldingsPositionTable, {
      canEdit: true,
      copy,
      deletingTransactionId: null,
      expandedHoldingIds: new Set([holding.instrumentId]),
      language: "EN",
      locale: "en-US",
      onDeleteHoldingLot: () => undefined,
      onEditHoldingLot: () => undefined,
      onOpenHoldingDetail: () => undefined,
      onSort: () => undefined,
      onToggleHoldingLots: () => undefined,
      performanceBasis: "price",
      performanceTimeframe: "1D",
      selectedPerformanceKey: "1D",
      sort: { key: "marketValue", direction: "desc" },
      visibleHoldings: [holding],
      visibleSummary,
      visibleSummaryCurrency: "THB",
    }),
  );

  assert.match(html, /href="\/assets\/AAPL"/);
  assert.match(html, /Apple Inc. - NASDAQ/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /id="holding-lots-1"/);
  assert.match(html, /Shown total/);
  assert.match(html, /1 position/);

  const emptyHtml = renderToStaticMarkup(
    createElement(HoldingsPositionTable, {
      canEdit: false,
      copy,
      deletingTransactionId: null,
      expandedHoldingIds: new Set<number>(),
      language: "EN",
      locale: "en-US",
      onDeleteHoldingLot: () => undefined,
      onEditHoldingLot: () => undefined,
      onOpenHoldingDetail: () => undefined,
      onSort: () => undefined,
      onToggleHoldingLots: () => undefined,
      performanceBasis: "price",
      performanceTimeframe: "1D",
      selectedPerformanceKey: "1D",
      sort: { key: "marketValue", direction: "desc" },
      visibleHoldings: [],
      visibleSummary: getHoldingsSummary([], "1D"),
      visibleSummaryCurrency: null,
    }),
  );

  assert.match(emptyHtml, /No positions match the current filters/);
  assert.doesNotMatch(emptyHtml, /Shown total/);
});
