import { z } from "zod";
import { normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function getCurrentLocalIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isIsoCalendarDate(value: string) {
  if (!isoDatePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function coerceFiniteNumber() {
  return z.coerce.number().refine(Number.isFinite, "Must be a finite number.");
}

function positiveNormalizedNumber(
  normalize: (value: number) => number,
  message: string,
  { allowZero = false }: { allowZero?: boolean } = {},
) {
  return coerceFiniteNumber()
    .transform(normalize)
    .refine((value) => (allowZero ? value >= 0 : value > 0), message);
}

export const transactionSideSchema = z.enum(["BUY", "SELL"]);
export const transactionBrokerSchema = z.enum(["DIME", "WEBULL"]);

export const transactionInputSchema = z
  .object({
    instrumentId: z.coerce.number().int().positive(),
    tradeDate: z
      .string()
      .trim()
      .refine(isIsoCalendarDate, "Trade date must be a valid ISO date (YYYY-MM-DD).")
      .refine((value) => value <= getCurrentLocalIsoDate(), "Trade date cannot be in the future."),
    side: z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
      transactionSideSchema,
    ),
    broker: z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
      transactionBrokerSchema.optional(),
    ),
    quantity: positiveNormalizedNumber(
      normalizeQuantity,
      "Quantity must be greater than zero after normalization.",
    ),
    price: positiveNormalizedNumber(
      normalizePrice,
      "Price must be greater than zero after normalization.",
    ),
    fee: positiveNormalizedNumber(normalizeMoney, "Fee must be zero or greater.", {
      allowZero: true,
    }).default(0),
    notes: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((value) => (typeof value === "string" ? value.trim() : (value ?? null)))
      .refine(
        (value) => value === null || value.length <= 500,
        "Notes must be 500 characters or fewer.",
      )
      .transform((value) => (value && value.length > 0 ? value : null)),
  })
  .strict();

export type TransactionSide = z.infer<typeof transactionSideSchema>;
export type TransactionBroker = z.infer<typeof transactionBrokerSchema>;
export type TransactionInput = z.infer<typeof transactionInputSchema>;
