import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketSettingsFromRows } from "@/lib/market/settings";

test("market settings normalize benchmark, currency, and refresh defaults", () => {
  assert.deepEqual(buildMarketSettingsFromRows([]), {
    benchmarkSymbol: "SPYM",
    baseCurrency: "THB",
    marketRefreshMinutes: 30,
  });

  assert.deepEqual(
    buildMarketSettingsFromRows([
      { key: "benchmarkSymbol", value: " spy " },
      { key: "baseCurrency", value: " usd " },
      { key: "marketRefreshMinutes", value: "45" },
    ]),
    {
      benchmarkSymbol: "SPYM",
      baseCurrency: "USD",
      marketRefreshMinutes: 45,
    },
  );

  assert.equal(
    buildMarketSettingsFromRows([{ key: "marketRefreshMinutes", value: "0" }]).marketRefreshMinutes,
    30,
  );
});
