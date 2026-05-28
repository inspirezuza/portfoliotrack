import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentLocalIsoDate,
  getExpectedHistoryTailDate,
  getPriceAgeMinutes,
  isMarketDataStale,
} from "@/lib/market/freshness";

test("market freshness helpers preserve age and stale-window behavior", () => {
  const now = new Date("2026-05-16T10:30:00.000Z");

  assert.equal(getPriceAgeMinutes(null, now), null);
  assert.equal(getPriceAgeMinutes("not-a-date", now), null);
  assert.equal(getPriceAgeMinutes("2026-05-16T10:05:00.000Z", now), 25);
  assert.equal(isMarketDataStale(null, 30, now), false);
  assert.equal(isMarketDataStale("2026-05-16T10:05:00.000Z", 30, now), false);
  assert.equal(isMarketDataStale("2026-05-16T09:59:00.000Z", 30, now), true);
});

test("market freshness helpers preserve local-date and trading-tail behavior", () => {
  assert.equal(getCurrentLocalIsoDate(new Date(2026, 4, 6, 23, 15)), "2026-05-06");
  assert.equal(getExpectedHistoryTailDate("2026-05-18T12:00:00.000Z"), "2026-05-15");
  assert.equal(getExpectedHistoryTailDate("2026-05-17T12:00:00.000Z"), "2026-05-15");
  assert.equal(getExpectedHistoryTailDate("2026-05-16T12:00:00.000Z"), "2026-05-15");
  assert.equal(getExpectedHistoryTailDate("2026-05-15T12:00:00.000Z"), "2026-05-14");
  assert.equal(getExpectedHistoryTailDate("not-a-date"), null);
});
