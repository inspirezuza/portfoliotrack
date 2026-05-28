export type InstrumentSearchOption = {
  id: number;
  symbol: string;
  displayName: string;
  market: string;
  instrumentType: string;
  currency: string;
  providerSymbol?: string | null;
  label: string;
};

export function normalizeInstrumentSearchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sortInstrumentOptions<T extends InstrumentSearchOption>(instruments: T[]) {
  return [...instruments].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function getInstrumentSearchText(instrument: InstrumentSearchOption) {
  return [
    instrument.symbol,
    instrument.displayName,
    instrument.market,
    instrument.currency,
    instrument.instrumentType,
    instrument.providerSymbol ?? "",
    instrument.label,
  ].join(" ");
}

export function getInstrumentSearchScore(instrument: InstrumentSearchOption, query: string) {
  const normalizedQuery = normalizeInstrumentSearchValue(query);

  if (!normalizedQuery) {
    return 1;
  }

  const normalizedSymbol = normalizeInstrumentSearchValue(instrument.symbol);
  const normalizedProviderSymbol = normalizeInstrumentSearchValue(instrument.providerSymbol ?? "");
  const normalizedName = normalizeInstrumentSearchValue(instrument.displayName);
  const normalizedLabel = normalizeInstrumentSearchValue(getInstrumentSearchText(instrument));

  if (normalizedSymbol === normalizedQuery) {
    return 100;
  }

  if (normalizedProviderSymbol === normalizedQuery) {
    return 95;
  }

  if (normalizedSymbol.startsWith(normalizedQuery)) {
    return 90;
  }

  if (normalizedProviderSymbol.startsWith(normalizedQuery)) {
    return 85;
  }

  if (normalizedSymbol.includes(normalizedQuery)) {
    return 75;
  }

  if (normalizedProviderSymbol.includes(normalizedQuery)) {
    return 70;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 55;
  }

  return normalizedLabel.includes(normalizedQuery) ? 35 : 0;
}

export function findExactInstrumentSearchMatch<T extends InstrumentSearchOption>(
  instruments: T[],
  query: string,
) {
  const normalizedQuery = normalizeInstrumentSearchValue(query);

  if (!normalizedQuery) {
    return null;
  }

  return (
    instruments.find(
      (instrument) =>
        normalizeInstrumentSearchValue(instrument.symbol) === normalizedQuery ||
        normalizeInstrumentSearchValue(instrument.providerSymbol ?? "") === normalizedQuery,
    ) ?? null
  );
}
