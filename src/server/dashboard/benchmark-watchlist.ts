import { BENCHMARK_WATCHLIST } from "@/lib/market/provider";
import type { PortfolioBenchmarkTimeline } from "@/lib/portfolio/timeline";
import { historicalPrices, instruments, intradayPrices, priceSnapshots } from "@/lib/db/schema";
import { buildBenchmarkComparisonPayload } from "@/server/benchmark-comparisons";
import {
  buildLocalDemoMonthlyReturns,
  buildLocalDemoOverlayPoints,
  getLocalDemoQuote,
  shouldUseLocalDemoMarketData,
} from "@/server/dashboard/local-demo-market";
import {
  buildPortfolioMonthlyReturns,
  calculateBenchmarkReturnPercent,
  getBenchmarkMonthKey,
} from "@/server/dashboard/benchmark-monthly-returns";

export function buildBenchmarkWatchlist({
  historicalPriceRows,
  instrumentRows,
  intradayPriceRows,
  priceSnapshotRows,
  timeline,
}: {
  historicalPriceRows: Array<typeof historicalPrices.$inferSelect>;
  instrumentRows: Array<typeof instruments.$inferSelect>;
  intradayPriceRows: Array<typeof intradayPrices.$inferSelect>;
  priceSnapshotRows: Array<typeof priceSnapshots.$inferSelect>;
  timeline: PortfolioBenchmarkTimeline;
}) {
  const instrumentsBySymbol = new Map(
    instrumentRows.map((instrument) => [instrument.symbol, instrument]),
  );
  const comparisonPayloadByInstrumentId = new Map<
    number,
    ReturnType<typeof buildBenchmarkComparisonPayload>
  >();
  const getComparisonPayload = (instrument: typeof instruments.$inferSelect) => {
    const cachedPayload = comparisonPayloadByInstrumentId.get(instrument.id);

    if (cachedPayload != null) {
      return cachedPayload;
    }

    const payload = buildBenchmarkComparisonPayload({
      historicalPriceRows,
      instrument,
      intradayPriceRows,
      priceSnapshotRows,
    });

    comparisonPayloadByInstrumentId.set(instrument.id, payload);
    return payload;
  };
  const quotes = BENCHMARK_WATCHLIST.map((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;
    const historyRows =
      instrument == null
        ? []
        : historicalPriceRows
            .filter(
              (row) => row.instrumentId === instrument.id && row.currency === benchmark.currency,
            )
            .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
    const localDemoQuote = shouldUseLocalDemoMarketData(historyRows.length)
      ? getLocalDemoQuote(benchmark.symbol)
      : null;
    const comparisonQuote = instrument == null ? null : getComparisonPayload(instrument).quote;
    const price = comparisonQuote?.price ?? localDemoQuote?.price ?? null;
    const dailyChange =
      comparisonQuote?.dailyChange ??
      (price == null || localDemoQuote == null ? null : localDemoQuote.dailyChange);
    const previousClose = price == null || dailyChange == null ? null : price - dailyChange;

    return {
      symbol: benchmark.symbol,
      displayName: benchmark.displayName,
      providerSymbol: benchmark.providerSymbol,
      market: benchmark.market,
      currency: benchmark.currency,
      price,
      asOf: comparisonQuote?.asOf ?? localDemoQuote?.asOf ?? null,
      dailyChange: price == null || previousClose == null ? null : price - previousClose,
      dailyChangePercent: calculateBenchmarkReturnPercent(previousClose, price),
    };
  });
  const portfolioMonthlyReturns = buildPortfolioMonthlyReturns(timeline);
  const monthlyReturns = BENCHMARK_WATCHLIST.flatMap((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;

    if (instrument == null) {
      return shouldUseLocalDemoMarketData(0)
        ? buildLocalDemoMonthlyReturns({
            portfolioMonthlyReturns,
            symbol: benchmark.symbol,
          })
        : [];
    }

    const rowsByMonth = new Map<string, Array<typeof historicalPrices.$inferSelect>>();

    for (const row of historicalPriceRows) {
      if (row.instrumentId !== instrument.id || row.currency !== benchmark.currency) {
        continue;
      }

      const month = getBenchmarkMonthKey(row.priceDate);
      const monthRows = rowsByMonth.get(month) ?? [];
      monthRows.push(row);
      rowsByMonth.set(month, monthRows);
    }

    if (shouldUseLocalDemoMarketData(rowsByMonth.size)) {
      return buildLocalDemoMonthlyReturns({
        portfolioMonthlyReturns,
        symbol: benchmark.symbol,
      });
    }

    return Array.from(rowsByMonth, ([month, monthRows]) => {
      const orderedRows = monthRows.sort((left, right) =>
        left.priceDate.localeCompare(right.priceDate),
      );
      const benchmarkReturn = calculateBenchmarkReturnPercent(
        orderedRows[0]?.close ?? null,
        orderedRows[orderedRows.length - 1]?.close ?? null,
      );
      const portfolioReturn = portfolioMonthlyReturns.get(month) ?? null;

      return {
        symbol: benchmark.symbol,
        month,
        returnPercent: benchmarkReturn,
        portfolioReturnPercent: portfolioReturn,
        excessReturnPercent:
          benchmarkReturn == null || portfolioReturn == null
            ? null
            : portfolioReturn - benchmarkReturn,
      };
    });
  }).sort((left, right) =>
    left.month === right.month
      ? left.symbol.localeCompare(right.symbol)
      : left.month.localeCompare(right.month),
  );
  const overlays = BENCHMARK_WATCHLIST.map((benchmark) => {
    const instrument = instrumentsBySymbol.get(benchmark.symbol) ?? null;
    const comparisonOverlay = instrument == null ? null : getComparisonPayload(instrument).overlay;
    const dailyPointCount =
      instrument == null
        ? 0
        : historicalPriceRows.filter(
            (row) => row.instrumentId === instrument.id && row.currency === benchmark.currency,
          ).length;

    return {
      symbol: benchmark.symbol,
      displayName: benchmark.displayName,
      providerSymbol: benchmark.providerSymbol,
      market: benchmark.market,
      currency: benchmark.currency,
      points: shouldUseLocalDemoMarketData(dailyPointCount)
        ? buildLocalDemoOverlayPoints(benchmark.symbol)
        : (comparisonOverlay?.points ?? []),
    };
  });

  return {
    monthlyReturns,
    overlays,
    quotes,
  };
}
