import type { NewTransaction } from "@/lib/db/schema";
import { instrumentInputSchema } from "@/lib/validation/instrument";
import { transactionInputSchema, type TransactionInput } from "@/lib/validation/transaction";
import { InstrumentServiceError, TransactionServiceError } from "@/server/transactions/errors";

export function parseInstrumentInput(input: unknown) {
  const result = instrumentInputSchema.safeParse(input);

  if (!result.success) {
    throw new InstrumentServiceError("VALIDATION_ERROR", "Instrument input is invalid.", {
      issues: result.error.flatten(),
    });
  }

  return result.data;
}

export function parseTransactionInput(input: unknown) {
  const result = transactionInputSchema.safeParse(input);

  if (!result.success) {
    throw new TransactionServiceError("VALIDATION_ERROR", "Transaction input is invalid.", {
      issues: result.error.flatten(),
    });
  }

  return result.data;
}

export function parseTransactionId(input: unknown) {
  const id = Number(input);

  if (!Number.isInteger(id) || id <= 0) {
    throw new TransactionServiceError(
      "VALIDATION_ERROR",
      "Transaction id must be a positive integer.",
    );
  }

  return id;
}

export function buildTransactionInsertValues(
  input: TransactionInput,
  portfolioId: number,
): NewTransaction {
  return {
    portfolioId,
    instrumentId: input.instrumentId,
    tradeDate: input.tradeDate,
    side: input.side,
    broker: input.broker ?? "DIME",
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    notes: input.notes,
  };
}
