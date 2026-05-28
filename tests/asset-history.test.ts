import assert from "node:assert/strict";
import test from "node:test";
import {
  combineAssetPriceHistory,
  getAssetHistoryStartDate,
  getAssetHistoryStatus,
  getAssetIntradayStartAt,
  getCurrentLocalIsoDate,
  getProviderHistoryUrl,
} from "@/server/assets/history";

test("asset history helpers preserve dates and provider history URLs", () => {
  assert.equal(getCurrentLocalIsoDate(new Date(2026, 4, 28, 23, 59, 59)), "2026-05-28");
  assert.equal(getAssetHistoryStartDate("2026-02-03"), "2026-02-03");
  assert.equal(getAssetHistoryStartDate(null, new Date("2026-05-28T00:00:00.000Z")), "2025-05-28");
  assert.equal(
    getAssetIntradayStartAt(new Date("2026-05-28T06:30:00.000Z"), 7),
    "2026-05-21T06:30:00.000Z",
  );
  assert.equal(getProviderHistoryUrl("BRK B"), "https://finance.yahoo.com/quote/BRK%20B/history");
});

test("asset history helpers merge history and intraday points in display order", () => {
  const points = combineAssetPriceHistory({
    historyRows: [
      { priceDate: "2026-05-27", close: 100 },
      { priceDate: "2026-05-28", close: 101 },
    ] as never,
    intradayRows: [
      { observedAt: "2026-05-28T03:00:00.000Z", close: 102, interval: "1h" },
      { observedAt: "2026-05-28T01:00:00.000Z", close: 101.5, interval: "5m" },
    ] as never,
  });

  assert.deepEqual(points, [
    { date: "2026-05-27", close: 100, interval: "1d" },
    { date: "2026-05-28", close: 101, interval: "1d" },
    { date: "2026-05-28T01:00:00.000Z", close: 101.5, interval: "5m" },
    { date: "2026-05-28T03:00:00.000Z", close: 102, interval: "1h" },
  ]);
});

test("asset history helpers classify unavailable, partial, and full history", () => {
  assert.equal(
    getAssetHistoryStatus({
      requestedHistoryStartDate: "2026-01-01",
      firstHistoryDate: null,
      historyCount: 0,
    }),
    "unavailable",
  );
  assert.equal(
    getAssetHistoryStatus({
      requestedHistoryStartDate: "2026-01-01",
      firstHistoryDate: "2026-02-01",
      historyCount: 1,
    }),
    "partial",
  );
  assert.equal(
    getAssetHistoryStatus({
      requestedHistoryStartDate: "2026-01-01",
      firstHistoryDate: "2026-01-01",
      historyCount: 1,
    }),
    "full",
  );
});
