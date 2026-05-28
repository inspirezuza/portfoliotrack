import { formatQuantity } from "@/lib/format";
import {
  getInstrumentSearchScore,
  normalizeInstrumentSearchValue,
} from "@/lib/transactions/instrument-selection";
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

export type TransactionRequestBody = {
  id?: number;
  portfolioId?: number;
  instrumentId: number;
  tradeDate: string;
  side: TransactionFormValues["side"];
  broker: TransactionBroker;
  quantity: number;
  price: number;
  fee: number;
  notes: string;
};

export type TransactionFormSyncState = {
  values: TransactionFormValues;
  instrumentSearch?: string;
  highlightedInstrumentId?: string | null;
  isInstrumentComboboxOpen?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
};

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

export function getNextHighlightedInstrumentId({
  currentHighlightedInstrumentId,
  direction,
  visibleInstrumentOptions,
}: {
  currentHighlightedInstrumentId: string | null;
  direction: "down" | "up";
  visibleInstrumentOptions: TransactionInstrumentOption[];
}) {
  if (visibleInstrumentOptions.length === 0) {
    return null;
  }

  const currentIndex = visibleInstrumentOptions.findIndex(
    (instrument) => String(instrument.id) === currentHighlightedInstrumentId,
  );
  const fallbackIndex = direction === "down" ? -1 : 0;
  const nextIndex =
    direction === "down"
      ? (currentIndex + 1) % visibleInstrumentOptions.length
      : (currentIndex === -1 ? fallbackIndex : currentIndex - 1 + visibleInstrumentOptions.length) %
        visibleInstrumentOptions.length;

  return String(visibleInstrumentOptions[nextIndex].id);
}

export function getInstrumentSearchKeyAction({
  currentHighlightedInstrumentId,
  isInstrumentComboboxOpen,
  key,
  selectedInstrumentLabel,
  visibleInstrumentOptions,
}: {
  currentHighlightedInstrumentId: string | null;
  isInstrumentComboboxOpen: boolean;
  key: string;
  selectedInstrumentLabel: string;
  visibleInstrumentOptions: TransactionInstrumentOption[];
}) {
  const opensCombobox = ["ArrowDown", "ArrowUp", "Enter"].includes(key);
  const nextIsInstrumentComboboxOpen = opensCombobox ? true : isInstrumentComboboxOpen;

  if (key === "ArrowDown" || key === "ArrowUp") {
    return {
      highlightedInstrumentId: getNextHighlightedInstrumentId({
        currentHighlightedInstrumentId,
        direction: key === "ArrowDown" ? "down" : "up",
        visibleInstrumentOptions,
      }),
      isInstrumentComboboxOpen: nextIsInstrumentComboboxOpen,
      preventDefault: true,
      selectedInstrument: null,
    };
  }

  if (key === "Enter" && isInstrumentComboboxOpen) {
    const selectedInstrument =
      visibleInstrumentOptions.find(
        (instrument) => String(instrument.id) === currentHighlightedInstrumentId,
      ) ?? visibleInstrumentOptions[0];

    if (selectedInstrument) {
      return {
        highlightedInstrumentId: String(selectedInstrument.id),
        isInstrumentComboboxOpen: false,
        preventDefault: true,
        selectedInstrument,
      };
    }
  }

  if (key === "Escape") {
    return {
      highlightedInstrumentId: currentHighlightedInstrumentId,
      instrumentSearch: selectedInstrumentLabel,
      isInstrumentComboboxOpen: false,
      preventDefault: false,
      selectedInstrument: null,
    };
  }

  if (opensCombobox) {
    return {
      highlightedInstrumentId: currentHighlightedInstrumentId,
      isInstrumentComboboxOpen: nextIsInstrumentComboboxOpen,
      preventDefault: false,
      selectedInstrument: null,
    };
  }

  return null;
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
