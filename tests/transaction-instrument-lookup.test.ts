import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InstrumentLookupPanel } from "../src/components/transaction-form/instrument-lookup";
import type { InstrumentSearchResult } from "../src/components/transaction-form/form-helpers";
import type { TransactionInstrumentOption } from "../src/server/transactions";
import { getUiCopy } from "../src/lib/ui/copy";

function createInstrument(
  overrides: Partial<TransactionInstrumentOption> = {},
): TransactionInstrumentOption {
  return {
    id: 10,
    symbol: "AAPL",
    displayName: "Apple Inc.",
    market: "NASDAQ",
    instrumentType: "EQUITY",
    currency: "USD",
    providerSymbol: "AAPL",
    isActive: true,
    currentQuantity: 12.5,
    label: "AAPL - Apple Inc. - NASDAQ - USD",
    ...overrides,
  };
}

function createSearchResult(
  overrides: Partial<InstrumentSearchResult> = {},
): InstrumentSearchResult {
  return {
    symbol: "AAPL",
    displayName: "Apple Inc.",
    market: "NASDAQ",
    instrumentType: "EQUITY",
    currency: "USD",
    providerSymbol: "AAPL",
    exchangeName: "Nasdaq",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof InstrumentLookupPanel>[0]> = {}) {
  const props: Parameters<typeof InstrumentLookupPanel>[0] = {
    copy: getUiCopy("EN"),
    instrumentErrorMessage: null,
    instrumentLookupQuery: "",
    instrumentLookupResults: [],
    instrumentOptions: [],
    instrumentSuccessMessage: null,
    isCreatingInstrument: false,
    isInstrumentLookupMenuOpen: false,
    isSearchingInstruments: false,
    onClear: () => undefined,
    onFocus: () => undefined,
    onQueryChange: () => undefined,
    onSelect: () => undefined,
    onSubmit: () => undefined,
    selectedInstrumentLookupResult: null,
    ...overrides,
  };

  return renderToStaticMarkup(createElement(InstrumentLookupPanel, props));
}

test("transaction instrument lookup renders addable and saved search results", () => {
  const existingInstrument = createInstrument();
  const newInstrument = createSearchResult({
    symbol: "MSFT",
    displayName: "Microsoft",
    providerSymbol: "MSFT",
  });
  const html = renderPanel({
    instrumentLookupQuery: "aa",
    instrumentLookupResults: [createSearchResult(), newInstrument],
    instrumentOptions: [existingInstrument],
    isInstrumentLookupMenuOpen: true,
    selectedInstrumentLookupResult: newInstrument,
  });

  assert.match(html, /instrument-manager/);
  assert.match(html, /Search instrument/);
  assert.match(html, /data-selected="true"/);
  assert.match(html, /Saved/);
  assert.match(html, /Add/);
  assert.match(html, /AAPL/);
  assert.match(html, /MSFT/);
});

test("transaction instrument lookup preserves loading and banner states", () => {
  const html = renderPanel({
    instrumentErrorMessage: "Could not add",
    instrumentLookupQuery: "aa",
    instrumentSuccessMessage: "Added",
    isCreatingInstrument: true,
    isInstrumentLookupMenuOpen: true,
    isSearchingInstruments: true,
    selectedInstrumentLookupResult: createSearchResult(),
  });

  assert.match(html, /Searching/);
  assert.match(html, /Adding instrument/);
  assert.match(html, /Could not add/);
  assert.match(html, /Added/);
  assert.match(html, /disabled=""/);
});
