import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TransactionFormEmptyState,
  TransactionFormFooter,
  TransactionFormHeader,
} from "../src/components/transaction-form/panel-sections";
import { getUiCopy } from "../src/lib/ui/copy";

test("transaction form header preserves new and edit copy", () => {
  const copy = getUiCopy("EN");

  const newHtml = renderToStaticMarkup(
    createElement(TransactionFormHeader, {
      copy,
      isEditing: false,
    }),
  );
  const editHtml = renderToStaticMarkup(
    createElement(TransactionFormHeader, {
      copy,
      isEditing: true,
    }),
  );

  assert.match(newHtml, /New transaction/);
  assert.match(newHtml, /Record trade/);
  assert.match(editHtml, /Edit transaction/);
  assert.match(editHtml, /Update trade/);
});

test("transaction form empty state and footer preserve controls", () => {
  const copy = getUiCopy("EN");

  const emptyHtml = renderToStaticMarkup(
    createElement(TransactionFormEmptyState, {
      copy,
    }),
  );
  const footerHtml = renderToStaticMarkup(
    createElement(TransactionFormFooter, {
      buttonLabel: "Saving...",
      copy,
      idleLabel: "Save transaction",
      isEditing: true,
      isFormBusy: false,
      isSubmitDisabled: false,
      isCancelDisabled: true,
      onCancelEdit: () => undefined,
    }),
  );

  assert.match(emptyHtml, /No instruments are available/);
  assert.match(footerHtml, /Cancel edit/);
  assert.match(footerHtml, /disabled=""/);
  assert.match(footerHtml, /Saving\.\.\./);
});
