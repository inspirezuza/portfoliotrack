"use client";

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { sortInstrumentOptions } from "@/lib/transactions/instrument-selection";
import type { UiCopy } from "@/lib/ui/copy";
import type { UiLanguage } from "@/lib/ui/translations";
import type { TransactionInstrumentOption } from "@/server/transactions";
import {
  createInstrumentFromForm,
  searchInstrumentsForForm,
} from "@/components/transaction-form/api";
import {
  findExistingInstrumentForLookup,
  getInstrumentLookupLabel,
  type InstrumentSearchResult,
  type TransactionFormValues,
} from "@/components/transaction-form/form-helpers";

type TransactionInstrumentLookupControllerProps = {
  copy: UiCopy;
  instrumentOptions: TransactionInstrumentOption[];
  language: UiLanguage;
  refreshWorkspace: () => Promise<void>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setInstrumentOptions: Dispatch<SetStateAction<TransactionInstrumentOption[]>>;
  setInstrumentSearch: Dispatch<SetStateAction<string>>;
  setValues: Dispatch<SetStateAction<TransactionFormValues>>;
};

export function useTransactionInstrumentLookup({
  copy,
  instrumentOptions,
  language,
  refreshWorkspace,
  setErrorMessage,
  setInstrumentOptions,
  setInstrumentSearch,
  setValues,
}: TransactionInstrumentLookupControllerProps) {
  const [instrumentLookupQuery, setInstrumentLookupQuery] = useState("");
  const [isInstrumentLookupMenuOpen, setIsInstrumentLookupMenuOpen] = useState(false);
  const [instrumentLookupResults, setInstrumentLookupResults] = useState<InstrumentSearchResult[]>(
    [],
  );
  const [selectedInstrumentLookupResult, setSelectedInstrumentLookupResult] =
    useState<InstrumentSearchResult | null>(null);
  const [isSearchingInstruments, setIsSearchingInstruments] = useState(false);
  const [instrumentErrorMessage, setInstrumentErrorMessage] = useState<string | null>(null);
  const [instrumentSuccessMessage, setInstrumentSuccessMessage] = useState<string | null>(null);
  const [isCreatingInstrument, setIsCreatingInstrument] = useState(false);

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

  async function createAndSelectInstrument(instrumentValues: InstrumentSearchResult) {
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

  function handleInstrumentLookupSubmit(event: FormEvent<HTMLFormElement>) {
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

  function clearInstrumentLookup() {
    setInstrumentLookupQuery("");
    setIsInstrumentLookupMenuOpen(false);
    setInstrumentLookupResults([]);
    setSelectedInstrumentLookupResult(null);
    setInstrumentErrorMessage(null);
    setInstrumentSuccessMessage(null);
  }

  return {
    instrumentErrorMessage,
    instrumentLookupQuery,
    instrumentLookupResults,
    instrumentSuccessMessage,
    isCreatingInstrument,
    isInstrumentLookupMenuOpen,
    isSearchingInstruments,
    onClearLookup: clearInstrumentLookup,
    onLookupFocus: () => {
      if (!selectedInstrumentLookupResult && instrumentLookupQuery.trim().length >= 2) {
        setIsInstrumentLookupMenuOpen(true);
      }
    },
    onLookupQueryChange: (nextQuery: string) => {
      setInstrumentLookupQuery(nextQuery);
      setIsInstrumentLookupMenuOpen(nextQuery.trim().length >= 2);
      setSelectedInstrumentLookupResult(null);
      setInstrumentErrorMessage(null);
      setInstrumentSuccessMessage(null);
    },
    onLookupSelect: handleInstrumentLookupSelect,
    onLookupSubmit: handleInstrumentLookupSubmit,
    selectedInstrumentLookupResult,
  };
}
