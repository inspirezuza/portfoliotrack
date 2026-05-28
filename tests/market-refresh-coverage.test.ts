import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoryCoverageByInstrumentRows } from "@/lib/market/refresh-coverage";

test("market refresh coverage helper preserves matching currency date bounds", () => {
  const coverage = buildHistoryCoverageByInstrumentRows({
    rows: [
      { currency: "USD", instrumentId: 1, priceDate: "2026-02-01" },
      { currency: "USD", instrumentId: 1, priceDate: "2026-01-01" },
      { currency: "THB", instrumentId: 1, priceDate: "2026-03-01" },
      { currency: "THB", instrumentId: 2, priceDate: "2026-04-01" },
    ],
    targets: [
      { currency: "USD", instrumentId: 1 },
      { currency: "THB", instrumentId: 2 },
    ],
  });

  assert.deepEqual(coverage.get(1), {
    earliestPriceDate: "2026-01-01",
    latestPriceDate: "2026-02-01",
  });
  assert.deepEqual(coverage.get(2), {
    earliestPriceDate: "2026-04-01",
    latestPriceDate: "2026-04-01",
  });
});
