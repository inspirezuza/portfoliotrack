import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getSelectedPortfolioId } from "@/lib/portfolio/selection";
import { runDailyAutoMarketRefresh, runManualMarketRefresh } from "@/server/market-refresh";

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

function buildRedirectUrl(request: Request, searchParams: URLSearchParams) {
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const requestUrl = new URL(request.url);
  const candidateUrl = new URL(redirectTo, requestUrl);
  const isSafeLocalPath =
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//") &&
    !redirectTo.startsWith("/\\") &&
    candidateUrl.origin === requestUrl.origin;

  return new URL(isSafeLocalPath ? `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}` : "/", requestUrl);
}

async function getFormSearchParams(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    return new URLSearchParams(body);
  }

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return new URLSearchParams(
      Array.from(formData.entries()).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value] as [string, string]] : []
      )
    );
  }

  return null;
}

function isFormSubmissionRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

async function getJsonRefreshMode(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const mode = payload.mode;

    return typeof mode === "string" ? mode : null;
  } catch {
    return "invalid-json";
  }
}

export async function POST(request: Request) {
  let formSearchParams: URLSearchParams | null = null;
  const expectsRedirect = isFormSubmissionRequest(request);

  try {
    const refreshMode = expectsRedirect ? null : await getJsonRefreshMode(request);

    if (refreshMode === "invalid-json") {
      return jsonErrorResponse("INVALID_JSON", "Refresh request JSON is invalid.", 400);
    }

    if (refreshMode === "daily-auto") {
      const portfolioId = await getSelectedPortfolioId();
      const result = await runDailyAutoMarketRefresh({ portfolioId });

      return NextResponse.json(result);
    }

    if (refreshMode != null) {
      return jsonErrorResponse("INVALID_REFRESH_MODE", "Refresh mode is not supported.", 400);
    }

    if (!(await isAdminAuthenticated())) {
      if (expectsRedirect) {
        return NextResponse.redirect(new URL("/login?next=/", request.url), { status: 303 });
      }

      return jsonErrorResponse("ADMIN_REQUIRED", "Admin login is required to refresh market data.", 401);
    }

    if (expectsRedirect) {
      formSearchParams = await getFormSearchParams(request);
    }

    const portfolioId = await getSelectedPortfolioId();
    const result = await runManualMarketRefresh({ portfolioId });

    if (formSearchParams != null && formSearchParams.has("redirectTo")) {
      const redirectUrl = buildRedirectUrl(request, formSearchParams);
      redirectUrl.searchParams.set("eventAt", new Date().toISOString());
      redirectUrl.searchParams.set("refresh", "success");
      redirectUrl.searchParams.set("quoteCount", result.quoteRefreshCount.toString());
      redirectUrl.searchParams.set("issueCount", result.issues.length.toString());

      if (result.latestSuccessfulAsOf != null) {
        redirectUrl.searchParams.set("refreshedAt", result.latestSuccessfulAsOf);
      }

      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unexpected market data refresh failure", error);

    if (expectsRedirect) {
      const redirectUrl = buildRedirectUrl(request, formSearchParams ?? new URLSearchParams());
      redirectUrl.searchParams.set("eventAt", new Date().toISOString());
      redirectUrl.searchParams.set("refresh", "error");
      redirectUrl.searchParams.set("message", "Market data refresh failed. Latest cached prices are still shown.");
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }

    return jsonErrorResponse("INTERNAL_ERROR", "Market data refresh failed.", 500);
  }
}
