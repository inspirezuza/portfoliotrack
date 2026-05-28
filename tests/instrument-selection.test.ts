import assert from "node:assert/strict";
import test from "node:test";
import {
  findExactInstrumentSearchMatch,
  getInstrumentSearchScore,
  normalizeInstrumentSearchValue,
} from "../src/lib/transactions/instrument-selection";

const instruments = [
  {
    id: 1,
    symbol: "SPY",
    displayName: "SPDR S&P 500 ETF Trust",
    market: "US",
    instrumentType: "ETF",
    currency: "USD",
    providerSymbol: "SPY",
    label: "SPY - SPDR S&P 500 ETF Trust - US - USD",
  },
  {
    id: 2,
    symbol: "AAPL80",
    displayName: "Apple DR",
    market: "TH",
    instrumentType: "DR",
    currency: "THB",
    providerSymbol: "AAPL80.BK",
    label: "AAPL80 - Apple DR - TH - THB",
  },
];

test("normalizes search text so symbols and provider symbols compare consistently", () => {
  assert.equal(normalizeInstrumentSearchValue(" AAPL80.BK "), "aapl80bk");
});

test("matches only exact instrument identifiers for selection", () => {
  assert.equal(findExactInstrumentSearchMatch(instruments, "AAPL80")?.id, 2);
  assert.equal(findExactInstrumentSearchMatch(instruments, "aapl80.bk")?.id, 2);
  assert.equal(findExactInstrumentSearchMatch(instruments, "AAP"), null);
  assert.equal(findExactInstrumentSearchMatch(instruments, "Apple DR"), null);
});

test("scores symbol matches above broad label matches", () => {
  const exactScore = getInstrumentSearchScore(instruments[1], "AAPL80");
  const labelScore = getInstrumentSearchScore(instruments[1], "Apple");

  assert.ok(exactScore > labelScore);
});
