import assert from "node:assert/strict";
import test from "node:test";
import { calculateOverlayReturnAtDate } from "../src/components/benchmark-chart/chart-data";
import {
  calculateAnnualizedReturnPercent,
  calculateXirr,
} from "../src/lib/portfolio/money-weighted";
import { buildPortfolioBenchmarkTimeline } from "../src/lib/portfolio/timeline";

test("money-weighted helpers calculate XIRR and annualized benchmark returns", () => {
  const xirr = calculateXirr([
    { date: "2025-01-01T00:00:00.000Z", amount: -100 },
    { date: "2026-01-01T00:00:00.000Z", amount: 110 },
  ]);

  assert.ok(xirr != null);
  assert.ok(Math.abs(xirr - 0.1) < 0.0001);
  assert.equal(calculateXirr([{ date: "2025-01-01T00:00:00.000Z", amount: 100 }]), null);
  assert.ok(
    Math.abs(
      (calculateAnnualizedReturnPercent({
        endDate: "2026-01-01T00:00:00.000Z",
        endValue: 121,
        startDate: "2025-01-01T00:00:00.000Z",
        startValue: 100,
      }) ?? 0) - 21,
    ) < 0.0001,
  );
});

test("money-weighted comparison skips short annualized windows", () => {
  const timeline = buildPortfolioBenchmarkTimeline({
    instruments: [
      { instrumentId: 1, symbol: "AAA", currency: "USD" },
      { instrumentId: 2, symbol: "SPYM", currency: "USD" },
    ],
    transactions: [
      {
        instrumentId: 1,
        tradeDate: "2025-01-01",
        side: "BUY",
        quantity: 10,
        price: 10,
        fee: 0,
        createdAt: "2025-01-01 09:00:00",
        id: 1,
      },
    ],
    historicalPrices: [
      { instrumentId: 1, priceDate: "2025-01-01", close: 10, currency: "USD" },
      { instrumentId: 1, priceDate: "2025-01-10", close: 11, currency: "USD" },
      { instrumentId: 1, priceDate: "2025-02-01", close: 12, currency: "USD" },
      { instrumentId: 2, priceDate: "2025-01-01", close: 100, currency: "USD" },
      { instrumentId: 2, priceDate: "2025-01-10", close: 105, currency: "USD" },
      { instrumentId: 2, priceDate: "2025-02-01", close: 110, currency: "USD" },
    ],
    benchmarkInstrumentId: 2,
    benchmarkCurrency: "USD",
    benchmarkSymbol: "SPYM",
  });

  assert.deepEqual(
    timeline.moneyWeightedComparison.map((point) => point.date),
    ["2025-02-01T00:00:00.000Z"],
  );
});

test("overlay MWR uses annualized return and waits for a stable window", () => {
  const points = [
    { date: "2025-01-01T00:00:00.000Z", value: 100 },
    { date: "2025-01-10T00:00:00.000Z", value: 105 },
    { date: "2026-01-01T00:00:00.000Z", value: 110 },
  ];

  assert.equal(
    calculateOverlayReturnAtDate({
      points,
      returnBasis: "MWR",
      startDate: points[0].date,
      targetDate: points[1].date,
    }),
    null,
  );

  assert.ok(
    Math.abs(
      (calculateOverlayReturnAtDate({
        points,
        returnBasis: "MWR",
        startDate: points[0].date,
        targetDate: points[2].date,
      }) ?? 0) - 10,
    ) < 0.0001,
  );
});

test("overlay absolute return remains a simple cumulative return", () => {
  assert.equal(
    calculateOverlayReturnAtDate({
      points: [
        { date: "2025-01-01T00:00:00.000Z", value: 100 },
        { date: "2025-02-01T00:00:00.000Z", value: 125 },
      ],
      returnBasis: "ABSOLUTE",
      startDate: "2025-01-01T00:00:00.000Z",
      targetDate: "2025-02-01T00:00:00.000Z",
    }),
    25,
  );
});
