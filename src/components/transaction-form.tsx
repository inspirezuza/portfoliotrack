"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ButtonLoadingContent,
  LoadingIndicator,
  PendingBanner,
} from "@/components/loading-indicator";
import { formatQuantity } from "@/lib/format";
import {
  findExactInstrumentSearchMatch,
  sortInstrumentOptions,
} from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import {
  createInitialValues,
  createTransactionRequestBody,
  createValuesFromTransaction,
  findExistingInstrumentForLookup,
  getErrorMessage,
  getInitialInstrumentSearch,
  getInstrumentLookupLabel,
  getSynchronizedInstrumentId,
  getTransactionSubmitButtonLabel,
  getTransactionInstrumentLabel,
  getVisibleInstrumentOptions,
  type ApiErrorResponse,
  type InstrumentApiResponse,
  type InstrumentSearchApiResponse,
  type InstrumentSearchResult,
  type NewInstrumentFormValues,
  type TransactionFormValues,
} from "@/components/transaction-form/form-helpers";

type TransactionFormProps = {
  instruments: TransactionInstrumentOption[];
  editingTransaction?: TransactionListItem | null;
  language: UiLanguage;
  onCloseEdit?: () => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
};

export function TransactionForm({
  instruments,
  editingTransaction = null,
  language,
  onCloseEdit,
  onWorkspaceRefresh,
}: TransactionFormProps) {
  const copy = getUiCopy(language);
  const locale = getUiLocale(language);
  const isEditing = editingTransaction != null;
  const [instrumentOptions, setInstrumentOptions] =
    useState<TransactionInstrumentOption[]>(instruments);
  const [values, setValues] = useState<TransactionFormValues>(() =>
    editingTransaction
      ? createValuesFromTransaction(editingTransaction)
      : createInitialValues(instruments),
  );
  const [instrumentSearch, setInstrumentSearch] = useState(() =>
    editingTransaction
      ? getTransactionInstrumentLabel(editingTransaction, instruments)
      : getInitialInstrumentSearch(instruments),
  );
  const [isInstrumentComboboxOpen, setIsInstrumentComboboxOpen] = useState(false);
  const [highlightedInstrumentId, setHighlightedInstrumentId] = useState<string | null>(null);
  const [instrumentLookupQuery, setInstrumentLookupQuery] = useState("");
  const [isInstrumentLookupMenuOpen, setIsInstrumentLookupMenuOpen] = useState(false);
  const [instrumentLookupResults, setInstrumentLookupResults] = useState<InstrumentSearchResult[]>(
    [],
  );
  const [selectedInstrumentLookupResult, setSelectedInstrumentLookupResult] =
    useState<InstrumentSearchResult | null>(null);
  const [isSearchingInstruments, setIsSearchingInstruments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [instrumentErrorMessage, setInstrumentErrorMessage] = useState<string | null>(null);
  const [instrumentSuccessMessage, setInstrumentSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingInstrument, setIsCreatingInstrument] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const selectedInstrument =
    instrumentOptions.find((instrument) => String(instrument.id) === values.instrumentId) ?? null;

  const visibleInstrumentOptions = useMemo(
    () => getVisibleInstrumentOptions(instrumentOptions, instrumentSearch),
    [instrumentOptions, instrumentSearch],
  );

  const isDisabled = instrumentOptions.length === 0 || isSubmitting || isRefreshing;
  const isSubmitDisabled = isDisabled || selectedInstrument == null;
  const submitIdleButtonLabel = getTransactionSubmitButtonLabel({
    copy,
    isEditing,
    isRefreshing: false,
    isSubmitting: false,
  });
  const submitButtonLabel = getTransactionSubmitButtonLabel({
    copy,
    isEditing,
    isRefreshing,
    isSubmitting,
  });
  const isFormBusy = isSubmitting || isRefreshing;

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
        instrumentId,
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
      (instrument) => String(instrument.id) === highlightedInstrumentId,
    );

    if (hasHighlightedOption) {
      return;
    }

    setHighlightedInstrumentId(
      visibleInstrumentOptions[0] ? String(visibleInstrumentOptions[0].id) : null,
    );
  }, [highlightedInstrumentId, isInstrumentComboboxOpen, visibleInstrumentOptions]);

  useEffect(() => {
    if (!isInstrumentComboboxOpen) {
      return;
    }

    const exactInstrument = findExactInstrumentSearchMatch(
      visibleInstrumentOptions,
      instrumentSearch,
    );

    if (!exactInstrument || String(exactInstrument.id) === values.instrumentId) {
      return;
    }

    setValues((currentValues) => ({
      ...currentValues,
      instrumentId: String(exactInstrument.id),
    }));
  }, [instrumentSearch, isInstrumentComboboxOpen, values.instrumentId, visibleInstrumentOptions]);

  useEffect(() => {
    const query = instrumentLookupQuery.trim();

    if (query.length < 2) {
      setInstrumentLookupResults([]);
      setIsInstrumentLookupMenuOpen(false);
      setIsSearchingInstruments(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingInstruments(true);
      setInstrumentErrorMessage(null);

      try {
        const response = await fetch(`/api/instruments/search?query=${encodeURIComponent(query)}`, {
          signal: abortController.signal,
        });
        const payload = (await response.json()) as InstrumentSearchApiResponse;

        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload.error, copy.transactions.form.couldNotSave, language),
          );
        }

        setInstrumentLookupResults(payload.results ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setInstrumentLookupResults([]);
        setInstrumentErrorMessage(
          error instanceof Error
            ? error.message
            : copy.transactions.form.instrumentSearchUnavailable,
        );
      } finally {
        setIsSearchingInstruments(false);
      }
    }, 220);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    copy.transactions.form.couldNotSave,
    copy.transactions.form.instrumentSearchUnavailable,
    instrumentLookupQuery,
    language,
  ]);

  async function refreshWorkspace() {
    if (!onWorkspaceRefresh) {
      return;
    }

    setIsRefreshing(true);

    try {
      await onWorkspaceRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstrument) {
      setErrorMessage(copy.transactions.form.selectBeforeSaving);
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/transactions", {
        method: editingTransaction ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createTransactionRequestBody(values, editingTransaction)),
      });

      const payload = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload.error,
            isEditing ? copy.transactions.form.couldNotUpdate : copy.transactions.form.couldNotSave,
            language,
          ),
        );
      }

      setValues(createInitialValues(instrumentOptions));
      setInstrumentSearch(getInitialInstrumentSearch(instrumentOptions));
      setSuccessMessage(
        isEditing
          ? copy.transactions.form.transactionUpdated
          : copy.transactions.form.transactionSaved,
      );
      if (isEditing) {
        onCloseEdit?.();
      }
      await refreshWorkspace();
    } catch (error) {
      const fallbackErrorMessage = isEditing
        ? copy.transactions.form.couldNotUpdate
        : copy.transactions.form.couldNotSave;

      setErrorMessage(error instanceof Error ? error.message : fallbackErrorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateValue<Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key],
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [key]: value,
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
    onCloseEdit?.();
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
          "Content-Type": "application/json",
        },
        body: JSON.stringify(instrumentValues),
      });

      const payload = (await response.json()) as InstrumentApiResponse;

      if (!response.ok || !payload.instrument) {
        throw new Error(
          getErrorMessage(payload.error, copy.transactions.form.instrumentCouldNotSave, language),
        );
      }

      const createdInstrument = payload.instrument;

      setInstrumentOptions((currentOptions) => {
        const withoutDuplicate = currentOptions.filter(
          (instrument) => instrument.id !== createdInstrument.id,
        );

        return sortInstrumentOptions([...withoutDuplicate, createdInstrument]);
      });
      setInstrumentSearch(createdInstrument.label);
      setInstrumentLookupQuery("");
      setIsInstrumentLookupMenuOpen(false);
      setInstrumentLookupResults([]);
      setSelectedInstrumentLookupResult(null);
      setValues((currentValues) => ({
        ...currentValues,
        instrumentId: String(createdInstrument.id),
      }));
      setInstrumentSuccessMessage(
        copy.transactions.form.addedAndSelected(createdInstrument.symbol),
      );
      await refreshWorkspace();
    } catch (error) {
      setInstrumentErrorMessage(
        error instanceof Error ? error.message : copy.transactions.form.instrumentCouldNotSave,
      );
    } finally {
      setIsCreatingInstrument(false);
    }
  }

  function handleInstrumentLookupSelect(instrumentValues: InstrumentSearchResult) {
    setSelectedInstrumentLookupResult(instrumentValues);
    setInstrumentLookupQuery(getInstrumentLookupLabel(instrumentValues));
    setIsInstrumentLookupMenuOpen(false);
    setInstrumentErrorMessage(null);
    setInstrumentSuccessMessage(null);
  }

  function handleInstrumentLookupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInstrumentLookupResult) {
      return;
    }

    const existingInstrument = findExistingInstrumentForLookup(
      instrumentOptions,
      selectedInstrumentLookupResult,
    );

    if (existingInstrument) {
      setInstrumentSuccessMessage(null);
      setInstrumentErrorMessage(
        copy.transactions.form.instrumentAlreadyAdded(existingInstrument.symbol),
      );
      return;
    }

    void createAndSelectInstrument(selectedInstrumentLookupResult);
  }

  function selectInstrument(instrument: TransactionInstrumentOption) {
    updateValue("instrumentId", String(instrument.id));
    setInstrumentSearch(instrument.label);
    setHighlightedInstrumentId(String(instrument.id));
    setIsInstrumentComboboxOpen(false);
  }

  function clearInstrumentLookup() {
    setInstrumentLookupQuery("");
    setIsInstrumentLookupMenuOpen(false);
    setInstrumentLookupResults([]);
    setSelectedInstrumentLookupResult(null);
    setInstrumentErrorMessage(null);
    setInstrumentSuccessMessage(null);
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
        (instrument) => String(instrument.id) === highlightedInstrumentId,
      );
      const fallbackIndex = event.key === "ArrowDown" ? -1 : 0;
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % visibleInstrumentOptions.length
          : (currentIndex === -1
              ? fallbackIndex
              : currentIndex - 1 + visibleInstrumentOptions.length) %
            visibleInstrumentOptions.length;

      setHighlightedInstrumentId(String(visibleInstrumentOptions[nextIndex].id));
      return;
    }

    if (event.key === "Enter" && isInstrumentComboboxOpen) {
      const highlightedInstrument =
        visibleInstrumentOptions.find(
          (instrument) => String(instrument.id) === highlightedInstrumentId,
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
    <article
      className="surface-card transaction-panel"
      aria-busy={isFormBusy || isCreatingInstrument}
    >
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">
            {isEditing ? copy.transactions.form.editEyebrow : copy.transactions.form.newEyebrow}
          </p>
          <h2 className="section-title">
            {isEditing ? copy.transactions.form.updateTitle : copy.transactions.form.recordTitle}
          </h2>
        </div>
      </div>

      <div className="instrument-manager">
        <div className="instrument-manager-header">
          <div>
            <span className="field-label">{copy.transactions.form.instrument}</span>
            <p className="field-hint">{copy.transactions.form.instrumentHint}</p>
          </div>
        </div>

        <form
          className="instrument-lookup"
          onSubmit={handleInstrumentLookupSubmit}
          aria-busy={isCreatingInstrument || isSearchingInstruments}
        >
          <label className="field-group">
            <span className="field-label">{copy.transactions.form.searchInstrument}</span>
            <span className="instrument-lookup-search">
              <input
                type="text"
                value={instrumentLookupQuery}
                onChange={(event) => {
                  setInstrumentLookupQuery(event.target.value);
                  setIsInstrumentLookupMenuOpen(event.target.value.trim().length >= 2);
                  setSelectedInstrumentLookupResult(null);
                  setInstrumentErrorMessage(null);
                  setInstrumentSuccessMessage(null);
                }}
                onFocus={() => {
                  if (!selectedInstrumentLookupResult && instrumentLookupQuery.trim().length >= 2) {
                    setIsInstrumentLookupMenuOpen(true);
                  }
                }}
                placeholder={copy.transactions.form.searchInstrumentPlaceholder}
                autoComplete="off"
                disabled={isCreatingInstrument}
              />
              {instrumentLookupQuery.trim().length > 0 ? (
                <button
                  type="button"
                  className="instrument-lookup-clear"
                  onClick={clearInstrumentLookup}
                  aria-label={copy.transactions.form.clearInstrumentSearch}
                  disabled={isCreatingInstrument}
                >
                  x
                </button>
              ) : null}
            </span>
          </label>

          {isInstrumentLookupMenuOpen && instrumentLookupQuery.trim().length >= 2 ? (
            <div className="instrument-lookup-menu">
              {isSearchingInstruments ? (
                <div className="instrument-combobox-empty" role="status">
                  <LoadingIndicator label={copy.transactions.form.searching} size="sm" />
                </div>
              ) : instrumentLookupResults.length > 0 ? (
                instrumentLookupResults.map((instrument) => {
                  const existingInstrument = findExistingInstrumentForLookup(
                    instrumentOptions,
                    instrument,
                  );
                  const isSelected =
                    selectedInstrumentLookupResult?.providerSymbol === instrument.providerSymbol;

                  return (
                    <button
                      key={instrument.providerSymbol}
                      type="button"
                      className="instrument-combobox-option"
                      data-selected={isSelected}
                      onClick={() => handleInstrumentLookupSelect(instrument)}
                      disabled={isCreatingInstrument}
                    >
                      <span className="instrument-combobox-symbol">{instrument.symbol}</span>
                      <span className="instrument-combobox-name">{instrument.displayName}</span>
                      <span className="instrument-combobox-meta">
                        {existingInstrument
                          ? copy.transactions.form.saved
                          : copy.transactions.form.add}
                        {copy.shared.separator}
                        {instrument.instrumentType}
                        {copy.shared.separator}
                        {instrument.market}
                        {copy.shared.separator}
                        {instrument.currency}
                        {copy.shared.separator}
                        {instrument.providerSymbol}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="instrument-combobox-empty" role="status">
                  {copy.transactions.form.noMatchingInstruments}
                </div>
              )}
            </div>
          ) : null}

          <button
            type="submit"
            className="compact-button instrument-lookup-submit"
            disabled={!selectedInstrumentLookupResult || isCreatingInstrument}
          >
            {isCreatingInstrument ? (
              <ButtonLoadingContent label={copy.transactions.form.addingInstrument}>
                {copy.transactions.form.addInstrument}
              </ButtonLoadingContent>
            ) : (
              copy.transactions.form.addInstrument
            )}
          </button>
          {instrumentErrorMessage ? (
            <p className="form-banner form-banner-error">{instrumentErrorMessage}</p>
          ) : null}
          {instrumentSuccessMessage ? (
            <p className="form-banner form-banner-success">{instrumentSuccessMessage}</p>
          ) : null}
        </form>
      </div>

      {instrumentOptions.length === 0 ? (
        <div className="transaction-empty-state">
          <p>{copy.transactions.form.noInstruments}</p>
        </div>
      ) : (
        <form className="transaction-form" onSubmit={handleSubmit} aria-busy={isFormBusy}>
          {isFormBusy ? <PendingBanner label={submitButtonLabel} /> : null}

          <label className="field-group field-group-wide">
            <span className="field-label">{copy.transactions.form.instrument}</span>
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
                    nextSearch,
                  );

                  setInstrumentSearch(nextSearch);
                  setIsInstrumentComboboxOpen(true);
                  setValues((currentValues) => ({
                    ...currentValues,
                    instrumentId: exactInstrument ? String(exactInstrument.id) : "",
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
                  highlightedInstrumentId
                    ? `instrument-option-${highlightedInstrumentId}`
                    : undefined
                }
                autoComplete="off"
                placeholder={copy.transactions.form.chooseInstrument}
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
                            {instrument.market}
                            {copy.shared.separator}
                            {instrument.instrumentType}
                            {copy.shared.separator}
                            {instrument.currency}
                            {instrument.providerSymbol
                              ? `${copy.shared.separator}${instrument.providerSymbol}`
                              : ""}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="instrument-combobox-empty" role="status">
                      {copy.transactions.form.noMatchingInstruments}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            {selectedInstrument ? (
              <span className="field-hint">
                {copy.transactions.form.currentQuantity(
                  formatQuantity(selectedInstrument.currentQuantity, { locale }),
                )}
              </span>
            ) : instrumentSearch.trim().length > 0 ? (
              <span className="field-hint field-hint-warning">
                {copy.transactions.form.selectBeforeSaving}
              </span>
            ) : null}
          </label>

          <label className="field-group">
            <span className="field-label">{copy.transactions.form.tradeDate}</span>
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
            <span className="field-label">{copy.transactions.form.side}</span>
            <select
              name="side"
              value={values.side}
              onChange={(event) => updateValue("side", event.target.value as "BUY" | "SELL")}
              disabled={isDisabled}
            >
              <option value="BUY">{copy.transactions.form.buy}</option>
              <option value="SELL">{copy.transactions.form.sell}</option>
            </select>
          </label>

          <label className="field-group">
            <span className="field-label">{copy.transactions.form.broker}</span>
            <div
              className="broker-segmented-control"
              role="radiogroup"
              aria-label={copy.transactions.form.broker}
            >
              {(["DIME", "WEBULL"] as const).map((broker) => (
                <button
                  key={broker}
                  type="button"
                  className="broker-segmented-option"
                  data-selected={values.broker === broker}
                  role="radio"
                  aria-checked={values.broker === broker}
                  onClick={() => updateValue("broker", broker)}
                  disabled={isDisabled}
                >
                  {broker === "DIME" ? "Dime" : "Webull"}
                </button>
              ))}
            </div>
            <input type="hidden" name="broker" value={values.broker} />
          </label>

          <label className="field-group">
            <span className="field-label">{copy.transactions.form.quantity}</span>
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
            <span className="field-label">{copy.transactions.form.price}</span>
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
            <span className="field-label">{copy.transactions.form.fee}</span>
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
            <span className="field-label">{copy.transactions.form.notes}</span>
            <textarea
              name="notes"
              value={values.notes}
              onChange={(event) => updateValue("notes", event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={copy.transactions.form.notesPlaceholder}
              disabled={isDisabled}
            />
          </label>

          {errorMessage ? <p className="form-banner form-banner-error">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="form-banner form-banner-success">{successMessage}</p>
          ) : null}

          <div className="transaction-form-footer">
            {isEditing ? (
              <button
                type="button"
                className="compact-button"
                onClick={handleCancelEdit}
                disabled={isSubmitting || isRefreshing}
              >
                {copy.transactions.form.cancelEdit}
              </button>
            ) : null}
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitDisabled}
              aria-busy={isFormBusy}
            >
              {isFormBusy ? (
                <ButtonLoadingContent label={submitButtonLabel}>
                  {submitIdleButtonLabel}
                </ButtonLoadingContent>
              ) : (
                submitButtonLabel
              )}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
