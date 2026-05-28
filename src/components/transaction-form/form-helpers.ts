import { formatQuantity } from "@/lib/format";
import { getInstrumentSearchScore } from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionBroker } from "@/lib/validation/transaction";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";

export type TransactionFormValues = {
  instrumentId: string;
  tradeDate: string;
  side: "BUY" | "SELL";
  broker: TransactionBroker;
  quantity: string;
  price: string;
  fee: string;
  notes: string;
};

export type NewInstrumentFormValues = {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
};

export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: {
      availableQuantity?: number;
      issues?: {
        fieldErrors?: Record<string, string[] | undefined>;
        formErrors?: string[];
      };
    } | null;
  };
};

export type InstrumentApiResponse = ApiErrorResponse & {
  instrument?: TransactionInstrumentOption;
};

export type InstrumentSearchResult = NewInstrumentFormValues & {
  exchangeName: string | null;
};

export type InstrumentSearchApiResponse = ApiErrorResponse & {
  results?: InstrumentSearchResult[];
};

export function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function createInitialValues(
  instruments: TransactionInstrumentOption[],
): TransactionFormValues {
  return {
    instrumentId: getSynchronizedInstrumentId("", instruments),
    tradeDate: getTodayDate(),
    side: "BUY",
    broker: "DIME",
    quantity: "",
    price: "",
    fee: "0",
    notes: "",
  };
}

export function createValuesFromTransaction(
  transaction: TransactionListItem,
): TransactionFormValues {
  return {
    instrumentId: String(transaction.instrumentId),
    tradeDate: transaction.tradeDate,
    side: transaction.side,
    broker: transaction.broker,
    quantity: String(transaction.quantity),
    price: String(transaction.price),
    fee: String(transaction.fee),
    notes: transaction.notes ?? "",
  };
}

export function getInitialInstrumentSearch(instruments: TransactionInstrumentOption[]) {
  const initialInstrumentId = getSynchronizedInstrumentId("", instruments);
  const initialInstrument = instruments.find(
    (instrument) => String(instrument.id) === initialInstrumentId,
  );

  return initialInstrument?.label ?? "";
}

export function getInstrumentLookupLabel(instrument: InstrumentSearchResult) {
  return `${instrument.symbol} - ${instrument.displayName} - ${instrument.market} - ${instrument.currency}`;
}

export function getVisibleInstrumentOptions(
  instruments: TransactionInstrumentOption[],
  searchQuery: string,
) {
  const rankedOptions = instruments
    .map((instrument) => ({
      instrument,
      score: getInstrumentSearchScore(instrument, searchQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.instrument.symbol.localeCompare(right.instrument.symbol);
    });

  return rankedOptions.map((item) => item.instrument);
}

export function getTransactionInstrumentLabel(
  transaction: TransactionListItem,
  instruments: TransactionInstrumentOption[],
) {
  return (
    instruments.find((instrument) => instrument.id === transaction.instrumentId)?.label ??
    `${transaction.instrument.symbol} - ${transaction.instrument.displayName} - ${transaction.instrument.market} - ${transaction.instrument.currency}`
  );
}

export function getErrorMessage(
  error: ApiErrorResponse["error"],
  fallbackMessage: string,
  language: UiLanguage,
) {
  if (!error) {
    return fallbackMessage;
  }

  const fieldErrors = error.details?.issues?.fieldErrors;
  const firstFieldError = fieldErrors
    ? Object.values(fieldErrors)
        .flatMap((messages) => messages ?? [])
        .find(Boolean)
    : null;

  if (firstFieldError) {
    return firstFieldError;
  }

  const firstFormError = error.details?.issues?.formErrors?.find(Boolean);

  if (firstFormError) {
    return firstFormError;
  }

  if (error.code === "INSUFFICIENT_QUANTITY") {
    const availableQuantity = error.details?.availableQuantity;

    if (typeof availableQuantity === "number") {
      const copy = getUiCopy(language).transactions.form;
      return copy.insufficientQuantity(
        formatQuantity(availableQuantity, { locale: getUiLocale(language) }),
      );
    }
  }

  return error.message ?? fallbackMessage;
}

export function getSynchronizedInstrumentId(
  instrumentId: string,
  instruments: TransactionInstrumentOption[],
) {
  if (instruments.length === 0) {
    return "";
  }

  const hasMatchingInstrument = instruments.some(
    (instrument) => String(instrument.id) === instrumentId,
  );

  return hasMatchingInstrument ? instrumentId : "";
}
