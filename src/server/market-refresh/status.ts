import type { MarketRefreshRun } from "@/lib/db/schema";
import type { MarketDataRefreshBatchResult } from "@/lib/market/provider-core";
import type { MarketRefreshRunStatus } from "@/server/market-refresh";

export function getBangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(now);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}`;
}

export function getBangkokRefreshDateKey(refreshSlot: string | undefined, now = new Date()) {
  const refreshDate = getBangkokDate(now);

  return refreshSlot == null ? refreshDate : `${refreshDate}:${refreshSlot}`;
}

export function getDbTimestamp(now = new Date()) {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

export function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Market data refresh failed.";

  return message.slice(0, 1000);
}

export function mapRunStatus(run: MarketRefreshRun): MarketRefreshRunStatus {
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

export function parseRunId(runId: number) {
  if (!Number.isInteger(runId) || runId <= 0) {
    throw new Error("Market refresh run id must be a positive integer.");
  }

  return runId;
}

export function getLatestSuccessfulAsOf(
  run: MarketRefreshRun,
  result: Pick<MarketDataRefreshBatchResult, "latestSuccessfulAsOf">,
) {
  return (
    [run.latestSuccessfulAsOf, result.latestSuccessfulAsOf]
      .filter((value): value is string => value != null)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  );
}
