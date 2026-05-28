import assert from "node:assert/strict";
import test from "node:test";
import type { MarketRefreshRun } from "@/lib/db/schema";
import type { MarketDataRefreshBatchResult } from "@/lib/market/provider-core";
import {
  getBangkokDate,
  getBangkokRefreshDateKey,
  getDbTimestamp,
  getErrorMessage,
  getLatestSuccessfulAsOf,
  mapRunStatus,
  parseRunId,
} from "@/server/market-refresh/status";

function createRun(overrides: Partial<MarketRefreshRun> = {}): MarketRefreshRun {
  return {
    attemptCount: 1,
    completedAt: null,
    createdAt: "2026-05-29 10:00:00",
    currentSymbol: "SPY",
    errorMessage: null,
    historicalBarCount: 3,
    id: 12,
    intradayBarCount: 4,
    issueCount: 1,
    lastProcessedInstrumentId: 42,
    latestSuccessfulAsOf: "2026-05-28T15:00:00.000Z",
    mode: "manual",
    portfolioId: 5,
    processedTargetCount: 2,
    quoteRefreshCount: 6,
    refreshDate: "2026-05-29",
    startedAt: "2026-05-29 10:00:00",
    status: "running",
    targetCount: 8,
    updatedAt: "2026-05-29 10:05:00",
    workerHeartbeatAt: "2026-05-29 10:05:00",
    ...overrides,
  };
}

test("market refresh status helpers preserve Bangkok date keys and db timestamps", () => {
  const instant = new Date("2026-05-28T17:30:05.000Z");

  assert.equal(getBangkokDate(instant), "2026-05-29");
  assert.equal(getBangkokRefreshDateKey("slot-a", instant), "2026-05-29:slot-a");
  assert.equal(getBangkokRefreshDateKey(undefined, instant), "2026-05-29");
  assert.equal(getDbTimestamp(instant), "2026-05-28 17:30:05");
});

test("market refresh status helpers preserve public run status shape", () => {
  assert.deepEqual(mapRunStatus(createRun()), {
    completedAt: null,
    currentSymbol: "SPY",
    errorMessage: null,
    historicalBarCount: 3,
    id: 12,
    intradayBarCount: 4,
    issueCount: 1,
    latestSuccessfulAsOf: "2026-05-28T15:00:00.000Z",
    mode: "manual",
    portfolioId: 5,
    processedTargetCount: 2,
    quoteRefreshCount: 6,
    startedAt: "2026-05-29 10:00:00",
    status: "running",
    targetCount: 8,
    updatedAt: "2026-05-29 10:05:00",
  });
});

test("market refresh status helpers validate ids, truncate errors, and merge latest success", () => {
  assert.equal(parseRunId(123), 123);
  assert.throws(() => parseRunId(0), /positive integer/);
  assert.equal(getErrorMessage("boom"), "Market data refresh failed.");
  assert.equal(getErrorMessage(new Error("x".repeat(1002))).length, 1000);

  const result = {
    latestSuccessfulAsOf: "2026-05-29T10:00:00.000Z",
  } as MarketDataRefreshBatchResult;

  assert.equal(getLatestSuccessfulAsOf(createRun(), result), "2026-05-29T10:00:00.000Z");
  assert.equal(
    getLatestSuccessfulAsOf(createRun({ latestSuccessfulAsOf: "2026-05-30T10:00:00.000Z" }), {
      ...result,
      latestSuccessfulAsOf: "2026-05-29T10:00:00.000Z",
    }),
    "2026-05-30T10:00:00.000Z",
  );
});
