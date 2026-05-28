import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { normalizeInstrumentType } from "@/lib/instruments/instrument-types";
import type { NewTransaction } from "@/lib/db/schema";
import type { InstrumentInput } from "@/lib/validation/instrument";
import type { TransactionInput } from "@/lib/validation/transaction";
import { TransactionImportExportError } from "@/server/transaction-import-export/errors";

export type CommitTransactionInput = Omit<TransactionInput, "instrumentId"> & {
  instrumentId: number | null;
};

export type ReadyCommitImportRow = {
  input: CommitTransactionInput;
  symbol: string | null;
  createInstrumentKey?: string;
};

export function buildTransactionInsertValue(
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

export function buildInstrumentInsertValue(input: InstrumentInput) {
  const knownDrMetadata = getKnownDrMetadata(input);

  return {
    symbol: input.symbol,
    displayName: input.displayName,
    market: input.market,
    instrumentType:
      knownDrMetadata?.instrumentType ?? normalizeInstrumentType(input.instrumentType),
    currency: input.currency,
    providerSymbol: input.providerSymbol,
    underlyingSymbol: knownDrMetadata?.underlyingSymbol ?? null,
    underlyingDisplayName: knownDrMetadata?.underlyingDisplayName ?? null,
    underlyingCurrency: knownDrMetadata?.underlyingCurrency ?? null,
    underlyingProviderSymbol: knownDrMetadata?.underlyingProviderSymbol ?? null,
    drRatio: knownDrMetadata?.drRatio ?? null,
    fxProviderSymbol: knownDrMetadata?.fxProviderSymbol ?? null,
    isActive: true,
  };
}

export function buildFinalImportInput(
  row: ReadyCommitImportRow,
  createdInstrumentIds: Map<string, number>,
): TransactionInput {
  if (row.input.instrumentId != null) {
    return {
      ...row.input,
      instrumentId: row.input.instrumentId,
    };
  }

  const createdInstrumentId =
    row.createInstrumentKey == null
      ? null
      : (createdInstrumentIds.get(row.createInstrumentKey) ?? null);

  if (createdInstrumentId == null) {
    throw new TransactionImportExportError(
      "INTERNAL_ERROR",
      `Instrument ${row.symbol ?? ""} could not be resolved for import.`,
    );
  }

  return {
    ...row.input,
    instrumentId: createdInstrumentId,
  };
}
