import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getMarketRefreshRunStatus } from "@/server/market-refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonErrorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function parseRunId(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = Number(searchParams.get("runId"));

  return Number.isInteger(runId) && runId > 0 ? runId : null;
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to read refresh status.", 401);
  }

  const runId = parseRunId(request);

  if (runId == null) {
    return jsonErrorResponse("INVALID_RUN_ID", "Refresh run id is required.", 400);
  }

  const run = await getMarketRefreshRunStatus({ runId });

  if (run == null) {
    return jsonErrorResponse("RUN_NOT_FOUND", "Refresh run was not found.", 404);
  }

  return NextResponse.json({ run });
}
