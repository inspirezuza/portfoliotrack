import type { TransactionFormValues } from "@/components/transaction-form/form-helpers";
import type { getUiCopy } from "@/lib/ui/copy";

type TransactionFormFieldsProps = {
  copy: ReturnType<typeof getUiCopy>;
  disabled: boolean;
  errorMessage: string | null;
  onValueChange: <Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key],
  ) => void;
  successMessage: string | null;
  values: TransactionFormValues;
};

export function TransactionFormFields({
  copy,
  disabled,
  errorMessage,
  onValueChange,
  successMessage,
  values,
}: TransactionFormFieldsProps) {
  return (
    <>
      <label className="field-group">
        <span className="field-label">{copy.transactions.form.tradeDate}</span>
        <input
          type="date"
          name="tradeDate"
          value={values.tradeDate}
          onChange={(event) => onValueChange("tradeDate", event.target.value)}
          disabled={disabled}
          required
        />
      </label>

      <label className="field-group">
        <span className="field-label">{copy.transactions.form.side}</span>
        <select
          name="side"
          value={values.side}
          onChange={(event) => onValueChange("side", event.target.value as "BUY" | "SELL")}
          disabled={disabled}
        >
          <option value="BUY">{copy.transactions.form.buy}</option>
          <option value="SELL">{copy.transactions.form.sell}</option>
        </select>
      </label>

      <label className="field-group">
        <span className="field-label">{copy.transactions.form.broker}</span>
        <div
          className="broker-segmented-control"
          role="radiogroup"
          aria-label={copy.transactions.form.broker}
        >
          {(["DIME", "WEBULL"] as const).map((broker) => (
            <button
              key={broker}
              type="button"
              className="broker-segmented-option"
              data-selected={values.broker === broker}
              role="radio"
              aria-checked={values.broker === broker}
              onClick={() => onValueChange("broker", broker)}
              disabled={disabled}
            >
              {broker === "DIME" ? "Dime" : "Webull"}
            </button>
          ))}
        </div>
        <input type="hidden" name="broker" value={values.broker} />
      </label>

      <label className="field-group">
        <span className="field-label">{copy.transactions.form.quantity}</span>
        <input
          type="number"
          name="quantity"
          value={values.quantity}
          onChange={(event) => onValueChange("quantity", event.target.value)}
          min="0.000001"
          step="0.000001"
          inputMode="decimal"
          placeholder="0.000000"
          disabled={disabled}
          required
        />
      </label>

      <label className="field-group">
        <span className="field-label">{copy.transactions.form.price}</span>
        <input
          type="number"
          name="price"
          value={values.price}
          onChange={(event) => onValueChange("price", event.target.value)}
          min="0.0001"
          step="0.0001"
          inputMode="decimal"
          placeholder="0.0000"
          disabled={disabled}
          required
        />
      </label>

      <label className="field-group">
        <span className="field-label">{copy.transactions.form.fee}</span>
        <input
          type="number"
          name="fee"
          value={values.fee}
          onChange={(event) => onValueChange("fee", event.target.value)}
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          disabled={disabled}
          required
        />
      </label>

      <label className="field-group field-group-wide">
        <span className="field-label">{copy.transactions.form.notes}</span>
        <textarea
          name="notes"
          value={values.notes}
          onChange={(event) => onValueChange("notes", event.target.value)}
          rows={4}
          maxLength={500}
          placeholder={copy.transactions.form.notesPlaceholder}
          disabled={disabled}
        />
      </label>

      {errorMessage ? <p className="form-banner form-banner-error">{errorMessage}</p> : null}
      {successMessage ? <p className="form-banner form-banner-success">{successMessage}</p> : null}
    </>
  );
}
