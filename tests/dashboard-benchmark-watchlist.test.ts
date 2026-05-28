import assert from "node:assert/strict";
import test from "node:test";
import { buildPortfolioMonthlyReturns } from "@/server/dashboard/benchmark-monthly-returns";

test("dashboard benchmark watchlist helper preserves portfolio monthly TWR returns", () => {
  const returns = buildPortfolioMonthlyReturns({
    performanceSeries: {
      twr: [
        { date: "2026-01-02", portfolioIndex: 100 },
        { date: "2026-01-31", portfolioIndex: 110 },
        { date: "2026-02-01", portfolioIndex: 110 },
        { date: "2026-02-28", portfolioIndex: 99 },
      ],
    },
  } as never);

  assert.equal(returns.get("2026-01"), 10);
  assert.equal(returns.get("2026-02"), -10);
});
