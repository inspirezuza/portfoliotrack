const yahooQuoteTypeMap: Record<string, string> = {
  ETF: "ETF",
  FUND: "FUND",
  MUTUALFUND: "FUND",
};

const instrumentTypeAliases: Record<string, string> = {
  EQUITY: "EQUITY",
  STOCK: "EQUITY",
  COMMONSTOCK: "EQUITY",
  ETF: "ETF",
  FUND: "FUND",
  MUTUALFUND: "FUND",
  DR: "DR",
  FX: "FX",
};

export function normalizeInstrumentType(value: string) {
  const normalizedValue = value.trim().toUpperCase();
  const aliasKey = normalizedValue.replace(/[^A-Z0-9]/g, "");

  if (normalizedValue.length === 0) {
    return "";
  }

  return instrumentTypeAliases[aliasKey] ?? normalizedValue;
}

export function getInstrumentTypeFromYahooQuoteType(quoteType?: string | null) {
  const normalizedQuoteType = normalizeInstrumentType(quoteType ?? "");

  if (normalizedQuoteType.length === 0) {
    return "EQUITY";
  }

  return yahooQuoteTypeMap[normalizedQuoteType] ?? "EQUITY";
}
