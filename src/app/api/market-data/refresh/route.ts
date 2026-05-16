import { NextResponse } from "next/server";
import { refreshMarketDataCache } from "@/lib/market/provider";

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
        typeof value === "string" ? [[key, value] as const] : []
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

export async function POST(request: Request) {
  let formSearchParams: URLSearchParams | null = null;
  const expectsRedirect = isFormSubmissionRequest(request);

  try {
    if (expectsRedirect) {
      formSearchParams = await getFormSearchParams(request);
    }

    const result = await refreshMarketDataCache();

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
