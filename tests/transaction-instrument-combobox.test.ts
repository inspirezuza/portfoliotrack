import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionInstrumentCombobox } from "../src/components/transaction-form/instrument-combobox";
import { getUiCopy } from "../src/lib/ui/copy";
import type { TransactionInstrumentOption } from "../src/server/transactions";

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

test("transaction instrument combobox renders selected, highlighted, empty, and warning states", () => {
  const copy = getUiCopy("EN");
  const apple = createInstrument();
  const microsoft = createInstrument({
    id: 20,
    symbol: "MSFT",
    displayName: "Microsoft",
    label: "MSFT - Microsoft - NASDAQ - USD",
  });

  const html = renderToStaticMarkup(
    createElement(TransactionInstrumentCombobox, {
      copy,
      highlightedInstrumentId: "20",
      instrumentSearch: "AAPL",
      isDisabled: false,
      isInstrumentComboboxOpen: true,
      locale: "en-US",
      onBlur: () => undefined,
      onFocus: () => undefined,
      onInstrumentSearchChange: () => undefined,
      onKeyDown: () => undefined,
      onMouseEnterOption: () => undefined,
      onSelectInstrument: () => undefined,
      selectedInstrument: apple,
      selectedInstrumentId: "10",
      visibleInstrumentOptions: [apple, microsoft],
    }),
  );

  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-activedescendant="instrument-option-20"/);
  assert.match(html, /data-selected="true"/);
  assert.match(html, /data-highlighted="true"/);
  assert.match(html, /<span class="instrument-combobox-symbol">AAPL<\/span>/);
  assert.match(html, /<span class="instrument-combobox-name">Apple Inc\.<\/span>/);
  assert.match(html, /NASDAQ \/ EQUITY \/ USD \/ AAPL/);
  assert.match(html, /Current quantity: 12.5 units/);

  const emptyHtml = renderToStaticMarkup(
    createElement(TransactionInstrumentCombobox, {
      copy,
      highlightedInstrumentId: null,
      instrumentSearch: "zzz",
      isDisabled: false,
      isInstrumentComboboxOpen: true,
      locale: "en-US",
      onBlur: () => undefined,
      onFocus: () => undefined,
      onInstrumentSearchChange: () => undefined,
      onKeyDown: () => undefined,
      onMouseEnterOption: () => undefined,
      onSelectInstrument: () => undefined,
      selectedInstrument: null,
      selectedInstrumentId: "",
      visibleInstrumentOptions: [],
    }),
  );

  assert.match(emptyHtml, /No matching instruments/);
  assert.match(emptyHtml, /Select a matching instrument before saving/);
});
