type DrMetadata = {
  instrumentType: "DR";
  underlyingSymbol: string;
  underlyingDisplayName: string;
  underlyingCurrency: string;
  underlyingProviderSymbol: string;
  drRatio: number;
  fxProviderSymbol: string;
};

type DrLookupInput = {
  market?: string | null;
  symbol: string;
  providerSymbol?: string | null;
};

type DrEnrichableInstrument = DrLookupInput & {
  instrumentType: string;
  underlyingSymbol: string | null;
  underlyingDisplayName: string | null;
  underlyingCurrency: string | null;
  underlyingProviderSymbol: string | null;
  drRatio: number | null;
  fxProviderSymbol: string | null;
};

const knownDrMetadataByDisplaySymbol: Record<string, DrMetadata> = {
  AAPL80: {
    instrumentType: "DR",
    underlyingSymbol: "AAPL",
    underlyingDisplayName: "Apple Inc.",
    underlyingCurrency: "USD",
    underlyingProviderSymbol: "AAPL",
    drRatio: 1000,
    fxProviderSymbol: "USDTHB=X",
  },
  ASTS03: {
    instrumentType: "DR",
    underlyingSymbol: "ASTS",
    underlyingDisplayName: "AST SpaceMobile, Inc., Class A",
    underlyingCurrency: "USD",
    underlyingProviderSymbol: "ASTS",
    drRatio: 1000,
    fxProviderSymbol: "USDTHB=X",
  },
  CRSP03: {
    instrumentType: "DR",
    underlyingSymbol: "CRSP",
    underlyingDisplayName: "CRISPR Therapeutics Ltd",
    underlyingCurrency: "USD",
    underlyingProviderSymbol: "CRSP",
    drRatio: 500,
    fxProviderSymbol: "USDTHB=X",
  },
};

function normalizeDisplaySymbol(value: string) {
  const normalizedValue = value.trim().toUpperCase();

  return normalizedValue.endsWith(".BK") ? normalizedValue.slice(0, -3) : normalizedValue;
}

function isThaiInstrument(input: DrLookupInput) {
  const normalizedMarket = input.market?.trim().toUpperCase();
  const normalizedProviderSymbol = input.providerSymbol?.trim().toUpperCase() ?? "";

  return (
    normalizedMarket === "TH" ||
    normalizedMarket === "SET" ||
    normalizedProviderSymbol.endsWith(".BK")
  );
}

function hasThaiDrSymbolSuffix(value: string) {
  return /^[A-Z][A-Z0-9]*\d{2}$/.test(normalizeDisplaySymbol(value));
}

function isLikelyThaiDr(input: DrLookupInput) {
  if (!isThaiInstrument(input)) {
    return false;
  }

  return (
    hasThaiDrSymbolSuffix(input.symbol) ||
    (input.providerSymbol != null && hasThaiDrSymbolSuffix(input.providerSymbol))
  );
}

export function getKnownDrMetadata(input: DrLookupInput) {
  return (
    knownDrMetadataByDisplaySymbol[normalizeDisplaySymbol(input.symbol)] ??
    (input.providerSymbol == null
      ? null
      : knownDrMetadataByDisplaySymbol[normalizeDisplaySymbol(input.providerSymbol)]) ??
    null
  );
}

export function getDrInstrumentType(input: DrLookupInput & { instrumentType?: string | null }) {
  if (
    input.instrumentType?.trim().toUpperCase() === "DR" ||
    getKnownDrMetadata(input) != null ||
    isLikelyThaiDr(input)
  ) {
    return "DR" as const;
  }

  return null;
}

export function applyKnownDrMetadata<TInstrument extends DrEnrichableInstrument>(
  instrument: TInstrument,
): TInstrument {
  const metadata = getKnownDrMetadata(instrument);
  const instrumentType = getDrInstrumentType(instrument);

  if (metadata == null && instrumentType == null) {
    return instrument;
  }

  return {
    ...instrument,
    instrumentType: instrumentType ?? instrument.instrumentType,
    underlyingSymbol: instrument.underlyingSymbol ?? metadata?.underlyingSymbol ?? null,
    underlyingDisplayName:
      instrument.underlyingDisplayName ?? metadata?.underlyingDisplayName ?? null,
    underlyingCurrency: instrument.underlyingCurrency ?? metadata?.underlyingCurrency ?? null,
    underlyingProviderSymbol:
      instrument.underlyingProviderSymbol ?? metadata?.underlyingProviderSymbol ?? null,
    drRatio: instrument.drRatio ?? metadata?.drRatio ?? null,
    fxProviderSymbol: instrument.fxProviderSymbol ?? metadata?.fxProviderSymbol ?? null,
  };
}
