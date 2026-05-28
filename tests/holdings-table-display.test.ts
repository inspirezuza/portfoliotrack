import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatBroker,
  formatHoldingPercent,
  formatHoldingValuationMoney,
  formatSignedHoldingPercent,
  getPnlToneClass,
} from "../src/components/holdings-table/display-helpers";
import { HoldingLotsPanel } from "../src/components/holdings-table/holding-lots-panel";
import type { HoldingLot, HoldingRow } from "../src/server/holdings";

function renderNode(node: React.ReactNode) {
  return renderToStaticMarkup(createElement(Fragment, null, node));
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
    performance: {} as HoldingRow["performance"],
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

function createLot(overrides: Partial<HoldingLot> = {}): HoldingLot {
  return {
    broker: "WEBULL",
    costBasis: 50,
    costBasisInValuationCurrency: 1750,
    createdAt: "2026-01-01T09:00:00.000Z",
    fee: 1,
    instrumentId: 1,
    marketValue: 60,
    marketValueInValuationCurrency: 2100,
    notes: "first lot",
    originalQuantity: 5,
    portfolioId: 7,
    portfolioName: "Core",
    price: 10,
    remainingQuantity: 4,
    side: "BUY",
    totalGain: 10,
    totalGainInValuationCurrency: 350,
    totalGainPercent: 0.2,
    tradeDate: "2026-01-01",
    transactionId: 42,
    updatedAt: "2026-01-02T09:00:00.000Z",
    ...overrides,
  };
}

test("display helpers preserve empty, signed, broker, and tone behavior", () => {
  const holding = createHolding();

  assert.equal(formatBroker("WEBULL"), "Webull");
  assert.equal(formatBroker("DIME"), "Dime");
  assert.equal(getPnlToneClass(null), undefined);
  assert.equal(getPnlToneClass(0), undefined);
  assert.equal(getPnlToneClass(1), "value-positive");
  assert.equal(getPnlToneClass(-1), "value-negative");
  assert.equal(
    renderNode(formatHoldingPercent(null, "en-US", "Waiting")),
    '<span class="data-pending">Waiting</span>',
  );
  assert.equal(renderNode(formatSignedHoldingPercent(0.1234, "en-US", "Waiting")), "+12.34%");
  assert.match(
    renderNode(
      formatHoldingValuationMoney({
        emptyLabel: "Waiting",
        holding,
        locale: "en-US",
        nativeValue: 10,
        primaryValue: 350,
      }),
    ),
    /THB/,
  );
});

test("holding lots panel renders lot details and edit/delete controls", () => {
  const holding = createHolding();
  const lot = createLot();
  const html = renderToStaticMarkup(
    createElement(HoldingLotsPanel, {
      canEdit: true,
      deletingTransactionId: null,
      holding,
      id: "lots-aapl",
      language: "EN",
      lots: [lot],
      onDelete: () => undefined,
      onEdit: () => undefined,
    }),
  );

  assert.match(html, /id="lots-aapl"/);
  assert.match(html, /Core \/ Webull/);
  assert.match(html, /2026-01-01/);
  assert.match(html, /Edit AAPL 2026-01-01/);
  assert.match(html, /Delete AAPL 2026-01-01/);
});
