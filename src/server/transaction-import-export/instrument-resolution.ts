import type { ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import type { Instrument } from "@/lib/db/schema";
import { normalizeLookupValue } from "@/server/transaction-import-export/import-helpers";

export type ImportInstrument = Pick<
  Instrument,
  "id" | "symbol" | "displayName" | "market" | "instrumentType" | "currency" | "providerSymbol"
>;

export function resolveImportInstrument(
  row: ParsedTransactionExcelRow,
  instrumentById: Map<number, ImportInstrument>,
  instrumentByProviderSymbol: Map<string, ImportInstrument>,
  instrumentBySymbol: Map<string, ImportInstrument>,
) {
  const instrumentIdValue = row.values.instrumentId;
  const normalizedInstrumentId =
    instrumentIdValue == null || String(instrumentIdValue).trim().length === 0
      ? null
      : Number(instrumentIdValue);

  if (normalizedInstrumentId != null) {
    if (!Number.isInteger(normalizedInstrumentId) || normalizedInstrumentId <= 0) {
      return { instrument: null, error: "Instrument ID must be a positive integer." };
    }

    const instrument = instrumentById.get(normalizedInstrumentId);
    return instrument
      ? { instrument, error: null }
      : {
          instrument: null,
          error: `Instrument ID ${normalizedInstrumentId} was not found. Clear Instrument ID to create a new instrument.`,
        };
  }

  const providerSymbol = normalizeLookupValue(row.values.providerSymbol);

  if (providerSymbol.length > 0) {
    const instrument = instrumentByProviderSymbol.get(providerSymbol);

    if (instrument) {
      return { instrument, error: null };
    }
  }

  const symbol = normalizeLookupValue(row.values.symbol);

  if (symbol.length > 0) {
    const instrument = instrumentBySymbol.get(symbol);

    if (instrument) {
      return { instrument, error: null };
    }
  }

  return {
    instrument: null,
    error:
      providerSymbol || symbol ? null : "Instrument ID, provider symbol, or symbol is required.",
  };
}
