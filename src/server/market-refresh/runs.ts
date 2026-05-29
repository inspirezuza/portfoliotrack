import "server-only";

import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/runtime";
import { marketRefreshRuns, type MarketRefreshRun } from "@/lib/db/schema";
import { type MarketDataRefreshResult } from "@/lib/market/provider";
import {
  getBangkokDate,
  getBangkokRefreshDateKey,
  getDbTimestamp,
  getErrorMessage,
} from "@/server/market-refresh/status";

export const DAILY_AUTO_MODE = "daily-auto";
export const MANUAL_MODE = "manual";
export const MAX_DAILY_AUTO_ATTEMPTS = 2;
export const STALE_RUNNING_MINUTES = 15;

export type DailyAutoClaim =
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

function getStaleRunningCutoff() {
  return getDbTimestamp(new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000));
}

export async function markRunSuccess(runId: number, result: MarketDataRefreshResult) {
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

export async function markRunFailed(runId: number, error: unknown) {
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

export async function createManualRun(portfolioId: number) {
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

export async function getActiveManualRun(portfolioId: number) {
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

export async function claimDailyAutoRun(
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
