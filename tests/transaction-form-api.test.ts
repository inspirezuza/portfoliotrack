import assert from "node:assert/strict";
import test from "node:test";
import {
  createInstrumentFromForm,
  saveTransactionFromForm,
  searchInstrumentsForForm,
} from "@/components/transaction-form/api";
import type {
  NewInstrumentFormValues,
  TransactionFormValues,
} from "@/components/transaction-form/form-helpers";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";

function createResponse({ ok, payload }: { ok: boolean; payload: unknown }) {
  return {
    ok,
    async json() {
      return payload;
    },
  } as Response;
}

const values: TransactionFormValues = {
  broker: "DIME",
  fee: "",
  instrumentId: "10",
  notes: "long-term",
  price: "20.5",
  quantity: "2",
  side: "BUY",
  tradeDate: "2026-05-29",
};

const editingTransaction = {
  id: 99,
  portfolioId: 7,
} as TransactionListItem;

const instrumentValues: NewInstrumentFormValues = {
  currency: "USD",
  displayName: "Apple Inc.",
  instrumentType: "EQUITY",
  market: "NASDAQ",
  providerSymbol: "AAPL",
  symbol: "AAPL",
};

const createdInstrument: TransactionInstrumentOption = {
  currency: "USD",
  currentQuantity: 0,
  displayName: "Apple Inc.",
  id: 10,
  instrumentType: "EQUITY",
  isActive: true,
  label: "AAPL - Apple Inc. - NASDAQ - USD",
  market: "NASDAQ",
  providerSymbol: "AAPL",
  symbol: "AAPL",
};

test("transaction form API helpers preserve requests and successful payloads", async () => {
  const requests: Array<{ body?: string; method?: string; url: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      body: init?.body?.toString(),
      method: init?.method,
      url: input.toString(),
    });

    if (input.toString().startsWith("/api/instruments/search")) {
      return createResponse({
        ok: true,
        payload: { results: [instrumentValues] },
      });
    }

    if (input.toString() === "/api/instruments") {
      return createResponse({
        ok: true,
        payload: { instrument: createdInstrument },
      });
    }

    return createResponse({ ok: true, payload: {} });
  };

  assert.deepEqual(
    await searchInstrumentsForForm({
      fallbackMessage: "Search failed",
      fetcher,
      language: "EN",
      query: "a apl",
    }),
    [instrumentValues],
  );
  await saveTransactionFromForm({
    editingTransaction,
    fallbackMessage: "Save failed",
    fetcher,
    language: "EN",
    values,
  });
  assert.equal(
    await createInstrumentFromForm({
      fallbackMessage: "Create failed",
      fetcher,
      language: "EN",
      values: instrumentValues,
    }),
    createdInstrument,
  );

  assert.deepEqual(requests, [
    { body: undefined, method: undefined, url: "/api/instruments/search?query=a%20apl" },
    {
      body: JSON.stringify({
        id: 99,
        portfolioId: 7,
        instrumentId: 10,
        tradeDate: "2026-05-29",
        side: "BUY",
        broker: "DIME",
        quantity: 2,
        price: 20.5,
        fee: 0,
        notes: "long-term",
      }),
      method: "PUT",
      url: "/api/transactions",
    },
    {
      body: JSON.stringify(instrumentValues),
      method: "POST",
      url: "/api/instruments",
    },
  ]);
});

test("transaction form API helpers preserve fallback errors", async () => {
  const fetcher = async () =>
    createResponse({
      ok: false,
      payload: { error: { message: "Server said no." } },
    });

  await assert.rejects(
    () =>
      saveTransactionFromForm({
        editingTransaction: null,
        fallbackMessage: "Save failed",
        fetcher,
        language: "EN",
        values,
      }),
    /Server said no\./,
  );
  await assert.rejects(
    () =>
      createInstrumentFromForm({
        fallbackMessage: "Create failed",
        fetcher: async () => createResponse({ ok: true, payload: {} }),
        language: "EN",
        values: instrumentValues,
      }),
    /Create failed/,
  );
});
