import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionForm } from "@/components/transaction-form";
import type { TransactionInstrumentOption } from "@/server/transactions";

const instrument: TransactionInstrumentOption = {
  currency: "USD",
  currentQuantity: 12.5,
  displayName: "Apple Inc.",
  id: 10,
  instrumentType: "EQUITY",
  isActive: true,
  label: "AAPL - Apple Inc. - NASDAQ - USD",
  market: "NASDAQ",
  providerSymbol: "AAPL",
  symbol: "AAPL",
};

test("transaction form controller preserves shell panel rendering", () => {
  const html = renderToStaticMarkup(
    createElement(TransactionForm, {
      instruments: [instrument],
      language: "EN",
    }),
  );

  assert.match(html, /class="surface-card transaction-panel"/);
  assert.match(html, />New transaction</);
  assert.match(html, /role="combobox"/);
  assert.match(html, /name="quantity"/);
});
