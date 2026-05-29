"use client";

import {
  TransactionFormBody,
  type TransactionFormBodyProps,
} from "@/components/transaction-form/form-body";
import type { InstrumentSearchResult } from "@/components/transaction-form/form-helpers";
import { InstrumentLookupPanel } from "@/components/transaction-form/instrument-lookup";
import {
  TransactionFormEmptyState,
  TransactionFormHeader,
} from "@/components/transaction-form/panel-sections";
import type { UiCopy } from "@/lib/ui/copy";
import type { TransactionInstrumentOption } from "@/server/transactions";

type TransactionFormPanelProps = {
  bodyProps: TransactionFormBodyProps | null;
  copy: UiCopy;
  instrumentErrorMessage: string | null;
  instrumentLookupQuery: string;
  instrumentLookupResults: InstrumentSearchResult[];
  instrumentOptions: TransactionInstrumentOption[];
  instrumentSuccessMessage: string | null;
  isCreatingInstrument: boolean;
  isEditing: boolean;
  isFormBusy: boolean;
  isInstrumentLookupMenuOpen: boolean;
  isSearchingInstruments: boolean;
  onClearLookup: () => void;
  onLookupFocus: () => void;
  onLookupQueryChange: (nextQuery: string) => void;
  onLookupSelect: (instrumentValues: InstrumentSearchResult) => void;
  onLookupSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  selectedInstrumentLookupResult: InstrumentSearchResult | null;
};

export function TransactionFormPanel({
  bodyProps,
  copy,
  instrumentErrorMessage,
  instrumentLookupQuery,
  instrumentLookupResults,
  instrumentOptions,
  instrumentSuccessMessage,
  isCreatingInstrument,
  isEditing,
  isFormBusy,
  isInstrumentLookupMenuOpen,
  isSearchingInstruments,
  onClearLookup,
  onLookupFocus,
  onLookupQueryChange,
  onLookupSelect,
  onLookupSubmit,
  selectedInstrumentLookupResult,
}: TransactionFormPanelProps) {
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
        onClear={onClearLookup}
        onFocus={onLookupFocus}
        onQueryChange={onLookupQueryChange}
        onSelect={onLookupSelect}
        onSubmit={onLookupSubmit}
        selectedInstrumentLookupResult={selectedInstrumentLookupResult}
      />

      {bodyProps == null ? (
        <TransactionFormEmptyState copy={copy} />
      ) : (
        <TransactionFormBody {...bodyProps} />
      )}
    </article>
  );
}
