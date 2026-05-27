import assert from "node:assert/strict";
import test from "node:test";
import { buildServerLogEvent } from "../src/lib/observability/server-log";

test("buildServerLogEvent serializes Error details and context", () => {
  const error = new TypeError("Provider request failed");
  const event = buildServerLogEvent(
    {
      context: {
        portfolioId: 7,
        refreshSlot: "2100",
        skipped: undefined,
      },
      error,
      event: "market_refresh.daily_auto.failed",
      level: "error",
      message: "Daily auto market refresh failed.",
    },
    new Date("2026-05-28T12:00:00.000Z"),
  );

  assert.deepEqual(event, {
    context: {
      portfolioId: 7,
      refreshSlot: "2100",
    },
    error: {
      message: "Provider request failed",
      name: "TypeError",
      stack: error.stack,
    },
    event: "market_refresh.daily_auto.failed",
    level: "error",
    message: "Daily auto market refresh failed.",
    timestamp: "2026-05-28T12:00:00.000Z",
  });
});

test("buildServerLogEvent preserves non-Error thrown values", () => {
  const event = buildServerLogEvent(
    {
      error: "boom",
      event: "market_refresh.worker.failed",
      level: "error",
      message: "Worker failed.",
    },
    new Date("2026-05-28T12:00:00.000Z"),
  );

  assert.deepEqual(event.error, {
    message: "boom",
    name: "NonError",
  });
});
