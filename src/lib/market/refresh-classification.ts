import type { MarketRefreshIssue } from "@/lib/market/provider-core";
import type { RefreshTarget } from "@/lib/market/refresh-context";
import type {
  MarketHistoricalSeries,
  MarketIntradayInterval,
  MarketIntradaySeries,
  MarketQuoteSnapshot,
} from "@/lib/market/types";

export type RefreshIntradayWindow = {
  interval: MarketIntradayInterval;
};

export function classifyRefreshPayloads({
  historyByInstrumentId,
  intradayByInstrumentIdAndInterval,
  intradayWindows,
  quoteByProviderSymbol,
  targets,
}: {
  historyByInstrumentId: Map<number, MarketHistoricalSeries>;
  intradayByInstrumentIdAndInterval: Map<string, MarketIntradaySeries>;
  intradayWindows: RefreshIntradayWindow[];
  quoteByProviderSymbol: Map<string, MarketQuoteSnapshot>;
  targets: RefreshTarget[];
}) {
  const issues: MarketRefreshIssue[] = [];
  const validQuotes = new Map<number, MarketQuoteSnapshot>();
  const validHistories = new Map<number, MarketHistoricalSeries>();
  const validIntradaySeries = new Map<
    string,
    { instrumentId: number; series: MarketIntradaySeries }
  >();

  for (const target of targets) {
    const quote = quoteByProviderSymbol.get(target.instrument.providerSymbol);

    if (quote == null) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "missing_quote",
      });
    } else if (quote.currency !== target.instrument.currency) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "quote_currency_mismatch",
      });
    } else {
      validQuotes.set(target.instrument.id, quote);
    }

    for (const window of intradayWindows) {
      const intraday = intradayByInstrumentIdAndInterval.get(
        `${target.instrument.id}:${window.interval}`,
      );

      if (intraday == null) {
        issues.push({
          symbol: target.instrument.symbol,
          providerSymbol: target.instrument.providerSymbol,
          reason: "missing_intraday",
        });
        continue;
      }

      if (intraday.currency !== target.instrument.currency) {
        issues.push({
          symbol: target.instrument.symbol,
          providerSymbol: target.instrument.providerSymbol,
          reason: "intraday_currency_mismatch",
        });
        continue;
      }

      validIntradaySeries.set(`${target.instrument.id}:${window.interval}`, {
        instrumentId: target.instrument.id,
        series: intraday,
      });
    }

    if (target.historyStartDate == null) {
      continue;
    }

    const history = historyByInstrumentId.get(target.instrument.id);

    if (history == null) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "missing_history",
      });
      continue;
    }

    if (history.currency !== target.instrument.currency) {
      issues.push({
        symbol: target.instrument.symbol,
        providerSymbol: target.instrument.providerSymbol,
        reason: "history_currency_mismatch",
      });
      continue;
    }

    validHistories.set(target.instrument.id, history);
  }

  return {
    issues,
    validHistories,
    validIntradaySeries,
    validQuotes,
  };
}
