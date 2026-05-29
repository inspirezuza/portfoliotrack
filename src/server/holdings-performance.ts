import { normalizeMoney } from "@/lib/db/precision";
import type { HistoricalPrice, Instrument, PriceSnapshot } from "@/lib/db/schema";
import { type PositionTransaction } from "@/lib/portfolio/positions";
import type { HoldingPerformance, HoldingPerformanceKey } from "@/server/holdings";
import { calculatePeriodPerformance } from "@/server/holdings/period-performance";
import { calculateCostBasisPerformance } from "@/server/holdings/cost-basis-performance";

export function getFxProviderSymbol(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}${toCurrency}=X`;
}

export function getFxRateToValuationCurrency({
  currency,
  fxSnapshotsByProviderSymbol,
  valuationCurrency,
}: {
  currency: string;
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  valuationCurrency: string;
}) {
  if (currency === valuationCurrency) {
    return 1;
  }

  const snapshot = fxSnapshotsByProviderSymbol.get(
    getFxProviderSymbol(currency, valuationCurrency),
  );

  return snapshot != null && snapshot.currency === valuationCurrency ? snapshot.price : null;
}

export function getUnderlyingFxRateToInstrumentCurrency({
  fxSnapshotsByProviderSymbol,
  instrument,
}: {
  fxSnapshotsByProviderSymbol: Map<string, PriceSnapshot>;
  instrument: Instrument;
}) {
  if (instrument.underlyingCurrency == null) {
    return null;
  }

  if (instrument.underlyingCurrency === instrument.currency) {
    return 1;
  }

  if (instrument.fxProviderSymbol == null) {
    return null;
  }

  const snapshot = fxSnapshotsByProviderSymbol.get(instrument.fxProviderSymbol);

  return snapshot != null && snapshot.currency === instrument.currency && snapshot.price > 0
    ? snapshot.price
    : null;
}

export function getPreviousClose({
  historicalRows,
  priceSnapshot,
}: {
  historicalRows: HistoricalPrice[];
  priceSnapshot: PriceSnapshot | null;
}) {
  if (priceSnapshot == null) {
    return null;
  }

  const asOfDate = priceSnapshot.asOf.slice(0, 10);
  let previousClose: number | null = null;
  let previousDate: string | null = null;

  for (const row of historicalRows) {
    if (
      row.currency === priceSnapshot.currency &&
      row.priceDate < asOfDate &&
      (previousDate == null || row.priceDate > previousDate)
    ) {
      previousDate = row.priceDate;
      previousClose = row.close;
    }
  }

  return previousClose;
}

export function calculateOneDayGain({
  lastPrice,
  previousClose,
  quantity,
}: {
  lastPrice: number | null;
  previousClose: number | null;
  quantity: number;
}) {
  if (lastPrice == null || previousClose == null || previousClose <= 0) {
    return {
      oneDayGain: null,
      oneDayGainPercent: null,
    };
  }

  return {
    oneDayGain: normalizeMoney((lastPrice - previousClose) * quantity),
    oneDayGainPercent: (lastPrice - previousClose) / previousClose,
  };
}

export function buildHoldingPerformance({
  fxRateToValuationCurrency,
  historicalRows,
  lastPrice,
  oneDayGain,
  oneDayGainPercent,
  priceSnapshot,
  quantity,
  transactions,
}: {
  fxRateToValuationCurrency: number | null;
  historicalRows: HistoricalPrice[];
  lastPrice: number | null;
  oneDayGain: number | null;
  oneDayGainPercent: number | null;
  priceSnapshot: PriceSnapshot | null;
  quantity: number;
  transactions: PositionTransaction[];
}): Record<HoldingPerformanceKey, HoldingPerformance> {
  const oneDayAmountInValuationCurrency =
    oneDayGain == null || fxRateToValuationCurrency == null
      ? null
      : normalizeMoney(oneDayGain * fxRateToValuationCurrency);
  const latestDate = priceSnapshot?.asOf.slice(0, 10) ?? null;
  const priceCurrency = priceSnapshot?.currency ?? null;

  return {
    "1D": {
      amount: oneDayGain,
      percent: oneDayGainPercent,
      amountInValuationCurrency: oneDayAmountInValuationCurrency,
    },
    "1W": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "1W",
    }),
    "1M": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "1M",
    }),
    YTD: calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "YTD",
    }),
    "1Y": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "1Y",
    }),
    "3Y": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "3Y",
    }),
    "5Y": calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "5Y",
    }),
    MAX: calculatePeriodPerformance({
      fxRateToValuationCurrency,
      historicalRows,
      lastPrice,
      latestDate,
      priceCurrency,
      quantity,
      timeframe: "MAX",
    }),
    COST_1D: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1D",
      transactions,
    }),
    COST_1W: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1W",
      transactions,
    }),
    COST_1M: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1M",
      transactions,
    }),
    COST_YTD: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "YTD",
      transactions,
    }),
    COST_1Y: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "1Y",
      transactions,
    }),
    COST_3Y: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "3Y",
      transactions,
    }),
    COST_5Y: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "5Y",
      transactions,
    }),
    COST_MAX: calculateCostBasisPerformance({
      fxRateToValuationCurrency,
      lastPrice,
      latestDate,
      timeframe: "MAX",
      transactions,
    }),
  };
}
