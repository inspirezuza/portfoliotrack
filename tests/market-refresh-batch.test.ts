import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmptyMarketDataRefreshBatchResult,
  getMarketDataRefreshBatchTargets,
} from "../src/lib/market/refresh-batch";
import type { RefreshContext, RefreshTarget } from "../src/lib/market/refresh-context";

function createTarget(id: number, symbol = `SYM${id}`): RefreshTarget {
  return {
    historyStartDate: "2026-01-01",
    instrument: {
      currency: "USD",
      displayName: symbol,
      id,
      instrumentType: "EQUITY",
      market: "NASDAQ",
      providerSymbol: symbol,
      symbol,
      underlyingSymbol: null,
      underlyingDisplayName: null,
      underlyingCurrency: null,
      underlyingProviderSymbol: null,
      drRatio: null,
      fxProviderSymbol: null,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function createContext(targets: RefreshTarget[]): RefreshContext {
  return {
    benchmarkSymbol: "SPY",
    marketRefreshMinutes: 30,
    targets,
  };
}

test("market refresh batch helper preserves target slicing and progress metadata", () => {
  const targets = [createTarget(3), createTarget(1), createTarget(2), createTarget(4)];

  assert.deepEqual(getMarketDataRefreshBatchTargets(targets, null, 2), {
    batchTargets: [targets[1], targets[2]],
    hasMore: true,
    lastProcessedInstrumentId: 2,
    sortedTargets: [targets[1], targets[2], targets[0], targets[3]],
  });

  assert.deepEqual(getMarketDataRefreshBatchTargets(targets, 2, 10), {
    batchTargets: [targets[0], targets[3]],
    hasMore: false,
    lastProcessedInstrumentId: 4,
    sortedTargets: [targets[1], targets[2], targets[0], targets[3]],
  });
});

test("market refresh batch helper preserves empty batch result shape", () => {
  assert.deepEqual(
    buildEmptyMarketDataRefreshBatchResult({
      context: createContext([createTarget(1), createTarget(2)]),
      hasMore: false,
      lastProcessedInstrumentId: 5,
      now: new Date("2026-05-29T10:00:00.000Z"),
      sortedTargetCount: 2,
    }),
    {
      benchmarkSymbol: "SPY",
      currentSymbol: null,
      hasMore: false,
      historicalBarCount: 0,
      intradayBarCount: 0,
      issues: [],
      lastProcessedInstrumentId: 5,
      latestSuccessfulAsOf: null,
      marketRefreshMinutes: 30,
      processedTargetCount: 0,
      quoteRefreshCount: 0,
      refreshedAt: "2026-05-29T10:00:00.000Z",
      requestedSymbols: [],
      targetCount: 2,
    },
  );
});
