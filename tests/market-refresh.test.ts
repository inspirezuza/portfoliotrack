import assert from "node:assert/strict";
import test from "node:test";
import { getPriceAgeMinutes, isMarketDataStale } from "@/lib/market/provider-core";

test("market data age returns null for missing or invalid timestamps", () => {
  const now = new Date("2026-05-16T10:30:00.000Z");

  assert.equal(getPriceAgeMinutes(null, now), null);
  assert.equal(getPriceAgeMinutes("not-a-date", now), null);
});

test("market data staleness only trips after the refresh window", () => {
  const now = new Date("2026-05-16T10:30:00.000Z");

  assert.equal(isMarketDataStale(null, 30, now), false);
  assert.equal(isMarketDataStale("2026-05-16T10:05:00.000Z", 30, now), false);
  assert.equal(isMarketDataStale("2026-05-16T09:59:00.000Z", 30, now), true);
});
