import type { instruments } from "@/lib/db/schema";
import { applyKnownDrMetadata } from "@/lib/instruments/dr-metadata";
import {
  BENCHMARK_HISTORY_START_DATE,
  BENCHMARK_WATCHLIST,
} from "@/lib/market/benchmark-watchlist";
import type { RefreshTarget } from "@/lib/market/refresh-context";

type InstrumentRow = typeof instruments.$inferSelect;

type RefreshTransactionRow = {
  instrumentId: number;
  tradeDate: string;
};

export function buildMarketRefreshTargets({
  baseCurrency,
  benchmarkSymbol,
  includeBenchmark,
  instrumentRows,
  today,
  transactionRows,
}: {
  baseCurrency: string;
  benchmarkSymbol: string | null;
  includeBenchmark: boolean;
  instrumentRows: InstrumentRow[];
  today: string;
  transactionRows: RefreshTransactionRow[];
}): RefreshTarget[] {
  const currentTransactionRows = transactionRows.filter((row) => row.tradeDate <= today);
  const earliestTradeDateByInstrument = new Map<number, string>();
  let earliestPortfolioTradeDate: string | null = null;

  for (const row of currentTransactionRows) {
    if (earliestPortfolioTradeDate == null || row.tradeDate < earliestPortfolioTradeDate) {
      earliestPortfolioTradeDate = row.tradeDate;
    }

    const existingTradeDate = earliestTradeDateByInstrument.get(row.instrumentId);

    if (existingTradeDate == null || row.tradeDate < existingTradeDate) {
      earliestTradeDateByInstrument.set(row.instrumentId, row.tradeDate);
    }
  }

  const benchmarkInstrument =
    benchmarkSymbol == null
      ? null
      : (instrumentRows.find((instrument) => instrument.symbol === benchmarkSymbol) ?? null);
  const refreshTargets = new Map<number, RefreshTarget>();
  const instrumentRowsByProviderSymbol = new Map(
    instrumentRows.map(
      (instrument) => [instrument.providerSymbol, applyKnownDrMetadata(instrument)] as const,
    ),
  );

  function addRefreshTargetByProviderSymbol(
    providerSymbol: string | null,
    historyStartDate: string,
  ) {
    if (providerSymbol == null) {
      return;
    }

    const instrument = instrumentRowsByProviderSymbol.get(providerSymbol);

    if (instrument == null) {
      return;
    }

    refreshTargets.set(instrument.id, {
      instrument,
      historyStartDate,
    });
  }

  for (const instrumentRow of instrumentRows) {
    const instrument = applyKnownDrMetadata(instrumentRow);
    const historyStartDate = earliestTradeDateByInstrument.get(instrument.id) ?? null;

    if (historyStartDate != null) {
      refreshTargets.set(instrument.id, {
        instrument,
        historyStartDate,
      });

      if (instrument.currency !== baseCurrency) {
        addRefreshTargetByProviderSymbol(
          `${instrument.currency}${baseCurrency}=X`,
          historyStartDate,
        );
      }

      addRefreshTargetByProviderSymbol(instrument.underlyingProviderSymbol, historyStartDate);
      addRefreshTargetByProviderSymbol(instrument.fxProviderSymbol, historyStartDate);
    }
  }

  if (includeBenchmark && benchmarkInstrument != null) {
    refreshTargets.set(benchmarkInstrument.id, {
      instrument: benchmarkInstrument,
      historyStartDate: earliestPortfolioTradeDate,
    });
  }

  if (includeBenchmark) {
    for (const benchmark of BENCHMARK_WATCHLIST) {
      const benchmarkInstrumentRow = instrumentRows.find(
        (instrument) => instrument.symbol === benchmark.symbol,
      );

      if (benchmarkInstrumentRow == null) {
        continue;
      }

      refreshTargets.set(benchmarkInstrumentRow.id, {
        instrument: benchmarkInstrumentRow,
        historyStartDate: BENCHMARK_HISTORY_START_DATE,
      });
    }
  }

  return Array.from(refreshTargets.values());
}
