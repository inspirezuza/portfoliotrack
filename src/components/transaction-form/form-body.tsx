"use client";

import { PendingBanner } from "@/components/loading-indicator";
import { TransactionFormFields } from "@/components/transaction-form/form-fields";
import type { TransactionFormValues } from "@/components/transaction-form/form-helpers";
import { TransactionInstrumentCombobox } from "@/components/transaction-form/instrument-combobox";
import { TransactionFormFooter } from "@/components/transaction-form/panel-sections";
import type { UiCopy } from "@/lib/ui/copy";
import type { TransactionInstrumentOption } from "@/server/transactions";

export type TransactionFormBodyProps = {
  copy: UiCopy;
  errorMessage: string | null;
  highlightedInstrumentId: string | null;
  idleLabel: string;
  instrumentSearch: string;
  isCancelDisabled: boolean;
  isDisabled: boolean;
  isEditing: boolean;
  isFormBusy: boolean;
  isInstrumentComboboxOpen: boolean;
  isSubmitDisabled: boolean;
  locale: string;
  onCancelEdit: () => void;
  onInstrumentBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  onInstrumentFocus: () => void;
  onInstrumentSearchChange: (nextSearch: string) => void;
  onInstrumentSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onMouseEnterOption: (instrumentId: string) => void;
  onSelectInstrument: (instrument: TransactionInstrumentOption) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onValueChange: <Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key],
  ) => void;
  selectedInstrument: TransactionInstrumentOption | null;
  submitButtonLabel: string;
  successMessage: string | null;
  values: TransactionFormValues;
  visibleInstrumentOptions: TransactionInstrumentOption[];
};

export function TransactionFormBody({
  copy,
  errorMessage,
  highlightedInstrumentId,
  idleLabel,
  instrumentSearch,
  isCancelDisabled,
  isDisabled,
  isEditing,
  isFormBusy,
  isInstrumentComboboxOpen,
  isSubmitDisabled,
  locale,
  onCancelEdit,
  onInstrumentBlur,
  onInstrumentFocus,
  onInstrumentSearchChange,
  onInstrumentSearchKeyDown,
  onMouseEnterOption,
  onSelectInstrument,
  onSubmit,
  onValueChange,
  selectedInstrument,
  submitButtonLabel,
  successMessage,
  values,
  visibleInstrumentOptions,
}: TransactionFormBodyProps) {
  return (
    <form className="transaction-form" onSubmit={onSubmit} aria-busy={isFormBusy}>
      {isFormBusy ? <PendingBanner label={submitButtonLabel} /> : null}

      <TransactionInstrumentCombobox
        copy={copy}
        highlightedInstrumentId={highlightedInstrumentId}
        instrumentSearch={instrumentSearch}
        isDisabled={isDisabled}
        isInstrumentComboboxOpen={isInstrumentComboboxOpen}
        locale={locale}
        onBlur={onInstrumentBlur}
        onFocus={onInstrumentFocus}
        onInstrumentSearchChange={onInstrumentSearchChange}
        onKeyDown={onInstrumentSearchKeyDown}
        onMouseEnterOption={onMouseEnterOption}
        onSelectInstrument={onSelectInstrument}
        selectedInstrument={selectedInstrument}
        selectedInstrumentId={values.instrumentId}
        visibleInstrumentOptions={visibleInstrumentOptions}
      />

      <TransactionFormFields
        copy={copy}
        disabled={isDisabled}
        errorMessage={errorMessage}
        onValueChange={onValueChange}
        successMessage={successMessage}
        values={values}
      />

      <TransactionFormFooter
        buttonLabel={submitButtonLabel}
        copy={copy}
        idleLabel={idleLabel}
        isCancelDisabled={isCancelDisabled}
        isEditing={isEditing}
        isFormBusy={isFormBusy}
        isSubmitDisabled={isSubmitDisabled}
        onCancelEdit={onCancelEdit}
      />
    </form>
  );
}
