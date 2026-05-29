import assert from "node:assert/strict";
import test from "node:test";
import { getRechartsPayloadPoint } from "@/lib/charts/recharts-state";

test("getRechartsPayloadPoint returns the first active payload", () => {
  const point = { date: "2026-05-27", value: 42 };

  assert.equal(
    getRechartsPayloadPoint({
      activePayload: [{ payload: point }, { payload: { date: "later", value: 99 } }],
    }),
    point,
  );
});

test("getRechartsPayloadPoint returns null when no payload is available", () => {
  assert.equal(getRechartsPayloadPoint(undefined), null);
  assert.equal(getRechartsPayloadPoint({}), null);
  assert.equal(getRechartsPayloadPoint({ activePayload: [] }), null);
  assert.equal(getRechartsPayloadPoint({ activePayload: [{ payload: undefined }] }), null);
});

test("getRechartsPayloadPoint resolves the recharts v3 active index against chart data", () => {
  const chartData = [
    { date: "2026-05-25", timestamp: 10 },
    { date: "2026-05-26", timestamp: 20 },
    { date: "2026-05-27", timestamp: 30 },
  ];

  assert.equal(getRechartsPayloadPoint({ activeIndex: 1 }, chartData), chartData[1]);
  assert.equal(getRechartsPayloadPoint({ activeTooltipIndex: 2 }, chartData), chartData[2]);
});

test("getRechartsPayloadPoint resolves the recharts v3 active label by timestamp", () => {
  const chartData = [
    { date: "2026-05-25", timestamp: 10 },
    { date: "2026-05-26", timestamp: 20 },
  ];

  assert.equal(getRechartsPayloadPoint({ activeLabel: 20 }, chartData), chartData[1]);
  assert.equal(getRechartsPayloadPoint({ activeLabel: "10" }, chartData), chartData[0]);
  assert.equal(getRechartsPayloadPoint({ activeLabel: 999 }, chartData), null);
});

test("getRechartsPayloadPoint returns null for v3 state without chart data", () => {
  assert.equal(getRechartsPayloadPoint({ activeIndex: 0 }), null);
});
