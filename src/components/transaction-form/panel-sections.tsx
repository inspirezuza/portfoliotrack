import { TransactionSubmitButton } from "@/components/transaction-form/submit-button";
import type { UiCopy } from "@/lib/ui/copy";

type TransactionFormSectionProps = {
  copy: UiCopy;
};

export function TransactionFormHeader({
  copy,
  isEditing,
}: TransactionFormSectionProps & {
  isEditing: boolean;
}) {
  return (
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
  );
}

export function TransactionFormEmptyState({ copy }: TransactionFormSectionProps) {
  return (
    <div className="transaction-empty-state">
      <p>{copy.transactions.form.noInstruments}</p>
    </div>
  );
}

export function TransactionFormFooter({
  buttonLabel,
  copy,
  idleLabel,
  isCancelDisabled,
  isEditing,
  isFormBusy,
  isSubmitDisabled,
  onCancelEdit,
}: TransactionFormSectionProps & {
  buttonLabel: string;
  idleLabel: string;
  isCancelDisabled: boolean;
  isEditing: boolean;
  isFormBusy: boolean;
  isSubmitDisabled: boolean;
  onCancelEdit: () => void;
}) {
  return (
    <div className="transaction-form-footer">
      {isEditing ? (
        <button
          type="button"
          className="compact-button"
          onClick={onCancelEdit}
          disabled={isCancelDisabled}
        >
          {copy.transactions.form.cancelEdit}
        </button>
      ) : null}
      <TransactionSubmitButton
        buttonLabel={buttonLabel}
        idleLabel={idleLabel}
        isFormBusy={isFormBusy}
        isSubmitDisabled={isSubmitDisabled}
      />
    </div>
  );
}
