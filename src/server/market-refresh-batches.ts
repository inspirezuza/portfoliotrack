import "server-only";

import { waitUntil } from "@vercel/functions";
import { logServerError } from "@/lib/observability/server-log";

const LOCAL_WORKER_HEADER = "x-portfoliotrack-worker";
const LOCAL_WORKER_VALUE = "local";
const INTERNAL_WORKER_BATCH_LIMIT = 12;

function getCronSecret() {
  const secret = process.env.CRON_SECRET?.trim();

  return secret === "" ? undefined : secret;
}

function getWorkerHeaders(): Record<string, string> | null {
  const secret = getCronSecret();

  if (secret != null) {
    return {
      authorization: `Bearer ${secret}`,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      [LOCAL_WORKER_HEADER]: LOCAL_WORKER_VALUE,
    };
  }

  return null;
}

async function processMarketRefreshRunInternally(runId: number) {
  const { processMarketRefreshRunBatch } = await import("@/server/market-refresh");

  for (let batchIndex = 0; batchIndex < INTERNAL_WORKER_BATCH_LIMIT; batchIndex += 1) {
    const result = await processMarketRefreshRunBatch({ runId });

    if (result == null || !result.hasMore) {
      return;
    }
  }

  scheduleInternalMarketRefreshWorker(runId);
}

function scheduleInternalMarketRefreshWorker(runId: number) {
  waitUntil(
    processMarketRefreshRunInternally(runId).catch((error) => {
      logServerError(
        "market_refresh.worker.internal_failed",
        "Internal market refresh worker failed.",
        error,
        { runId },
      );
    }),
  );
}

export function isAuthorizedMarketRefreshWorkerRequest(request: Request) {
  const secret = getCronSecret();

  if (secret != null) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  return (
    process.env.NODE_ENV !== "production" &&
    request.headers.get(LOCAL_WORKER_HEADER) === LOCAL_WORKER_VALUE
  );
}

export function scheduleMarketRefreshWorker(request: Request, runId: number) {
  const headers = getWorkerHeaders();

  if (headers == null) {
    logServerError(
      "market_refresh.worker.missing_cron_secret",
      "Market refresh worker fetch could not be scheduled because CRON_SECRET is missing. Using internal worker fallback.",
      null,
      { runId },
    );
    scheduleInternalMarketRefreshWorker(runId);
    return;
  }

  const workerUrl = new URL("/api/market-data/refresh/work", request.url);

  waitUntil(
    fetch(workerUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: JSON.stringify({ runId }),
    })
      .then((response) => {
        if (!response.ok) {
          logServerError(
            "market_refresh.worker.request_failed",
            "Market refresh worker request failed. Using internal worker fallback.",
            null,
            {
              runId,
              status: response.status,
            },
          );
          scheduleInternalMarketRefreshWorker(runId);
        }
      })
      .catch((error) => {
        logServerError(
          "market_refresh.worker.schedule_failed",
          "Market refresh worker scheduling failed.",
          error,
          { runId },
        );
        scheduleInternalMarketRefreshWorker(runId);
      }),
  );
}
