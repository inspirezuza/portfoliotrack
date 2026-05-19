import "server-only";

import { and, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { marketRefreshRuns, type MarketRefreshRun } from "@/lib/db/schema";
import { refreshMarketDataCache, type MarketDataRefreshResult } from "@/lib/market/provider";
import { parsePortfolioId } from "@/server/portfolios";

const DAILY_AUTO_MODE = "daily-auto";
const MANUAL_MODE = "manual";
const MAX_DAILY_AUTO_ATTEMPTS = 2;
const STALE_RUNNING_MINUTES = 15;

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

function getBangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric"
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
      updatedAt: now
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
      updatedAt: now
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
      updatedAt: now
    })
    .returning();

  return run;
}

async function claimDailyAutoRun(portfolioId: number, refreshSlot?: string): Promise<DailyAutoClaim> {
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
      updatedAt: now
    })
    .onConflictDoNothing()
    .returning();

  if (insertedRun) {
    return {
      claimed: true,
      run: insertedRun,
      refreshDate
    };
  }

  const [existingRun] = await db
    .select()
    .from(marketRefreshRuns)
    .where(
      and(
        eq(marketRefreshRuns.portfolioId, portfolioId),
        eq(marketRefreshRuns.refreshDate, refreshDate),
        eq(marketRefreshRuns.mode, DAILY_AUTO_MODE)
      )
    );

  if (!existingRun) {
    return {
      claimed: false,
      refreshDate,
      reason: "claim-not-found"
    };
  }

  if (existingRun.status === "success") {
    return {
      claimed: false,
      refreshDate,
      reason: "already-refreshed"
    };
  }

  if (existingRun.attemptCount >= MAX_DAILY_AUTO_ATTEMPTS) {
    return {
      claimed: false,
      refreshDate,
      reason: "daily-attempt-limit"
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
      updatedAt: now
    })
    .where(
      and(
        eq(marketRefreshRuns.id, existingRun.id),
        lt(marketRefreshRuns.attemptCount, MAX_DAILY_AUTO_ATTEMPTS),
        or(
          eq(marketRefreshRuns.status, "failed"),
          and(eq(marketRefreshRuns.status, "running"), lt(marketRefreshRuns.updatedAt, staleBefore))
        )
      )
    )
    .returning();

  if (!claimedRetry) {
    return {
      claimed: false,
      refreshDate,
      reason: "already-running"
    };
  }

  return {
    claimed: true,
    run: claimedRetry,
    refreshDate
  };
}

export async function runManualMarketRefresh({ portfolioId: portfolioIdInput }: { portfolioId: number }) {
  const portfolioId = parsePortfolioId(portfolioIdInput);
  const run = await createManualRun(portfolioId);

  try {
    const result = await refreshMarketDataCache({ portfolioId });
    await markRunSuccess(run.id, result);
    return result;
  } catch (error) {
    await markRunFailed(run.id, error);
    throw error;
  }
}

export async function runDailyAutoMarketRefresh({
  portfolioId: portfolioIdInput,
  refreshSlot
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
      reason: claim.reason
    };
  }

  try {
    const result = await refreshMarketDataCache({ portfolioId });
    await markRunSuccess(claim.run.id, result);

    return {
      status: "success",
      refreshDate: claim.refreshDate,
      refreshSlot
    };
  } catch (error) {
    console.error("Daily auto market refresh failed", error);
    await markRunFailed(claim.run.id, error);

    return {
      status: "failed",
      refreshDate: claim.refreshDate,
      refreshSlot,
      reason: "refresh-failed"
    };
  }
}
