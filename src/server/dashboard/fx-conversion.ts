import { normalizeMoney } from "@/lib/db/precision";
import { historicalPrices, instruments, intradayPrices, priceSnapshots } from "@/lib/db/schema";
import type { TimelineIntradayPrice } from "@/lib/portfolio/timeline";

export type DashboardFxTransactionRow = {
  instrumentId: number;
  tradeDate: string;
  side: string;
  quantity: number;
  price: number;
  fee: number;
  createdAt: string;
  id: number;
};

type DailyFxRateRow = { priceDate: string; close: number };
type IntradayFxRateRow = { observedAt: string; close: number };

export function getFxProviderSymbol(fromCurrency: string, toCurrency: string) {
  return `${fromCurrency}${toCurrency}=X`;
}

function findLatestDailyFxRate(rows: DailyFxRateRow[], date: string) {
  let lowerIndex = 0;
  let upperIndex = rows.length - 1;
  let close: number | null = null;

  while (lowerIndex <= upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const row = rows[middleIndex];

    if (row.priceDate <= date) {
      close = row.close;
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex - 1;
    }
  }

  return close;
}

function findLatestIntradayFxRate(rows: IntradayFxRateRow[], observedAt: string) {
  let lowerIndex = 0;
  let upperIndex = rows.length - 1;
  let close: number | null = null;

  while (lowerIndex <= upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const row = rows[middleIndex];

    if (row.observedAt <= observedAt) {
      close = row.close;
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex - 1;
    }
  }

  return close;
}

export function buildDashboardFxConvertedRows({
  benchmarkInstrumentId,
  fxInstrumentIds,
  historicalPriceRows,
  instrumentRows,
  intradayPriceRows,
  priceSnapshotRows,
  transactionRows,
  valuationCurrency,
}: {
  benchmarkInstrumentId: number | null;
  fxInstrumentIds: number[];
  historicalPriceRows: Array<typeof historicalPrices.$inferSelect>;
  instrumentRows: Array<typeof instruments.$inferSelect>;
  intradayPriceRows: Array<typeof intradayPrices.$inferSelect>;
  priceSnapshotRows: Array<typeof priceSnapshots.$inferSelect>;
  transactionRows: DashboardFxTransactionRow[];
  valuationCurrency: string;
}) {
  const instrumentById = new Map(instrumentRows.map((instrument) => [instrument.id, instrument]));
  const fxInstrumentIdSet = new Set(fxInstrumentIds);
  const transactionInstrumentIds = new Set(
    transactionRows.map((transaction) => transaction.instrumentId),
  );
  const benchmarkInstrument =
    benchmarkInstrumentId == null ? null : (instrumentById.get(benchmarkInstrumentId) ?? null);
  const fxHistoricalRowsByCurrency = new Map<string, DailyFxRateRow[]>();
  const fxIntradayRowsByCurrency = new Map<string, IntradayFxRateRow[]>();

  for (const fxInstrumentId of fxInstrumentIds) {
    const fxInstrument = instrumentById.get(fxInstrumentId);

    if (fxInstrument == null) {
      continue;
    }

    const sourceCurrency = fxInstrument.providerSymbol.slice(0, 3);

    fxHistoricalRowsByCurrency.set(
      sourceCurrency,
      historicalPriceRows
        .filter((row) => row.instrumentId === fxInstrumentId && row.currency === valuationCurrency)
        .map((row) => ({ priceDate: row.priceDate, close: row.close }))
        .sort((left, right) => left.priceDate.localeCompare(right.priceDate)),
    );
    fxIntradayRowsByCurrency.set(
      sourceCurrency,
      intradayPriceRows
        .filter((row) => row.instrumentId === fxInstrumentId && row.currency === valuationCurrency)
        .map((row) => ({ observedAt: row.observedAt, close: row.close }))
        .sort((left, right) => left.observedAt.localeCompare(right.observedAt)),
    );
  }

  const convertDailyValue = (currency: string, date: string, value: number) => {
    if (currency === valuationCurrency) {
      return value;
    }

    const rate = findLatestDailyFxRate(fxHistoricalRowsByCurrency.get(currency) ?? [], date);

    return rate == null ? null : normalizeMoney(value * rate);
  };
  const convertIntradayValue = (currency: string, observedAt: string, value: number) => {
    if (currency === valuationCurrency) {
      return value;
    }

    const rate = findLatestIntradayFxRate(fxIntradayRowsByCurrency.get(currency) ?? [], observedAt);

    return rate == null ? null : normalizeMoney(value * rate);
  };
  const shouldIncludeConvertedMarketRow = (instrumentId: number) =>
    !fxInstrumentIdSet.has(instrumentId) &&
    (instrumentId !== benchmarkInstrumentId || transactionInstrumentIds.has(instrumentId));

  const convertedTransactionRows = transactionRows
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedPrice = convertDailyValue(instrument.currency, row.tradeDate, row.price);
      const convertedFee = convertDailyValue(instrument.currency, row.tradeDate, row.fee);

      if (convertedPrice == null || convertedFee == null) {
        return null;
      }

      return {
        ...row,
        fee: convertedFee,
        price: convertedPrice,
      };
    })
    .filter((row): row is DashboardFxTransactionRow => row != null);
  const convertedHistoricalPriceRows = historicalPriceRows
    .filter((row) => shouldIncludeConvertedMarketRow(row.instrumentId))
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedClose = convertDailyValue(instrument.currency, row.priceDate, row.close);

      return convertedClose == null
        ? null
        : {
            ...row,
            close: convertedClose,
            currency: valuationCurrency,
          };
    })
    .filter((row): row is (typeof historicalPriceRows)[number] => row != null);
  const convertedIntradayPriceRows = intradayPriceRows
    .filter((row) => shouldIncludeConvertedMarketRow(row.instrumentId))
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedClose = convertIntradayValue(instrument.currency, row.observedAt, row.close);

      return convertedClose == null
        ? null
        : {
            ...row,
            close: convertedClose,
            currency: valuationCurrency,
          };
    })
    .filter((row): row is (typeof intradayPriceRows)[number] => row != null);
  const convertedSnapshotPriceRows: TimelineIntradayPrice[] = priceSnapshotRows
    .filter((row) => shouldIncludeConvertedMarketRow(row.instrumentId))
    .map((row) => {
      const instrument = instrumentById.get(row.instrumentId);

      if (instrument == null) {
        return null;
      }

      const convertedClose = convertIntradayValue(instrument.currency, row.asOf, row.price);

      return convertedClose == null
        ? null
        : {
            instrumentId: row.instrumentId,
            observedAt: row.asOf,
            close: convertedClose,
            currency: valuationCurrency,
            interval: "1h" as const,
          };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  const convertedInstrumentRows = instrumentRows.map((instrument) => ({
    ...instrument,
    currency: fxInstrumentIdSet.has(instrument.id) ? instrument.currency : valuationCurrency,
  }));
  const benchmarkHistoricalPriceRows =
    benchmarkInstrument == null
      ? []
      : historicalPriceRows.filter(
          (row) =>
            row.instrumentId === benchmarkInstrument.id &&
            row.currency === benchmarkInstrument.currency,
        );
  const convertedHistoricalPriceKeys = new Set(
    convertedHistoricalPriceRows.map(
      (row) => `${row.instrumentId}:${row.priceDate}:${row.currency}`,
    ),
  );
  const timelineHistoricalPriceRows = [
    ...convertedHistoricalPriceRows,
    ...benchmarkHistoricalPriceRows.filter(
      (row) =>
        !convertedHistoricalPriceKeys.has(`${row.instrumentId}:${row.priceDate}:${row.currency}`),
    ),
  ];
  const benchmarkIntradayPriceRows =
    benchmarkInstrument == null
      ? []
      : intradayPriceRows.filter(
          (row) =>
            row.instrumentId === benchmarkInstrument.id &&
            row.currency === benchmarkInstrument.currency,
        );
  const convertedIntradayPriceKeys = new Set(
    convertedIntradayPriceRows.map(
      (row) => `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
    ),
  );
  const convertedSnapshotPriceKeys = new Set(
    convertedSnapshotPriceRows.map(
      (row) => `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
    ),
  );
  const benchmarkSnapshotPriceRows: TimelineIntradayPrice[] =
    benchmarkInstrument == null
      ? []
      : priceSnapshotRows
          .filter(
            (row) =>
              row.instrumentId === benchmarkInstrument.id &&
              row.currency === benchmarkInstrument.currency,
          )
          .map((row) => ({
            instrumentId: row.instrumentId,
            observedAt: row.asOf,
            close: row.price,
            currency: row.currency,
            interval: "1h" as const,
          }));
  const timelineIntradayPriceRows = [
    ...convertedIntradayPriceRows,
    ...convertedSnapshotPriceRows,
    ...benchmarkIntradayPriceRows.filter(
      (row) =>
        !convertedIntradayPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ) &&
        !convertedSnapshotPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ),
    ),
    ...benchmarkSnapshotPriceRows.filter(
      (row) =>
        !convertedIntradayPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ) &&
        !convertedSnapshotPriceKeys.has(
          `${row.instrumentId}:${row.observedAt}:${row.currency}:${row.interval}`,
        ),
    ),
  ];

  return {
    convertedInstrumentRows,
    convertedTransactionRows,
    timelineHistoricalPriceRows,
    timelineIntradayPriceRows,
  };
}
