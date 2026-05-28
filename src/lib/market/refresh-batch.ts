import type { MarketDataRefreshBatchResult } from "@/lib/market/provider-core";
import type { RefreshContext, RefreshTarget } from "@/lib/market/refresh-context";

export type MarketDataRefreshBatchTargets = {
  batchTargets: RefreshTarget[];
  hasMore: boolean;
  lastProcessedInstrumentId: number | null;
  sortedTargets: RefreshTarget[];
};

export function getMarketDataRefreshBatchTargets(
  targets: RefreshTarget[],
  afterInstrumentId: number | null,
  maxTargets: number,
): MarketDataRefreshBatchTargets {
  const sortedTargets = [...targets].sort(
    (left, right) => left.instrument.id - right.instrument.id,
  );
  const remainingTargets = sortedTargets.filter((target) =>
    afterInstrumentId == null ? true : target.instrument.id > afterInstrumentId,
  );
  const batchTargets = remainingTargets.slice(0, Math.max(1, maxTargets));
  const lastProcessedInstrumentId =
    batchTargets[batchTargets.length - 1]?.instrument.id ?? afterInstrumentId ?? null;
  const hasMore =
    lastProcessedInstrumentId == null
      ? false
      : sortedTargets.some((target) => target.instrument.id > lastProcessedInstrumentId);

  return {
    batchTargets,
    hasMore,
    lastProcessedInstrumentId,
    sortedTargets,
  };
}

export function buildEmptyMarketDataRefreshBatchResult({
  context,
  hasMore,
  lastProcessedInstrumentId,
  now = new Date(),
  sortedTargetCount,
}: {
  context: RefreshContext;
  hasMore: boolean;
  lastProcessedInstrumentId: number | null;
  now?: Date;
  sortedTargetCount: number;
}): MarketDataRefreshBatchResult {
  return {
    refreshedAt: now.toISOString(),
    benchmarkSymbol: context.benchmarkSymbol,
    marketRefreshMinutes: context.marketRefreshMinutes,
    requestedSymbols: [],
    quoteRefreshCount: 0,
    historicalBarCount: 0,
    intradayBarCount: 0,
    latestSuccessfulAsOf: null,
    issues: [],
    currentSymbol: null,
    hasMore,
    lastProcessedInstrumentId,
    processedTargetCount: 0,
    targetCount: sortedTargetCount,
  };
}
