import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SortableHeader } from "../src/components/holdings-table/sortable-header";

test("holdings sortable header preserves active sort aria state and label", () => {
  const html = renderToStaticMarkup(
    createElement(
      "table",
      null,
      createElement(
        "thead",
        null,
        createElement(
          "tr",
          null,
          createElement(SortableHeader, {
            align: "right",
            label: "Market value",
            language: "EN",
            onSort: () => undefined,
            sort: { key: "marketValue", direction: "desc" },
            sortKey: "marketValue",
          }),
        ),
      ),
    ),
  );

  assert.match(html, /class="table-heading-number"/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /data-sort-state="desc"/);
  assert.match(html, /aria-label="Sort Market value ascending"/);
  assert.match(html, />Market value</);
});

test("holdings sortable header preserves inactive sort defaults", () => {
  const html = renderToStaticMarkup(
    createElement(
      "table",
      null,
      createElement(
        "thead",
        null,
        createElement(
          "tr",
          null,
          createElement(SortableHeader, {
            label: "Symbol",
            language: "EN",
            onSort: () => undefined,
            sort: { key: "marketValue", direction: "desc" },
            sortKey: "symbol",
          }),
        ),
      ),
    ),
  );

  assert.doesNotMatch(html, /table-heading-number/);
  assert.match(html, /aria-sort="none"/);
  assert.match(html, /data-sort-state="none"/);
  assert.match(html, /aria-label="Sort Symbol ascending"/);
});
