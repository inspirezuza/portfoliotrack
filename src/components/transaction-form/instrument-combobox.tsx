"use client";

import { formatQuantity } from "@/lib/format";
import type { getUiCopy } from "@/lib/ui/copy";
import type { TransactionInstrumentOption } from "@/server/transactions";

type TransactionInstrumentComboboxProps = {
  copy: ReturnType<typeof getUiCopy>;
  highlightedInstrumentId: string | null;
  instrumentSearch: string;
  isDisabled: boolean;
  isInstrumentComboboxOpen: boolean;
  locale: string;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onInstrumentSearchChange: (nextSearch: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onMouseEnterOption: (instrumentId: string) => void;
  onSelectInstrument: (instrument: TransactionInstrumentOption) => void;
  selectedInstrument: TransactionInstrumentOption | null;
  selectedInstrumentId: string;
  visibleInstrumentOptions: TransactionInstrumentOption[];
};

export function TransactionInstrumentCombobox({
  copy,
  highlightedInstrumentId,
  instrumentSearch,
  isDisabled,
  isInstrumentComboboxOpen,
  locale,
  onBlur,
  onFocus,
  onInstrumentSearchChange,
  onKeyDown,
  onMouseEnterOption,
  onSelectInstrument,
  selectedInstrument,
  selectedInstrumentId,
  visibleInstrumentOptions,
}: TransactionInstrumentComboboxProps) {
  return (
    <label className="field-group field-group-wide">
      <span className="field-label">{copy.transactions.form.instrument}</span>
      <div className="instrument-combobox" onBlur={onBlur}>
        <input
          type="text"
          name="instrumentSearch"
          value={instrumentSearch}
          onChange={(event) => onInstrumentSearchChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={isInstrumentComboboxOpen}
          aria-controls="instrument-options"
          aria-autocomplete="list"
          aria-activedescendant={
            highlightedInstrumentId ? `instrument-option-${highlightedInstrumentId}` : undefined
          }
          autoComplete="off"
          placeholder={copy.transactions.form.chooseInstrument}
          disabled={isDisabled}
          required
        />
        <input type="hidden" name="instrumentId" value={selectedInstrumentId} />
        {isInstrumentComboboxOpen ? (
          <div className="instrument-combobox-menu" id="instrument-options" role="listbox">
            {visibleInstrumentOptions.length > 0 ? (
              visibleInstrumentOptions.map((instrument) => {
                const instrumentId = String(instrument.id);
                const isSelected = instrumentId === selectedInstrumentId;
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
                    onMouseEnter={() => onMouseEnterOption(instrumentId)}
                    onClick={() => onSelectInstrument(instrument)}
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
  );
}
