import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import {
  BenchmarkComparisonServiceError,
  ensureBenchmarkComparison
} from "@/server/benchmark-comparisons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getStatusCode(error: BenchmarkComparisonServiceError) {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return 400;
    case "INSTRUMENT_NOT_FOUND":
      return 404;
    case "MARKET_DATA_UNAVAILABLE":
      return 422;
    default:
      return 500;
  }
}

function jsonErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown> | null
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null
      }
    },
    { status }
  );
}

export async function POST(request: Request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return jsonErrorResponse(
        "ADMIN_REQUIRED",
        "Admin login is required to add benchmark comparisons.",
        401
      );
    }

    const payload = await request.json();
    const comparison = await ensureBenchmarkComparison(payload);

    return NextResponse.json({ comparison }, { status: 201 });
  } catch (error) {
    if (error instanceof BenchmarkComparisonServiceError) {
      return jsonErrorResponse(
        error.code,
        error.message,
        getStatusCode(error),
        error.details
      );
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected benchmark comparison API failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Benchmark comparison could not be added.", 500);
  }
}
