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
};

function normalizeDisplaySymbol(value: string) {
  const normalizedValue = value.trim().toUpperCase();

  return normalizedValue.endsWith(".BK") ? normalizedValue.slice(0, -3) : normalizedValue;
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

export function applyKnownDrMetadata<TInstrument extends DrEnrichableInstrument>(
  instrument: TInstrument,
): TInstrument {
  const metadata = getKnownDrMetadata(instrument);

  if (metadata == null) {
    return instrument;
  }

  return {
    ...instrument,
    instrumentType: metadata.instrumentType,
    underlyingSymbol: instrument.underlyingSymbol ?? metadata.underlyingSymbol,
    underlyingDisplayName: instrument.underlyingDisplayName ?? metadata.underlyingDisplayName,
    underlyingCurrency: instrument.underlyingCurrency ?? metadata.underlyingCurrency,
    underlyingProviderSymbol:
      instrument.underlyingProviderSymbol ?? metadata.underlyingProviderSymbol,
    drRatio: instrument.drRatio ?? metadata.drRatio,
    fxProviderSymbol: instrument.fxProviderSymbol ?? metadata.fxProviderSymbol,
  };
}
