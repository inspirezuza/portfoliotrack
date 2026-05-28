import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalDemoMonthlyReturns,
  buildLocalDemoOverlayPoints,
  getLocalDemoQuote,
  shouldUseLocalDemoMarketData,
} from "../src/server/dashboard/local-demo-market";

test("local demo market helpers preserve fallback quotes, monthly returns, and overlay compounding", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocalMock = process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK;

  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK;

    assert.equal(shouldUseLocalDemoMarketData(2), true);
    assert.equal(shouldUseLocalDemoMarketData(3), false);

    process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK = "false";
    assert.equal(shouldUseLocalDemoMarketData(0), false);

    const quote = getLocalDemoQuote("SPYM");
    assert.deepEqual(quote, {
      asOf: "2026-05-26T20:00:00.000Z",
      dailyChange: 0.34,
      price: 86.96,
    });

    const monthlyReturns = buildLocalDemoMonthlyReturns({
      portfolioMonthlyReturns: new Map([["2026-05", 99]]),
      symbol: "SPYM",
    });
    const overlayPoints = buildLocalDemoOverlayPoints("SPYM");

    assert.deepEqual(monthlyReturns[0], {
      excessReturnPercent: 0.7999999999999998,
      month: "2025-06",
      portfolioReturnPercent: 3.4,
      returnPercent: 2.6,
      symbol: "SPYM",
    });
    assert.deepEqual(monthlyReturns[monthlyReturns.length - 1], {
      excessReturnPercent: 0.8000000000000003,
      month: "2026-05",
      portfolioReturnPercent: 3.7,
      returnPercent: 2.9,
      symbol: "SPYM",
    });
    assert.equal(overlayPoints.length, 12);
    assert.deepEqual(overlayPoints[0], {
      date: "2025-06-01",
      interval: "1d",
      value: 102.6,
    });
  } finally {
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    if (originalLocalMock == null) {
      delete process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK;
    } else {
      process.env.PORTFOLIOTRACK_ENABLE_LOCAL_MARKET_MOCK = originalLocalMock;
    }
  }
});
