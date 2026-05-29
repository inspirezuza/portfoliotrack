import assert from "node:assert/strict";
import test from "node:test";
import { appendSearchParams, buildRefreshMessage } from "@/components/dashboard-page/refresh";
import { getUiCopy } from "@/lib/ui/copy";

const copy = getUiCopy("EN").dashboard;
const now = Date.parse("2026-05-29T10:05:00.000Z");

test("dashboard refresh helpers preserve recent success and warning banners", () => {
  assert.deepEqual(
    buildRefreshMessage(
      {
        eventAt: "2026-05-29T10:03:00.000Z",
        issueCount: "0",
        quoteCount: "3",
        refresh: "success",
        refreshedAt: "2026-05-29 17:00",
      },
      copy,
      now,
    ),
    {
      body: "3 quotes updated | Provider timestamp 2026-05-29 17:00",
      title: "Market data updated",
      tone: "success",
    },
  );

  assert.deepEqual(
    buildRefreshMessage(
      {
        eventAt: "2026-05-29T10:03:00.000Z",
        issueCount: "2",
        quoteCount: "3",
        refresh: "success",
      },
      copy,
      now,
    ),
    {
      body: "3 quotes updated | 2 symbols still need review",
      title: "Market data updated with warnings",
      tone: "warning",
    },
  );
});

test("dashboard refresh helpers ignore missing, stale, and invalid refresh events", () => {
  assert.equal(buildRefreshMessage({}, copy, now), null);
  assert.equal(
    buildRefreshMessage({ eventAt: "2026-05-29T09:59:00.000Z", refresh: "success" }, copy, now),
    null,
  );
  assert.equal(buildRefreshMessage({ eventAt: "bad-date", refresh: "success" }, copy, now), null);
});

test("dashboard refresh helpers preserve started and error banner copy", () => {
  assert.deepEqual(
    buildRefreshMessage(
      {
        eventAt: "2026-05-29T10:04:00.000Z",
        refresh: "already-running",
      },
      copy,
      now,
    ),
    {
      body: "Checking refresh status...",
      title: "Market data refresh started",
      tone: "success",
    },
  );

  assert.deepEqual(
    buildRefreshMessage(
      {
        eventAt: "2026-05-29T10:04:00.000Z",
        message: "Provider timeout",
        refresh: "error",
      },
      copy,
      now,
    ),
    {
      body: "Provider timeout",
      title: "Market data refresh failed",
      tone: "warning",
    },
  );
});

test("dashboard refresh helpers append only defined search params", () => {
  assert.equal(
    appendSearchParams("/portfolio/demo", {
      eventAt: "2026-05-29T10:04:00.000Z",
      refresh: "success",
      runId: undefined,
    }),
    "/portfolio/demo?eventAt=2026-05-29T10%3A04%3A00.000Z&refresh=success",
  );
  assert.equal(appendSearchParams("/portfolio/demo", {}), "/portfolio/demo");
});
