import assert from "node:assert/strict";
import test from "node:test";
import {
  applyKnownDrMetadata,
  getDrInstrumentType,
  getKnownDrMetadata,
} from "@/lib/instruments/dr-metadata";

test("known DR metadata matches display symbols and provider symbols", () => {
  assert.equal(getKnownDrMetadata({ symbol: "AAPL80" })?.underlyingProviderSymbol, "AAPL");
  assert.equal(
    getKnownDrMetadata({ symbol: "placeholder", providerSymbol: "ASTS03.BK" })
      ?.underlyingProviderSymbol,
    "ASTS",
  );
});

test("new and unlisted Thai DR symbols are classified as DR", () => {
  assert.equal(getKnownDrMetadata({ symbol: "crsp03" })?.drRatio, 500);
  assert.equal(
    getDrInstrumentType({
      market: "TH",
      symbol: "CRSP03",
      instrumentType: "EQUITY",
      providerSymbol: "CRSP03.BK",
    }),
    "DR",
  );
  assert.equal(
    getDrInstrumentType({
      market: "SET",
      symbol: "MSFT19",
      instrumentType: "EQUITY",
      providerSymbol: "MSFT19",
    }),
    "DR",
  );
  assert.equal(
    getDrInstrumentType({
      market: "US",
      symbol: "MSFT19",
      instrumentType: "EQUITY",
      providerSymbol: "MSFT19",
    }),
    null,
  );
});

test("known DR metadata fills missing fields without overwriting explicit values", () => {
  const enriched = applyKnownDrMetadata({
    symbol: "AAPL80",
    providerSymbol: "AAPL80.BK",
    instrumentType: "EQUITY",
    underlyingSymbol: "CUSTOM",
    underlyingDisplayName: null,
    underlyingCurrency: null,
    underlyingProviderSymbol: null,
    drRatio: null,
    fxProviderSymbol: null,
  });

  assert.equal(enriched.instrumentType, "DR");
  assert.equal(enriched.underlyingSymbol, "CUSTOM");
  assert.equal(enriched.underlyingDisplayName, "Apple Inc.");
  assert.equal(enriched.underlyingCurrency, "USD");
  assert.equal(enriched.underlyingProviderSymbol, "AAPL");
  assert.equal(enriched.drRatio, 1000);
  assert.equal(enriched.fxProviderSymbol, "USDTHB=X");
});
