import {
  createTransactionRequestBody,
  getErrorMessage,
  type ApiErrorResponse,
  type InstrumentApiResponse,
  type InstrumentSearchApiResponse,
  type InstrumentSearchResult,
  type NewInstrumentFormValues,
  type TransactionFormValues,
} from "@/components/transaction-form/form-helpers";
import type { UiLanguage } from "@/lib/ui/translations";
import type { TransactionListItem } from "@/server/transactions";

type FormFetcher = typeof fetch;

export async function searchInstrumentsForForm({
  fallbackMessage,
  fetcher = fetch,
  language,
  query,
  signal,
}: {
  fallbackMessage: string;
  fetcher?: FormFetcher;
  language: UiLanguage;
  query: string;
  signal?: AbortSignal;
}): Promise<InstrumentSearchResult[]> {
  const response = await fetcher(`/api/instruments/search?query=${encodeURIComponent(query)}`, {
    signal,
  });
  const payload = (await response.json()) as InstrumentSearchApiResponse;

  if (!response.ok) {
    throw new Error(getErrorMessage(payload.error, fallbackMessage, language));
  }

  return payload.results ?? [];
}

export async function saveTransactionFromForm({
  editingTransaction,
  fallbackMessage,
  fetcher = fetch,
  language,
  values,
}: {
  editingTransaction: TransactionListItem | null;
  fallbackMessage: string;
  fetcher?: FormFetcher;
  language: UiLanguage;
  values: TransactionFormValues;
}) {
  const response = await fetcher("/api/transactions", {
    method: editingTransaction ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createTransactionRequestBody(values, editingTransaction)),
  });
  const payload = (await response.json()) as ApiErrorResponse;

  if (!response.ok) {
    throw new Error(getErrorMessage(payload.error, fallbackMessage, language));
  }
}

export async function createInstrumentFromForm({
  fallbackMessage,
  fetcher = fetch,
  language,
  values,
}: {
  fallbackMessage: string;
  fetcher?: FormFetcher;
  language: UiLanguage;
  values: NewInstrumentFormValues;
}) {
  const response = await fetcher("/api/instruments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json()) as InstrumentApiResponse;

  if (!response.ok || !payload.instrument) {
    throw new Error(getErrorMessage(payload.error, fallbackMessage, language));
  }

  return payload.instrument;
}
