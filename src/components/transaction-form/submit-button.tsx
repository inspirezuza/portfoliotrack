import { ButtonLoadingContent } from "@/components/loading-indicator";

type TransactionSubmitButtonProps = {
  buttonLabel: string;
  idleLabel: string;
  isFormBusy: boolean;
  isSubmitDisabled: boolean;
};

export function TransactionSubmitButton({
  buttonLabel,
  idleLabel,
  isFormBusy,
  isSubmitDisabled,
}: TransactionSubmitButtonProps) {
  return (
    <button
      type="submit"
      className="primary-button"
      disabled={isSubmitDisabled}
      aria-busy={isFormBusy}
    >
      {isFormBusy ? (
        <ButtonLoadingContent label={buttonLabel}>{idleLabel}</ButtonLoadingContent>
      ) : (
        buttonLabel
      )}
    </button>
  );
}
