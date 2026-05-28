import type { FormEvent } from "react";
import { ButtonLoadingContent, LoadingIndicator } from "@/components/loading-indicator";
import { getUiCopy } from "@/lib/ui/copy";
import type { TransactionInstrumentOption } from "@/server/transactions";
import {
  findExistingInstrumentForLookup,
  type InstrumentSearchResult,
} from "@/components/transaction-form/form-helpers";

type InstrumentLookupPanelProps = {
  copy: ReturnType<typeof getUiCopy>;
  instrumentErrorMessage: string | null;
  instrumentLookupQuery: string;
  instrumentLookupResults: InstrumentSearchResult[];
  instrumentOptions: TransactionInstrumentOption[];
  instrumentSuccessMessage: string | null;
  isCreatingInstrument: boolean;
  isInstrumentLookupMenuOpen: boolean;
  isSearchingInstruments: boolean;
  onClear: () => void;
  onFocus: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (instrument: InstrumentSearchResult) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedInstrumentLookupResult: InstrumentSearchResult | null;
};

export function InstrumentLookupPanel({
  copy,
  instrumentErrorMessage,
  instrumentLookupQuery,
  instrumentLookupResults,
  instrumentOptions,
  instrumentSuccessMessage,
  isCreatingInstrument,
  isInstrumentLookupMenuOpen,
  isSearchingInstruments,
  onClear,
  onFocus,
  onQueryChange,
  onSelect,
  onSubmit,
  selectedInstrumentLookupResult,
}: InstrumentLookupPanelProps) {
  return (
    <div className="instrument-manager">
      <div className="instrument-manager-header">
        <div>
          <span className="field-label">{copy.transactions.form.instrument}</span>
          <p className="field-hint">{copy.transactions.form.instrumentHint}</p>
        </div>
      </div>

      <form
        className="instrument-lookup"
        onSubmit={onSubmit}
        aria-busy={isCreatingInstrument || isSearchingInstruments}
      >
        <label className="field-group">
          <span className="field-label">{copy.transactions.form.searchInstrument}</span>
          <span className="instrument-lookup-search">
            <input
              type="text"
              value={instrumentLookupQuery}
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={onFocus}
              placeholder={copy.transactions.form.searchInstrumentPlaceholder}
              autoComplete="off"
              disabled={isCreatingInstrument}
            />
            {instrumentLookupQuery.trim().length > 0 ? (
              <button
                type="button"
                className="instrument-lookup-clear"
                onClick={onClear}
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
                    onClick={() => onSelect(instrument)}
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
  );
}
