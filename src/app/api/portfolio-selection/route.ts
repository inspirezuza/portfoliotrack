import { NextResponse } from "next/server";
import { ALL_PORTFOLIOS_SELECTION_KEY } from "@/lib/portfolio/paths";
import { getAllPortfoliosSelection, PORTFOLIO_COOKIE_KEY } from "@/lib/portfolio/selection";
import { getPortfolioById, PortfolioServiceError, parsePortfolioId } from "@/server/portfolios";

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

function setPortfolioCookie(response: NextResponse, portfolioKey: string) {
  response.cookies.set(PORTFOLIO_COOKIE_KEY, portfolioKey, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

async function resolvePortfolioSelection(portfolioKey: unknown) {
  if (portfolioKey === ALL_PORTFOLIOS_SELECTION_KEY) {
    return {
      cookieKey: ALL_PORTFOLIOS_SELECTION_KEY,
      portfolio: getAllPortfoliosSelection(),
    };
  }

  const portfolioId = parsePortfolioId(portfolioKey);
  const portfolio = await getPortfolioById(portfolioId);

  if (portfolio == null) {
    throw new PortfolioServiceError(
      "PORTFOLIO_NOT_FOUND",
      `Portfolio ${portfolioId} does not exist.`,
    );
  }

  return {
    cookieKey: String(portfolio.id),
    portfolio,
  };
}

function getSafeNextUrl(request: Request, nextPath: string | null) {
  const requestUrl = new URL(request.url);

  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    return new URL(nextPath, requestUrl.origin);
  }

  return new URL("/", requestUrl.origin);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const selection = await resolvePortfolioSelection(searchParams.get("portfolioId"));
    const response = NextResponse.redirect(getSafeNextUrl(request, searchParams.get("next")), {
      status: 303,
    });

    setPortfolioCookie(response, selection.cookieKey);

    return response;
  } catch (error) {
    if (error instanceof PortfolioServiceError) {
      return jsonErrorResponse(
        error.code,
        error.message,
        error.code === "PORTFOLIO_NOT_FOUND" ? 404 : 400,
      );
    }

    console.error("Unexpected portfolio selection redirect failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Portfolio selection failed.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new PortfolioServiceError(
        "VALIDATION_ERROR",
        "Portfolio selection payload must be an object.",
      );
    }

    const selection = await resolvePortfolioSelection(
      (payload as Record<string, unknown>).portfolioId,
    );
    const response = NextResponse.json({ portfolio: selection.portfolio });
    setPortfolioCookie(response, selection.cookieKey);

    return response;
  } catch (error) {
    if (error instanceof PortfolioServiceError) {
      return jsonErrorResponse(
        error.code,
        error.message,
        error.code === "PORTFOLIO_NOT_FOUND" ? 404 : 400,
      );
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected portfolio selection failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Portfolio selection failed.", 500);
  }
}
