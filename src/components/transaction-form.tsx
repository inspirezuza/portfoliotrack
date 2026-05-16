"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatQuantity } from "@/lib/format";
import {
  findExactInstrumentSearchMatch,
  getInstrumentSearchScore,
  normalizeInstrumentSearchValue,
  sortInstrumentOptions
} from "@/lib/transactions/instrument-selection";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";

type TransactionFormValues = {
  instrumentId: string;
  tradeDate: string;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  fee: string;
  notes: string;
};

type NewInstrumentFormValues = {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
};

type TransactionFormProps = {
  instruments: TransactionInstrumentOption[];
  editingTransaction?: TransactionListItem | null;
};

type ApiErrorResponse = {
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

type InstrumentApiResponse = ApiErrorResponse & {
  instrument?: TransactionInstrumentOption;
};

type InstrumentSearchResult = NewInstrumentFormValues & {
  exchangeName: string | null;
};

type InstrumentSearchApiResponse = ApiErrorResponse & {
  results?: InstrumentSearchResult[];
};

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createInitialValues(instruments: TransactionInstrumentOption[]): TransactionFormValues {
  return {
    instrumentId: getSynchronizedInstrumentId("", instruments),
    tradeDate: getTodayDate(),
    side: "BUY",
    quantity: "",
    price: "",
    fee: "0",
    notes: ""
  };
}

function createValuesFromTransaction(transaction: TransactionListItem): TransactionFormValues {
  return {
    instrumentId: String(transaction.instrumentId),
    tradeDate: transaction.tradeDate,
    side: transaction.side,
    quantity: String(transaction.quantity),
    price: String(transaction.price),
    fee: String(transaction.fee),
    notes: transaction.notes ?? ""
  };
}

function getInitialInstrumentSearch(instruments: TransactionInstrumentOption[]) {
  const initialInstrumentId = getSynchronizedInstrumentId("", instruments);
  const initialInstrument = instruments.find((instrument) => String(instrument.id) === initialInstrumentId);

  return initialInstrument?.label ?? "";
}

function getTransactionInstrumentLabel(
  transaction: TransactionListItem,
  instruments: TransactionInstrumentOption[]
) {
  return (
    instruments.find((instrument) => instrument.id === transaction.instrumentId)?.label ??
    `${transaction.instrument.symbol} - ${transaction.instrument.displayName} - ${transaction.instrument.market} - ${transaction.instrument.currency}`
  );
}

function getErrorMessage(
  error: ApiErrorResponse["error"],
  fallbackMessage = "Transaction could not be saved."
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
      return `Sell quantity is greater than current holdings. Maximum sellable quantity is ${formatQuantity(availableQuantity)}.`;
    }
  }

  return error.message ?? fallbackMessage;
}

function getSynchronizedInstrumentId(
  instrumentId: string,
  instruments: TransactionInstrumentOption[]
) {
  if (instruments.length === 0) {
    return "";
  }

  const hasMatchingInstrument = instruments.some(
    (instrument) => String(instrument.id) === instrumentId
  );

  return hasMatchingInstrument ? instrumentId : "";
}

export function TransactionForm({ instruments, editingTransaction = null }: TransactionFormProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const isEditing = editingTransaction != null;
  const [instrumentOptions, setInstrumentOptions] = useState<TransactionInstrumentOption[]>(instruments);
  const [values, setValues] = useState<TransactionFormValues>(() =>
    editingTransaction ? createValuesFromTransaction(editingTransaction) : createInitialValues(instruments)
  );
  const [instrumentSearch, setInstrumentSearch] = useState(() =>
    editingTransaction
      ? getTransactionInstrumentLabel(editingTransaction, instruments)
      : getInitialInstrumentSearch(instruments)
  );
  const [isInstrumentComboboxOpen, setIsInstrumentComboboxOpen] = useState(false);
  const [highlightedInstrumentId, setHighlightedInstrumentId] = useState<string | null>(null);
  const [instrumentLookupQuery, setInstrumentLookupQuery] = useState("");
  const [instrumentLookupResults, setInstrumentLookupResults] = useState<InstrumentSearchResult[]>([]);
  const [isSearchingInstruments, setIsSearchingInstruments] = useState(false);
  const [isInstrumentFormOpen, setIsInstrumentFormOpen] = useState(instruments.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [instrumentErrorMessage, setInstrumentErrorMessage] = useState<string | null>(null);
  const [instrumentSuccessMessage, setInstrumentSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingInstrument, setIsCreatingInstrument] = useState(false);

  const selectedInstrument =
    instrumentOptions.find((instrument) => String(instrument.id) === values.instrumentId) ?? null;

  const visibleInstrumentOptions = useMemo(() => {
    const rankedOptions = instrumentOptions
      .map((instrument) => ({
        instrument,
        score: getInstrumentSearchScore(instrument, instrumentSearch)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.instrument.symbol.localeCompare(right.instrument.symbol);
      });

    return rankedOptions.map((item) => item.instrument);
  }, [instrumentOptions, instrumentSearch]);

  const isDisabled = instrumentOptions.length === 0 || isSubmitting || isRefreshing;
  const isSubmitDisabled = isDisabled || selectedInstrument == null;
  const submitButtonLabel = (() => {
    if (isSubmitting) {
      return isEditing ? "Updating..." : "Saving...";
    }

    if (isRefreshing) {
      return "Refreshing...";
    }

    return isEditing ? "Update transaction" : "Save transaction";
  })();

  useEffect(() => {
    setInstrumentOptions(instruments);

    if (editingTransaction) {
      setValues(createValuesFromTransaction(editingTransaction));
      setInstrumentSearch(getTransactionInstrumentLabel(editingTransaction, instruments));
      setHighlightedInstrumentId(String(editingTransaction.instrumentId));
      setIsInstrumentComboboxOpen(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      return;
    }

    setValues((currentValues) => {
      const instrumentId = getSynchronizedInstrumentId(currentValues.instrumentId, instruments);

      if (instrumentId === currentValues.instrumentId) {
        return currentValues;
      }

      return {
        ...currentValues,
        instrumentId
      };
    });
  }, [editingTransaction, instruments]);

  useEffect(() => {
    if (!isInstrumentComboboxOpen && selectedInstrument) {
      setInstrumentSearch(selectedInstrument?.label ?? "");
    }
  }, [isInstrumentComboboxOpen, selectedInstrument]);

  useEffect(() => {
    if (!isInstrumentComboboxOpen) {
      return;
    }

    const hasHighlightedOption = visibleInstrumentOptions.some(
      (instrument) => String(instrument.id) === highlightedInstrumentId
    );

    if (hasHighlightedOption) {
      return;
    }

    setHighlightedInstrumentId(
      visibleInstrumentOptions[0] ? String(visibleInstrumentOptions[0].id) : null
    );
  }, [highlightedInstrumentId, isInstrumentComboboxOpen, visibleInstrumentOptions]);

  useEffect(() => {
    if (!isInstrumentComboboxOpen) {
      return;
    }

    const exactInstrument = findExactInstrumentSearchMatch(visibleInstrumentOptions, instrumentSearch);

    if (!exactInstrument || String(exactInstrument.id) === values.instrumentId) {
      return;
    }

    setValues((currentValues) => ({
      ...currentValues,
      instrumentId: String(exactInstrument.id)
    }));
  }, [instrumentSearch, isInstrumentComboboxOpen, values.instrumentId, visibleInstrumentOptions]);

  useEffect(() => {
    if (!isInstrumentFormOpen) {
      return;
    }

    const query = instrumentLookupQuery.trim();

    if (query.length < 2) {
      setInstrumentLookupResults([]);
      setIsSearchingInstruments(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingInstruments(true);
      setInstrumentErrorMessage(null);

      try {
        const response = await fetch(`/api/instruments/search?query=${encodeURIComponent(query)}`, {
          signal: abortController.signal
        });
        const payload = (await response.json()) as InstrumentSearchApiResponse;

        if (!response.ok) {
          throw new Error(getErrorMessage(payload.error));
        }

        setInstrumentLookupResults(payload.results ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setInstrumentLookupResults([]);
        setInstrumentErrorMessage(
          error instanceof Error ? error.message : "Instrument search is unavailable right now."
        );
      } finally {
        setIsSearchingInstruments(false);
      }
    }, 220);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [instrumentLookupQuery, isInstrumentFormOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstrument) {
      setErrorMessage("Select an instrument from the list before saving.");
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const transactionPayload = {
        instrumentId: Number(values.instrumentId),
        tradeDate: values.tradeDate,
        side: values.side,
        quantity: Number(values.quantity),
        price: Number(values.price),
        fee: Number(values.fee || "0"),
        notes: values.notes
      };
      const response = await fetch("/api/transactions", {
        method: editingTransaction ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          editingTransaction
            ? {
                id: editingTransaction.id,
                ...transactionPayload
              }
            : transactionPayload
        )
      });

      const payload = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload.error,
            isEditing ? "Transaction could not be updated." : "Transaction could not be saved."
          )
        );
      }

      setValues(createInitialValues(instrumentOptions));
      setInstrumentSearch(getInitialInstrumentSearch(instrumentOptions));
      setSuccessMessage(isEditing ? "Transaction updated." : "Transaction saved.");
      startTransition(() => {
        if (isEditing) {
          router.push("/transactions");
        }

        router.refresh();
      });
    } catch (error) {
      const fallbackErrorMessage = isEditing
        ? "Transaction could not be updated."
        : "Transaction could not be saved.";

      setErrorMessage(
        error instanceof Error
          ? error.message
          : fallbackErrorMessage
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateValue<Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key]
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [key]: value
    }));
  }

  function resetForm() {
    setValues(createInitialValues(instrumentOptions));
    setInstrumentSearch(getInitialInstrumentSearch(instrumentOptions));
    setIsInstrumentComboboxOpen(false);
    setHighlightedInstrumentId(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleCancelEdit() {
    resetForm();
    startTransition(() => {
      router.push("/transactions");
    });
  }

  async function createAndSelectInstrument(instrumentValues: NewInstrumentFormValues) {
    setIsCreatingInstrument(true);
    setInstrumentErrorMessage(null);
    setInstrumentSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/instruments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(instrumentValues)
      });

      const payload = (await response.json()) as InstrumentApiResponse;

      if (!response.ok || !payload.instrument) {
        throw new Error(getErrorMessage(payload.error));
      }

      const createdInstrument = payload.instrument;

      setInstrumentOptions((currentOptions) => {
        const withoutDuplicate = currentOptions.filter(
          (instrument) => instrument.id !== createdInstrument.id
        );

        return sortInstrumentOptions([...withoutDuplicate, createdInstrument]);
      });
      setInstrumentSearch(createdInstrument.label);
      setInstrumentLookupQuery("");
      setInstrumentLookupResults([]);
      setValues((currentValues) => ({
        ...currentValues,
        instrumentId: String(createdInstrument.id)
      }));
      setIsInstrumentFormOpen(false);
      setInstrumentSuccessMessage(`${createdInstrument.symbol} added and selected.`);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setInstrumentErrorMessage(
        error instanceof Error ? error.message : "Instrument could not be saved."
      );
    } finally {
      setIsCreatingInstrument(false);
    }
  }

  function handleInstrumentLookupSelect(instrumentValues: NewInstrumentFormValues) {
    const existingInstrument = instrumentOptions.find(
      (instrument) =>
        normalizeInstrumentSearchValue(instrument.symbol) ===
          normalizeInstrumentSearchValue(instrumentValues.symbol) ||
        normalizeInstrumentSearchValue(instrument.providerSymbol ?? "") ===
          normalizeInstrumentSearchValue(instrumentValues.providerSymbol)
    );

    if (existingInstrument) {
      selectInstrument(existingInstrument);
      setInstrumentLookupQuery("");
      setInstrumentLookupResults([]);
      setIsInstrumentFormOpen(false);
      setInstrumentSuccessMessage(`${existingInstrument.symbol} selected.`);
      return;
    }

    void createAndSelectInstrument(instrumentValues);
  }

  function selectInstrument(instrument: TransactionInstrumentOption) {
    updateValue("instrumentId", String(instrument.id));
    setInstrumentSearch(instrument.label);
    setHighlightedInstrumentId(String(instrument.id));
    setIsInstrumentComboboxOpen(false);
  }

  function handleInstrumentSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isInstrumentComboboxOpen && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      setIsInstrumentComboboxOpen(true);
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (visibleInstrumentOptions.length === 0) {
        setHighlightedInstrumentId(null);
        return;
      }

      const currentIndex = visibleInstrumentOptions.findIndex(
        (instrument) => String(instrument.id) === highlightedInstrumentId
      );
      const fallbackIndex = event.key === "ArrowDown" ? -1 : 0;
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % visibleInstrumentOptions.length
          : (currentIndex === -1 ? fallbackIndex : currentIndex - 1 + visibleInstrumentOptions.length) %
            visibleInstrumentOptions.length;

      setHighlightedInstrumentId(String(visibleInstrumentOptions[nextIndex].id));
      return;
    }

    if (event.key === "Enter" && isInstrumentComboboxOpen) {
      const highlightedInstrument =
        visibleInstrumentOptions.find(
          (instrument) => String(instrument.id) === highlightedInstrumentId
        ) ?? visibleInstrumentOptions[0];

      if (highlightedInstrument) {
        event.preventDefault();
        selectInstrument(highlightedInstrument);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsInstrumentComboboxOpen(false);
      setInstrumentSearch(selectedInstrument?.label ?? "");
    }
  }

  return (
    <article className="surface-card transaction-panel">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">{isEditing ? "Edit transaction" : "New transaction"}</p>
          <h2 className="section-title">
            {isEditing ? "Update trade" : "Record trade"}
          </h2>
        </div>
      </div>

      <div className="instrument-manager">
        <div className="instrument-manager-header">
          <div>
            <span className="field-label">Instrument</span>
            <p className="field-hint">Search a saved instrument or add a new one.</p>
          </div>
          <button
            type="button"
            className="compact-button"
            onClick={() => {
              setIsInstrumentFormOpen((isOpen) => !isOpen);
              setInstrumentErrorMessage(null);
              setInstrumentSuccessMessage(null);
            }}
          >
            {isInstrumentFormOpen ? "Close" : "Add instrument"}
          </button>
        </div>

        {isInstrumentFormOpen ? (
          <div className="instrument-lookup">
            <label className="field-group">
              <span className="field-label">Search instrument</span>
              <input
                type="text"
                value={instrumentLookupQuery}
                onChange={(event) => setInstrumentLookupQuery(event.target.value)}
                placeholder="Type ASTS03, AAPL, or a company name"
                autoComplete="off"
                disabled={isCreatingInstrument}
              />
            </label>

            {instrumentLookupQuery.trim().length >= 2 ? (
              <div className="instrument-lookup-menu">
                {isSearchingInstruments ? (
                  <div className="instrument-combobox-empty" role="status">
                    Searching...
                  </div>
                ) : instrumentLookupResults.length > 0 ? (
                  instrumentLookupResults.map((instrument) => {
                    const existingInstrument = instrumentOptions.find(
                      (option) =>
                        normalizeInstrumentSearchValue(option.symbol) ===
                          normalizeInstrumentSearchValue(instrument.symbol) ||
                        normalizeInstrumentSearchValue(option.providerSymbol ?? "") ===
                          normalizeInstrumentSearchValue(instrument.providerSymbol)
                    );

                    return (
                      <button
                        key={instrument.providerSymbol}
                        type="button"
                        className="instrument-combobox-option"
                        onClick={() => handleInstrumentLookupSelect(instrument)}
                        disabled={isCreatingInstrument}
                      >
                        <span className="instrument-combobox-symbol">{instrument.symbol}</span>
                        <span className="instrument-combobox-name">{instrument.displayName}</span>
                        <span className="instrument-combobox-meta">
                          {existingInstrument ? "Saved" : "Add"} · {instrument.market} ·{" "}
                          {instrument.currency} · {instrument.providerSymbol}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="instrument-combobox-empty" role="status">
                    No matching instruments
                  </div>
                )}
              </div>
            ) : null}

            {instrumentErrorMessage ? (
              <p className="form-banner form-banner-error">{instrumentErrorMessage}</p>
            ) : null}
            {instrumentSuccessMessage ? (
              <p className="form-banner form-banner-success">{instrumentSuccessMessage}</p>
            ) : null}
          </div>
        ) : instrumentSuccessMessage ? (
          <p className="form-banner form-banner-success">{instrumentSuccessMessage}</p>
        ) : null}
      </div>

      {instrumentOptions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No instruments are available. Add an instrument before recording trades.</p>
        </div>
      ) : (
        <form className="transaction-form" onSubmit={handleSubmit}>
          <label className="field-group field-group-wide">
            <span className="field-label">Instrument</span>
            <div
              className="instrument-combobox"
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) {
                  return;
                }

                setIsInstrumentComboboxOpen(false);
                if (selectedInstrument) {
                  setInstrumentSearch(selectedInstrument.label);
                }
              }}
            >
              <input
                type="text"
                name="instrumentSearch"
                value={instrumentSearch}
                onChange={(event) => {
                  const nextSearch = event.target.value;
                  const exactInstrument = findExactInstrumentSearchMatch(
                    instrumentOptions,
                    nextSearch
                  );

                  setInstrumentSearch(nextSearch);
                  setIsInstrumentComboboxOpen(true);
                  setValues((currentValues) => ({
                    ...currentValues,
                    instrumentId: exactInstrument ? String(exactInstrument.id) : ""
                  }));
                }}
                onFocus={() => {
                  setIsInstrumentComboboxOpen(true);
                  setHighlightedInstrumentId(values.instrumentId);
                }}
                onKeyDown={handleInstrumentSearchKeyDown}
                role="combobox"
                aria-expanded={isInstrumentComboboxOpen}
                aria-controls="instrument-options"
                aria-autocomplete="list"
                aria-activedescendant={
                  highlightedInstrumentId ? `instrument-option-${highlightedInstrumentId}` : undefined
                }
                autoComplete="off"
                placeholder="Choose an instrument"
                disabled={isDisabled}
                required
              />
              <input type="hidden" name="instrumentId" value={values.instrumentId} />
              {isInstrumentComboboxOpen ? (
                <div className="instrument-combobox-menu" id="instrument-options" role="listbox">
                  {visibleInstrumentOptions.length > 0 ? (
                    visibleInstrumentOptions.map((instrument) => {
                      const instrumentId = String(instrument.id);
                      const isSelected = instrumentId === values.instrumentId;
                      const isHighlighted = instrumentId === highlightedInstrumentId;

                      return (
                        <button
                          key={instrument.id}
                          id={`instrument-option-${instrument.id}`}
                          type="button"
                          className="instrument-combobox-option"
                          data-highlighted={isHighlighted}
                          data-selected={isSelected}
                          role="option"
                          aria-selected={isSelected}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedInstrumentId(instrumentId)}
                          onClick={() => selectInstrument(instrument)}
                        >
                          <span className="instrument-combobox-symbol">{instrument.symbol}</span>
                          <span className="instrument-combobox-name">{instrument.displayName}</span>
                          <span className="instrument-combobox-meta">
                            {instrument.market} · {instrument.currency}
                            {instrument.providerSymbol ? ` · ${instrument.providerSymbol}` : ""}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="instrument-combobox-empty" role="status">
                      No matching instruments
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            {selectedInstrument ? (
              <span className="field-hint">
                Current quantity: {formatQuantity(selectedInstrument.currentQuantity)} units
              </span>
            ) : instrumentSearch.trim().length > 0 ? (
              <span className="field-hint field-hint-warning">
                Select a matching instrument before saving.
              </span>
            ) : null}
          </label>

          <label className="field-group">
            <span className="field-label">Trade date</span>
            <input
              type="date"
              name="tradeDate"
              value={values.tradeDate}
              onChange={(event) => updateValue("tradeDate", event.target.value)}
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">Side</span>
            <select
              name="side"
              value={values.side}
              onChange={(event) => updateValue("side", event.target.value as "BUY" | "SELL")}
              disabled={isDisabled}
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>

          <label className="field-group">
            <span className="field-label">Quantity</span>
            <input
              type="number"
              name="quantity"
              value={values.quantity}
              onChange={(event) => updateValue("quantity", event.target.value)}
              min="0.000001"
              step="0.000001"
              inputMode="decimal"
              placeholder="0.000000"
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">Price</span>
            <input
              type="number"
              name="price"
              value={values.price}
              onChange={(event) => updateValue("price", event.target.value)}
              min="0.0001"
              step="0.0001"
              inputMode="decimal"
              placeholder="0.0000"
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">Fee</span>
            <input
              type="number"
              name="fee"
              value={values.fee}
              onChange={(event) => updateValue("fee", event.target.value)}
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group field-group-wide">
            <span className="field-label">Notes</span>
            <textarea
              name="notes"
              value={values.notes}
              onChange={(event) => updateValue("notes", event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Optional note, such as broker, fill context, or trade reason"
              disabled={isDisabled}
            />
          </label>

          {errorMessage ? <p className="form-banner form-banner-error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-banner form-banner-success">{successMessage}</p> : null}

          <div className="transaction-form-footer">
            {isEditing ? (
              <button
                type="button"
                className="compact-button"
                onClick={handleCancelEdit}
                disabled={isSubmitting || isRefreshing}
              >
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="primary-button" disabled={isSubmitDisabled}>
              {submitButtonLabel}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
