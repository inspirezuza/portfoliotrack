import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionFormBody } from "@/components/transaction-form/form-body";
import { TransactionFormPanel } from "@/components/transaction-form/form-panel";
import type { TransactionFormValues } from "@/components/transaction-form/form-helpers";
import { getUiCopy } from "@/lib/ui/copy";
import type { TransactionInstrumentOption } from "@/server/transactions";

const instrument: TransactionInstrumentOption = {
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
};

const values: TransactionFormValues = {
  broker: "DIME",
  fee: "1",
  instrumentId: "10",
  notes: "long-term core",
  price: "20",
  quantity: "10",
  side: "BUY",
  tradeDate: "2026-05-29",
};

test("transaction form body preserves busy form structure and controls", () => {
  const html = renderToStaticMarkup(
    createElement(TransactionFormBody, {
      copy: getUiCopy("EN"),
      errorMessage: null,
      highlightedInstrumentId: "10",
      idleLabel: "Save transaction",
      instrumentSearch: instrument.label,
      isCancelDisabled: false,
      isDisabled: false,
      isEditing: true,
      isFormBusy: true,
      isInstrumentComboboxOpen: true,
      isSubmitDisabled: false,
      locale: "en-US",
      onCancelEdit: () => undefined,
      onInstrumentBlur: () => undefined,
      onInstrumentFocus: () => undefined,
      onInstrumentSearchChange: () => undefined,
      onInstrumentSearchKeyDown: () => undefined,
      onMouseEnterOption: () => undefined,
      onSelectInstrument: () => undefined,
      onSubmit: () => undefined,
      onValueChange: () => undefined,
      selectedInstrument: instrument,
      submitButtonLabel: "Updating...",
      successMessage: "Saved",
      values,
      visibleInstrumentOptions: [instrument],
    }),
  );

  assert.match(html, /class="transaction-form"/);
  assert.match(html, />Updating\.\.\.</);
  assert.match(html, /role="combobox"/);
  assert.match(html, /AAPL - Apple Inc. - NASDAQ - USD/);
  assert.match(html, /value="2026-05-29"/);
  assert.match(html, />Cancel edit</);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, />Save transaction</);
});

test("transaction form panel preserves header, lookup panel, and empty state", () => {
  const html = renderToStaticMarkup(
    createElement(TransactionFormPanel, {
      bodyProps: null,
      copy: getUiCopy("EN"),
      instrumentErrorMessage: "Lookup failed",
      instrumentLookupQuery: "aa",
      instrumentLookupResults: [],
      instrumentOptions: [],
      instrumentSuccessMessage: null,
      isCreatingInstrument: false,
      isEditing: false,
      isFormBusy: false,
      isInstrumentLookupMenuOpen: true,
      isSearchingInstruments: false,
      onClearLookup: () => undefined,
      onLookupFocus: () => undefined,
      onLookupQueryChange: () => undefined,
      onLookupSelect: () => undefined,
      onLookupSubmit: () => undefined,
      selectedInstrumentLookupResult: null,
    }),
  );

  assert.match(html, /class="surface-card transaction-panel"/);
  assert.match(html, />New transaction</);
  assert.match(html, />Lookup failed</);
  assert.match(html, />No instruments are available/);
});
