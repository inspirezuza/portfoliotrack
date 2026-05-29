"use client";

import { useEffect, useMemo, useState } from "react";
import {
  findExactInstrumentSearchMatch,
  sortInstrumentOptions,
} from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import {
  createInitialValues,
  createValuesFromTransaction,
  findExistingInstrumentForLookup,
  getInitialInstrumentSearch,
  getInstrumentSearchKeyAction,
  getInstrumentLookupLabel,
  getNextTransactionFormSyncState,
  getTransactionSubmitButtonLabel,
  getTransactionInstrumentLabel,
  getVisibleInstrumentOptions,
  type InstrumentSearchResult,
  type NewInstrumentFormValues,
  type TransactionFormValues,
} from "@/components/transaction-form/form-helpers";
import {
  createInstrumentFromForm,
  saveTransactionFromForm,
  searchInstrumentsForForm,
} from "@/components/transaction-form/api";
import { TransactionFormPanel } from "@/components/transaction-form/form-panel";

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
        const results = await searchInstrumentsForForm({
          fallbackMessage: copy.transactions.form.couldNotSave,
          language,
          query,
          signal: abortController.signal,
        });

        setInstrumentLookupResults(results);
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
      await saveTransactionFromForm({
        editingTransaction,
        fallbackMessage: isEditing
          ? copy.transactions.form.couldNotUpdate
          : copy.transactions.form.couldNotSave,
        language,
        values,
      });

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
      const createdInstrument = await createInstrumentFromForm({
        fallbackMessage: copy.transactions.form.instrumentCouldNotSave,
        language,
        values: instrumentValues,
      });

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
    <TransactionFormPanel
      bodyProps={
        instrumentOptions.length === 0
          ? null
          : {
              copy,
              errorMessage,
              highlightedInstrumentId,
              idleLabel: submitIdleButtonLabel,
              instrumentSearch,
              isCancelDisabled: isSubmitting || isRefreshing,
              isDisabled,
              isEditing,
              isFormBusy,
              isInstrumentComboboxOpen,
              isSubmitDisabled,
              locale,
              onCancelEdit: handleCancelEdit,
              onInstrumentBlur: (event) => {
                if (event.currentTarget.contains(event.relatedTarget)) {
                  return;
                }

                setIsInstrumentComboboxOpen(false);
                if (selectedInstrument) {
                  setInstrumentSearch(selectedInstrument.label);
                }
              },
              onInstrumentFocus: () => {
                setIsInstrumentComboboxOpen(true);
                setHighlightedInstrumentId(values.instrumentId);
              },
              onInstrumentSearchChange: (nextSearch) => {
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
              },
              onInstrumentSearchKeyDown: handleInstrumentSearchKeyDown,
              onMouseEnterOption: setHighlightedInstrumentId,
              onSelectInstrument: selectInstrument,
              onSubmit: handleSubmit,
              onValueChange: updateValue,
              selectedInstrument,
              submitButtonLabel,
              successMessage,
              values,
              visibleInstrumentOptions,
            }
      }
      copy={copy}
      instrumentErrorMessage={instrumentErrorMessage}
      instrumentLookupQuery={instrumentLookupQuery}
      instrumentLookupResults={instrumentLookupResults}
      instrumentOptions={instrumentOptions}
      instrumentSuccessMessage={instrumentSuccessMessage}
      isCreatingInstrument={isCreatingInstrument}
      isEditing={isEditing}
      isFormBusy={isFormBusy}
      isInstrumentLookupMenuOpen={isInstrumentLookupMenuOpen}
      isSearchingInstruments={isSearchingInstruments}
      onClearLookup={clearInstrumentLookup}
      onLookupFocus={() => {
        if (!selectedInstrumentLookupResult && instrumentLookupQuery.trim().length >= 2) {
          setIsInstrumentLookupMenuOpen(true);
        }
      }}
      onLookupQueryChange={(nextQuery) => {
        setInstrumentLookupQuery(nextQuery);
        setIsInstrumentLookupMenuOpen(nextQuery.trim().length >= 2);
        setSelectedInstrumentLookupResult(null);
        setInstrumentErrorMessage(null);
        setInstrumentSuccessMessage(null);
      }}
      onLookupSelect={handleInstrumentLookupSelect}
      onLookupSubmit={handleInstrumentLookupSubmit}
      selectedInstrumentLookupResult={selectedInstrumentLookupResult}
    />
  );
}
