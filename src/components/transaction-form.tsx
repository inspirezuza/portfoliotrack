"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatQuantity } from "@/lib/format";
import type { TransactionInstrumentOption } from "@/server/transactions";

type TransactionFormValues = {
  instrumentId: string;
  tradeDate: string;
  side: "BUY" | "SELL";
  quantity: string;
  price: string;
  fee: string;
  notes: string;
};

type TransactionFormProps = {
  instruments: TransactionInstrumentOption[];
};

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: {
      availableQuantity?: number;
    } | null;
  };
};

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createInitialValues(instruments: TransactionInstrumentOption[]): TransactionFormValues {
  return {
    instrumentId: getSynchronizedInstrumentId("", instruments),
    tradeDate: getTodayDate(),
    side: "BUY",
    quantity: "",
    price: "",
    fee: "0",
    notes: ""
  };
}

function getErrorMessage(error: ApiErrorResponse["error"]) {
  if (!error) {
    return "Transaction could not be saved.";
  }

  if (error.code === "INSUFFICIENT_QUANTITY") {
    const availableQuantity = error.details?.availableQuantity;

    if (typeof availableQuantity === "number") {
      return `Sell quantity exceeds current holdings. Available to sell: ${formatQuantity(availableQuantity)}.`;
    }
  }

  return error.message ?? "Transaction could not be saved.";
}

function getSynchronizedInstrumentId(
  instrumentId: string,
  instruments: TransactionInstrumentOption[]
) {
  if (instruments.length === 0) {
    return "";
  }

  const hasMatchingInstrument = instruments.some(
    (instrument) => String(instrument.id) === instrumentId
  );

  return hasMatchingInstrument ? instrumentId : String(instruments[0].id);
}

export function TransactionForm({ instruments }: TransactionFormProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [values, setValues] = useState<TransactionFormValues>(() => createInitialValues(instruments));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedInstrument =
    instruments.find((instrument) => String(instrument.id) === values.instrumentId) ?? null;

  const isDisabled = instruments.length === 0 || isSubmitting || isRefreshing;

  useEffect(() => {
    setValues((currentValues) => {
      const instrumentId = getSynchronizedInstrumentId(currentValues.instrumentId, instruments);

      if (instrumentId === currentValues.instrumentId) {
        return currentValues;
      }

      return {
        ...currentValues,
        instrumentId
      };
    });
  }, [instruments]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instrumentId: Number(values.instrumentId),
          tradeDate: values.tradeDate,
          side: values.side,
          quantity: Number(values.quantity),
          price: Number(values.price),
          fee: Number(values.fee || "0"),
          notes: values.notes
        })
      });

      const payload = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getErrorMessage(payload.error));
      }

      setValues(createInitialValues(instruments));
      setSuccessMessage("Transaction saved.");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transaction could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateValue<Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key]
  ) {
    setValues((currentValues) => ({
      ...currentValues,
      [key]: value
    }));
  }

  return (
    <article className="surface-card transaction-panel">
      <div className="transaction-panel-header">
        <div>
          <p className="eyebrow">New transaction</p>
          <h2 className="section-title">Record a buy or sell</h2>
        </div>
        <p className="surface-copy">
          Server-side validation stays in charge, including impossible sell checks.
        </p>
      </div>

      {instruments.length === 0 ? (
        <div className="transaction-empty-state">
          <p>No instruments are available yet. Seed or add instruments before entering trades.</p>
        </div>
      ) : (
        <form className="transaction-form" onSubmit={handleSubmit}>
          <label className="field-group field-group-wide">
            <span className="field-label">Instrument</span>
            <select
              name="instrumentId"
              value={values.instrumentId}
              onChange={(event) => updateValue("instrumentId", event.target.value)}
              disabled={isDisabled}
              required
            >
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.label}
                </option>
              ))}
            </select>
            {selectedInstrument ? (
              <span className="field-hint">
                Current quantity: {formatQuantity(selectedInstrument.currentQuantity)} shares
              </span>
            ) : null}
          </label>

          <label className="field-group">
            <span className="field-label">Trade date</span>
            <input
              type="date"
              name="tradeDate"
              value={values.tradeDate}
              onChange={(event) => updateValue("tradeDate", event.target.value)}
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">Side</span>
            <select
              name="side"
              value={values.side}
              onChange={(event) => updateValue("side", event.target.value as "BUY" | "SELL")}
              disabled={isDisabled}
            >
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>

          <label className="field-group">
            <span className="field-label">Quantity</span>
            <input
              type="number"
              name="quantity"
              value={values.quantity}
              onChange={(event) => updateValue("quantity", event.target.value)}
              min="0.000001"
              step="0.000001"
              inputMode="decimal"
              placeholder="0.000000"
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">Price</span>
            <input
              type="number"
              name="price"
              value={values.price}
              onChange={(event) => updateValue("price", event.target.value)}
              min="0.0001"
              step="0.0001"
              inputMode="decimal"
              placeholder="0.0000"
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group">
            <span className="field-label">Fee</span>
            <input
              type="number"
              name="fee"
              value={values.fee}
              onChange={(event) => updateValue("fee", event.target.value)}
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              disabled={isDisabled}
              required
            />
          </label>

          <label className="field-group field-group-wide">
            <span className="field-label">Notes</span>
            <textarea
              name="notes"
              value={values.notes}
              onChange={(event) => updateValue("notes", event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Optional note about the fill, broker, or reasoning."
              disabled={isDisabled}
            />
          </label>

          {errorMessage ? <p className="form-banner form-banner-error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-banner form-banner-success">{successMessage}</p> : null}

          <div className="transaction-form-footer">
            <p className="surface-copy">
              {values.side === "SELL"
                ? "Sells are rejected if they would drive holdings below zero."
                : "Buys are stored with normalized quantity, price, and fee precision."}
            </p>
            <button type="submit" className="primary-button" disabled={isDisabled}>
              {isSubmitting ? "Saving..." : isRefreshing ? "Refreshing..." : "Save transaction"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
