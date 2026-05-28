import assert from "node:assert/strict";
import test from "node:test";
import {
  advancePriceState,
  buildPriceStates,
  getTimelineAnchors,
  toDailyPricePoints,
  toIntradayPricePoints,
} from "@/lib/portfolio/timeline-price-points";

test("timeline price point helpers normalize daily and intraday anchors", () => {
  const dailyPoints = toDailyPricePoints([
    {
      instrumentId: 1,
      priceDate: "2026-05-27",
      close: 10,
      currency: "USD",
    },
  ]);
  const intradayPoints = toIntradayPricePoints([
    {
      instrumentId: 1,
      observedAt: "2026-05-28T10:00:00.000Z",
      close: 11,
      currency: "USD",
      interval: "1h",
    },
  ]);

  assert.deepEqual(dailyPoints, [
    {
      instrumentId: 1,
      priceAt: "2026-05-27T00:00:00.000Z",
      close: 10,
      currency: "USD",
      interval: "1d",
    },
  ]);
  assert.deepEqual(getTimelineAnchors([...intradayPoints, ...dailyPoints, dailyPoints[0]]), [
    { priceAt: "2026-05-27T00:00:00.000Z", interval: "1d" },
    { priceAt: "2026-05-28T10:00:00.000Z", interval: "1h" },
  ]);
});

test("timeline price states advance in chronological order and carry latest close", () => {
  const states = buildPriceStates([
    { instrumentId: 1, priceAt: "2026-05-28T00:00:00.000Z", close: 12 },
    { instrumentId: 1, priceAt: "2026-05-27T00:00:00.000Z", close: 10 },
    { instrumentId: 2, priceAt: "2026-05-27T00:00:00.000Z", close: 20 },
  ]);
  const state = states.get(1);

  assert.equal(advancePriceState(state, "2026-05-26T00:00:00.000Z"), null);
  assert.equal(advancePriceState(state, "2026-05-27T12:00:00.000Z"), 10);
  assert.equal(advancePriceState(state, "2026-05-29T00:00:00.000Z"), 12);
  assert.equal(states.get(1)?.latestPriceAt, "2026-05-28T00:00:00.000Z");
  assert.equal(advancePriceState(states.get(2), "2026-05-28T00:00:00.000Z"), 20);
});
