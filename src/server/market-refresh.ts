import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { marketRefreshRuns } from "@/lib/db/schema";
import { logServerError } from "@/lib/observability/server-log";
import { refreshMarketDataCache, refreshMarketDataCacheBatch } from "@/lib/market/provider";
import {
  getDbTimestamp,
  getLatestSuccessfulAsOf,
  mapRunStatus,
  parseRunId,
} from "@/server/market-refresh/status";
import {
  claimDailyAutoRun,
  createManualRun,
  getActiveManualRun,
  markRunFailed,
  markRunSuccess,
} from "@/server/market-refresh/runs";
import { parsePortfolioId } from "@/server/portfolios";

const DEFAULT_REFRESH_BATCH_SIZE = 3;

export type DailyAutoRefreshResponse = {
  status: "started" | "skipped" | "success" | "failed";
  refreshDate: string;
  refreshSlot?: string;
  reason?: string;
};

export type MarketRefreshRunStatus = {
  id: number;
  portfolioId: number;
  mode: string;
  status: string;
  targetCount: number;
  processedTargetCount: number;
  currentSymbol: string | null;
  quoteRefreshCount: number;
  historicalBarCount: number;
  intradayBarCount: number;
  issueCount: number;
  latestSuccessfulAsOf: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type MarketRefreshStartResponse = {
  status: "started" | "already-running";
  run: MarketRefreshRunStatus;
};

export type MarketRefreshBatchResponse = {
  hasMore: boolean;
  run: MarketRefreshRunStatus;
};

export async function runManualMarketRefresh({
  portfolioId: portfolioIdInput,
}: {
  portfolioId: number;
}) {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const run = await createManualRun(portfolioId);

  try {
    const result = await refreshMarketDataCache({ portfolioId });
    await markRunSuccess(run.id, result);
    return result;
  } catch (error) {
    logServerError("market_refresh.manual.failed", "Manual market refresh failed.", error, {
      portfolioId,
      runId: run.id,
    });
    await markRunFailed(run.id, error);
    throw error;
  }
}

export async function runDailyAutoMarketRefresh({
  portfolioId: portfolioIdInput,
  refreshSlot,
}: {
  portfolioId: number;
  refreshSlot?: string;
}): Promise<DailyAutoRefreshResponse> {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const claim = await claimDailyAutoRun(portfolioId, refreshSlot);

  if (!claim.claimed) {
    return {
      status: "skipped",
      refreshDate: claim.refreshDate,
      refreshSlot,
      reason: claim.reason,
    };
  }

  try {
    const result = await refreshMarketDataCache({ portfolioId });
    await markRunSuccess(claim.run.id, result);

    return {
      status: "success",
      refreshDate: claim.refreshDate,
      refreshSlot,
    };
  } catch (error) {
    logServerError("market_refresh.daily_auto.failed", "Daily auto market refresh failed.", error, {
      portfolioId,
      refreshDate: claim.refreshDate,
      refreshSlot,
      runId: claim.run.id,
    });
    await markRunFailed(claim.run.id, error);

    return {
      status: "failed",
      refreshDate: claim.refreshDate,
      refreshSlot,
      reason: "refresh-failed",
    };
  }
}

export async function startManualMarketRefresh({
  portfolioId: portfolioIdInput,
}: {
  portfolioId: number;
}): Promise<MarketRefreshStartResponse> {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const activeRun = await getActiveManualRun(portfolioId);

  if (activeRun != null) {
    return {
      status: "already-running",
      run: mapRunStatus(activeRun),
    };
  }

  const run = await createManualRun(portfolioId);

  return {
    status: "started",
    run: mapRunStatus(run),
  };
}

export async function getMarketRefreshRunStatus({ runId: runIdInput }: { runId: number }) {
  const runId = parseRunId(runIdInput);
  const [run] = await db.select().from(marketRefreshRuns).where(eq(marketRefreshRuns.id, runId));

  return run == null ? null : mapRunStatus(run);
}

export async function processMarketRefreshRunBatch({
  runId: runIdInput,
  batchSize = DEFAULT_REFRESH_BATCH_SIZE,
}: {
  runId: number;
  batchSize?: number;
}): Promise<MarketRefreshBatchResponse | null> {
  const runId = parseRunId(runIdInput);
  const [run] = await db.select().from(marketRefreshRuns).where(eq(marketRefreshRuns.id, runId));

  if (run == null) {
    return null;
  }

  if (run.status !== "running") {
    return {
      hasMore: false,
      run: mapRunStatus(run),
    };
  }

  const heartbeatAt = getDbTimestamp();

  await db
    .update(marketRefreshRuns)
    .set({
      workerHeartbeatAt: heartbeatAt,
      updatedAt: heartbeatAt,
    })
    .where(eq(marketRefreshRuns.id, run.id));

  try {
    const result = await refreshMarketDataCacheBatch({
      portfolioId: run.portfolioId,
      afterInstrumentId: run.lastProcessedInstrumentId,
      maxTargets: batchSize,
    });
    const now = getDbTimestamp();
    const completed = !result.hasMore;
    const processedTargetCount = Math.min(
      result.targetCount,
      run.processedTargetCount + result.processedTargetCount,
    );
    const [updatedRun] = await db
      .update(marketRefreshRuns)
      .set({
        status: completed ? "success" : "running",
        targetCount: result.targetCount,
        processedTargetCount,
        currentSymbol: completed ? null : result.currentSymbol,
        quoteRefreshCount: run.quoteRefreshCount + result.quoteRefreshCount,
        historicalBarCount: run.historicalBarCount + result.historicalBarCount,
        intradayBarCount: run.intradayBarCount + result.intradayBarCount,
        issueCount: run.issueCount + result.issues.length,
        latestSuccessfulAsOf: getLatestSuccessfulAsOf(run, result),
        errorMessage: null,
        workerHeartbeatAt: now,
        lastProcessedInstrumentId: result.lastProcessedInstrumentId,
        completedAt: completed ? now : null,
        updatedAt: now,
      })
      .where(eq(marketRefreshRuns.id, run.id))
      .returning();

    return {
      hasMore: result.hasMore,
      run: mapRunStatus(updatedRun),
    };
  } catch (error) {
    logServerError(
      "market_refresh.worker.batch_failed",
      "Market refresh worker batch failed.",
      error,
      {
        portfolioId: run.portfolioId,
        runId: run.id,
      },
    );
    await markRunFailed(run.id, error);

    const failedStatus = await getMarketRefreshRunStatus({ runId: run.id });

    if (failedStatus == null) {
      return null;
    }

    return {
      hasMore: false,
      run: failedStatus,
    };
  }
}

export async function startDailyAutoMarketRefresh({
  portfolioId: portfolioIdInput,
  refreshSlot,
}: {
  portfolioId: number;
  refreshSlot?: string;
}): Promise<DailyAutoRefreshResponse & { runId?: number }> {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const claim = await claimDailyAutoRun(portfolioId, refreshSlot);

  if (!claim.claimed) {
    return {
      status: "skipped",
      refreshDate: claim.refreshDate,
      refreshSlot,
      reason: claim.reason,
    };
  }

  return {
    status: "started",
    refreshDate: claim.refreshDate,
    refreshSlot,
    runId: claim.run.id,
  };
}
