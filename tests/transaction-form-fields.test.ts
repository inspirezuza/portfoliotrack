import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionFormFields } from "../src/components/transaction-form/form-fields";
import type { TransactionFormValues } from "../src/components/transaction-form/form-helpers";
import { getUiCopy } from "../src/lib/ui/copy";

const values: TransactionFormValues = {
  instrumentId: "1",
  tradeDate: "2026-05-29",
  side: "BUY",
  broker: "DIME",
  quantity: "10",
  price: "20",
  fee: "1",
  notes: "note",
};

test("transaction form fields preserve inputs, broker state, and banners", () => {
  const html = renderToStaticMarkup(
    createElement(TransactionFormFields, {
      copy: getUiCopy("EN"),
      disabled: true,
      errorMessage: "Could not save",
      onValueChange: () => undefined,
      successMessage: "Saved",
      values,
    }),
  );

  assert.match(html, /name="tradeDate"/);
  assert.match(html, /value="2026-05-29"/);
  assert.match(html, /name="side"/);
  assert.match(html, /value="BUY" selected=""/);
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /data-selected="true" role="radio" aria-checked="true"/);
  assert.match(html, /name="quantity"/);
  assert.match(html, /placeholder="0\.000000"/);
  assert.match(html, /name="notes"/);
  assert.match(html, />Could not save</);
  assert.match(html, />Saved</);
  assert.match(html, /disabled=""/);
});
