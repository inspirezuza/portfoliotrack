import assert from "node:assert/strict";
import test from "node:test";
import {
  contextCoversRequest,
  type RefreshContext,
  type RefreshTarget,
} from "@/lib/market/refresh-context";

function target({
  id,
  providerSymbol,
  historyStartDate,
}: {
  id: number;
  providerSymbol: string;
  historyStartDate: string | null;
}): RefreshTarget {
  return {
    instrument: {
      id,
      providerSymbol,
    } as RefreshTarget["instrument"],
    historyStartDate,
  };
}

function context(targets: RefreshTarget[]): RefreshContext {
  return {
    benchmarkSymbol: null,
    marketRefreshMinutes: 30,
    targets,
  };
}

test("refresh context coverage accepts narrower history requests for the same provider symbol", () => {
  const existingContext = context([
    target({
      id: 1,
      providerSymbol: "AAPL",
      historyStartDate: "2024-01-01",
    }),
  ]);
  const requestedContext = context([
    target({
      id: 1,
      providerSymbol: "AAPL",
      historyStartDate: "2024-06-01",
    }),
  ]);

  assert.equal(contextCoversRequest(existingContext, requestedContext), true);
});

test("refresh context coverage rejects provider symbol changes and broader history requests", () => {
  const existingContext = context([
    target({
      id: 1,
      providerSymbol: "AAPL",
      historyStartDate: "2024-06-01",
    }),
  ]);

  assert.equal(
    contextCoversRequest(
      existingContext,
      context([
        target({
          id: 1,
          providerSymbol: "AAPL.BK",
          historyStartDate: "2024-06-01",
        }),
      ]),
    ),
    false,
  );
  assert.equal(
    contextCoversRequest(
      existingContext,
      context([
        target({
          id: 1,
          providerSymbol: "AAPL",
          historyStartDate: "2024-01-01",
        }),
      ]),
    ),
    false,
  );
});
