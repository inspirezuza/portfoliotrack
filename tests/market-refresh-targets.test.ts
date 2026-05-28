import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_HISTORY_START_DATE,
  BENCHMARK_WATCHLIST,
} from "@/lib/market/benchmark-watchlist";
import { buildMarketRefreshTargets } from "@/lib/market/refresh-targets";
import type { RefreshTarget } from "@/lib/market/refresh-context";

function createInstrument(
  id: number,
  overrides: Partial<RefreshTarget["instrument"]> = {},
): RefreshTarget["instrument"] {
  const symbol = overrides.symbol ?? `SYM${id}`;

  return {
    id,
    symbol,
    displayName: symbol,
    market: "NASDAQ",
    instrumentType: "EQUITY",
    currency: "USD",
    providerSymbol: symbol,
    underlyingSymbol: null,
    underlyingDisplayName: null,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function targetSummary(targets: RefreshTarget[]) {
  return targets
    .map((target) => ({
      historyStartDate: target.historyStartDate,
      id: target.instrument.id,
      providerSymbol: target.instrument.providerSymbol,
      symbol: target.instrument.symbol,
    }))
    .sort((left, right) => left.id - right.id);
}

test("market refresh targets preserve portfolio, FX, DR, and benchmark coverage", () => {
  const usdHolding = createInstrument(1, { providerSymbol: "MSFT", symbol: "MSFT" });
  const thbHolding = createInstrument(2, {
    currency: "THB",
    providerSymbol: "CPALL.BK",
    symbol: "CPALL",
  });
  const usdThbFx = createInstrument(3, {
    currency: "THB",
    providerSymbol: "USDTHB=X",
    symbol: "USDTHB",
  });
  const knownDr = createInstrument(4, {
    currency: "THB",
    instrumentType: "DR",
    providerSymbol: "AAPL80.BK",
    symbol: "AAPL80",
  });
  const spyBenchmark = createInstrument(5, { providerSymbol: "SPY", symbol: "SPY" });
  const watchlistBenchmark = createInstrument(6, {
    providerSymbol: BENCHMARK_WATCHLIST[0].providerSymbol,
    symbol: BENCHMARK_WATCHLIST[0].symbol,
  });
  const inactiveFutureOnly = createInstrument(7, {
    providerSymbol: "FUTURE",
    symbol: "FUTURE",
  });
  const drUnderlying = createInstrument(8, { providerSymbol: "AAPL", symbol: "AAPL" });

  const targets = buildMarketRefreshTargets({
    baseCurrency: "THB",
    benchmarkSymbol: "SPY",
    includeBenchmark: true,
    instrumentRows: [
      usdHolding,
      thbHolding,
      usdThbFx,
      knownDr,
      spyBenchmark,
      watchlistBenchmark,
      inactiveFutureOnly,
      drUnderlying,
    ],
    today: "2026-05-29",
    transactionRows: [
      { instrumentId: usdHolding.id, tradeDate: "2026-01-10" },
      { instrumentId: usdHolding.id, tradeDate: "2026-01-05" },
      { instrumentId: knownDr.id, tradeDate: "2026-02-01" },
      { instrumentId: inactiveFutureOnly.id, tradeDate: "2026-06-01" },
    ],
  });

  assert.deepEqual(targetSummary(targets), [
    { historyStartDate: "2026-01-05", id: 1, providerSymbol: "MSFT", symbol: "MSFT" },
    { historyStartDate: "2026-02-01", id: 3, providerSymbol: "USDTHB=X", symbol: "USDTHB" },
    { historyStartDate: "2026-02-01", id: 4, providerSymbol: "AAPL80.BK", symbol: "AAPL80" },
    { historyStartDate: "2026-01-05", id: 5, providerSymbol: "SPY", symbol: "SPY" },
    {
      historyStartDate: BENCHMARK_HISTORY_START_DATE,
      id: 6,
      providerSymbol: BENCHMARK_WATCHLIST[0].providerSymbol,
      symbol: BENCHMARK_WATCHLIST[0].symbol,
    },
    { historyStartDate: "2026-02-01", id: 8, providerSymbol: "AAPL", symbol: "AAPL" },
  ]);
});

test("market refresh targets can skip benchmark-only targets", () => {
  const holding = createInstrument(1, { providerSymbol: "AAPL", symbol: "AAPL" });
  const spyBenchmark = createInstrument(2, { providerSymbol: "SPY", symbol: "SPY" });

  const targets = buildMarketRefreshTargets({
    baseCurrency: "USD",
    benchmarkSymbol: "SPY",
    includeBenchmark: false,
    instrumentRows: [holding, spyBenchmark],
    today: "2026-05-29",
    transactionRows: [{ instrumentId: holding.id, tradeDate: "2026-01-05" }],
  });

  assert.deepEqual(targetSummary(targets), [
    { historyStartDate: "2026-01-05", id: 1, providerSymbol: "AAPL", symbol: "AAPL" },
  ]);
});
