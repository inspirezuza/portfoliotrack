import "server-only";

import YahooFinance from "yahoo-finance2";
import { withOperationTimeout } from "@/lib/async/timeout";
import {
  getInstrumentTypeFromYahooQuoteType,
  normalizeInstrumentType,
} from "@/lib/instruments/instrument-types";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { instrumentInputSchema, type InstrumentInput } from "@/lib/validation/instrument";
import type { ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import {
  getCreateInstrumentKey,
  getFallbackInstrumentInput,
  getMarket,
  getOptionalCellString,
  getProviderSymbolCandidates,
  normalizeDisplaySymbol,
  normalizeLookupValue,
} from "@/server/transaction-import-export/import-helpers";
import type { PendingImportInstrument } from "@/server/transaction-import-export/types";

const INSTRUMENT_CREATE_QUOTE_TIMEOUT_MS = 4000;

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

async function getYahooInstrumentInput({
  symbol,
  displayName,
  market,
  instrumentType,
  currency,
  providerSymbol,
}: {
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol: string;
}): Promise<InstrumentInput | null> {
  for (const candidateProviderSymbol of getProviderSymbolCandidates({
    symbol,
    providerSymbol,
    market,
  })) {
    try {
      const quote = await withOperationTimeout(
        yahooFinance.quote(candidateProviderSymbol, {
          fields: [
            "symbol",
            "currency",
            "exchange",
            "market",
            "quoteType",
            "shortName",
            "longName",
          ],
        }),
        {
          label: `Yahoo instrument create quote ${candidateProviderSymbol}`,
          timeoutMs: INSTRUMENT_CREATE_QUOTE_TIMEOUT_MS,
        },
      );

      if (!quote.symbol || !quote.currency) {
        continue;
      }

      const resolvedSymbol = normalizeDisplaySymbol(symbol || quote.symbol);
      const knownDrMetadata = getKnownDrMetadata({
        symbol: resolvedSymbol,
        providerSymbol: quote.symbol,
      });

      return {
        symbol: resolvedSymbol,
        displayName: displayName || quote.longName || quote.shortName || resolvedSymbol,
        market: market || getMarket(quote.symbol, quote.exchange, quote.market),
        instrumentType:
          normalizeInstrumentType(instrumentType) ||
          knownDrMetadata?.instrumentType ||
          getInstrumentTypeFromYahooQuoteType(quote.quoteType),
        currency: currency || quote.currency,
        providerSymbol: quote.symbol.toUpperCase(),
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function buildCreateInstrument(row: ParsedTransactionExcelRow) {
  const symbol = getOptionalCellString(row.values.symbol);
  const providerSymbol = getOptionalCellString(row.values.providerSymbol);

  if (symbol.length === 0 && providerSymbol.length === 0) {
    return {
      instrument: null,
      error: "Symbol or Provider Symbol is required when Instrument Action is CREATE.",
    };
  }

  const baseInput = {
    symbol: symbol || providerSymbol,
    displayName: getOptionalCellString(row.values.displayName),
    market: normalizeLookupValue(row.values.market),
    instrumentType: normalizeLookupValue(row.values.instrumentType),
    currency: normalizeLookupValue(row.values.currency),
    providerSymbol,
  };
  const yahooInput = await getYahooInstrumentInput(baseInput);
  const parsedInput = instrumentInputSchema.safeParse(
    yahooInput ?? getFallbackInstrumentInput(baseInput),
  );

  if (!parsedInput.success) {
    const fieldError = Object.values(parsedInput.error.flatten().fieldErrors)
      .flatMap((messages) => messages ?? [])
      .find(Boolean);

    return {
      instrument: null,
      error: fieldError ?? "New instrument input is invalid.",
    };
  }

  const createInstrumentKey = getCreateInstrumentKey(parsedInput.data);

  return {
    instrument: {
      id: null,
      symbol: parsedInput.data.symbol,
      displayName: parsedInput.data.displayName,
      market: parsedInput.data.market,
      instrumentType: parsedInput.data.instrumentType,
      currency: parsedInput.data.currency,
      providerSymbol: parsedInput.data.providerSymbol,
      createInstrumentInput: parsedInput.data,
      createInstrumentKey,
      positionInstrumentId: null,
    } satisfies PendingImportInstrument,
    error: null,
  };
}
