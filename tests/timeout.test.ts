import assert from "node:assert/strict";
import test from "node:test";
import { OperationTimeoutError, withOperationTimeout } from "../src/lib/async/timeout";

test("withOperationTimeout resolves successful operations", async () => {
  const value = await withOperationTimeout(Promise.resolve("ok"), {
    label: "quick operation",
    timeoutMs: 100
  });

  assert.equal(value, "ok");
});

test("withOperationTimeout rejects slow operations with a labeled timeout", async () => {
  await assert.rejects(
    () =>
      withOperationTimeout(new Promise((resolve) => setTimeout(resolve, 50)), {
        label: "slow operation",
        timeoutMs: 1
      }),
    (error) =>
      error instanceof OperationTimeoutError &&
      /slow operation timed out after 1ms/.test(error.message)
  );
});
