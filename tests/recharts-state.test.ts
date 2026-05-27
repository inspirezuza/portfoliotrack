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
