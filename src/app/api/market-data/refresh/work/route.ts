import { NextResponse } from "next/server";
import {
  isAuthorizedMarketRefreshWorkerRequest,
  scheduleMarketRefreshWorker,
} from "@/server/market-refresh-batches";
import { processMarketRefreshRunBatch } from "@/server/market-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

function jsonErrorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

async function parseRunId(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const runId = Number(payload.runId);

    return Number.isInteger(runId) && runId > 0 ? runId : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedMarketRefreshWorkerRequest(request)) {
    return jsonErrorResponse("UNAUTHORIZED", "Market refresh worker authorization failed.", 401);
  }

  const runId = await parseRunId(request);

  if (runId == null) {
    return jsonErrorResponse("INVALID_RUN_ID", "Refresh run id is required.", 400);
  }

  const result = await processMarketRefreshRunBatch({ runId });

  if (result == null) {
    return jsonErrorResponse("RUN_NOT_FOUND", "Refresh run was not found.", 404);
  }

  if (result.hasMore) {
    scheduleMarketRefreshWorker(request, runId);
  }

  return NextResponse.json(result);
}
