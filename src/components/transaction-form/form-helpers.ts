import { formatQuantity } from "@/lib/format";
import {
  getInstrumentSearchScore,
  normalizeInstrumentSearchValue,
} from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import type {
  ApiErrorResponse,
  InstrumentSearchResult,
  NewInstrumentFormValues,
  TransactionFormSyncState,
  TransactionFormValues,
  TransactionRequestBody,
} from "@/components/transaction-form/form-types";

export type {
  ApiErrorResponse,
  InstrumentApiResponse,
  InstrumentSearchApiResponse,
  InstrumentSearchResult,
  NewInstrumentFormValues,
  TransactionFormSyncState,
  TransactionFormValues,
  TransactionRequestBody,
} from "@/components/transaction-form/form-types";
export {
  getInstrumentSearchKeyAction,
  getNextHighlightedInstrumentId,
} from "@/components/transaction-form/instrument-combobox-helpers";

export function getTransactionSubmitButtonLabel({
  copy,
  isEditing,
  isRefreshing,
  isSubmitting,
}: {
  copy: ReturnType<typeof getUiCopy>;
  isEditing: boolean;
  isRefreshing: boolean;
  isSubmitting: boolean;
}) {
  if (isSubmitting) {
    return isEditing ? copy.transactions.form.updating : copy.transactions.form.saving;
  }

  if (isRefreshing) {
    return copy.transactions.form.refreshing;
  }

  return isEditing
    ? copy.transactions.form.updateTransaction
    : copy.transactions.form.saveTransaction;
}

export function getNextTransactionFormSyncState({
  currentValues,
  editingTransaction,
  instruments,
}: {
  currentValues: TransactionFormValues;
  editingTransaction?: TransactionListItem | null;
  instruments: TransactionInstrumentOption[];
}): TransactionFormSyncState {
  if (editingTransaction) {
    return {
      values: createValuesFromTransaction(editingTransaction),
      instrumentSearch: getTransactionInstrumentLabel(editingTransaction, instruments),
      highlightedInstrumentId: String(editingTransaction.instrumentId),
      isInstrumentComboboxOpen: false,
      errorMessage: null,
      successMessage: null,
    };
  }

  const instrumentId = getSynchronizedInstrumentId(currentValues.instrumentId, instruments);

  return {
    values:
      instrumentId === currentValues.instrumentId
        ? currentValues
        : {
            ...currentValues,
            instrumentId,
          },
  };
}

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

export function createTransactionRequestBody(
  values: TransactionFormValues,
  editingTransaction?: TransactionListItem | null,
): TransactionRequestBody {
  const transactionPayload = {
    instrumentId: Number(values.instrumentId),
    tradeDate: values.tradeDate,
    side: values.side,
    broker: values.broker,
    quantity: Number(values.quantity),
    price: Number(values.price),
    fee: Number(values.fee || "0"),
    notes: values.notes,
  };

  return editingTransaction
    ? {
        id: editingTransaction.id,
        portfolioId: editingTransaction.portfolioId,
        ...transactionPayload,
      }
    : transactionPayload;
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

export function findExistingInstrumentForLookup(
  instruments: TransactionInstrumentOption[],
  instrumentValues: NewInstrumentFormValues | InstrumentSearchResult,
) {
  return instruments.find(
    (instrument) =>
      normalizeInstrumentSearchValue(instrument.symbol) ===
        normalizeInstrumentSearchValue(instrumentValues.symbol) ||
      normalizeInstrumentSearchValue(instrument.providerSymbol ?? "") ===
        normalizeInstrumentSearchValue(instrumentValues.providerSymbol),
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
