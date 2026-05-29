"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { findExactInstrumentSearchMatch } from "@/lib/transactions/instrument-selection";
import { getUiCopy } from "@/lib/ui/copy";
import { getUiLocale, type UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption, TransactionListItem } from "@/server/transactions";
import {
  createInitialValues,
  createValuesFromTransaction,
  getInitialInstrumentSearch,
  getInstrumentSearchKeyAction,
  getNextTransactionFormSyncState,
  getTransactionSubmitButtonLabel,
  getTransactionInstrumentLabel,
  getVisibleInstrumentOptions,
  type TransactionFormValues,
} from "@/components/transaction-form/form-helpers";
import { saveTransactionFromForm } from "@/components/transaction-form/api";
import { useTransactionInstrumentLookup } from "@/components/transaction-form/use-transaction-instrument-lookup";

type TransactionFormControllerProps = {
  instruments: TransactionInstrumentOption[];
  editingTransaction?: TransactionListItem | null;
  language: UiLanguage;
  onCloseEdit?: () => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
};

export function useTransactionFormController({
  instruments,
  editingTransaction = null,
  language,
  onCloseEdit,
  onWorkspaceRefresh,
}: TransactionFormControllerProps) {
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const lookupController = useTransactionInstrumentLookup({
    copy,
    instrumentOptions,
    language,
    refreshWorkspace,
    setErrorMessage,
    setInstrumentOptions,
    setInstrumentSearch,
    setValues,
  });

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

  function selectInstrument(instrument: TransactionInstrumentOption) {
    updateValue("instrumentId", String(instrument.id));
    setInstrumentSearch(instrument.label);
    setHighlightedInstrumentId(String(instrument.id));
    setIsInstrumentComboboxOpen(false);
  }

  function handleInstrumentSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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

  return {
    bodyProps:
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
            onInstrumentBlur: (event: FocusEvent<HTMLElement>) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
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
            onInstrumentSearchChange: (nextSearch: string) => {
              const exactInstrument = findExactInstrumentSearchMatch(instrumentOptions, nextSearch);

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
          },
    copy,
    instrumentOptions,
    isEditing,
    isFormBusy,
    ...lookupController,
  };
}
