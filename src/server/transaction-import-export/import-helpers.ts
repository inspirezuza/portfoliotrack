import { normalizeMoney, normalizePrice, normalizeQuantity } from "@/lib/db/precision";
import { getKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import { normalizeInstrumentType } from "@/lib/instruments/instrument-types";
import { TransactionExcelError, type ParsedTransactionExcelRow } from "@/lib/transactions/excel";
import { type InstrumentInput } from "@/lib/validation/instrument";
import { transactionInputSchema, type TransactionInput } from "@/lib/validation/transaction";

type ImportInstrumentAction = "MATCH" | "CREATE";

type ImportTransactionInput = Omit<TransactionInput, "instrumentId"> & {
  instrumentId: number | null;
};

export function normalizeLookupValue(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase()
    : String(value ?? "")
        .trim()
        .toUpperCase();
}

export function normalizeDisplaySymbol(value: string) {
  const normalizedValue = value.trim().toUpperCase();

  return normalizedValue.endsWith(".BK") ? normalizedValue.slice(0, -3) : normalizedValue;
}

export function getOptionalCellString(value: unknown) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

export function getOptionalNumber(value: unknown) {
  if (value == null || String(value).trim().length === 0) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function getImportTransactionKey(
  input: Pick<
    ImportTransactionInput,
    "tradeDate" | "side" | "broker" | "quantity" | "price" | "fee" | "notes"
  >,
  instrumentKey: string | number,
) {
  return [
    instrumentKey,
    input.tradeDate,
    input.side,
    input.broker ?? "DIME",
    normalizeQuantity(input.quantity),
    normalizePrice(input.price),
    normalizeMoney(input.fee),
    input.notes ?? "",
  ].join("|");
}

export function getErrorMessage(error: unknown) {
  if (error instanceof TransactionExcelError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Excel file could not be imported.";
}

export function getValidationMessage(error: ReturnType<typeof transactionInputSchema.safeParse>) {
  if (error.success) {
    return null;
  }

  const flattened = error.error.flatten();
  const fieldError = Object.values(flattened.fieldErrors)
    .flatMap((messages) => messages ?? [])
    .find(Boolean);
  const formError = flattened.formErrors.find(Boolean);

  return fieldError ?? formError ?? "Transaction row is invalid.";
}

export function parseInstrumentAction(row: ParsedTransactionExcelRow): {
  action: ImportInstrumentAction | null;
  error: string | null;
} {
  const action = normalizeLookupValue(row.values.instrumentAction);

  if (action.length === 0 || action === "MATCH") {
    return { action: "MATCH", error: null };
  }

  if (action === "CREATE" || action === "ADD") {
    return { action: "CREATE", error: null };
  }

  if (action === "UPDATE" || action === "DELETE") {
    return {
      action: null,
      error:
        "Instrument Action UPDATE/DELETE is not supported in transaction import. Use a separate instrument maintenance flow.",
    };
  }

  return {
    action: null,
    error: "Instrument Action must be blank, MATCH, or CREATE.",
  };
}

export function getMarket(providerSymbol: string, exchange?: string, market?: string) {
  if (
    providerSymbol.toUpperCase().endsWith(".BK") ||
    exchange === "SET" ||
    market === "th_market"
  ) {
    return "TH";
  }

  if (
    market === "us_market" ||
    ["ASE", "NCM", "NGM", "NMS", "NYQ", "PCX"].includes(exchange ?? "")
  ) {
    return "US";
  }

  return exchange ?? "OTHER";
}

export function getProviderSymbolCandidates({
  symbol,
  providerSymbol,
  market,
}: {
  symbol: string;
  providerSymbol: string;
  market: string;
}) {
  if (providerSymbol.length > 0) {
    return [providerSymbol.toUpperCase()];
  }

  const displaySymbol = normalizeDisplaySymbol(symbol);
  const knownDrMetadata = getKnownDrMetadata({ symbol: displaySymbol });
  const symbolLooksThai =
    symbol.toUpperCase().endsWith(".BK") || knownDrMetadata != null || /\d$/.test(displaySymbol);

  if (market === "TH" || symbolLooksThai) {
    return [`${displaySymbol}.BK`, displaySymbol];
  }

  if (market === "US") {
    return [displaySymbol];
  }

  return [displaySymbol, `${displaySymbol}.BK`];
}

export function getFallbackInstrumentInput({
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
}): InstrumentInput {
  const displaySymbol = normalizeDisplaySymbol(symbol || providerSymbol);
  const knownDrMetadata = getKnownDrMetadata({ symbol: displaySymbol, providerSymbol });
  const inferredMarket =
    market ||
    (providerSymbol.toUpperCase().endsWith(".BK") ||
    symbol.toUpperCase().endsWith(".BK") ||
    knownDrMetadata != null ||
    /\d$/.test(displaySymbol)
      ? "TH"
      : "US");

  return {
    symbol: displaySymbol,
    displayName: displayName || displaySymbol,
    market: inferredMarket,
    instrumentType:
      normalizeInstrumentType(instrumentType) || knownDrMetadata?.instrumentType || "EQUITY",
    currency: currency || (inferredMarket === "TH" ? "THB" : "USD"),
    providerSymbol:
      providerSymbol || (inferredMarket === "TH" ? `${displaySymbol}.BK` : displaySymbol),
  };
}

export function getCreateInstrumentKey(input: InstrumentInput) {
  return normalizeLookupValue(input.providerSymbol || input.symbol);
}
