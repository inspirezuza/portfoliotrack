import "server-only";

import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { marketRefreshRuns, type MarketRefreshRun } from "@/lib/db/schema";
import { logServerError } from "@/lib/observability/server-log";
import {
  refreshMarketDataCache,
  refreshMarketDataCacheBatch,
  type MarketDataRefreshBatchResult,
  type MarketDataRefreshResult,
} from "@/lib/market/provider";
import { parsePortfolioId } from "@/server/portfolios";

const DAILY_AUTO_MODE = "daily-auto";
const MANUAL_MODE = "manual";
const MAX_DAILY_AUTO_ATTEMPTS = 2;
const STALE_RUNNING_MINUTES = 15;
const DEFAULT_REFRESH_BATCH_SIZE = 3;

export type DailyAutoRefreshResponse = {
  status: "started" | "skipped" | "success" | "failed";
  refreshDate: string;
  refreshSlot?: string;
  reason?: string;
};

type DailyAutoClaim =
  | {
      claimed: true;
      run: MarketRefreshRun;
      refreshDate: string;
    }
  | {
      claimed: false;
      refreshDate: string;
      reason: string;
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

function getBangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(now);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}`;
}

function getBangkokRefreshDateKey(refreshSlot: string | undefined, now = new Date()) {
  const refreshDate = getBangkokDate(now);

  return refreshSlot == null ? refreshDate : `${refreshDate}:${refreshSlot}`;
}

function getDbTimestamp(now = new Date()) {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

function getStaleRunningCutoff() {
  return getDbTimestamp(new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000));
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Market data refresh failed.";

  return message.slice(0, 1000);
}

function mapRunStatus(run: MarketRefreshRun): MarketRefreshRunStatus {
  return {
    id: run.id,
    portfolioId: run.portfolioId,
    mode: run.mode,
    status: run.status,
    targetCount: run.targetCount,
    processedTargetCount: run.processedTargetCount,
    currentSymbol: run.currentSymbol,
    quoteRefreshCount: run.quoteRefreshCount,
    historicalBarCount: run.historicalBarCount,
    intradayBarCount: run.intradayBarCount,
    issueCount: run.issueCount,
    latestSuccessfulAsOf: run.latestSuccessfulAsOf,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    updatedAt: run.updatedAt,
  };
}

function parseRunId(runId: number) {
  if (!Number.isInteger(runId) || runId <= 0) {
    throw new Error("Market refresh run id must be a positive integer.");
  }

  return runId;
}

function getLatestSuccessfulAsOf(run: MarketRefreshRun, result: MarketDataRefreshBatchResult) {
  return (
    [run.latestSuccessfulAsOf, result.latestSuccessfulAsOf]
      .filter((value): value is string => value != null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  );
}

async function markRunSuccess(runId: number, result: MarketDataRefreshResult) {
  const now = getDbTimestamp();

  await db
    .update(marketRefreshRuns)
    .set({
      status: "success",
      quoteRefreshCount: result.quoteRefreshCount,
      historicalBarCount: result.historicalBarCount,
      intradayBarCount: result.intradayBarCount,
      issueCount: result.issues.length,
      latestSuccessfulAsOf: result.latestSuccessfulAsOf,
      errorMessage: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(marketRefreshRuns.id, runId));
}

async function markRunFailed(runId: number, error: unknown) {
  const now = getDbTimestamp();

  await db
    .update(marketRefreshRuns)
    .set({
      status: "failed",
      errorMessage: getErrorMessage(error),
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(marketRefreshRuns.id, runId));
}

async function createManualRun(portfolioId: number) {
  const now = getDbTimestamp();
  const [run] = await db
    .insert(marketRefreshRuns)
    .values({
      portfolioId,
      refreshDate: getBangkokDate(),
      mode: MANUAL_MODE,
      status: "running",
      attemptCount: 1,
      startedAt: now,
      updatedAt: now,
    })
    .returning();

  return run;
}

async function getActiveManualRun(portfolioId: number) {
  const [run] = await db
    .select()
    .from(marketRefreshRuns)
    .where(
      and(
        eq(marketRefreshRuns.portfolioId, portfolioId),
        eq(marketRefreshRuns.mode, MANUAL_MODE),
        eq(marketRefreshRuns.status, "running"),
        gt(marketRefreshRuns.updatedAt, getStaleRunningCutoff()),
      ),
    )
    .orderBy(desc(marketRefreshRuns.updatedAt), desc(marketRefreshRuns.id))
    .limit(1);

  return run ?? null;
}

async function claimDailyAutoRun(
  portfolioId: number,
  refreshSlot?: string,
): Promise<DailyAutoClaim> {
  const refreshDate = getBangkokRefreshDateKey(refreshSlot);
  const now = getDbTimestamp();
  const [insertedRun] = await db
    .insert(marketRefreshRuns)
    .values({
      portfolioId,
      refreshDate,
      mode: DAILY_AUTO_MODE,
      status: "running",
      attemptCount: 1,
      startedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (insertedRun) {
    return {
      claimed: true,
      run: insertedRun,
      refreshDate,
    };
  }

  const [existingRun] = await db
    .select()
    .from(marketRefreshRuns)
    .where(
      and(
        eq(marketRefreshRuns.portfolioId, portfolioId),
        eq(marketRefreshRuns.refreshDate, refreshDate),
        eq(marketRefreshRuns.mode, DAILY_AUTO_MODE),
      ),
    );

  if (!existingRun) {
    return {
      claimed: false,
      refreshDate,
      reason: "claim-not-found",
    };
  }

  if (existingRun.status === "success") {
    return {
      claimed: false,
      refreshDate,
      reason: "already-refreshed",
    };
  }

  if (existingRun.attemptCount >= MAX_DAILY_AUTO_ATTEMPTS) {
    return {
      claimed: false,
      refreshDate,
      reason: "daily-attempt-limit",
    };
  }

  const staleBefore = getStaleRunningCutoff();
  const [claimedRetry] = await db
    .update(marketRefreshRuns)
    .set({
      status: "running",
      attemptCount: sql`${marketRefreshRuns.attemptCount} + 1`,
      errorMessage: null,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(marketRefreshRuns.id, existingRun.id),
        lt(marketRefreshRuns.attemptCount, MAX_DAILY_AUTO_ATTEMPTS),
        or(
          eq(marketRefreshRuns.status, "failed"),
          and(
            eq(marketRefreshRuns.status, "running"),
            lt(marketRefreshRuns.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();

  if (!claimedRetry) {
    return {
      claimed: false,
      refreshDate,
      reason: "already-running",
    };
  }

  return {
    claimed: true,
    run: claimedRetry,
    refreshDate,
  };
}

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
