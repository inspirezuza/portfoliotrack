import "server-only";

import { waitUntil } from "@vercel/functions";

const LOCAL_WORKER_HEADER = "x-portfoliotrack-worker";
const LOCAL_WORKER_VALUE = "local";

function getCronSecret() {
  const secret = process.env.CRON_SECRET?.trim();

  return secret === "" ? undefined : secret;
}

function getWorkerHeaders(): Record<string, string> | null {
  const secret = getCronSecret();

  if (secret != null) {
    return {
      authorization: `Bearer ${secret}`
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      [LOCAL_WORKER_HEADER]: LOCAL_WORKER_VALUE
    };
  }

  return null;
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
    console.error("Market refresh worker could not be scheduled because CRON_SECRET is missing.");
    return;
  }

  const workerUrl = new URL("/api/market-data/refresh/work", request.url);

  waitUntil(
    fetch(workerUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json"
      },
      body: JSON.stringify({ runId })
    }).catch((error) => {
      console.error("Market refresh worker scheduling failed", error);
    })
  );
}
