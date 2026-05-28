"use client";

import { useEffect, useMemo, useState } from "react";
import { PendingBanner } from "@/components/loading-indicator";
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
  getInstrumentSearchKeyAction,
  getInstrumentLookupLabel,
  getNextTransactionFormSyncState,
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
import { TransactionFormFields } from "@/components/transaction-form/form-fields";
import { TransactionInstrumentCombobox } from "@/components/transaction-form/instrument-combobox";
import { InstrumentLookupPanel } from "@/components/transaction-form/instrument-lookup";
import {
  TransactionFormEmptyState,
  TransactionFormFooter,
  TransactionFormHeader,
} from "@/components/transaction-form/panel-sections";

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
      const nextState = getNextTransactionFormSyncState({
        currentValues: createValuesFromTransaction(editingTransaction),
        editingTransaction,
        instruments,
      });

      setValues(nextState.values);
      setInstrumentSearch(nextState.instrumentSearch ?? "");
      setHighlightedInstrumentId(nextState.highlightedInstrumentId ?? null);
      setIsInstrumentComboboxOpen(nextState.isInstrumentComboboxOpen ?? false);
      setErrorMessage(nextState.errorMessage ?? null);
      setSuccessMessage(nextState.successMessage ?? null);
      return;
    }

    setValues((currentValues) => {
      const nextState = getNextTransactionFormSyncState({
        currentValues,
        editingTransaction: null,
        instruments,
      });

      return nextState.values;
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
    const action = getInstrumentSearchKeyAction({
      currentHighlightedInstrumentId: highlightedInstrumentId,
      isInstrumentComboboxOpen,
      key: event.key,
      selectedInstrumentLabel: selectedInstrument?.label ?? "",
      visibleInstrumentOptions,
    });

    if (action == null) {
      return;
    }

    setIsInstrumentComboboxOpen(action.isInstrumentComboboxOpen);

    if (action.highlightedInstrumentId !== highlightedInstrumentId) {
      setHighlightedInstrumentId(action.highlightedInstrumentId);
    }

    if (action.preventDefault) {
      event.preventDefault();
    }

    if (action.selectedInstrument) {
      selectInstrument(action.selectedInstrument);
      return;
    }

    if (action.instrumentSearch != null) {
      setInstrumentSearch(action.instrumentSearch);
    }
  }

  return (
    <article
      className="surface-card transaction-panel"
      aria-busy={isFormBusy || isCreatingInstrument}
    >
      <TransactionFormHeader copy={copy} isEditing={isEditing} />

      <InstrumentLookupPanel
        copy={copy}
        instrumentErrorMessage={instrumentErrorMessage}
        instrumentLookupQuery={instrumentLookupQuery}
        instrumentLookupResults={instrumentLookupResults}
        instrumentOptions={instrumentOptions}
        instrumentSuccessMessage={instrumentSuccessMessage}
        isCreatingInstrument={isCreatingInstrument}
        isInstrumentLookupMenuOpen={isInstrumentLookupMenuOpen}
        isSearchingInstruments={isSearchingInstruments}
        onClear={clearInstrumentLookup}
        onFocus={() => {
          if (!selectedInstrumentLookupResult && instrumentLookupQuery.trim().length >= 2) {
            setIsInstrumentLookupMenuOpen(true);
          }
        }}
        onQueryChange={(nextQuery) => {
          setInstrumentLookupQuery(nextQuery);
          setIsInstrumentLookupMenuOpen(nextQuery.trim().length >= 2);
          setSelectedInstrumentLookupResult(null);
          setInstrumentErrorMessage(null);
          setInstrumentSuccessMessage(null);
        }}
        onSelect={handleInstrumentLookupSelect}
        onSubmit={handleInstrumentLookupSubmit}
        selectedInstrumentLookupResult={selectedInstrumentLookupResult}
      />

      {instrumentOptions.length === 0 ? (
        <TransactionFormEmptyState copy={copy} />
      ) : (
        <form className="transaction-form" onSubmit={handleSubmit} aria-busy={isFormBusy}>
          {isFormBusy ? <PendingBanner label={submitButtonLabel} /> : null}

          <TransactionInstrumentCombobox
            copy={copy}
            highlightedInstrumentId={highlightedInstrumentId}
            instrumentSearch={instrumentSearch}
            isDisabled={isDisabled}
            isInstrumentComboboxOpen={isInstrumentComboboxOpen}
            locale={locale}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) {
                return;
              }

              setIsInstrumentComboboxOpen(false);
              if (selectedInstrument) {
                setInstrumentSearch(selectedInstrument.label);
              }
            }}
            onFocus={() => {
              setIsInstrumentComboboxOpen(true);
              setHighlightedInstrumentId(values.instrumentId);
            }}
            onInstrumentSearchChange={(nextSearch) => {
              const exactInstrument = findExactInstrumentSearchMatch(instrumentOptions, nextSearch);

              setInstrumentSearch(nextSearch);
              setIsInstrumentComboboxOpen(true);
              setValues((currentValues) => ({
                ...currentValues,
                instrumentId: exactInstrument ? String(exactInstrument.id) : "",
              }));
            }}
            onKeyDown={handleInstrumentSearchKeyDown}
            onMouseEnterOption={setHighlightedInstrumentId}
            onSelectInstrument={selectInstrument}
            selectedInstrument={selectedInstrument}
            selectedInstrumentId={values.instrumentId}
            visibleInstrumentOptions={visibleInstrumentOptions}
          />

          <TransactionFormFields
            copy={copy}
            disabled={isDisabled}
            errorMessage={errorMessage}
            onValueChange={updateValue}
            successMessage={successMessage}
            values={values}
          />

          <TransactionFormFooter
            buttonLabel={submitButtonLabel}
            copy={copy}
            idleLabel={submitIdleButtonLabel}
            isCancelDisabled={isSubmitting || isRefreshing}
            isEditing={isEditing}
            isFormBusy={isFormBusy}
            isSubmitDisabled={isSubmitDisabled}
            onCancelEdit={handleCancelEdit}
          />
        </form>
      )}
    </article>
  );
}
