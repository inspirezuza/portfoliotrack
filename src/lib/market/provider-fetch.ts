import type { RefreshTarget } from "@/lib/market/refresh-context";
import type {
  MarketDataProvider,
  MarketHistoricalSeries,
  MarketIntradayInterval,
  MarketIntradaySeries,
  MarketQuoteSnapshot,
} from "@/lib/market/types";

type IntradayRefreshWindow = {
  interval: MarketIntradayInterval;
  lookbackDays: number;
};

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export async function fetchMarketDataProviderPayloads({
  intradayWindows,
  now = new Date(),
  provider,
  targets,
}: {
  intradayWindows: IntradayRefreshWindow[];
  now?: Date;
  provider: MarketDataProvider;
  targets: RefreshTarget[];
}) {
  const providerSymbols = targets.map((target) => target.instrument.providerSymbol);
  const quoteRows = await provider.getLatestQuotes(providerSymbols);
  const quoteByProviderSymbol = new Map(
    quoteRows.map((quote) => [quote.providerSymbol, quote] satisfies [string, MarketQuoteSnapshot]),
  );
  const historyTargets = targets.filter((target) => target.historyStartDate != null);
  const historicalResults = await Promise.all(
    historyTargets.map(
      async (target) =>
        [
          target.instrument.id,
          await provider.getHistoricalPrices(target.instrument.providerSymbol, {
            startDate: target.historyStartDate ?? now.toISOString().slice(0, 10),
          }),
        ] as const,
    ),
  );
  const historyByInstrumentId = new Map(
    historicalResults.filter(([, result]) => result != null) as Array<
      [number, MarketHistoricalSeries]
    >,
  );
  const intradayResults = await Promise.all(
    targets.flatMap((target) =>
      intradayWindows.map(
        async (window) =>
          [
            target.instrument.id,
            window.interval,
            await provider.getIntradayPrices(target.instrument.providerSymbol, {
              interval: window.interval,
              startAt: addDays(now, -window.lookbackDays).toISOString(),
            }),
          ] as const,
      ),
    ),
  );
  const intradayByInstrumentIdAndInterval = new Map(
    intradayResults
      .filter(
        (row): row is readonly [number, MarketIntradayInterval, MarketIntradaySeries] =>
          row[2] != null,
      )
      .map(
        ([instrumentId, interval, result]) =>
          [`${instrumentId}:${interval}`, result] satisfies [string, MarketIntradaySeries],
      ),
  );

  return {
    historyByInstrumentId,
    intradayByInstrumentIdAndInterval,
    quoteByProviderSymbol,
  };
}
